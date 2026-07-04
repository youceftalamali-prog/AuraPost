import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_DERIVATION = "sha256";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  const masterKey = process.env.ENCRYPTION_MASTER_KEY || "aurapost-dev-default-encryption-key-do-not-use-in-prod";
  if (!process.env.ENCRYPTION_MASTER_KEY) {
    console.warn("⚠️ WARNING: ENCRYPTION_MASTER_KEY environment variable is missing. Using development fallback key. DO NOT USE THIS IN PRODUCTION!");
  }
  cachedKey = crypto.createHash(KEY_DERIVATION).update(masterKey).digest();
  return cachedKey;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns an object with:
 *   - encrypted: base64-encoded ciphertext
 *   - iv: base64-encoded string containing IV + authentication tag (concatenated)
 */
export function encrypt(text: string): { encrypted: string; iv: string } {
  if (typeof text !== "string") {
    throw new TypeError("encrypt: input must be a string");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag]);
  const ivCombined = combined.toString("base64");

  return { encrypted, iv: ivCombined };
}

/**
 * Decrypts a ciphertext string using AES-256-GCM.
 * Expects the `iv` parameter to be a base64-encoded string containing
 * the IV (16 bytes) followed by the authentication tag (16 bytes).
 */
export function decrypt(encrypted: string, ivCombinedBase64: string): string {
  if (typeof encrypted !== "string" || typeof ivCombinedBase64 !== "string") {
    throw new TypeError("decrypt: encrypted and iv must be strings");
  }

  const combined = Buffer.from(ivCombinedBase64, "base64");
  if (combined.length !== IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error(`decrypt: invalid combined IV length (expected ${IV_LENGTH + AUTH_TAG_LENGTH}, got ${combined.length})`);
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
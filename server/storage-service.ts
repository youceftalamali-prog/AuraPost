import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const STORAGE_DIR = path.join(process.cwd(), "storage");
const IMAGES_DIR = path.join(STORAGE_DIR, "images");

/**
 * Initializes physical storage directories
 */
export function ensureStorageDirectoriesExist() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    console.log(`[Storage Service] Main directory created at: ${STORAGE_DIR}`);
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    console.log(`[Storage Service] Images subfolder created at: ${IMAGES_DIR}`);
  }
}

/**
 * Downloads a remote image and writes it locally to the persistent storage.
 * Returns the local URL reference, e.g. "/storage/images/img_abc123.jpg"
 */
export async function storeImageInStorage(imageUrl: string): Promise<string> {
  ensureStorageDirectoriesExist();

  // Guard against standard relative paths or already stored images
  if (imageUrl.startsWith("/storage/")) {
    return imageUrl;
  }

  // Generate distinct filename
  const uuid = uuidv4().substring(0, 8);
  
  // Extract extension safely, defaulting to .jpg
  let ext = ".jpg";
  try {
    const cleanUrl = imageUrl.split(/[?#]/)[0];
    const match = cleanUrl.match(/\.(png|jpe?g|gif|webp|svg)/i);
    if (match) {
      ext = `.${match[1].toLowerCase()}`;
    }
  } catch {
    // Keep standard .jpg on errors
  }

  const filename = `img_${uuid}${ext}`;
  const localFilePath = path.join(IMAGES_DIR, filename);
  const serveUrl = `/storage/images/${filename}`;

  try {
    console.log(`[Storage Service] Downloading image: ${imageUrl} -> ${localFilePath}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(imageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP fetch error! Status: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(localFilePath, Buffer.from(buffer));
    console.log(`[Storage Service] Stored image successfully: ${serveUrl}`);
    return serveUrl;
  } catch (err) {
    console.error(`[Storage Service] Download failed or timed out for image ${imageUrl}:`, err);
    // Fall back to original URL so that the image is still rendered
    return imageUrl;
  }
}

/**
 * Helper to process arrays of remote images sequentially
 */
export async function downloadImageGallery(imageUrls: string[]): Promise<string[]> {
  const localUrls: string[] = [];
  for (const url of imageUrls) {
    const result = await storeImageInStorage(url);
    localUrls.push(result);
  }
  return localUrls;
}

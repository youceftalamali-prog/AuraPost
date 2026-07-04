import { BaseExtractor } from "./base.ts";
import { NormalizedProduct } from "../../src/types.ts";
import { TEST_DATASET } from "./test-dataset.ts";

// ─── Cloud Run / Network Compatibility ───────────────────────────────────────
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1_500;
const BACKOFF_MULTIPLIER = 2.0;
const MAX_BACKOFF_MS = 20_000;
const RANDOM_JITTER_MIN = 500;
const RANDOM_JITTER_MAX = 3_000;

// ─── Original Helpers (PRESERVED) ────────────────────────────────────────────

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(input: string): string {
  return decodeHtmlEntities(input).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractById(html: string, id: string): string {
  const pattern = new RegExp(`id=["']${escapeRegex(id)}["'][^>]*>([\s\S]*?)<\/[^>]+>`, "i");
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function extractAttrFromElementWithId(html: string, id: string, attr: string): string {
  const pattern = new RegExp(`<[^>]+id=["']${escapeRegex(id)}["'][^>]*\s${escapeRegex(attr)}=["']([^"']+)["'][^>]*>`, "i");
  const match = html.match(pattern);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function detectCurrency(priceText: string): string {
  const value = priceText.trim();
  if (/\bUSD\b/i.test(value) || value.includes("$")) return "USD";
  if (/\bMYR\b/i.test(value) || value.includes("RM")) return "MYR";
  if (/\bEUR\b/i.test(value) || value.includes("€")) return "EUR";
  if (/\bGBP\b/i.test(value) || value.includes("£")) return "GBP";
  if (/\bJPY\b/i.test(value) || value.includes("¥")) return "JPY";
  return "USD";
}

function normalizePrice(priceText: string): number {
  const cleaned = priceText.replace(/,/g, "").match(/(\d+(?:\.\d{2})?)/);
  return cleaned ? parseFloat(cleaned[1]) : NaN;
}

function parseJsonSafe<T = any>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function unescapeAmazonJson(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/\\u0026/g, "&")
    .replace(/\\\\/g, "/")
    .replace(/\\"/g, '"');
}

function extractDynamicImages(dynamicImageAttr: string): string[] {
  if (!dynamicImageAttr) return [];

  const decoded = unescapeAmazonJson(dynamicImageAttr);
  const parsed = parseJsonSafe<Record<string, unknown>>(decoded);
  if (parsed && typeof parsed === "object") {
    return Object.keys(parsed).filter((key) => key.startsWith("http"));
  }

  const urls = Array.from(decoded.matchAll(/https?:\/\/[^"]+/g)).map((m) => m[0]);
  return [...new Set(urls)];
}

function extractMetaContent(html: string, attribute: "name" | "property", key: string): string {
  const pattern = new RegExp(`<meta\s+${attribute}=["']${escapeRegex(key)}["']\s+content=["']([^"']+)["']`, "i");
  const match = html.match(pattern);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function extractJsonLdBlocks(html: string): any[] {
  const blocks = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ).map((m) => m[1].trim()).filter(Boolean);

  const parsed: any[] = [];
  for (const block of blocks) {
    const json = parseJsonSafe<any>(block);
    if (!json) continue;
    if (Array.isArray(json)) {
      parsed.push(...json);
    } else if (Array.isArray(json["@graph"])) {
      parsed.push(...json["@graph"]);
    } else {
      parsed.push(json);
    }
  }

  return parsed;
}

function findProductJsonLd(html: string): any | null {
  const blocks = extractJsonLdBlocks(html);
  return blocks.find((entry) => {
    const type = entry?.["@type"];
    return type === "Product" || (Array.isArray(type) && type.includes("Product"));
  }) || null;
}

function extractHiResImages(html: string): string[] {
  const urls = Array.from(
    html.matchAll(/"hiRes"\s*[:=]\s*"([^"]+)"/gi)
  ).map((m) => unescapeAmazonJson(m[1]).trim());
  return [...new Set(urls.filter((url) => url.startsWith("http")))];
}

function collectAmazonMediaUrls(input: any, acc = new Set<string>()): Set<string> {
  if (!input) return acc;

  if (typeof input === "string") {
    const normalized = unescapeAmazonJson(input).trim();
    if (normalized.includes("m.media-amazon.com") && normalized.startsWith("http")) {
      acc.add(normalized);
    }
    return acc;
  }

  if (Array.isArray(input)) {
    input.forEach((item) => collectAmazonMediaUrls(item, acc));
    return acc;
  }

  if (typeof input === "object") {
    Object.values(input).forEach((value) => collectAmazonMediaUrls(value, acc));
  }

  return acc;
}

function extractEmbeddedProductImages(html: string): string[] {
  const urls = new Set<string>();

  const patterns = [
    /"imageGalleryData"\s*:\s*(\{[\s\S]{0,30000}?\})\s*,\s*"(?:centerCol|heroImage)/gi,
    /"colorImages"\s*:\s*(\{[\s\S]{0,30000}?\})\s*,\s*"(?:hero|twister|imageBlock)/gi,
    /"imageBlockVariations"\s*:\s*(\[[\s\S]{0,30000}?\])/gi,
    /"landingAsinColor"\s*:\s*(\{[\s\S]{0,30000}?\})\s*,\s*"initial"/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const parsed = parseJsonSafe<any>(unescapeAmazonJson(match[1]));
      if (parsed) {
        collectAmazonMediaUrls(parsed, urls);
      }
    }
  }

  for (const match of html.matchAll(/"(?:large|mainUrl|thumb|variant|hiRes)"\s*:\s*"([^"]+)"/gi)) {
    const url = unescapeAmazonJson(match[1]).trim();
    if (url.startsWith("http") && url.includes("m.media-amazon.com")) {
      urls.add(url);
    }
  }

  return [...urls];
}

function extractStructuredOfferPricing(html: string, productJsonLd: any | null): { amount: number; raw: string; currency: string } | null {
  const offers = productJsonLd?.offers;
  const offerCandidates = Array.isArray(offers) ? offers : offers ? [offers] : [];

  for (const offer of offerCandidates) {
    const raw = String(offer?.price ?? offer?.priceSpecification?.price ?? "").trim();
    const amount = normalizePrice(raw);
    if (raw && !isNaN(amount)) {
      const currency = String(offer?.priceCurrency || offer?.priceSpecification?.priceCurrency || detectCurrency(raw)).trim();
      return { amount, raw, currency: currency || detectCurrency(raw) };
    }
  }

  const jsonPricePatterns = [
    /"priceAmount"\s*:\s*"?(?<amount>\d+(?:\.\d{2})?)"?[\s\S]{0,120}?"priceCurrency"\s*:\s*"(?<currency>[A-Z]{3})"/i,
    /"priceToPay"[\s\S]{0,500}?"a-offscreen"\s*:\s*"(?<display>[^"]+)"/i,
    /"displayPrice"\s*:\s*"(?<display>[^"]+)"/i,
  ];

  for (const pattern of jsonPricePatterns) {
    const match = html.match(pattern);
    const groups = match?.groups;
    if (!groups) continue;

    if (groups.amount) {
      const amount = normalizePrice(groups.amount);
      if (!isNaN(amount)) {
        return {
          amount,
          raw: groups.amount,
          currency: groups.currency || detectCurrency(groups.amount),
        };
      }
    }

    if (groups.display) {
      const raw = unescapeAmazonJson(groups.display);
      const amount = normalizePrice(raw);
      if (!isNaN(amount)) {
        return { amount, raw, currency: detectCurrency(raw) };
      }
    }
  }

  return null;
}

function extractAmazonPrice(html: string): { amount: number; raw: string; currency: string } | null {
  const idPriceSelectors = ["priceblock_ourprice", "priceblock_dealprice", "priceblock_saleprice"];
  for (const selector of idPriceSelectors) {
    const raw = extractById(html, selector);
    const amount = normalizePrice(raw);
    if (raw && !isNaN(amount)) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  const aOffscreenMatch = html.match(
    /<span[^>]+class=["'][^"']*a-price[^"']*["'][^>]*>[\s\S]*?<span[^>]+class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]+)<\/span>/i
  ) || html.match(/<span[^>]+class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]+)<\/span>/i);

  const raw = aOffscreenMatch ? stripTags(aOffscreenMatch[1]) : "";
  const amount = normalizePrice(raw);
  if (raw && !isNaN(amount)) {
    return { amount, raw, currency: detectCurrency(raw) };
  }

  return null;
}

function extractAmazonVendor(html: string, url: string): string {
  const bylineText = extractById(html, "bylineInfo");
  if (bylineText) {
    return bylineText.replace(/^visit the\s+/i, "").replace(/^brand:\s*/i, "").trim();
  }

  const brandMatch = html.match(/["']brand["']\s*:\s*["']([^"']+)["']/i);
  if (brandMatch?.[1]) {
    return stripTags(brandMatch[1]);
  }

  return new URL(url).hostname.replace(/^www\./, "");
}

function extractAmazonDescription(html: string, productJsonLd: any | null): string {
  const jsonLdDescription = stripTags(String(productJsonLd?.description || ""));
  if (jsonLdDescription && jsonLdDescription.length >= 10) {
    return jsonLdDescription;
  }

  const metaDescription =
    extractMetaContent(html, "name", "description") ||
    extractMetaContent(html, "property", "og:description");
  if (metaDescription && metaDescription.length >= 10) {
    return metaDescription;
  }

  const bulletMatches = Array.from(
    html.matchAll(/<span[^>]+class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)
  )
    .map((m) => stripTags(m[1]))
    .filter((text) => text.length > 20)
    .slice(0, 4);

  return bulletMatches.join(" ");
}

function extractAmazonTitle(html: string, productJsonLd: any | null): string {
  const jsonLdTitle = stripTags(String(productJsonLd?.name || ""));
  if (jsonLdTitle && jsonLdTitle.length >= 3) {
    return jsonLdTitle;
  }

  return extractById(html, "productTitle")
    || stripTags((html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || "").replace(/\s+-\s+Amazon\.com$/i, "").trim();
}

function extractAmazonImages(html: string, productJsonLd: any | null): string[] {
  const dynamicImageAttr = extractAttrFromElementWithId(html, "landingImage", "data-a-dynamic-image");
  const dynamicImages = extractDynamicImages(dynamicImageAttr);
  const hiResImages = extractHiResImages(html);
  const embeddedImages = extractEmbeddedProductImages(html);
  const landingImageSrc = extractAttrFromElementWithId(html, "landingImage", "src");
  const wrapperImgSrc = (html.match(/<div[^>]+id=["']imgTagWrapperId["'][\s\S]{0,2000}?<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
  const jsonLdImages = Array.isArray(productJsonLd?.image)
    ? productJsonLd.image.map((img: unknown) => String(img))
    : productJsonLd?.image ? [String(productJsonLd.image)] : [];

  return [...new Set(
    [...hiResImages, ...dynamicImages, landingImageSrc, wrapperImgSrc, ...embeddedImages, ...jsonLdImages]
      .map((img) => unescapeAmazonJson(img).trim())
      .filter((img) => img.startsWith("http"))
  )];
}

function detectAntiBot(html: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/robot check/i, "Amazon anti-bot page detected (Robot Check)."],
    [/enter the characters you see below/i, "Amazon captcha page detected."],
    [/type the characters you see in this image/i, "Amazon captcha image challenge detected."],
    [/click the button below to continue shopping/i, "Amazon interstitial page detected instead of a product page."],
  ];

  for (const [pattern, message] of checks) {
    if (pattern.test(html)) {
      return message;
    }
  }

  return null;
}

// ─── NEW: Cloud Run / Anti-Bot Infrastructure ────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BrowserProfile {
  userAgent: string;
  accept: string;
  acceptLang: string;
  secChUa: string;
  secChUaMobile: string;
  secChUaPlatform: string;
}

const BROWSER_PROFILES: BrowserProfile[] = [
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    acceptLang: "en-US,en;q=0.9",
    secChUa: '"Not-A.Brand";v="99", "Chromium";v="124"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    acceptLang: "en-US,en;q=0.9",
    secChUa: '"Not-A.Brand";v="99", "Chromium";v="125", "Microsoft Edge";v="125"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    acceptLang: "en-US,en;q=0.5",
    secChUa: '"Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    acceptLang: "en-US,en;q=0.9",
    secChUa: '"Not-A.Brand";v="99", "Chromium";v="124"',
    secChUaMobile: "?0",
    secChUaPlatform: '"macOS"',
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    acceptLang: "en-US,en;q=0.9",
    secChUa: '"Apple WebKit";v="605.1.15"',
    secChUaMobile: "?0",
    secChUaPlatform: '"macOS"',
  },
  {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    acceptLang: "en-US,en;q=0.9",
    secChUa: '"Not-A.Brand";v="99", "Chromium";v="124"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Linux"',
  },
  {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    acceptLang: "en-US,en;q=0.5",
    secChUa: '"Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Linux"',
  },
  {
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    acceptLang: "en-US,en;q=0.9",
    secChUa: '"Not-A.Brand";v="99", "Chromium";v="124"',
    secChUaMobile: "?1",
    secChUaPlatform: '"Android"',
  },
];

/**
 * Build randomized headers from a rotating browser profile.
 */
function buildRandomHeaders(referer?: string): Record<string, string> {
  const profile = BROWSER_PROFILES[randomInt(0, BROWSER_PROFILES.length - 1)];
  return {
    "User-Agent": profile.userAgent,
    "Accept": profile.accept,
    "Accept-Language": profile.acceptLang,
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": referer || "https://www.google.com/",
    "Sec-Ch-Ua": profile.secChUa,
    "Sec-Ch-Ua-Mobile": profile.secChUaMobile,
    "Sec-Ch-Ua-Platform": profile.secChUaPlatform,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": referer ? "cross-site" : "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Connection": "keep-alive",
    "DNT": "1",
  };
}

// ─── Cookie Jar ──────────────────────────────────────────────────────────────

class CookieJar {
  private cookies = new Map<string, string>();

  setFromResponse(response: Response) {
    const setCookies = response.headers.getSetCookie?.() || [];
    for (const rawCookie of setCookies) {
      const [pair] = rawCookie.split(";");
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex > 0) {
        this.cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
      }
    }
  }

  buildHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  getJar(): Map<string, string> {
    return this.cookies;
  }
}

// ─── Retry + Timeout Helper ──────────────────────────────────────────────────

async function fetchWithRetry(url: string, headers: Record<string, string>, cookies: CookieJar, attempt = 1): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const cookieHeader = cookies.buildHeader();
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });

    cookies.setFromResponse(response);

    // Retry on specific HTTP status codes
    if ((response.status === 403 || response.status === 404 || response.status === 429 || response.status === 503) && attempt <= MAX_RETRIES) {
      const delay = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1),
        MAX_BACKOFF_MS
      ) + randomInt(RANDOM_JITTER_MIN, RANDOM_JITTER_MAX);
      console.warn(
        `[AmazonExtractor] HTTP ${response.status} (attempt ${attempt}/${MAX_RETRIES + 1}). ` +
        `Retrying in ${delay}ms...`
      );
      await sleep(delay);
      return fetchWithRetry(url, buildRandomHeaders(), cookies, attempt + 1);
    }

    return response;
  } catch (error: any) {
    const isTimeout = error.name === "AbortError" || error.message?.includes("aborted");
    const isNetwork = error.message?.includes("fetch failed")
      || error.message?.includes("ECONNREFUSED")
      || error.message?.includes("ETIMEDOUT")
      || error.message?.includes("ENOTFOUND")
      || error.message?.includes("ECONNRESET")
      || error.message?.includes("socket hang up");

    const shouldRetry = (isTimeout || isNetwork) && attempt <= MAX_RETRIES;

    if (shouldRetry) {
      const delay = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1),
        MAX_BACKOFF_MS
      ) + randomInt(RANDOM_JITTER_MIN, RANDOM_JITTER_MAX);
      console.warn(
        `[AmazonExtractor] Network error (attempt ${attempt}/${MAX_RETRIES + 1}): ${error.message}. ` +
        `Retrying in ${delay}ms...`
      );
      await sleep(delay);
      return fetchWithRetry(url, buildRandomHeaders(), cookies, attempt + 1);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── NEW: Enhanced Anti-Bot Detection ────────────────────────────────────────

function detectAmazonAntiBot(html: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/robot check/i, "Amazon anti-bot page detected (Robot Check)."],
    [/enter the characters you see below/i, "Amazon captcha page detected."],
    [/type the characters you see in this image/i, "Amazon captcha image challenge detected."],
    [/click the button below to continue shopping/i, "Amazon interstitial page detected instead of a product page."],
    [/captcha/i, "Amazon CAPTCHA verification detected."],
    [/automated access/i, "Amazon automated access detection."],
    [/to discuss automated access/i, "Amazon bot detection page."],
    [/503 service unavailable/i, "Amazon 503 Service Unavailable."],
    [/sorry/i, "Amazon sorry page detected."],
    [/bot detection/i, "Amazon bot detection triggered."],
    [/challenge platform/i, "Cloudflare challenge page detected."],
    [/cf-browser-verification/i, "Cloudflare browser verification detected."],
    [/just a moment/i, "Cloudflare \"Just a Moment\" interstitial detected."],
  ];

  for (const [pattern, message] of checks) {
    if (pattern.test(html)) {
      return message;
    }
  }

  return null;
}

// ─── NEW: ASIN Extraction ────────────────────────────────────────────────────

function extractAsin(url: string): string {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
    /\/o\/ASIN\/([A-Z0-9]{10})/i,
    /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})/i,
    /\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function buildAmazonUrls(asin: string): string[] {
  if (!asin) return [];
  return [
    `https://www.amazon.com/dp/${asin}`,
    `https://www.amazon.com/gp/product/${asin}`,
    `https://www.amazon.com/dp/${asin}?psc=1`,
    `https://www.amazon.com/gp/aw/d/${asin}`,
  ];
}

// ─── NEW: Embedded Amazon JSON Extraction ────────────────────────────────────

function extractAmazonEmbeddedJson(html: string): any | null {
  // Strategy 1: P.register("twister-js-init-dpx-data")
  const twisterMatch = html.match(/P\.register\("twister-js-init-dpx-data"\s*,\s*"[^"]+"\s*,\s*function\(\)\s*{\s*return\s+({[\s\S]*?});\s*}\)/i);
  if (twisterMatch?.[1]) {
    try {
      const data = parseJsonSafe<any>(twisterMatch[1]);
      if (data) {
        console.log(`[AmazonExtractor] Found twister-js-init-dpx-data JSON`);
        return data;
      }
    } catch {
      // Continue
    }
  }

  // Strategy 2: colorImages
  const colorImagesMatch = html.match(/'colorImages':\s*({[\s\S]*?'initial':\s*\[[\s\S]*?\]})/i) ||
                           html.match(/"colorImages":\s*({[\s\S]*?"initial":\s*\[[\s\S]*?\]})/i);
  if (colorImagesMatch?.[1]) {
    try {
      const data = parseJsonSafe<any>(colorImagesMatch[1].replace(/'/g, '"'));
      if (data) {
        console.log(`[AmazonExtractor] Found colorImages JSON`);
        return { colorImages: data };
      }
    } catch {
      // Continue
    }
  }

  // Strategy 3: dimensionValuesDisplayData
  const dimMatch = html.match(/'dimensionValuesDisplayData':\s*({[\s\S]*?})/i) ||
                   html.match(/"dimensionValuesDisplayData":\s*({[\s\S]*?})/i);
  if (dimMatch?.[1]) {
    try {
      const data = parseJsonSafe<any>(dimMatch[1].replace(/'/g, '"'));
      if (data) {
        console.log(`[AmazonExtractor] Found dimensionValuesDisplayData JSON`);
        return { dimensionValuesDisplayData: data };
      }
    } catch {
      // Continue
    }
  }

  // Strategy 4: window.__INITIAL_STATE__
  const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i);
  if (initialStateMatch?.[1]) {
    try {
      const data = parseJsonSafe<any>(initialStateMatch[1]);
      if (data) {
        console.log(`[AmazonExtractor] Found window.__INITIAL_STATE__ JSON`);
        return data;
      }
    } catch {
      // Continue
    }
  }

  // Strategy 5: window.P
  const pMatch = html.match(/window\.P\s*=\s*({[\s\S]*?});/i);
  if (pMatch?.[1]) {
    try {
      const data = parseJsonSafe<any>(pMatch[1]);
      if (data) {
        console.log(`[AmazonExtractor] Found window.P JSON`);
        return data;
      }
    } catch {
      // Continue
    }
  }

  // Strategy 6: imageBlockVariations
  const imgBlockMatch = html.match(/'imageBlockVariations':\s*({[\s\S]*?})/i) ||
                        html.match(/"imageBlockVariations":\s*({[\s\S]*?})/i);
  if (imgBlockMatch?.[1]) {
    try {
      const data = parseJsonSafe<any>(imgBlockMatch[1].replace(/'/g, '"'));
      if (data) {
        console.log(`[AmazonExtractor] Found imageBlockVariations JSON`);
        return { imageBlockVariations: data };
      }
    } catch {
      // Continue
    }
  }

  return null;
}

// ─── NEW: Enhanced Image Extraction ───────────────────────────────────────────

function extractAmazonImagesEnhanced(html: string, productJsonLd: any | null, embeddedJson: any | null): string[] {
  const allUrls = new Set<string>();

  // Strategy 1: Original extractAmazonImages
  const originalImages = extractAmazonImages(html, productJsonLd);
  originalImages.forEach((url) => allUrls.add(url));
  console.log(`[AmazonExtractor] Strategy 1 (original extractAmazonImages) found ${originalImages.length} images`);

  // Strategy 2: colorImages from embedded JSON
  if (embeddedJson?.colorImages?.initial) {
    const colorImgUrls = extractImagesFromObject(embeddedJson.colorImages.initial);
    colorImgUrls.forEach((url) => {
      if (url.startsWith("http")) allUrls.add(url);
    });
    console.log(`[AmazonExtractor] Strategy 2 (colorImages.initial) found ${colorImgUrls.length} images`);
  }

  // Strategy 3: imageBlockVariations
  if (embeddedJson?.imageBlockVariations) {
    const imgBlockUrls = extractImagesFromObject(embeddedJson.imageBlockVariations);
    imgBlockUrls.forEach((url) => {
      if (url.startsWith("http")) allUrls.add(url);
    });
    console.log(`[AmazonExtractor] Strategy 3 (imageBlockVariations) found ${imgBlockUrls.length} images`);
  }

  // Strategy 4: og:image
  const ogImage = extractMetaContent(html, "property", "og:image");
  if (ogImage && ogImage.startsWith("http")) {
    allUrls.add(ogImage);
    console.log(`[AmazonExtractor] Strategy 4 (og:image) found 1 image`);
  }

  // Strategy 5: twitter:image
  const twImage = extractMetaContent(html, "name", "twitter:image");
  if (twImage && twImage.startsWith("http")) {
    allUrls.add(twImage);
    console.log(`[AmazonExtractor] Strategy 5 (twitter:image) found 1 image`);
  }

  // Strategy 6: a-dynamic-image data
  const dynamicImgMatches = Array.from(
    html.matchAll(/data-a-dynamic-image=["']({[^"']+})["']/gi)
  );
  let dynamicCount = 0;
  dynamicImgMatches.forEach((m) => {
    try {
      const parsed = parseJsonSafe<Record<string, unknown>>(m[1]);
      if (parsed) {
        Object.keys(parsed).forEach((key) => {
          if (key.startsWith("http")) {
            allUrls.add(key);
            dynamicCount++;
          }
        });
      }
    } catch {
      // Ignore
    }
  });
  console.log(`[AmazonExtractor] Strategy 6 (a-dynamic-image) found ${dynamicCount} images`);

  // Strategy 7: All m.media-amazon.com images in HTML
  const mediaMatches = Array.from(
    html.matchAll(/https?:\/\/[^"'\s)]+m\.media-amazon\.com[^"'\s)]+/gi)
  );
  let mediaCount = 0;
  mediaMatches.forEach((m) => {
    const url = m[0].trim();
    if (url.startsWith("http")) {
      allUrls.add(url);
      mediaCount++;
    }
  });
  console.log(`[AmazonExtractor] Strategy 7 (m.media-amazon.com regex) found ${mediaCount} images`);

  // Strategy 8: All images-na.ssl-images-amazon.com
  const sslMatches = Array.from(
    html.matchAll(/https?:\/\/[^"'\s)]+images-na\.ssl-images-amazon\.com[^"'\s)]+/gi)
  );
  let sslCount = 0;
  sslMatches.forEach((m) => {
    const url = m[0].trim();
    if (url.startsWith("http")) {
      allUrls.add(url);
      sslCount++;
    }
  });
  console.log(`[AmazonExtractor] Strategy 8 (ssl-images-amazon.com) found ${sslCount} images`);

  const result = [...allUrls];
  console.log(`[AmazonExtractor] Total unique images extracted: ${result.length}`);
  return result;
}

/**
 * Recursively extract image URLs from any nested object.
 */
function extractImagesFromObject(obj: any): string[] {
  const urls: string[] = [];
  if (!obj) return urls;

  if (typeof obj === "string") {
    if (obj.startsWith("http") && obj.includes("amazon")) urls.push(obj);
    return urls;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item) => urls.push(...extractImagesFromObject(item)));
    return urls;
  }

  if (typeof obj === "object") {
    const imageKeys = [
      "image", "images", "imageUrl", "imageUrls", "imgUrl", "imgUrls",
      "mainImage", "hiRes", "large", "thumb", "variant", "mainUrl",
      "url", "src", "landingImage", "data",
    ];
    for (const key of imageKeys) {
      if (obj[key] !== undefined) {
        urls.push(...extractImagesFromObject(obj[key]));
      }
    }
    Object.values(obj).forEach((value) => {
      urls.push(...extractImagesFromObject(value));
    });
  }

  return urls;
}

// ─── NEW: Enhanced Price Extraction ───────────────────────────────────────────

function extractAmazonPriceEnhanced(html: string, productJsonLd: any | null, embeddedJson: any | null): { amount: number; raw: string; currency: string } | null {
  // Strategy 1: Original extractAmazonPrice
  const originalPrice = extractAmazonPrice(html);
  if (originalPrice) {
    console.log(`[AmazonExtractor] Price found via original extractAmazonPrice: ${originalPrice.amount}`);
    return originalPrice;
  }

  // Strategy 2: JSON-LD offers
  const jsonLdPrice = extractStructuredOfferPricing(html, productJsonLd);
  if (jsonLdPrice) {
    console.log(`[AmazonExtractor] Price found via JSON-LD: ${jsonLdPrice.amount}`);
    return jsonLdPrice;
  }

  // Strategy 3: priceToPay
  const priceToPayMatch = html.match(/"priceToPay"\s*:\s*"([^"]+)"/i);
  if (priceToPayMatch?.[1]) {
    const raw = unescapeAmazonJson(priceToPayMatch[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      console.log(`[AmazonExtractor] Price found via priceToPay: ${amount}`);
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 4: corePriceDisplay
  const corePriceMatch = html.match(/"corePriceDisplay"\s*:\s*"([^"]+)"/i);
  if (corePriceMatch?.[1]) {
    const raw = unescapeAmazonJson(corePriceMatch[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      console.log(`[AmazonExtractor] Price found via corePriceDisplay: ${amount}`);
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 5: apex_desktop
  const apexMatch = html.match(/id=["']apex_desktop["'][\s\S]{0,5000}?>([\s\S]*?)<\/div>/i);
  if (apexMatch) {
    const raw = stripTags(apexMatch[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      console.log(`[AmazonExtractor] Price found via apex_desktop: ${amount}`);
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 6: a-price-whole + a-price-fraction
  const wholeMatch = html.match(/<span[^>]+class=["'][^"']*a-price-whole[^"']*["'][^>]*>([^<]+)<\/span>/i);
  const fractionMatch = html.match(/<span[^>]+class=["'][^"']*a-price-fraction[^"']*["'][^>]*>([^<]+)<\/span>/i);
  if (wholeMatch) {
    const whole = stripTags(wholeMatch[1]).replace(/[^\d]/g, "");
    const fraction = fractionMatch ? stripTags(fractionMatch[1]).replace(/[^\d]/g, "") : "00";
    const raw = `${whole}.${fraction}`;
    const amount = parseFloat(raw);
    if (!isNaN(amount) && amount > 0) {
      console.log(`[AmazonExtractor] Price found via a-price-whole/fraction: ${amount}`);
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 7: Hidden JSON price objects
  const hiddenPriceMatch = html.match(/"price"\s*:\s*"?(\d+\.\d{2})"?/i);
  if (hiddenPriceMatch?.[1]) {
    const raw = hiddenPriceMatch[1];
    const amount = parseFloat(raw);
    if (!isNaN(amount) && amount > 0) {
      console.log(`[AmazonExtractor] Price found via hidden JSON: ${amount}`);
      return { amount, raw, currency: "USD" };
    }
  }

  console.log(`[AmazonExtractor] All price strategies failed`);
  return null;
}

// ─── Extractor Class ─────────────────────────────────────────────────────────

export class AmazonExtractor extends BaseExtractor {
  providerName = "Amazon";
  private cookieJar = new CookieJar();
  private homepageBootstrapped = false;

  public async extract(url: string, rawHtml?: string, customPrompt?: string): Promise<NormalizedProduct> {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const isForcedFallback = url.toLowerCase().includes("force_fallback=true");

    if (isForcedFallback) {
      if (!this.isTestMode()) {
        throw new Error(`Synthetic fallback is disabled for ${this.providerName} imports. Unable to import ${url}.`);
      }
      return this.parseUrlFallback(url, this.providerName);
    }

    // 1. Check high-fidelity offline products database cache mapping
    const matched = this.isTestMode() ? TEST_DATASET[this.providerName]?.find(
      x => x.url.toLowerCase().split("?")[0].split("#")[0] === cleanUrl.toLowerCase()
    ) : undefined;

    if (matched) {
      if (matched.success && matched.product) {
        console.log(`[AmazonExtractor] Deep-crawl offline database hit for: ${matched.product.title}`);
        return matched.product;
      }
      throw new Error(matched.error?.errorMessage || "Simulated extraction failure for test URL.");
    }

    // 2. Bootstrap: fetch Amazon homepage to get cookies
    if (!this.homepageBootstrapped) {
      try {
        console.log(`[AmazonExtractor] Bootstrapping Amazon homepage cookies...`);
        const homeHeaders = buildRandomHeaders("https://www.google.com/");
        const homeRes = await fetchWithRetry("https://www.amazon.com/", homeHeaders, this.cookieJar);
        if (homeRes.ok) {
          console.log(`[AmazonExtractor] Homepage bootstrap successful, cookies stored: ${this.cookieJar.getJar().size}`);
          this.homepageBootstrapped = true;
          await sleep(randomInt(1_000, 3_000));
        }
      } catch (err: any) {
        console.warn(`[AmazonExtractor] Homepage bootstrap failed (non-fatal): ${err.message}`);
      }
    }

    // 3. Fetch and parse live HTML with anti-bot bypass
    let html = rawHtml?.trim() || "";
    const asin = extractAsin(cleanUrl);

    if (!html) {
      try {
        console.log(`[AmazonExtractor] Fetching product page: ${cleanUrl}`);
        html = await this.fetchAmazonPage(cleanUrl);
      } catch (err: any) {
        console.warn(`[AmazonExtractor] Primary fetch failed: ${err.message}`);

        // Retry with alternate URL formats
        if (asin) {
          const altUrls = buildAmazonUrls(asin);
          for (const altUrl of altUrls) {
            if (altUrl === cleanUrl) continue;
            console.log(`[AmazonExtractor] Retrying with alternate URL: ${altUrl}`);
            try {
              html = await this.fetchAmazonPage(altUrl);
              if (html) break;
            } catch (altErr: any) {
              console.warn(`[AmazonExtractor] Alternate URL failed: ${altErr.message}`);
            }
          }
        }
      }
    }

    if (!html) {
      throw new Error(`Amazon extraction failed: could not fetch product page for ${url}.`);
    }

    const antiBotError = detectAmazonAntiBot(html);
    if (antiBotError) {
      throw new Error(antiBotError);
    }

    // 4. Extract JSON-LD first
    const productJsonLd = findProductJsonLd(html);

    // 5. Extract embedded Amazon JSON data
    const embeddedJson = extractAmazonEmbeddedJson(html);

    // 6. Extract all product fields
    const title = extractAmazonTitle(html, productJsonLd);
    if (!title || title.length < 3) {
      throw new Error("Amazon extraction failed: missing product title on the live product page.");
    }

    // Enhanced image extraction with fallbacks
    const gallery = extractAmazonImagesEnhanced(html, productJsonLd, embeddedJson);
    if (gallery.length === 0) {
      throw new Error("Amazon extraction failed: failed to find a valid product image URL on the live store page.");
    }

    // Enhanced price extraction with fallbacks
    const priceData = extractAmazonPriceEnhanced(html, productJsonLd, embeddedJson);
    if (!priceData) {
      throw new Error("Amazon extraction failed: failed to find a valid price on the live store page.");
    }

    const description = extractAmazonDescription(html, productJsonLd);
    if (!description || description.length < 10) {
      throw new Error("Amazon extraction failed: failed to find a valid product description on the live store page.");
    }

    const vendor = extractAmazonVendor(html, url);
    const product: NormalizedProduct = {
      title,
      description,
      images: gallery[0],
      gallery,
      variants: [
        {
          id: "amazon-primary-offer",
          title,
          price: priceData.amount.toFixed(2),
        }
      ],
      specifications: {
        Platform: "Amazon",
        Authenticity: "Sourced Real-Time",
        "Source Domain": new URL(url).hostname.replace(/^www\./, ""),
      },
      vendor,
      price: priceData.amount,
      currency: priceData.currency,
      availability: true,
    };

    console.log(
      `[AmazonExtractor] Successfully parsed Amazon product: ${product.title} | ` +
      `Images: ${gallery.length} | Price: ${priceData.amount} ${priceData.currency} | ` +
      `Cookies: ${this.cookieJar.getJar().size}`
    );
    return product;
  }

  /**
   * Fetch Amazon page with rotating headers, cookies, and anti-bot bypass.
   * REPLACES the original fetchAmazonHtml with enhanced version.
   */
  private async fetchAmazonPage(url: string): Promise<string> {
    let lastHtml = "";
    let lastStatus = 0;

    for (let i = 0; i < 3; i++) {
      try {
        const headers = buildRandomHeaders();
        console.log(`[AmazonExtractor] Fetch attempt ${i + 1} with UA: ${headers["User-Agent"].slice(0, 60)}...`);

        const res = await fetchWithRetry(url, headers, this.cookieJar);
        lastStatus = res.status;

        if (!res.ok) {
          console.warn(`[AmazonExtractor] HTTP ${res.status} from Amazon`);
          if (res.status === 403 || res.status === 503) {
            const delay = randomInt(2_000, 5_000);
            console.log(`[AmazonExtractor] ${res.status} detected, waiting ${delay}ms before retry...`);
            await sleep(delay);
            continue;
          }
          continue;
        }

        const html = await res.text();
        lastHtml = html;

        const antiBotError = detectAmazonAntiBot(html);
        if (antiBotError) {
          console.warn(`[AmazonExtractor] Anti-bot detected: ${antiBotError}`);
          const delay = randomInt(2_000, 5_000);
          await sleep(delay);
          continue;
        }

        return html;
      } catch (error: any) {
        console.warn(`[AmazonExtractor] Fetch attempt ${i + 1} failed: ${error.message}`);
        const delay = randomInt(1_500, 4_000);
        await sleep(delay);
      }
    }

    if (lastHtml) {
      return lastHtml;
    }

    throw new Error(`Amazon extraction failed: received HTTP ${lastStatus || "unknown"} from the live store page.`);
  }

  /**
   * PRESERVED: Original fetchAmazonHtml for backward compatibility.
   * This method is kept but the extract() method now uses fetchAmazonPage.
   */
  private async fetchAmazonHtml(url: string): Promise<string> {
    const headerProfiles = [
      {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
      },
      {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      }
    ];

    let lastHtml = "";
    let lastStatus = 0;

    for (const headers of headerProfiles) {
      const res = await fetch(url, { headers, redirect: "follow" });
      lastStatus = res.status;
      if (!res.ok) {
        continue;
      }

      const html = await res.text();
      lastHtml = html;

      if (!detectAntiBot(html)) {
        return html;
      }
    }

    if (lastHtml) {
      return lastHtml;
    }

    throw new Error(`Amazon extraction failed: received HTTP ${lastStatus || "unknown"} from the live store page.`);
  }
}

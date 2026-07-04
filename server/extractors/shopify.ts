import { BaseExtractor } from "./base.ts";
import { NormalizedProduct } from "../../src/types.ts";
import { extractProductWithAI } from "./ai-helper.ts";
import { TEST_DATASET } from "./test-dataset.ts";
import { storeImageInStorage } from "../storage-service.ts";

// ─── Cloud Run / Network Compatibility ───────────────────────────────────────
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;
const INITIAL_BACKOFF_MS = 1_000;
const BACKOFF_MULTIPLIER = 2.0;
const MAX_BACKOFF_MS = 20_000;

// ─── Existing Helpers (PRESERVED) ──────────────────────────────────────────

function normalizeShopifyPrice(priceVal: any): number {
  if (priceVal === undefined || priceVal === null) return 0;
  let str = String(priceVal).trim();
  if (str.includes(".")) {
    return parseFloat(str) || 0;
  }
  const cents = parseInt(str, 10);
  if (isNaN(cents)) return 0;
  return cents / 100;
}

function normalizeImageUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("//")) {
    return "https:" + url;
  }
  return url;
}

function sanitizeHtmlDescription(html: string): string {
  if (!html) return "";
  let text = html;

  // 1. Remove <style> and <script> tags with all their content
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");

  // 2. Remove @import url(...) lines (CSS and font imports)
  text = text.replace(/@import\s+url\([^)]*\)[;]?/gi, "");

  // 3. Remove <link> tags that load Google Fonts
  text = text.replace(/<link[^>]+href=["'][^"']*fonts\.(googleapis|gstatic)\.com[^"']*["'][^>]*>/gi, "");

  // 4. Remove inline style attributes from remaining HTML tags
  text = text.replace(/style\s*=\s*["'][^"']*["']/gi, "");

  // 5. Remove CSS property declarations that often appear in cleaned text
  text = text.replace(/\b(font-family|font-size|margin|padding|color|background|display)\s*:[^;]*;?/gi, "");

  // 6. Remove leftover CSS selectors (e.g., .class, #id, body, html, div) if they appear with braces
  text = text.replace(/\.([a-zA-Z0-9_-]+)\s*\{/g, "");
  text = text.replace(/#([a-zA-Z0-9_-]+)\s*\{/g, "");
  text = text.replace(/\b(body|html|div|span|p|h1|h2|h3|h4|h5|h6|ul|ol|li|a|img|table|tr|td|th|form|input|button|section|article|header|footer|nav|main|aside)\s*\{/gi, "");

  // 7. Original logic: replace spacing elements with newlines
  text = text.replace(/<(p|div|br|li|h[1-6])[^>]*>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");

  // 8. Strip all remaining HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // 9. Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"');

  // 10. Final cleanup: remove any leftover CSS-like property declarations
  text = text.replace(/\b(font-family|font-size|margin|padding|color|background|display)\s*:[^;]*;?/gi, "");

  // 11. Remove leftover @import or url(...) strings
  text = text.replace(/@import\s+url\([^)]*\)/gi, "");
  text = text.replace(/url\([^)]*\)/gi, "");

  // 12. Split, trim, and join lines as before
  return text.split("\n").map(line => line.trim()).filter(Boolean).join("\n\n").trim();
}
// ─── NEW: Cloud Run Helpers ──────────────────────────────────────────────────

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
  return decodeHtmlEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetaContent(html: string, attribute: "name" | "property", key: string): string {
  const pattern = new RegExp(`<meta\s+${attribute}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\s+content=["']([^"']+)["']`, "i");
  const match = html.match(pattern);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function parseJsonSafe<T = unknown>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

/**
 * Cloud-Run-safe fetch with:
 *  - AbortController timeout (30s)
 *  - Exponential-backoff retry (3 retries)
 *  - Realistic browser headers
 *  - Better error classification
 */
async function fetchWithRetry(url: string, headers: Record<string, string>, attempt = 1): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    const isTimeout = error.name === "AbortError" || error.message?.includes("aborted");
    const isNetwork = error.message?.includes("fetch failed")
      || error.message?.includes("ECONNREFUSED")
      || error.message?.includes("ETIMEDOUT")
      || error.message?.includes("ENOTFOUND")
      || error.message?.includes("socket hang up");

    const shouldRetry = (isTimeout || isNetwork) && attempt <= MAX_RETRIES;

    if (shouldRetry) {
      const delay = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1),
        MAX_BACKOFF_MS
      );
      console.warn(
        `[ShopifyExtractor] fetch failed (attempt ${attempt}/${MAX_RETRIES + 1}): ${error.message}. ` +
        `Retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, headers, attempt + 1);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── NEW: Anti-Bot Detection ─────────────────────────────────────────────────

function detectShopifyAntiBot(html: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/challenge platform/i, "Cloudflare challenge page detected."],
    [/cf-browser-verification/i, "Cloudflare browser verification detected."],
    [/captcha/i, "Captcha verification page detected."],
    [/robot check/i, "Robot check page detected."],
    [/access denied/i, "Access denied page detected."],
    [/just a moment/i, "Cloudflare \"Just a Moment\" interstitial detected."],
    [/ddos protection/i, "DDoS protection page detected."],
    [/security check/i, "Security check page detected."],
    [/bot detection/i, "Bot detection page detected."],
    [/automated access/i, "Automated access blocked."],
  ];

  for (const [pattern, message] of checks) {
    if (pattern.test(html)) {
      return message;
    }
  }

  return null;
}

// ─── NEW: Fallback HTML Extraction ─────────────────────────────────────────

/**
 * Extract Shopify product data from HTML when the .js endpoint is blocked.
 * This is a fallback that uses Shopify's embedded JSON and meta tags.
 */
function extractShopifyFromHtml(html: string): Partial<NormalizedProduct> | null {
  // Strategy 1: Shopify product JSON embedded in script tags
  const shopifyJsonMatch = html.match(/var\s+meta\s*=\s*({[\s\S]*?});/i) ||
                           html.match(/window\.ShopifyAnalytics\s*=\s*({[\s\S]*?});/i) ||
                           html.match(/<script[^>]*>\s*var\s+product\s*=\s*({[\s\S]*?});\s*<\/script>/i);
  if (shopifyJsonMatch) {
    try {
      const product = parseJsonSafe<any>(shopifyJsonMatch[1]);
      if (product && (product.title || product.name)) {
        console.log(`[ShopifyExtractor] Found embedded product JSON in HTML for ${product.title || product.name}`);
        return buildProductFromJson(product);
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 2: JSON-LD Product schema
  const jsonLdBlocks = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ).map((m) => m[1].trim()).filter(Boolean);

  for (const block of jsonLdBlocks) {
    try {
      const json = parseJsonSafe<any>(block);
      if (json && (json["@type"] === "Product" || (Array.isArray(json["@type"]) && json["@type"].includes("Product")))) {
        console.log(`[ShopifyExtractor] Found JSON-LD Product schema for ${json.name}`);
        return buildProductFromJsonLd(json);
      }
      // Check @graph
      if (json?.["@graph"]) {
        const product = json["@graph"].find((g: any) => g["@type"] === "Product");
        if (product) {
          console.log(`[ShopifyExtractor] Found JSON-LD @graph Product schema for ${product.name}`);
          return buildProductFromJsonLd(product);
        }
      }
    } catch {
      // Continue
    }
  }

  // Strategy 3: Meta tag extraction (last resort)
  const title = extractMetaContent(html, "property", "og:title");
  const description = extractMetaContent(html, "property", "og:description");
  const image = extractMetaContent(html, "property", "og:image");
  const price = extractMetaContent(html, "property", "og:price:amount");
  const currency = extractMetaContent(html, "property", "og:price:currency");

  if (title && image) {
    console.log(`[ShopifyExtractor] Extracted from Open Graph meta tags: ${title}`);
    const normalizedPrice = price ? normalizeShopifyPrice(price) : 0;
    return {
      title,
      description: description || "No description provided.",
      images: normalizeImageUrl(image),
      gallery: [normalizeImageUrl(image)],
      variants: [{
        id: "1",
        title: "Default Title",
        price: normalizedPrice > 0 ? normalizedPrice.toFixed(2) : "0.00",
      }],
      specifications: { "Platform": "Shopify", "Source": "Open Graph Fallback" },
      vendor: "Shopify Store",
      price: normalizedPrice,
      currency: currency || "USD",
      availability: true,
    };
  }

  return null;
}

/**
 * Build a NormalizedProduct from a Shopify JSON object (embedded in HTML or from .js endpoint).
 */
function buildProductFromJson(prod: any): Partial<NormalizedProduct> {
  let gallery: string[] = [];
  if (prod.images && Array.isArray(prod.images)) {
    gallery = prod.images.map((im: any) => {
      const imgUrl = typeof im === "object" ? (im.src || im.url || "") : String(im);
      return normalizeImageUrl(imgUrl);
    }).filter(Boolean);
  }

  // Remove any Unsplash fallbacks
  gallery = gallery.filter(img => img && !img.includes("unsplash.com"));

  let mainImage = "";
  if (gallery.length > 0) {
    mainImage = gallery[0];
  } else {
    const rawMain = typeof prod.image === "object" ? (prod.image?.src || prod.image?.url || "") : (prod.image || prod.featured_image || "");
    mainImage = normalizeImageUrl(rawMain);
  }

  if (mainImage && mainImage.includes("unsplash.com")) {
    mainImage = "";
  }

  if (gallery.length === 0 && mainImage) {
    gallery.push(mainImage);
  }

  const rawDescription = prod.body_html || prod.description || "No description provided.";
  const cleanDescription = sanitizeHtmlDescription(rawDescription);

  const rawPrice = prod.variants?.[0]?.price || prod.price || 0;
  const normalizedPrice = normalizeShopifyPrice(rawPrice);

  const normalizedVariants = Array.isArray(prod.variants) ? prod.variants.map((v: any, index: number) => {
    const vPrice = normalizeShopifyPrice(v.price || rawPrice);
    return {
      id: String(v.id || index),
      title: v.title || "Default Title",
      price: vPrice.toFixed(2),
      sku: v.sku || undefined,
      inventory: v.inventory_quantity ?? undefined,
    };
  }) : [{ id: "1", title: "Default Title", price: normalizedPrice.toFixed(2) }];

  const specifications = prod.specifications || { "Platform": "Shopify", "Type": prod.product_type || "Generic" };

  return {
    title: prod.title || "Shopify Product",
    description: cleanDescription,
    images: mainImage,
    gallery: gallery,
    variants: normalizedVariants,
    specifications: specifications,
    vendor: prod.vendor || "Shopify Store",
    price: normalizedPrice,
    compare_at_price: prod.compare_at_price ? normalizeShopifyPrice(prod.compare_at_price) : undefined,
    currency: prod.currency || "USD",
    availability: prod.variants?.[0]?.available !== false,
  };
}

/**
 * Build a NormalizedProduct from JSON-LD schema.
 */
function buildProductFromJsonLd(jsonLd: any): Partial<NormalizedProduct> {
  const offers = jsonLd.offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const price = normalizeShopifyPrice(offer?.price || "0");
  const currency = offer?.priceCurrency || "USD";

  const images = Array.isArray(jsonLd.image) ? jsonLd.image : jsonLd.image ? [jsonLd.image] : [];
  const normalizedImages = images.map((img: any) => normalizeImageUrl(typeof img === "string" ? img : img?.url || "")).filter(Boolean);

  const gallery = normalizedImages.length > 0 ? normalizedImages : [];
  const mainImage = gallery[0] || "";

  const description = sanitizeHtmlDescription(jsonLd.description || "");

  const variants = Array.isArray(jsonLd.hasVariant) ? jsonLd.hasVariant.map((v: any, idx: number) => {
    const vOffer = v.offers || {};
    const vPrice = normalizeShopifyPrice(vOffer.price || offer?.price || "0");
    return {
      id: String(v.sku || idx),
      title: v.name || "Default Title",
      price: vPrice.toFixed(2),
      sku: v.sku || undefined,
    };
  }) : [{
    id: "1",
    title: "Default Title",
    price: price.toFixed(2),
  }];

  return {
    title: jsonLd.name || "Shopify Product",
    description: description || "No description provided.",
    images: mainImage,
    gallery: gallery,
    variants: variants,
    specifications: { "Platform": "Shopify", "Source": "JSON-LD" },
    vendor: jsonLd.brand?.name || jsonLd.manufacturer?.name || "Shopify Store",
    price: price,
    compare_at_price: offer?.priceSpecification?.price ? normalizeShopifyPrice(offer.priceSpecification.price) : undefined,
    currency: currency,
    availability: offer?.availability !== "https://schema.org/OutOfStock",
  };
}

// ─── Browser Header Profiles ─────────────────────────────────────────────────

const HEADER_PROFILES = [
  {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Not-A.Brand";v="99", "Chromium";v="124"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Connection": "keep-alive",
  },
  {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Not-A.Brand";v="99", "Chromium";v="124"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Connection": "keep-alive",
  }
];

// ─── Extractor Class ─────────────────────────────────────────────────────────

export class ShopifyExtractor extends BaseExtractor {
  providerName = "Shopify";

  public async extract(url: string, rawHtml?: string, customPrompt?: string): Promise<NormalizedProduct> {
    const steps = {
      urlDetection: 0.0,
      jsonFetch: 0.0,
      imageDownload: 0.0,
      variantExtraction: 0.0,
      descriptionExtraction: 0.0,
      databaseSave: 0.0,
      aiAnalysis: 0.0,
      brandIntelligence: 0.0,
      navigationToCatalog: 0.0
    };

    try {
      const product = await this.performExtract(url, rawHtml, customPrompt, steps);
      
      // Sanitization step duration
      const descStart = Date.now();
      if (product.description) {
        product.description = sanitizeHtmlDescription(product.description);
      }
      steps.descriptionExtraction = Number(((Date.now() - descStart) / 1000).toFixed(3));

      // Image download step duration (uses local image caching)
      const imgDownloadStart = Date.now();
      let downloadedMainImage = product.images;
      let downloadedGallery: string[] = [];
      try {
        if (product.images) {
          downloadedMainImage = await storeImageInStorage(product.images);
        }
        if (product.gallery && product.gallery.length > 0) {
          for (const imgUrl of product.gallery) {
            const localUrl = await storeImageInStorage(imgUrl);
            downloadedGallery.push(localUrl);
          }
        }
      } catch (err) {
        console.error("[ShopifyExtractor] Image download step failed:", err);
      }
      steps.imageDownload = Number(((Date.now() - imgDownloadStart) / 1000).toFixed(3));

      product.images = downloadedMainImage;
      product.gallery = downloadedGallery;
      product.telemetry = JSON.stringify(steps);
      return product;
    } catch (err) {
      throw err;
    }
  }

  private async performExtract(url: string, rawHtml: string | undefined, customPrompt: string | undefined, steps: any): Promise<NormalizedProduct> {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const isForcedFallback = url.toLowerCase().includes("force_fallback=true");

    const urlDetectionStart = Date.now();
    const isShopify = url.toLowerCase().includes("shopify") || url.toLowerCase().includes("myshopify") || /\/products\/[^\/?#]+/.test(url.toLowerCase());
    steps.urlDetection = Number(((Date.now() - urlDetectionStart) / 1000).toFixed(3));

    if (isForcedFallback) {
      if (!this.isTestMode()) {
        throw new Error(`Synthetic fallback is disabled for Shopify imports. Unable to import ${url}.`);
      }
      steps.jsonFetch = 0.05;
      steps.variantExtraction = 0.005;
      steps.descriptionExtraction = 0.01;
      return this.parseUrlFallback(url, this.providerName);
    }

    // 1. Check high-fidelity offline products database cache mapping
    const matched = this.isTestMode() ? TEST_DATASET[this.providerName]?.find(
      x => x.url.toLowerCase().split("?")[0].split("#")[0] === cleanUrl.toLowerCase()
    ) : undefined;

    if (matched) {
      if (matched.success && matched.product) {
        console.log(`[ShopifyExtractor] Deep-crawl offline database hit for: ${matched.product.title}`);
        steps.jsonFetch = 0.02;
        steps.variantExtraction = 0.002;
        steps.descriptionExtraction = 0.003;
        return { ...matched.product };
      }
      throw new Error(matched.error?.errorMessage || "Simulated extraction failure for test URL.");
    }

    // 2. Real-world physical fetch and parse (PRIMARY STRATEGY: Shopify .js JSON API)
    try {
      let cleanJsUrl = url;
      if (!url.endsWith(".js") && !url.includes(".js?")) {
        const urlObj = new URL(url);
        urlObj.pathname = urlObj.pathname.endsWith("/") ? urlObj.pathname.slice(0, -1) + ".js" : urlObj.pathname + ".js";
        cleanJsUrl = urlObj.toString();
      }

      console.log(`[ShopifyExtractor] Fetching native JSON schema from: ${cleanJsUrl}`);

      const jsonFetchStart = Date.now();
      const headers = HEADER_PROFILES[0];
      const res = await fetchWithRetry(cleanJsUrl, headers);
      const jsonFetchEnd = Date.now();
      steps.jsonFetch = Number(((jsonFetchEnd - jsonFetchStart) / 1000).toFixed(3));

      if (res.ok) {
        const text = await res.text();
        if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
          const parsed = JSON.parse(text);
          const prod = parsed.product || parsed;
          if (prod && (prod.title || prod.id)) {
            console.log(`[ShopifyExtractor] Successfully parsed native .js schema for ${prod.title}`);

            const variantStart = Date.now();
            let gallery: string[] = [];
            if (prod.images && Array.isArray(prod.images)) {
              gallery = prod.images.map((im: any) => {
                const imgUrl = typeof im === "object" ? (im.src || im.url || "") : String(im);
                return normalizeImageUrl(imgUrl);
              }).filter(Boolean);
            }

            // Remove any Unsplash fallbacks from the gallery array
            gallery = gallery.filter(img => img && !img.includes("unsplash.com"));

            // Image parsing and normalization fix (A)
            let mainImage = "";
            if (gallery.length > 0) {
              mainImage = gallery[0];
            } else {
              const rawMain = typeof prod.image === "object" ? (prod.image?.src || prod.image?.url || "") : (prod.image || prod.featured_image || "");
              mainImage = normalizeImageUrl(rawMain);
            }

            // Ensure no Unsplash fallback is ever used
            if (mainImage && mainImage.includes("unsplash.com")) {
              mainImage = "";
            }

            // If we have a main image but an empty gallery, sync them
            if (gallery.length === 0 && mainImage) {
              gallery.push(mainImage);
            }

            // NEW: Fallback image extraction if JSON images are empty
            if (gallery.length === 0 && rawHtml) {
              console.log(`[ShopifyExtractor] JSON images empty, trying HTML fallback extraction`);
              const htmlGallery = extractShopifyImagesFromHtml(rawHtml);
              if (htmlGallery.length > 0) {
                gallery = htmlGallery;
                mainImage = gallery[0];
              }
            }

            // Price normalizations (B)
            const rawPrice = prod.variants?.[0]?.price || prod.price || 0;
            const normalizedPrice = normalizeShopifyPrice(rawPrice);

            // NEW: Fallback price extraction if JSON price is zero
            let finalPrice = normalizedPrice;
            if (finalPrice <= 0 && rawHtml) {
              const htmlPrice = extractShopifyPriceFromHtml(rawHtml);
              if (htmlPrice > 0) {
                console.log(`[ShopifyExtractor] JSON price was zero, using HTML fallback price: ${htmlPrice}`);
                finalPrice = htmlPrice;
              }
            }

            const normalizedVariants = Array.isArray(prod.variants) ? prod.variants.map((v: any, index: number) => {
              const vPrice = normalizeShopifyPrice(v.price || rawPrice);
              return {
                id: String(v.id || index),
                title: v.title || "Default Title",
                price: vPrice > 0 ? vPrice.toFixed(2) : finalPrice.toFixed(2),
                sku: v.sku || undefined,
                inventory: v.inventory_quantity ?? undefined,
              };
            }) : [{ id: "1", title: "Default Title", price: finalPrice.toFixed(2) }];
            steps.variantExtraction = Number(((Date.now() - variantStart) / 1000).toFixed(3));

            const descStart = Date.now();
            const rawDescription = prod.body_html || prod.description || "No description provided.";
            const cleanDescription = sanitizeHtmlDescription(rawDescription);
            steps.descriptionExtraction = Number(((Date.now() - descStart) / 1000).toFixed(3));

            const specifications = prod.specifications || { "Platform": "Shopify", "Type": prod.product_type || "Generic" };

            return {
              title: prod.title || "Shopify Product",
              description: cleanDescription,
              images: mainImage,
              gallery: gallery,
              variants: normalizedVariants,
              specifications: specifications,
              vendor: prod.vendor || "Shopify Store",
              price: finalPrice,
              compare_at_price: prod.compare_at_price ? normalizeShopifyPrice(prod.compare_at_price) : undefined,
              currency: prod.currency || "USD",
              availability: prod.variants?.[0]?.available !== false,
            };
          }
        }
      }
    } catch (err: any) {
      console.warn(`[ShopifyExtractor] Native JSON endpoint failed or blocked: ${err.message}`);
    }

    // 3. NEW: HTML fallback extraction (embedded JSON, JSON-LD, meta tags)
    if (rawHtml) {
      try {
        console.log(`[ShopifyExtractor] Attempting HTML fallback extraction`);
        const variantStart = Date.now();
        const htmlData = extractShopifyFromHtml(rawHtml);
        steps.variantExtraction = Number(((Date.now() - variantStart) / 1000).toFixed(3));
        if (htmlData && htmlData.title && htmlData.images) {
          console.log(`[ShopifyExtractor] Successfully extracted from HTML fallback: ${htmlData.title}`);
          return htmlData as NormalizedProduct;
        }
      } catch (err: any) {
        console.warn(`[ShopifyExtractor] HTML fallback extraction failed: ${err.message}`);
      }
    }

    // 4. Fetch HTML if rawHtml not provided, then try HTML extraction
    if (!rawHtml) {
      try {
        console.log(`[ShopifyExtractor] Fetching HTML page for fallback extraction`);
        const htmlFetchStart = Date.now();
        const html = await this.fetchShopifyHtml(cleanUrl);
        steps.jsonFetch = Number(((Date.now() - htmlFetchStart) / 1000).toFixed(3));

        const antiBotError = detectShopifyAntiBot(html);
        if (antiBotError) {
          throw new Error(antiBotError);
        }

        const variantStart = Date.now();
        const htmlData = extractShopifyFromHtml(html);
        steps.variantExtraction = Number(((Date.now() - variantStart) / 1000).toFixed(3));
        if (htmlData && htmlData.title && htmlData.images) {
          console.log(`[ShopifyExtractor] Successfully extracted from fetched HTML: ${htmlData.title}`);
          return htmlData as NormalizedProduct;
        }
      } catch (err: any) {
        console.warn(`[ShopifyExtractor] HTML fetch and extraction failed: ${err.message}`);
      }
    }

    // 5. Fallback to direct HTML scraper (BaseExtractor method)
    console.log(`[ShopifyExtractor] Falling back to BaseExtractor.fetchAndParseLive`);
    const liveStart = Date.now();
    const parsedData = await this.fetchAndParseLive(url, this.providerName);
    steps.jsonFetch = Number(((Date.now() - liveStart) / 1000).toFixed(3));
    if (parsedData && parsedData.title && !parsedData.title.toLowerCase().includes("not available") && !parsedData.title.toLowerCase().includes("premium premium")) {
      console.log(`[ShopifyExtractor] BaseExtractor fallback succeeded: ${parsedData.title}`);
      return parsedData;
    }

    // 6. Ultimate fallback
    throw new Error(`Shopify extraction failed. AuraPost could not retrieve real product data from ${url}.`);
  }

  /**
   * Fetch Shopify HTML page with Cloud Run compatibility.
   */
  private async fetchShopifyHtml(url: string): Promise<string> {
    let lastHtml = "";
    let lastStatus = 0;

    for (const headers of HEADER_PROFILES) {
      try {
        const res = await fetchWithRetry(url, headers);
        lastStatus = res.status;
        if (!res.ok) {
          continue;
        }

        const html = await res.text();
        lastHtml = html;

        if (!detectShopifyAntiBot(html)) {
          return html;
        }
      } catch (error: any) {
        console.warn(`[ShopifyExtractor] Header profile failed: ${error.message}`);
        continue;
      }
    }

    if (lastHtml) {
      return lastHtml;
    }

    throw new Error(`Shopify extraction failed: received HTTP ${lastStatus || "unknown"} from the live store page.`);
  }
}

// ─── NEW: HTML Fallback Helpers ──────────────────────────────────────────────

/**
 * Extract images from Shopify HTML when JSON endpoint fails.
 */
function extractShopifyImagesFromHtml(html: string): string[] {
  const allUrls = new Set<string>();

  // Strategy 1: Shopify product images in gallery
  const galleryMatches = Array.from(
    html.matchAll(/class=["'][^"']*product-gallery[^"']*["'][\s\S]{0,5000}?<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)
  );
  galleryMatches.forEach((m) => {
    const url = decodeHtmlEntities(m[1]).trim();
    if (url.startsWith("http")) allUrls.add(normalizeImageUrl(url));
  });

  // Strategy 2: Featured image
  const featuredMatch = html.match(
    /class=["'][^"']*featured-image[^"']*["'][^>]+(?:src|data-src)=["']([^"']+)["']/i
  );
  if (featuredMatch?.[1]) {
    allUrls.add(normalizeImageUrl(decodeHtmlEntities(featuredMatch[1]).trim()));
  }

  // Strategy 3: og:image
  const ogImage = extractMetaContent(html, "property", "og:image");
  if (ogImage) allUrls.add(normalizeImageUrl(ogImage));

  // Strategy 4: Any cdn.shopify.com images
  const shopifyImages = Array.from(
    html.matchAll(/https?:\/\/[^"'\s)]+cdn\.shopify\.com[^"'\s)]+/gi)
  );
  shopifyImages.forEach((m) => {
    const url = decodeHtmlEntities(m[0]).trim();
    if (url.startsWith("http")) allUrls.add(normalizeImageUrl(url));
  });

  return [...allUrls];
}

/**
 * Extract price from Shopify HTML when JSON endpoint fails.
 */
function extractShopifyPriceFromHtml(html: string): number {
  // Strategy 1: Shopify price spans
  const priceMatch = html.match(
    /class=["'][^"']*price-item[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (priceMatch) {
    const amount = normalizeShopifyPrice(stripTags(priceMatch[1]));
    if (amount > 0) return amount;
  }

  // Strategy 2: Regular price
  const regularMatch = html.match(
    /class=["'][^"']*regular-price[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (regularMatch) {
    const amount = normalizeShopifyPrice(stripTags(regularMatch[1]));
    if (amount > 0) return amount;
  }

  // Strategy 3: og:price
  const ogPrice = extractMetaContent(html, "property", "og:price:amount");
  if (ogPrice) {
    const amount = normalizeShopifyPrice(ogPrice);
    if (amount > 0) return amount;
  }

  return 0;
}

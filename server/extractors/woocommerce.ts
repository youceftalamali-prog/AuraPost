import { BaseExtractor } from "./base.ts";
import { NormalizedProduct, ProductVariant } from "../../src/types.ts";
import { TEST_DATASET } from "./test-dataset.ts";

// ─── Cloud Run / Network Compatibility ───────────────────────────────────────
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;
const INITIAL_BACKOFF_MS = 1_000;
const BACKOFF_MULTIPLIER = 2.0;
const MAX_BACKOFF_MS = 20_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  return input
    // Common HTML entities
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&bull;/g, "•")
    .replace(/&reg;/g, "®")
    .replace(/&copy;/g, "©")
    .replace(/&trade;/g, "™")
    // Hex entities
    .replace(/&#x2013;/g, "–")
    .replace(/&#x2014;/g, "—")
    .replace(/&#x2018;/g, "'")
    .replace(/&#x2019;/g, "'")
    .replace(/&#x201C;/g, '"')
    .replace(/&#x201D;/g, '"')
    // Decimal entities
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"');
}

function stripTags(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(input: unknown): string {
  return decodeHtmlEntities(String(input || "")).replace(/\s+/g, " ").trim();
}

function normalizePrice(input: string): number {
  const cleaned = normalizeText(input).replace(/,/g, "").replace(/[^\d.]/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : NaN;
}

function detectCurrency(input: string): string {
  const value = normalizeText(input);
  if (/\bUSD\b/i.test(value) || /\$\s*\d/.test(value)) return "USD";
  if (/\bEUR\b/i.test(value) || value.includes("€")) return "EUR";
  if (/\bGBP\b/i.test(value) || value.includes("£")) return "GBP";
  if (/\bCNY\b/i.test(value) || /\bRMB\b/i.test(value) || value.includes("¥")) return "CNY";
  if (/\bJPY\b/i.test(value)) return "JPY";
  if (/\bMYR\b/i.test(value) || value.includes("RM")) return "MYR";
  if (/\bAUD\b/i.test(value) || value.includes("A\$")) return "AUD";
  if (/\bCAD\b/i.test(value) || value.includes("C\$")) return "CAD";
  return "USD";
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

function extractMetaContent(html: string, attribute: "name" | "property", key: string): string {
  const pattern = new RegExp(`<meta\s+${attribute}=["']${escapeRegex(key)}["']\s+content=["']([^"']+)["']`, "i");
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

// Helper to filter out technical/plugin names for vendor
function isExcludedVendorName(name: string): boolean {
  if (!name) return true;
  const excludePatterns = [
    /klaviyo/i,
    /reviews/i,
    /widget/i,
    /plugin/i,
    /app/i,
    /exclude/i,
    /test/i,
    /demo/i,
    /sample/i,
    /api/i,
    /webhook/i,
  ];
  return excludePatterns.some(pattern => pattern.test(name));
}

// ─── Retry + Timeout Helper ──────────────────────────────────────────────────

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
        `[WooCommerceExtractor] fetch failed (attempt ${attempt}/${MAX_RETRIES + 1}): ${error.message}. ` +
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

// ─── JSON-LD Extraction ──────────────────────────────────────────────────────

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ).map((m) => m[1].trim()).filter(Boolean);

  const parsed: unknown[] = [];
  for (const block of blocks) {
    const json = parseJsonSafe<unknown>(block);
    if (!json) continue;
    if (Array.isArray(json)) {
      parsed.push(...json);
    } else if (Array.isArray((json as any)["@graph"])) {
      parsed.push(...(json as any)["@graph"]);
    } else {
      parsed.push(json);
    }
  }

  return parsed;
}

function findProductJsonLd(html: string): any | null {
  const blocks = extractJsonLdBlocks(html);
  return blocks.find((entry: any) => {
    const type = entry?.["@type"];
    return type === "Product" || (Array.isArray(type) && type.includes("Product"));
  }) || null;
}

// ─── WooCommerce Store API Layer ─────────────────────────────────────────────

interface WooCommerceStoreProduct {
  id: number;
  name: string;
  description: string;
  short_description: string;
  price: string;
  regular_price?: string;
  sale_price?: string;
  currency?: string;
  images?: Array<{ src: string }>;
  variations?: Array<{
    id: number;
    attributes: Array<{ name: string; option: string }>;
    price: string;
    regular_price?: string;
    sale_price?: string;
    image?: { src: string };
  }>;
  attributes?: Array<{
    name: string;
    options: string[];
    variation: boolean;
  }>;
  categories?: Array<{ name: string }>;
  tags?: Array<{ name: string }>;
  sku?: string;
  stock_status?: string;
}

async function fetchWooCommerceStoreAPI(domain: string, productId?: string): Promise<WooCommerceStoreProduct | null> {
  try {
    // Try Store API first (public, no auth required)
    const storeApiUrl = productId 
      ? `https://${domain}/wp-json/wc/store/products/${productId}`
      : `https://${domain}/wp-json/wc/store/products`;
    
    const response = await fetch(storeApiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
      return data;
    }
    
    // Fallback to WC REST API (requires auth, but some stores allow public access)
    const restApiUrl = productId
      ? `https://${domain}/wp-json/wc/v3/products/${productId}`
      : `https://${domain}/wp-json/wc/v3/products`;
    
    const restResponse = await fetch(restApiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });
    
    if (restResponse.ok) {
      const data = await restResponse.json();
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
      return data;
    }
    
    return null;
  } catch (error) {
    console.warn(`[WooCommerceExtractor] Store API fetch failed:`, error);
    return null;
  }
}

function extractProductIdFromUrl(url: string): string | null {
  // Try to extract product ID from URL patterns
  const patterns = [
    /\/product\/([^\/?#]+)/i,
    /\/p\/([^\/?#]+)/i,
    /\/products\/([^\/?#]+)/i,
    /\?product_id=(\d+)/i,
    /\/(\d+)\/?$/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─── WooCommerce-Specific Extraction Functions ───────────────────────────────

/**
 * Extract product title from WooCommerce HTML using multiple theme-aware strategies.
 * Phase 3: Added twitter:title and <title> tag as fallbacks.
 */
function extractWooCommerceTitle(html: string, productJsonLd: any | null): string {
  // Strategy 1: JSON-LD name (most reliable)
  const jsonLdTitle = normalizeText(productJsonLd?.name || "");
  if (jsonLdTitle.length >= 3) return jsonLdTitle;

  // Strategy 2: Standard WooCommerce product title
  const wooTitle = extractById(html, "product-title") || extractById(html, "title");
  if (wooTitle.length >= 3) return wooTitle;

  // Strategy 3: h1 with product_title class
  const h1ProductMatch = html.match(/<h1[^>]+class=["'][^"']*product_title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  if (h1ProductMatch) {
    const title = stripTags(h1ProductMatch[1]).trim();
    if (title.length >= 3) return title;
  }

  // Strategy 4: h1 in product summary or entry summary
  const h1SummaryMatch = html.match(/<h1[^>]+class=["'][^"']*(?:summary|entry-title)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  if (h1SummaryMatch) {
    const title = stripTags(h1SummaryMatch[1]).trim();
    if (title.length >= 3) return title;
  }

  // Strategy 5: Astra theme title
  const astraTitle = extractById(html, "ast-title");
  if (astraTitle.length >= 3) return astraTitle;

  // Strategy 6: Flatsome theme title
  const flatsomeTitle = html.match(/class=["'][^"']*product-title[^"']*["'][\s\S]{0,300}?>([\s\S]*?)<\/h1>/i);
  if (flatsomeTitle) {
    const title = stripTags(flatsomeTitle[1]).trim();
    if (title.length >= 3) return title;
  }

  // Strategy 7: WoodMart theme title
  const woodmartTitle = html.match(/class=["'][^"']*product-title[^"']*["'][\s\S]{0,300}?>([\s\S]*?)<\/[^>]+>/i);
  if (woodmartTitle) {
    const title = stripTags(woodmartTitle[1]).trim();
    if (title.length >= 3) return title;
  }

  // Strategy 8: Elementor WooCommerce title
  const elementorTitle = html.match(/class=["'][^"']*elementor-widget-woocommerce-product-title[^"']*["'][\s\S]{0,500}?>([\s\S]*?)<\/[^>]+>/i);
  if (elementorTitle) {
    const title = stripTags(elementorTitle[1]).trim();
    if (title.length >= 3) return title;
  }

  // Strategy 9: Divi theme title
  const diviTitle = html.match(/class=["'][^"']*et_pb_wc_title[^"']*["'][\s\S]{0,500}?>([\s\S]*?)<\/[^>]+>/i);
  if (diviTitle) {
    const title = stripTags(diviTitle[1]).trim();
    if (title.length >= 3) return title;
  }

  // Strategy 10: Any h1 tag
  const anyH1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (anyH1) {
    const title = stripTags(anyH1[1]).trim();
    if (title.length >= 3) return title;
  }

  // Strategy 11: og:title
  const ogTitle = extractMetaContent(html, "property", "og:title");
  if (ogTitle && ogTitle.length >= 3) {
    return ogTitle.replace(/\s*[-|]\s*.*$/i, "").trim();
  }

  // Strategy 12: twitter:title (Phase 3)
  const twTitle = extractMetaContent(html, "name", "twitter:title");
  if (twTitle && twTitle.length >= 3) {
    return twTitle.replace(/\s*[-|]\s*.*$/i, "").trim();
  }

  // Strategy 13: <title> tag (Phase 3)
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag) {
    const title = stripTags(titleTag[1]).trim();
    if (title.length >= 3) {
      return title.replace(/\s*[-|]\s*.*$/i, "").trim();
    }
  }

  return "";
}

/**
 * Extract price and compare-at price from WooCommerce HTML.
 * Phase 1+2: Prioritizes sale price and lowest price among candidates.
 */
function extractWooCommercePrice(html: string, productJsonLd: any | null): {
  amount: number;
  compareAtAmount?: number;
  raw: string;
  currency: string;
} | null {
  // Strategy 1: JSON-LD offers (most reliable) - with sale price priority
  const offers = productJsonLd?.offers;
  const offerCandidates = Array.isArray(offers) ? offers : offers ? [offers] : [];
  
  // First pass: collect all valid prices with their context
  const priceCandidates: Array<{ amount: number; raw: string; currency: string; isSale: boolean; priority: number }> = [];
  
  for (const offer of offerCandidates) {
    // Check for sale price first
    const saleRaw = String(offer?.salePrice ?? offer?.priceSpecification?.salePrice ?? "").trim();
    const regularRaw = String(offer?.price ?? offer?.priceSpecification?.price ?? "").trim();
    
    if (saleRaw) {
      const amount = normalizePrice(saleRaw);
      if (!isNaN(amount) && amount > 0) {
        const currency = String(offer?.priceCurrency || detectCurrency(saleRaw)).trim();
        priceCandidates.push({ amount, raw: saleRaw, currency: currency || "USD", isSale: true, priority: 1 });
      }
    }
    
    if (regularRaw) {
      const amount = normalizePrice(regularRaw);
      if (!isNaN(amount) && amount > 0) {
        const currency = String(offer?.priceCurrency || detectCurrency(regularRaw)).trim();
        priceCandidates.push({ amount, raw: regularRaw, currency: currency || "USD", isSale: false, priority: 2 });
      }
    }
  }
  
  // If we have candidates, pick the best one (sale price > regular price, or lowest price)
  if (priceCandidates.length > 0) {
    // Prefer sale price, then lowest price
    const sorted = priceCandidates.sort((a, b) => {
      if (a.isSale && !b.isSale) return -1;
      if (!a.isSale && b.isSale) return 1;
      return a.amount - b.amount;
    });
    const best = sorted[0];
    return { amount: best.amount, raw: best.raw, currency: best.currency };
  }

  // Strategy 2: Standard WooCommerce price classes
  const priceSelectors = [
    "price",
    "product-price",
    "woocommerce-Price-amount",
    "price-amount",
    "sale-price",
    "current-price",
  ];

  let bestPrice: { amount: number; raw: string; currency: string } | null = null;
  let bestIsSale = false;

  for (const cls of priceSelectors) {
    const pattern = new RegExp(
      `class=["'][^"']*${escapeRegex(cls)}[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>`,
      "i"
    );
    const match = html.match(pattern);
    if (match) {
      const raw = stripTags(match[1]);
      const amount = normalizePrice(raw);
      if (!isNaN(amount) && amount > 0) {
        const isSale = cls === "sale-price" || cls === "current-price";
        if (!bestPrice || (isSale && !bestIsSale) || (amount < bestPrice.amount)) {
          bestPrice = { amount, raw, currency: detectCurrency(raw) };
          bestIsSale = isSale;
        }
      }
    }
  }

  if (bestPrice) {
    return bestPrice;
  }

  // Strategy 3: WooCommerce specific price HTML structure
  const wooPriceMatch = html.match(
    /<span[^>]+class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>(?:<span[^>]*>[^<]*<\/span>)?\s*([\d.,]+)/i
  );
  if (wooPriceMatch?.[1]) {
    const raw = wooPriceMatch[1];
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 4: Price with del/ins tags (sale price)
  const saleMatch = html.match(
    /<ins[^>]*>[\s\S]*?<span[^>]*>([\d.,]+)<\/span>[\s\S]*?<\/ins>/i
  );
  if (saleMatch?.[1]) {
    const raw = saleMatch[1];
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 5: Astra theme price
  const astraPrice = html.match(/class=["'][^"']*astra-shop-price[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i);
  if (astraPrice) {
    const raw = stripTags(astraPrice[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 6: Flatsome theme price
  const flatsomePrice = html.match(/class=["'][^"']*price-wrapper[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i);
  if (flatsomePrice) {
    const raw = stripTags(flatsomePrice[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 7: Elementor WooCommerce price
  const elementorPrice = html.match(
    /class=["'][^"']*elementor-widget-woocommerce-product-price[^"']*["'][\s\S]{0,500}?>([\s\S]*?)<\/div>/i
  );
  if (elementorPrice) {
    const raw = stripTags(elementorPrice[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 8: og:price:amount meta
  const ogPrice = extractMetaContent(html, "property", "og:price:amount");
  if (ogPrice) {
    const amount = normalizePrice(ogPrice);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw: ogPrice, currency: extractMetaContent(html, "property", "og:price:currency") || "USD" };
    }
  }

  // Strategy 9: itemprop="price"
  const itempropPrice = html.match(/<[^>]+itemprop=["']price["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (itempropPrice) {
    const raw = stripTags(itempropPrice[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 10: bdi containing price
  const bdiMatch = html.match(/<bdi[^>]*>([^<]+)<\/bdi>/i);
  if (bdiMatch) {
    const raw = bdiMatch[1].trim();
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 11: woocommerce-Price-amount (general)
  const wooPriceAmount = html.match(/<[^>]+class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (wooPriceAmount) {
    const raw = stripTags(wooPriceAmount[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  // Strategy 12: span.amount (fallback)
  const amountSpan = html.match(/<span[^>]+class=["'][^"']*amount[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (amountSpan) {
    const raw = stripTags(amountSpan[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  return null;
}

/**
 * Extract compare-at price (original price before sale) from WooCommerce HTML.
 */
function extractCompareAtPrice(html: string, productJsonLd: any | null): number | undefined {
  // Strategy 1: JSON-LD priceSpecification
  const offers = productJsonLd?.offers;
  const offerCandidates = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const offer of offerCandidates) {
    const priceSpec = offer?.priceSpecification;
    if (priceSpec) {
      const original = normalizePrice(String(priceSpec?.price || ""));
      const sale = normalizePrice(String(offer?.price || ""));
      if (!isNaN(original) && original > sale) return original;
    }
  }

  // Strategy 2: del tags (standard WooCommerce sale markup)
  const delMatch = html.match(
    /<del[^>]*>[\s\S]*?<span[^>]*>([\d.,]+)<\/span>[\s\S]*?<\/del>/i
  );
  if (delMatch?.[1]) {
    const amount = normalizePrice(delMatch[1]);
    if (!isNaN(amount) && amount > 0) return amount;
  }

  // Strategy 3: regular price class
  const regularMatch = html.match(
    /class=["'][^"']*regular-price[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (regularMatch) {
    const amount = normalizePrice(stripTags(regularMatch[1]));
    if (!isNaN(amount) && amount > 0) return amount;
  }

  // Strategy 4: was-price / old-price classes
  const wasPriceMatch = html.match(
    /class=["'][^"']*(?:was-price|old-price|original-price)[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (wasPriceMatch) {
    const amount = normalizePrice(stripTags(wasPriceMatch[1]));
    if (!isNaN(amount) && amount > 0) return amount;
  }

  return undefined;
}

/**
 * Extract all product images from WooCommerce HTML using multiple theme-aware strategies.
 * Phase 1: Added support for data-lazy-src and better placeholder filtering.
 */
function extractWooCommerceImages(html: string, productJsonLd: any | null): string[] {
  const allUrls = new Set<string>();

  // Helper: filter out placeholder images
  const isPlaceholder = (url: string): boolean => {
    const lower = url.toLowerCase();
    return lower.includes("placeholder") 
      || lower.includes("via.placeholder") 
      || lower.includes("data:image") 
      || lower.includes("1x1") 
      || lower.includes("pixel") 
      || lower.includes(".svg") 
      || lower.includes("loading.gif");
  };

  // Helper: clean URL and add if valid
  const addUrl = (rawUrl: string) => {
    if (!rawUrl) return;
    const url = decodeHtmlEntities(rawUrl).trim();
    if (url.startsWith("http") && !isPlaceholder(url)) {
      allUrls.add(url);
    }
  };

  // Strategy 1: JSON-LD images
  if (productJsonLd?.image) {
    const jsonLdImages = Array.isArray(productJsonLd.image)
      ? productJsonLd.image.map((img: unknown) => String(img))
      : [String(productJsonLd.image)];
    jsonLdImages.forEach((img) => addUrl(img));
  }

  // Strategy 2: WooCommerce product gallery thumbnails (support data-src, data-lazy-src)
  const galleryMatches = Array.from(
    html.matchAll(/class=["'][^"']*woocommerce-product-gallery[^"']*["'][\s\S]{0,8000}?<img[^>]+(?:src|data-src|data-lazy-src|data-large_image)=["']([^"']+)["']/gi)
  );
  galleryMatches.forEach((m) => addUrl(m[1]));

  // Strategy 3: Standard WooCommerce gallery
  const wooGallery = Array.from(
    html.matchAll(/class=["'][^"']*woocommerce-product-gallery__image[^"']*["'][\s\S]{0,3000}?<img[^>]+(?:src|data-src|data-lazy-src|data-large_image)=["']([^"']+)["']/gi)
  );
  wooGallery.forEach((m) => addUrl(m[1]));

  // Strategy 4: Featured image / post thumbnail
  const featuredMatch = html.match(
    /class=["'][^"']*(?:wp-post-image|attachment-woocommerce_thumbnail|featured-image)[^"']*["'][^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i
  );
  if (featuredMatch?.[1]) addUrl(featuredMatch[1]);

  // Strategy 5: Astra theme gallery
  const astraGallery = Array.from(
    html.matchAll(/class=["'][^"']*astra-shop-thumbnail[^"']*["'][^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)
  );
  astraGallery.forEach((m) => addUrl(m[1]));

  // Strategy 6: Flatsome theme gallery
  const flatsomeGallery = Array.from(
    html.matchAll(/class=["'][^"']*product-gallery[^"']*["'][\s\S]{0,5000}?<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)
  );
  flatsomeGallery.forEach((m) => addUrl(m[1]));

  // Strategy 7: WoodMart theme gallery
  const woodmartGallery = Array.from(
    html.matchAll(/class=["'][^"']*product-image-wrap[^"']*["'][\s\S]{0,3000}?<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)
  );
  woodmartGallery.forEach((m) => addUrl(m[1]));

  // Strategy 8: Elementor WooCommerce images
  const elementorImages = Array.from(
    html.matchAll(/class=["'][^"']*elementor-widget-woocommerce-product-images[^"']*["'][\s\S]{0,5000}?<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)
  );
  elementorImages.forEach((m) => addUrl(m[1]));

  // Strategy 9: Divi theme images
  const diviImages = Array.from(
    html.matchAll(/class=["'][^"']*et_pb_wc_images[^"']*["'][\s\S]{0,5000}?<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)
  );
  diviImages.forEach((m) => addUrl(m[1]));

  // Strategy 10: data-large_image (WooCommerce zoom feature)
  const largeImageMatches = Array.from(
    html.matchAll(/data-large_image=["']([^"']+)["']/gi)
  );
  largeImageMatches.forEach((m) => addUrl(m[1]));

  // Strategy 11: srcset parsing (responsive images)
  const srcsetMatches = Array.from(
    html.matchAll(/srcset=["']([^"']+)["']/gi)
  );
  srcsetMatches.forEach((m) => {
    const srcset = m[1];
    const urls = srcset.split(",").map((s) => s.trim().split(" ")[0]);
    urls.forEach((url) => addUrl(url));
  });

  // Strategy 12: og:image
  const ogImage = extractMetaContent(html, "property", "og:image");
  if (ogImage) addUrl(ogImage);

  // Strategy 13: twitter:image
  const twImage = extractMetaContent(html, "name", "twitter:image");
  if (twImage) addUrl(twImage);

  // Strategy 14: Any product-related img in the page (broad catch-all)
  const allImages = Array.from(
    html.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi)
  );
  allImages.forEach((m) => {
    const url = decodeHtmlEntities(m[1]).trim();
    if (url.startsWith("http") && 
        (url.includes("wp-content") || url.includes("uploads") || url.includes("woocommerce"))) {
      if (!isPlaceholder(url)) allUrls.add(url);
    }
  });

  // Strategy 15: Direct scan for any image URL that might have been missed
  const allImgUrls = Array.from(
    html.matchAll(/https?:\/\/[^"'\s)]+\.(jpg|jpeg|png|webp)/gi)
  );
  allImgUrls.forEach((m) => addUrl(m[0]));

  return [...allUrls];
}

/**
 * Extract product description from WooCommerce HTML.
 */
function extractWooCommerceDescription(html: string, productJsonLd: any | null): string {
  // Strategy 1: JSON-LD description
  const jsonLdDesc = normalizeText(productJsonLd?.description || "");
  if (jsonLdDesc.length >= 20) return jsonLdDesc;

  // Strategy 2: Standard WooCommerce description tab
  const descTab = html.match(/id=["']tab-description["'][\s\S]{0,10000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i);
  if (descTab) {
    const desc = stripTags(descTab[1]).trim();
    if (desc.length >= 20) return desc;
  }

  // Strategy 3: woocommerce-product-details__short-description
  const shortDesc = html.match(
    /class=["'][^"']*woocommerce-product-details__short-description[^"']*["'][\s\S]{0,5000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (shortDesc) {
    const desc = stripTags(shortDesc[1]).trim();
    if (desc.length >= 10) return desc;
  }

  // Strategy 4: product description container
  const productDesc = html.match(
    /class=["'][^"']*product-description[^"']*["'][\s\S]{0,8000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (productDesc) {
    const desc = stripTags(productDesc[1]).trim();
    if (desc.length >= 20) return desc;
  }

  // Strategy 5: entry content / post content
  const entryContent = html.match(
    /class=["'][^"']*entry-content[^"']*["'][\s\S]{0,8000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (entryContent) {
    const desc = stripTags(entryContent[1]).trim();
    if (desc.length >= 20) return desc;
  }

  // Strategy 6: Astra theme description
  const astraDesc = html.match(
    /class=["'][^"']*ast-excerpt[^"']*["'][\s\S]{0,5000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (astraDesc) {
    const desc = stripTags(astraDesc[1]).trim();
    if (desc.length >= 20) return desc;
  }

  // Strategy 7: Elementor description
  const elementorDesc = html.match(
    /class=["'][^"']*elementor-widget-woocommerce-product-content[^"']*["'][\s\S]{0,8000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (elementorDesc) {
    const desc = stripTags(elementorDesc[1]).trim();
    if (desc.length >= 20) return desc;
  }

  // Strategy 8: Divi description
  const diviDesc = html.match(
    /class=["'][^"']*et_pb_wc_description[^"']*["'][\s\S]{0,8000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (diviDesc) {
    const desc = stripTags(diviDesc[1]).trim();
    if (desc.length >= 20) return desc;
  }

  // Strategy 9: meta description
  const metaDesc = extractMetaContent(html, "name", "description");
  if (metaDesc && metaDesc.length >= 20) return metaDesc;

  // Strategy 10: og:description
  const ogDesc = extractMetaContent(html, "property", "og:description");
  if (ogDesc && ogDesc.length >= 20) return ogDesc;

  return "";
}

/**
 * Extract short description from WooCommerce HTML.
 */
function extractWooCommerceShortDescription(html: string): string {
  const shortDesc = html.match(
    /class=["'][^"']*woocommerce-product-details__short-description[^"']*["'][\s\S]{0,3000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (shortDesc) {
    const desc = stripTags(shortDesc[1]).trim();
    if (desc.length >= 10) return desc;
  }

  const excerptMatch = html.match(
    /class=["'][^"']*product-excerpt[^"']*["'][\s\S]{0,2000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (excerptMatch) {
    const desc = stripTags(excerptMatch[1]).trim();
    if (desc.length >= 10) return desc;
  }

  return "";
}

/**
 * Extract product specifications/attributes from WooCommerce HTML.
 * Phase 1: Added cleaning for test artifacts.
 */
function extractWooCommerceSpecifications(html: string, productJsonLd: any | null): Record<string, string> {
  const specs: Record<string, string> = {};

  // Strategy 1: JSON-LD properties
  const properties = productJsonLd?.["@graph"]?.find((g: any) => g?.["@type"] === "PropertyValue") ||
                     productJsonLd?.additionalProperty;
  if (properties) {
    const propArray = Array.isArray(properties) ? properties : [properties];
    for (const prop of propArray) {
      const name = normalizeText(prop?.name || "");
      const value = normalizeText(prop?.value || "");
      if (name && value) specs[name] = value;
    }
  }

  // Strategy 2: WooCommerce product attributes table
  const attrTable = html.match(
    /class=["'][^"']*woocommerce-product-attributes[^"']*["'][\s\S]{0,8000}?>([\s\S]*?)<\/table>/i
  );
  if (attrTable) {
    const rows = Array.from(attrTable[1].matchAll(/<tr[^>]*>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi));
    for (const row of rows) {
      const key = stripTags(row[1]).trim();
      const value = stripTags(row[2]).trim();
      if (key && value) specs[key] = value;
    }
  }

  // Strategy 3: Additional information tab
  const addInfo = html.match(
    /id=["']tab-additional_information["'][\s\S]{0,8000}?>([\s\S]*?)<\/div>/i
  );
  if (addInfo) {
    const rows = Array.from(addInfo[1].matchAll(/<tr[^>]*>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi));
    for (const row of rows) {
      const key = stripTags(row[1]).trim();
      const value = stripTags(row[2]).trim();
      if (key && value) specs[key] = value;
    }
  }

  // Strategy 4: product attributes list
  const attrList = html.match(
    /class=["'][^"']*product-attributes[^"']*["'][\s\S]{0,5000}?>([\s\S]*?)<\/ul>/i
  );
  if (attrList) {
    const items = Array.from(attrList[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
    for (const item of items) {
      const content = stripTags(item[1]);
      const parts = content.split(/[:：]/);
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join(":").trim();
        if (key && value) specs[key] = value;
      }
    }
  }

  // Clean up any unwanted text fragments from specifications
  const cleanedSpecs: Record<string, string> = {};
  for (const [key, value] of Object.entries(specs)) {
    // Remove "Simple Debugging", "Product Sale!", "Original price", and similar test artifacts
    const cleaned = value
      .replace(/Simple Debugging/gi, "")
      .replace(/Product Sale![^.]*\./gi, "")
      .replace(/Original price[^.]*\./gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned) {
      cleanedSpecs[key] = cleaned;
    }
  }
  return cleanedSpecs;
}

/**
 * Extract product categories from WooCommerce HTML.
 */
function extractWooCommerceCategories(html: string): string[] {
  const categories: string[] = [];

  // Strategy 1: posted_in links (standard WooCommerce)
  const postedIn = html.match(/class=["'][^"']*posted_in[^"']*["'][\s\S]{0,1000}?>([\s\S]*?)<\/span>/i);
  if (postedIn) {
    const catLinks = Array.from(postedIn[1].matchAll(/>([^<]+)<\/a>/gi));
    catLinks.forEach((m) => {
      const cat = stripTags(m[1]).trim();
      if (cat && cat.length > 1) categories.push(cat);
    });
  }

  // Strategy 2: product category links
  const catMatches = Array.from(
    html.matchAll(/class=["'][^"']*product_cat[^"']*["'][^>]*>([^<]+)<\/a>/gi)
  );
  catMatches.forEach((m) => {
    const cat = stripTags(m[1]).trim();
    if (cat && cat.length > 1 && !categories.includes(cat)) categories.push(cat);
  });

  // Strategy 3: breadcrumb categories
  const breadcrumb = html.match(/class=["'][^"']*breadcrumb[^"']*["'][\s\S]{0,2000}?>([\s\S]*?)<\/[^>]+>/i);
  if (breadcrumb) {
    const items = Array.from(breadcrumb[1].matchAll(/>([^<]+)<\/a>/gi));
    items.forEach((m) => {
      const cat = stripTags(m[1]).trim();
      if (cat && cat.length > 1 && !categories.includes(cat)) categories.push(cat);
    });
  }

  return categories;
}

/**
 * Extract brand/vendor from WooCommerce HTML, filtering out technical/plugin names.
 * Phase 2: Added filtering for klaviyo_reviews_exclude and similar.
 */
function extractWooCommerceVendor(html: string, productJsonLd: any | null): string {
  // Strategy 1: JSON-LD brand (filter excluded)
  const brand = productJsonLd?.brand;
  if (brand) {
    const name = typeof brand === "string" ? brand : brand?.name || "";
    if (name && name.length >= 2 && !isExcludedVendorName(name)) return name;
  }

  // Strategy 2: JSON-LD manufacturer (filter excluded)
  const manufacturer = productJsonLd?.manufacturer;
  if (manufacturer) {
    const name = typeof manufacturer === "string" ? manufacturer : manufacturer?.name || "";
    if (name && name.length >= 2 && !isExcludedVendorName(name)) return name;
  }

  // Strategy 3: Store/site name from meta (most reliable for real store names)
  const siteName = extractMetaContent(html, "property", "og:site_name");
  if (siteName && siteName.length >= 2 && !isExcludedVendorName(siteName)) return siteName;

  // Strategy 4: Store name from header
  const storeMatch = html.match(/class=["'][^"']*site-title[^"']*["'][^>]*>([^<]+)<\/[^>]+>/i);
  if (storeMatch?.[1]) {
    const name = stripTags(storeMatch[1]).trim();
    if (name && name.length >= 2 && !isExcludedVendorName(name)) return name;
  }

  // Strategy 5: Shop name
  const shopMatch = html.match(/class=["'][^"']*shop-name[^"']*["'][^>]*>([^<]+)<\/[^>]+>/i);
  if (shopMatch?.[1]) {
    const name = stripTags(shopMatch[1]).trim();
    if (name && name.length >= 2 && !isExcludedVendorName(name)) return name;
  }

  // Strategy 6: Fallback to domain (but clean it up)
  const domainMatch = html.match(/<link[^>]+rel=["'](?:canonical|home)["'][^>]+href=["']https?:\/\/([^\/]+)/i);
  if (domainMatch?.[1]) {
    const domain = domainMatch[1].replace(/^www\./, "").split(".")[0];
    if (domain && domain.length >= 2 && !isExcludedVendorName(domain)) return domain;
  }

  return "";
}

/**
 * Extract SKU from WooCommerce HTML.
 */
function extractWooCommerceSku(html: string, productJsonLd: any | null): string | undefined {
  // Strategy 1: JSON-LD sku
  const jsonLdSku = normalizeText(productJsonLd?.sku || "");
  if (jsonLdSku) return jsonLdSku;

  // Strategy 2: WooCommerce SKU class
  const skuMatch = html.match(/class=["'][^"']*sku[^"']*["'][^>]*>([^<]+)<\/[^>]+>/i);
  if (skuMatch?.[1]) {
    const sku = stripTags(skuMatch[1]).trim();
    if (sku) return sku;
  }

  // Strategy 3: product SKU container
  const productSku = html.match(/class=["'][^"']*product-sku[^"']*["'][^>]*>([^<]+)<\/[^>]+>/i);
  if (productSku?.[1]) {
    const sku = stripTags(productSku[1]).trim();
    if (sku) return sku;
  }

  return undefined;
}

/**
 * Extract product variants from WooCommerce HTML.
 * Phase 1+2: Improved variant name extraction from attributes, swatches, and selects.
 */
function extractWooCommerceVariants(html: string, basePrice: number): ProductVariant[] {
  const variants: ProductVariant[] = [];

  // Helper to add variant (avoid duplicates)
  const addVariant = (title: string, price: number, sku?: string) => {
    if (!title || title.trim() === "") return;
    const normalizedTitle = title.trim();
    // Skip "Choose an option" etc.
    if (/choose|select|—/.test(normalizedTitle.toLowerCase())) return;
    // Check for duplicate by title (simple dedupe)
    if (variants.some(v => v.title === normalizedTitle)) return;
    variants.push({
      id: sku || `wc-var-${variants.length}`,
      title: normalizedTitle,
      price: (!isNaN(price) && price > 0 ? price : basePrice).toFixed(2),
      sku: sku || undefined,
    });
  };

  // Strategy 1: JSON-LD hasVariant
  const hasVariant = (html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [])
    .map((block) => {
      try {
        return JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi, ""));
      } catch { return null; }
    })
    .find((json) => json?.hasVariant || json?.["@graph"]?.some((g: any) => g?.hasVariant));

  if (hasVariant) {
    const variantsData = hasVariant.hasVariant || hasVariant["@graph"]?.find((g: any) => g?.hasVariant)?.hasVariant || [];
    const varArray = Array.isArray(variantsData) ? variantsData : [variantsData];
    for (const v of varArray) {
      const name = normalizeText(v?.name || v?.["@type"] || "");
      const price = normalizePrice(String(v?.offers?.price || ""));
      const sku = normalizeText(v?.sku || "");
      if (name) {
        addVariant(name, price, sku || undefined);
      }
    }
  }

  // Strategy 2: WooCommerce variation form data (data-product_variations)
  const varDataMatch = html.match(/data-product_variations=["']([^"']+)["']/i);
  if (varDataMatch?.[1]) {
    try {
      const varData = JSON.parse(decodeHtmlEntities(varDataMatch[1]).replace(/&quot;/g, '"'));
      if (Array.isArray(varData)) {
        for (const v of varData) {
          // Extract attributes properly - they may be in attributes or variation_attributes
          const attributes = v?.attributes || v?.variation_attributes || {};
          // Get attribute values, ensuring we get the actual option names
          const attrValues = Object.values(attributes)
            .filter((a): a is string => typeof a === "string" && a.length > 0)
            .map(a => decodeHtmlEntities(a));
          const title = attrValues.join(" / ") || v?.name || `Variant ${variants.length + 1}`;
          const price = normalizePrice(String(v?.display_price || v?.price_html || v?.price || ""));
          const sku = normalizeText(v?.sku || "");
          addVariant(title, price, sku || undefined);
        }
      }
    } catch (err) {
      console.warn(`[WooCommerceExtractor] Failed to parse data-product_variations:`, err);
    }
  }

  // Strategy 3: Swatch variations (buttons, colors, images)
  const swatchMatches = Array.from(
    html.matchAll(/class=["'][^"']*swatch[^"']*["'][^>]*data-value=["']([^"']+)["']/gi)
  );
  if (swatchMatches.length > 0) {
    swatchMatches.forEach((m) => {
      const value = decodeHtmlEntities(m[1]).trim();
      addVariant(value, basePrice);
    });
  }

  // Strategy 4: Select dropdown options (WooCommerce attribute selects)
  const selectMatches = Array.from(
    html.matchAll(/<select[^>]+name=["']attribute[^"']*["'][^>]*>([\s\S]*?)<\/select>/gi)
  );
  for (const select of selectMatches) {
    const options = Array.from(select[1].matchAll(/<option[^>]*value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi));
    for (const opt of options) {
      const value = opt[1].trim();
      const label = opt[2].trim();
      if (value && value !== "" && !label.toLowerCase().includes("choose")) {
        addVariant(label, basePrice);
      }
    }
  }

  // Strategy 5: Fallback – try to extract from simple selectors (e.g., variations without data-product_variations)
  const simpleSelects = Array.from(
    html.matchAll(/<select[^>]+id=["'][^"']*(?:variation|pa_|attribute)[^"']*["'][^>]*>([\s\S]*?)<\/select>/gi)
  );
  for (const select of simpleSelects) {
    const options = Array.from(select[1].matchAll(/<option[^>]*value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi));
    for (const opt of options) {
      const value = opt[1].trim();
      const label = opt[2].trim();
      if (value && value !== "" && !label.toLowerCase().includes("choose")) {
        addVariant(label, basePrice);
      }
    }
  }

  // Strategy 6: Try to extract from radio buttons or checkbox variations (rare)
  const radioMatches = Array.from(
    html.matchAll(/<input[^>]+type=["']radio["'][^>]+value=["']([^"']+)["'][^>]*>/gi)
  );
  const radioLabels = Array.from(
    html.matchAll(/<label[^>]+for=["']([^"']+)["'][^>]*>([^<]+)<\/label>/gi)
  );
  const radioValues = new Set<string>();
  radioMatches.forEach((m) => {
    const val = decodeHtmlEntities(m[1]).trim();
    if (val && !radioValues.has(val)) {
      radioValues.add(val);
      addVariant(val, basePrice);
    }
  });

  // If we still have no variants, create a default one
  return variants.length > 0 ? variants : [{
    id: "wc-default",
    title: "Default",
    price: (basePrice > 0 ? basePrice : 0.00).toFixed(2),
  }];
}

/**
 * Detect anti-bot / challenge pages on WooCommerce sites.
 */
function detectWooCommerceAntiBot(html: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/challenge platform/i, "Cloudflare challenge page detected."],
    [/cf-browser-verification/i, "Cloudflare browser verification detected."],
    [/captcha/i, "Captcha verification page detected."],
    [/robot check/i, "Robot check page detected."],
    [/access denied/i, "Access denied page detected."],
    [/just a moment/i, "Cloudflare \"Just a Moment\" interstitial detected."],
    [/ddos protection/i, "DDoS protection page detected."],
    [/security check/i, "Security check page detected."],
  ];

  for (const [pattern, message] of checks) {
    if (pattern.test(html)) {
      return message;
    }
  }

  return null;
}

// ─── Extractor Class ─────────────────────────────────────────────────────────

export class WooCommerceExtractor extends BaseExtractor {
  providerName = "WooCommerce";

  /**
   * Phase 3: fetchWooCommerceHtml now returns null instead of throwing,
   * allowing API/JSON-LD fallback when HTML fails.
   */
  private async fetchWooCommerceHtml(url: string): Promise<string | null> {
    const headerProfiles = [
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

    let lastHtml = "";
    let lastStatus = 0;

    for (const headers of headerProfiles) {
      try {
        const res = await fetchWithRetry(url, headers);
        lastStatus = res.status;
        if (!res.ok) {
          // If 403, 429, or 503, don't throw, just continue to next profile
          if (res.status === 403 || res.status === 429 || res.status === 503) {
            console.warn(`[WooCommerceExtractor] HTTP ${res.status} from ${url}, trying next profile...`);
            continue;
          }
          continue;
        }

        const html = await res.text();
        lastHtml = html;

        if (!detectWooCommerceAntiBot(html)) {
          return html;
        } else {
          console.warn(`[WooCommerceExtractor] Anti-bot page detected for ${url}`);
          // Continue to next profile
        }
      } catch (error: any) {
        console.warn(`[WooCommerceExtractor] Header profile failed: ${error.message}`);
        // Continue to next profile
      }
    }

    // If we got any HTML (even if protected), return it as a last resort
    if (lastHtml) {
      return lastHtml;
    }

    // If no HTML was fetched, return null
    console.warn(`[WooCommerceExtractor] Failed to fetch HTML from ${url}, lastStatus: ${lastStatus}`);
    return null;
  }

  /**
   * Phase 3: extract() now handles HTML as optional.
   * If HTML fetch fails, it still attempts to extract from Store API and JSON-LD.
   */
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
        console.log(`[WooCommerceExtractor] Deep-crawl offline database hit for: ${matched.product.title}`);
        return matched.product;
      }
      throw new Error(matched.error?.errorMessage || "Simulated extraction failure for test URL.");
    }

    // 2. Fetch and parse live HTML (may return null if failed)
    let html = rawHtml?.trim() || "";
    if (!html) {
      try {
        const fetched = await this.fetchWooCommerceHtml(cleanUrl);
        if (fetched) {
          html = fetched;
        } else {
          console.warn(`[WooCommerceExtractor] No HTML fetched for ${cleanUrl}, will rely on API/JSON-LD.`);
        }
      } catch (err: any) {
        console.warn(`[WooCommerceExtractor] HTML fetch threw: ${err.message}`);
      }
    }

    // 3. Extract JSON-LD (from HTML if available)
    const productJsonLd = html ? findProductJsonLd(html) : null;

    // 4. Try WooCommerce Store API first (Layer 1)
    const domain = new URL(url).hostname.replace(/^www\./, "");
    const productId = extractProductIdFromUrl(url);
    let apiProduct: WooCommerceStoreProduct | null = null;
    if (domain) {
      apiProduct = await fetchWooCommerceStoreAPI(domain, productId || undefined);
      if (apiProduct) {
        console.log(`[WooCommerceExtractor] Successfully fetched product from Store API: ${apiProduct.name}`);
      }
    }

    // 5. Title extraction: API > JSON-LD > HTML with fallbacks
    let title = "";
    if (apiProduct?.name) {
      title = apiProduct.name;
    } else if (productJsonLd?.name) {
      title = normalizeText(productJsonLd.name);
    } else if (html) {
      title = extractWooCommerceTitle(html, productJsonLd);
    }

    // If still no title, try from title tag
    if (!title || title.length < 3) {
      if (html) {
        const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleTag) {
          title = stripTags(titleTag[1]).trim();
          if (title.length >= 3) {
            title = title.replace(/\s*[-|]\s*.*$/i, "").trim();
          }
        }
      }
    }

    // Final fallback: generate from URL
    if (!title || title.length < 3) {
      const urlParts = new URL(url);
      const path = urlParts.pathname;
      const slug = path.split("/").filter(Boolean).pop() || "";
      if (slug) {
        title = slug.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      } else {
        title = `${this.providerName} Product`;
      }
      console.warn(`[WooCommerceExtractor] Using fallback title: "${title}" for ${url}`);
    }

    // 6. Price extraction: API > JSON-LD > HTML
    let priceData: { amount: number; raw: string; currency: string } | null = null;
    let compareAtPrice: number | undefined = undefined;
    
    // Layer 1: Store API
    if (apiProduct) {
      const priceStr = apiProduct.sale_price || apiProduct.price || apiProduct.regular_price;
      if (priceStr) {
        const amount = normalizePrice(priceStr);
        if (!isNaN(amount) && amount > 0) {
          priceData = {
            amount,
            raw: priceStr,
            currency: apiProduct.currency || detectCurrency(priceStr) || "USD",
          };
          if (apiProduct.regular_price && apiProduct.sale_price) {
            const compareAmount = normalizePrice(apiProduct.regular_price);
            if (!isNaN(compareAmount) && compareAmount > amount) {
              compareAtPrice = compareAmount;
            }
          }
        }
      }
    }
    
    // Layer 2: JSON-LD (if API failed)
    if (!priceData && productJsonLd) {
      priceData = extractWooCommercePrice(html || "", productJsonLd);
    }
    
    // Layer 3: HTML Parsing (if JSON-LD failed)
    if (!priceData && html) {
      priceData = extractWooCommercePrice(html, null);
    }
    
    if (!priceData) {
      throw new Error(`WooCommerce extraction failed: missing product price for ${url}.`);
    }

    // If compareAtPrice is still undefined, try HTML extraction
    if (compareAtPrice === undefined && html) {
      compareAtPrice = extractCompareAtPrice(html, productJsonLd);
    }

    // 7. Images extraction: API > JSON-LD > HTML
    let gallery: string[] = [];
    let mainImage = "";
    
    if (apiProduct?.images && apiProduct.images.length > 0) {
      gallery = apiProduct.images.map(img => img.src).filter(Boolean);
      mainImage = gallery[0] || "";
      console.log(`[WooCommerceExtractor] Extracted ${gallery.length} images from Store API`);
    }
    
    if (gallery.length === 0 && html) {
      gallery = extractWooCommerceImages(html, productJsonLd);
      mainImage = gallery[0] || "";
    }
    
    if (gallery.length === 0) {
      console.warn(`[WooCommerceExtractor] No product images found for ${url}, using placeholder.`);
      mainImage = "https://via.placeholder.com/800x800?text=No+Image";
      gallery = [mainImage];
    }

    // 8. Description extraction: API > JSON-LD > HTML
    let description = "";
    
    if (apiProduct) {
      description = apiProduct.description || apiProduct.short_description || "";
      if (description) {
        description = stripTags(description);
        console.log(`[WooCommerceExtractor] Extracted description from Store API (${description.length} chars)`);
      }
    }
    
    if (!description || description.length < 10) {
      if (html) {
        description = extractWooCommerceDescription(html, productJsonLd);
      }
    }
    
    if (!description || description.length < 10) {
      if (apiProduct?.short_description) {
        description = stripTags(apiProduct.short_description);
      } else if (html) {
        const metaDesc = extractMetaContent(html, "name", "description");
        if (metaDesc && metaDesc.length >= 10) description = metaDesc;
      }
    }
    
    if (!description || description.length < 10) {
      description = title;
      console.warn(`[WooCommerceExtractor] Using title as description for ${url}`);
    }

    const shortDescription = html ? extractWooCommerceShortDescription(html) : "";
    
    // 9. Vendor extraction with filtering
    let vendor = "";
    
    if (apiProduct?.categories && apiProduct.categories.length > 0) {
      const catName = apiProduct.categories[0].name;
      if (catName && !isExcludedVendorName(catName)) {
        vendor = catName;
      }
    }
    if (!vendor && apiProduct?.tags && apiProduct.tags.length > 0) {
      const tagName = apiProduct.tags[0].name;
      if (tagName && !isExcludedVendorName(tagName)) {
        vendor = tagName;
      }
    }
    
    if (!vendor && html) {
      vendor = extractWooCommerceVendor(html, productJsonLd);
    }
    
    if (!vendor || isExcludedVendorName(vendor)) {
      const domainName = new URL(url).hostname.replace(/^www\./, "");
      vendor = domainName.split(".")[0] || domainName;
    }

    const sku = html ? extractWooCommerceSku(html, productJsonLd) : undefined;
    const categories = html ? extractWooCommerceCategories(html) : [];
    const specifications = html ? extractWooCommerceSpecifications(html, productJsonLd) : {};
    
    // 10. Variants extraction: API > JSON-LD > HTML
    let variants: ProductVariant[] = [];
    
    if (apiProduct?.variations && apiProduct.variations.length > 0) {
      variants = apiProduct.variations.map((v) => {
        // Extract attribute names from the variation's attributes
        let attrNames = v.attributes.map(a => a.option).filter(Boolean).join(" / ");
        
        if (!attrNames) {
          const varName = (v as any).name || (v as any).title || "";
          if (varName) {
            attrNames = varName;
          } else {
            attrNames = `Variant ${v.id}`;
          }
        }
        
        const price = normalizePrice(v.sale_price || v.price || v.regular_price || "");
        return {
          id: String(v.id),
          title: attrNames,
          price: (!isNaN(price) && price > 0 ? price : priceData.amount).toFixed(2),
          sku: undefined,
        };
      });
      console.log(`[WooCommerceExtractor] Extracted ${variants.length} variants from Store API`);
    }
    
    if (variants.length === 0 && html) {
      variants = extractWooCommerceVariants(html, priceData.amount);
    }

    const product: NormalizedProduct = {
      title,
      description: shortDescription || description,
      images: mainImage,
      gallery,
      variants,
      specifications: {
        ...specifications,
        Platform: "WooCommerce",
        "Source Domain": new URL(url).hostname.replace(/^www\./, ""),
        ...(categories.length > 0 ? { Categories: categories.join(", ") } : {}),
        ...(sku ? { SKU: sku } : {}),
      },
      vendor,
      price: priceData.amount,
      compare_at_price: compareAtPrice,
      currency: priceData.currency,
      availability: true,
    };

    console.log(
      `[WooCommerceExtractor] Successfully parsed WooCommerce product: ${product.title} | ` +
      `Images: ${gallery.length} | Price: ${priceData.amount} ${priceData.currency} | ` +
      `Variants: ${variants.length} | SKU: ${sku || "N/A"}`
    );
    return product;
  }
}
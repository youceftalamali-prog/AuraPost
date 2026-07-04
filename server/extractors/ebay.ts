import { BaseExtractor } from "./base.ts";
import { NormalizedProduct, ProductVariant } from "../../src/types.ts";
import { TEST_DATASET } from "./test-dataset.ts";

// ─── Cloud Run / Network Compatibility ───────────────────────────────────────
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_500;
const BACKOFF_MULTIPLIER = 2.0;
const MAX_BACKOFF_MS = 20_000;
const RANDOM_DELAY_MIN = 500;   // ms
const RANDOM_DELAY_MAX = 2_500; // ms

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function normalizeText(input: unknown): string {
  return decodeHtmlEntities(String(input || "")).replace(/\s+/g, " ").trim();
}

function normalizePrice(input: string): number {
  const match = normalizeText(input).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
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
  if (/\bSGD\b/i.test(value) || value.includes("S\$")) return "SGD";
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

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Rotating Browser Fingerprints ───────────────────────────────────────────

interface BrowserProfile {
  userAgent: string;
  secChUa: string;
  secChUaMobile: string;
  secChUaPlatform: string;
}

const BROWSER_PROFILES: BrowserProfile[] = [
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    secChUa: '"Not-A.Brand";v="99", "Chromium";v="124"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    secChUa: '"Not-A.Brand";v="99", "Chromium";v="125", "Microsoft Edge";v="125"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    secChUa: '"Not-A.Brand";v="99", "Chromium";v="124"',
    secChUaMobile: "?0",
    secChUaPlatform: '"macOS"',
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    secChUa: '"Apple WebKit";v="605.1.15"',
    secChUaMobile: "?0",
    secChUaPlatform: '"macOS"',
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    secChUa: '"Not-A.Brand";v="99"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    secChUa: '"Not-A.Brand";v="99", "Chromium";v="124"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Linux"',
  },
];

const REFERERS = [
  "https://www.google.com/",
  "https://www.bing.com/",
  "https://www.ebay.com/",
  "https://www.ebay.com/sch/i.html",
  "https://shopping.google.com/",
];

const ACCEPT_LANGUAGES = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.9",
  "en-US,en;q=0.8,fr;q=0.7",
];

/**
 * Build randomized headers for each request to avoid fingerprinting.
 */
function buildRandomHeaders(referer?: string): Record<string, string> {
  const profile = BROWSER_PROFILES[randomInt(0, BROWSER_PROFILES.length - 1)];
  const acceptLang = ACCEPT_LANGUAGES[randomInt(0, ACCEPT_LANGUAGES.length - 1)];
  const chosenReferer = referer || REFERERS[randomInt(0, REFERERS.length - 1)];

  return {
    "User-Agent": profile.userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": acceptLang,
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": chosenReferer,
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

// ─── Cookie Jar ────────────────────────────────────────────────────────────

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

  // Add cookies to headers
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

    // Store cookies from response
    cookies.setFromResponse(response);

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
      ) + randomInt(RANDOM_DELAY_MIN, RANDOM_DELAY_MAX);

      console.warn(
        `[EBayExtractor] fetch failed (attempt ${attempt}/${MAX_RETRIES + 1}): ${error.message}. ` +
        `Retrying in ${delay}ms...`
      );
      await sleep(delay);
      return fetchWithRetry(url, headers, cookies, attempt + 1);
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

// ─── eBay-Specific Extraction Functions ──────────────────────────────────────

function extractItemId(url: string): string {
  const patterns = [
    /\/itm\/(\d+)/i,
    /\/item\/(\d+)/i,
    /itm\/(\d{10,})/i,
    /item=(\d+)/i,
    /itm=(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function extractEbayTitle(html: string, productJsonLd: any | null): string {
  const jsonLdTitle = normalizeText(productJsonLd?.name || "");
  if (jsonLdTitle.length >= 3) return jsonLdTitle;

  const itemTitle = extractById(html, "itemTitle");
  if (itemTitle.length >= 3) return itemTitle;

  const xTitle = extractById(html, "x-item-title-label");
  if (xTitle.length >= 3) return xTitle;

  const viTitle = extractById(html, "vi-itmTitle");
  if (viTitle.length >= 3) return viTitle;

  const h1Title = html.match(/<h1[^>]+class=["'][^"']*item-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Title) {
    const title = stripTags(h1Title[1]).trim();
    if (title.length >= 3) return title;
  }

  const h1Product = html.match(/<h1[^>]+class=["'][^"']*product-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Product) {
    const title = stripTags(h1Product[1]).trim();
    if (title.length >= 3) return title;
  }

  const anyH1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (anyH1) {
    const title = stripTags(anyH1[1]).trim();
    if (title.length >= 3) return title;
  }

  const ogTitle = extractMetaContent(html, "property", "og:title");
  if (ogTitle && ogTitle.length >= 3) {
    return ogTitle.replace(/\s*[-|]\s*eBay.*$/i, "").trim();
  }

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag) {
    const title = stripTags(titleTag[1])
      .replace(/\s*[-|]\s*eBay.*$/i, "")
      .trim();
    if (title.length >= 3) return title;
  }

  return "";
}

function extractEbayPrice(html: string, productJsonLd: any | null): {
  amount: number;
  raw: string;
  currency: string;
} | null {
  const offers = productJsonLd?.offers;
  const offerCandidates = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const offer of offerCandidates) {
    const raw = String(offer?.price ?? "").trim();
    const amount = normalizePrice(raw);
    if (raw && !isNaN(amount) && amount > 0) {
      const currency = String(offer?.priceCurrency || detectCurrency(raw)).trim();
      return { amount, raw, currency: currency || "USD" };
    }
  }

  const priceSelectors = [
    "prcIsum",
    "prcIsum_bidPrice",
    "notranslate",
    "x-price-primary",
    "vi-price",
    "itemPrice",
  ];
  for (const id of priceSelectors) {
    const raw = extractById(html, id);
    if (raw) {
      const amount = normalizePrice(raw);
      if (!isNaN(amount) && amount > 0) {
        return { amount, raw, currency: detectCurrency(raw) };
      }
    }
  }

  const priceSpanMatch = html.match(
    /<span[^>]+class=["'][^"']*notranslate[^"']*["'][^>]*>([\s\S]{0,300}?)<\/span>/i
  );
  if (priceSpanMatch) {
    const raw = stripTags(priceSpanMatch[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  const buyNowMatch = html.match(
    /class=["'][^"']*buy-now-price[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (buyNowMatch) {
    const raw = stripTags(buyNowMatch[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  const bidMatch = html.match(
    /class=["'][^"']*current-bid[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (bidMatch) {
    const raw = stripTags(bidMatch[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  const priceSpecMatch = html.match(
    /class=["'][^"']*item-price[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (priceSpecMatch) {
    const raw = stripTags(priceSpecMatch[1]);
    const amount = normalizePrice(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: detectCurrency(raw) };
    }
  }

  const ogPrice = extractMetaContent(html, "property", "og:price:amount");
  if (ogPrice) {
    const amount = normalizePrice(ogPrice);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw: ogPrice, currency: extractMetaContent(html, "property", "og:price:currency") || "USD" };
    }
  }

  const dollarPattern = /\$\s*(\d+(?:\.\d{2})?)/;
  const dollarMatch = html.match(dollarPattern);
  if (dollarMatch) {
    const raw = dollarMatch[1];
    const amount = parseFloat(raw);
    if (!isNaN(amount) && amount > 0) {
      return { amount, raw, currency: "USD" };
    }
  }

  return null;
}

function extractEbayCompareAtPrice(html: string, productJsonLd: any | null): number | undefined {
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

  const msrpMatch = html.match(
    /class=["'][^"']*(?:msrp|original-price|retail-price|was-price)[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (msrpMatch) {
    const amount = normalizePrice(stripTags(msrpMatch[1]));
    if (!isNaN(amount) && amount > 0) return amount;
  }

  const strikeMatch = html.match(
    /<span[^>]+class=["'][^"']*msrp[^"']*["'][^>]*>([\s\S]{0,300}?)<\/span>/i
  );
  if (strikeMatch) {
    const amount = normalizePrice(stripTags(strikeMatch[1]));
    if (!isNaN(amount) && amount > 0) return amount;
  }

  const wasPriceMatch = html.match(
    /class=["'][^"']*(?:was-price|previous-price|list-price)[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (wasPriceMatch) {
    const amount = normalizePrice(stripTags(wasPriceMatch[1]));
    if (!isNaN(amount) && amount > 0) return amount;
  }

  return undefined;
}

function extractEbayImages(html: string, productJsonLd: any | null): string[] {
  const allUrls = new Set<string>();

  if (productJsonLd?.image) {
    const jsonLdImages = Array.isArray(productJsonLd.image)
      ? productJsonLd.image.map((img: unknown) => String(img))
      : [String(productJsonLd.image)];
    jsonLdImages.forEach((img: string) => {
      if (img.startsWith("http")) allUrls.add(img);
    });
  }

  const galleryMatches = Array.from(
    html.matchAll(/class=["'][^"']*vi-image-gallery[^"']*["'][\s\S]{0,8000}?<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)
  );
  galleryMatches.forEach((m) => {
    const url = decodeHtmlEntities(m[1]).trim();
    if (url.startsWith("http")) allUrls.add(url);
  });

  const viGallery = Array.from(
    html.matchAll(/class=["'][^"']*vi-image-gallery__image[^"']*["'][^>]+(?:src|data-src)=["']([^"']+)["']/gi)
  );
  viGallery.forEach((m) => {
    const url = decodeHtmlEntities(m[1]).trim();
    if (url.startsWith("http")) allUrls.add(url);
  });

  const icImgMatches = Array.from(
    html.matchAll(/class=["'][^"']*icImg[^"']*["'][^>]+(?:src|data-src)=["']([^"']+)["']/gi)
  );
  icImgMatches.forEach((m) => {
    const url = decodeHtmlEntities(m[1]).trim();
    if (url.startsWith("http")) allUrls.add(url);
  });

  const mainImageMatch = html.match(
    /id=["']icImg["'][^>]+(?:src|data-src)=["']([^"']+)["']/i
  );
  if (mainImageMatch?.[1]) {
    const url = decodeHtmlEntities(mainImageMatch[1]).trim();
    if (url.startsWith("http")) allUrls.add(url);
  }

  const thumbMatches = Array.from(
    html.matchAll(/class=["'][^"']*vi-image-gallery__thumbnail[^"']*["'][^>]+(?:src|data-src)=["']([^"']+)["']/gi)
  );
  thumbMatches.forEach((m) => {
    const url = decodeHtmlEntities(m[1]).trim();
    if (url.startsWith("http")) allUrls.add(url);
  });

  const lazyMatches = Array.from(
    html.matchAll(/data-src=["'](https?:\/\/[^"']+)["']/gi)
  );
  lazyMatches.forEach((m) => {
    const url = decodeHtmlEntities(m[1]).trim();
    if (url.startsWith("http")) allUrls.add(url);
  });

  const ebayImgMatches = Array.from(
    html.matchAll(/https?:\/\/[^"'\s)]+i\.ebayimg\.com[^"'\s)]+/gi)
  );
  ebayImgMatches.forEach((m) => {
    const url = decodeHtmlEntities(m[0]).trim();
    if (url.startsWith("http")) {
      const hiResUrl = url.replace(/\/s-l\d+\./, "/s-l1600.");
      allUrls.add(hiResUrl);
    }
  });

  const scriptImgMatches = Array.from(
    html.matchAll(/"imageUrl"\s*:\s*"([^"]+)"/gi)
  );
  scriptImgMatches.forEach((m) => {
    const url = decodeHtmlEntities(m[1]).trim();
    if (url.startsWith("http")) allUrls.add(url);
  });

  const ogImage = extractMetaContent(html, "property", "og:image");
  if (ogImage && ogImage.startsWith("http")) allUrls.add(ogImage);

  const twImage = extractMetaContent(html, "name", "twitter:image");
  if (twImage && twImage.startsWith("http")) allUrls.add(twImage);

  const allEbayImages = Array.from(
    html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)
  );
  allEbayImages.forEach((m) => {
    const url = decodeHtmlEntities(m[1]).trim();
    if (url.startsWith("http") && url.includes("ebayimg.com")) {
      const hiResUrl = url.replace(/\/s-l\d+\./, "/s-l1600.");
      allUrls.add(hiResUrl);
    }
  });

  return [...allUrls];
}

function extractEbayDescription(html: string, productJsonLd: any | null): string {
  const jsonLdDesc = normalizeText(productJsonLd?.description || "");
  if (jsonLdDesc.length >= 20) return jsonLdDesc;

  const descContainer = html.match(
    /id=["']desc_wrapper["'][\s\S]{0,15000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (descContainer) {
    const desc = stripTags(descContainer[1]).trim();
    if (desc.length >= 20) return desc;
  }

  const viDesc = html.match(
    /id=["']vi-desc-main["'][\s\S]{0,15000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (viDesc) {
    const desc = stripTags(viDesc[1]).trim();
    if (desc.length >= 20) return desc;
  }

  const itemDesc = html.match(
    /id=["']ItemDescription["'][\s\S]{0,15000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (itemDesc) {
    const desc = stripTags(itemDesc[1]).trim();
    if (desc.length >= 20) return desc;
  }

  const dsDiv = html.match(
    /id=["']ds_div["'][\s\S]{0,15000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (dsDiv) {
    const desc = stripTags(dsDiv[1]).trim();
    if (desc.length >= 20) return desc;
  }

  const descGeneric = html.match(
    /class=["'][^"']*item-description[^"']*["'][\s\S]{0,10000}?>([\s\S]*?)(?:<\/div>|<\/section>)/i
  );
  if (descGeneric) {
    const desc = stripTags(descGeneric[1]).trim();
    if (desc.length >= 20) return desc;
  }

  const metaDesc = extractMetaContent(html, "name", "description");
  if (metaDesc && metaDesc.length >= 20) return metaDesc;

  const ogDesc = extractMetaContent(html, "property", "og:description");
  if (ogDesc && ogDesc.length >= 20) return ogDesc;

  return "";
}

function extractEbaySpecifications(html: string): Record<string, string> {
  const specs: Record<string, string> = {};

  const itemSpecifics = html.match(
    /id=["']viTabs_0_is["'][\s\S]{0,8000}?>([\s\S]*?)<\/div>/i
  );
  if (itemSpecifics) {
    const rows = Array.from(itemSpecifics[1].matchAll(
      /<div[^>]+class=["'][^"']*u-flL[^"']*["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<div[^>]+class=["'][^"']*u-flL[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
    ));
    for (const row of rows) {
      const key = stripTags(row[1]).trim().replace(/:$/, "");
      const value = stripTags(row[2]).trim();
      if (key && value) specs[key] = value;
    }
  }

  const specList = html.match(
    /class=["'][^"']*item-specifics[^"']*["'][\s\S]{0,8000}?>([\s\S]*?)<\/ul>/i
  );
  if (specList) {
    const items = Array.from(specList[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
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

  const specTable = html.match(
    /class=["'][^"']*itemAttr[^"']*["'][\s\S]{0,8000}?>([\s\S]*?)<\/table>/i
  );
  if (specTable) {
    const rows = Array.from(specTable[1].matchAll(
      /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi
    ));
    for (const row of rows) {
      const key = stripTags(row[1]).trim().replace(/:$/, "");
      const value = stripTags(row[2]).trim();
      if (key && value) specs[key] = value;
    }
  }

  const aboutMatch = html.match(
    /class=["'][^"']*about-this-item[^"']*["'][\s\S]{0,5000}?>([\s\S]*?)<\/div>/i
  );
  if (aboutMatch) {
    const items = Array.from(aboutMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
    for (const item of items) {
      const content = stripTags(item[1]).trim();
      if (content) {
        specs[`Detail ${Object.keys(specs).length + 1}`] = content;
      }
    }
  }

  return specs;
}

function extractEbaySeller(html: string, productJsonLd: any | null): string {
  const seller = productJsonLd?.offers?.seller || productJsonLd?.offers?.[0]?.seller;
  if (seller) {
    const name = typeof seller === "string" ? seller : seller?.name || "";
    if (name && name.length >= 2) return name;
  }

  const sellerMatch = html.match(
    /class=["'][^"']*seller-info[^"']*["'][\s\S]{0,500}?>([\s\S]*?)<\/[^>]+>/i
  );
  if (sellerMatch) {
    const name = stripTags(sellerMatch[1]).trim();
    if (name.length >= 2) return name;
  }

  const xSeller = extractById(html, "x-seller");
  if (xSeller.length >= 2) return xSeller;

  const sellerLink = html.match(
    /class=["'][^"']*seller-name[^"']*["'][^>]*>([^<]+)<\/[^>]+>/i
  );
  if (sellerLink?.[1]) {
    const name = stripTags(sellerLink[1]).trim();
    if (name.length >= 2) return name;
  }

  const memberMatch = html.match(
    /class=["'][^"']*member-id[^"']*["'][^>]*>([^<]+)<\/[^>]+>/i
  );
  if (memberMatch?.[1]) {
    const name = stripTags(memberMatch[1]).trim();
    if (name.length >= 2) return name;
  }

  const storeMatch = html.match(
    /class=["'][^"']*store-name[^"']*["'][^>]*>([^<]+)<\/[^>]+>/i
  );
  if (storeMatch?.[1]) {
    const name = stripTags(storeMatch[1]).trim();
    if (name.length >= 2) return name;
  }

  const topRated = html.match(
    /class=["'][^"']*top-rated[^"']*["'][\s\S]{0,500}?>([^<]+)<\/[^>]+>/i
  );
  if (topRated?.[1]) {
    const name = stripTags(topRated[1]).trim();
    if (name.length >= 2) return name;
  }

  return "eBay Seller";
}

function extractEbayCondition(html: string): string {
  const condMatch = html.match(
    /class=["'][^"']*item-condition[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (condMatch) {
    const condition = stripTags(condMatch[1]).trim();
    if (condition) return condition;
  }

  const condId = html.match(
    /id=["']vi-itm-cond["'][^>]*>([\s\S]*?)<\/[^>]+>/i
  );
  if (condId) {
    const condition = stripTags(condId[1]).trim();
    if (condition) return condition;
  }

  const condText = html.match(
    /class=["'][^"']*condition[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (condText) {
    const condition = stripTags(condText[1]).trim();
    if (condition) return condition;
  }

  const badgeMatch = html.match(
    /class=["'][^"']*(?:new|used|pre-owned|refurbished)[^"']*["'][^>]*>([\s\S]{0,200}?)<\/[^>]+>/i
  );
  if (badgeMatch) {
    const condition = stripTags(badgeMatch[1]).trim();
    if (condition) return condition;
  }

  return "Not Specified";
}

function extractEbaySku(html: string, productJsonLd: any | null, url: string): string | undefined {
  const itemId = extractItemId(url);
  if (itemId) return itemId;

  const jsonLdSku = normalizeText(productJsonLd?.sku || "");
  if (jsonLdSku) return jsonLdSku;

  const itemNumMatch = html.match(
    /class=["'][^"']*item-number[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (itemNumMatch) {
    const sku = stripTags(itemNumMatch[1]).replace(/item number:?/i, "").trim();
    if (sku) return sku;
  }

  const productIdMatch = html.match(
    /class=["'][^"']*product-id[^"']*["'][^>]*>([\s\S]{0,300}?)<\/[^>]+>/i
  );
  if (productIdMatch) {
    const sku = stripTags(productIdMatch[1]).trim();
    if (sku) return sku;
  }

  return undefined;
}

function extractEbayVariants(html: string, basePrice: number): ProductVariant[] {
  const variants: ProductVariant[] = [];

  // Strategy 1: eBay MSKU embedded JSON (most reliable for variant listings)
  const mskuMatch = html.match(/"MSKU":({.+?}),"QUANTITY"/);
  if (mskuMatch?.[1]) {
    try {
      const mskuData = parseJsonSafe<any>(mskuMatch[1]);
      if (mskuData) {
        const variations = mskuData.variationsMap || {};
        const menuItems = mskuData.menuItemMap || {};
        const combinations = mskuData.variationCombinations || {};
        const selectMenus = mskuData.selectMenus || [];

        for (const [comboKey, comboDataId] of Object.entries(combinations)) {
          const variationData = variations[String(comboDataId)];
          if (!variationData) continue;

          const menuIds = comboKey.split("_").map(Number);
          const variantAttrs: Record<string, string> = {};

          for (const menuId of menuIds) {
            const menuItem = menuItems[String(menuId)];
            if (menuItem) {
              for (const menu of selectMenus) {
                if (menu.menuItemValueIds?.includes(menuItem.valueId)) {
                  variantAttrs[menu.displayLabel] = menuItem.displayName;
                  break;
                }
              }
            }
          }

          const priceSpans = variationData?.binModel?.price?.textSpans || [];
          const priceText = priceSpans[0]?.text || "";
          const price = normalizePrice(priceText);
          const outOfStock = variationData?.quantity?.outOfStock || false;

          const title = Object.values(variantAttrs).join(" / ") || `Variant ${variants.length + 1}`;

          variants.push({
            id: String(comboDataId),
            title,
            price: (!isNaN(price) && price > 0 ? price : basePrice).toFixed(2),
            inventory: outOfStock ? 0 : undefined,
          });
        }

        console.log(`[EBayExtractor] Extracted ${variants.length} variants from MSKU data`);
      }
    } catch (err: any) {
      console.warn(`[EBayExtractor] MSKU parse failed: ${err.message}`);
    }
  }

  // Strategy 2: data-variations attribute
  if (variants.length === 0) {
    const varFormMatch = html.match(/data-variations=["']([^"']+)["']/i);
    if (varFormMatch?.[1]) {
      try {
        const varData = JSON.parse(decodeHtmlEntities(varFormMatch[1]).replace(/&quot;/g, '"'));
        if (Array.isArray(varData)) {
          for (const v of varData) {
            const title = normalizeText(v?.name || v?.title || "");
            const price = normalizePrice(String(v?.price || ""));
            const sku = normalizeText(v?.sku || "");
            if (title) {
              variants.push({
                id: sku || `ebay-var-${variants.length}`,
                title,
                price: (!isNaN(price) && price > 0 ? price : basePrice).toFixed(2),
                sku: sku || undefined,
              });
            }
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // Strategy 3: Select dropdown variations
  if (variants.length === 0) {
    const selectMatches = Array.from(
      html.matchAll(/<select[^>]+name=["'][^"']*variation[^"']*["'][^>]*>([\s\S]*?)<\/select>/gi)
    );
    for (const select of selectMatches) {
      const options = Array.from(select[1].matchAll(/<option[^>]*value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi));
      for (const opt of options) {
        const value = opt[1].trim();
        const label = opt[2].trim();
        if (value && value !== "" && !label.toLowerCase().includes("select")) {
          variants.push({
            id: `ebay-opt-${variants.length}`,
            title: label,
            price: basePrice.toFixed(2),
          });
        }
      }
    }
  }

  // Strategy 4: eBay variation swatches
  if (variants.length === 0) {
    const swatchMatches = Array.from(
      html.matchAll(/class=["'][^"']*variation[^"']*["'][^>]*data-value=["']([^"']+)["']/gi)
    );
    swatchMatches.forEach((m, idx) => {
      const value = decodeHtmlEntities(m[1]).trim();
      if (value) {
        variants.push({
          id: `ebay-swatch-${idx}`,
          title: value,
          price: basePrice.toFixed(2),
        });
      }
    });
  }

  return variants.length > 0 ? variants : [{
    id: "ebay-default",
    title: "Default",
    price: basePrice.toFixed(2),
  }];
}

/**
 * Extract eBay embedded JSON data (hidden web data) from HTML scripts.
 * eBay stores product data in various script variables.
 */
function extractEbayEmbeddedJson(html: string): any | null {
  // Strategy 1: MSKU data (multi-SKU / variant data)
  const mskuMatch = html.match(/"MSKU":({.+?}),"QUANTITY"/);
  if (mskuMatch?.[1]) {
    try {
      return parseJsonSafe(mskuMatch[1]);
    } catch {
      // Continue
    }
  }

  // Strategy 2: o18 data (eBay page data object)
  const o18Match = html.match(/window\.__o18__\s*=\s*({[\s\S]*?});/);
  if (o18Match?.[1]) {
    try {
      return parseJsonSafe(o18Match[1]);
    } catch {
      // Continue
    }
  }

  // Strategy 3: item data
  const itemDataMatch = html.match(/window\.itemData\s*=\s*({[\s\S]*?});/);
  if (itemDataMatch?.[1]) {
    try {
      return parseJsonSafe(itemDataMatch[1]);
    } catch {
      // Continue
    }
  }

  // Strategy 4: product data
  const productDataMatch = html.match(/window\.productData\s*=\s*({[\s\S]*?});/);
  if (productDataMatch?.[1]) {
    try {
      return parseJsonSafe(productDataMatch[1]);
    } catch {
      // Continue
    }
  }

  return null;
}

function detectEbayAntiBot(html: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/captcha/i, "eBay captcha verification page detected."],
    [/robot check/i, "eBay robot check page detected."],
    [/verify you are human/i, "eBay human verification page detected."],
    [/access denied/i, "eBay access denied page detected."],
    [/security check/i, "eBay security check page detected."],
    [/blocked/i, "eBay blocked access page detected."],
    [/unusual activity/i, "eBay unusual activity detection page."],
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

// ─── Extractor Class ─────────────────────────────────────────────────────────

export class EBayExtractor extends BaseExtractor {
  providerName = "eBay";
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
        console.log(`[EBayExtractor] Deep-crawl offline database hit for: ${matched.product.title}`);
        return matched.product;
      }
      throw new Error(matched.error?.errorMessage || "Simulated extraction failure for test URL.");
    }

    // 2. Bootstrap: fetch eBay homepage to get cookies (anti-bot bypass)
    if (!this.homepageBootstrapped) {
      try {
        console.log(`[EBayExtractor] Bootstrapping eBay homepage cookies...`);
        const homeHeaders = buildRandomHeaders("https://www.google.com/");
        const homeRes = await fetchWithRetry("https://www.ebay.com/", homeHeaders, this.cookieJar);
        if (homeRes.ok) {
          console.log(`[EBayExtractor] Homepage bootstrap successful, cookies stored: ${this.cookieJar.getJar().size}`);
          this.homepageBootstrapped = true;
          // Random delay after homepage to appear human
          await sleep(randomInt(1_000, 3_000));
        }
      } catch (err: any) {
        console.warn(`[EBayExtractor] Homepage bootstrap failed (non-fatal): ${err.message}`);
      }
    }

    // 3. Fetch and parse live HTML with anti-bot bypass
    let html = rawHtml?.trim() || "";
    let itemId = extractItemId(cleanUrl);

    if (!html) {
      try {
        console.log(`[EBayExtractor] Fetching product page: ${cleanUrl}`);
        html = await this.fetchEbayPage(cleanUrl);
      } catch (err: any) {
        console.warn(`[EBayExtractor] Primary fetch failed: ${err.message}`);

        // Retry with alternate URL format if 403
        if (itemId && err.message?.includes("403")) {
          const altUrl = `https://www.ebay.com/itm/${itemId}?_trksid=p2380057.m570.l6004`;
          console.log(`[EBayExtractor] Retrying with alternate URL format: ${altUrl}`);
          try {
            html = await this.fetchEbayPage(altUrl);
          } catch (altErr: any) {
            console.warn(`[EBayExtractor] Alternate URL also failed: ${altErr.message}`);
          }
        }
      }
    }

    if (!html) {
      throw new Error(`eBay extraction failed: could not fetch product page for ${url}.`);
    }

    const antiBotError = detectEbayAntiBot(html);
    if (antiBotError) {
      throw new Error(antiBotError);
    }

    // 4. Extract JSON-LD first
    const productJsonLd = findProductJsonLd(html);

    // 5. Try embedded JSON data (eBay hidden web data)
    const embeddedJson = extractEbayEmbeddedJson(html);
    if (embeddedJson) {
      console.log(`[EBayExtractor] Found embedded eBay JSON data`);
    }

    // 6. Extract all product fields
    const title = extractEbayTitle(html, productJsonLd);
    if (!title || title.length < 3) {
      throw new Error(`eBay extraction failed: missing product title for ${url}.`);
    }

    const gallery = extractEbayImages(html, productJsonLd);
    if (gallery.length === 0) {
      throw new Error(`eBay extraction failed: missing product images for ${url}.`);
    }

    const priceData = extractEbayPrice(html, productJsonLd);
    if (!priceData) {
      throw new Error(`eBay extraction failed: missing product price for ${url}.`);
    }

    const compareAtPrice = extractEbayCompareAtPrice(html, productJsonLd);
    const description = extractEbayDescription(html, productJsonLd);
    if (!description || description.length < 10) {
      throw new Error(`eBay extraction failed: missing product description for ${url}.`);
    }

    const vendor = extractEbaySeller(html, productJsonLd);
    const condition = extractEbayCondition(html);
    const sku = extractEbaySku(html, productJsonLd, url);
    const specifications = extractEbaySpecifications(html);
    const variants = extractEbayVariants(html, priceData.amount);
    itemId = extractItemId(url);

    const product: NormalizedProduct = {
      title,
      description,
      images: gallery[0],
      gallery,
      variants,
      specifications: {
        ...specifications,
        Platform: "eBay",
        "Source Domain": new URL(url).hostname.replace(/^www\./, ""),
        Condition: condition,
        ...(sku ? { "Item ID": sku } : {}),
        ...(itemId && !sku ? { "Item ID": itemId } : {}),
      },
      vendor,
      price: priceData.amount,
      compare_at_price: compareAtPrice,
      currency: priceData.currency,
      availability: true,
    };

    console.log(
      `[EBayExtractor] Successfully parsed eBay product: ${product.title} | ` +
      `Images: ${gallery.length} | Price: ${priceData.amount} ${priceData.currency} | ` +
      `Condition: ${condition} | Item ID: ${sku || itemId || "N/A"} | ` +
      `Variants: ${variants.length} | Cookies: ${this.cookieJar.getJar().size}`
    );
    return product;
  }

  /**
   * Fetch eBay page with rotating headers, cookies, and anti-bot bypass.
   */
  private async fetchEbayPage(url: string): Promise<string> {
    let lastHtml = "";
    let lastStatus = 0;

    // Try multiple header profiles with rotated fingerprints
    for (let i = 0; i < 3; i++) {
      try {
        const headers = buildRandomHeaders();
        console.log(`[EBayExtractor] Fetch attempt ${i + 1} with UA: ${headers["User-Agent"].slice(0, 60)}...`);

        const res = await fetchWithRetry(url, headers, this.cookieJar);
        lastStatus = res.status;

        if (!res.ok) {
          console.warn(`[EBayExtractor] HTTP ${res.status} from eBay`);
          if (res.status === 403) {
            // Add randomized delay before retry
            const delay = randomInt(2_000, 5_000);
            console.log(`[EBayExtractor] 403 detected, waiting ${delay}ms before retry...`);
            await sleep(delay);
            continue;
          }
          continue;
        }

        const html = await res.text();
        lastHtml = html;

        const antiBotError = detectEbayAntiBot(html);
        if (antiBotError) {
          console.warn(`[EBayExtractor] Anti-bot detected: ${antiBotError}`);
          const delay = randomInt(2_000, 5_000);
          await sleep(delay);
          continue;
        }

        return html;
      } catch (error: any) {
        console.warn(`[EBayExtractor] Fetch attempt ${i + 1} failed: ${error.message}`);
        const delay = randomInt(1_500, 4_000);
        await sleep(delay);
      }
    }

    if (lastHtml) {
      return lastHtml;
    }

    throw new Error(`eBay extraction failed: received HTTP ${lastStatus || "unknown"} from the live store page.`);
  }
}

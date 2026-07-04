import crypto from "node:crypto";
import { BaseExtractor } from "./base.ts";
import { NormalizedProduct, ProductVariant } from "../../src/types.ts";
import { TEST_DATASET } from "./test-dataset.ts";

// ─── Constants ──────────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const BACKOFF_MULTIPLIER = 2.0;
const MAX_BACKOFF_MS = 15_000;
const RANDOM_JITTER_MIN = 300;
const RANDOM_JITTER_MAX = 1_500;
const PLACEHOLDER_IMAGE = "https://via.placeholder.com/1200x1200?text=AliExpress+Product";

// ─── Helpers ────────────────────────────────────────────────────────────────

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
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
  if (!input) return "";
  return decodeHtmlEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJsonParse<T = unknown>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function normalizeImageUrl(input: string): string {
  if (!input) return "";
  const value = decodeHtmlEntities(String(input)).trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function normalizeText(input: unknown): string {
  if (input == null) return "";
  return decodeHtmlEntities(String(input)).replace(/\s+/g, " ").trim();
}

function normalizePrice(input: string): number {
  const cleaned = normalizeText(input).replace(/,/g, "").replace(/[^\d.]/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : NaN;
}

function detectCurrency(input: string): string {
  const value = normalizeText(input);
  if (/\bUSD\b/i.test(value) || /^\$/.test(value) || /\$\s*\d/.test(value)) return "USD";
  if (/\bEUR\b/i.test(value) || value.includes("€")) return "EUR";
  if (/\bGBP\b/i.test(value) || value.includes("£")) return "GBP";
  if (/\bCNY\b/i.test(value) || /\bRMB\b/i.test(value) || value.includes("¥")) return "CNY";
  if (/\bJPY\b/i.test(value)) return "JPY";
  if (/\bMYR\b/i.test(value) || value.includes("RM")) return "MYR";
  return "USD";
}

function cleanupTitle(input: string): string {
  return normalizeText(input)
    .replace(/\s*[-|]\s*AliExpress.*$/i, "")
    .replace(/\s*[-|]\s*Aliexpress.*$/i, "")
    .trim();
}

function extractProductId(url: string): string {
  const cleanUrl = url.split("?")[0].split("#")[0];
  // Support multiple AliExpress URL formats
  const patterns = [
    /\/item\/(\d+)\.html/i,
    /\/i\/(\d+)/i,
    /\/product\/(\d+)/i,
    /\/p\/(\d+)/i,
    /\/(\d{8,})(?:\.html|\/|$)/i,
  ];
  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function parseJsonpPayload<T = unknown>(input: string): T | null {
  const start = input.indexOf("(");
  const end = input.lastIndexOf(")");
  if (start === -1 || end === -1 || end <= start) {
    return safeJsonParse<T>(input);
  }
  return safeJsonParse<T>(input.slice(start + 1, end));
}

function flattenPreContent(preContent: unknown): string {
  if (!preContent || typeof preContent !== "object") return "";
  const dataList = (preContent as any).dataList;
  if (!Array.isArray(dataList)) return "";
  return dataList
    .map((entry: any) => {
      const data = entry?.data || {};
      return [
        data.title,
        data.description,
        data.desc,
        data.value,
      ]
        .map((v) => normalizeText(v))
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join(" ");
}

function extractMetaContent(html: string, key: string): string {
  if (!html) return "";
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escapedKey}["'][^>]+content=["']([^"']+)`,
    "i"
  );
  const match = html.match(pattern);
  return match ? normalizeText(match[1]) : "";
}

function detectAliExpressAntiBot(html: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/captcha/i, "AliExpress captcha verification page detected."],
    [/robot check/i, "AliExpress robot check page detected."],
    [/security verification/i, "AliExpress security verification page detected."],
    [/access denied/i, "AliExpress access denied page detected."],
    [/challenge platform/i, "Cloudflare challenge page detected."],
    [/cf-browser-verification/i, "Cloudflare browser verification detected."],
    [/just a moment/i, "Cloudflare \"Just a Moment\" interstitial detected."],
    [/bot detection/i, "AliExpress bot detection triggered."],
    [/slide to verify/i, "AliExpress slide verification detected."],
    [/verify you are human/i, "AliExpress human verification page detected."],
  ];
  for (const [pattern, message] of checks) {
    if (pattern.test(html)) {
      return message;
    }
  }
  return null;
}

function detectAliExpressPageError(html: string, title: string): string | null {
  const content = `${title}\n${html}`.toLowerCase();
  if (content.includes("sorry, the page you requested can not be found")) {
    return "AliExpress product page returned a not found screen.";
  }
  if (content.includes("punish") || content.includes("captcha") || content.includes("robot")) {
    return "AliExpress anti-bot or verification page detected.";
  }
  return null;
}

// ─── Price Helpers ─────────────────────────────────────────────────────────

function getAliSelectedSkuId(result: any): string {
  return String(
    result?.SKU?.selectedSkuIdStr ||
    result?.SKU?.selectedSkuId ||
    result?.PRICE?.selectedSkuId ||
    ""
  ).trim();
}

function getAliSelectedPriceInfo(result: any): any {
  const selectedSkuId = getAliSelectedSkuId(result);
  if (!selectedSkuId) {
    return result?.PRICE?.targetSkuPriceInfo || {};
  }
  return (
    result?.PRICE?.skuIdStrPriceInfoMap?.[selectedSkuId] ||
    result?.PRICE?.skuPriceInfoMap?.[selectedSkuId] ||
    result?.PRICE?.skuPriceInfoMap?.[String(selectedSkuId)] ||
    result?.PRICE?.targetSkuPriceInfo ||
    {}
  );
}

function shouldPreferRegularPrice(result: any, selectedPriceInfo: any, salePrice: number, regularPrice: number): boolean {
  const promotionInfo = safeJsonParse(
    result?.GLOBAL_DATA?.globalData?.curPagePriceInfo?.promotionInfo || "{}"
  ) || {};
  const hasNewUserPromotion =
    result?.PERSONAL_INFORMATION_SECURITY?.features?.newUser === true ||
    Object.keys(promotionInfo).some((key) => /new.?user/i.test(key)) ||
    /new.?user/i.test(normalizeText(JSON.stringify(promotionInfo)));
  if (!hasNewUserPromotion) return false;
  if (isNaN(salePrice) || isNaN(regularPrice)) return false;
  if (salePrice <= 0.99) return true;
  return salePrice <= regularPrice * 0.35;
}

function resolveAliPrice(result: any, pageHtml: string): {
  price: number;
  compareAtPrice?: number;
  currency: string;
} {
  const selectedPriceInfo = getAliSelectedPriceInfo(result);
  const targetPriceInfo = result?.PRICE?.targetSkuPriceInfo || {};
  const firstPriceInfo = Object.values(
    result?.PRICE?.skuIdStrPriceInfoMap || result?.PRICE?.skuPriceInfoMap || {}
  )[0] as any;

  const selectedSalePriceText = normalizeText(
    selectedPriceInfo?.salePriceString ||
    selectedPriceInfo?.salePriceLocal ||
    selectedPriceInfo?.activityAmount?.formatedAmount ||
    selectedPriceInfo?.skuActivityAmount?.formatedAmount ||
    ""
  );
  const selectedRegularPriceText = normalizeText(
    selectedPriceInfo?.originalPrice?.formatedAmount || ""
  );
  const targetSalePriceText = normalizeText(
    targetPriceInfo?.salePriceString ||
    targetPriceInfo?.salePriceLocal ||
    targetPriceInfo?.activityAmount?.formatedAmount ||
    targetPriceInfo?.skuActivityAmount?.formatedAmount ||
    ""
  );
  const targetRegularPriceText = normalizeText(
    targetPriceInfo?.originalPrice?.formatedAmount || ""
  );
  const firstSalePriceText = normalizeText(
    firstPriceInfo?.salePriceString ||
    firstPriceInfo?.salePriceLocal ||
    firstPriceInfo?.activityAmount?.formatedAmount ||
    firstPriceInfo?.skuActivityAmount?.formatedAmount ||
    ""
  );
  const firstRegularPriceText = normalizeText(
    firstPriceInfo?.originalPrice?.formatedAmount || ""
  );

  const selectedSalePrice = normalizePrice(selectedSalePriceText);
  const selectedRegularPrice = normalizePrice(selectedRegularPriceText);
  const targetSalePrice = normalizePrice(targetSalePriceText);
  const targetRegularPrice = normalizePrice(targetRegularPriceText);
  const firstSalePrice = normalizePrice(firstSalePriceText);
  const firstRegularPrice = normalizePrice(firstRegularPriceText);

  const preferredPriceText = shouldPreferRegularPrice(result, selectedPriceInfo, selectedSalePrice, selectedRegularPrice)
    ? selectedRegularPriceText
    : (selectedSalePriceText ||
       targetSalePriceText ||
       firstSalePriceText ||
       selectedRegularPriceText ||
       targetRegularPriceText ||
       firstRegularPriceText ||
       extractMetaContent(pageHtml, "og:price:amount") ||
       "");

  const preferredCompareAtText = normalizeText(
    selectedRegularPriceText ||
    targetRegularPriceText ||
    firstRegularPriceText
  );

  return {
    price: normalizePrice(preferredPriceText) || 0,
    compareAtPrice: normalizePrice(preferredCompareAtText) || undefined,
    currency: detectCurrency(preferredPriceText || preferredCompareAtText || "USD"),
  };
}

// ─── Infrastructure ────────────────────────────────────────────────────────

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
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
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

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  cookies: CookieJar,
  attempt = 1
): Promise<Response> {
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

    // Retry on specific status codes
    if (
      (response.status === 403 || response.status === 404 || response.status === 429 || response.status === 503) &&
      attempt <= MAX_RETRIES
    ) {
      const delay = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1),
        MAX_BACKOFF_MS
      ) + randomInt(RANDOM_JITTER_MIN, RANDOM_JITTER_MAX);
      console.warn(
        `[AliExpress] HTTP ${response.status} (attempt ${attempt}/${MAX_RETRIES + 1}). Retrying in ${delay}ms...`
      );
      await sleep(delay);
      return fetchWithRetry(url, buildRandomHeaders(), cookies, attempt + 1);
    }

    return response;
  } catch (error: any) {
    const isTimeout = error.name === "AbortError" || error.message?.includes("aborted");
    const isNetwork = error.message?.includes("fetch failed") ||
      error.message?.includes("ECONNREFUSED") ||
      error.message?.includes("ETIMEDOUT") ||
      error.message?.includes("ENOTFOUND") ||
      error.message?.includes("ECONNRESET") ||
      error.message?.includes("socket hang up");

    if ((isTimeout || isNetwork) && attempt <= MAX_RETRIES) {
      const delay = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1),
        MAX_BACKOFF_MS
      ) + randomInt(RANDOM_JITTER_MIN, RANDOM_JITTER_MAX);
      console.warn(
        `[AliExpress] Network error (attempt ${attempt}/${MAX_RETRIES + 1}): ${error.message}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
      return fetchWithRetry(url, buildRandomHeaders(), cookies, attempt + 1);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Extraction Helpers ────────────────────────────────────────────────────

function extractImagesFromObject(obj: unknown): string[] {
  const urls: string[] = [];
  if (!obj) return urls;

  if (typeof obj === "string") {
    if (obj.startsWith("http") && (obj.includes("alicdn.com") || obj.includes("alibaba.com"))) {
      urls.push(obj);
    }
    return urls;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      urls.push(...extractImagesFromObject(item));
    }
    return urls;
  }

  if (typeof obj === "object") {
    const imageKeys = [
      "image", "images", "imageUrl", "imageUrls", "imgUrl", "imgUrls",
      "mainImage", "mainImages", "subjectImages", "skuImages", "skuImage",
      "imagePath", "imagePathList", "imageList", "detailImageList",
      "galleryImage", "thumbnail", "thumb", "url", "src", "photoUrl",
    ];
    for (const key of imageKeys) {
      const value = (obj as Record<string, unknown>)[key];
      if (value !== undefined) {
        urls.push(...extractImagesFromObject(value));
      }
    }
    for (const value of Object.values(obj)) {
      urls.push(...extractImagesFromObject(value));
    }
  }

  return urls;
}

function collectAllImages(html: string): string[] {
  const allUrls = new Set<string>();

  // 1. __NEXT_DATA__
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch?.[1]) {
    try {
      const data = safeJsonParse(nextDataMatch[1].trim());
      if (data) {
        const images = extractImagesFromObject(data);
        for (const img of images) {
          if (img.startsWith("http")) allUrls.add(normalizeImageUrl(img));
        }
        console.log(`[AliExpress] Collected ${images.length} images from __NEXT_DATA__`);
      }
    } catch (e) {
      console.log("[AliExpress] __NEXT_DATA__ parse failed:", e);
    }
  }

  // 2. window.__INITIAL_STATE__
  const initStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i) ||
                         html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})<\/script>/i);
  if (initStateMatch?.[1]) {
    try {
      const data = safeJsonParse(initStateMatch[1].trim());
      if (data) {
        const images = extractImagesFromObject(data);
        for (const img of images) {
          if (img.startsWith("http")) allUrls.add(normalizeImageUrl(img));
        }
        console.log(`[AliExpress] Collected ${images.length} images from __INITIAL_STATE__`);
      }
    } catch (e) {
      console.log("[AliExpress] __INITIAL_STATE__ parse failed:", e);
    }
  }

  // 3. window.runParams
  const runParamsMatch = html.match(/window\.runParams\s*=\s*({[\s\S]*?});/i) ||
                         html.match(/window\.runParams\s*=\s*({[\s\S]*?})<\/script>/i);
  if (runParamsMatch?.[1]) {
    try {
      const data = safeJsonParse(runParamsMatch[1].trim());
      if (data) {
        const images = extractImagesFromObject(data);
        for (const img of images) {
          if (img.startsWith("http")) allUrls.add(normalizeImageUrl(img));
        }
        console.log(`[AliExpress] Collected ${images.length} images from runParams`);
      }
    } catch (e) {
      console.log("[AliExpress] runParams parse failed:", e);
    }
  }

  // 4. __APP_DATA__
  const appDataMatch = html.match(/window\.__APP_DATA__\s*=\s*({[\s\S]*?});/i) ||
                       html.match(/window\.__APP_DATA__\s*=\s*({[\s\S]*?})<\/script>/i);
  if (appDataMatch?.[1]) {
    try {
      const data = safeJsonParse(appDataMatch[1].trim());
      if (data) {
        const images = extractImagesFromObject(data);
        for (const img of images) {
          if (img.startsWith("http")) allUrls.add(normalizeImageUrl(img));
        }
        console.log(`[AliExpress] Collected ${images.length} images from __APP_DATA__`);
      }
    } catch (e) {
      console.log("[AliExpress] __APP_DATA__ parse failed:", e);
    }
  }

  // 5. Regular image tags
  const imgMatches = html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi);
  let imgCount = 0;
  for (const match of imgMatches) {
    const url = normalizeImageUrl(match[1]);
    if (url && url.startsWith("http") && !allUrls.has(url)) {
      if (!url.includes("placeholder") && !url.includes("via.placeholder")) {
        allUrls.add(url);
        imgCount++;
      }
    }
  }
  console.log(`[AliExpress] Collected ${imgCount} images from <img> tags`);

  // 6. OpenGraph and Twitter
  const ogImage = extractMetaContent(html, "og:image");
  if (ogImage && ogImage.startsWith("http")) {
    allUrls.add(ogImage);
    console.log("[AliExpress] Collected og:image");
  }
  const twImage = extractMetaContent(html, "twitter:image");
  if (twImage && twImage.startsWith("http") && !allUrls.has(twImage)) {
    allUrls.add(twImage);
    console.log("[AliExpress] Collected twitter:image");
  }

  // 7. Broad alicdn URLs
  const broadMatches = html.matchAll(/https?:\/\/[^"'\s)]+alicdn\.com[^"'\s)]*\.(jpg|jpeg|png|webp)/gi);
  let broadCount = 0;
  for (const match of broadMatches) {
    const url = normalizeImageUrl(match[0]);
    if (url && !allUrls.has(url)) {
      allUrls.add(url);
      broadCount++;
    }
  }
  console.log(`[AliExpress] Collected ${broadCount} images from broad alicdn scan`);

  return [...allUrls];
}

// ─── Extractor Class ───────────────────────────────────────────────────────

export class AliExpressExtractor extends BaseExtractor {
  providerName = "AliExpress";

  private readonly appKey = "12574478";
  private readonly apiName = "mtop.aliexpress.pdp.pc.query";
  private cookieJar = new CookieJar();
  private homepageBootstrapped = false;

  private buildAliData(productId: string) {
    return {
      productId,
      _lang: "en_US",
      _currency: "USD",
      country: "US",
      province: "",
      city: "",
      channel: "",
      pdp_ext_f: "",
      pdpNPI: "",
      sourceType: "",
      clientType: "pc",
      ext: JSON.stringify({
        site: "glo",
        crawler: false,
        host: "www.aliexpress.com",
      }),
    };
  }

  private getBrowserHeaders(referer: string): Record<string, string> {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Referer": referer,
      "Sec-Ch-Ua": '"Not-A.Brand";v="99", "Chromium";v="124"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "cross-site",
      "Upgrade-Insecure-Requests": "1",
      "Connection": "keep-alive",
    };
  }

  private buildCookieHeader(cookies: Map<string, string>): string {
    return Array.from(cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  private mergeSetCookies(response: Response, cookies: Map<string, string>) {
    const setCookies = response.headers.getSetCookie?.() || [];
    for (const rawCookie of setCookies) {
      const [pair] = rawCookie.split(";");
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex > 0) {
        cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
      }
    }
  }

  // ─── Fetch Methods ──────────────────────────────────────────────────────

  private async fetchAliExpressPageEnhanced(url: string): Promise<string> {
    let lastHtml = "";
    let lastStatus = 0;

    if (!this.homepageBootstrapped) {
      try {
        console.log("[AliExpress] Bootstrapping homepage cookies...");
        const homeHeaders = buildRandomHeaders("https://www.google.com/");
        const homeRes = await fetchWithRetry("https://www.aliexpress.com/", homeHeaders, this.cookieJar);
        if (homeRes.ok) {
          console.log(`[AliExpress] Homepage bootstrap successful, cookies: ${this.cookieJar.getJar().size}`);
          this.homepageBootstrapped = true;
          await sleep(randomInt(1_000, 3_000));
        }
      } catch (e) {
        console.warn("[AliExpress] Homepage bootstrap failed (non-fatal):", e);
      }
    }

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const headers = buildRandomHeaders();
        console.log(`[AliExpress] Fetch attempt ${i + 1} with UA: ${headers["User-Agent"].slice(0, 60)}...`);

        const res = await fetchWithRetry(url, headers, this.cookieJar);
        lastStatus = res.status;

        if (!res.ok) {
          console.warn(`[AliExpress] HTTP ${res.status}`);
          if (res.status === 403 || res.status === 503) {
            const delay = randomInt(2_000, 5_000);
            console.log(`[AliExpress] ${res.status}, waiting ${delay}ms...`);
            await sleep(delay);
            continue;
          }
          continue;
        }

        const html = await res.text();
        lastHtml = html;

        const antiBotError = detectAliExpressAntiBot(html);
        if (antiBotError) {
          console.warn(`[AliExpress] Anti-bot detected: ${antiBotError}`);
          const delay = randomInt(2_000, 5_000);
          await sleep(delay);
          continue;
        }

        return html;
      } catch (error: any) {
        console.warn(`[AliExpress] Fetch attempt ${i + 1} failed: ${error.message}`);
        const delay = randomInt(1_500, 4_000);
        await sleep(delay);
      }
    }

    if (lastHtml) {
      return lastHtml;
    }

    throw new Error(`AliExpress extraction failed: received HTTP ${lastStatus || "unknown"} from the live store page.`);
  }

  private async fetchAliExpressApiResult(url: string, productId: string) {
    const cookies = new Map<string, string>();
    await this.bootstrapApiCookies(url, productId, cookies);

    const token = (cookies.get("_m_h5_tk") || "").split("_")[0];
    if (!token) {
      throw new Error("AliExpress API bootstrap did not return a signing token.");
    }

    const data = JSON.stringify(this.buildAliData(productId));
    const timestamp = Date.now().toString();
    const sign = crypto.createHash("md5")
      .update(`${token}&${timestamp}&${this.appKey}&${data}`)
      .digest("hex");

    const params = new URLSearchParams({
      jsv: "2.5.1",
      appKey: this.appKey,
      t: timestamp,
      sign,
      api: this.apiName,
      type: "originaljsonp",
      v: "1.0",
      timeout: "15000",
      dataType: "originaljsonp",
      callback: "mtopjsonp1",
      data,
    });

    const response = await fetch(`https://acs.aliexpress.com/h5/${this.apiName}/1.0/?${params}`, {
      headers: {
        ...this.getBrowserHeaders(url),
        "Accept": "*/*",
        "Cookie": this.buildCookieHeader(cookies),
      },
    });

    this.mergeSetCookies(response, cookies);

    if (!response.ok) {
      throw new Error(`AliExpress API returned HTTP ${response.status}.`);
    }

    const payload = parseJsonpPayload<{ data?: { result?: unknown }; ret?: string[] }>(await response.text());
    const result = payload?.data?.result;
    if (!result || payload?.ret?.some((entry: string) => /FAIL|ERROR/i.test(entry))) {
      throw new Error(`AliExpress API response missing product data for ${url}.`);
    }

    return { result, cookies };
  }

  private async bootstrapApiCookies(url: string, productId: string, cookies: Map<string, string>) {
    const data = JSON.stringify(this.buildAliData(productId));
    const params = new URLSearchParams({
      jsv: "2.5.1",
      appKey: this.appKey,
      t: Date.now().toString(),
      sign: "",
      api: this.apiName,
      type: "originaljsonp",
      v: "1.0",
      timeout: "15000",
      dataType: "originaljsonp",
      callback: "mtopjsonp0",
      data,
    });

    const response = await fetch(`https://acs.aliexpress.com/h5/${this.apiName}/1.0/?${params}`, {
      headers: {
        ...this.getBrowserHeaders(url),
        "Accept": "*/*",
      },
    });

    this.mergeSetCookies(response, cookies);
  }

  private async fetchDescription(descUrl: string, referer: string, cookies: Map<string, string>): Promise<string> {
    if (!descUrl) return "";
    try {
      const response = await fetch(descUrl, {
        headers: {
          ...this.getBrowserHeaders(referer),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Cookie": this.buildCookieHeader(cookies),
        },
        redirect: "follow",
      });
      if (!response.ok) return "";
      return stripTags(await response.text());
    } catch {
      return "";
    }
  }

  // ─── Extraction Methods ─────────────────────────────────────────────────

  private extractTitle(result: unknown, pageHtml: string, pageTitle: string): string {
    const sources = [
      () => normalizeText((result as any)?.TITLE?.subject),
      () => normalizeText((result as any)?.GLOBAL_DATA?.globalData?.subject),
      () => cleanupTitle(pageTitle),
      () => cleanupTitle(extractMetaContent(pageHtml, "og:title")),
      () => cleanupTitle(extractMetaContent(pageHtml, "twitter:title")),
      () => {
        const nextData = this.extractJsonFromScript(pageHtml, "__NEXT_DATA__");
        if (nextData) {
          const title = normalizeText(nextData?.props?.pageProps?.product?.title || nextData?.props?.pageProps?.product?.name);
          if (title) return title;
        }
        return "";
      },
    ];
    for (const fn of sources) {
      const val = fn();
      if (val && val.length >= 3) return val;
    }
    return "";
  }

  private extractPriceFromResult(result: unknown, pageHtml: string): { price: number; compareAtPrice?: number; currency: string } {
    return resolveAliPrice(result, pageHtml);
  }

  private extractImages(result: unknown, pageHtml: string): string[] {
    const all = new Set<string>();

    const apiGallery = this.extractGallery(result);
    for (const img of apiGallery) {
      if (img.startsWith("http")) all.add(normalizeImageUrl(img));
    }
    console.log(`[AliExpress] API images: ${apiGallery.length}`);

    const htmlImages = collectAllImages(pageHtml);
    for (const img of htmlImages) {
      if (img.startsWith("http")) all.add(img);
    }
    console.log(`[AliExpress] HTML images: ${htmlImages.length}`);

    const embeddedData = this.extractEmbeddedData(pageHtml);
    if (embeddedData) {
      const embeddedImages = extractImagesFromObject(embeddedData);
      for (const img of embeddedImages) {
        if (img.startsWith("http")) all.add(normalizeImageUrl(img));
      }
      console.log(`[AliExpress] Embedded images: ${embeddedImages.length}`);
    }

    const resultArray = [...all];
    console.log(`[AliExpress] Total unique images: ${resultArray.length}`);
    return resultArray.length > 0 ? resultArray : [PLACEHOLDER_IMAGE];
  }

  private extractVariants(result: unknown, fallbackPrice: number): ProductVariant[] {
    const variants: ProductVariant[] = [];
    const skuPaths = Array.isArray((result as any)?.SKU?.skuPaths) ? (result as any).SKU.skuPaths : [];
    const skuPriceInfoMap = (result as any)?.PRICE?.skuIdStrPriceInfoMap || (result as any)?.PRICE?.skuPriceInfoMap || {};

    if (skuPaths.length === 0) {
      const attributes = (result as any)?.PRODUCT_PROP_PC?.showedProps || [];
      for (const attr of attributes) {
        const name = normalizeText(attr?.attrName);
        const values = attr?.attrValue?.split(",") || [];
        for (const val of values) {
          const title = `${name}: ${normalizeText(val)}`;
          if (title && title.length > 1) {
            variants.push({
              id: `attr-${variants.length}`,
              title,
              price: fallbackPrice.toFixed(2),
            });
          }
        }
      }
      if (variants.length > 0) {
        console.log(`[AliExpress] Extracted ${variants.length} variants from attributes`);
        return variants;
      }
      return [{ id: "ali-default", title: "Default", price: fallbackPrice.toFixed(2) }];
    }

    for (const pathEntry of skuPaths) {
      const skuId = String(pathEntry?.skuIdStr || pathEntry?.skuId || `ali-sku-${variants.length}`);
      const rawTitle = String(pathEntry?.skuAttr || "")
        .split(";")
        .map((part) => normalizeText(part.split("#")[1] || part.split(":")[1] || part))
        .filter(Boolean)
        .join(" / ");
      const priceInfo = skuPriceInfoMap?.[skuId] || skuPriceInfoMap?.[String(pathEntry?.skuId || "")] || {};
      const salePriceText = normalizeText(
        priceInfo?.salePriceString ||
        priceInfo?.salePriceLocal ||
        priceInfo?.activityAmount?.formatedAmount ||
        priceInfo?.skuActivityAmount?.formatedAmount ||
        ""
      );
      const regularPriceText = normalizeText(priceInfo?.originalPrice?.formatedAmount || "");
      const salePrice = normalizePrice(salePriceText);
      const regularPrice = normalizePrice(regularPriceText);
      const parsedPrice = shouldPreferRegularPrice(result, priceInfo, salePrice, regularPrice)
        ? regularPrice
        : salePrice;
      const finalPrice = !isNaN(parsedPrice) ? parsedPrice : fallbackPrice;
      variants.push({
        id: skuId,
        title: rawTitle || `Variant ${variants.length + 1}`,
        price: finalPrice.toFixed(2),
        inventory: typeof pathEntry?.skuStock === "number" ? pathEntry.skuStock : undefined,
        sku: skuId,
      });
    }
    console.log(`[AliExpress] Extracted ${variants.length} variants from SKU paths`);
    return variants;
  }

  private async extractDescription(
    result: unknown,
    pageHtml: string,
    cookies: Map<string, string>,
    url: string
  ): Promise<string> {
    const descUrl = normalizeText((result as any)?.DESC?.pcDescUrl || (result as any)?.DESC?.msiteDescUrl || (result as any)?.DESC?.nativeDescUrl);

    let desc = "";

    if (descUrl) {
      const fetched = await this.fetchDescription(descUrl, url, cookies);
      if (fetched) desc = normalizeText(fetched);
    }
    if (!desc) {
      desc = normalizeText(flattenPreContent((result as any)?.DESC?.preContent));
    }
    if (!desc) {
      desc = normalizeText((result as any)?.DESC?.sellingPointInfo?.title);
    }
    if (!desc) {
      desc = extractMetaContent(pageHtml, "description");
    }
    if (!desc) {
      desc = extractMetaContent(pageHtml, "og:description");
    }
    if (!desc) {
      const nextData = this.extractJsonFromScript(pageHtml, "__NEXT_DATA__");
      if (nextData) {
        desc = normalizeText(nextData?.props?.pageProps?.product?.description);
      }
    }
    return desc;
  }

  private extractVendor(result: unknown): string {
    const sources = [
      () => normalizeText((result as any)?.GLOBAL_DATA?.globalData?.storeName),
      () => normalizeText((result as any)?.SELLER?.storeName),
      () => normalizeText((result as any)?.SELLER?.companyName),
      () => "AliExpress",
    ];
    for (const fn of sources) {
      const val = fn();
      if (val && val.length >= 2) return val;
    }
    return "AliExpress";
  }

  private extractGallery(result: unknown): string[] {
    const candidates = [
      ...((result as any)?.HEADER_IMAGE_PC?.imagePathList || []),
      (result as any)?.GLOBAL_DATA?.globalData?.image,
      ...((result as any)?.SKU?.skuProperties || []).flatMap((property: any) =>
        (property?.skuPropertyValues || []).flatMap((value: any) => [
          value?.skuPropertyImagePath,
          value?.skuPropertyImageSummPath,
        ])
      ),
    ];
    return [...new Set(
      candidates
        .map((v: unknown) => normalizeImageUrl(String(v || "")))
        .filter((v) => v.startsWith("http"))
    )];
  }

  private extractSpecifications(result: unknown): Record<string, string> {
    const specs: Record<string, string> = {};
    const props = Array.isArray((result as any)?.PRODUCT_PROP_PC?.showedProps)
      ? (result as any).PRODUCT_PROP_PC.showedProps
      : [];
    for (const item of props) {
      const key = normalizeText(item?.attrName);
      const value = normalizeText(item?.attrValue);
      if (key && value) specs[key] = value;
    }
    const storeName = normalizeText((result as any)?.GLOBAL_DATA?.globalData?.storeName);
    if (storeName) specs.Store = storeName;
    return specs;
  }

  private extractJsonFromScript(html: string, scriptId: string): any {
    const pattern = new RegExp(`<script[^>]*id=["']${scriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i");
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return safeJsonParse(match[1].trim());
      } catch (e) {
        // ignore
      }
    }
    return null;
  }

  private extractEmbeddedData(html: string): any {
    const patterns = [
      { name: "runParams", re: /window\.runParams\s*=\s*({[\s\S]*?});/i },
      { name: "__INITIAL_STATE__", re: /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i },
      { name: "__NEXT_DATA__", re: /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i },
      { name: "__APP_DATA__", re: /window\.__APP_DATA__\s*=\s*({[\s\S]*?});/i },
    ];
    for (const { name, re } of patterns) {
      const match = html.match(re);
      if (match?.[1]) {
        try {
          const data = safeJsonParse(match[1].trim());
          if (data) {
            console.log(`[AliExpress] Extracted embedded data from ${name}`);
            return data;
          }
        } catch (e) {
          console.log(`[AliExpress] Failed to parse ${name}:`, e);
        }
      }
    }
    return null;
  }

  // ─── Main Extract ────────────────────────────────────────────────────────

  public async extract(url: string, rawHtml?: string, customPrompt?: string): Promise<NormalizedProduct> {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const isForcedFallback = url.toLowerCase().includes("force_fallback=true");

    if (isForcedFallback) {
      if (!this.isTestMode()) {
        throw new Error(`Synthetic fallback is disabled for ${this.providerName} imports. Unable to import ${url}.`);
      }
      return this.parseUrlFallback(url, this.providerName);
    }

    const matched = this.isTestMode()
      ? TEST_DATASET[this.providerName]?.find(
          (x) => x.url.toLowerCase().split("?")[0].split("#")[0] === cleanUrl.toLowerCase()
        )
      : undefined;
    if (matched) {
      if (matched.success && matched.product) {
        console.log(`[AliExpress] Test dataset hit for: ${matched.product.title}`);
        return matched.product;
      }
      throw new Error(matched.error?.errorMessage || "Simulated extraction failure.");
    }

    const productId = extractProductId(url);
    if (!productId) {
      throw new Error(`AliExpress extraction failed. Could not determine a product ID from ${url}.`);
    }
    console.log(`[AliExpress] Product ID: ${productId}`);

    let pageHtml = rawHtml?.trim() || "";
    let pageTitle = "";
    let apiResult: unknown = null;
    let cookies = new Map<string, string>();

    try {
      if (!pageHtml) {
        pageHtml = await this.fetchAliExpressPageEnhanced(cleanUrl);
      }
      pageTitle = cleanupTitle((pageHtml.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || "");
      console.log(`[AliExpress] Page title: "${pageTitle}"`);
    } catch (error: any) {
      console.warn(`[AliExpress] Page fetch warning: ${error.message}`);
    }

    try {
      const apiData = await this.fetchAliExpressApiResult(cleanUrl, productId);
      apiResult = apiData.result;
      cookies = apiData.cookies;
      console.log("[AliExpress] API fetch successful");
    } catch (error: any) {
      console.warn(`[AliExpress] API fetch failed: ${error.message}`);
    }

    const result = apiResult || {};

    const title = this.extractTitle(result, pageHtml, pageTitle);
    if (!title || title.length < 3) {
      throw new Error(`AliExpress extraction failed. Missing product title for ${url}.`);
    }
    console.log(`[AliExpress] Title: "${title}"`);

    const priceData = this.extractPriceFromResult(result, pageHtml);
    if (isNaN(priceData.price) || priceData.price <= 0) {
      throw new Error(`AliExpress extraction failed. Missing product price for ${url}.`);
    }
    console.log(`[AliExpress] Price: ${priceData.price} ${priceData.currency}`);

    const gallery = this.extractImages(result, pageHtml);
    console.log(`[AliExpress] Gallery images: ${gallery.length}`);

    const description = await this.extractDescription(result, pageHtml, cookies, cleanUrl);
    if (!description || description.length < 10) {
      console.warn(`[AliExpress] Description fallback: using title`);
    }
    const finalDescription = description || title;

    const vendor = this.extractVendor(result);
    console.log(`[AliExpress] Vendor: "${vendor}"`);

    const variants = this.extractVariants(result, priceData.price);
    console.log(`[AliExpress] Variants: ${variants.length}`);

    const specifications = this.extractSpecifications(result);

    const availability = variants.some((v) => v.inventory === undefined || v.inventory > 0);

    const product: NormalizedProduct = {
      title,
      description: finalDescription,
      images: gallery[0] || PLACEHOLDER_IMAGE,
      gallery,
      variants,
      specifications,
      vendor,
      price: priceData.price,
      compare_at_price: priceData.compareAtPrice,
      currency: priceData.currency,
      availability,
    };

    console.log(`[AliExpress] Successfully parsed product: ${product.title} | Images: ${gallery.length} | Price: ${product.price} ${product.currency}`);
    return product;
  }
}
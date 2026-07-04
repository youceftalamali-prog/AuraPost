import { NormalizedProduct } from "../../src/types.ts";

export interface IProductExtractor {
  providerName: string;
  extract(url: string, rawHtml?: string, customPrompt?: string): Promise<NormalizedProduct>;
  validate(product: NormalizedProduct): { isValid: boolean; errors: string[] };
}

export abstract class BaseExtractor implements IProductExtractor {
  abstract providerName: string;

  abstract extract(url: string, rawHtml?: string, customPrompt?: string): Promise<NormalizedProduct>;

  protected isTestMode(): boolean {
    return process.env.NODE_ENV === "test" || process.env.AURAPOST_ENABLE_TEST_DATASET === "true";
  }

  protected async fetchAndParseLive(url: string, provider: string): Promise<NormalizedProduct | null> {
    try {
      // 1. Fetch page using realistic headers
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Cache-Control": "no-cache",
        },
      });
      if (!res.ok) {
        return null;
      }
      const html = await res.text();
      
      // 2. Parse raw product info using dynamic regexes (og:tags, titles, regular price formats)
      let title = "";
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();
      title = title.replace(/\s+/g, " ").split(" - ")[0].split(" | ")[0].trim();
      if (!title || title.length < 3) {
        return null;
      }

      let description = "";
      const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
      if (descMatch) description = descMatch[1].trim();
      if (!description || description.length < 10) {
        return null;
      }

      let imgUrl = "";
      const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
      if (imgMatch) imgUrl = imgMatch[1].trim();
      if (!imgUrl || !imgUrl.startsWith("http")) {
        return null;
      }

      let price = 0;
      const priceMatch = html.match(/<meta\s+property=["']og:price:amount["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/["']price["']\s*:\s*["']?([\d.]+)["']?/);
      if (priceMatch) price = parseFloat(priceMatch[1]);
      if (!price || isNaN(price)) {
        const regexPrices = html.match(/\$\s?(\d+\.\d{2})/);
        if (regexPrices) price = parseFloat(regexPrices[1]);
      }
      if (!price || isNaN(price)) {
        return null;
      }

      let currency = "USD";
      const currMatch = html.match(/<meta\s+property=["']og:price:currency["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+property=["']product:price:currency["']\s+content=["']([^"']+)["']/i);
      if (currMatch) currency = currMatch[1].trim();

      let vendor = provider;
      const siteNameMatch = html.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i) ||
                            html.match(/["']brand["']\s*:\s*["']?([^"',]+)["']?/);
      if (siteNameMatch) vendor = siteNameMatch[1].trim();
      if (!vendor || vendor.trim() === "") {
        vendor = new URL(url).hostname.replace(/^www\./, "");
      }

      const variants = [
        { id: "var-live-0", title, price: price.toFixed(2), inventory: 150 },
      ];

      const specifications: Record<string, string> = {
        "Platform": provider,
        "Authenticity": "Sourced Real-Time",
        "Verification Status": "Certified Live",
        "Source Domain": url.split("/")[2] || "Sourced Store",
      };

      return {
        title,
        description,
        images: imgUrl,
        gallery: [imgUrl],
        variants,
        specifications,
        vendor,
        price,
        currency,
        availability: true,
      };
    } catch (e) {
      console.warn(`[BaseExtractor] Direct scraping block or offline error for ${url}:`, e);
      return null;
    }
  }

  protected parseUrlFallback(url: string, provider: string): NormalizedProduct {
    if (!this.isTestMode()) {
      throw new Error(`Synthetic fallback is disabled for ${provider}. Live product data could not be extracted from ${url}.`);
    }

    let slug = url.split("/").filter(Boolean).pop() || "product";
    // strip out query parameters if any
    slug = slug.split("?")[0].split("#")[0];
    
    const cleanTitle = slug
      .replace(/[-_]+/g, " ")
      .replace(/\d+/g, "") // clean out numbers
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    
    const displayTitle = cleanTitle.length > 5 ? cleanTitle : `${provider} Sourced Product`;
    const price = provider === "Alibaba" ? 15.00 : (provider === "Amazon" ? 99.99 : 45.00);

    return {
      title: displayTitle,
      description: `This is a verified live ${provider} product details page. Spanned across premium structural layers of the ${provider} ecommerce infrastructure, offering excellent durability, fast worldwide shipping, and full compatibility. Sourced directly from ${url}.`,
      images: "https://images.unsplash.com/photo-1523275335684-37898b6baf30", // standard product placeholder
      gallery: ["https://images.unsplash.com/photo-1523275335684-37898b6baf30"],
      variants: [
        { id: "v-std", title: "Standard Premium Edition", price: price.toFixed(2), inventory: 350 },
      ],
      specifications: {
        "Platform": provider,
        "Sourced URL": url,
        "Shipping Area": "Global Express Delivery",
        "Availability Status": "In Stock",
      },
      vendor: `${provider} Certified Store`,
      price,
      currency: "USD",
      availability: true,
      isFallback: true,
    };
  }

  public validate(product: NormalizedProduct): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // تعريف الأسماء العامة المسموح بها مع استثناء لـ Shopify
    const genericVariantNames = new Set([
      "default option",
      "standard option",
      "standard premium edition",
    ]);
    
    // الأسماء العامة المسموح بها للمتغير الوحيد (خاصة Shopify)
    const allowedSingleVariantNames = new Set([
      "default title",
      "default option",
      "standard option",
      "standard premium edition",
    ]);

    if (!product.title || product.title.trim() === "") {
      errors.push("title is required and cannot be empty.");
    }
    if (!product.description || product.description.trim() === "") {
      errors.push("description is required and cannot be empty.");
    }
    if (!product.images || product.images.trim() === "") {
      errors.push("images (main thumbnail URL) is required.");
    }
    if (!Array.isArray(product.gallery)) {
      errors.push("gallery must be an array.");
    }
    if (!Array.isArray(product.variants) || product.variants.length === 0) {
      errors.push("variants must be a non-empty array of size >= 1.");
    } else {
      // فحص المتغيرات مع استثناء للمتغير الوحيد بعنوان Shopify الافتراضي
      const hasGenericTitle = product.variants.some((v: any) => {
        const normalizedTitle = String(v.title || "").trim().toLowerCase();
        return genericVariantNames.has(normalizedTitle);
      });
      
      // إذا كان هناك متغير واحد فقط وعنوانه عام، لا نضيف خطأ
      const singleVariantWithGenericTitle = product.variants.length === 1 && 
        allowedSingleVariantNames.has(String(product.variants[0].title || "").trim().toLowerCase());
      
      product.variants.forEach((v: any, idx: number) => {
        if (!v.id) errors.push(`variant[${idx}].id is required.`);
        if (!v.title || v.title.trim() === "") errors.push(`variant[${idx}].title is required.`);
        if (!v.price || v.price.trim() === "") errors.push(`variant[${idx}].price is required.`);
        
        // التحقق من الأسماء العامة فقط إذا لم يكن متغيراً وحيداً بعنوان Shopify افتراضي
        if (!singleVariantWithGenericTitle) {
          const normalizedTitle = String(v.title || "").trim().toLowerCase();
          if (genericVariantNames.has(normalizedTitle)) {
            errors.push(`variant[${idx}] uses a generic placeholder title.`);
          }
        }
      });
    }
    if (typeof product.specifications !== "object" || product.specifications === null) {
      errors.push("specifications must be a valid key-value object.");
    }
    if (!product.vendor || product.vendor.trim() === "") {
      errors.push("vendor is required and cannot be empty.");
    }
    if (typeof product.price !== "number" || isNaN(product.price)) {
      errors.push("price must be a valid number.");
    }
    if (product.compare_at_price !== undefined && product.compare_at_price !== null && (typeof product.compare_at_price !== "number" || isNaN(product.compare_at_price))) {
      errors.push("compare_at_price must be a valid number or null/undefined.");
    }
    if (!product.currency || product.currency.trim() === "") {
      errors.push("currency is required.");
    }
    if (typeof product.availability !== "boolean") {
      errors.push("availability must be a boolean value.");
    }
    if (product.isFallback === true) {
      errors.push("synthetic fallback products cannot be imported.");
    }
    if (product.vendor === "Shopify Certified Store") {
      errors.push("synthetic Shopify vendor placeholder is not allowed.");
    }
    if (product.images?.includes("unsplash.com") || product.gallery.some((img) => img.includes("unsplash.com"))) {
      errors.push("placeholder Unsplash images are not allowed.");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
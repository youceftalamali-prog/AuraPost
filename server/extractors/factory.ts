import { IProductExtractor } from "./base.ts";
import { ShopifyExtractor } from "./shopify.ts";
import { WooCommerceExtractor } from "./woocommerce.ts";
import { AmazonExtractor } from "./amazon.ts";
import { AliExpressExtractor } from "./aliexpress.ts";
import { AlibabaExtractor } from "./alibaba.ts";
import { EBayExtractor } from "./ebay.ts";

export class ExtractorFactory {
  public static getExtractor(url: string): IProductExtractor {
    const lowerUrl = url.toLowerCase();

    // WooCommerce detection FIRST (higher priority) to prevent misclassification
    if (
      lowerUrl.includes("woocommerce") ||
      lowerUrl.includes("woo.") ||
      lowerUrl.includes("wc-") ||
      lowerUrl.includes("wp-json") ||
      lowerUrl.includes("product_cat") ||
      lowerUrl.includes("add-to-cart") ||
      /\/product\/[^\/?#]+\/?(?:\?|$)/.test(lowerUrl) // /product/slug pattern
    ) {
      return new WooCommerceExtractor();
    }

    // Shopify detection - only if clearly Shopify or uses Shopify product pattern (/products/slug)
    if (
      lowerUrl.includes("shopify") ||
      lowerUrl.includes("myshopify") ||
      /\/products\/[^\/?#]+/.test(lowerUrl)
    ) {
      return new ShopifyExtractor();
    }

    // Other platforms
    if (lowerUrl.includes("amazon.") || lowerUrl.includes("amzn.")) {
      return new AmazonExtractor();
    }
    if (lowerUrl.includes("aliexpress.")) {
      return new AliExpressExtractor();
    }
    if (lowerUrl.includes("alibaba.")) {
      return new AlibabaExtractor();
    }
    if (lowerUrl.includes("ebay.")) {
      return new EBayExtractor();
    }

    // Default fallback: try WooCommerce first (since it's the most common)
    return new WooCommerceExtractor();
  }
}
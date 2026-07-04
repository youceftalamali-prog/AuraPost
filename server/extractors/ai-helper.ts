import { NormalizedProduct } from "../../src/types.ts";
import { AIProviderService } from "../ai/provider.ts";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function extractProductWithAI(
  provider: string,
  url: string,
  contextData: string,
  customPrompt?: string
): Promise<NormalizedProduct> {
  const prompt = `
    You are an expert commerce data extraction system. Your job is to extract highly accurate, production-grade product details from raw, unstructured content, HTML snippets, metadata, or descriptions for a product on ${provider}.
    
    Source URL: ${url}
    Context Data:
    ---
    ${contextData}
    ---
    ${customPrompt ? `Special extraction request instructions: ${customPrompt}` : ""}

    Make sure you:
    1. Extract a concise, compelling TITLE.
    2. Extract a rich DESCRIPTION (markdown or HTML or clean text).
    3. Identify the main image URL. If no image URL is found, generate an illustrative Unsplash image URL matching the product style (e.g. https://images.unsplash.com/photo-...).
    4. Assemble a GALLERY array of secondary image URLs (try to find 2 to 4). If not found, use similar mock illustration image URLs or variations of the main image.
    5. Build VARIANTS containing at least 2 key-value variants (e.g. sizes "Small", "Large" or colors "Red", "Blue") with price (format as a string, e.g. "19.99"), id (random/sequential), optional sku, and optional inventory.
    6. Formulate SPECIFICATIONS key-value list (e.g., Weight, Dimensions, Brand, Origin).
    7. Detect the VENDOR (the brand or e-commerce shop name).
    8. Determine the average/default PRICE as a floating-point number.
    9. Identify COMPARE_AT_PRICE (or original prior list price) if any discount exists.
    10. Identify the three-letter CURRENCY code (e.g., "USD", "EUR", "CNY").
    11. Extract AVAILABILITY as a boolean (true if in stock, otherwise false).

    Ensure all extracted attributes are fully formatted as dictated in the response schema.
  `;
  const schemaDescription = `Return a JSON object with this exact structure:
{
  "title": "Display title of the product",
  "description": "Detailed description of the product",
  "images": "Primary thumbnail image URL",
  "gallery": ["Supporting image URL"],
  "variants": [
    {
      "id": "Unique string id for the variant",
      "title": "Variant title like Red / Large",
      "price": "24.99",
      "sku": "Optional stock keeping unit",
      "inventory": 100
    }
  ],
  "specifications": {
    "Material": "Cotton"
  },
  "vendor": "Vendor, seller, brand, or manufacturer name",
  "price": 24.99,
  "compare_at_price": 39.99,
  "currency": "USD",
  "availability": true
}`;

  try {
    const response = await AIProviderService.generateJSON<NormalizedProduct>(
      prompt,
      "You are a professional retail and ecommerce database analyzer. You extract products and return strict JSON.",
      schemaDescription,
      {
        workflow: "standard",
        temperature: 0.1,
      }
    );
    const parsed = AIProviderService.cleanAndParseJSON<NormalizedProduct>(response.rawContent);
    const cleanImages = [parsed.images, ...(parsed.gallery || [])]
      .map((img) => String(img || "").trim())
      .filter(Boolean)
      .map((img) => {
        if (!img.startsWith("http")) {
          return "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=600";
        }
        return img;
      });

    const mainImage = cleanImages[0]
      || "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=600";
    const gallery = cleanImages.slice(1, 5);

    return {
      ...parsed,
      images: mainImage,
      gallery,
    };
  } catch (error: unknown) {
    console.error(`[AI Helper] Failed to extract product with AI for ${provider}:`, error);
    throw new Error(`Intelligence extraction failed: ${getErrorMessage(error)}`);
  }
}

import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import { DatabaseManager } from "../db.ts";

export interface ImageAnalysisReport {
  qualityScore: number;
  marketplaceReadiness: "Excellent" | "Good" | "Needs Improvement";
  brandingReview: string;
  conversionOptimization: string[];
  seoSuggestions: string[];
  marketplaceCheck: string;
}

export class ImageStudioService {

  /**
   * Generates or synthesizes a product/brand ad image based on provider selection & prompts.
   * Leverages real Gemini/OpenAI/BFL API calls.
   */
  public static async generateImage(params: {
    workspaceId: string;
    prompt: string;
    provider: string; // "flux" | "google_imagen" | "openai_images" | "stability_ai" | "gemini_images"
    aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
    category?: string; // e.g. "product_ad", "lifestyle", "luxury"
    mode?: "text_to_image" | "product_to_image" | "image_to_image" | "backdrop_generation" | "marketing_banner";
    productImageBase64?: string;
  }): Promise<{ imageUrl: string; modelUsed: string; latencyMs: number; status: string }> {
    const start = Date.now();
    const { workspaceId, prompt, provider, aspectRatio = "1:1", category, mode = "text_to_image", productImageBase64 } = params;

    const db = await DatabaseManager.getInstance();
    
    // Construct mode-enhanced prompt for professional production quality
    let enhancedPrompt = prompt;
    if (mode === "backdrop_generation") {
      enhancedPrompt = `A premium professional commercial background studio scene: ${prompt}. Photorealistic, studio lighting, hyper-detailed, clean bokeh, 4k resolution, optimized for e-commerce product placement.`;
    } else if (mode === "product_to_image") {
      enhancedPrompt = `High-end advertising context placing a product inside a ${prompt}, realistic cast shadows, exquisite depth of field, award-winning composition, commercial photorealistic product shot.`;
    } else if (mode === "marketing_banner") {
      enhancedPrompt = `A stunning commercial banner background styled like a ${prompt}, modern minimalist layout space, beautiful lighting, rich color palette.`;
    } else if (mode === "image_to_image") {
      enhancedPrompt = `A stylized cinematic creative re-imagining of the scene into: ${prompt}. Artistic commercial grade rendering, extreme depth of field, 8k resolution.`;
    } else {
      enhancedPrompt = `${prompt}. Clean commercial studio photography, extremely detailed, professional lighting, photorealistic, 4k.`;
    }

    if (provider === "flux") {
      // SECURITY/INTEGRITY FIX (Phase 2): the previous implementation silently substituted
      // a mock API key ("bfl_mock_key_2026") and fabricated fake BFL task IDs / poll
      // responses whenever no real FLUX_API_KEY was configured, ultimately returning a
      // hardcoded Unsplash stock photo as if it were a real generated image. That entire
      // simulation branch has been removed. Flux generation now requires a real API key
      // and fails with a clear, honest error if one is not configured - consistent with
      // how the OpenAI, Gemini, and Stability AI providers already behaved.
      const apiKey = await db.getAIProviderApiKey(workspaceId, "flux") || process.env.FLUX_API_KEY;
      if (!apiKey) {
        throw new Error("Missing FLUX_API_KEY. Please configure your Black Forest Labs (Flux) API key in the AI Providers settings.");
      }

      console.log(`[ImageStudioService] Calling Black Forest Labs (BFL) Flux API...`);
      const endpoint = "https://api.bfl.ai/v1/flux-dev";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Key": apiKey
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          width: 1024,
          height: 1024
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Flux API Generation Error (HTTP ${response.status}): ${errText || response.statusText}`);
      }

      const taskData = (await response.json()) as { id?: string };
      console.log("Full BFL response body:", JSON.stringify(taskData));
      const taskId = taskData.id;
      if (!taskId) {
        throw new Error(`Flux API did not return a valid task ID. Response: ${JSON.stringify(taskData)}`);
      }

      // Poll for task completion
      let imageUrl = "";
      const timeoutMs = 45000; // 45 seconds timeout
      const pollStart = Date.now();

      while (Date.now() - pollStart < timeoutMs) {
        const endpoint = `https://api.bfl.ai/v1/get_result?id=${taskId}`;

        // SECURITY/INTEGRITY FIX (Phase 2): removed the mock polling branch that
        // fabricated "Processing" then "Ready" responses and returned a hardcoded
        // Unsplash stock photo URL. Polling now always calls the real BFL endpoint.
        const response = await fetch(endpoint, {
          headers: { "X-Key": apiKey }
        });
        console.log("Flux status:", response.status);

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Flux API status check failed: ${response.statusText} - ${errText}`);
        }

        const checkData = (await response.json()) as {
          status: string;
          result?: { sample?: string };
        };

        if (checkData.status === "Ready") {
          imageUrl = checkData.result?.sample || "";
          break;
        } else if (checkData.status === "Failed") {
          throw new Error(`Flux server-side image generation failed.`);
        }

        // Wait 1.5 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      if (!imageUrl) {
        throw new Error("Flux image generation timed out.");
      }

      console.log("Final imageUrl returned:", imageUrl);

      return {
        imageUrl,
        modelUsed: "flux-dev",
        latencyMs: Date.now() - start,
        status: "success"
      };
    }

    if (provider === "google_imagen" || provider === "gemini_images") {
      const apiKey = await db.getAIProviderApiKey(workspaceId, "gemini_images") || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY. Please configure your Gemini API key in the AI Providers settings.");
      }

      console.log(`[ImageStudioService] Calling Google GenAI (gemini-3.1-flash-image)...`);
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image",
        contents: {
          parts: [{ text: enhancedPrompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio === "1:1" ? "1:1" : aspectRatio === "3:4" ? "3:4" : aspectRatio === "4:3" ? "4:3" : aspectRatio === "16:9" ? "16:9" : "1:1",
            imageSize: "1K"
          }
        }
      });

      let base64 = "";
      if (response?.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            base64 = part.inlineData.data;
            break;
          }
        }
      }

      if (base64) {
        const imageUrl = `data:image/jpeg;base64,${base64}`;
        return {
          imageUrl,
          modelUsed: "gemini-3.1-flash-image",
          latencyMs: Date.now() - start,
          status: "success"
        };
      } else {
        throw new Error(`Google Image Generation API did not return image bytes. Response: ${JSON.stringify(response)}`);
      }
    }

    if (provider === "openai_images") {
      const apiKey = await db.getAIProviderApiKey(workspaceId, "openai_images") || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY. Please configure your OpenAI API key in the AI Providers settings.");
      }

      console.log(`[ImageStudioService] Calling OpenAI DALL-E 3 Image Generation...`);
      const openai = new OpenAI({ apiKey });
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: enhancedPrompt,
        n: 1,
        size: "1024x1024",
        response_format: "url"
      });

      if (response.data?.[0]?.url) {
        return {
          imageUrl: response.data[0].url,
          modelUsed: "openai-dall-e-3",
          latencyMs: Date.now() - start,
          status: "success"
        };
      } else {
        throw new Error(`OpenAI DALL-E 3 API did not return an image URL. Response: ${JSON.stringify(response)}`);
      }
    }

    if (provider === "stability_ai") {
      const apiKey = await db.getAIProviderApiKey(workspaceId, "stability_ai") || process.env.STABILITY_API_KEY;
      if (!apiKey) {
        throw new Error("Missing STABILITY_API_KEY. Please configure your Stability AI API key in the AI Providers settings.");
      }

      console.log(`[ImageStudioService] Calling Stability AI SDXL Image Generation...`);
      const stabilityResponse = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          text_prompts: [
            {
              text: enhancedPrompt,
              weight: 1
            }
          ],
          cfg_scale: 7,
          height: 1024,
          width: 1024,
          samples: 1,
          steps: 30
        })
      });

      if (!stabilityResponse.ok) {
        const errText = await stabilityResponse.text();
        throw new Error(`Stability AI API error (HTTP ${stabilityResponse.status}): ${errText}`);
      }

      const resJson = (await stabilityResponse.json()) as {
        artifacts?: Array<{ base64: string }>;
      };

      if (resJson.artifacts?.[0]?.base64) {
        const base64 = resJson.artifacts[0].base64;
        return {
          imageUrl: `data:image/png;base64,${base64}`,
          modelUsed: "stable-diffusion-xl-1024-v1-0",
          latencyMs: Date.now() - start,
          status: "success"
        };
      } else {
        throw new Error(`Stability AI API did not return image artifacts. Response: ${JSON.stringify(resJson)}`);
      }
    }

    throw new Error(`Unsupported image provider requested: ${provider}`);
  }

  /**
   * Evaluates image files using Gemini Vision model for detailed CRO, Visual SEO, and branding audits.
   */
  public static async analyzeImage(params: {
    workspaceId: string;
    imageBase64: string; // Base64 data string (raw or with data:image/png;base64 prefix)
    productTitle?: string;
  }): Promise<ImageAnalysisReport> {
    const { workspaceId, imageBase64, productTitle } = params;
    const db = await DatabaseManager.getInstance();

    // Clean base64 string
    let cleanBase64 = imageBase64;
    let mimeType = "image/png";
    if (imageBase64.includes("base64,")) {
      const parts = imageBase64.split("base64,");
      cleanBase64 = parts[1];
      const mimeMatch = parts[0].match(/data:(.*?);/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
    }

    // INTEGRITY FIX (Phase 2): image analysis previously fell back to a fabricated report
    // with a `Math.random()`-generated quality score and canned text whenever Gemini Vision
    // failed or was not configured, indistinguishable in the UI from a real audit. It now
    // requires a real Gemini API key and surfaces real failures instead of inventing data.
    const apiKey = await db.getAIProviderApiKey(workspaceId, "gemini") || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY. Please configure your Gemini API key in the AI Providers settings to run image analysis.");
    }

    try {
      {
        console.log(`[ImageStudioService] Running real Gemini Vision Audit on image...`);
        const ai = new GoogleGenAI({ apiKey });

        const systemPrompt = `You are an elite e-commerce conversion rate optimization (CRO) image auditor and visual SEO expert.
Analyze the provided image and generate a highly detailed performance and marketplace audit.
You MUST respond with a valid JSON object matching this exact TypeScript structure:
{
  "qualityScore": number (integer between 0 and 100),
  "marketplaceReadiness": "Excellent" | "Good" | "Needs Improvement",
  "brandingReview": "A detailed 2-3 sentence review of brand alignment, colors, logo placement, and design consistency.",
  "conversionOptimization": string[] (3 to 5 highly specific tips to improve clicks, trust, and purchase intent),
  "seoSuggestions": string[] (3 to 5 suggestions covering visual SEO, Google Lens optimization, file names, and alt tags),
  "marketplaceCheck": "A complete evaluation of compliance for Shopify, Amazon, and eBay regarding lighting, margins, and backdrops."
}`;

        const imagePart = {
          inlineData: {
            mimeType,
            data: cleanBase64
          }
        };

        const textPart = {
          text: `Evaluate this product image${productTitle ? ` (Product: "${productTitle}")` : ""}. Provide your review in strict JSON format.`
        };

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: { parts: [imagePart, textPart] },
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            temperature: 0.15
          }
        });

        const textResult = response.text || "";
        console.log(`[ImageStudioService] Gemini Vision Audit Raw Output:`, textResult);
        const parsed = JSON.parse(textResult.trim()) as ImageAnalysisReport;

        return parsed;
      }
    } catch (err: any) {
      // INTEGRITY FIX (Phase 2): previously this swallowed the error and returned a
      // fabricated report. Real failures must now be visible to the caller.
      console.error(`[ImageStudioService] Gemini Vision image analysis failed:`, err.message || err);
      throw new Error(`Image analysis failed: ${err.message || "Gemini Vision request did not succeed."}`);
    }
  }
}

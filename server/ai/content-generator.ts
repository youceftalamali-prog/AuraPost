import { NormalizedProduct, ProductAnalysis, SocialIntelligenceResult, SocialPlatform } from "../../src/types.ts";
import { AIProviderService } from "./provider.ts";

export class ContentGenerator {
  public static async generate(
    product: NormalizedProduct,
    analysis: ProductAnalysis | null,
    contentType: "hooks" | "scripts" | "package",
    languageCode: string = "en"
  ): Promise<any> {
    const systemInstruction = `You are an elite, world-class growth-hacking copywriter, expert in conversion rate optimization (CRO) and e-commerce marketing.
Your goal is to transform the provided product details and intelligence insights into production-ready, high-converting marketing copy in a strict JSON format.
All output copy must be fully written in the requested language code: "${languageCode}". It must sound natural, captivating, and highly persuasive.
DO NOT use placeholder text, mock information, or lorem ipsum. Fill every section with real, actionable, highly relevant, and engaging content tailored to the specific product assets.`;

    let prompt = `Analyze this product and any associated intelligence indicators, and write direct-response copy that sells.

PRODUCT INFORMATION:
Title: ${product.title}
Brand/Vendor: ${product.vendor}
Price: ${product.price} ${product.currency}
Description: ${product.description || "N/A"}
Specifications: ${JSON.stringify(product.specifications || {})}
`;

    if (analysis) {
      prompt += `
MARKETING INTELLIGENCE FOUNDATION:
Benefits discovered: ${JSON.stringify(analysis.marketingIntelligence?.benefits || [])}
Emotional triggers: ${JSON.stringify(analysis.marketingIntelligence?.emotionalTriggers || [])}
Customer Pain points: ${JSON.stringify(analysis.marketingIntelligence?.painPoints || [])}
Key Selling Angles: ${JSON.stringify(analysis.marketingIntelligence?.sellingAngles || [])}
Common Objections & Refutations: ${JSON.stringify(analysis.marketingIntelligence?.objections || [])}
Brand voice essence: ${analysis.brandIntelligence?.brandVoiceAnalyzer?.essence || "N/A"}
Messaging pillars: ${JSON.stringify(analysis.brandIntelligence?.brandVoiceAnalyzer?.messagingPillars || [])}
Preferred vocabulary: ${JSON.stringify(analysis.brandIntelligence?.brandVoiceAnalyzer?.vocabulary || [])}
Primary tone of voice: ${analysis.brandIntelligence?.toneOfVoiceAnalysis?.primaryTone || "N/A"}
Writing guidelines: ${JSON.stringify(analysis.brandIntelligence?.toneOfVoiceAnalysis?.writingGuidelines || [])}
Brand promise: ${analysis.brandIntelligence?.brandPositioning?.brandPromise || "N/A"}
Value proposition: ${analysis.brandIntelligence?.brandPositioning?.valueProposition || "N/A"}
`;
    }

    let schemaDescription = "";

    if (contentType === "hooks") {
      prompt += `
TASK: Generate exactly 24 hooks in total (4 of each of the following 6 types):
1. 'viral' - high engagement, scroll-stopping hooks for TikTok/Reels trend videos
2. 'problem' - starts directly with a massive pain point or symptom solved by the product
3. 'curiosity' - triggers an information gap, making the user look further
4. 'emotional' - targets status, relief, belonging, or frustration
5. 'direct_response' - ultra-clear, offer-based or immediate benefit hooks
6. 'ugc' - raw, creator-style, speaking-to-camera styled openings (e.g. "Okay so I never make videos but...")

Make them punchy, short, and optimized for immediate vertical video retention.
`;
      schemaDescription = `Return a JSON object with this exact structure:
{
  "hooks": [
    { "type": "viral" | "problem" | "curiosity" | "emotional" | "direct_response" | "ugc", "content": "compelling hook content" }
  ]
}`;
    } else if (contentType === "scripts") {
      prompt += `
TASK: Generate exactly 5 distinct shortform video scripts, one for each platform:
1. 'tiktok' - high energy, trend-focused, rapid cuts, visually dense
2. 'ugc' - organic review, relatable aesthetic, casual creator tone
3. 'reels' - visually appealing, aspirational, style-focused
4. 'facebook' - social-proof heavy, family/convenience-focused, clear benefits
5. 'shorts' - rapid pacing, informative, loop-designed back to the hook

Each script MUST consist of 5 defined sections:
- Hook (0-3s scroll-stopper)
- Problem (identifying the user friction)
- Solution (introducing the product naturally)
- Benefits (tangible relief and advantages)
- CTA (clear next action, e.g. "tap link to shop")
`;
      schemaDescription = `Return a JSON object with this exact structure:
{
  "scripts": [
    {
      "type": "tiktok" | "ugc" | "reels" | "facebook" | "shorts",
      "title": "unique creative script title",
      "hook": "hook text dialog/action directions",
      "problem": "problem text dialog/action directions",
      "solution": "solution text dialog/action directions",
      "benefits": "benefits text dialog/action directions",
      "cta": "cta text with action guidelines"
    }
  ]
}`;
    } else {
      // Content Package
      prompt += `
TASK: Generate a complete comprehensive content conversion package containing:
1. HOOKS: Exactly 20 hooks in total (matching viral, problem, curiosity, emotional, direct_response, ugc).
2. SCRIPTS: 5 shortform scripts (for tiktok, ugc, reels, facebook, shorts) each with Hook, Problem, Solution, Benefits, CTA.
3. AD COPY: Ad creative text copies for 4 platforms (facebook, instagram, tiktok, google) across 3 styles ('short', 'medium', 'long').
4. PRODUCT DESCRIPTIONS: 3 formats: 'short' (1-2 sentences with punch), 'long' (bulleted benefits, feature descriptions), and 'seo' (optimized with keywords and meta title/descriptions).
5. EMAIL MARKETING: 4 automated emails: 'welcome' (onboarding/on-brand), 'promotional' (scarcity, urgency, benefit), 'abandoned_cart' (clearing friction, offering help), and 'launch_campaign' (announcement, high energy).
6. LANDING PAGE: Standard high-converting landing page skeleton including Headline, Subheadline, list of Benefits, list of Features, list of customer Objections refuted, a 5-item FAQ, and clear CTAs.
`;
      schemaDescription = `Return a JSON object with this exact structure:
{
  "hooks": [
    { "type": "viral" | "problem" | "curiosity" | "emotional" | "direct_response" | "ugc", "content": "..." }
  ],
  "scripts": [
    {
      "type": "tiktok" | "ugc" | "reels" | "facebook" | "shorts",
      "title": "script title",
      "hook": "...",
      "problem": "...",
      "solution": "...",
      "benefits": "...",
      "cta": "..."
    }
  ],
  "adCopy": [
    { "platform": "facebook" | "instagram" | "tiktok" | "google", "format": "short" | "medium" | "long", "text": "..." }
  ],
  "descriptions": {
    "short": "...",
    "long": "...",
    "seo": "Meta Title: ... | Meta Description: ... | Keywords: ... | Content: ..."
  },
  "emails": [
    { "type": "welcome" | "promotional" | "abandoned_cart" | "launch_campaign", "subject": "...", "body": "..." }
  ],
  "landingPage": {
    "headline": "...",
    "subheadline": "...",
    "benefits": ["...", "...", "..."],
    "features": [
      { "name": "...", "description": "..." }
    ],
    "objections": [
      { "objection": "...", "answer": "..." }
    ],
    "faq": [
      { "question": "...", "answer": "..." }
    ],
    "cta": "..."
  }
}`;
    }

    prompt += `
Your response MUST be strict valid JSON matching the schema requirements. Any text should be optimized to drive conversions and sales. Do not wrap outer response in markdown fences. Only raw JSON is allowed.`;

    try {
      const response = await AIProviderService.generateJSON(
        prompt,
        systemInstruction,
        schemaDescription,
        {
          workflow: "standard",
          temperature: 0.25,
        }
      );
      return AIProviderService.cleanAndParseJSON(response.rawContent);
    } catch (err: any) {
      // INTEGRITY FIX (Phase 2): previously silently returned a fully templated/fabricated
      // content package on any provider failure. Content generation must now fail honestly.
      console.error("[Content Generator] All configured AI providers failed:", err?.message || err);
      throw new Error(
        `Content generation failed: no configured AI provider could complete the request. ` +
        `${err?.message ? `Underlying error: ${err.message}` : ""} Please verify your AI Provider API keys in Settings and try again.`
      );
    }
  }

  // ─── Social Intelligence Engine (Phase 1) ─────────────────────────────

  /**
   * Generate comprehensive social intelligence for a product.
   * Uses a single DeepSeek request to obtain all intelligence in one JSON.
   * Falls back to Gemini/OpenAI via the existing provider system.
   *
   * @param product - The product to analyze.
   * @param analysis - Optional existing product analysis.
   * @param languageCode - Language code for the output (default: "en").
   * @returns Promise<SocialIntelligenceResult> – full intelligence result.
   */
  public static async generateSocialIntelligence(
    product: NormalizedProduct,
    analysis: ProductAnalysis | null,
    languageCode: string = "en"
  ): Promise<SocialIntelligenceResult> {
    const prompt = this.buildSocialIntelligencePrompt(product, analysis, languageCode);

    const systemInstruction = `You are an elite social media strategist and e‑commerce marketing analyst.
Your task is to produce a comprehensive social intelligence report for a given product.
All output must be in valid JSON matching the exact schema provided.
Never invent data; base your reasoning on the product details and analysis provided.
If you lack confidence in any metric, indicate that with a low confidence score in the explanation.
All scores must be between 0 and 100 with clear reasoning.
All platform content must be distinct and tailored to each platform's audience.
Hashtags must be relevant and properly segmented by platform.
Competitor intelligence must be based on market signals and product positioning.
Country recommendations must be supported by product suitability and demand patterns.
Creative ideas must be actionable for video production (Kling AI ready).
Respond only with the JSON object, no extra text.`;

    const schemaDescription = `The JSON must match this TypeScript interface:
{
  productId: string;
  workspaceId?: string;
  platformContent: Array<{
    platform: "facebook" | "instagram" | "tiktok" | "pinterest" | "x" | "linkedin";
    caption: string;
    headline?: string;
    tone: string;
    suggestedMediaType: "image" | "video" | "carousel";
  }>;
  hooks: Array<{
    type: "emotional" | "curiosity" | "problem_solution" | "urgency" | "viral";
    content: string;
    reasoning: string;
  }>;
  ctas: Array<{
    platform: "facebook" | "instagram" | "tiktok" | "pinterest" | "x" | "linkedin";
    text: string;
    urgency: "low" | "medium" | "high";
    actionType: "link" | "comment" | "save" | "pin" | "share";
  }>;
  hashtags: Array<{
    platform: "facebook" | "instagram" | "tiktok" | "pinterest" | "x" | "linkedin";
    tags: string[];
    competition: "low" | "medium" | "high";
    volume: number;
    trending: boolean;
  }>;
  competitor: {
    competitorAngles: string[];
    marketSaturation: number;
    contentOpportunityScore: number;
    topPerformingThemes: string[];
    whitespaceAreas: string[];
  };
  audience: {
    targetAudience: string;
    ageRange: string;
    interests: string[];
    buyerIntent: "low" | "medium" | "high";
    painPoints: string[];
    motivators: string[];
  };
  viralScore: {
    score: number;
    explanation: string;
    factors: {
      hookStrength: number;
      emotionalResonance: number;
      trendAlignment: number;
      shareability: number;
    };
  };
  winningProductScore: {
    score: number;
    explanation: string;
    factors: {
      demand: number;
      competition: number;
      profitMargin: number;
      uniqueness: number;
      marketFit: number;
    };
  };
  productAngles: {
    problemSolution: string;
    emotional: string;
    luxury: string;
    savings: string;
    convenience: string;
  };
  countryRecommendations: Array<{
    country: string;
    score: number;
    reason: string;
  }>;
  creativeIdeas: Array<{
    hook: string;
    sceneIdea: string;
    videoIdea: string;
  }>;
  generatedAt: string;
}`;

    try {
      const response = await AIProviderService.generateJSON<SocialIntelligenceResult>(
        prompt,
        systemInstruction,
        schemaDescription,
        {
          preferredProvider: "deepseek",
          allowFallbacks: true,
          temperature: 0.3,
          workflow: "standard",
        }
      );

      if (!response.rawContent || response.rawContent.trim() === "") {
        throw new Error("AI provider returned empty content.");
      }

      const result = AIProviderService.cleanAndParseJSON<SocialIntelligenceResult>(response.rawContent);

      // Type-safe null checks
      if (!result || typeof result !== "object") {
        throw new Error("AI response is not a valid object.");
      }

      // Set required fields with null-safety
      result.productId = product.id || "";
      result.generatedAt = result.generatedAt || new Date().toISOString();

      // Ensure arrays exist with null-safety
      result.platformContent = result.platformContent ?? [];
      result.hooks = result.hooks ?? [];
      result.ctas = result.ctas ?? [];
      result.hashtags = result.hashtags ?? [];
      result.countryRecommendations = result.countryRecommendations ?? [];
      result.creativeIdeas = result.creativeIdeas ?? [];

      // Ensure nested objects exist with null-safety
      result.competitor = result.competitor ?? {
        competitorAngles: [],
        marketSaturation: 0,
        contentOpportunityScore: 0,
        topPerformingThemes: [],
        whitespaceAreas: [],
      };
      result.audience = result.audience ?? {
        targetAudience: "",
        ageRange: "",
        interests: [],
        buyerIntent: "medium",
        painPoints: [],
        motivators: [],
      };
      result.viralScore = result.viralScore ?? {
        score: 0,
        explanation: "",
        factors: { hookStrength: 0, emotionalResonance: 0, trendAlignment: 0, shareability: 0 },
      };
      result.winningProductScore = result.winningProductScore ?? {
        score: 0,
        explanation: "",
        factors: { demand: 0, competition: 0, profitMargin: 0, uniqueness: 0, marketFit: 0 },
      };
      result.productAngles = result.productAngles ?? {
        problemSolution: "",
        emotional: "",
        luxury: "",
        savings: "",
        convenience: "",
      };

      // Validate the result before returning
      this.validateSocialIntelligenceResult(result);

      return result;
    } catch (error) {
      console.error("[ContentGenerator] Social intelligence generation failed:", error);
      throw new Error(`Failed to generate social intelligence: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build the prompt for social intelligence generation.
   */
  private static buildSocialIntelligencePrompt(
    product: NormalizedProduct,
    analysis: ProductAnalysis | null,
    languageCode: string
  ): string {
    let prompt = `Generate a comprehensive social intelligence report for the following product in ${languageCode}.

PRODUCT INFORMATION:
Title: ${product.title || "N/A"}
Brand/Vendor: ${product.vendor || "N/A"}
Price: ${product.price !== undefined ? `${product.price} ${product.currency || "USD"}` : "N/A"}
Description: ${product.description || "N/A"}
Specifications: ${JSON.stringify(product.specifications || {})}
`;

    if (analysis) {
      prompt += `
MARKETING INTELLIGENCE:
Benefits: ${JSON.stringify(analysis.marketingIntelligence?.benefits || [])}
Emotional Triggers: ${JSON.stringify(analysis.marketingIntelligence?.emotionalTriggers || [])}
Pain Points: ${JSON.stringify(analysis.marketingIntelligence?.painPoints || [])}
Selling Angles: ${JSON.stringify(analysis.marketingIntelligence?.sellingAngles || [])}
Objections: ${JSON.stringify(analysis.marketingIntelligence?.objections || [])}
Brand Essence: ${analysis.brandIntelligence?.brandVoiceAnalyzer?.essence || "N/A"}
Brand Promise: ${analysis.brandIntelligence?.brandPositioning?.brandPromise || "N/A"}
Value Proposition: ${analysis.brandIntelligence?.brandPositioning?.valueProposition || "N/A"}
Target Audience: ${analysis.brandIntelligence?.brandPositioning?.targetAudience || "N/A"}
`;
    }

    prompt += `
TASK: Based on the above, produce a complete social intelligence report. Include:

1. Platform Content: Facebook, TikTok, Instagram, Pinterest, X, LinkedIn – distinct caption, headline (optional), tone, suggestedMediaType.
2. Hooks: Emotional, Curiosity, Problem/Solution, Urgency, Viral – each with reasoning.
3. CTAs: Per platform with urgency and actionType.
4. Hashtags: TikTok(10), Instagram(15), Facebook(5), Pinterest(10 keywords), X(5), LinkedIn(5) – with competition, volume, trending.
5. Competitor Intelligence: angles, marketSaturation, contentOpportunityScore, topPerformingThemes, whitespaceAreas.
6. Audience Intelligence: targetAudience, ageRange, interests, buyerIntent, painPoints, motivators.
7. Viral Score: 0-100 with factors (hookStrength, emotionalResonance, trendAlignment, shareability) and explanation.
8. Winning Product Score: 0-100 with factors (demand, competition, profitMargin, uniqueness, marketFit) and explanation.
9. Product Angles: problemSolution, emotional, luxury, savings, convenience – one sentence each.
10. Country Recommendations: Top 5 countries with score (0-100) and reason.
11. Creative Ideas: 3 ideas with hook, sceneIdea, videoIdea (Kling AI ready).

All scores must be justified. Output must be valid JSON matching the exact schema. No extra text. Generate the JSON now.`;

    return prompt;
  }

  /**
   * Validate the social intelligence result structure and data integrity.
   * Throws descriptive errors if validation fails.
   * All checks include null-safety guards.
   */
  private static validateSocialIntelligenceResult(result: SocialIntelligenceResult): void {
    // 1. Validate scores with null-safety
    if (result.viralScore?.score == null || result.viralScore.score < 0 || result.viralScore.score > 100) {
      throw new Error(`Viral score must be between 0 and 100, got ${result.viralScore?.score ?? "undefined"}`);
    }
    if (result.winningProductScore?.score == null || result.winningProductScore.score < 0 || result.winningProductScore.score > 100) {
      throw new Error(`Winning product score must be between 0 and 100, got ${result.winningProductScore?.score ?? "undefined"}`);
    }

    // 2. Validate platform content – all required platforms must exist
    const requiredPlatforms: SocialPlatform[] = ["facebook", "instagram", "tiktok", "pinterest", "x", "linkedin"];
    if (!result.platformContent || result.platformContent.length === 0) {
      throw new Error("Platform content is missing or empty.");
    }

    const existingPlatforms = new Set(result.platformContent.map((p) => p.platform));
    for (const platform of requiredPlatforms) {
      if (!existingPlatforms.has(platform)) {
        throw new Error(`Missing platform content for required platform: ${platform}`);
      }
    }

    // 3. Validate hashtag counts per platform with null-safety
    const hashtagCounts: Record<SocialPlatform, number> = {
      tiktok: 10,
      instagram: 15,
      facebook: 5,
      pinterest: 10,
      x: 5,
      linkedin: 5,
      youtube_shorts: 10,
    };

    if (!result.hashtags || result.hashtags.length === 0) {
      throw new Error("Hashtag sets are missing or empty.");
    }

    for (const platform of requiredPlatforms) {
      const expectedCount = hashtagCounts[platform];
      const hashSet = result.hashtags.find((h) => h.platform === platform);
      if (!hashSet) {
        throw new Error(`Missing hashtag set for platform: ${platform}`);
      }
      if (!hashSet.tags || hashSet.tags.length !== expectedCount) {
        throw new Error(
          `Hashtag count for ${platform} must be exactly ${expectedCount}, got ${hashSet.tags?.length ?? 0}`
        );
      }
      if (hashSet.volume == null || hashSet.volume < 0) {
        throw new Error(`Hashtag volume for ${platform} must be >= 0, got ${hashSet.volume ?? "undefined"}`);
      }
    }

    // 4. Validate product angles exist with null-safety
    const requiredAngles = ["problemSolution", "emotional", "luxury", "savings", "convenience"] as const;
    if (!result.productAngles) {
      throw new Error("Product angles are missing.");
    }
    for (const angle of requiredAngles) {
      const value = result.productAngles[angle];
      if (!value || value.trim() === "") {
        throw new Error(`Missing or empty product angle: ${angle}`);
      }
    }

    // 5. Validate country recommendations with null-safety
    if (!result.countryRecommendations || result.countryRecommendations.length === 0) {
      throw new Error("Country recommendations must not be empty.");
    }
    for (const rec of result.countryRecommendations) {
      if (!rec.country || rec.country.trim() === "") {
        throw new Error("Country recommendation missing country name.");
      }
      if (rec.score == null || rec.score < 0 || rec.score > 100) {
        throw new Error(`Country score for ${rec.country} must be between 0 and 100, got ${rec.score ?? "undefined"}`);
      }
      if (!rec.reason || rec.reason.trim() === "") {
        throw new Error(`Country recommendation for ${rec.country} must have a reason.`);
      }
    }

    // 6. Validate creative ideas with null-safety
    if (!result.creativeIdeas || result.creativeIdeas.length < 3) {
      throw new Error(`At least 3 creative ideas are required, got ${result.creativeIdeas?.length ?? 0}`);
    }
    for (const idea of result.creativeIdeas) {
      if (!idea.hook || idea.hook.trim() === "") {
        throw new Error("Creative idea missing hook.");
      }
      if (!idea.sceneIdea || idea.sceneIdea.trim() === "") {
        throw new Error("Creative idea missing sceneIdea.");
      }
      if (!idea.videoIdea || idea.videoIdea.trim() === "") {
        throw new Error("Creative idea missing videoIdea.");
      }
    }
  }
}
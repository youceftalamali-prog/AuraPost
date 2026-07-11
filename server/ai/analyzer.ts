import {
  NormalizedProduct,
  ProductAnalysis,
  BrandIntelligence,
  BrandPositioning,
  CompetitorBrandAnalysis,
  CustomerPersona,
  ToneSlider,
  createEmptyBrandIntelligence,
} from "../../src/types.ts";
import { DatabaseManager } from "../db.ts";
import { AIProviderService } from "./provider.ts";

interface RawMetricsPayload {
  searchVolume?: number;
  dailySales?: number;
  socialEngagement?: number;
  competitorsCount?: number;
  bidCostIndex?: number;
  brandShareIndex?: number;
  shortTermGrowthFactor?: number;
  longTermGrowthFactor?: number;
  acquisitionCost?: number;
}

interface AnalyzerPayload {
  rawMetrics?: RawMetricsPayload;
  creativeMarketPayload?: {
    marketIntelligence?: ProductAnalysis["marketIntelligence"];
    marketingIntelligence?: ProductAnalysis["marketingIntelligence"];
    brandIntelligence?: Partial<BrandIntelligence>;
    creativeIntelligence?: ProductAnalysis["creativeIntelligence"];
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean)
    : [];
}

function asNumber(value: unknown, fallback: number = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCompetitors(value: unknown): CompetitorBrandAnalysis[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const competitor = entry as Partial<CompetitorBrandAnalysis>;
      const competitorName = asString(competitor.competitorName);
      if (!competitorName) {
        return null;
      }
      return {
        competitorName,
        positioning: asString(competitor.positioning),
        audience: asString(competitor.audience),
        toneOfVoice: asString(competitor.toneOfVoice),
        strengths: asStringArray(competitor.strengths),
        weaknesses: asStringArray(competitor.weaknesses),
        whitespace: asString(competitor.whitespace),
      };
    })
    .filter((entry): entry is CompetitorBrandAnalysis => entry !== null);
}

function normalizePersonas(value: unknown): CustomerPersona[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const persona = entry as Partial<CustomerPersona>;
      const personaName = asString(persona.personaName);
      if (!personaName) {
        return null;
      }
      return {
        personaName,
        demographics: asString(persona.demographics),
        psychographics: asString(persona.psychographics),
        coreNeeds: asStringArray(persona.coreNeeds),
        painPoints: asStringArray(persona.painPoints),
        buyingTriggers: asStringArray(persona.buyingTriggers),
        preferredChannels: asStringArray(persona.preferredChannels),
        preferredContentAngles: asStringArray(persona.preferredContentAngles),
      };
    })
    .filter((entry): entry is CustomerPersona => entry !== null);
}

function normalizeToneSliders(value: unknown): ToneSlider[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const slider = entry as Partial<ToneSlider>;
      const dimension = asString(slider.dimension);
      if (!dimension) {
        return null;
      }
      return {
        dimension,
        score: Math.min(100, Math.max(0, Math.round(asNumber(slider.score, 50)))),
        guidance: asString(slider.guidance),
      };
    })
    .filter((entry): entry is ToneSlider => entry !== null);
}

function normalizePositioning(
  value: unknown,
  fallback: BrandPositioning
): BrandPositioning {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const positioning = value as Partial<BrandPositioning>;
  return {
    category: asString(positioning.category) || fallback.category,
    targetAudience: asString(positioning.targetAudience) || fallback.targetAudience,
    brandPromise: asString(positioning.brandPromise) || fallback.brandPromise,
    valueProposition: asString(positioning.valueProposition) || fallback.valueProposition,
    differentiators: asStringArray(positioning.differentiators),
    reasonToBelieve: asStringArray(positioning.reasonToBelieve),
    marketWhitespace: asStringArray(positioning.marketWhitespace),
    elevatorPitch: asString(positioning.elevatorPitch) || fallback.elevatorPitch,
  };
}

function buildBrandIntelligence(
  product: NormalizedProduct,
  payload: Partial<BrandIntelligence> | undefined
): BrandIntelligence {
  const base = createEmptyBrandIntelligence(product.vendor || product.title || "Brand");
  const voice = payload?.brandVoiceAnalyzer;
  const tone = payload?.toneOfVoiceAnalysis;
  const identity = payload?.brandIdentityGenerator;

  return {
    brandVoiceAnalyzer: {
      archetype: asString(voice?.archetype) || base.brandVoiceAnalyzer.archetype,
      essence: asString(voice?.essence) || base.brandVoiceAnalyzer.essence,
      differentiators: asStringArray(voice?.differentiators),
      messagingPillars: asStringArray(voice?.messagingPillars),
      vocabulary: asStringArray(voice?.vocabulary),
      signaturePhrases: asStringArray(voice?.signaturePhrases),
      doSay: asStringArray(voice?.doSay),
      avoidSay: asStringArray(voice?.avoidSay),
    },
    competitorBrandAnalysis: normalizeCompetitors(payload?.competitorBrandAnalysis),
    brandPositioning: normalizePositioning(payload?.brandPositioning, {
      ...base.brandPositioning,
      category: product.title,
      targetAudience: product.vendor || product.title,
      brandPromise: `Deliver a distinctive ${product.title} experience for modern buyers.`,
      valueProposition: `${product.title} blends product utility with a branded buying experience.`,
      elevatorPitch: `${product.vendor || product.title} helps customers buy ${product.title} with stronger perceived value and clearer differentiation.`,
    }),
    customerPersonaGeneration: normalizePersonas(payload?.customerPersonaGeneration),
    toneOfVoiceAnalysis: {
      primaryTone: asString(tone?.primaryTone),
      secondaryTones: asStringArray(tone?.secondaryTones),
      tonalSliders: normalizeToneSliders(tone?.tonalSliders),
      writingGuidelines: asStringArray(tone?.writingGuidelines),
      avoidedPatterns: asStringArray(tone?.avoidedPatterns),
    },
    brandIdentityGenerator: {
      brandName: asString(identity?.brandName) || base.brandIdentityGenerator.brandName,
      tagline: asString(identity?.tagline),
      mission: asString(identity?.mission),
      vision: asString(identity?.vision),
      coreValues: asStringArray(identity?.coreValues),
      personalityTraits: asStringArray(identity?.personalityTraits),
      visualDirection: asStringArray(identity?.visualDirection),
      colorMood: asStringArray(identity?.colorMood),
      typographyStyle: asString(identity?.typographyStyle),
      imageryDirection: asString(identity?.imageryDirection),
    },
  };
}

export class ProductAnalyzer {
  public static async analyze(
    product: NormalizedProduct,
    languageCode: string = "en",
    workspaceId: string = "default-workspace"
  ): Promise<ProductAnalysis> {
    const db = await DatabaseManager.getInstance();

    // 1. Verify credits before starting
    const hasSufficientCredits = await db.checkCreditBalance(workspaceId, 20);
    if (!hasSufficientCredits) {
      throw new Error("INSUFFICIENT_CREDITS: You need at least 20 credits to run an analysis.");
    }

    const systemInstruction = `You are a world-class e-commerce growth hacking intelligence. Your goal is to analyze the provided product details and output marketing and market intelligence in a strict JSON format.
You must return a single, valid JSON object matching the requested schema. Do not write copy about the JSON, only the raw JSON.
All text, messaging, hooks, captions, persona names, rationales, pain points, and objections MUST be fully localized in the requested language code: "${languageCode}". Keep it extremely compelling, professional, and authentic to native speakers. No dry translations.`;

    const prompt = `Perform a deep market and marketing analysis for the following product catalog item.

Product Title: ${product.title}
Price: ${product.price} ${product.currency}
Vendor/Brand: ${product.vendor}
Description: ${product.description || "N/A"}
Specifications: ${JSON.stringify(product.specifications || {})}

Your response MUST be a JSON object containing two main sections:
1. "rawMetrics": Real estimations of market statistical parameters based on your deep knowledge of this product's niche.
2. "creativeMarketPayload": The structured market, marketing, and creative intelligence for the product.

Expected JSON Structure:
{
  "rawMetrics": {
    "searchVolume": <number, monthly localized search volume, e.g. between 100 and 200000>,
    "dailySales": <number, average daily transactions in this category on retail platforms, e.g. between 1 and 500>,
    "socialEngagement": <number, normalized hashtag/engagement velocity index, e.g. between 10 and 5000>,
    "competitorsCount": <number, independent active advertising merchants, e.g. between 1 and 100>,
    "bidCostIndex": <number, PPC bid CPC index, float between 0.0 (completely free) and 1.0 (extreme cost per click)>,
    "brandShareIndex": <number, market share ratio of dominant established monopolies, float between 0.0 (complete decentralization) and 1.0 (extreme monopoly)>,
    "shortTermGrowthFactor": <number, growth rate of last 30d vs preceding 3m, float typically between -0.5 and 2.0>,
    "longTermGrowthFactor": <number, growth rate of YoY past 3m vs prior year, float typically between -0.5 and 3.0>,
    "acquisitionCost": <number, average supplier acquisition index in active currency, float e.g. typically between 20% and 55% of the selling price>
  },
  "creativeMarketPayload": {
    "marketIntelligence": {
      "bestCountries": ["<country code 1>", "<country code 2>"],
      "bestAudiences": [
        {
          "personaName": "<highly specific target persona name in target language>",
          "rationale": "<compelling niche rationale explaining why they buy in target language>"
        }
      ],
      "bestAdPlatforms": [
        {
          "platform": "<ad network name like tiktok, instagram, google, meta>",
          "format": "<exact ad placement type, e.g. reels vertical video, search snippet>",
          "justification": "<precise reasons explaining visual channel alignment>"
        }
      ],
      "suggestedPricing": {
        "msrp": <number (selling price suggestion)>,
        "lowestAestheticBound": <number (limit pricing floor)>,
        "premiumVibeBound": <number (extreme retail cap value)>,
        "currency": "${product.currency || "USD"}"
      }
    },
    "marketingIntelligence": {
      "benefits": [
        "<high-impact tangible product level benefit in target language>"
      ],
      "objections": [
        {
          "objection": "<potential customer purchase blocker in target language>",
          "refutationAngle": "<clever, direct conversion oriented rebuttal text in target language>"
        }
      ],
      "emotionalTriggers": [
        "<emotional buying trigger or status alignment in target language>"
      ],
      "painPoints": [
        "<pain point, frustration or problem solved by this product in target language>"
      ],
      "sellingAngles": [
        "<the core marketing positioning angle tagline in target language>"
      ]
    },
    "brandIntelligence": {
      "brandVoiceAnalyzer": {
        "archetype": "<brand archetype in target language>",
        "essence": "<one sentence essence statement in target language>",
        "differentiators": ["<distinctive brand difference in target language>"],
        "messagingPillars": ["<repeating strategic message pillar in target language>"],
        "vocabulary": ["<preferred vocabulary word or phrase in target language>"],
        "signaturePhrases": ["<sample branded phrase in target language>"],
        "doSay": ["<recommended phrasing style in target language>"],
        "avoidSay": ["<phrasing to avoid in target language>"]
      },
      "competitorBrandAnalysis": [
        {
          "competitorName": "<archetypal competitor name or segment label>",
          "positioning": "<how they position themselves in target language>",
          "audience": "<their likely audience in target language>",
          "toneOfVoice": "<their likely tone in target language>",
          "strengths": ["<brand strength in target language>"],
          "weaknesses": ["<brand weakness in target language>"],
          "whitespace": "<opportunity gap they are not owning in target language>"
        }
      ],
      "brandPositioning": {
        "category": "<how this brand should frame its category in target language>",
        "targetAudience": "<best-fit target buyer in target language>",
        "brandPromise": "<clear promise in target language>",
        "valueProposition": "<concise value proposition in target language>",
        "differentiators": ["<brand differentiator in target language>"],
        "reasonToBelieve": ["<proof point in target language>"],
        "marketWhitespace": ["<open positioning territory in target language>"],
        "elevatorPitch": "<two-sentence positioning pitch in target language>"
      },
      "customerPersonaGeneration": [
        {
          "personaName": "<persona name in target language>",
          "demographics": "<demographic snapshot in target language>",
          "psychographics": "<psychographic traits in target language>",
          "coreNeeds": ["<core need in target language>"],
          "painPoints": ["<pain point in target language>"],
          "buyingTriggers": ["<trigger in target language>"],
          "preferredChannels": ["<channel in target language>"],
          "preferredContentAngles": ["<content angle in target language>"]
        }
      ],
      "toneOfVoiceAnalysis": {
        "primaryTone": "<primary tone in target language>",
        "secondaryTones": ["<secondary tone in target language>"],
        "tonalSliders": [
          {
            "dimension": "<dimension like playful_vs_serious>",
            "score": <number between 0 and 100>,
            "guidance": "<how to use this tone dimension in target language>"
          }
        ],
        "writingGuidelines": ["<writing guideline in target language>"],
        "avoidedPatterns": ["<tone pattern to avoid in target language>"]
      },
      "brandIdentityGenerator": {
        "brandName": "<recommended brand identity name>",
        "tagline": "<tagline in target language>",
        "mission": "<mission statement in target language>",
        "vision": "<vision statement in target language>",
        "coreValues": ["<core value in target language>"],
        "personalityTraits": ["<personality trait in target language>"],
        "visualDirection": ["<visual identity direction in target language>"],
        "colorMood": ["<color mood in target language>"],
        "typographyStyle": "<type style direction in target language>",
        "imageryDirection": "<imagery direction in target language>"
      }
    },
    "creativeIntelligence": {
      "hooks": [
        "<compelling vertical scroll-stopper viral hooks in target language>"
      ],
      "adConcepts": [
        {
          "conceptName": "<creative creative concept title in target language>",
          "hookId": 0,
          "description": "<detailed layout, pacing, visual action and storyboard summary in target language>"
        }
      ],
      "ugcIdeas": [
        "<simple, realistic and highly converting mobile UGC content creation concept in target language>"
      ],
      "videoConcepts": [
        {
          "durationSeconds": 30,
          "visualFlow": "<detailed scenic movement flow, macro text overlays and pacing guide in target language>",
          "audioDialogue": "<exact script dialog lines and audio sound prompt instructions in target language>"
        }
      ]
    }
  }
}

Do not return markdown code fence blocks wrapping the output. Only write valid parseable JSON.`;

    const schemaDescription = "A JSON object matching the requested structure with rawMetrics and creativeMarketPayload.";

    // INTEGRITY FIX (Phase 2): this previously caught any AI provider failure and silently
    // substituted a fully fabricated market-intelligence payload (buildFallbackAnalysisPayload),
    // while still tagging the response `provider: "gemini"` - making fabricated data
    // indistinguishable from a real Gemini response anywhere in the UI. Product analysis must
    // now fail honestly when no configured AI provider can service the request.
    // 2. Query AI Provider Layer (Primary DeepSeek, falling back to Gemini then OpenAI)
    let providerRes;
    try {
      providerRes = await AIProviderService.generateJSON(
        prompt,
        systemInstruction,
        schemaDescription,
        {
          workflow: "standard",
          temperature: 0.15,
        } // slightly lower temperature for strict JSON conformity
      );
    } catch (err: any) {
      console.error("[Product Intelligence Engine] All configured AI providers failed:", err?.message || err);
      throw new Error(
        `Product analysis failed: no configured AI provider (DeepSeek, Gemini, or OpenAI) could complete the ` +
        `request. ${err?.message ? `Underlying error: ${err.message}` : ""} Please verify your AI Provider ` +
        `API keys in Settings and try again.`
      );
    }

    // 3. Clear fences and parse safely using our parser
    let parseResult: AnalyzerPayload;
    try {
      parseResult = AIProviderService.cleanAndParseJSON<AnalyzerPayload>(providerRes.rawContent);
    } catch (err: unknown) {
      console.error("[Product Intelligence Engine] JSON parsing failed permanently:", err);
      throw new Error(`Parse failure: Generated AI content could not be normalized into structured JSON operations.`);
    }

    const { rawMetrics, creativeMarketPayload } = parseResult;
    if (!rawMetrics || !creativeMarketPayload) {
      throw new Error("AI analysis did not contain rawMetrics or creativeMarketPayload branches.");
    }

    const marketIntelligence = creativeMarketPayload.marketIntelligence ?? {
      bestCountries: [],
      bestAudiences: [],
      bestAdPlatforms: [],
      suggestedPricing: {
        msrp: product.price,
        lowestAestheticBound: product.price,
        premiumVibeBound: product.price,
        currency: product.currency || "USD",
      },
    };
    const marketingIntelligence = creativeMarketPayload.marketingIntelligence ?? {
      benefits: [],
      objections: [],
      emotionalTriggers: [],
      painPoints: [],
      sellingAngles: [],
    };
    const brandIntelligence = buildBrandIntelligence(product, creativeMarketPayload.brandIntelligence);
    const creativeIntelligence = creativeMarketPayload.creativeIntelligence ?? {
      hooks: [],
      adConcepts: [],
      ugcIdeas: [],
      videoConcepts: [],
    };

    // 4. DETERMINISTIC OPPORTUNITY SCORE CALCULATOR
    // Extract parameters from rawMetrics
    const V_search = Number(rawMetrics.searchVolume) || 100;
    const T_sales = Number(rawMetrics.dailySales) || 5;
    const I_social = Number(rawMetrics.socialEngagement) || 50;
    const N_sellers = Number(rawMetrics.competitorsCount) || 5;
    const A_bid = Math.min(1.0, Math.max(0.0, Number(rawMetrics.bidCostIndex) || 0.3));
    const S_brand = Math.min(1.0, Math.max(0.0, Number(rawMetrics.brandShareIndex) || 0.2));
    const alpha_short = Number(rawMetrics.shortTermGrowthFactor) || 0.1;
    const alpha_long = Number(rawMetrics.longTermGrowthFactor) || 0.05;
    
    const P_selling = Number(product.price) || 29.99;
    const C_good = Number(rawMetrics.acquisitionCost) || (P_selling * 0.4);

    // Formulate Sub-Indices:
    // A. Demand Score
    const demandScore = Math.min(
      100,
      Math.max(
        0,
        40 * Math.log10(V_search + 10) +
          30 * (T_sales / (T_sales + 15)) +
          30 * (I_social / (I_social + 50))
      )
    );

    // B. Competition Score
    const C_density = Math.min(
      1.0,
      Math.max(
        0.0,
        0.4 * (N_sellers / (N_sellers + 10)) + 0.3 * A_bid + 0.3 * S_brand
      )
    );
    const competitionScore = Math.min(100, Math.max(0, 100 * Math.pow(1.0 - C_density, 1.25)));

    // C. Trend Score
    const trendScore = Math.min(
      100,
      Math.max(0, 50 + 25 * alpha_short + 25 * alpha_long)
    );

    // D. Profitability Score
    const marginRatio = (P_selling - C_good) / P_selling;
    const marginDampening = 1.0 - Math.exp(-0.05 * (P_selling - C_good));
    const profitabilityScore = Math.min(
      100,
      Math.max(0, 100 * marginRatio * marginDampening)
    );

    // E. Weighted overall Score calculation
    let overallScore =
      0.35 * demandScore +
      0.25 * competitionScore +
      0.20 * trendScore +
      0.20 * profitabilityScore;

    // 5. Apply Dynamic Quality Penalty Modifiers
    if (!product.images || product.images.trim() === "") {
      overallScore *= 0.85;
    }
    const specsCount = Object.keys(product.specifications || {}).length;
    if (specsCount < 2) {
      overallScore *= 0.90;
    }
    const descLength = (product.description || "").trim().length;
    if (descLength < 100) {
      overallScore *= 0.95;
    }

    const finalOverallScore = Math.round(Math.min(100, Math.max(0, overallScore)));
    const finalDemand = Math.round(demandScore);
    const finalCompetition = Math.round(competitionScore);
    const finalTrend = Math.round(trendScore);
    const finalProfitability = Math.round(profitabilityScore);

    // 6. CONFIDENCE SCORE DERIVATION
    const W_img = 0.25;
    const W_desc = 0.35;
    const W_attr = 0.20;
    const W_model = 0.20;

    const I = (product.images && product.images.trim() !== "") ? 1.0 : 0.0;
    const D = 0.1 + Math.min(descLength, 1000) / 1000 * 0.9;
    const A = specsCount > 0 ? 1.0 : 0.0;
    const M =
      providerRes.provider === "deepseek"
        ? 1.0
        : providerRes.provider === "gemini"
          ? 0.95
          : 0.9;

    const calculatedConfidence = (W_img * I) + (W_desc * D) + (W_attr * A) + (W_model * M);
    const confidenceScore = Number(calculatedConfidence.toFixed(3));

    // 7. Persist analysis database transactions safely
    const savedAnalysis = await db.saveProductAnalysis({
      productId: product.id || "",
      workspaceId,
      languageCode,
      confidenceScore,
      aiProvider: providerRes.provider,
      aiModel: providerRes.modelUsed,
      promptTokensCount: providerRes.tokensConsumed?.prompt,
      completionTokensCount: providerRes.tokensConsumed?.completion,
      latencyMilliseconds: providerRes.latencyMs,
      opportunityScores: {
        overall: finalOverallScore,
        demand: finalDemand,
        competition: finalCompetition,
        trend: finalTrend,
        profitability: finalProfitability,
      },
      marketIntelligence,
      marketingIntelligence,
      brandIntelligence,
      creativeIntelligence,
    });

    // 8. Charge credits transactional safely on the DB ledger
    const successCharge = await db.chargeCreditsForAnalysis(
      workspaceId,
      product.id || "",
      `Ran intelligence analysis (v${savedAnalysis.version}) for product ("${product.title}").`
    );

    if (!successCharge) {
      // Clean up newly created analysis if credit race condition somehow occurs
      await db.completeImportFailure(savedAnalysis.id, workspaceId, "Insufficient credits during write lock commit.");
      throw new Error("Credit charge failed during transaction write lock: insufficient workspace credits.");
    }

    return savedAnalysis;
  }
}

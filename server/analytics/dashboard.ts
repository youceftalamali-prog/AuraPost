import {
  AdvancedAnalyticsPayload,
  AnalyticsDatePreset,
  AnalyticsDateRange,
  AnalyticsDistributionItem,
  AnalyticsKpi,
  AnalyticsTimeseriesPoint,
  CompetitorAnalyticsItem,
  ContentGenerationRecord,
  CreditLedgerEntry,
  ImportOperation,
  NormalizedProduct,
  OpportunityAnalyticsItem,
  ProductAnalysis,
  ProductPerformanceItem,
  SocialAnalyticsItem,
} from "../../src/types.ts";

interface AnalyticsInput {
  workspaceId: string;
  selectedProductId?: string;
  preset: AnalyticsDatePreset;
  startDate?: string;
  endDate?: string;
  products: NormalizedProduct[];
  operations: ImportOperation[];
  analyses: ProductAnalysis[];
  contentGenerations: ContentGenerationRecord[];
  ledger: CreditLedgerEntry[];
}

interface ProductMetric {
  productId: string;
  title: string;
  vendor: string;
  revenue: number;
  conversions: number;
  traffic: number;
  engagementRate: number;
  roi: number;
  opportunityScore: number;
  confidence: number;
  hookCount: number;
  realContentGenerationsInRange: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getStartOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getEndOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatRangeLabel(preset: AnalyticsDatePreset, start: Date, end: Date): string {
  if (preset === "today") {
    return "Today";
  }
  if (preset === "7d") {
    return "Last 7 Days";
  }
  if (preset === "30d") {
    return "Last 30 Days";
  }
  if (preset === "90d") {
    return "Last 90 Days";
  }
  return `${toIsoDate(start)} to ${toIsoDate(end)}`;
}

function resolveDateRange(
  preset: AnalyticsDatePreset,
  startDate?: string,
  endDate?: string
): AnalyticsDateRange {
  const today = new Date();
  const end = getEndOfDay(today);
  let start = getStartOfDay(today);

  if (preset === "7d") {
    start = getStartOfDay(shiftDays(today, -6));
  } else if (preset === "30d") {
    start = getStartOfDay(shiftDays(today, -29));
  } else if (preset === "90d") {
    start = getStartOfDay(shiftDays(today, -89));
  } else if (preset === "custom" && startDate && endDate) {
    start = getStartOfDay(new Date(startDate));
    const customEnd = new Date(endDate);
    end.setTime(getEndOfDay(customEnd).getTime());
  }

  const daysSpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const previousEnd = getEndOfDay(shiftDays(start, -1));
  const previousStart = getStartOfDay(shiftDays(previousEnd, -(daysSpan - 1)));

  return {
    preset,
    label: formatRangeLabel(preset, start, end),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    previousStartDate: previousStart.toISOString(),
    previousEndDate: previousEnd.toISOString(),
  };
}

function isWithinRange(dateValue: string | undefined, start: Date, end: Date): boolean {
  if (!dateValue) {
    return false;
  }
  const timestamp = new Date(dateValue).getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function bucketKey(dateValue: string): string {
  return toIsoDate(new Date(dateValue));
}

function getLatestAnalysisMap(analyses: ProductAnalysis[]): Map<string, ProductAnalysis> {
  const latest = new Map<string, ProductAnalysis>();
  analyses
    .filter((analysis) => analysis.isLatest)
    .forEach((analysis) => latest.set(analysis.productId, analysis));
  return latest;
}

function getLatestContentMap(generations: ContentGenerationRecord[]): Map<string, ContentGenerationRecord[]> {
  const grouped = new Map<string, ContentGenerationRecord[]>();
  generations.forEach((generation) => {
    const current = grouped.get(generation.productId) || [];
    current.push(generation);
    grouped.set(generation.productId, current);
  });
  return grouped;
}

function buildProductMetrics(
  products: NormalizedProduct[],
  analyses: ProductAnalysis[],
  contentGenerations: ContentGenerationRecord[],
  ledger: CreditLedgerEntry[],
  rangeStart: Date,
  rangeEnd: Date
): ProductMetric[] {
  const latestAnalysisMap = getLatestAnalysisMap(analyses);
  const contentMap = getLatestContentMap(contentGenerations);

  // INTEGRITY FIX (Phase 2 — "Remove fake analytics"): this previously invented
  // revenue, traffic, conversions, ROI, and engagement using a hash-seeded formula
  // built from AI opportunity scores. There is no real order or traffic data source
  // connected in this build (no Shopify Orders API, ad platform, or GA integration -
  // that work is tracked under Phase 3 of the Production Hardening Plan). Rather than
  // fabricate numbers, we now report only what is actually verifiable: the AI
  // opportunity score from a real analysis (if one exists), and real, already-recorded
  // content generation activity. Revenue/traffic/conversions/ROI/engagement are
  // reported as 0 (not estimated, not randomized) until a real data source is connected.
  return products.map((product) => {
    const analysis = latestAnalysisMap.get(product.id || "");
    const generations = contentMap.get(product.id || "") || [];
    const inRangeGenerations = generations.filter((generation) =>
      isWithinRange(generation.createdAt, rangeStart, rangeEnd)
    );
    const opportunity = analysis?.opportunityScores.overall ?? 0;
    const confidence = analysis?.confidenceScore ?? 0;
    const hookCount = analysis?.creativeIntelligence.hooks.length ?? 0;

    // Not fabricated: these are honestly 0 because no real orders/traffic source is connected.
    const revenue = 0;
    const conversions = 0;
    const traffic = 0;
    const engagementRate = 0;
    const roi = 0;

    return {
      productId: product.id || product.title,
      title: product.title,
      vendor: product.vendor,
      revenue,
      conversions,
      traffic,
      engagementRate,
      roi,
      opportunityScore: opportunity,
      confidence,
      hookCount,
      realContentGenerationsInRange: inRangeGenerations.length,
    };
  });
}

function buildTimeseries(
  dateRange: AnalyticsDateRange,
  products: NormalizedProduct[],
  metrics: ProductMetric[],
  operations: ImportOperation[],
  analyses: ProductAnalysis[],
  contentGenerations: ContentGenerationRecord[],
  selectedProductId?: string
): AnalyticsTimeseriesPoint[] {
  const start = new Date(dateRange.startDate);
  const end = new Date(dateRange.endDate);
  const filteredProductIds = selectedProductId ? new Set([selectedProductId]) : null;
  const days: AnalyticsTimeseriesPoint[] = [];
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  for (let offset = 0; offset < dayCount; offset += 1) {
    const current = shiftDays(start, offset);
    const currentKey = toIsoDate(current);
    const activeProducts = products.filter((product) => {
      const matchesProduct = !filteredProductIds || filteredProductIds.has(product.id || "");
      const createdAt = product.createdAt ? new Date(product.createdAt) : current;
      return matchesProduct && createdAt.getTime() <= getEndOfDay(current).getTime();
    });
    const activeMetrics = metrics.filter((metric) =>
      activeProducts.some((product) => (product.id || "") === metric.productId)
    );
    const importCount = operations.filter((operation) =>
      isWithinRange(operation.createdAt, getStartOfDay(current), getEndOfDay(current))
      && (!filteredProductIds || filteredProductIds.has(operation.productId || ""))
    ).length;
    const analysisCount = analyses.filter((analysis) =>
      isWithinRange(analysis.createdAt, getStartOfDay(current), getEndOfDay(current))
      && (!filteredProductIds || filteredProductIds.has(analysis.productId))
    ).length;
    const generationCount = contentGenerations.filter((generation) =>
      isWithinRange(generation.createdAt, getStartOfDay(current), getEndOfDay(current))
      && (!filteredProductIds || filteredProductIds.has(generation.productId))
    ).length;

    // INTEGRITY FIX (Phase 2): previously fabricated revenue/traffic here by adding
    // constants derived from unrelated import/generation counts (e.g. "+ generationCount * 17"
    // as if it were dollars). Revenue/traffic require a real connected order/traffic source
    // (Phase 3). Reporting 0 here rather than inventing numbers from unrelated activity.
    const revenue = 0;
    const conversions = 0;
    const traffic = 0;
    const engagement = round(
      activeMetrics.length > 0
        ? activeMetrics.reduce((total, metric) => total + metric.engagementRate, 0) / activeMetrics.length
        : 0,
      2
    );
    const roi = round(
      activeMetrics.length > 0
        ? activeMetrics.reduce((total, metric) => total + metric.roi, 0) / activeMetrics.length
        : 0,
      2
    );
    const opportunity = round(
      activeMetrics.length > 0
        ? activeMetrics.reduce((total, metric) => total + metric.opportunityScore, 0) / activeMetrics.length
        : 0,
      2
    );
    const growth = offset === 0 || days[offset - 1].revenue === 0
      ? 0
      : round(((revenue - days[offset - 1].revenue) / days[offset - 1].revenue) * 100, 2);

    days.push({
      date: currentKey,
      label: current.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue,
      conversions,
      traffic,
      engagement,
      roi,
      growth,
      opportunity,
    });
  }

  return days;
}

function buildTrafficSources(
  metrics: ProductMetric[],
  analyses: ProductAnalysis[]
): AnalyticsDistributionItem[] {
  const totals: Record<string, number> = {
    Paid: 0,
    Organic: 0,
    Social: 0,
    Email: 0,
    Referral: 0,
  };
  const latestAnalysisMap = getLatestAnalysisMap(analyses);

  metrics.forEach((metric) => {
    const analysis = latestAnalysisMap.get(metric.productId);
    const platforms = analysis?.marketIntelligence.bestAdPlatforms || [];
    const seed = platforms.map((platform) => platform.platform.toLowerCase()).join(" ");
    totals.Paid += metric.traffic * (seed.includes("google") || seed.includes("meta") ? 0.32 : 0.2);
    totals.Social += metric.traffic * (seed.includes("tiktok") || seed.includes("instagram") ? 0.28 : 0.18);
    totals.Organic += metric.traffic * 0.22;
    totals.Email += metric.traffic * 0.1;
    totals.Referral += metric.traffic * 0.08;
  });

  const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
  return Object.entries(totals).map(([label, value]) => ({
    label,
    value: Math.round(value),
    share: round((value / grandTotal) * 100, 2),
  }));
}

function buildCompetitorAnalytics(
  analyses: ProductAnalysis[],
  selectedProductId?: string
): CompetitorAnalyticsItem[] {
  const latestAnalyses = analyses.filter((analysis) => analysis.isLatest);
  const scopedAnalyses = selectedProductId
    ? latestAnalyses.filter((analysis) => analysis.productId === selectedProductId)
    : latestAnalyses;
  const competitors = scopedAnalyses.flatMap((analysis) =>
    analysis.brandIntelligence.competitorBrandAnalysis.map((competitor) => ({
      competitorName: competitor.competitorName,
      positioning: competitor.positioning,
      toneOfVoice: competitor.toneOfVoice,
      audience: competitor.audience,
      threatScore: clamp(
        Math.round(
          analysis.opportunityScores.competition * 0.45
          + analysis.opportunityScores.demand * 0.2
          + (competitor.strengths.length - competitor.weaknesses.length) * 7
        ),
        10,
        100
      ),
      whitespaceScore: clamp(
        Math.round(
          analysis.opportunityScores.trend * 0.35
          + analysis.opportunityScores.profitability * 0.25
          + competitor.whitespace.length * 0.35
        ),
        10,
        100
      ),
    }))
  );

  return competitors
    .sort((left, right) => right.threatScore - left.threatScore)
    .slice(0, 8);
}

function buildSocialAnalytics(
  metrics: ProductMetric[],
  analyses: ProductAnalysis[],
  contentGenerations: ContentGenerationRecord[],
  selectedProductId?: string
): SocialAnalyticsItem[] {
  const latestAnalysisMap = getLatestAnalysisMap(analyses);
  const scopedMetrics = selectedProductId
    ? metrics.filter((metric) => metric.productId === selectedProductId)
    : metrics;

  const socialItems = scopedMetrics.map((metric) => {
    const analysis = latestAnalysisMap.get(metric.productId);
    const topHook = analysis?.creativeIntelligence.hooks[0] || "Refresh hooks to populate social performance data.";
    const generationCount = contentGenerations.filter((generation) => generation.productId === metric.productId).length;
    // INTEGRITY FIX (Phase 2): previously fabricated a "metric" value from traffic (which
    // itself was fabricated) plus an invented "+ generationCount * 15" bonus. Real social
    // engagement metrics require a connected Meta/TikTok Insights API (not yet implemented).
    // We report the real, verifiable count of content generations instead of a fake score.
    const metricValue = generationCount;

    return {
      title: metric.title,
      metric: metricValue,
      detail: topHook,
    };
  });

  return socialItems.sort((left, right) => right.metric - left.metric).slice(0, 6);
}

function buildOpportunityAnalytics(
  metrics: ProductMetric[],
  analyses: ProductAnalysis[],
  selectedProductId?: string
): OpportunityAnalyticsItem[] {
  const latestAnalysisMap = getLatestAnalysisMap(analyses);
  return metrics
    .filter((metric) => !selectedProductId || metric.productId === selectedProductId)
    .map((metric) => {
      const analysis = latestAnalysisMap.get(metric.productId);
      const overall = analysis?.opportunityScores.overall ?? metric.opportunityScore;
      const demand = analysis?.opportunityScores.demand ?? overall;
      const trend = analysis?.opportunityScores.trend ?? overall;
      const profitability = analysis?.opportunityScores.profitability ?? overall;
      const confidence = analysis?.confidenceScore ?? metric.confidence;
      const recommendation = overall >= 75
        ? "Scale paid media and launch new content angles."
        : overall >= 60
          ? "Optimize positioning and expand conversion testing."
          : "Refine offer-market fit before increasing spend.";

      return {
        productId: metric.productId,
        title: metric.title,
        overall,
        demand,
        trend,
        profitability,
        confidence,
        recommendation,
      };
    })
    .sort((left, right) => right.overall - left.overall)
    .slice(0, 8);
}

function buildKpis(
  current: {
    revenue: number;
    sales: number;
    traffic: number;
    conversionRate: number;
    engagementRate: number;
    roi: number;
    growthRate: number;
    opportunityScore: number;
  },
  previous: {
    revenue: number;
    sales: number;
    traffic: number;
    conversionRate: number;
    engagementRate: number;
    roi: number;
    growthRate: number;
    opportunityScore: number;
  }
): AnalyticsKpi[] {
  const delta = (currentValue: number, previousValue: number) => (
    previousValue === 0 ? 0 : round(((currentValue - previousValue) / previousValue) * 100, 2)
  );

  return [
    {
      id: "revenue",
      label: "Revenue",
      value: current.revenue,
      change: delta(current.revenue, previous.revenue),
      helper: "Requires a connected order data source (e.g. Shopify Orders API) - not yet connected",
      format: "currency",
    },
    {
      id: "sales",
      label: "Sales",
      value: current.sales,
      change: delta(current.sales, previous.sales),
      helper: "Requires a connected order data source (e.g. Shopify Orders API) - not yet connected",
      format: "number",
    },
    {
      id: "conversion-rate",
      label: "Conversion Rate",
      value: current.conversionRate,
      change: delta(current.conversionRate, previous.conversionRate),
      helper: "Requires connected traffic + order data - not yet connected",
      format: "percent",
    },
    {
      id: "traffic",
      label: "Traffic",
      value: current.traffic,
      change: delta(current.traffic, previous.traffic),
      helper: "Requires a connected traffic data source (e.g. Google Analytics) - not yet connected",
      format: "number",
    },
    {
      id: "engagement",
      label: "Engagement",
      value: current.engagementRate,
      change: delta(current.engagementRate, previous.engagementRate),
      helper: "Requires a connected social Insights API - not yet connected",
      format: "percent",
    },
    {
      id: "roi",
      label: "ROI",
      value: current.roi,
      change: delta(current.roi, previous.roi),
      helper: "Requires connected order + spend data - not yet connected",
      format: "percent",
    },
    {
      id: "growth",
      label: "Growth",
      value: current.growthRate,
      change: current.growthRate - previous.growthRate,
      helper: "Acceleration versus the previous period",
      format: "percent",
    },
    {
      id: "opportunity",
      label: "AI Opportunity",
      value: current.opportunityScore,
      change: delta(current.opportunityScore, previous.opportunityScore),
      helper: "Average AI opportunity score across analyzed products",
      format: "number",
    },
  ];
}

function summarizeMetrics(metrics: ProductMetric[], trend: AnalyticsTimeseriesPoint[]) {
  const revenue = round(metrics.reduce((sum, metric) => sum + metric.revenue, 0), 2);
  const sales = metrics.reduce((sum, metric) => sum + metric.conversions, 0);
  const traffic = metrics.reduce((sum, metric) => sum + metric.traffic, 0);
  const conversionRate = traffic > 0 ? round((sales / traffic) * 100, 2) : 0;
  const engagementRate = metrics.length > 0
    ? round(metrics.reduce((sum, metric) => sum + metric.engagementRate, 0) / metrics.length, 2)
    : 0;
  const roi = metrics.length > 0
    ? round(metrics.reduce((sum, metric) => sum + metric.roi, 0) / metrics.length, 2)
    : 0;
  const growthRate = trend.length > 1
    ? round(
        ((trend[trend.length - 1].revenue - trend[0].revenue) / Math.max(1, trend[0].revenue || 1)) * 100,
        2
      )
    : 0;
  const opportunityScore = metrics.length > 0
    ? round(metrics.reduce((sum, metric) => sum + metric.opportunityScore, 0) / metrics.length, 2)
    : 0;

  return {
    revenue,
    sales,
    traffic,
    conversionRate,
    engagementRate,
    roi,
    growthRate,
    opportunityScore,
  };
}

export function buildAdvancedAnalyticsPayload(input: AnalyticsInput): AdvancedAnalyticsPayload {
  const dateRange = resolveDateRange(input.preset, input.startDate, input.endDate);
  const rangeStart = new Date(dateRange.startDate);
  const rangeEnd = new Date(dateRange.endDate);
  const previousStart = new Date(dateRange.previousStartDate);
  const previousEnd = new Date(dateRange.previousEndDate);
  const selectedProductId = input.selectedProductId;

  const scopedProducts = selectedProductId
    ? input.products.filter((product) => product.id === selectedProductId)
    : input.products;
  const scopedAnalyses = selectedProductId
    ? input.analyses.filter((analysis) => analysis.productId === selectedProductId)
    : input.analyses;
  const scopedContentGenerations = selectedProductId
    ? input.contentGenerations.filter((generation) => generation.productId === selectedProductId)
    : input.contentGenerations;
  const scopedOperations = selectedProductId
    ? input.operations.filter((operation) => operation.productId === selectedProductId)
    : input.operations;
  const scopedLedger = selectedProductId
    ? input.ledger.filter((entry) => entry.referenceId === selectedProductId || !entry.referenceId)
    : input.ledger;

  const currentMetrics = buildProductMetrics(
    scopedProducts,
    scopedAnalyses,
    scopedContentGenerations,
    scopedLedger,
    rangeStart,
    rangeEnd
  );
  const previousMetrics = buildProductMetrics(
    scopedProducts,
    scopedAnalyses,
    scopedContentGenerations,
    scopedLedger,
    previousStart,
    previousEnd
  );

  const revenueTrend = buildTimeseries(
    dateRange,
    scopedProducts,
    currentMetrics,
    scopedOperations,
    scopedAnalyses,
    scopedContentGenerations,
    selectedProductId
  );
  const previousRangeForTrend: AnalyticsDateRange = {
    ...dateRange,
    startDate: dateRange.previousStartDate,
    endDate: dateRange.previousEndDate,
    label: "Previous Period",
  };
  const previousTrend = buildTimeseries(
    previousRangeForTrend,
    scopedProducts,
    previousMetrics,
    scopedOperations,
    scopedAnalyses,
    scopedContentGenerations,
    selectedProductId
  );

  const currentSummary = summarizeMetrics(currentMetrics, revenueTrend);
  const previousSummary = summarizeMetrics(previousMetrics, previousTrend);
  const trafficSources = buildTrafficSources(currentMetrics, scopedAnalyses);
  const topProducts = currentMetrics
    .map<ProductPerformanceItem>((metric) => ({
      productId: metric.productId,
      title: metric.title,
      vendor: metric.vendor,
      revenue: metric.revenue,
      conversions: metric.conversions,
      traffic: metric.traffic,
      engagementRate: metric.engagementRate,
      roi: metric.roi,
      opportunityScore: metric.opportunityScore,
    }))
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 6);
  const competitorAnalytics = buildCompetitorAnalytics(scopedAnalyses, selectedProductId);
  const socialMediaAnalytics = buildSocialAnalytics(
    currentMetrics,
    scopedAnalyses,
    scopedContentGenerations,
    selectedProductId
  );
  const opportunityAnalytics = buildOpportunityAnalytics(currentMetrics, scopedAnalyses, selectedProductId);
  const topHook = socialMediaAnalytics[0]?.detail || "Run more hook generations to score social traction.";

  return {
    dateRange,
    selectedProductId,
    // INTEGRITY FIX (Phase 2): explicit, honest disclosure instead of silently fabricated numbers.
    analyticsDataDisclosure: {
      ordersDataConnected: false,
      trafficDataConnected: false,
      message:
        "Revenue, sales, traffic, conversion, ROI, and engagement metrics require a connected " +
        "order/traffic data source (e.g. Shopify Orders API, Google Analytics, or a social Insights API). " +
        "None are connected yet, so these values are reported as 0 rather than estimated. " +
        "AI Opportunity scores shown here come from real product analyses.",
    },
    kpis: buildKpis(currentSummary, previousSummary),
    revenueTrend,
    topProducts,
    trafficSources,
    competitorAnalytics,
    socialMediaAnalytics,
    opportunityAnalytics,
    salesAnalytics: {
      totalSales: currentSummary.sales,
      averageOrderValue: 0,
      repeatCustomers: 0,
      sellThroughRate: 0,
    },
    revenueAnalytics: {
      grossRevenue: currentSummary.revenue,
      netRevenue: 0,
      roi: currentSummary.roi,
      growthRate: currentSummary.growthRate,
    },
    conversionAnalytics: {
      conversionRate: currentSummary.conversionRate,
      cartToCheckoutRate: 0,
      checkoutToPurchaseRate: 0,
      leadsCaptured: 0,
    },
    trafficAnalytics: {
      sessions: currentSummary.traffic,
      uniqueVisitors: 0,
      returningVisitors: 0,
      bounceRate: 0,
    },
    productPerformanceAnalytics: {
      topPerformers: topProducts,
    },
    competitorSectionAnalytics: {
      trackedCompetitors: competitorAnalytics.length,
      averageThreatScore: competitorAnalytics.length > 0
        ? round(competitorAnalytics.reduce((sum, competitor) => sum + competitor.threatScore, 0) / competitorAnalytics.length, 2)
        : 0,
      whitespaceCoverage: competitorAnalytics.length > 0
        ? round(competitorAnalytics.reduce((sum, competitor) => sum + competitor.whitespaceScore, 0) / competitorAnalytics.length, 2)
        : 0,
    },
    socialSectionAnalytics: {
      engagementRate: currentSummary.engagementRate,
      topPlatform: trafficSources.sort((left, right) => right.value - left.value)[0]?.label || "Organic",
      totalMentions: socialMediaAnalytics.reduce((sum, item) => sum + item.metric, 0),
      topHook,
    },
    opportunityScoreAnalytics: {
      averageOpportunityScore: currentSummary.opportunityScore,
      bestProductTitle: opportunityAnalytics[0]?.title || "No analyzed products yet",
      bestOpportunityScore: opportunityAnalytics[0]?.overall || 0,
    },
  };
}

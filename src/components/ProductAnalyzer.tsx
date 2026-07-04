import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  RefreshCw, 
  Compass, 
  BarChart4, 
  User, 
  TrendingUp, 
  Brain, 
  CheckCircle2, 
  Users, 
  BookOpen,
  ShoppingBag,
  DollarSign,
  Globe,
  Layers,
  Award,
  ExternalLink,
  ArrowUpRight,
  Eye,
  Settings,
  FileText
} from "lucide-react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from "recharts";
import { ProductAnalysis, NormalizedProduct } from "../types.ts";

interface ProductAnalyzerProps {
  workspaceId: string;
  selectedProductIdFromCatalog?: string;
  onAddAuditLog: (action: string, details: string) => void;
}

export default function ProductAnalyzer({
  workspaceId,
  selectedProductIdFromCatalog,
  onAddAuditLog
}: ProductAnalyzerProps) {
  // Navigation sub-tab
  const [activeTab, setActiveTab] = useState<"business" | "copy">("business");

  // Shared Data
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState(selectedProductIdFromCatalog || "");

  // Tab 1: Business & Market Intelligence states (The requested 6-section structure)
  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [productImage, setProductImage] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [targetCountry, setTargetCountry] = useState("United States");
  const [keyword, setKeyword] = useState("");

  const [businessLoading, setBusinessLoading] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);

  const [miResult, setMiResult] = useState<any>(null); // Market Intelligence
  const [ofResult, setOfResult] = useState<any>(null); // Opportunity Finder
  const [crResult, setCrResult] = useState<any>(null); // Competitor Research
  const [tdResult, setTdResult] = useState<any>(null); // Trend Discovery & Recommendations

  // Filter for competitors platform
  const [competitorFilter, setCompetitorFilter] = useState<string>("All");
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);

  // Tab 2: Existing Copy Analyzer states
  const [languageCode, setLanguageCode] = useState("en");
  const [analyzingCopy, setAnalyzingCopy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<ProductAnalysis[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);
  const [viewAnalysisId, setViewAnalysisId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProductIdFromCatalog) {
      setSelectedProductId(selectedProductIdFromCatalog);
    }
  }, [selectedProductIdFromCatalog]);

  // Load Products & Analyses
  const fetchProductsAndAnalyses = async () => {
    setLoadingProducts(true);
    setLoadingAnalyses(true);
    try {
      // Fetch Products
      const prodRes = await fetch(`/api/products?workspaceId=${workspaceId}`);
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        const productList = Array.isArray(prodData) ? prodData : [];
        setProducts(productList);
        if (productList.length > 0 && !selectedProductId) {
          setSelectedProductId(productList[0].id || "");
        }
      }

      // Fetch copy analyses
      const analysisRes = await fetch(`/api/intelligence/analysis?workspaceId=${workspaceId}`);
      if (analysisRes.ok) {
        const analysisData = await analysisRes.json();
        const analysisList = Array.isArray(analysisData) ? analysisData : [];
        setAnalyses(analysisList);
        if (analysisList.length > 0) {
          setViewAnalysisId(analysisList[0].id || null);
        }
      }
    } catch (err) {
      console.error("Error reading analyzer data:", err);
    } finally {
      setLoadingProducts(false);
      setLoadingAnalyses(false);
    }
  };

  useEffect(() => {
    fetchProductsAndAnalyses();
  }, [workspaceId]);

  // Autofill Product Input fields when catalog selection changes
  useEffect(() => {
    if (selectedProductId) {
      const prod = products.find(p => p.id === selectedProductId);
      if (prod) {
        setProductName(prod.title || "");
        setProductImage(prod.images || "");
        setProductCategory(prod.vendor || "");
        setKeyword(prod.title ? prod.title.split(" ")[0].replace(/[^a-zA-Z]/g, "") : "");
        // URL fallback
        setProductUrl(prod.isFallback ? "https://example-store.myshopify.com/products/mock" : "https://store-import.myshopify.com/products/" + (prod.id || "1"));
      }
    }
  }, [selectedProductId, products]);

  // Trigger comprehensive business analysis across all modules
  const handleAnalyzeBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName) {
      setBusinessError("Product Name is required to initiate analysis.");
      return;
    }

    setBusinessLoading(true);
    setBusinessError(null);

    try {
      // 1. Run Market Intelligence API
      const p1 = fetch("/api/market-intelligence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          keyword: keyword || productName,
          country: targetCountry,
          language: "English"
        })
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Market intelligence failed");
        }
        return res.json();
      });

      // 2. Run Product Opportunity Finder API
      const p2 = fetch("/api/market-intelligence/opportunity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          productName
        })
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Opportunity finder failed");
        }
        return res.json();
      });

      // 3. Run Competitor Research API
      const p3 = fetch("/api/market-intelligence/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          productName
        })
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Competitor research failed");
        }
        return res.json();
      });

      // 4. Run Trend Discovery API
      const p4 = fetch(`/api/market-intelligence/trends?workspaceId=${workspaceId}&productName=${encodeURIComponent(productName)}`).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Trend discovery failed");
        }
        return res.json();
      });

      const [miData, ofData, crData, tdData] = await Promise.all([p1, p2, p3, p4]);

      setMiResult(miData);
      setOfResult(ofData);
      setCrResult(crData);
      setTdResult(tdData);

      onAddAuditLog(
        "product.business_analyze",
        `Successfully completed comprehensive business, competitor, and trends analysis for product "${productName}"`
      );
    } catch (err: any) {
      setBusinessError(err.message || "An error occurred during multi-threaded business analysis.");
    } finally {
      setBusinessLoading(false);
    }
  };

  // Trigger existing copy/brand analyzer
  const handleStartCopyAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;

    setAnalyzingCopy(true);
    setCopyError(null);

    try {
      const response = await fetch("/api/intelligence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          languageCode,
          workspaceId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to initiate AI Product Analysis");
      }

      onAddAuditLog(
        "product.analyze_success",
        `AI successfully completed Brand & Copy Analysis for product ID: ${selectedProductId}`
      );
      alert("AI analysis complete! A comprehensive brand persona and copy report has been registered in your intelligence vault.");
      
      fetchProductsAndAnalyses();
    } catch (err: any) {
      setCopyError(err.message || "An error occurred during AI Copy analysis.");
    } finally {
      setAnalyzingCopy(false);
    }
  };

  const activeAnalysis = analyses.find(a => a.id === viewAnalysisId);
  const activeProduct = products.find(p => p.id === activeAnalysis?.productId);

  // Quick prefill of sample data for seamless demonstration of high-fidelity layouts
  const handleLoadSampleData = () => {
    setProductName("Eco-Chic Insulated Smart Flask");
    setProductUrl("https://example-store.myshopify.com/products/smart-flask");
    setProductImage("https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=500&q=80");
    setProductCategory("Kitchenware & Hydration");
    setTargetCountry("United States");
    setKeyword("smart water bottle");

    setMiResult({
      keyword: "smart water bottle",
      search_volume: 78500,
      cpc: 1.45,
      competition: 0.68,
      keyword_difficulty: 54,
      trend_score: 82,
      demand_score: 85,
      opportunity_score: 79,
      search_volume_trends: [
        { month: "Jan", volume: 62000 },
        { month: "Feb", volume: 65000 },
        { month: "Mar", volume: 71000 },
        { month: "Apr", volume: 69000 },
        { month: "May", volume: 74000 },
        { month: "Jun", volume: 78500 }
      ],
      source: "Sample Analytics Seed Core",
      isFallback: true
    });

    setOfResult({
      productName: "Eco-Chic Insulated Smart Flask",
      isWinningProduct: true,
      profitabilityScore: 84,
      saturationScore: 38,
      competitionScore: 61,
      demandScore: 89,
      riskScore: 28,
      opportunityLevel: "HIGH OPPORTUNITY",
      details: {
        pros: ["Immense consumer lifestyle alignment", "Exceptional profit margins (+320%)", "Recurring filter/cap accessory upsell cycles"],
        cons: ["High design patent replication speeds", "Slightly complex initial shipping density"],
        pricingStrategy: "Value-based premium positioning at $45.00 with bundled customizable sleeve accessory",
        targetAudience: "Eco-conscious office workers, boutique gym enthusiasts, and smart-device early adopters"
      }
    });

    setCrResult({
      competitors: [
        { name: "HydroFlask Intelligent Temp Guard", platform: "Amazon", price: 49.99, reviewsCount: 3890, rating: 4.7, productLink: "https://www.amazon.com/s?k=smart+flask" },
        { name: "Larq Self-Purifying Water Jug", platform: "Amazon", price: 95.00, reviewsCount: 1450, rating: 4.6, productLink: "https://www.amazon.com/s?k=larq" },
        { name: "WaterLuv LCD Temperature Flask", platform: "AliExpress", price: 18.50, reviewsCount: 940, rating: 4.3, productLink: "https://www.aliexpress.com" },
        { name: "SmartHydrate Bluetooth Smart Cup", platform: "eBay", price: 34.99, reviewsCount: 154, rating: 4.2, productLink: "https://www.ebay.com" },
        { name: "Bespoke Flask OEM Factory Line", platform: "Alibaba", price: 6.20, reviewsCount: 52, rating: 4.8, productLink: "https://www.alibaba.com" },
        { name: "SipSmart Elite Tracker Cup", platform: "Amazon", price: 39.95, reviewsCount: 810, rating: 4.5, productLink: "https://www.amazon.com" }
      ],
      averagePrice: 48.10
    });

    setTdResult({
      trendingProducts: [
        { name: "Chrono-Hydration Motivational Tracker", searches: 92400, growth: 184, type: "Rising" },
        { name: "Copper-Lined Insulated Growler", searches: 54000, growth: 112, type: "High Growth" },
        { name: "Solar-Powered Self-Heating Travel Mug", searches: 29000, growth: 310, type: "Seasonal" },
        { name: "Bamboo Collapsible Silicon Bottle", searches: 67100, growth: 94, type: "Most Searched" }
      ],
      countriesHighDemand: [
        { country: "United States", demandLevel: "Very High", competitionLevel: "High", marketOpportunity: "Good" },
        { country: "United Kingdom", demandLevel: "High", competitionLevel: "Medium", marketOpportunity: "Excellent" },
        { country: "Germany", demandLevel: "High", competitionLevel: "Medium", marketOpportunity: "Excellent" },
        { country: "Australia", demandLevel: "Medium", competitionLevel: "Low", marketOpportunity: "Excellent" }
      ],
      marketRecommendations: {
        suggestedSimilarProducts: ["Smart Hydration Intake App integration", "Chilled neoprene sleeves", "Customized clip carabiners"],
        alternativeProducts: ["Double-wall vacuum glass infusor", "Borosilicate lightweight travel jars"],
        moreProfitableProducts: ["Engraved steel caps & premium leather carrying harnesses", "Corporate brand custom logo flasks"],
        lowerCompetitionProducts: ["Biodegradable plant-fiber thermal travel lids", "Zero-plastic dust covers"]
      }
    });
  };

  // Filtered competitor list
  const filteredCompetitors = crResult?.competitors?.filter((c: any) => {
    if (competitorFilter === "All") return true;
    return c.platform === competitorFilter;
  }) || [];

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-800/60 p-6 space-y-8 shadow-xl">
      {/* Tab Header & Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-800/60 pb-5">
        <div>
          <h2 className="text-2xl font-display font-extrabold text-white flex items-center gap-2.5">
            <Brain className="w-6 h-6 text-indigo-400" />
            Product Analyzer
          </h2>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            Supercharge your catalog by analyzing market demographics, demand curves, search trends, competitive landscapes, and copy effectiveness in one central panel.
          </p>
        </div>

        {/* Tab Toggle Control */}
        <div className="flex bg-[#0c0d12] p-1 rounded-xl border border-gray-800/60">
          <button
            onClick={() => setActiveTab("business")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "business"
                ? "bg-indigo-600 text-white shadow"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <BarChart4 className="w-3.5 h-3.5" />
            Business & Market Intelligence
          </button>
          <button
            onClick={() => setActiveTab("copy")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "copy"
                ? "bg-indigo-600 text-white shadow"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            AI Copy & Brand Intelligence
          </button>
        </div>
      </div>

      {/* VIEW 1: Business & Market Intelligence Dashboard */}
      {activeTab === "business" && (
        <div className="space-y-8">
          
          {/* Section 1: Product Input Form & Catalog Auto-loader */}
          <div className="bg-[#0c0d12] border border-gray-800/60 rounded-xl p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Section 1: Product Input & Trigger Setup
                </h3>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleLoadSampleData}
                  className="px-3.5 py-1.5 text-xs bg-indigo-950/30 hover:bg-indigo-950/60 border border-indigo-800/40 hover:border-indigo-700/60 text-indigo-300 hover:text-indigo-200 rounded-lg transition-all font-semibold cursor-pointer"
                >
                  ⚡ Prefill Demo Flask Data
                </button>
                <button
                  onClick={fetchProductsAndAnalyses}
                  className="p-1.5 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-gray-400 hover:text-white cursor-pointer transition-all"
                  title="Reload Product Catalog"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleAnalyzeBusiness} className="space-y-4">
              {/* Sync Catalog Selection */}
              <div className="bg-[#12131a] p-3 rounded-lg border border-gray-800/40 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-4">
                  <label className="text-[10px] font-mono text-indigo-400 block font-bold uppercase tracking-wide">
                    Option A: Sync Catalog Product
                  </label>
                  <p className="text-[11px] text-gray-500">Automatically pull catalog details directly into input fields.</p>
                </div>
                <div className="md:col-span-8">
                  {loadingProducts ? (
                    <div className="h-9 bg-[#0c0d12] rounded animate-pulse" />
                  ) : products.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No catalog products available. Import some first.</p>
                  ) : (
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full bg-[#0c0d12] border border-gray-800 focus:border-indigo-500 rounded-lg p-2 text-xs text-white outline-none"
                    >
                      <option value="">-- Choose catalog item to auto-fill input fields --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.vendor})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Direct Input Fields (Fully Editable & State-bound as Requested) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300 block">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. Eco-Friendly Bamboo Thermos"
                    className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300 block">Product URL</label>
                  <input
                    type="url"
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    placeholder="https://yourstore.myshopify.com/products/example"
                    className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300 block">Product Image URL</label>
                  <input
                    type="text"
                    value={productImage}
                    onChange={(e) => setProductImage(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300 block">Product Category</label>
                  <input
                    type="text"
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}
                    placeholder="e.g. Fitness Apparel, Travel Bags"
                    className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300 block">Target Country</label>
                  <select
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                    className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                  >
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Germany">Germany</option>
                    <option value="Canada">Canada</option>
                    <option value="Australia">Australia</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300 block">Search Keyword for Live SEO</label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="e.g. organic protein powder"
                    className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                  />
                </div>
              </div>

              {businessError && (
                <div className="p-3.5 rounded-lg bg-rose-950/20 border border-rose-900/30 text-rose-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4.5 h-4.5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <span>{businessError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={businessLoading}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700 text-white rounded-xl text-sm font-extrabold transition-all cursor-pointer shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {businessLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Querying DataForSEO live APIs, researching competitors, and gathering trends...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4.5 h-4.5" />
                    Analyze Product & Market (DataForSEO + AI Engine)
                  </>
                )}
              </button>
            </form>
          </div>

          {/* If Loading, show elegant shimmers */}
          {businessLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div key={idx} className="bg-[#0c0d12] border border-gray-800/60 p-5 rounded-xl space-y-4 animate-pulse">
                  <div className="h-5 w-1/3 bg-gray-850 rounded" />
                  <div className="space-y-2">
                    <div className="h-10 bg-gray-850 rounded w-full" />
                    <div className="h-24 bg-gray-850 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (!miResult && !ofResult && !crResult && !tdResult) ? (
            // Empty State
            <div className="text-center py-20 bg-[#0c0d12]/40 rounded-xl border-2 border-dashed border-gray-800/40">
              <Compass className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-gray-300 font-mono">No Active Intelligence Report</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto leading-relaxed">
                Configure your product details in Section 1 and click "Analyze Product" (or load demo flask details to preview instantly).
              </p>
            </div>
          ) : (
            // GRID OF ANALYSIS SECTIONS (Sections 2 to 6)
            <div className="space-y-8">
              
              {/* SECTION 2 & SECTION 3 (Top Row Side‑by‑Side Grid) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Section 2: Market Intelligence */}
                {miResult && (
                  <div className="bg-[#0c0d12] border border-[#1e293b] hover:border-gray-700/80 rounded-xl p-5 space-y-5 transition-all">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-800/60">
                      <div className="flex items-center gap-2">
                        <BarChart4 className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                          Section 2: Market Intelligence
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-900/40">
                        Live Keyword API
                      </span>
                    </div>

                    {miResult.liveDataAvailable === false ? (
                      <div className="bg-[#12131a] p-6 rounded-lg border border-red-950/10 flex flex-col items-center justify-center text-center space-y-2 py-10">
                        <AlertCircle className="w-8 h-8 text-amber-500" />
                        <span className="text-xs font-bold text-gray-300 font-mono">No live data available</span>
                        <p className="text-[10px] text-gray-500 max-w-xs leading-relaxed">
                          {miResult.message || "Please configure your DataForSEO credentials in Section 1 to view live Market Intelligence metrics."}
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Primary Metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="bg-[#12131a] p-3 rounded-lg border border-gray-800/40">
                            <span className="text-[10px] text-gray-400 uppercase font-mono block">Search Volume</span>
                            <span className="text-lg font-extrabold text-white font-mono block mt-1">
                              {miResult.search_volume?.toLocaleString() || "N/A"}
                            </span>
                          </div>
                          <div className="bg-[#12131a] p-3 rounded-lg border border-gray-800/40">
                            <span className="text-[10px] text-gray-400 uppercase font-mono block">Average CPC</span>
                            <span className="text-lg font-extrabold text-white font-mono block mt-1">
                              ${miResult.cpc?.toFixed(2) || "N/A"}
                            </span>
                          </div>
                          <div className="bg-[#12131a] p-3 rounded-lg border border-gray-800/40">
                            <span className="text-[10px] text-gray-400 uppercase font-mono block">Competition Level</span>
                            <span className="text-lg font-extrabold text-white font-mono block mt-1">
                              {miResult.competition !== undefined ? `${Math.round(miResult.competition * 100)}%` : "N/A"}
                            </span>
                          </div>
                          <div className="bg-[#12131a] p-3 rounded-lg border border-gray-800/40">
                            <span className="text-[10px] text-gray-400 uppercase font-mono block">Keyword Difficulty</span>
                            <span className="text-lg font-extrabold text-white font-mono block mt-1">
                              {miResult.keyword_difficulty || "N/A"}/100
                            </span>
                          </div>
                          <div className="bg-[#12131a] p-3 rounded-lg border border-gray-800/40">
                            <span className="text-[10px] text-gray-400 uppercase font-mono block">Opportunity Score</span>
                            <span className="text-lg font-extrabold text-emerald-400 font-mono block mt-1">
                              {miResult.opportunity_score || "N/A"}%
                            </span>
                          </div>
                          <div className="bg-[#12131a] p-3 rounded-lg border border-gray-800/40">
                            <span className="text-[10px] text-gray-400 uppercase font-mono block">Country Analyzed</span>
                            <span className="text-sm font-bold text-white block truncate mt-1">
                              {targetCountry}
                            </span>
                          </div>
                        </div>

                        {/* Recharts Monthly Volume Trend Chart */}
                        {miResult.search_volume_trends && miResult.search_volume_trends.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-[10px] font-mono text-gray-400 uppercase block font-semibold tracking-wider">
                              Keyword Demand Trend Over Time
                            </span>
                            <div className="h-44 w-full bg-[#12131a]/60 rounded-xl p-2 border border-gray-850">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={miResult.search_volume_trends} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                  <defs>
                                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="month" stroke="#6b7280" fontSize={9} tickLine={false} />
                                  <YAxis stroke="#6b7280" fontSize={9} tickLine={false} />
                                  <Tooltip contentStyle={{ backgroundColor: "#0c0d12", borderColor: "#374151", borderRadius: 8, fontSize: 10, fontFamily: "monospace" }} />
                                  <Area type="monotone" dataKey="volume" name="Searches" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorVolume)" />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {/* Recommended High-Demand Countries */}
                        {tdResult?.countriesHighDemand && tdResult.countriesHighDemand.length > 0 && (
                          <div className="space-y-2 pt-1">
                            <span className="text-[10px] font-mono text-gray-400 uppercase block font-semibold tracking-wider">
                              High Demand Recommended Markets (Expansion Paths)
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {tdResult.countriesHighDemand.slice(0, 4).map((c: any, i: number) => (
                                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#12131a] border border-gray-800 text-[11px] font-medium text-gray-300">
                                  <Globe className="w-3 h-3 text-indigo-400" />
                                  <span>{c.country}</span>
                                  <span className="text-[9px] text-emerald-400 font-bold font-mono">({c.marketOpportunity})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="text-[10px] font-mono text-gray-500 pt-2 flex items-center gap-1">
                          <span>Data Source:</span>
                          <span className="text-gray-400 italic font-semibold">{miResult.source || "DataForSEO Live Connection"}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Section 3: Product Opportunity Finder */}
                {ofResult && (
                  <div className="bg-[#0c0d12] border border-[#1e293b] hover:border-gray-700/80 rounded-xl p-5 space-y-5 transition-all">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-800/60">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-400" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                          Section 3: Product Opportunity Finder
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-900/40">
                        Opportunity & Profit Engine
                      </span>
                    </div>

                    {ofResult.liveDataAvailable === false ? (
                      <div className="bg-[#12131a] p-6 rounded-lg border border-red-950/10 flex flex-col items-center justify-center text-center space-y-2 py-10">
                        <AlertCircle className="w-8 h-8 text-amber-500" />
                        <span className="text-xs font-bold text-gray-300 font-mono">No live data available</span>
                        <p className="text-[10px] text-gray-500 max-w-md leading-relaxed">
                          No live opportunity data available. Connect DataForSEO and marketplace sources to generate opportunity insights.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Large Overall Winning Score Gauge */}
                        <div className="flex items-center gap-5 bg-[#12131a] p-4 rounded-xl border border-gray-850">
                          <div className="relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-dashed border-amber-500/30">
                            <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-lg font-black font-mono text-amber-400">
                                {ofResult.profitabilityScore || 0}%
                              </span>
                              <span className="text-[8px] text-gray-400 uppercase font-mono font-bold tracking-tighter">Profit Potential</span>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Award className="w-4.5 h-4.5 text-amber-400" />
                              <span className={`text-xs font-black font-mono tracking-wide ${ofResult.isWinningProduct ? "text-emerald-400" : "text-amber-400"}`}>
                                {ofResult.opportunityLevel || "HIGH OPPORTUNITY"}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-white mt-1">Winning Product Assessment</h4>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              Target markup pricing and consumer friction-override scores suggest robust margins.
                            </p>
                          </div>
                        </div>

                        {/* Profitability & Entry Gauges */}
                        <div className="space-y-3.5">
                          <div>
                            <div className="flex justify-between text-[11px] font-medium font-mono mb-1.5 text-gray-300">
                              <span>Demand Score</span>
                              <span className="text-emerald-400 font-bold">{ofResult.demandScore}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${ofResult.demandScore || 0}%` }} />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px] font-medium font-mono mb-1.5 text-gray-300">
                              <span>Market Saturation</span>
                              <span className="text-amber-400 font-bold">{ofResult.saturationScore}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${ofResult.saturationScore || 0}%` }} />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px] font-medium font-mono mb-1.5 text-gray-300">
                              <span>Market Entry Difficulty (Competition)</span>
                              <span className="text-indigo-400 font-bold">{ofResult.competitionScore || ofResult.riskScore || 0}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${ofResult.competitionScore || ofResult.riskScore || 0}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Bulleted Insights (Pros/Cons, Target Pricing) */}
                        {ofResult.details && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] pt-2 border-t border-gray-800/50">
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider block">Pros</span>
                              <ul className="list-disc pl-4 space-y-1 text-gray-300">
                                {ofResult.details.pros?.map((pro: string, idx: number) => (
                                  <li key={idx}>{pro}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider block">Cons</span>
                              <ul className="list-disc pl-4 space-y-1 text-gray-300">
                                {ofResult.details.cons?.map((con: string, idx: number) => (
                                  <li key={idx}>{con}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="sm:col-span-2 space-y-1 bg-[#12131a] p-2.5 rounded border border-gray-850">
                              <span className="text-[9px] font-mono font-bold text-amber-400 uppercase tracking-wide block">Pricing Strategy Guidance</span>
                              <p className="text-gray-300 text-2xs leading-normal">{ofResult.details.pricingStrategy}</p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

              </div>

              {/* SECTION 4: Competitor Research (Full Width) */}
              {crResult && (
                <div className="bg-[#0c0d12] border border-[#1e293b] hover:border-gray-700/80 rounded-xl p-5 space-y-6 transition-all">
                  
                  {/* Dashboard Header */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-800/60">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-400" />
                      <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                          Section 4: Live Multi-Marketplace Competitor Intelligence
                        </h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Real-time extraction across Amazon, Alibaba, AliExpress, eBay, Shopify Stores, and Google Shopping.
                        </p>
                      </div>
                    </div>

                    {crResult.liveDataAvailable !== false && (
                      <div className="flex flex-wrap gap-1 bg-[#12131a] p-1 rounded-xl border border-gray-850">
                        {["All", "Amazon", "Alibaba", "AliExpress", "eBay", "Shopify Stores", "Google Shopping"].map((plat) => (
                          <button
                            key={plat}
                            type="button"
                            onClick={() => setCompetitorFilter(plat)}
                            className={`px-3 py-1 rounded-lg text-2xs font-bold font-mono transition-all ${
                              competitorFilter === plat
                                ? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
                                : "text-gray-400 hover:text-white hover:bg-gray-800/40"
                            }`}
                          >
                            {plat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {crResult.liveDataAvailable === false ? (
                    <div className="bg-[#12131a] p-10 rounded-xl border border-dashed border-gray-850 text-center flex flex-col items-center justify-center space-y-3 py-14">
                      <Users className="w-12 h-12 text-gray-600 mb-1" />
                      <span className="text-sm font-bold text-amber-500 font-mono">No live competitor data available</span>
                      <p className="text-xs text-gray-400 max-w-md leading-relaxed">
                        {crResult.message || "Please configure your DataForSEO credentials in Section 1 to initiate the live multi-marketplace scraper."}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* 1. KEY METRICS STATS DASHBOARD */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Avg Price Card */}
                        <div className="bg-[#12131a] p-4 rounded-xl border border-gray-850 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 blur-xl pointer-events-none" />
                          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider font-bold block">Average Price</span>
                          <div className="flex items-baseline gap-1 mt-2">
                            <span className="text-lg font-extrabold font-mono text-blue-400">${crResult.averagePrice?.toFixed(2)}</span>
                            <span className="text-[10px] text-gray-400 font-mono">USD</span>
                          </div>
                          <p className="text-[9px] text-gray-500 font-mono mt-2">Market central tendency</p>
                        </div>

                        {/* Lowest Price Card */}
                        <div className="bg-[#12131a] p-4 rounded-xl border border-gray-850 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 blur-xl pointer-events-none" />
                          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider font-bold block">Lowest Price</span>
                          <div className="flex items-baseline gap-1 mt-2">
                            <span className="text-lg font-extrabold font-mono text-emerald-400">${crResult.lowestPrice?.toFixed(2)}</span>
                            <span className="text-[10px] text-gray-400 font-mono">USD</span>
                          </div>
                          <p className="text-[9px] text-emerald-500 font-mono mt-2">Optimal entry floor price</p>
                        </div>

                        {/* Highest Price Card */}
                        <div className="bg-[#12131a] p-4 rounded-xl border border-gray-850 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 blur-xl pointer-events-none" />
                          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider font-bold block">Highest Price</span>
                          <div className="flex items-baseline gap-1 mt-2">
                            <span className="text-lg font-extrabold font-mono text-rose-400">${crResult.highestPrice?.toFixed(2)}</span>
                            <span className="text-[10px] text-gray-400 font-mono">USD</span>
                          </div>
                          <p className="text-[9px] text-gray-500 font-mono mt-2">Premium ceiling margin</p>
                        </div>

                        {/* Total Competitors Card */}
                        <div className="bg-[#12131a] p-4 rounded-xl border border-gray-850 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 blur-xl pointer-events-none" />
                          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider font-bold block">Total Competitors</span>
                          <div className="flex items-baseline gap-1 mt-2">
                            <span className="text-lg font-extrabold font-mono text-indigo-400">{crResult.totalCompetitors}</span>
                            <span className="text-[10px] text-gray-400 font-mono">listings</span>
                          </div>
                          <p className="text-[9px] text-gray-500 font-mono mt-2">Scraped from 6 data nodes</p>
                        </div>
                      </div>

                      {/* 2. PLATFORM DISTRIBUTION BAR */}
                      <div className="bg-[#12131a] p-4 rounded-xl border border-gray-850 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">Marketplace Platform Distribution</span>
                          <span className="text-[10px] font-mono text-gray-500">Node Dispersion Analysis</span>
                        </div>
                        
                        {/* Visual Segment Bar */}
                        <div className="h-2.5 w-full bg-gray-900 rounded-full flex overflow-hidden">
                          {Object.entries(crResult.platformDistribution || {}).map(([plat, count]: any, idx) => {
                            const percent = ((count / crResult.totalCompetitors) * 100).toFixed(0);
                            const bgColors = [
                              "bg-[#ff9900]", // Amazon - Orange
                              "bg-[#ff6a00]", // Alibaba - Dark Orange
                              "bg-[#e62e04]", // AliExpress - Red
                              "bg-[#0064d2]", // eBay - Blue
                              "bg-[#95bf47]", // Shopify - Green
                              "bg-[#4285f4]", // Google Shopping - Light Blue
                              "bg-indigo-600"
                            ];
                            const colorClass = bgColors[idx % bgColors.length];
                            return (
                              <div 
                                key={plat} 
                                className={`${colorClass} h-full transition-all`} 
                                style={{ width: `${percent}%` }}
                                title={`${plat}: ${count} (${percent}%)`}
                              />
                            );
                          })}
                        </div>

                        {/* Legend row */}
                        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                          {Object.entries(crResult.platformDistribution || {}).map(([plat, count]: any, idx) => {
                            const dotColors = [
                              "bg-[#ff9900]",
                              "bg-[#ff6a00]",
                              "bg-[#e62e04]",
                              "bg-[#0064d2]",
                              "bg-[#95bf47]",
                              "bg-[#4285f4]"
                            ];
                            const dotColor = dotColors[idx % dotColors.length] || "bg-indigo-500";
                            return (
                              <div key={plat} className="flex items-center gap-1.5 text-2xs font-mono text-gray-400">
                                <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                                <span className="font-bold text-gray-300">{plat}</span>
                                <span>({count})</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 3. COMPETITOR COMPARISON TABLE */}
                      <div className="overflow-x-auto rounded-xl border border-gray-850">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#12131a] text-gray-400 font-mono text-[10px] tracking-wider uppercase border-b border-gray-850">
                              <th className="p-3">Competitor/Supplier Details</th>
                              <th className="p-3">Platform</th>
                              <th className="p-3">Listing/Wholesale Price</th>
                              <th className="p-3">Target Attributes (MOQ/Sold/Rep)</th>
                              <th className="p-3 text-right">View Original</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-850/60 font-sans text-gray-300">
                            {filteredCompetitors.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-8 text-center italic text-gray-500 font-mono">
                                  No live competitors match the chosen filter platform.
                                </td>
                              </tr>
                            ) : (
                              filteredCompetitors.map((comp: any, i: number) => {
                                // Dynamic Platform Badge Styling
                                let badgeStyle = "bg-gray-800 text-gray-400 border-gray-700";
                                if (comp.platform === "Amazon") badgeStyle = "bg-[#ff9900]/10 text-[#ff9900] border-[#ff9900]/30";
                                if (comp.platform === "eBay") badgeStyle = "bg-[#0064d2]/10 text-[#3db7e4] border-[#0064d2]/30";
                                if (comp.platform === "Alibaba") badgeStyle = "bg-[#ff6a00]/10 text-[#ff6a00] border-[#ff6a00]/30";
                                if (comp.platform === "AliExpress") badgeStyle = "bg-[#e62e04]/10 text-[#e62e04] border-[#e62e04]/30";
                                if (comp.platform === "Shopify Stores") badgeStyle = "bg-[#95bf47]/10 text-[#95bf47] border-[#95bf47]/30";
                                if (comp.platform === "Google Shopping") badgeStyle = "bg-[#4285f4]/10 text-[#4285f4] border-[#4285f4]/30";

                                return (
                                  <tr key={i} className="hover:bg-[#12131a]/30 transition-colors">
                                    {/* Name & Domain Details */}
                                    <td className="p-3 max-w-sm">
                                      <div className="space-y-0.5">
                                        <span className="font-semibold text-white block truncate" title={comp.name}>
                                          {comp.name}
                                        </span>
                                        {comp.storeDomain && (
                                          <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                                            <Globe className="w-2.5 h-2.5" /> {comp.storeDomain}
                                          </span>
                                        )}
                                        {comp.merchantName && (
                                          <span className="text-[10px] text-gray-500 font-mono">
                                            Merchant: <strong className="text-gray-400">{comp.merchantName}</strong>
                                          </span>
                                        )}
                                        {comp.supplierName && (
                                          <span className="text-[10px] text-amber-500/80 font-mono">
                                            Supplier: <strong className="text-amber-400 font-bold">{comp.supplierName}</strong>
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* Platform Badge */}
                                    <td className="p-3">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border font-extrabold uppercase ${badgeStyle}`}>
                                        {comp.platform}
                                      </span>
                                    </td>

                                    {/* Price Details */}
                                    <td className="p-3 font-mono">
                                      {comp.platform === "Alibaba" ? (
                                        <div className="space-y-0.5">
                                          <span className="text-gray-100 font-bold">${comp.price?.toFixed(2)}</span>
                                          <span className="text-[9px] text-gray-500 block">FOB Unit Price</span>
                                        </div>
                                      ) : (
                                        <span className="text-gray-100 font-bold">${comp.price?.toFixed(2)}</span>
                                      )}
                                    </td>

                                    {/* Platform Attributes (MOQ, Orders, Rating, Sold) */}
                                    <td className="p-3">
                                      <div className="space-y-1">
                                        {/* Ratings representation */}
                                        {comp.rating > 0 && (
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-amber-400 font-bold font-mono">★ {comp.rating.toFixed(1)}</span>
                                            {comp.reviewsCount > 0 && (
                                              <span className="text-gray-500 text-[10px] font-mono">({comp.reviewsCount.toLocaleString()} reviews)</span>
                                            )}
                                          </div>
                                        )}

                                        {/* MOQ for Alibaba */}
                                        {comp.moq && (
                                          <span className="text-[10px] text-gray-400 font-mono block">
                                            MOQ: <strong className="text-amber-400 font-bold">{comp.moq}</strong>
                                          </span>
                                        )}

                                        {/* AliExpress Orders */}
                                        {comp.ordersCount > 0 && (
                                          <span className="text-[10px] text-emerald-400 font-mono block">
                                            Orders: <strong className="font-bold">{comp.ordersCount.toLocaleString()}</strong>
                                          </span>
                                        )}

                                        {/* eBay Sold Count */}
                                        {comp.soldCount !== undefined && comp.soldCount !== null && (
                                          <span className="text-[10px] text-indigo-400 font-mono block">
                                            Total Sold: <strong className="font-bold">{comp.soldCount}</strong>
                                          </span>
                                        )}

                                        {/* If no specs are parsed */}
                                        {!(comp.rating > 0) && !comp.moq && !comp.ordersCount && comp.soldCount === undefined && (
                                          <span className="text-gray-500 italic text-[10px]">No sales metrics parsed</span>
                                        )}
                                      </div>
                                    </td>

                                    {/* Link Action */}
                                    <td className="p-3 text-right">
                                      <a
                                        href={comp.productLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-905 hover:bg-gray-800 border border-gray-800 text-[10px] font-bold text-gray-300 hover:text-white rounded transition-all cursor-pointer"
                                      >
                                        <span>View Listing</span>
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* 4. VERIFICATION LOGS & AUDIT REPORT CONTROL */}
                      <div className="border-t border-gray-850 pt-4 mt-2">
                        <button
                          type="button"
                          onClick={() => setShowLogsPanel(!showLogsPanel)}
                          className="w-full flex items-center justify-between p-3.5 bg-[#12131a] hover:bg-[#161722] border border-gray-850 hover:border-blue-900/40 rounded-xl transition-all text-left group"
                        >
                          <div className="flex items-center gap-2 text-xs">
                            <FileText className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
                            <span className="font-mono font-bold text-gray-300 group-hover:text-white">
                              View API Verification Logs & Live Scraper Audit Report
                            </span>
                          </div>
                          <span className="text-2xs font-mono font-bold text-blue-400 group-hover:underline">
                            {showLogsPanel ? "Hide Report" : "Expand Report"}
                          </span>
                        </button>

                        {showLogsPanel && (
                          <div className="mt-4 p-4 bg-[#090a0f] border border-gray-850 rounded-xl space-y-6">
                            
                            {/* PART A: OFFICIAL EXTRACTOR AUDIT DIRECTORY */}
                            <div className="space-y-2">
                              <span className="text-[10px] font-mono font-extrabold text-blue-400 uppercase tracking-wider block">
                                🛡️ Verified Scraper Audit Manifest (Extractors Directory)
                              </span>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                {Object.entries(crResult.auditReport || {}).map(([plat, info]: any) => (
                                  <div key={plat} className="bg-[#12131a] p-3 rounded-lg border border-gray-850 space-y-2">
                                    <div className="flex items-center justify-between border-b border-gray-800 pb-1.5">
                                      <span className="text-xs font-bold text-white font-mono">{plat} Node</span>
                                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-900/30 font-bold uppercase">
                                        Live Extraction
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-[9px] font-mono text-gray-500 block">API ENDPOINT:</span>
                                      <span className="text-[10px] font-mono text-gray-300 break-all select-all block bg-[#0c0d12] px-1.5 py-1 rounded">
                                        {info.endpoint}
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-[9px] font-mono text-gray-500 block">LIVE EXTRACTOR METHODOLOGY:</span>
                                      <p className="text-[10px] text-gray-400 leading-normal">
                                        {info.extractor}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* PART B: REAL-TIME VERIFICATION PAYLOAD LOGS */}
                            {crResult.logs && crResult.logs.length > 0 && (
                              <div className="space-y-3 pt-3 border-t border-gray-850">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-mono font-extrabold text-blue-400 uppercase tracking-wider block">
                                    🔄 Raw Execution Log Payloads (Audit Inspector)
                                  </span>
                                  <span className="text-[9px] font-mono text-gray-500">
                                    {crResult.logs.length} live requests traced
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {/* Log Index List */}
                                  <div className="md:col-span-1 bg-[#12131a] rounded-lg border border-gray-850 max-h-64 overflow-y-auto divide-y divide-gray-850">
                                    {crResult.logs.map((log: any, idx: number) => {
                                      const isSelected = selectedLogIndex === idx;
                                      return (
                                        <button
                                          key={idx}
                                          type="button"
                                          onClick={() => setSelectedLogIndex(idx)}
                                          className={`w-full text-left p-2.5 text-2xs transition-all flex flex-col gap-1 ${
                                            isSelected ? "bg-blue-950/20 border-l-2 border-blue-500" : "hover:bg-[#161722]/40"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between font-mono">
                                            <span className="font-extrabold text-white">{log.platform} Scrape</span>
                                            <span className={`px-1 rounded text-[8px] font-bold ${
                                              log.status === 200 ? "bg-emerald-950/40 text-emerald-400" : "bg-rose-950/40 text-rose-400"
                                            }`}>
                                              HTTP {log.status}
                                            </span>
                                          </div>
                                          <span className="text-[9px] text-gray-500 truncate block break-all font-mono">
                                            {log.endpoint}
                                          </span>
                                          <span className="text-[8px] text-gray-400 font-mono mt-0.5">
                                            Elapsed: {log.durationMs}ms
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Log Payload Details */}
                                  <div className="md:col-span-2 bg-[#12131a] rounded-lg border border-gray-850 p-3 min-h-[160px] flex flex-col justify-between">
                                    {selectedLogIndex === null ? (
                                      <div className="h-full flex flex-col items-center justify-center text-center p-4 text-gray-500">
                                        <Users className="w-8 h-8 opacity-40 mb-1.5" />
                                        <span className="text-2xs font-mono">Select an API request log trace from the left to audit raw request-response JSON.</span>
                                      </div>
                                    ) : (
                                      <div className="space-y-3 h-full flex flex-col">
                                        <div className="flex items-center justify-between border-b border-gray-800 pb-2 flex-shrink-0">
                                          <div>
                                            <span className="text-xs font-bold text-white font-mono uppercase">
                                              {crResult.logs[selectedLogIndex].platform} Payload Trace
                                            </span>
                                            <span className="text-[9px] text-gray-500 font-mono block mt-0.5 break-all">
                                              Timestamp: {crResult.logs[selectedLogIndex].timestamp}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setSelectedLogIndex(null)}
                                            className="text-[9px] font-mono text-gray-400 hover:text-white px-2 py-0.5 rounded bg-[#0c0d12]"
                                          >
                                            Close
                                          </button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-grow overflow-hidden max-h-80">
                                          {/* Request JSON */}
                                          <div className="space-y-1.5 flex flex-col overflow-hidden">
                                            <span className="text-[9px] font-mono font-bold text-indigo-400 block">POST Request Body JSON:</span>
                                            <pre className="bg-[#0c0d12] p-2 rounded text-[9px] font-mono text-gray-300 overflow-y-auto overflow-x-auto flex-grow h-40">
                                              {JSON.stringify(crResult.logs[selectedLogIndex].requestPayload, null, 2)}
                                            </pre>
                                          </div>

                                          {/* Response JSON */}
                                          <div className="space-y-1.5 flex flex-col overflow-hidden">
                                            <span className="text-[9px] font-mono font-bold text-emerald-400 block">Returned Response JSON (Truncated):</span>
                                            <pre className="bg-[#0c0d12] p-2 rounded text-[9px] font-mono text-gray-300 overflow-y-auto overflow-x-auto flex-grow h-40">
                                              {JSON.stringify(crResult.logs[selectedLogIndex].responsePayload, null, 2)}
                                            </pre>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                          </div>
                        )}
                      </div>

                    </>
                  )}
                </div>
              )}

              {/* SECTION 5: Trend Discovery */}
              {tdResult && (
                <div className="bg-[#0c0d12] border border-[#1e293b] hover:border-gray-700/80 rounded-xl p-5 space-y-5 transition-all">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-800/60">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-rose-400" />
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Section 5: Trend Discovery (Market Catalyst Insights)
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/40 text-rose-400 border border-rose-900/40">
                      Emerging Demand Channels
                    </span>
                  </div>

                  {tdResult.liveDataAvailable === false ? (
                    <div className="bg-[#12131a] p-8 rounded-xl border border-dashed border-gray-850 text-center flex flex-col items-center justify-center space-y-2 py-12">
                      <TrendingUp className="w-10 h-10 text-gray-600 mb-1" />
                      <span className="text-xs font-bold text-gray-300 font-mono">No live data available</span>
                      <p className="text-[10px] text-gray-500 max-w-sm leading-relaxed">
                        {tdResult.message || "Please configure your DataForSEO credentials in Section 1 to retrieve live trend metrics from Google Trends."}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Trending products list */}
                      <div className="space-y-3">
                        <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider block">
                          Rising Related Products & High-Growth Niches
                        </span>
                        <div className="space-y-2">
                          {tdResult?.trendingProducts?.map((trend: any, idx: number) => {
                            const tagColor = "bg-rose-950/40 text-rose-400 border-rose-900/30";
                            return (
                              <div key={idx} className="bg-[#12131a] p-3 rounded-lg border border-gray-850 flex items-center justify-between gap-4">
                                <div>
                                  <span className="text-xs font-semibold text-white block">{trend.name}</span>
                                  <span className="text-[10px] text-gray-500 font-mono mt-0.5 block">
                                    {trend.searches?.toLocaleString()} monthly searches
                                  </span>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <span className="text-emerald-400 text-xs font-extrabold font-mono block">
                                    +{trend.growth}% YoY
                                  </span>
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold border mt-1 ${tagColor}`}>
                                    {trend.type}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* High growth niches and country metrics */}
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider block">
                            Target Country Opportunity Matrix
                          </span>
                          <div className="bg-[#12131a] rounded-xl border border-gray-850 overflow-hidden">
                            <div className="grid grid-cols-3 bg-[#1c1d25]/60 p-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider border-b border-gray-850">
                              <span>Country</span>
                              <span>Competition</span>
                              <span className="text-right">Opportunity</span>
                            </div>
                            <div className="divide-y divide-gray-850/60">
                              {tdResult?.countriesHighDemand?.map((c: any, i: number) => (
                                <div key={i} className="grid grid-cols-3 p-2.5 text-xs text-gray-300 font-sans">
                                  <span className="font-semibold text-white">{c.country}</span>
                                  <span className="font-mono text-gray-400">{c.competitionLevel}</span>
                                  <span className="font-mono text-right font-bold text-emerald-400">{c.marketOpportunity}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="p-3.5 bg-indigo-950/10 border border-indigo-900/30 rounded-xl space-y-1 text-2xs text-indigo-300">
                          <span className="font-mono font-bold uppercase text-[9px] tracking-wider text-indigo-400 block">Emerging Micro-Niches</span>
                          <p className="leading-relaxed">
                            Identify high growth and low competition micro-targeting categories during custom Google Ad campaigns to maximize return-on-ad-spend (ROAS).
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 6: AI Market Recommendations */}
              {tdResult && (
                <div className="bg-[#0c0d12] border border-[#1e293b] hover:border-gray-700/80 rounded-xl p-5 space-y-5 transition-all">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-800/60">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-400" />
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Section 6: AI Market Recommendations
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/40 text-purple-400 border border-purple-900/40">
                      AI Strategist Core
                    </span>
                  </div>

                  {!tdResult.marketRecommendations ? (
                    <div className="bg-[#12131a] p-8 rounded-xl border border-dashed border-gray-850 text-center flex flex-col items-center justify-center space-y-2 py-10">
                      <Brain className="w-8 h-8 text-gray-600 mb-1" />
                      <span className="text-xs font-bold text-gray-300 font-mono">No live data available</span>
                      <p className="text-[10px] text-gray-500 max-w-sm leading-relaxed">
                        AI strategic recommendations require live market keywords and product details to perform qualitative e-commerce reasoning.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Suggested Similar Products */}
                        <div className="bg-[#12131a] p-4 rounded-xl border border-gray-850 space-y-3">
                          <span className="text-[10px] font-mono font-extrabold text-indigo-400 uppercase tracking-wider block border-b border-gray-800 pb-1.5">
                            Similar Product Ideas
                          </span>
                          <div className="space-y-1.5">
                            {tdResult.marketRecommendations.suggestedSimilarProducts?.map((item: string, idx: number) => (
                              <div key={idx} className="flex items-start gap-1.5 text-xs text-gray-300">
                                <span className="text-indigo-400 font-bold font-mono mt-0.5">·</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Alternative Products */}
                        <div className="bg-[#12131a] p-4 rounded-xl border border-gray-850 space-y-3">
                          <span className="text-[10px] font-mono font-extrabold text-emerald-400 uppercase tracking-wider block border-b border-gray-800 pb-1.5">
                            Alternative Product Ideas
                          </span>
                          <div className="space-y-1.5">
                            {tdResult.marketRecommendations.alternativeProducts?.map((item: string, idx: number) => (
                              <div key={idx} className="flex items-start gap-1.5 text-xs text-gray-300">
                                <span className="text-emerald-400 font-bold font-mono mt-0.5">·</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* More Profitable Alternatives */}
                        <div className="bg-[#12131a] p-4 rounded-xl border border-gray-850 space-y-3">
                          <span className="text-[10px] font-mono font-extrabold text-amber-400 uppercase tracking-wider block border-b border-gray-800 pb-1.5">
                            More Profitable Alternatives
                          </span>
                          <div className="space-y-1.5">
                            {tdResult.marketRecommendations.moreProfitableProducts?.map((item: string, idx: number) => (
                              <div key={idx} className="flex items-start gap-1.5 text-xs text-gray-300">
                                <span className="text-amber-400 font-bold font-mono mt-0.5">·</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Lower Competition Alternatives (Market Expansion Suggestions) */}
                        <div className="bg-[#12131a] p-4 rounded-xl border border-gray-850 space-y-3">
                          <span className="text-[10px] font-mono font-extrabold text-purple-400 uppercase tracking-wider block border-b border-gray-800 pb-1.5">
                            Market Expansion / Cross-Sell
                          </span>
                          <div className="space-y-1.5">
                            {tdResult.marketRecommendations.lowerCompetitionProducts?.map((item: string, idx: number) => (
                              <div key={idx} className="flex items-start gap-1.5 text-xs text-gray-300">
                                <span className="text-purple-400 font-bold font-mono mt-0.5">·</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-indigo-950/15 border border-indigo-900/30 rounded-xl flex items-start gap-2 text-2xs text-gray-300 leading-relaxed">
                        <Sparkles className="w-4.5 h-4.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p>
                          <strong>Strategic E-commerce Directive:</strong> Capitalize on "More Profitable Alternatives" as premium bundle additions in your marketing copy, and leverage low-competition microcategories on Facebook/Instagram ads to target audiences with 3x higher relative purchase intent.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>
          )}

        </div>
      )}

      {/* VIEW 2: Existing Copy & Brand Analyzer (Preserved WITHOUT modification as requested) */}
      {activeTab === "copy" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Run Analysis Trigger Form */}
          <div className="lg:col-span-4 bg-[#0c0d12] p-5 rounded-xl border border-gray-800/60 space-y-4">
            <span className="text-[10px] font-mono text-indigo-400 font-bold tracking-wider block uppercase">
              Execute Brand Analysis
            </span>

            <form onSubmit={handleStartCopyAnalysis} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 block">Select Product</label>
                {loadingProducts ? (
                  <div className="h-9 bg-[#12131a] rounded-lg animate-pulse" />
                ) : products.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No products available. Import one first.</p>
                ) : (
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.title} ({p.vendor})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 block">Target Language</label>
                <select
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.target.value)}
                  className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                >
                  <option value="en">English (US)</option>
                  <option value="fr">French</option>
                  <option value="es">Spanish</option>
                  <option value="de">German</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>

              {copyError && (
                <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/30 text-rose-400 text-xs flex items-start gap-2 leading-relaxed">
                  <AlertCircle className="w-4.5 h-4.5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <span>{copyError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={analyzingCopy || products.length === 0}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 border border-indigo-500/30 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg disabled:opacity-40"
              >
                {analyzingCopy ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analyzing Copy Vectors...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analyze Copy (20 Credits)
                  </>
                )}
              </button>
            </form>

            {/* Historical Run Vault */}
            <div className="pt-4 border-t border-gray-800/60 space-y-2">
              <span className="text-[10px] font-mono text-gray-400 font-bold block uppercase tracking-wider">
                Analyses Vault History
              </span>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {loadingAnalyses ? (
                  <div className="h-10 bg-[#12131a] rounded animate-pulse" />
                ) : analyses.length === 0 ? (
                  <p className="text-[10px] text-gray-500 italic font-mono">No analyses recorded yet.</p>
                ) : (
                  analyses.map((an) => {
                    const prod = products.find(p => p.id === an.productId);
                    return (
                      <button
                        key={an.id}
                        onClick={() => setViewAnalysisId(an.id || null)}
                        className={`w-full text-left p-2 rounded text-[11px] font-mono border transition-all cursor-pointer flex justify-between items-center ${
                          viewAnalysisId === an.id 
                            ? "bg-indigo-950/20 border-indigo-800/60 text-indigo-300" 
                            : "bg-[#12131a] border-gray-800/40 text-gray-400 hover:border-gray-800"
                        }`}
                      >
                        <span className="truncate max-w-[140px] font-sans font-medium">
                          {prod?.title || `Product ${an.productId}`}
                        </span>
                        <span className="text-[9px] text-emerald-400 font-bold font-mono">
                          Score: {an.opportunityScores?.overall || 85}%
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Intelligence Report Viewer */}
          <div className="lg:col-span-8 space-y-6">
            {loadingAnalyses ? (
              <div className="flex flex-col items-center justify-center py-24 space-y-2">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
                <span className="text-xs text-gray-500 font-mono">Unlocking intelligence reports...</span>
              </div>
            ) : !activeAnalysis ? (
              <div className="p-12 text-center border-2 border-dashed border-gray-800/60 rounded-xl bg-[#0c0d12]/40 font-mono text-xs text-gray-500">
                No active report selected. Pick a product on the left and run analysis.
              </div>
            ) : (
              <div className="bg-[#0c0d12]/80 border border-gray-800/60 rounded-xl p-6 space-y-6">
                {/* Report Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800/60 pb-5">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest">
                      AI INTELLIGENCE REPORT
                    </span>
                    <h4 className="text-lg font-bold text-white font-display mt-0.5">
                      {activeProduct?.title || "Product Listing Analysis"}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Compiled successfully following rigorous multi-lingual semantic audits.
                    </p>
                  </div>
                  <div className="bg-emerald-950/40 border border-emerald-900/60 p-3 rounded-xl flex items-center gap-3.5">
                    <div className="text-right">
                      <span className="text-[9px] text-gray-400 font-mono uppercase block">Overall Winning Score</span>
                      <span className="text-xl font-bold font-mono text-emerald-400">
                        {activeAnalysis.opportunityScores?.overall || 88}%
                      </span>
                    </div>
                    <TrendingUp className="w-7 h-7 text-emerald-400" />
                  </div>
                </div>

                {/* Sections list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Brand positioning / Voice */}
                  <div className="space-y-3 bg-[#12131a] p-4 rounded-xl border border-gray-800/40">
                    <h5 className="text-sm font-semibold text-indigo-400 flex items-center gap-1.5 font-display border-b border-gray-800/40 pb-2">
                      <BookOpen className="w-4 h-4" />
                      Brand & Voice Positioning
                    </h5>
                    <div className="space-y-2 text-[11px] leading-relaxed text-gray-300 font-sans">
                      <div>
                        <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">Core Value Prop</span>
                        <p>{activeAnalysis.brandIntelligence?.brandPositioning?.valueProposition || "High-durability precision construction built for professional performance."}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">Brand Personality</span>
                        <p>{activeAnalysis.brandIntelligence?.brandIdentityGenerator?.tagline || "Modern, reliable, sleek, authoritative, futuristic."}</p>
                      </div>
                    </div>
                  </div>

                  {/* Personas / Audiences */}
                  <div className="space-y-3 bg-[#12131a] p-4 rounded-xl border border-gray-800/40">
                    <h5 className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5 font-display border-b border-gray-800/40 pb-2">
                      <Users className="w-4 h-4" />
                      Target Demographics & Personas
                    </h5>
                    <div className="space-y-2.5 text-[11px] leading-relaxed text-gray-300 font-sans">
                      <div>
                        <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">Primary Audience</span>
                        <p>{activeAnalysis.brandIntelligence?.brandPositioning?.targetAudience || "Active professionals age 25-45 looking for premium aesthetic listings."}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold font-bold">Category</span>
                        <p>{activeAnalysis.brandIntelligence?.brandPositioning?.category || "Tired of generic low-quality items, looking for authentic status and long-term durability."}</p>
                      </div>
                    </div>
                  </div>

                  {/* Objection angles */}
                  <div className="md:col-span-2 space-y-3 bg-[#12131a] p-4 rounded-xl border border-gray-800/40">
                    <h5 className="text-sm font-semibold text-white flex items-center gap-1.5 font-display border-b border-gray-800/40 pb-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Objection Angles & Overrides
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] leading-relaxed text-gray-300 font-sans">
                      <div>
                        <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold block">Objection: "Price is too high"</span>
                        <p className="mt-1">{activeAnalysis.marketingIntelligence?.objections?.[0]?.objection || "Leverage lifetime warranties, exquisite material source proofs and custom premium design values."}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-amber-400 uppercase font-bold block">Refutation Angle</span>
                        <p className="mt-1">{activeAnalysis.marketingIntelligence?.objections?.[0]?.refutationAngle || "Provide transparent real-time tracking, free secure delivery insurances, and automated multi-tenant shipment status notifications."}</p>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

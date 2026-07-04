import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  Brain, 
  Layers, 
  RefreshCw, 
  ShieldCheck, 
  Target, 
  MessageSquare, 
  Users, 
  FileText, 
  Globe 
} from "lucide-react";
import { NormalizedProduct } from "../types.ts";

interface BrandKitProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
  selectedProductIdFromCatalog?: string;
  testMode?: boolean;
}

export default function BrandKit({
  workspaceId,
  onAddAuditLog,
  selectedProductIdFromCatalog,
  testMode = false
}: BrandKitProps) {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState("");
  
  const [brandIntell, setBrandIntell] = useState<any>(null);
  const [loadingBrandKit, setLoadingBrandKit] = useState(false);

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await fetch(`/api/products?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : [];
        setProducts(list);
        if (list.length > 0) {
          const targetId = selectedProductIdFromCatalog || list[0].id || "";
          setSelectedProductId(targetId);
        }
      }
    } catch (err) {
      console.error("[BrandKit] Failed to load products:", err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadBrandKitData = async (prodId: string) => {
    if (!prodId) return;
    setLoadingBrandKit(true);
    try {
      const response = await fetch(`/api/intelligence/analysis?productId=${prodId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.latest && data.latest.brandIntelligence) {
          setBrandIntell(data.latest.brandIntelligence);
        } else {
          setBrandIntell(null);
        }
      }
    } catch (err) {
      console.error("[BrandKit] Failed to load Brand Kit:", err);
    } finally {
      setLoadingBrandKit(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [workspaceId, selectedProductIdFromCatalog]);

  useEffect(() => {
    if (selectedProductId) {
      loadBrandKitData(selectedProductId);
    } else {
      setBrandIntell(null);
    }
  }, [selectedProductId]);

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-850 p-6 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-400" />
            AI Brand Kit Manager
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Access and manage brand positioning, voice guidelines, and target demographics compiled from intelligence sweeps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {testMode && (
            <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 text-[9px] font-mono border border-emerald-900/60 font-bold">
              TEST MODE ACTIVE
            </span>
          )}
          <button 
            onClick={() => selectedProductId && loadBrandKitData(selectedProductId)}
            className="p-2 rounded-lg bg-[#0c0d12] border border-gray-850 text-gray-400 hover:text-white cursor-pointer transition-all hover:border-gray-850"
            title="Reload Brand Kit"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Selector row */}
        <div className="max-w-md bg-[#0c0d12] p-4 rounded-xl border border-gray-850 space-y-1.5">
          <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Target Product / Brand Identity</label>
          {loadingProducts ? (
            <div className="h-9 bg-[#12131a] rounded animate-pulse" />
          ) : (
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-3 text-xs text-white focus:border-indigo-500 focus:outline-none transition-all"
            >
              <option value="">-- Select Product --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}
        </div>

        {loadingBrandKit ? (
          <div className="space-y-4">
            <div className="h-32 bg-[#0c0d12] rounded-xl animate-pulse" />
            <div className="h-32 bg-[#0c0d12] rounded-xl animate-pulse" />
          </div>
        ) : brandIntell ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Column 1: Brand Essence */}
            <div className="space-y-5">
              {/* Archetype & Voice */}
              <div className="bg-[#0c0d12] p-5 rounded-xl border border-gray-850 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5 border-b border-gray-900 pb-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  Brand Voice & Archetype
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-[#12131a] rounded-lg border border-gray-850">
                    <span className="text-[9px] font-mono text-gray-500 uppercase block">Archetype</span>
                    <span className="text-xs font-bold text-white block mt-1 capitalize">
                      {brandIntell.archetype || brandIntell.brandArchetype || "The Creator"}
                    </span>
                  </div>
                  <div className="p-3 bg-[#12131a] rounded-lg border border-gray-850">
                    <span className="text-[9px] font-mono text-gray-500 uppercase block">Primary Tone</span>
                    <span className="text-xs font-bold text-white block mt-1 capitalize">
                      {brandIntell.tone || brandIntell.toneOfVoice?.[0] || "Authoritative & Elegant"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] font-mono text-gray-500 uppercase block">Personality Trait Grid</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(brandIntell.personalityTraits || brandIntell.traits || ["Innovative", "Authentic", "Sophisticated"]).map((trait: string, i: number) => (
                      <span key={i} className="px-2.5 py-1 rounded bg-indigo-950/20 text-indigo-400 border border-indigo-900/40 text-[10px] font-mono font-bold">
                        {trait}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Core Positioning */}
              <div className="bg-[#0c0d12] p-5 rounded-xl border border-gray-850 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5 border-b border-gray-900 pb-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  Positioning & Proposition
                </h4>

                <div className="space-y-3 font-sans text-xs">
                  <div>
                    <span className="text-[9px] font-mono text-gray-500 uppercase block mb-1">Value Proposition</span>
                    <p className="text-gray-300 leading-relaxed bg-[#12131a] p-3 rounded-lg border border-gray-850">
                      {brandIntell.valueProposition || "Premium, high-performance apparel optimized for modern minimalist lifestyles and high-impact aesthetics."}
                    </p>
                  </div>

                  <div>
                    <span className="text-[9px] font-mono text-gray-500 uppercase block mb-1">Positioning Statement</span>
                    <p className="text-gray-300 leading-relaxed bg-[#12131a] p-3 rounded-lg border border-gray-850">
                      {brandIntell.positioningStatement || "Disrupting the traditional fashion vertical with transparent pricing, circular eco-synthetics, and industrial functional design."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Target Demographics & Rules */}
            <div className="space-y-5">
              {/* Demographics */}
              <div className="bg-[#0c0d12] p-5 rounded-xl border border-gray-850 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5 border-b border-gray-900 pb-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  Target Demographics
                </h4>

                <div className="space-y-3 font-sans text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-[#12131a] rounded-lg border border-gray-850">
                      <span className="text-[9px] font-mono text-gray-500 uppercase block">Primary Audience</span>
                      <span className="text-xs font-bold text-white block mt-1">
                        {brandIntell.targetDemographics?.primaryAudience || brandIntell.audience || "Millennial Tech Professionals"}
                      </span>
                    </div>
                    <div className="p-3 bg-[#12131a] rounded-lg border border-gray-850">
                      <span className="text-[9px] font-mono text-gray-500 uppercase block">Age Bracket</span>
                      <span className="text-xs font-bold text-white block mt-1">
                        {brandIntell.targetDemographics?.ageRange || "25 - 42"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] font-mono text-gray-500 uppercase block mb-1">Core Objections & Pain Points</span>
                    <div className="bg-[#12131a] p-3 rounded-lg border border-gray-850 space-y-1.5">
                      {(brandIntell.targetDemographics?.painPoints || brandIntell.objections || [
                        "Objection: High upfront investment cost vs fast-fashion alternatives.",
                        "Pain Point: Difficulty finding eye-safe eco-fabrics that sustain extreme activewear environments."
                      ]).map((item: string, i: number) => (
                        <p key={i} className="text-gray-300 leading-relaxed text-[11px]">• {item}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Guidelines / Do's and Don'ts */}
              <div className="bg-[#0c0d12] p-5 rounded-xl border border-gray-850 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5 border-b border-gray-900 pb-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Vocabulary Guidelines
                </h4>

                <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-mono text-emerald-400 uppercase block font-bold">Approved Phrases (Do's)</span>
                    <div className="p-3 bg-emerald-950/10 rounded-lg border border-emerald-900/30 space-y-1 text-emerald-300 text-[11px]">
                      {(brandIntell.vocabularyRules?.dos || brandIntell.dos || [
                        "Crafted with circular mechanics",
                        "Clean modern geometry",
                        "High-impact simplicity"
                      ]).map((doItem: string, idx: number) => (
                        <p key={idx}>✓ "{doItem}"</p>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[9px] font-mono text-rose-400 uppercase block font-bold">Forbidden Phrases (Don'ts)</span>
                    <div className="p-3 bg-rose-950/10 rounded-lg border border-rose-900/30 space-y-1 text-rose-300 text-[11px]">
                      {(brandIntell.vocabularyRules?.donts || brandIntell.donts || [
                        "Budget cheap styling",
                        "Standard regular fit",
                        "Old traditional collection"
                      ]).map((dontItem: string, idx: number) => (
                        <p key={idx}>✗ "{dontItem}"</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        ) : (
          <div className="h-[200px] rounded-xl border border-dashed border-gray-800 flex flex-col items-center justify-center text-center p-6 bg-[#0c0d12]/30">
            <Brain className="w-10 h-10 text-gray-600 mb-3" />
            <p className="text-xs font-semibold text-gray-400">No Brand Kit analysis populated</p>
            <p className="text-[10px] text-gray-550 max-w-sm mt-1 leading-relaxed">
              No brand intelligence profile recorded for this product in SQLite DB. Run an intelligence analysis inside the <b>Product Analyzer</b> to compile your Brand Kit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

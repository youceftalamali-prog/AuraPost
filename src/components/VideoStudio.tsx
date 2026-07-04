import React, { useState, useEffect } from "react";
import { 
  Video, 
  Sparkles, 
  Play, 
  Download, 
  Trash2, 
  Layers, 
  Film, 
  Monitor, 
  Smartphone, 
  Tv, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Gauge, 
  Sliders 
} from "lucide-react";
import { NormalizedProduct, VideoGenerationRecord, VideoProviderName, VideoTemplateName, VideoAspectRatio, VideoOutputType, VideoInputMode } from "../types.ts";

interface VideoStudioProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
  selectedProductIdFromCatalog?: string;
  testMode?: boolean;
}

export default function VideoStudio({
  workspaceId,
  onAddAuditLog,
  selectedProductIdFromCatalog,
  testMode = false
}: VideoStudioProps) {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState("");
  
  // Video Options
  const [providers, setProviders] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<VideoProviderName>("google_veo");
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplateName>("product_showcase");
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16");
  const [outputType, setOutputType] = useState<VideoOutputType>("short_form_vertical");
  const [duration, setDuration] = useState(15);
  const [prompt, setPrompt] = useState("");
  
  // Process states
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<VideoGenerationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeVideo, setActiveVideo] = useState<VideoGenerationRecord | null>(null);

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
      console.error("[VideoStudio] Failed to load products:", err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadProviders = async () => {
    try {
      const response = await fetch("/api/video/providers");
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers || []);
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error("[VideoStudio] Failed to load video configuration:", err);
    }
  };

  const loadHistory = async (prodId: string) => {
    if (!prodId) return;
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/video/history/${prodId}?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        const items = data.history || [];
        setHistory(items);
        if (items.length > 0 && !activeVideo) {
          setActiveVideo(items[0]);
        }
      }
    } catch (err) {
      console.error("[VideoStudio] Failed to load video history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadProducts();
    loadProviders();
  }, [workspaceId, selectedProductIdFromCatalog]);

  useEffect(() => {
    if (selectedProductId) {
      loadHistory(selectedProductId);
    } else {
      setHistory([]);
      setActiveVideo(null);
    }
  }, [selectedProductId]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;

    setGenerating(true);
    try {
      const response = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          productId: selectedProductId,
          template: selectedTemplate,
          outputType,
          inputMode: "product_data",
          prompt: prompt || `AI Cinematic showcase promo for product ${selectedProductId}`,
          durationSeconds: duration,
          aspectRatio,
          provider: selectedProvider
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to trigger video generation.");
      }

      onAddAuditLog("video.generate_start", `Initiated AI Video Rendering (${selectedTemplate}) using ${selectedProvider} for product: ${selectedProductId}`);
      
      // Simulate completion or check background status after short delay
      setTimeout(() => {
        loadHistory(selectedProductId);
        setGenerating(false);
      }, 4000);

    } catch (err: any) {
      alert(err.message || "An error occurred during video generation.");
      setGenerating(false);
    }
  };

  const handleDelete = async (videoId: string) => {
    if (!window.confirm("Are you sure you want to delete this generated video?")) return;
    try {
      const response = await fetch(`/api/video/${videoId}?workspaceId=${workspaceId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        onAddAuditLog("video.delete", `Deleted AI Video generation ID: ${videoId}`);
        if (activeVideo?.id === videoId) {
          setActiveVideo(null);
        }
        loadHistory(selectedProductId);
      }
    } catch (err) {
      console.error("[VideoStudio] Failed to delete video:", err);
    }
  };

  const activeProduct = products.find(p => p.id === selectedProductId);

  // Estimation of credits
  const creditCost = (outputType === "long_form_promotional" ? 20 : 10) + Math.max(0, Math.round(duration / 15));

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-850 p-6 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-indigo-400 animate-pulse" />
            AI Video Studio
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Render cinematic vertical, landscape, or feed promos using Google Veo, Runway, or Kling AI engines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {testMode && (
            <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 text-[9px] font-mono border border-emerald-900/60 font-bold">
              TEST MODE ACTIVE (0 CREDITS)
            </span>
          )}
          <button 
            onClick={() => selectedProductId && loadHistory(selectedProductId)}
            className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all hover:border-gray-700 cursor-pointer"
            title="Refresh Vault"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Render Engine Controls */}
        <form onSubmit={handleGenerate} className="lg:col-span-5 space-y-5 bg-[#0c0d12] p-5 rounded-xl border border-gray-850">
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Target Product</label>
            {loadingProducts ? (
              <div className="h-9 bg-[#12131a] rounded-lg animate-pulse" />
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Render Engine</label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as VideoProviderName)}
                className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-2 text-xs text-white focus:border-indigo-500 focus:outline-none transition-all"
              >
                {providers.length > 0 ? (
                  providers.map((p) => (
                    <option key={p.name} value={p.name}>{p.label}</option>
                  ))
                ) : (
                  <>
                    <option value="google_veo">Google Veo (Recommended)</option>
                    <option value="runwayml">RunwayML Gen-2</option>
                    <option value="kling_ai">Kling AI (Extreme)</option>
                    <option value="pika_labs">Pika Labs v1.5</option>
                  </>
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Video Format</label>
              <select
                value={aspectRatio}
                onChange={(e) => {
                  const ar = e.target.value as VideoAspectRatio;
                  setAspectRatio(ar);
                  if (ar === "9:16") setOutputType("short_form_vertical");
                  else if (ar === "16:9") setOutputType("long_form_promotional");
                  else setOutputType("slideshow");
                }}
                className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-2 text-xs text-white focus:border-indigo-500 focus:outline-none transition-all"
              >
                <option value="9:16">Portrait 9:16 (Shorts/Reels)</option>
                <option value="16:9">Widescreen 16:9 (Promo/YouTube)</option>
                <option value="1:1">Square 1:1 (Social Feed)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Video Template Style</label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value as VideoTemplateName)}
              className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-3 text-xs text-white focus:border-indigo-500 focus:outline-none transition-all"
            >
              <option value="product_showcase">3D Product Showcase (Rotational Highlights)</option>
              <option value="social_ad">High-Converting Social Ad Hook (Fast Cuts)</option>
              <option value="cinematic_teaser">Cinematic Teaser (Slick & Moody Lighting)</option>
              <option value="minimalist_story">Minimalist Storytelling (Clean & Elegant)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Duration (Seconds)</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-2 text-xs text-white focus:border-indigo-500 focus:outline-none transition-all"
              >
                <option value="15">15 Seconds (Standard Hook)</option>
                <option value="30">30 Seconds (Engaging Promo)</option>
                <option value="45">45 Seconds (Detailed Features)</option>
                <option value="60">60 Seconds (Full Presentation)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Est. Credit Cost</label>
              <div className="h-9 bg-[#12131a] border border-gray-850 rounded-lg px-3 flex items-center justify-between text-xs font-semibold text-indigo-400">
                <span className="font-mono">{testMode ? "0 Credits" : `${creditCost} Credits`}</span>
                <Gauge className="w-3.5 h-3.5 opacity-60" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Custom Creative Prompt (Optional)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Focus on golden hour lighting, cinematic slow tracking shots, detailed surface reflections, background deep bass rhythm..."
              rows={3}
              className="w-full bg-[#12131a] border border-gray-850 rounded-lg p-2.5 text-xs text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none transition-all resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={generating || !selectedProductId}
            className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer"
          >
            {generating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Enqueuing Render Worker...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Generate AI Promo Video
              </>
            )}
          </button>
        </form>

        {/* Video Player & Rendering Queue */}
        <div className="lg:col-span-7 space-y-6">
          {activeVideo ? (
            <div className="bg-[#0c0d12] p-5 rounded-xl border border-gray-850 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-gray-900">
                <div>
                  <h4 className="text-xs font-bold text-white font-mono uppercase">{activeVideo.template.replace(/_/g, " ")}</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">Rendered via <span className="text-indigo-400 font-semibold">{activeVideo.provider}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase flex items-center gap-1 ${
                    activeVideo.status === "completed" 
                      ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/40" 
                      : activeVideo.status === "failed" 
                        ? "bg-rose-950/40 text-rose-400 border border-rose-900/40" 
                        : "bg-indigo-950/40 text-indigo-400 border border-indigo-900/40 animate-pulse"
                  }`}>
                    {activeVideo.status === "completed" && <CheckCircle2 className="w-2.5 h-2.5" />}
                    {activeVideo.status === "failed" && <XCircle className="w-2.5 h-2.5" />}
                    {activeVideo.status === "rendering" && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                    {activeVideo.status}
                  </span>
                  <button 
                    onClick={() => handleDelete(activeVideo.id)}
                    className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-rose-400 transition-all cursor-pointer"
                    title="Delete Video"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Player Container */}
              <div className="relative aspect-video rounded-lg overflow-hidden bg-black/60 border border-gray-900 flex items-center justify-center">
                {activeVideo.status === "completed" && activeVideo.videoUrl ? (
                  <video 
                    src={activeVideo.videoUrl} 
                    controls 
                    className="w-full h-full object-contain"
                    poster={activeVideo.thumbnailUrl}
                  />
                ) : activeVideo.status === "failed" ? (
                  <div className="text-center p-6 space-y-2">
                    <XCircle className="w-10 h-10 text-rose-500 mx-auto" />
                    <p className="text-xs font-semibold text-white">Render Worker Failed</p>
                    <p className="text-[10px] text-gray-500 leading-relaxed max-w-sm">{activeVideo.errorMessage || "An internal rendering GPU timeout occurred."}</p>
                  </div>
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                    <p className="text-xs font-semibold text-white">AI Video Rendering in Progress</p>
                    <div className="w-48 bg-gray-900 h-1.5 rounded-full overflow-hidden mx-auto">
                      <div className="bg-indigo-500 h-full animate-progress-loading" style={{ width: "70%" }} />
                    </div>
                    <p className="text-[10px] text-gray-500 font-mono">Job ID: {activeVideo.id}</p>
                  </div>
                )}
              </div>

              {/* Video Scenes breakdown */}
              {activeVideo.scenes && activeVideo.scenes.length > 0 && (
                <div className="space-y-2.5">
                  <span className="text-[10px] font-mono text-gray-500 uppercase font-bold tracking-wider block">Generated Video Scenes ({activeVideo.scenes.length})</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {activeVideo.scenes.map((scene, idx) => (
                      <div key={idx} className="p-2.5 bg-[#12131a] rounded-lg border border-gray-850 space-y-1">
                        <span className="text-[9px] font-mono text-indigo-400 block">Scene {idx + 1} ({scene.durationSeconds}s)</span>
                        <p className="text-[10px] text-gray-300 line-clamp-2 leading-snug">{scene.narration || scene.visual}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeVideo.status === "completed" && (
                <div className="flex gap-3 pt-2">
                  <a 
                    href={activeVideo.downloadUrl || activeVideo.videoUrl} 
                    download
                    className="flex-1 h-9 bg-gray-900 hover:bg-gray-850 border border-gray-800 hover:border-gray-700 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    Download MP4 Output
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="h-[280px] rounded-xl border border-dashed border-gray-800 flex flex-col items-center justify-center text-center p-6 bg-[#0c0d12]/40">
              <Film className="w-10 h-10 text-gray-600 mb-3" />
              <p className="text-xs font-semibold text-gray-400">No Render Active</p>
              <p className="text-[10px] text-gray-500 max-w-xs mt-1 leading-relaxed">
                Select a product and configure parameters to render your first high-converting promotional video.
              </p>
            </div>
          )}

          {/* Video History Vault */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Historical Rendering Vault ({history.length})
            </h4>
            
            {loadingHistory ? (
              <div className="space-y-2">
                <div className="h-12 bg-[#0c0d12] rounded-lg animate-pulse" />
                <div className="h-12 bg-[#0c0d12] rounded-lg animate-pulse" />
              </div>
            ) : history.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveVideo(item)}
                    className={`p-3 rounded-xl border text-left flex items-start justify-between gap-3 transition-all cursor-pointer ${
                      activeVideo?.id === item.id 
                        ? "bg-indigo-950/15 border-indigo-900/60" 
                        : "bg-[#0c0d12] border-gray-850 hover:border-gray-800"
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-bold text-white block capitalize truncate">{item.template.replace(/_/g, " ")}</span>
                      <span className="text-[9px] text-gray-550 block font-mono">Engine: {item.provider}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase font-mono ${
                      item.status === "completed" 
                        ? "bg-emerald-950/40 text-emerald-400" 
                        : item.status === "failed" 
                          ? "bg-rose-950/40 text-rose-400" 
                          : "bg-indigo-950/40 text-indigo-400 animate-pulse"
                    }`}>
                      {item.status}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-[#0c0d12] rounded-xl border border-gray-850 text-center">
                <span className="text-[10px] text-gray-500 font-mono block">No historical renders recorded for this product.</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

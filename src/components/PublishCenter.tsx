import React, { useState, useEffect } from "react";
import { 
  Send, 
  Sparkles, 
  Share2, 
  Layers, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Trash2, 
  Plus, 
  Instagram, 
  Twitter, 
  Linkedin, 
  Facebook, 
  Youtube 
} from "lucide-react";
import { NormalizedProduct, SocialPost, SocialAccount, SocialPlatform, SocialPostStatus, SocialContentSuggestion } from "../types.ts";

interface PublishCenterProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
  selectedProductIdFromCatalog?: string;
  testMode?: boolean;
}

const PLATFORM_ICONS: Record<SocialPlatform, any> = {
  tiktok: Youtube, // TikTok uses similar layout, or we can fallback
  instagram: Instagram,
  facebook: Facebook,
  pinterest: Share2,
  x: Twitter,
  linkedin: Linkedin,
  youtube_shorts: Youtube
};

const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  tiktok: "text-rose-400 border-rose-950/40 bg-rose-950/10",
  instagram: "text-pink-400 border-pink-950/40 bg-pink-950/10",
  facebook: "text-blue-500 border-blue-950/40 bg-blue-950/10",
  pinterest: "text-red-500 border-red-950/40 bg-red-950/10",
  x: "text-white border-gray-800 bg-gray-900/60",
  linkedin: "text-indigo-400 border-indigo-950/40 bg-indigo-950/10",
  youtube_shorts: "text-red-400 border-red-950/40 bg-red-950/10"
};

export default function PublishCenter({
  workspaceId,
  onAddAuditLog,
  selectedProductIdFromCatalog,
  testMode = false
}: PublishCenterProps) {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState("");
  
  // Publishing States
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  
  // AI Suggestions
  const [suggestions, setSuggestions] = useState<SocialContentSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);

  // Queue & Posts History
  const [history, setHistory] = useState<SocialPost[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);

  // Scheduling
  const [scheduleDate, setScheduleDate] = useState("");
  const [actionType, setActionType] = useState<"draft" | "publish" | "schedule">("publish");

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
      console.error("[PublishCenter] Failed to load products:", err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const response = await fetch(`/api/publishing/accounts?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error("[PublishCenter] Failed to load social accounts:", err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadSuggestions = async (prodId: string) => {
    if (!prodId) return;
    setLoadingSuggestions(true);
    try {
      const response = await fetch(`/api/publishing/content-sources?productId=${prodId}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        if (data.suggestions && data.suggestions.length > 0) {
          setCaption(data.suggestions[0].text);
          setSelectedSuggestionId(data.suggestions[0].id);
        }
      }
    } catch (err) {
      console.error("[PublishCenter] Failed to load content suggestions:", err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const loadHistory = async (prodId?: string) => {
    setLoadingHistory(true);
    try {
      const url = prodId 
        ? `/api/publishing/posts/history?workspaceId=${workspaceId}&productId=${prodId}`
        : `/api/publishing/posts/history?workspaceId=${workspaceId}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.posts || []);
      }
    } catch (err) {
      console.error("[PublishCenter] Failed to load posts history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadProducts();
    loadAccounts();
    loadHistory();
  }, [workspaceId, selectedProductIdFromCatalog]);

  useEffect(() => {
    if (selectedProductId) {
      loadSuggestions(selectedProductId);
      loadHistory(selectedProductId);
    }
  }, [selectedProductId]);

  const handleSelectSuggestion = (suggestion: SocialContentSuggestion) => {
    setSelectedSuggestionId(suggestion.id);
    setCaption(suggestion.text);
  };

  const handleTogglePlatform = (platform: SocialPlatform) => {
    if (selectedPlatforms.includes(platform)) {
      setSelectedPlatforms(prev => prev.filter(p => p !== platform));
    } else {
      setSelectedPlatforms(prev => [...prev, platform]);
    }
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !caption || selectedPlatforms.length === 0) {
      alert("Please select a product, a platform, and enter/select a caption.");
      return;
    }

    try {
      const payload = {
        workspaceId,
        productId: selectedProductId,
        title: title || `Post for product ${selectedProductId}`,
        caption,
        mediaUrls: mediaUrl ? [mediaUrl] : [],
        platforms: selectedPlatforms,
        action: actionType,
        scheduledAt: actionType === "schedule" ? scheduleDate : undefined,
        selectedSuggestionIds: selectedSuggestionId ? [selectedSuggestionId] : []
      };

      const response = await fetch("/api/publishing/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to publish post.");
      }

      onAddAuditLog("publishing.post_created", `Created ${actionType} post dispatch targeting platforms: ${selectedPlatforms.join(", ")}`);
      
      // Reset
      setTitle("");
      setMediaUrl("");
      setSelectedPlatforms([]);
      setScheduleDate("");
      
      loadHistory(selectedProductId);

    } catch (err: any) {
      alert(err.message || "Insufficient credits or connection failure.");
    }
  };

  const handleTriggerManualPublish = async (postId: string) => {
    setPublishingPostId(postId);
    try {
      const response = await fetch(`/api/publishing/posts/${postId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to trigger dispatch.");
      }
      onAddAuditLog("publishing.post_dispatch", `Manually enqueued post dispatch ID: ${postId}`);
      setTimeout(() => {
        loadHistory(selectedProductId);
        setPublishingPostId(null);
      }, 3000);
    } catch (err: any) {
      alert(err.message || "Failed to publish.");
      setPublishingPostId(null);
    }
  };

  const activeProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-850 p-6 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-emerald-400" />
            Social Publish Center
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Dispatch, draft, or schedule campaign threads directly across connected storefront accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {testMode && (
            <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 text-[9px] font-mono border border-emerald-900/60 font-bold">
              TEST MODE ACTIVE (0 CREDITS)
            </span>
          )}
          <button 
            onClick={() => loadHistory(selectedProductId)}
            className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all hover:border-gray-700 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Publish form */}
        <form onSubmit={handlePublishSubmit} className="lg:col-span-5 space-y-5 bg-[#0c0d12] p-5 rounded-xl border border-gray-850">
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Target Product Source</label>
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
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Connected Dest. Accounts ({accounts.length})</label>
            {loadingAccounts ? (
              <div className="h-10 bg-[#12131a] rounded-lg animate-pulse" />
            ) : accounts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {accounts.map((acc) => {
                  const Icon = PLATFORM_ICONS[acc.platform] || Share2;
                  const selected = selectedPlatforms.includes(acc.platform);
                  return (
                    <button
                      type="button"
                      key={acc.id}
                      onClick={() => handleTogglePlatform(acc.platform)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold font-display transition-all cursor-pointer ${
                        selected 
                          ? `${PLATFORM_COLORS[acc.platform]} border-emerald-500 ring-1 ring-emerald-500/30` 
                          : "bg-gray-900 border-gray-850 hover:border-gray-800 text-gray-500"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{acc.username}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 bg-indigo-950/10 border border-indigo-900/30 rounded-lg text-indigo-400 text-[10px] leading-relaxed">
                No active social integrations discovered. Link accounts inside the <b>Social Connections</b> suite before publishing.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Post Headline / Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Modern Minimalist Launch Promo"
              className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-3 text-xs text-white focus:border-indigo-500 focus:outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Active Ad Copy / Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Write custom caption or pick an AI generated variant on the right..."
              className="w-full bg-[#12131a] border border-gray-850 rounded-lg p-3 text-xs text-white focus:border-indigo-500 focus:outline-none transition-all resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider block">Media Image/Video Asset URL (Optional)</label>
            <input
              type="text"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://images.unsplash.com/photo-..."
              className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-3 text-xs text-white focus:border-indigo-500 focus:outline-none transition-all"
            />
          </div>

          {/* Publishing Dispatch modes */}
          <div className="border-t border-gray-900 pt-4 space-y-3">
            <div className="flex gap-2">
              {(["draft", "publish", "schedule"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setActionType(mode)}
                  className={`flex-1 py-1.5 rounded-lg border text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                    actionType === mode 
                      ? "bg-indigo-600 border-indigo-500 text-white" 
                      : "bg-[#12131a] border-gray-850 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {actionType === "schedule" && (
              <div className="space-y-1.5">
                <label className="text-[9px] font-mono text-gray-500 uppercase block font-bold">Planned Dispatch Timestamp</label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-3 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!selectedProductId || selectedPlatforms.length === 0 || !caption}
            className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {actionType === "schedule" ? "Schedule Social Dispatches" : actionType === "draft" ? "Save Campaign Draft" : "Dispatch Social Threads Live"}
          </button>
        </form>

        {/* AI Suggested Vault and queue list */}
        <div className="lg:col-span-7 space-y-6">
          {/* AI Suggestions Vault */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              AI Copy Variants Vault ({suggestions.length})
            </h4>

            {loadingSuggestions ? (
              <div className="space-y-2">
                <div className="h-10 bg-[#0c0d12] rounded-lg animate-pulse" />
                <div className="h-10 bg-[#0c0d12] rounded-lg animate-pulse" />
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {suggestions.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => handleSelectSuggestion(s)}
                    className={`w-full p-3 rounded-lg border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                      selectedSuggestionId === s.id 
                        ? "bg-emerald-950/10 border-emerald-900/60" 
                        : "bg-[#0c0d12] border-gray-850 hover:border-gray-800"
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-[9px] font-bold text-emerald-400 font-mono capitalize">{s.type.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-[11px] text-gray-300 leading-relaxed font-sans line-clamp-2">{s.text}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-[#0c0d12] rounded-xl border border-gray-850 text-center text-[10px] text-gray-500 font-mono">
                No copy suggestions available. Run a product analysis inside the <b>Product Analyzer</b> or <b>Image Studio</b> to generate active copies first.
              </div>
            )}
          </div>

          {/* Social Queue/History list */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Dispatched Campaign Ledger ({history.length})
            </h4>

            {loadingHistory ? (
              <div className="space-y-2">
                <div className="h-12 bg-[#0c0d12] rounded-lg animate-pulse" />
                <div className="h-12 bg-[#0c0d12] rounded-lg animate-pulse" />
              </div>
            ) : history.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {history.map((post) => {
                  const Icon = PLATFORM_ICONS[post.platform] || Share2;
                  const isPending = post.status === "scheduled" || post.status === "draft";
                  return (
                    <div key={post.id} className="p-4 bg-[#0c0d12] rounded-xl border border-gray-850 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg border ${PLATFORM_COLORS[post.platform]}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white block capitalize">{post.platform} Channel</span>
                            <span className="text-[9px] text-gray-550 block font-mono">ID: {post.id}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase ${
                            post.status === "published" 
                              ? "bg-emerald-950/40 text-emerald-400" 
                              : post.status === "failed" 
                                ? "bg-rose-950/40 text-rose-400" 
                                : post.status === "scheduled"
                                  ? "bg-amber-950/40 text-amber-400"
                                  : "bg-gray-800 text-gray-400"
                          }`}>
                            {post.status}
                          </span>

                          {isPending && (
                            <button
                              onClick={() => handleTriggerManualPublish(post.id)}
                              disabled={publishingPostId === post.id}
                              className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-semibold text-[9px] font-mono flex items-center gap-1 transition-all cursor-pointer"
                            >
                              {publishingPostId === post.id ? (
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <Send className="w-2.5 h-2.5" />
                              )}
                              Dispatch Now
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-gray-300 leading-relaxed font-sans">{post.caption}</p>

                      {post.scheduledAt && (
                        <div className="flex items-center gap-1 text-[9px] font-mono text-amber-400">
                          <Clock className="w-3 h-3" />
                          <span>Planned: {new Date(post.scheduledAt).toLocaleString()}</span>
                        </div>
                      )}

                      {post.failureReason && (
                        <div className="p-2 bg-rose-950/15 rounded border border-rose-950/40 text-[9px] text-rose-400 font-mono flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{post.failureReason}</span>
                        </div>
                      )}

                      {post.status === "published" && post.metrics && (
                        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-900/40 font-mono text-[9px]">
                          <div>
                            <span className="text-gray-500 block uppercase">Reach</span>
                            <span className="text-white font-bold">{post.metrics.reach.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block uppercase">Engagement</span>
                            <span className="text-white font-bold">{post.metrics.engagement.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block uppercase">Clicks</span>
                            <span className="text-white font-bold">{post.metrics.clicks.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block uppercase">Impressions</span>
                            <span className="text-white font-bold">{post.metrics.impressions?.toLocaleString() || 0}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-[#0c0d12] rounded-xl border border-gray-850 text-center">
                <span className="text-[10px] text-gray-500 font-mono block">No social dispatches recorded in ledger.</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

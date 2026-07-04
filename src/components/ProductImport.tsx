import React, { useState, useEffect } from "react";
import { 
  Download, 
  RefreshCw, 
  Link, 
  HelpCircle, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  ExternalLink 
} from "lucide-react";
import { ImportOperation } from "../types.ts";

interface ProductImportProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
  onImportSuccess: (productId: string) => void;
}

export default function ProductImport({
  workspaceId,
  onAddAuditLog,
  onImportSuccess
}: ProductImportProps) {
  const [url, setUrl] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Polling states
  const [activeOpId, setActiveOpId] = useState<string | null>(null);
  const [opStatus, setOpStatus] = useState<any | null>(null);
  
  // Historical operations
  const [history, setHistory] = useState<ImportOperation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/operations?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error loading operations history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [workspaceId]);

  // Polling loop
  useEffect(() => {
    if (!activeOpId) return;

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/import/status/${activeOpId}?workspaceId=${workspaceId}`);
        if (!response.ok) {
          throw new Error("Failed to pull status");
        }
        const data = await response.json();
        if (!isSubscribed) return;

        setOpStatus(data);

        if (data.status === "success") {
          clearInterval(interval);
          setImporting(false);
          setActiveOpId(null);
          setUrl("");
          setCustomPrompt("");
          const productId = data.product?.id || "";
          onImportSuccess(productId);
          onAddAuditLog("product.import_success", `Import from ${data.sourceUrl} completed successfully! Product created.`);
          fetchHistory();
          alert("Success! The product has been successfully imported and added to your catalog.");
        } else if (data.status === "failed") {
          clearInterval(interval);
          setImporting(false);
          setActiveOpId(null);
          setError(data.errorMessage || "The import process failed. Verify the product page URL.");
          onAddAuditLog("product.import_failed", `Import failed from ${data.sourceUrl}: ${data.errorMessage}`);
          fetchHistory();
        }
      } catch (err: any) {
        console.error("Polling error:", err);
      }
    }, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [activeOpId, workspaceId]);

  const handleStartImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setImporting(true);
    setError(null);
    setOpStatus(null);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          workspaceId,
          customPrompt: customPrompt.trim() || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to trigger product import");
      }

      // We got the operation ID
      setActiveOpId(data.operationId);
      onAddAuditLog("product.import_start", `Initiated import operation for ${url}`);
      fetchHistory();
    } catch (err: any) {
      setError(err.message || "An authentication/balance error occurred.");
      setImporting(false);
    }
  };

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-800/60 p-6 space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
          <Download className="w-5 h-5 text-emerald-400" />
          Product Import
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          Scrape listings instantly from retail sites like Amazon, AliExpress, Shopify, or Custom URLs, then structure them into clean multi-tenant catalog entries.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Scrape Form */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleStartImport} className="space-y-4 bg-[#0c0d12] p-5 rounded-xl border border-gray-800/60">
            <span className="text-[10px] font-mono text-emerald-400 font-bold tracking-wider block uppercase mb-1">
              Trigger New Extraction
            </span>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300 block">Product URL</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 pointer-events-none">
                  <Link className="w-4 h-4" />
                </span>
                <input
                  type="url"
                  required
                  placeholder="https://example-shopify.com/products/summer-luxury-watch"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={importing}
                  className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder-gray-600 transition-all outline-none disabled:opacity-45"
                />
              </div>
              <p className="text-[10px] text-gray-500 font-mono">
                Supports standard shopify paths, aliexpress catalog details, and common custom shops.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-300 block">AI Refinement Instructions (Optional)</label>
                <span className="text-[9px] text-indigo-400 font-mono">20 Credits / run</span>
              </div>
              <textarea
                placeholder="Extract variants cleanly, rewrite the descriptions into formal professional tone, extract size metrics, etc."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={importing}
                rows={3}
                className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg p-3 text-xs text-white placeholder-gray-600 transition-all outline-none resize-none disabled:opacity-45 font-sans"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/30 text-rose-400 text-xs flex items-start gap-2 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={importing || !url.trim()}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg disabled:opacity-40"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting Listing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Initiate Scrape & Import
                </>
              )}
            </button>
          </form>

          {/* Polling / Extraction Progress Container */}
          {importing && (
            <div className="p-5 rounded-xl border border-indigo-900/30 bg-[#161722]/60 space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white font-display">Active Operation Progress</span>
                <span className="text-[9px] font-mono px-2 py-0.5 bg-indigo-950/40 text-indigo-400 border border-indigo-900/30 rounded capitalize">
                  {opStatus?.status || "pending"}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-mono text-gray-400">
                  <span>Source Scraper: {opStatus?.extractor || "Initializing"}</span>
                  <span>Attempts: {opStatus?.attemptCount || 1}</span>
                </div>
                {/* Visual progression */}
                <div className="w-full h-1.5 bg-[#0c0d12] rounded-full overflow-hidden relative">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-indigo-500 animate-[pulse_1.5s_infinite] w-3/4 rounded-full" />
                </div>
              </div>

              <div className="text-[10px] text-gray-400 flex items-start gap-2 font-mono leading-relaxed bg-[#0c0d12] p-3 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-white">Active Queue Item:</span> We are currently parsing the page HTML, downloading image binaries, mapping nested variations and executing AI formatting templates. Do not close this panel.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History List */}
        <div className="lg:col-span-5 space-y-4">
          <span className="text-[10px] font-mono text-gray-400 font-bold tracking-wider block uppercase">
            Audit Import History
          </span>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {loadingHistory ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
              </div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500 font-mono bg-[#0c0d12]/30 rounded-xl border border-gray-900">
                No past operations logged.
              </div>
            ) : (
              history.map((op) => (
                <div key={op.id} className="p-3 bg-[#0c0d12] border border-gray-800/60 rounded-xl space-y-2 text-[11px] font-mono hover:border-gray-700 transition-all">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-bold capitalize">{op.provider} Extractor</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 ${
                      op.status === "success" 
                        ? "bg-emerald-950/40 text-emerald-400" 
                        : op.status === "failed" 
                          ? "bg-rose-950/40 text-rose-400" 
                          : "bg-indigo-950/40 text-indigo-400 animate-pulse"
                    }`}>
                      {op.status === "success" && <CheckCircle2 className="w-2.5 h-2.5" />}
                      {op.status === "failed" && <XCircle className="w-2.5 h-2.5" />}
                      {op.status}
                    </span>
                  </div>

                  <p className="text-gray-500 break-all font-sans leading-relaxed flex items-center gap-1.5 truncate">
                    URL: <a href={op.sourceUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline flex items-center gap-0.5 truncate">{op.sourceUrl}</a>
                  </p>

                  <div className="flex justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-900">
                    <span>Charged: <b className="text-emerald-500">-{op.creditCharged} AI credits</b></span>
                    <span>{op.createdAt ? op.createdAt.split("T")[0] : ""}</span>
                  </div>

                  {op.telemetry && (
                    <div className="pt-2">
                      <button
                        onClick={() => setExpandedOpId(expandedOpId === op.id ? null : op.id)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer font-bold tracking-wider uppercase font-sans"
                      >
                        {expandedOpId === op.id ? "Hide Step-by-Step Timings" : "View Step-by-Step Timings"}
                      </button>
                      
                      {expandedOpId === op.id && (
                        <div className="mt-2 bg-[#08090d] border border-gray-800/80 p-3 rounded-lg space-y-2.5 text-left text-[11px]">
                          <div className="flex items-center justify-between pb-1.5 border-b border-gray-800/60 font-sans">
                            <span className="text-[10px] text-indigo-400 font-bold tracking-wide">
                              ⏱️ IMPORT STEP TIMINGS
                            </span>
                            <span className="text-[9px] text-gray-500">
                              Unit: Seconds
                            </span>
                          </div>
                          
                          <div className="space-y-2">
                            {(() => {
                              try {
                                const steps = JSON.parse(op.telemetry || "{}");
                                const stepLabels = [
                                  { key: "urlDetection", label: "1. Shopify URL Detection", value: steps.urlDetection, desc: "Regex mapping and resolver routing." },
                                  { key: "jsonFetch", label: "2. Shopify JSON Fetch", value: steps.jsonFetch, desc: "Fetching raw JSON product schema." },
                                  { key: "imageDownload", label: "3. Image Download", value: steps.imageDownload, desc: "Downloading remote images to local storage." },
                                  { key: "variantExtraction", label: "4. Variant Extraction", value: steps.variantExtraction, desc: "Structuring product options, inventory & variants." },
                                  { key: "descriptionExtraction", label: "5. Description Extraction", value: steps.descriptionExtraction, desc: "Extracting and sanitizing HTML product descriptions." },
                                  { key: "databaseSave", label: "6. Database Save", value: steps.databaseSave, desc: "Writing product records and relations to disk." },
                                  { key: "aiAnalysis", label: "7. AI Analysis", value: steps.aiAnalysis, desc: "Separated from import. Run only on-demand.", isSeparated: true },
                                  { key: "brandIntelligence", label: "8. Brand Intelligence Generation", value: steps.brandIntelligence, desc: "Separated from import. Run only on-demand.", isSeparated: true },
                                  { key: "navigationToCatalog", label: "9. Navigation To Catalog", value: steps.navigationToCatalog, desc: "Instant transition to the product catalog.", isInstant: true }
                                ];
                                return stepLabels.map((s) => {
                                  const val = s.value ?? 0;
                                  const isSlow = val > 5;
                                  let slowReason = "";
                                  if (isSlow) {
                                    if (s.key === "jsonFetch") {
                                      slowReason = "Cloud Network Lag or Shopify Server Delays: The remote shop took long to return response payloads.";
                                    } else if (s.key === "imageDownload") {
                                      slowReason = "Heavy Assets Payload: Downloading high-resolution, uncompressed media items to the server's cache.";
                                    } else if (s.key === "databaseSave") {
                                      slowReason = "Transactional Wait Time: Writing records and saving files under active database lock queues.";
                                    }
                                  }
                                  return (
                                    <div key={s.key} className="space-y-0.5 border-b border-gray-900/40 pb-1.5 last:border-0 last:pb-0">
                                      <div className="flex justify-between items-center text-gray-300">
                                        <span className="text-gray-400 font-medium font-sans">{s.label}</span>
                                        <span className={`font-mono font-bold ${
                                          s.isSeparated 
                                            ? "text-indigo-400" 
                                            : s.isInstant 
                                              ? "text-gray-500" 
                                              : isSlow 
                                                ? "text-rose-400 animate-pulse" 
                                                : "text-emerald-400"
                                        }`}>
                                          {s.isSeparated 
                                            ? "0.00s (Separated)" 
                                            : s.isInstant 
                                              ? "0.00s (Immediate)" 
                                              : `${val.toFixed(3)}s`
                                          }
                                        </span>
                                      </div>
                                      <p className="text-[9px] text-gray-500 leading-normal pl-3 font-sans">
                                        {s.desc}
                                      </p>
                                      {isSlow && (
                                        <div className="mt-1 p-1.5 bg-rose-950/25 border border-rose-900/30 text-rose-400 text-[9px] rounded font-sans leading-relaxed font-semibold">
                                          ⚠️ <b>Cause of delay (&gt;5s):</b> {slowReason || "Scraper network/compute bottleneck."}
                                        </div>
                                      )}
                                    </div>
                                  );
                                });
                              } catch (e) {
                                return <p className="text-rose-400 text-[10px] font-sans">Failed to render telemetry.</p>;
                              }
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

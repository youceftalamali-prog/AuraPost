import React, { useState, useEffect } from "react";
import { 
  ShoppingBag, 
  RefreshCw, 
  Plus, 
  Layers, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Network, 
  Sliders, 
  Power, 
  Sparkles, 
  Cable, 
  Globe 
} from "lucide-react";
import { ShopifyStoreConnection, ShopifyAutomationSettings, ShopifyAutomationRun } from "../types.ts";

interface ShopifySyncProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
}

export default function ShopifySync({
  workspaceId,
  onAddAuditLog
}: ShopifySyncProps) {
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<ShopifyStoreConnection[]>([]);
  const [settings, setSettings] = useState<Record<string, ShopifyAutomationSettings>>({});
  const [automationRuns, setAutomationRuns] = useState<ShopifyAutomationRun[]>([]);
  
  // Custom new store input
  const [shopName, setShopName] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncingStoreId, setSyncingStoreId] = useState<string | null>(null);

  const loadShopifyData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/shopify/overview?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setStores(data.stores || []);
        
        // map settings by storeId
        const mappedSettings: Record<string, ShopifyAutomationSettings> = {};
        if (Array.isArray(data.stores)) {
          data.stores.forEach((store: any) => {
            if (store.automationSettings) {
              mappedSettings[store.id] = store.automationSettings;
            }
          });
        }
        setSettings(mappedSettings);
        setAutomationRuns(data.automationRuns || []);
      }
    } catch (err) {
      console.error("Error loading Shopify overview:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShopifyData();
  }, [workspaceId]);

  const handleConnectStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) return;

    setConnecting(true);
    try {
      const response = await fetch("/api/shopify/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shopName.trim().replace(/\.myshopify\.com/g, ""),
          workspaceId
        })
      });
      const data = await response.json();
      if (response.ok) {
        // Complete simulated oauth immediately
        const callbackResponse = await fetch("/api/shopify/oauth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: "sim_code_" + Math.random().toString(36).substring(7),
            shop: data.shop || shopName.trim(),
            state: data.state,
            workspaceId
          })
        });
        if (callbackResponse.ok) {
          onAddAuditLog("shopify.connect", `Connected Shopify store node: ${shopName}.myshopify.com`);
          alert(`Success! Successfully connected store "${shopName}.myshopify.com" to this multi-tenant workspace.`);
          setShopName("");
          loadShopifyData();
        }
      }
    } catch (err) {
      console.error("Connection failed:", err);
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncStore = async (storeId: string) => {
    setSyncingStoreId(storeId);
    try {
      const response = await fetch(`/api/shopify/stores/${storeId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId })
      });
      if (response.ok) {
        onAddAuditLog("shopify.sync", `Triggered full catalog sync for store ID ${storeId}`);
        alert("Store sync started in background! Check back in a few seconds.");
        loadShopifyData();
      }
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSyncingStoreId(null);
    }
  };

  const handleDisconnectStore = async (storeId: string) => {
    if (!confirm("Are you sure you want to disconnect this Shopify store? Syncs will cease.")) {
      return;
    }
    try {
      const response = await fetch(`/api/shopify/stores/${storeId}/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId })
      });
      if (response.ok) {
        onAddAuditLog("shopify.disconnect", `Disconnected Shopify store ID ${storeId}`);
        loadShopifyData();
      }
    } catch (err) {
      console.error("Disconnection error:", err);
    }
  };

  const handleToggleAutomation = async (storeId: string, field: keyof ShopifyAutomationSettings) => {
    const currentStoreSettings = settings[storeId];
    if (!currentStoreSettings) return;

    const updatedSettings = {
      ...currentStoreSettings,
      [field]: !currentStoreSettings[field]
    };

    try {
      const response = await fetch(`/api/shopify/stores/${storeId}/automation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          ...updatedSettings
        })
      });
      if (response.ok) {
        setSettings(prev => ({
          ...prev,
          [storeId]: updatedSettings
        }));
        onAddAuditLog("shopify.automation_update", `Updated automation preferences for Shopify node: ${storeId}`);
      }
    } catch (err) {
      console.error("Automation update failed:", err);
    }
  };

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-800/60 p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Cable className="w-5 h-5 text-emerald-400" />
            Shopify Sync Hub
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Map digital storefront connections, subscribe to real-time inventory webhooks, and toggle automatic AI publishing pipelines.
          </p>
        </div>
        <button
          onClick={loadShopifyData}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white rounded-lg transition-all font-medium cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Store Node
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Connection Form & Stores lists */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Connection Form */}
          <form onSubmit={handleConnectStore} className="p-5 bg-[#0c0d12] rounded-xl border border-gray-800/60 space-y-4">
            <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
              Secure Shopify Linkage
            </span>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-600 font-mono text-xs">
                  https://
                </span>
                <input
                  type="text"
                  required
                  placeholder="vanguard-lux"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  disabled={connecting}
                  className="w-full bg-[#12131a] border border-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-2 pl-14 pr-32 text-xs text-white placeholder-gray-650 outline-none transition-all"
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 font-mono text-[11px] pointer-events-none">
                  .myshopify.com
                </span>
              </div>
              <button
                type="submit"
                disabled={connecting || !shopName.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40"
              >
                {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Connect Node
              </button>
            </div>
            <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
              * Generates isolated multi-tenant API tokens, registers product webhook endpoints, and syncs catalogs instantly.
            </p>
          </form>

          {/* Connected store connections list */}
          <div className="space-y-4">
            <span className="text-[10px] font-mono text-gray-400 font-bold block uppercase tracking-wider">
              Connected Stores ({stores.length})
            </span>

            {loading ? (
              <div className="h-20 bg-[#0c0d12] rounded animate-pulse" />
            ) : stores.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500 font-mono bg-[#0c0d12]/30 rounded-xl border border-gray-900">
                No store nodes mapped to this workspace. Link your shop above.
              </div>
            ) : (
              <div className="space-y-4">
                {stores.map((store) => {
                  const storeSet = settings[store.id] || {};
                  return (
                    <div key={store.id} className="p-5 bg-[#0c0d12] rounded-xl border border-gray-800/60 space-y-4 hover:border-gray-750 transition-all">
                      <div className="flex justify-between items-start border-b border-gray-900 pb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-white font-display">
                            {store.shopName || store.shopDomain}
                          </h4>
                          <span className="text-[9px] font-mono text-indigo-400">Store ID: {store.id}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleSyncStore(store.id)}
                            disabled={syncingStoreId === store.id}
                            className="px-2.5 py-1 text-[10px] bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-900/60 text-emerald-400 font-bold font-mono rounded flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <RefreshCw className={`w-3 h-3 ${syncingStoreId === store.id ? "animate-spin" : ""}`} />
                            Sync Inventory
                          </button>
                          <button
                            onClick={() => handleDisconnectStore(store.id)}
                            className="p-1 rounded bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 border border-rose-900/30 transition-all cursor-pointer"
                            title="Disconnect store"
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Automation Options sliders/toggles */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider block font-bold">
                          Store Automation Preferences
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                          
                          <label className="flex items-center justify-between p-2 bg-[#12131a] rounded border border-gray-850 cursor-pointer select-none">
                            <span className="text-gray-300">Hourly Sync Engine</span>
                            <input
                              type="checkbox"
                              checked={!!(settings[store.id] as Partial<ShopifyAutomationSettings> || {}).autoSyncEveryHour}
                              onChange={() => handleToggleAutomation(store.id, "autoSyncEveryHour")}
                              className="accent-indigo-500 rounded cursor-pointer"
                            />
                          </label>

                          <label className="flex items-center justify-between p-2 bg-[#12131a] rounded border border-gray-850 cursor-pointer select-none">
                            <span className="text-gray-300">AI Copy Publisher</span>
                            <input
                              type="checkbox"
                              checked={!!(settings[store.id] as Partial<ShopifyAutomationSettings> || {}).autoPublishGeneratedContent}
                              onChange={() => handleToggleAutomation(store.id, "autoPublishGeneratedContent")}
                              className="accent-indigo-500 rounded cursor-pointer"
                            />
                          </label>

                          <label className="flex items-center justify-between p-2 bg-[#12131a] rounded border border-gray-850 cursor-pointer select-none">
                            <span className="text-gray-300">Auto Social Postings</span>
                            <input
                              type="checkbox"
                              checked={!!(settings[store.id] as Partial<ShopifyAutomationSettings> || {}).autoCreateSocialPosts}
                              onChange={() => handleToggleAutomation(store.id, "autoCreateSocialPosts")}
                              className="accent-indigo-500 rounded cursor-pointer"
                            />
                          </label>

                          <label className="flex items-center justify-between p-2 bg-[#12131a] rounded border border-gray-850 cursor-pointer select-none">
                            <span className="text-gray-300">Competitor Monitor</span>
                            <input
                              type="checkbox"
                              checked={!!(settings[store.id] as Partial<ShopifyAutomationSettings> || {}).autoCompetitorMonitoring}
                              onChange={() => handleToggleAutomation(store.id, "autoCompetitorMonitoring")}
                              className="accent-indigo-500 rounded cursor-pointer"
                            />
                          </label>

                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>

        </div>

        {/* Sync Automation Log events side */}
        <div className="lg:col-span-5 space-y-4">
          <span className="text-[10px] font-mono text-gray-400 font-bold block uppercase tracking-wider">
            Automations Audit Stream
          </span>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {automationRuns.length === 0 ? (
              <p className="text-xs text-gray-500 font-mono italic p-6 text-center border border-gray-900 bg-[#0c0d12]/30 rounded-xl">
                No store automation events captured in this interval.
              </p>
            ) : (
              automationRuns.map((run) => (
                <div key={run.id} className="p-3 bg-[#0c0d12] border border-gray-800/40 rounded-lg space-y-1 text-[11px] font-mono hover:border-gray-800 transition-all">
                  <div className="flex justify-between items-center">
                    <span className="text-indigo-400 font-bold capitalize truncate max-w-[170px]">
                      {run.action?.replace(/_/g, " ")}
                    </span>
                    <span className={`text-[9px] px-1 rounded ${
                      run.status === "completed" 
                        ? "bg-emerald-950/40 text-emerald-400" 
                        : "bg-amber-950/40 text-amber-400"
                    }`}>
                      {run.status}
                    </span>
                  </div>
                  <p className="text-gray-400 font-sans leading-relaxed">{run.detail}</p>
                  <span className="text-[9px] text-gray-500 block pt-0.5">{run.createdAt ? run.createdAt.split("T")[1]?.substring(0, 8) : ""}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

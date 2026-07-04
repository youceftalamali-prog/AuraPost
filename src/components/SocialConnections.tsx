import React, { useState, useEffect } from "react";
import { 
  Cable, 
  Link2, 
  Trash2, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Globe, 
  Instagram, 
  Twitter, 
  Linkedin, 
  Facebook, 
  Youtube, 
  Share2 
} from "lucide-react";
import { SocialAccount, SocialPlatform } from "../types.ts";

interface SocialConnectionsProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
  testMode?: boolean;
}

const PLATFORM_ICONS: Record<SocialPlatform, any> = {
  tiktok: Youtube,
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

export default function SocialConnections({
  workspaceId,
  onAddAuditLog,
  testMode = false
}: SocialConnectionsProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [supportedPlatforms, setSupportedPlatforms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Custom UI modal & notification state replacements for iframe-safe compliance
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalMessage, setConfirmModalMessage] = useState("");
  const [confirmingAction, setConfirmingAction] = useState<(() => Promise<void>) | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customSuccess, setCustomSuccess] = useState<string | null>(null);
  const [showPopupBlockedWarning, setShowPopupBlockedWarning] = useState(false);

  // Diagnostics states
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);

  const loadDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const response = await fetch("/api/publishing/meta-diagnostics");
      if (response.ok) {
        const data = await response.json();
        setDiagnostics(data);
      }
    } catch (err) {
      console.error("[SocialConnections] Failed to load diagnostics:", err);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const loadConnections = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/publishing/accounts?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
        setSupportedPlatforms(data.supportedPlatforms || []);
      }
    } catch (err) {
      console.error("[SocialConnections] Failed to load connections:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
    loadDiagnostics();
  }, [workspaceId]);

  const handleMetaOAuth = async () => {
    setConnecting(true);
    setConnectionError(null);
    setShowPopupBlockedWarning(false);
    try {
      const origin = window.location.origin;
      const response = await fetch(`/api/auth/meta/url?workspaceId=${workspaceId}&origin=${encodeURIComponent(origin)}`);
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to retrieve Meta authorization URL.");
      }

      const { url } = data;
      const width = 620;
      const height = 750;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const authWindow = window.open(
        url,
        "meta_oauth_popup",
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
      );

      if (!authWindow) {
        setShowPopupBlockedWarning(true);
      }
    } catch (err: any) {
      console.error("[Meta OAuth Trigger Error]", err);
      setConnectionError(err.message || "An unexpected error occurred during connection.");
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        setConnectionError(null);
        setCustomSuccess("Successfully synchronized verified Meta Brand pages and profiles!");
        loadConnections();
        onAddAuditLog("publishing.account_linked", "Successfully synchronized verified Meta Brand pages and profiles!");
      } else if (event.data?.type === "OAUTH_AUTH_ERROR") {
        setConnectionError(event.data.error || "Meta authentication failed.");
        onAddAuditLog("publishing.account_link_failed", `Meta synchronization failed: ${event.data.error}`);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [workspaceId]);

  const askConfirmation = (message: string, action: () => Promise<void>) => {
    setConfirmModalMessage(message);
    setConfirmingAction(() => action);
    setShowConfirmModal(true);
  };

  const executeDeleteAccount = async (accId: string, accUser: string) => {
    try {
      const response = await fetch(`/api/publishing/accounts/${accId}?workspaceId=${workspaceId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        onAddAuditLog("publishing.account_disconnected", `Revoked access tokens and removed channel connection: ${accUser}`);
        setCustomSuccess(`Successfully disconnected ${accUser}.`);
        loadConnections();
      } else {
        const data = await response.json();
        setCustomError(`Failed to delete account: ${data.error || "Unknown server error"}`);
      }
    } catch (err: any) {
      console.error("[SocialConnections] Failed to delete connection:", err);
      setCustomError(`Error: ${err.message || "Failed to contact the server"}`);
    }
  };

  const handleDeleteAccount = (accId: string, accUser: string) => {
    askConfirmation(
      `Are you sure you want to disconnect ${accUser}?`,
      () => executeDeleteAccount(accId, accUser)
    );
  };

  const executeDisconnectSuite = async () => {
    try {
      const response = await fetch(`/api/publishing/accounts/clear-meta?workspaceId=${workspaceId}`, {
        method: "POST"
      });
      if (response.ok) {
        onAddAuditLog("publishing.suite_disconnected", "Successfully disconnected and cleared all Meta Suite profiles from the workspace database.");
        setCustomSuccess("Successfully disconnected and cleared all Meta Suite profiles.");
        loadConnections();
      } else {
        const data = await response.json();
        setCustomError(`Failed to disconnect suite: ${data.error || "Unknown server error"}`);
      }
    } catch (err: any) {
      console.error("[SocialConnections] Failed to disconnect suite:", err);
      setCustomError(`Error: ${err.message || "Failed to contact the server"}`);
    }
  };

  const handleDisconnectSuite = () => {
    askConfirmation(
      "Are you sure you want to disconnect and clear all Facebook and Instagram suite accounts? This will delete all connected pages and profiles so you can start fresh with clean permissions.",
      executeDisconnectSuite
    );
  };

  const fbPages = accounts.filter(a => a.platform === "facebook");
  const igAccounts = accounts.filter(a => a.platform === "instagram");
  const otherAccounts = accounts.filter(a => a.platform !== "facebook" && a.platform !== "instagram");

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-850 p-6 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Cable className="w-5 h-5 text-indigo-400" />
            Social Connections Suite
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Authorize storefront profiles and establish secure API sync gateways with core distribution networks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleMetaOAuth}
            disabled={connecting}
            className="h-9 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-pink-600 hover:from-blue-500 hover:to-pink-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {connecting ? "Connecting..." : "Connect Facebook & Instagram"}
          </button>
          <button 
            onClick={loadConnections}
            className="p-2.5 rounded-lg bg-[#0c0d12] border border-gray-850 text-gray-400 hover:text-white cursor-pointer transition-all hover:border-gray-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {connectionError && (
        <div className="bg-rose-950/20 border border-rose-900/40 p-4 rounded-xl text-rose-400 space-y-3 max-w-2xl mx-auto">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-white">
                Meta OAuth Connection Interrupted
              </h4>
              <p className="text-xs text-gray-300 leading-relaxed mt-1 font-mono bg-black/30 p-2 rounded border border-rose-900/20">
                {connectionError}
              </p>
            </div>
          </div>
          {connectionError.includes("META_APP_ID") && (
            <div className="border-t border-rose-900/30 pt-3 text-xs text-gray-400 pl-7 space-y-2">
              <p className="font-bold text-gray-200">🛠️ How to resolve this in Google AI Studio:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-gray-300">
                <li>Click the <strong className="text-white">Settings</strong> (or <strong className="text-white">Secrets</strong>) menu in the Google AI Studio interface.</li>
                <li>Add the following environment variable keys with your Meta Developer App credentials:
                  <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-indigo-300 font-mono text-[11px]">
                    <li>META_APP_ID</li>
                    <li>META_APP_SECRET</li>
                  </ul>
                </li>
                <li>Save the secrets and allow the development server to automatically reload with your new credentials!</li>
              </ol>
              <p className="text-[11px] text-gray-500 mt-1">
                Note: You can obtain these keys by registering a new application at the <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-indigo-400 underline hover:text-indigo-300">Meta for Developers Portal</a>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Grid of active linked channels */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-emerald-400" />
          Active Brand Distribution Channels ({accounts.length})
        </h4>

        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            <div className="h-32 bg-[#0c0d12] rounded-xl animate-pulse border border-gray-850" />
          </div>
        ) : accounts.length > 0 ? (
          <div className="space-y-6">
            {fbPages.map((page) => {
              const linkedIg = igAccounts[0]; // In our environment, we discover and match the linked Instagram Business account
              return (
                <div 
                  key={page.id}
                  className="bg-[#0c0d12] p-5 rounded-xl border border-gray-850 hover:border-gray-800 transition-all space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">Verified Brand Suite</span>
                    </div>
                    <button
                      onClick={handleDisconnectSuite}
                      className="p-1.5 text-gray-500 hover:text-rose-400 transition-all rounded hover:bg-gray-900 cursor-pointer text-xs flex items-center gap-1.5"
                      title="Disconnect Facebook Page"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-mono">Disconnect Suite</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                    {/* Facebook Page Column */}
                    <div className="bg-[#11121a] p-4 rounded-xl border border-gray-850/60 flex items-center gap-4">
                      <div className="relative shrink-0">
                        <img 
                          src={page.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60"} 
                          alt={page.username}
                          className="w-12 h-12 rounded-full object-cover border border-blue-600/30"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white p-1 rounded-full border border-[#11121a]">
                          <Facebook className="w-3 h-3 fill-white" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-bold text-white block truncate" title={page.username}>
                          {page.username}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono block mt-0.5">
                          Page ID: {page.platformUserId}
                        </span>
                        
                        <div className="mt-2.5 space-y-1">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block font-mono">
                            OAuth Scopes & Live Status:
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {(() => {
                              const reqScopes = [
                                "pages_show_list",
                                "business_management",
                                "pages_read_engagement",
                                "pages_manage_posts",
                                "instagram_business_basic",
                                "instagram_business_content_publish",
                                "pages_read_user_content"
                              ];
                              const activeScopes = diagnostics?.pageAccessTokenPermissions?.scopes || [];
                              const hasScopesInfo = activeScopes.length > 0;

                              return reqScopes.map((scope) => {
                                const isActive = activeScopes.includes(scope);
                                return (
                                  <span 
                                    key={scope} 
                                    className={`inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                                      !hasScopesInfo 
                                        ? "text-gray-400 bg-gray-900 border-gray-850"
                                        : isActive 
                                        ? "text-blue-400 bg-blue-950/20 border-blue-900/30" 
                                        : "text-rose-400 bg-rose-950/20 border-rose-900/30 line-through decoration-rose-500/60"
                                    }`}
                                    title={!hasScopesInfo ? "Status pending publication test" : isActive ? "Active permission verified" : "Missing permission (Critical failure risk)"}
                                  >
                                    {scope}
                                    {hasScopesInfo && (isActive ? " ✓" : " ✗")}
                                  </span>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Instagram Profile Column */}
                    {linkedIg ? (
                      <div className="bg-[#11121a] p-4 rounded-xl border border-gray-850 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative shrink-0">
                            <img 
                              src={linkedIg.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60"} 
                              alt={linkedIg.username}
                              className="w-12 h-12 rounded-full object-cover border border-pink-500/30"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute -bottom-1 -right-1 bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 text-white p-1 rounded-full border border-[#11121a]">
                              <Instagram className="w-3 h-3 text-white" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-white block truncate" title={linkedIg.username}>
                              @{linkedIg.username}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono block mt-0.5">
                              Business ID: {linkedIg.platformUserId}
                            </span>
                            <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-mono text-pink-400 bg-pink-950/30 px-1.5 py-0.5 rounded">
                              Discovered through Page
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={handleDisconnectSuite}
                          className="p-1 rounded text-gray-500 hover:text-rose-400 transition-all hover:bg-gray-900 cursor-pointer"
                          title="Disconnect Instagram Profile"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="bg-[#11121a]/50 p-4 rounded-xl border border-dashed border-gray-800 flex items-center gap-3.5 min-h-[82px]">
                        <div className="w-10 h-10 rounded-full bg-gray-900/60 flex items-center justify-center text-gray-600 border border-gray-850 shrink-0">
                          <Instagram className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-gray-400 block">No linked Instagram account found</span>
                            <span className="text-[8px] font-mono text-amber-500 bg-amber-950/30 border border-amber-900/40 px-1 rounded uppercase tracking-wider">Null Response</span>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                            To fix: link your Instagram Business/Creator account inside your Facebook Page settings (Settings &gt; Linked Accounts) and verify permissions.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Other accounts if any */}
            {otherAccounts.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-gray-900">
                {otherAccounts.map((acc) => (
                  <div key={acc.id} className="bg-[#0c0d12] p-4.5 rounded-xl border border-gray-850 flex items-center justify-between">
                    <span className="text-white text-xs">{acc.username} ({acc.platform})</span>
                    <button
                      onClick={() => handleDeleteAccount(acc.id, acc.username)}
                      className="text-gray-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-850 p-6 bg-[#0a0b10] flex flex-col md:flex-row items-center justify-between gap-6 max-w-4xl mx-auto">
            <div className="space-y-2 flex-1">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Link2 className="w-4 h-4 text-indigo-400" />
                Meta Brand Onboarding
              </h4>
              <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
                Connect your Facebook Pages and Instagram Business Accounts using Meta's official OAuth authorization mechanism. Once verified, campaigns will publish directly to your live channels.
              </p>
              <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-mono text-gray-500">
                <span className="px-2 py-0.5 rounded bg-gray-900">pages_show_list</span>
                <span className="px-2 py-0.5 rounded bg-gray-900">business_management</span>
                <span className="px-2 py-0.5 rounded bg-gray-900">pages_read_engagement</span>
                <span className="px-2 py-0.5 rounded bg-gray-900">pages_manage_posts</span>
                <span className="px-2 py-0.5 rounded bg-gray-900">instagram_business_basic</span>
                <span className="px-2 py-0.5 rounded bg-gray-900">instagram_business_content_publish</span>
                <span className="px-2 py-0.5 rounded bg-gray-900">pages_read_user_content</span>
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-center shrink-0">
              <button
                onClick={handleMetaOAuth}
                disabled={connecting}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-pink-600 hover:from-blue-500 hover:to-pink-500 text-white font-bold rounded-xl text-xs flex items-center gap-2.5 transition-all cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {connecting ? "Connecting..." : "Connect Facebook & Instagram"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Meta Diagnostics Report Panel */}
      <div className="mt-8 bg-[#0b0c10] rounded-xl border border-gray-850 overflow-hidden shadow-2xl">
        <div className="bg-[#0e0f15] border-b border-gray-850 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-indigo-950/30 text-indigo-400 border border-indigo-900/20">
              <RefreshCw className={`w-4 h-4 ${loadingDiagnostics ? "animate-spin" : ""}`} />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-white">
                Meta Diagnostics & Compliance Hub
              </h4>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Real-time token validation, permissions auditing, and raw Meta Graph API responses.
              </p>
            </div>
          </div>
          <button
            onClick={loadDiagnostics}
            disabled={loadingDiagnostics}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-850 text-gray-300 hover:text-white font-mono text-[10px] rounded border border-gray-800 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loadingDiagnostics ? "animate-spin" : ""}`} />
            Refresh Diagnostics
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Diagnostic Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. User Access Token Permissions */}
            <div className="bg-[#11121a] p-4 rounded-lg border border-gray-850/60 space-y-2">
              <h5 className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400">
                1. User Access Token Permissions
              </h5>
              <div className="text-[11px] text-gray-300 leading-relaxed font-mono">
                {(() => {
                  const data = diagnostics?.userAccessTokenPermissions;
                  if (!data) return <span className="text-gray-500">No token debugged yet.</span>;
                  if (data.info) return <span className="text-amber-400">{data.info}</span>;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Token Type:</span>
                        <span className="text-white font-bold">{data.type || "USER"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Valid:</span>
                        <span className={data.is_valid ? "text-emerald-400" : "text-rose-400"}>
                          {data.is_valid ? "TRUE ✓" : "FALSE ✗"}
                        </span>
                      </div>
                      <div className="mt-2">
                        <span className="text-gray-500 block mb-1">Scopes authorized by user:</span>
                        <div className="flex flex-wrap gap-1">
                          {(data.scopes || []).map((s: string) => (
                            <span key={s} className="px-1.5 py-0.5 rounded bg-indigo-950/20 text-indigo-300 border border-indigo-900/30 text-[9px]">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 2. Page Access Token Permissions */}
            <div className="bg-[#11121a] p-4 rounded-lg border border-gray-850/60 space-y-2">
              <h5 className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400">
                2. Page Access Token Permissions
              </h5>
              <div className="text-[11px] text-gray-300 leading-relaxed font-mono">
                {(() => {
                  const data = diagnostics?.pageAccessTokenPermissions;
                  if (!data) return <span className="text-gray-500">No token debugged yet.</span>;
                  if (data.info) return <span className="text-amber-400">{data.info}</span>;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">App ID:</span>
                        <span className="text-white font-bold">{data.app_id || "N/A"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Valid:</span>
                        <span className={data.is_valid ? "text-emerald-400" : "text-rose-400"}>
                          {data.is_valid ? "TRUE ✓" : "FALSE ✗"}
                        </span>
                      </div>
                      <div className="mt-2">
                        <span className="text-gray-500 block mb-1">Page level scopes:</span>
                        <div className="flex flex-wrap gap-1">
                          {(data.scopes || []).map((s: string) => (
                            <span key={s} className="px-1.5 py-0.5 rounded bg-blue-950/20 text-blue-300 border border-blue-900/30 text-[9px]">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 3. Instagram Business Permissions */}
            <div className="bg-[#11121a] p-4 rounded-lg border border-gray-850/60 space-y-2">
              <h5 className="text-[10px] font-mono font-bold uppercase tracking-wider text-pink-400">
                3. Instagram Business Permissions
              </h5>
              <div className="text-[11px] text-gray-300 leading-relaxed font-mono">
                {(() => {
                  const data = diagnostics?.instagramBusinessPermissions;
                  if (!data) return <span className="text-gray-500">No Instagram debug data.</span>;
                  if (data.info) {
                    const hasIgToken = diagnostics?.pageAccessTokenPermissions?.scopes?.includes("instagram_business_content_publish");
                    return (
                      <div className="space-y-1.5">
                        <p className="text-gray-400 leading-snug">{data.info}</p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-900">
                          <span className="text-gray-500">Publish Scope:</span>
                          <span className={hasIgToken ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                            {hasIgToken ? "AUTHORIZED ✓" : "MISSING ✗"}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Status:</span>
                        <span className={data.status === "Authorized" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {data.status || "N/A"}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 leading-snug">{data.info}</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* 4 & 5. Exact Request & Response */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 4. Exact Graph API Request */}
            <div className="bg-[#07080c] rounded-lg border border-gray-850 p-4 space-y-2.5">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2">
                <h5 className="text-[10px] font-mono font-bold uppercase tracking-wider text-yellow-500">
                  4. Exact Graph API Request used for publishing
                </h5>
                {diagnostics?.platform && (
                  <span className="text-[9px] font-mono bg-yellow-950/40 text-yellow-400 border border-yellow-900/40 px-1.5 rounded uppercase font-bold">
                    {diagnostics.platform}
                  </span>
                )}
              </div>
              <div className="space-y-2 text-[11px] font-mono leading-relaxed">
                {(() => {
                  const req = diagnostics?.exactRequest;
                  if (!req) return <p className="text-gray-500">No request logs recorded yet.</p>;
                  if (req.info) return <p className="text-gray-500">{req.info}</p>;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-400 font-bold">{req.method}</span>
                        <span className="text-gray-400 break-all">{req.endpoint}</span>
                      </div>
                      <div className="bg-[#030406] p-2.5 rounded border border-gray-900 overflow-x-auto text-[10px]">
                        <span className="text-gray-500 block mb-1">// Request Headers</span>
                        <pre className="text-blue-300">{JSON.stringify(req.headers || {}, null, 2)}</pre>
                      </div>
                      {req.body && (
                        <div className="bg-[#030406] p-2.5 rounded border border-gray-900 overflow-x-auto text-[10px]">
                          <span className="text-gray-500 block mb-1">// Request Payload (access_token masked)</span>
                          <pre className="text-indigo-300">
                            {(() => {
                              try {
                                const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
                                return JSON.stringify(parsed, null, 2);
                              } catch (e) {
                                return req.body;
                              }
                            })()}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 5. Exact Graph API Response */}
            <div className="bg-[#07080c] rounded-lg border border-gray-850 p-4 space-y-2.5">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2">
                <h5 className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-500">
                  5. Exact Graph API Response returned by Meta
                </h5>
                {diagnostics?.status && (
                  <span className={`text-[9px] font-mono px-1.5 rounded font-bold uppercase ${
                    diagnostics.status === "success" 
                      ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/40" 
                      : "bg-rose-950/40 text-rose-400 border border-rose-900/40"
                  }`}>
                    {diagnostics.status}
                  </span>
                )}
              </div>
              <div className="space-y-2 text-[11px] font-mono leading-relaxed">
                {(() => {
                  const res = diagnostics?.exactResponse;
                  if (!res) return <p className="text-gray-500">No response logs recorded yet.</p>;
                  if (res.info) return <p className="text-gray-500">{res.info}</p>;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">HTTP Status:</span>
                        <span className={`font-bold ${res.status >= 200 && res.status < 300 ? "text-emerald-400" : "text-rose-400"}`}>
                          {res.status} {res.statusText}
                        </span>
                      </div>
                      <div className="bg-[#030406] p-2.5 rounded border border-gray-900 overflow-x-auto text-[10px]">
                        <span className="text-gray-500 block mb-1">// Meta Response Body</span>
                        <pre className={res.status >= 200 && res.status < 300 ? "text-emerald-300" : "text-rose-400"}>
                          {(() => {
                            try {
                              const parsed = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
                              return JSON.stringify(parsed, null, 2);
                            } catch (e) {
                              return res.body;
                            }
                          })()}
                        </pre>
                      </div>
                      {res.status >= 400 && (
                        <div className="p-2.5 bg-rose-950/25 rounded border border-rose-900/30 text-rose-300 text-[10px] leading-relaxed">
                          <strong className="text-rose-200 block mb-1">Compliance Root Cause Analysis:</strong>
                          {(() => {
                            try {
                              const parsed = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
                              const errMsg = parsed?.error?.message || "";
                              const errType = parsed?.error?.type || "";
                              const errCode = parsed?.error?.code || "";

                              if (errMsg.includes("permission") || errMsg.includes("pages_read_engagement")) {
                                return `Meta rejected this publication because your Page Access Token is missing the mandatory 'pages_read_engagement' (or related page publishing) scope. Go back to your Meta Developer Portal (https://developers.facebook.com) -> App Dashboard -> App Review -> Permissions and Features, and ensure 'pages_read_engagement' and 'pages_manage_posts' are granted and verified.`;
                              }
                              return `Error Code ${errCode} (${errType}): ${errMsg}`;
                            } catch (e) {
                              return "Unable to parse Meta API response error body. Check raw response details above.";
                            }
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Popup Blocked Warning Inline Card */}
      {showPopupBlockedWarning && (
        <div className="bg-amber-950/20 border border-amber-900/40 p-4 rounded-xl text-amber-400 max-w-2xl mx-auto mt-4 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-white">
                OAuth Popup Blocked by Browser
              </h4>
              <p className="text-xs text-gray-300 leading-relaxed mt-1">
                A browser popup window is required to login with Facebook securely. Please enable popups in your browser address bar and try clicking the connect button again.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal Overlay */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#12131a] border border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 shrink-0 border border-amber-950/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Confirm Action</h4>
                <p className="text-xs text-gray-300 leading-relaxed font-sans mt-2">{confirmModalMessage}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmingAction(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white bg-gray-900 hover:bg-gray-850 rounded-lg cursor-pointer transition-all border border-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowConfirmModal(false);
                  if (confirmingAction) {
                    await confirmingAction();
                  }
                  setConfirmingAction(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 rounded-lg cursor-pointer transition-all shadow-lg"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Alert */}
      {customSuccess && (
        <div className="fixed bottom-6 right-6 z-[999] bg-[#0d1510] border border-emerald-900/40 px-5 py-4 rounded-xl shadow-2xl max-w-sm flex items-start gap-3 animate-slide-up">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">Success</h5>
            <p className="text-xs text-gray-300 mt-1 leading-snug">{customSuccess}</p>
          </div>
          <button 
            onClick={() => setCustomSuccess(null)}
            className="text-gray-500 hover:text-white text-xs font-semibold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Notification Alert */}
      {customError && (
        <div className="fixed bottom-6 right-6 z-[999] bg-[#1a0f12] border border-rose-900/40 px-5 py-4 rounded-xl shadow-2xl max-w-sm flex items-start gap-3 animate-slide-up">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-bold text-rose-500 uppercase tracking-wider font-mono">Notification</h5>
            <p className="text-xs text-gray-300 mt-1 leading-snug">{customError}</p>
          </div>
          <button 
            onClick={() => setCustomError(null)}
            className="text-gray-500 hover:text-white text-xs font-semibold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

    </div>
  );
}

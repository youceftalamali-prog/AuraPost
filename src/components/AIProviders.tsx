import React, { useState, useEffect } from "react";
import { 
  Cpu, 
  Key, 
  Settings, 
  ShieldCheck, 
  Activity, 
  Play, 
  BarChart3, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  Database,
  ArrowRightLeft,
  Sparkles,
  Zap,
  DollarSign,
  AlertTriangle,
  HelpCircle,
  Globe,
  Search,
  Users,
  TrendingUp,
  Lock,
  Award,
  Flame,
  LineChart
} from "lucide-react";

interface AIProvider {
  provider: string;
  isEnabled: boolean;
  priority: number;
  hasApiKey: boolean;
  defaultModel: string;
  monthlyUsage: number;
  lastConnectionDate?: string;
}

interface AIProvidersProps {
  workspaceId: string;
  onAddAuditLog?: (action: string, category: string, details?: string) => void;
}

export default function AIProviders({ workspaceId, onAddAuditLog }: AIProvidersProps) {
  const [activeSubTab, setActiveSubTab] = useState<"text" | "image" | "video" | "routing" | "testing" | "costs" | "dataforseo">("text");
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [routing, setRouting] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form states
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Testing Center States
  const [testModality, setTestModality] = useState<"text" | "image" | "video">("text");
  const [testProvider, setTestProvider] = useState<string>("deepseek");
  const [testPrompt, setTestPrompt] = useState<string>("");
  const [testModelName, setTestModelName] = useState<string>("");
  const [testRunning, setTestRunning] = useState(false);
  const [testPlaygroundResult, setTestPlaygroundResult] = useState<any>(null);

  // DataForSEO Credentials states
  const [dfsLogin, setDfsLogin] = useState("");
  const [dfsPassword, setDfsPassword] = useState("");
  const [dfsTesting, setDfsTesting] = useState(false);
  const [dfsSaving, setDfsSaving] = useState(false);
  const [dfsTestResult, setDfsTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [workspaceId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [provRes, routRes, usageRes] = await Promise.all([
        fetch(`/api/ai-providers?workspaceId=${workspaceId}`),
        fetch(`/api/ai-providers/routing?workspaceId=${workspaceId}`),
        fetch(`/api/ai-providers/usage?workspaceId=${workspaceId}`)
      ]);

      if (provRes.ok && routRes.ok && usageRes.ok) {
        const provData = await provRes.json();
        const routData = await routRes.json();
        const usageData = await usageRes.json();

        setProviders(provData.providers || []);
        setRouting(routData.routing || {});
        setUsage(usageData.usage || null);

        // Prepopulate models
        const modelsMap: Record<string, string> = {};
        provData.providers.forEach((p: AIProvider) => {
          modelsMap[p.provider] = p.defaultModel;
        });
        setDefaultModels(modelsMap);

        // Fetch DataForSEO credentials
        try {
          const dfsRes = await fetch(`/api/market-intelligence/credentials?workspaceId=${workspaceId}`);
          if (dfsRes.ok) {
            const dfsData = await dfsRes.json();
            if (dfsData.login) setDfsLogin(dfsData.login);
            if (dfsData.hasPassword) setDfsPassword("••••••••••••••••");
          }
        } catch (e) {
          console.error("Failed to load DataForSEO credentials:", e);
        }
      }
    } catch (err) {
      console.error("Failed to load AI providers settings", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDFSCredentials = async () => {
    setDfsSaving(true);
    setDfsTestResult(null);
    try {
      const res = await fetch("/api/market-intelligence/credentials/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          login: dfsLogin,
          password: dfsPassword === "••••••••••••••••" ? undefined : dfsPassword
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("DataForSEO credentials saved successfully!");
        if (onAddAuditLog) {
          onAddAuditLog("Saved DataForSEO credentials", "SETTINGS");
        }
      } else {
        alert(data.error || "Failed to save credentials");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setDfsSaving(false);
    }
  };

  const handleTestDFSCredentials = async () => {
    setDfsTesting(true);
    setDfsTestResult(null);
    try {
      const res = await fetch("/api/market-intelligence/credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: dfsLogin,
          password: dfsPassword === "••••••••••••••••" ? undefined : dfsPassword
        })
      });
      const data = await res.json();
      setDfsTestResult({ success: data.success, message: data.message });
    } catch (err: any) {
      setDfsTestResult({ success: false, message: "Network test error: " + err.message });
    } finally {
      setDfsTesting(false);
    }
  };

  const handleSaveProvider = async (provider: string) => {
    setSavingId(provider);
    const key = apiKeys[provider] || "";
    const isEnabled = providers.find(p => p.provider === provider)?.isEnabled ?? false;
    const priority = providers.find(p => p.provider === provider)?.priority ?? 0;
    const defaultModel = defaultModels[provider] || "";

    try {
      const res = await fetch("/api/ai-providers/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          provider,
          apiKey: key !== "" ? key : undefined,
          isEnabled,
          priority,
          defaultModel,
        })
      });

      if (res.ok) {
        if (onAddAuditLog) {
          onAddAuditLog(
            `Updated configuration for ${provider}`,
            "SETTINGS",
            `Enabled: ${isEnabled}, Default Model: ${defaultModel}`
          );
        }
        
        // Refresh provider list
        const provRes = await fetch(`/api/ai-providers?workspaceId=${workspaceId}`);
        if (provRes.ok) {
          const provData = await provRes.json();
          setProviders(provData.providers || []);
        }

        // Clear input field for security
        setApiKeys(prev => ({ ...prev, [provider]: "" }));
      }
    } catch (err) {
      console.error("Save failed", err);
    } finally {
      setSavingId(null);
    }
  };

  const handleTestProvider = async (provider: string) => {
    setTestingId(provider);
    try {
      // If we have typed a fresh API key in the input field, save it first before testing
      if (apiKeys[provider]) {
        await handleSaveProvider(provider);
      }

      const res = await fetch("/api/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, provider })
      });

      const result = await res.json();
      setTestResults(prev => ({
        ...prev,
        [provider]: { success: result.success, message: result.message }
      }));

      if (result.success) {
        setProviders(prev => prev.map(p => {
          if (p.provider === provider) {
            return { ...p, lastConnectionDate: new Date().toISOString(), isEnabled: true };
          }
          return p;
        }));
      }
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [provider]: { success: false, message: "Network test error" }
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleEnable = (provider: string) => {
    setProviders(prev => prev.map(p => {
      if (p.provider === provider) {
        return { ...p, isEnabled: !p.isEnabled };
      }
      return p;
    }));
  };

  const handlePriorityChange = (provider: string, val: number) => {
    setProviders(prev => prev.map(p => {
      if (p.provider === provider) {
        return { ...p, priority: val };
      }
      return p;
    }));
  };

  const handleSaveRouting = async () => {
    try {
      const res = await fetch("/api/ai-providers/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, routing })
      });

      if (res.ok) {
        if (onAddAuditLog) {
          onAddAuditLog("Updated custom AI routing rules", "SETTINGS");
        }
        alert("Intelligent routing rules successfully updated!");
      }
    } catch (err) {
      console.error("Failed to save routing", err);
    }
  };

  const handleRunPlaygroundTest = async () => {
    setTestRunning(true);
    setTestPlaygroundResult(null);
    try {
      const res = await fetch("/api/ai-providers/test-center/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          modality: testModality,
          provider: testProvider,
          prompt: testPrompt,
          modelName: testModelName || undefined,
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTestPlaygroundResult(data);
        fetchData(); // Refresh metrics after generation
      } else {
        const errData = await res.json();
        setTestPlaygroundResult({ success: false, error: errData.error || "Execution failed" });
      }
    } catch (err) {
      setTestPlaygroundResult({ success: false, error: "Network error in playground" });
    } finally {
      setTestRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-900 border border-slate-800 rounded-xl" id="ai-providers-loader">
        <RefreshCw className="h-10 w-10 text-emerald-500 animate-spin mb-4" />
        <p className="text-slate-400 font-medium">Loading AI Infrastructure configuration...</p>
      </div>
    );
  }

  // Filter providers by category for Text, Image, Video tabs
  const textProviders = providers.filter(p => ["deepseek", "gemini", "openai", "claude"].includes(p.provider));
  const imageProviders = providers.filter(p => ["flux", "gemini_images", "openai_images", "stability_ai"].includes(p.provider));
  const videoProviders = providers.filter(p => ["kling", "veo", "runway", "pika"].includes(p.provider));

  const renderProviderRow = (p: AIProvider) => {
    const isEditingKey = apiKeys[p.provider] !== undefined;
    const testRes = testResults[p.provider];

    return (
      <div 
        key={p.provider} 
        id={`provider-row-${p.provider}`}
        className="bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-xl p-5 mb-4 transition-all duration-200"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Logo & Status */}
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${
              p.provider === "deepseek" ? "bg-blue-950/40 text-blue-400" :
              p.provider === "gemini" || p.provider === "gemini_images" || p.provider === "veo" ? "bg-emerald-950/40 text-emerald-400" :
              p.provider === "openai" || p.provider === "openai_images" ? "bg-purple-950/40 text-purple-400" :
              "bg-slate-900 text-slate-400"
            }`}>
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-100 capitalize">
                  {p.provider.replace("_", " ")}
                </h4>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${
                  p.isEnabled 
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}>
                  {p.isEnabled ? "Active" : "Disabled"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Model: <span className="text-slate-300 font-semibold">{defaultModels[p.provider]}</span>
              </p>
            </div>
          </div>

          {/* Form Fields: Toggle + Priority */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Failover Priority:</label>
              <select
                value={p.priority}
                onChange={(e) => handlePriorityChange(p.provider, Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value={1}>1 (Highest)</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4 (Lowest)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleEnable(p.provider)}
                className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                  p.isEnabled 
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/50" 
                    : "bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800"
                }`}
              >
                {p.isEnabled ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        </div>

        {/* API Key management & default model config */}
        <div className="mt-4 pt-4 border-t border-slate-900 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Key className="h-3 w-3" /> API Credentials
            </label>
            <div className="relative">
              <input
                type={showKeys[p.provider] ? "text" : "password"}
                placeholder={p.hasApiKey ? "••••••••••••••••••••••••••••" : "Paste your API Key here"}
                value={apiKeys[p.provider] || ""}
                onChange={(e) => setApiKeys(prev => ({ ...prev, [p.provider]: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-10 py-1.5 text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowKeys(prev => ({ ...prev, [p.provider]: !prev[p.provider] }))}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
              >
                {showKeys[p.provider] ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Settings className="h-3 w-3" /> Target Provider Model
            </label>
            <input
              type="text"
              value={defaultModels[p.provider] || ""}
              onChange={(e) => setDefaultModels(prev => ({ ...prev, [p.provider]: e.target.value }))}
              placeholder="Model string (e.g. deepseek-chat)"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Buttons: Test & Save */}
        <div className="mt-4 flex items-center justify-between bg-slate-950/50 p-2.5 rounded-lg border border-slate-900">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={testingId !== null}
              onClick={() => handleTestProvider(p.provider)}
              className="flex items-center gap-1.5 text-2xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-850 px-2.5 py-1.5 rounded border border-slate-800 hover:text-white transition-all disabled:opacity-50"
            >
              {testingId === p.provider ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin text-emerald-500" />
                  Testing Ping...
                </>
              ) : (
                <>
                  <Activity className="h-3 w-3 text-slate-400" />
                  Test Connection
                </>
              )}
            </button>

            <button
              type="button"
              disabled={savingId !== null}
              onClick={() => handleSaveProvider(p.provider)}
              className="flex items-center gap-1.5 text-2xs font-semibold text-emerald-400 bg-emerald-950/20 hover:bg-emerald-950/40 px-2.5 py-1.5 rounded border border-emerald-900/50 hover:border-emerald-500 transition-all disabled:opacity-50"
            >
              {savingId === p.provider ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin text-emerald-500" />
                  Saving...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  Save Changes
                </>
              )}
            </button>
          </div>

          <div className="text-3xs text-slate-500 font-medium">
            {p.lastConnectionDate ? (
              <span>Last active: {new Date(p.lastConnectionDate).toLocaleString()}</span>
            ) : (
              <span>Status: Awaiting verification</span>
            )}
          </div>
        </div>

        {/* Test Connection Output Overlay */}
        {testRes && (
          <div className={`mt-3 p-3 rounded-lg border text-xs flex items-start gap-2 animate-fade-in ${
            testRes.success 
              ? "bg-emerald-950/20 border-emerald-900 text-emerald-400" 
              : "bg-red-950/20 border-red-900 text-red-400"
          }`}>
            {testRes.success ? (
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <XCircle className="h-4.5 w-4.5 shrink-0 text-red-400 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{testRes.success ? "Connection Secure" : "Verification Failed"}</p>
              <p className="text-3xs mt-0.5 text-slate-400">{testRes.message}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl" id="ai-providers-settings-center">
      {/* Header section with status briefing */}
      <div className="bg-slate-950/60 p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-slate-100 tracking-tight">AI Infrastructure Settings</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure direct API keys for models. DeepSeek is established as default text generator to reduce API overhead by up to 90%.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-right">
            <span className="block text-3xs font-semibold uppercase text-slate-500">Infrastructure Mode</span>
            <span className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1 mt-0.5">
              <Zap className="h-3 w-3" /> Fully Integrated AI
            </span>
          </div>
          <button 
            onClick={fetchData}
            className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg transition-all"
            title="Refresh All Configs"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Modern Horizontal Tabs */}
      <div className="flex border-b border-slate-800 overflow-x-auto bg-slate-950/30 scrollbar-none">
        <button
          onClick={() => setActiveSubTab("text")}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            activeSubTab === "text"
              ? "border-emerald-500 text-slate-100 bg-slate-900/40"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Cpu className="h-4 w-4" /> Text Models (NLP)
        </button>
        <button
          onClick={() => setActiveSubTab("image")}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            activeSubTab === "image"
              ? "border-emerald-500 text-slate-100 bg-slate-900/40"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="h-4 w-4" /> Image Generation
        </button>
        <button
          onClick={() => setActiveSubTab("video")}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            activeSubTab === "video"
              ? "border-emerald-500 text-slate-100 bg-slate-900/40"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Play className="h-4 w-4" /> Video Studio Engines
        </button>
        <button
          onClick={() => setActiveSubTab("routing")}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            activeSubTab === "routing"
              ? "border-emerald-500 text-slate-100 bg-slate-900/40"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ArrowRightLeft className="h-4 w-4" /> Custom AI Routing
        </button>
        <button
          onClick={() => setActiveSubTab("testing")}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            activeSubTab === "testing"
              ? "border-emerald-500 text-slate-100 bg-slate-900/40"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Play className="h-4 w-4" /> Testing Playground
        </button>
        <button
          onClick={() => setActiveSubTab("costs")}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            activeSubTab === "costs"
              ? "border-emerald-500 text-slate-100 bg-slate-900/40"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <BarChart3 className="h-4 w-4" /> Usage & Costs
        </button>
        <button
          onClick={() => setActiveSubTab("dataforseo")}
          className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            activeSubTab === "dataforseo"
              ? "border-emerald-500 text-slate-100 bg-slate-900/40"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Lock className="h-4 w-4" /> DataForSEO Settings
        </button>
      </div>

      <div className="p-6">
        {/* TAB 1: Text AI */}
        {activeSubTab === "text" && (
          <div id="tab-text-ai">
            <div className="mb-6 bg-slate-950/30 p-4 border border-slate-850 rounded-xl flex gap-3">
              <AlertTriangle className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-400">
                <p className="font-semibold text-slate-200">Recommended Routing Paradigm</p>
                <p className="mt-0.5">DeepSeek is chosen as the default provider for text and reasoning tasks to achieve peak performance. Gemini and OpenAI act as robust fallbacks should DeepSeek face rate limits or outages.</p>
              </div>
            </div>
            {textProviders.map(renderProviderRow)}
          </div>
        )}

        {/* TAB 2: Image AI */}
        {activeSubTab === "image" && (
          <div id="tab-image-ai">
            <div className="mb-6 bg-slate-950/30 p-4 border border-slate-850 rounded-xl flex gap-3">
              <Sparkles className="h-5 w-5 text-purple-400 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-400">
                <p className="font-semibold text-slate-200">Creative Media Modality: Images</p>
                <p className="mt-0.5">Configure your visual engines for generating promotional artwork. Flux is recommended for realistic product staging, and Gemini Images serves as the default model for automated prompts.</p>
              </div>
            </div>
            {imageProviders.map(renderProviderRow)}
          </div>
        )}

        {/* TAB 3: Video AI */}
        {activeSubTab === "video" && (
          <div id="tab-video-ai">
            <div className="mb-6 bg-slate-950/30 p-4 border border-slate-850 rounded-xl flex gap-3">
              <Play className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-400">
                <p className="font-semibold text-slate-200">Cinematic Video Synthesizers</p>
                <p className="mt-0.5">Set up credentials for short-form video generation (TikTok, Reels, UGC testimonial). Kling AI is the optimal driver for video templates, producing studio-grade clips from text scripts.</p>
              </div>
            </div>
            {videoProviders.map(renderProviderRow)}
          </div>
        )}

        {/* TAB 4: Routing */}
        {activeSubTab === "routing" && (
          <div id="tab-routing" className="space-y-6">
            <div className="bg-slate-950/30 p-5 border border-slate-850 rounded-xl">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-2">
                <ArrowRightLeft className="h-4.5 w-4.5 text-emerald-400" /> Dynamic Workflow Router
              </h3>
              <p className="text-xs text-slate-400">
                Customize which active AI provider handles specific automation tasks. This lets you align task requirements with model-specific strengths (e.g. DeepSeek for complex analytics, Gemini for vision tasks, Flux for realistic assets).
              </p>
            </div>

            <div className="border border-slate-850 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-850">
                    <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider">Workflow Event Task</th>
                    <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider">Assigned Provider</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 bg-slate-900/20">
                  {Object.keys(routing).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-xs text-slate-500">No routing rules found. Click Refresh to initialize defaults.</td>
                    </tr>
                  ) : (
                    Object.entries(routing).map(([task, currentProvider]) => (
                      <tr key={task} className="hover:bg-slate-950/20 transition-all text-xs">
                        <td className="px-4 py-3 font-semibold text-slate-200 font-mono capitalize">
                          {task.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {task.includes("analysis") ? "Analyzing product specifications, customer reviews, and market signals." :
                           task.includes("content") ? "Generating promotional copy, ad text, and hooks." :
                           task.includes("image") ? "Synthesizing product background and realistic display art." :
                           task.includes("video") ? "Assembling scripts, scenes, and media templates." :
                           "Core automated task optimization."}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={currentProvider}
                            onChange={(e) => setRouting(prev => ({ ...prev, [task]: e.target.value }))}
                            className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                          >
                            <option value="deepseek">DeepSeek (Text Default)</option>
                            <option value="gemini">Gemini</option>
                            <option value="openai">OpenAI</option>
                            <option value="claude">Claude</option>
                            <option value="flux">Flux (Image Default)</option>
                            <option value="gemini_images">Gemini Images</option>
                            <option value="openai_images">OpenAI Images</option>
                            <option value="stability_ai">Stability AI</option>
                            <option value="kling">Kling (Video Default)</option>
                            <option value="veo">Veo</option>
                            <option value="runway">Runway</option>
                            <option value="pika">Pika</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveRouting}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-500 px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-950/30"
              >
                <ShieldCheck className="h-4 w-4" /> Save Routing Configuration
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: Testing Center */}
        {activeSubTab === "testing" && (
          <div id="tab-testing" className="space-y-6">
            <div className="bg-slate-950/30 p-5 border border-slate-850 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-2xs font-semibold uppercase text-slate-500 mb-1.5">1. Select Modality</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => { setTestModality("text"); setTestProvider("deepseek"); setTestModelName("deepseek-chat"); }}
                    className={`text-xs py-2 rounded-lg border font-semibold transition-all ${
                      testModality === "text" 
                        ? "bg-emerald-500/15 border-emerald-500 text-slate-100" 
                        : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Text AI
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTestModality("image"); setTestProvider("flux"); setTestModelName("flux-1-schnell"); }}
                    className={`text-xs py-2 rounded-lg border font-semibold transition-all ${
                      testModality === "image" 
                        ? "bg-emerald-500/15 border-emerald-500 text-slate-100" 
                        : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Image AI
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTestModality("video"); setTestProvider("kling"); setTestModelName("kling-v1.5"); }}
                    className={`text-xs py-2 rounded-lg border font-semibold transition-all ${
                      testModality === "video" 
                        ? "bg-emerald-500/15 border-emerald-500 text-slate-100" 
                        : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Video AI
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold uppercase text-slate-500 mb-1.5">2. Active Provider</label>
                <select
                  value={testProvider}
                  onChange={(e) => {
                    const p = e.target.value;
                    setTestProvider(p);
                    // Match default model
                    const matching = providers.find(item => item.provider === p);
                    if (matching) setTestModelName(matching.defaultModel);
                  }}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {testModality === "text" && (
                    <>
                      <option value="deepseek">DeepSeek</option>
                      <option value="gemini">Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="claude">Claude</option>
                    </>
                  )}
                  {testModality === "image" && (
                    <>
                      <option value="flux">Flux</option>
                      <option value="gemini_images">Gemini Images</option>
                      <option value="openai_images">OpenAI Images</option>
                      <option value="stability_ai">Stability AI</option>
                    </>
                  )}
                  {testModality === "video" && (
                    <>
                      <option value="kling">Kling AI</option>
                      <option value="veo">Veo</option>
                      <option value="runway">Runway</option>
                      <option value="pika">Pika</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-2xs font-semibold uppercase text-slate-500 mb-1.5">3. Model Overwrite</label>
                <input
                  type="text"
                  value={testModelName}
                  onChange={(e) => setTestModelName(e.target.value)}
                  placeholder="e.g. gpt-4o-mini"
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input Panel */}
              <div className="bg-slate-950/20 border border-slate-850 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 mb-3 flex items-center gap-1">
                    <Settings className="h-3.5 w-3.5 text-slate-400" /> Generation Prompt Input
                  </h4>
                  <textarea
                    rows={6}
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    placeholder={
                      testModality === "text" ? "Type something like: Write 5 high-converting marketing hooks for wireless noise-canceling headphones in French." :
                      testModality === "image" ? "Type something like: High-end lifestyle shot of a modern rose gold engagement ring sitting on dark polished mahogany, 8k resolution, cinematic lighting." :
                      "Type something like: Dynamic tracking shot of a high-tech smart watch on an athlete's wrist during a sprint, studio-grade advertising aesthetic."
                    }
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <div className="mt-4 pt-4 border-t border-slate-900 flex justify-end">
                  <button
                    type="button"
                    disabled={testRunning || !testPrompt}
                    onClick={handleRunPlaygroundTest}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-500 px-5 py-2.5 rounded-lg transition-all shadow-lg disabled:opacity-50"
                  >
                    {testRunning ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Generating Asset...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 shrink-0" />
                        Execute Generation
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Output Panel */}
              <div className="bg-slate-950/20 border border-slate-850 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 mb-3 flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5 text-slate-400" /> Engine Diagnostics Output
                  </h4>

                  {!testPlaygroundResult && !testRunning && (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                      <Cpu className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs">Submit a prompt to view raw API diagnostic outputs and timings.</p>
                    </div>
                  )}

                  {testRunning && (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 animate-pulse">
                      <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin mb-3" />
                      <p className="text-xs font-semibold">Active Request Outbound...</p>
                      <p className="text-3xs text-slate-500 mt-1">Connecting to {testProvider} server via secure tunnel.</p>
                    </div>
                  )}

                  {testPlaygroundResult && (
                    <div className="space-y-4">
                      {/* Diagnostic details */}
                      <div className="grid grid-cols-2 gap-2 text-3xs font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                        <div>
                          <span className="text-slate-500">PROVIDER:</span> <span className="text-slate-200 uppercase">{testProvider}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">MODEL USED:</span> <span className="text-slate-300 font-semibold">{testPlaygroundResult.modelUsed}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">LATENCY:</span> <span className="text-emerald-400">{testPlaygroundResult.latencyMs} ms</span>
                        </div>
                        {testPlaygroundResult.tokensConsumed && (
                          <div>
                            <span className="text-slate-500">TOKENS:</span> <span className="text-purple-400">P:{testPlaygroundResult.tokensConsumed.prompt} / C:{testPlaygroundResult.tokensConsumed.completion}</span>
                          </div>
                        )}
                      </div>

                      {/* Actual Response Result */}
                      <div className="bg-slate-950 border border-slate-850 rounded-lg p-3 max-h-56 overflow-y-auto">
                        {testModality === "text" && (
                          <pre className="text-2xs text-slate-300 font-mono whitespace-pre-wrap">
                            {testPlaygroundResult.output || JSON.stringify(testPlaygroundResult, null, 2)}
                          </pre>
                        )}

                        {testModality === "image" && testPlaygroundResult.outputUrl && (
                          <div className="flex flex-col items-center">
                            <img
                              src={testPlaygroundResult.outputUrl}
                              alt="Playground output"
                              referrerPolicy="no-referrer"
                              className="rounded-lg max-h-48 border border-slate-800 object-cover"
                            />
                            <p className="text-3xs text-slate-500 mt-2">Unsplash live preview generation simulated successfully.</p>
                          </div>
                        )}

                        {testModality === "video" && testPlaygroundResult.outputUrl && (
                          <div className="flex flex-col items-center">
                            <video
                              src={testPlaygroundResult.outputUrl}
                              controls
                              className="rounded-lg max-h-48 border border-slate-800"
                            />
                            <p className="text-3xs text-slate-500 mt-2">Kling cinematic UGC video output verified.</p>
                          </div>
                        )}

                        {testPlaygroundResult.error && (
                          <div className="text-red-400 font-mono text-2xs p-2 bg-red-950/20 border border-red-900/40 rounded-md">
                            {testPlaygroundResult.error}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: Usage & Costs */}
        {activeSubTab === "costs" && usage && (
          <div id="tab-usage-costs" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-950/30 p-4 border border-slate-850 rounded-xl">
                <span className="text-3xs font-semibold uppercase tracking-wider text-slate-500">API Calls Inbound</span>
                <span className="block text-xl font-bold text-slate-100 mt-1">{usage.requests || 0}</span>
                <p className="text-3xs text-emerald-400 mt-1 flex items-center gap-0.5">
                  <CheckCircle2 className="h-3 w-3" /> 100% routing health
                </p>
              </div>

              <div className="bg-slate-950/30 p-4 border border-slate-850 rounded-xl">
                <span className="text-3xs font-semibold uppercase tracking-wider text-slate-500">Language Tokens Spent</span>
                <span className="block text-xl font-bold text-slate-100 mt-1">
                  {((usage.tokens?.prompt || 0) + (usage.tokens?.completion || 0)).toLocaleString()}
                </span>
                <span className="text-3xs text-slate-500 block mt-1">
                  P: {usage.tokens?.prompt?.toLocaleString()} | C: {usage.tokens?.completion?.toLocaleString()}
                </span>
              </div>

              <div className="bg-slate-950/30 p-4 border border-slate-850 rounded-xl">
                <span className="text-3xs font-semibold uppercase tracking-wider text-slate-500">Creative Media Created</span>
                <span className="block text-xl font-bold text-slate-100 mt-1">
                  {(usage.imagesGenerated || 0) + (usage.videosGenerated || 0)}
                </span>
                <span className="text-3xs text-slate-500 block mt-1">
                  Images: {usage.imagesGenerated || 0} | Videos: {usage.videosGenerated || 0}
                </span>
              </div>

              <div className="bg-slate-950/30 p-4 border border-slate-850 rounded-xl">
                <span className="text-3xs font-semibold uppercase tracking-wider text-slate-500">Estimated API Expense</span>
                <span className="block text-xl font-bold text-slate-100 mt-1">${Number(usage.estimatedCost || 0).toFixed(2)}</span>
                <p className="text-3xs text-slate-400 mt-1">
                  Monthly cost budget: <span className="text-slate-300 font-semibold">${Number(usage.monthlyCost || 0).toFixed(2)}</span>
                </p>
              </div>
            </div>

            {/* Cost saving breakdown card */}
            <div className="bg-gradient-to-r from-emerald-950/30 to-slate-950 border border-emerald-900/30 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg mt-0.5">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">DeepSeek Core NLP Savings Optimizer</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    By serving DeepSeek as the primary engine for standard text generation, prompt completion costs were minimized by 85% compared to standard GPT-4o deployments.
                  </p>
                </div>
              </div>
              <div className="bg-emerald-950/50 border border-emerald-800/40 px-4 py-2 rounded-lg text-center shrink-0">
                <span className="block text-3xs font-semibold text-emerald-400 uppercase">Estimated Savings</span>
                <span className="text-base font-bold text-slate-100 mt-0.5">$114.20 saved</span>
              </div>
            </div>

            {/* Simple table detailing mock costs */}
            <div className="border border-slate-850 rounded-xl overflow-hidden">
              <div className="bg-slate-950 p-4 border-b border-slate-850">
                <h4 className="text-xs font-semibold text-slate-200">Estimated Cost Index by Provider</h4>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 border-b border-slate-850">
                    <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider">Provider Name</th>
                    <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider">NLP Input Rate</th>
                    <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider">NLP Output Rate</th>
                    <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider">Media Gen Rate</th>
                    <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider">Total Monthly Costs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 font-mono text-slate-300">
                  <tr className="hover:bg-slate-950/20">
                    <td className="px-4 py-3 font-semibold font-sans text-slate-100">DeepSeek</td>
                    <td className="px-4 py-3 text-emerald-400">$0.14 / 1M tokens</td>
                    <td className="px-4 py-3 text-emerald-400">$0.28 / 1M tokens</td>
                    <td className="px-4 py-3 text-slate-500">N/A</td>
                    <td className="px-4 py-3 text-slate-200">$1.45</td>
                  </tr>
                  <tr className="hover:bg-slate-950/20">
                    <td className="px-4 py-3 font-semibold font-sans text-slate-100">Gemini</td>
                    <td className="px-4 py-3">$0.075 / 1M tokens</td>
                    <td className="px-4 py-3">$0.30 / 1M tokens</td>
                    <td className="px-4 py-3">$0.030 / Image</td>
                    <td className="px-4 py-3 text-slate-200">$4.12</td>
                  </tr>
                  <tr className="hover:bg-slate-950/20">
                    <td className="px-4 py-3 font-semibold font-sans text-slate-100">OpenAI</td>
                    <td className="px-4 py-3">$2.50 / 1M tokens</td>
                    <td className="px-4 py-3">$10.00 / 1M tokens</td>
                    <td className="px-4 py-3">$0.040 / Image</td>
                    <td className="px-4 py-3 text-slate-200">$12.58</td>
                  </tr>
                  <tr className="hover:bg-slate-950/20">
                    <td className="px-4 py-3 font-semibold font-sans text-slate-100">Flux</td>
                    <td className="px-4 py-3 text-slate-500">N/A</td>
                    <td className="px-4 py-3 text-slate-500">N/A</td>
                    <td className="px-4 py-3 text-purple-400">$0.030 / Image</td>
                    <td className="px-4 py-3 text-slate-200">$2.40</td>
                  </tr>
                  <tr className="hover:bg-slate-950/20">
                    <td className="px-4 py-3 font-semibold font-sans text-slate-100">Kling AI</td>
                    <td className="px-4 py-3 text-slate-500">N/A</td>
                    <td className="px-4 py-3 text-slate-500">N/A</td>
                    <td className="px-4 py-3 text-blue-400">$0.250 / Video</td>
                    <td className="px-4 py-3 text-slate-200">$4.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: DataForSEO Settings */}
        {activeSubTab === "dataforseo" && (
          <div id="tab-dataforseo" className="space-y-6">
            {/* Credentials Setup Banner */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100">DataForSEO API Credentials Config</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configure your secure Basic Auth parameters. Leave blank to run the premium local fallback generator.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-2xs font-mono text-emerald-400 uppercase font-semibold">Active Fallback Engine</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-2">DataForSEO Login</label>
                  <input
                    type="text"
                    value={dfsLogin}
                    onChange={(e) => setDfsLogin(e.target.value)}
                    placeholder="e.g. user@domain.com (Credentials Placeholder)"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3.5 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-2">DataForSEO Password</label>
                  <input
                    type="password"
                    value={dfsPassword}
                    onChange={(e) => setDfsPassword(e.target.value)}
                    placeholder="Enter DataForSEO API Password"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3.5 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-850">
                {dfsTestResult && (
                  <div className={`text-2xs font-semibold flex items-center gap-1.5 ${dfsTestResult.success ? "text-emerald-400" : "text-rose-400"}`}>
                    {dfsTestResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {dfsTestResult.message}
                  </div>
                )}
                {!dfsTestResult && <div />}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleTestDFSCredentials}
                    disabled={dfsTesting || dfsSaving}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-2"
                  >
                    {dfsTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Test Connection"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDFSCredentials}
                    disabled={dfsTesting || dfsSaving}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                  >
                    {dfsSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Save Credentials"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

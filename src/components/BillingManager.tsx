import React, { useState, useEffect } from "react";
import { 
  CreditCard, 
  RefreshCw, 
  Zap, 
  CheckCircle2, 
  ChevronRight, 
  ShieldCheck, 
  Sliders, 
  History, 
  ArrowUpRight 
} from "lucide-react";
import { BillingOverview, CreditLedgerEntry } from "../types.ts";

interface BillingManagerProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
}

export default function BillingManager({
  workspaceId,
  onAddAuditLog
}: BillingManagerProps) {
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  
  // Custom credit sets
  const [creditAmount, setCreditAmount] = useState(150);
  const [settingCredits, setSettingCredits] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const loadBillingAndLedger = async () => {
    setLoading(true);
    try {
      // Get billing overview
      const billRes = await fetch(`/api/billing/overview?workspaceId=${workspaceId}`);
      if (billRes.ok) {
        setBilling(await billRes.json());
      }

      // Get credit ledger
      const ledRes = await fetch(`/api/intelligence/ledger?workspaceId=${workspaceId}`);
      if (ledRes.ok) {
        setLedger(await ledRes.json());
      }
    } catch (err) {
      console.error("Error reading billing overview:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingAndLedger();
  }, [workspaceId]);

  const handleSetCredits = async () => {
    setSettingCredits(true);
    try {
      const response = await fetch("/api/set-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          amount: creditAmount
        })
      });
      if (response.ok) {
        onAddAuditLog("credits.adjust", `Manually adjusted workspace credit limits to ${creditAmount} AI units.`);
        alert(`Successfully synchronized! Selected workspace credits boosted to ${creditAmount}.`);
        loadBillingAndLedger();
      }
    } catch (err) {
      console.error("Failed to adjust credits:", err);
    } finally {
      setSettingCredits(false);
    }
  };

  const handleUpgradePlan = async (plan: string) => {
    setUpgrading(true);
    try {
      const response = await fetch("/api/billing/subscription/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          plan,
          billingInterval: "monthly"
        })
      });
      if (response.ok) {
        onAddAuditLog("billing.upgrade", `Upgraded subscription tier to ${plan.toUpperCase()} plan.`);
        alert(`Congratulations! Workspace has been upgraded to the ${plan.toUpperCase()} tier.`);
        loadBillingAndLedger();
      }
    } catch (err) {
      console.error("Failed to upgrade subscription:", err);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-800/60 p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            Billing & Subscriptions
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Configure Stripe subscription tiers, allocate token reservoirs, and query cryptographic billing credit logs.
          </p>
        </div>
        <button
          onClick={loadBillingAndLedger}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white rounded-lg transition-all font-medium cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Billing
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-2">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
          <span className="text-xs text-gray-500 font-mono">Unlocking secure credit accounts...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Subscription State and Slider */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Active Subscription details */}
            <div className="p-5 bg-[#0c0d12] rounded-xl border border-gray-800/60 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl pointer-events-none" />
              <div className="flex justify-between items-start border-b border-gray-800/60 pb-4">
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                    CURRENT SERVICE LEVEL
                  </span>
                  <h4 className="text-xl font-bold font-display text-white capitalize mt-0.5">
                    {billing?.subscription?.plan || "Starter"} Tier
                  </h4>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-900/60 text-[10px] font-semibold font-mono uppercase">
                  {billing?.subscription?.status || "Active"}
                </span>
              </div>

              {/* Credits Balance Breakdowns */}
              <div className="grid grid-cols-3 gap-4 pt-4 text-center font-mono text-[11px]">
                <div className="bg-[#12131a] p-3 rounded-lg border border-gray-850">
                  <span className="text-gray-500 block text-[9px] uppercase font-bold">AI Copy Credits</span>
                  <span className="text-lg font-bold text-white block mt-1">
                    {billing?.workspace?.creditPools?.ai?.balance ?? billing?.workspace?.credits ?? 0}
                  </span>
                  <span className="text-[9px] text-gray-500">Allocated: {billing?.workspace?.creditPools?.ai?.monthlyAllocation || 100}</span>
                </div>
                <div className="bg-[#12131a] p-3 rounded-lg border border-gray-850">
                  <span className="text-gray-500 block text-[9px] uppercase font-bold">Video Credits</span>
                  <span className="text-lg font-bold text-white block mt-1">
                    {billing?.workspace?.creditPools?.video?.balance ?? 15}
                  </span>
                  <span className="text-[9px] text-gray-500">Allocated: {billing?.workspace?.creditPools?.video?.monthlyAllocation || 15}</span>
                </div>
                <div className="bg-[#12131a] p-3 rounded-lg border border-gray-850">
                  <span className="text-gray-500 block text-[9px] uppercase font-bold">Post Credits</span>
                  <span className="text-lg font-bold text-white block mt-1">
                    {billing?.workspace?.creditPools?.publishing?.balance ?? 150}
                  </span>
                  <span className="text-[9px] text-gray-500">Allocated: {billing?.workspace?.creditPools?.publishing?.monthlyAllocation || 150}</span>
                </div>
              </div>
            </div>

            {/* Quick Credit Injector (Slide value) */}
            <div className="p-5 bg-[#0c0d12] rounded-xl border border-gray-800/60 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white font-display flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  Manual Credit Overdrive
                </span>
                <span className="text-[10px] font-mono bg-indigo-950/40 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-900/40">
                  Debug Tool
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Manually adjust the active workspace balance instantly. Use this to bypass subscription limit checks during test runs.
              </p>
              
              <div className="space-y-3">
                <div className="flex justify-between font-mono text-xs text-gray-400">
                  <span>Target balance level:</span>
                  <span className="text-emerald-400 font-bold">{creditAmount} units</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="500"
                  step="10"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <button
                  onClick={handleSetCredits}
                  disabled={settingCredits}
                  className="w-full py-2 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg disabled:opacity-40"
                >
                  {settingCredits ? "Updating Accounts..." : "Synchronize Credits Base"}
                </button>
              </div>
            </div>

            {/* Dynamic Upgrades Packages */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono text-gray-400 font-bold block uppercase tracking-wider">
                Enterprise Upgrades Available
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div className="p-4 bg-[#0c0d12] rounded-xl border border-gray-800/60 flex flex-col justify-between h-44 hover:border-indigo-500/50 transition-all">
                  <div>
                    <h5 className="text-sm font-bold text-white font-display">Pro Plan</h5>
                    <p className="text-[10px] text-gray-500 font-mono mt-1">
                      Ideal for growing digital design teams.
                    </p>
                    <span className="text-lg font-mono font-bold text-white mt-2 block">$79<span className="text-xs text-gray-500">/mo</span></span>
                  </div>
                  <button
                    onClick={() => handleUpgradePlan("pro")}
                    disabled={upgrading}
                    className="w-full mt-3 py-1.5 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-400 hover:text-indigo-300 border border-indigo-900/30 text-xs font-bold rounded-lg transition-all cursor-pointer"
                  >
                    Select Pro Plan
                  </button>
                </div>

                <div className="p-4 bg-[#0c0d12] rounded-xl border border-gray-800/60 flex flex-col justify-between h-44 hover:border-purple-500/50 transition-all">
                  <div>
                    <h5 className="text-sm font-bold text-white font-display">Enterprise Plan</h5>
                    <p className="text-[10px] text-gray-500 font-mono mt-1">
                      Full isolated database namespaces.
                    </p>
                    <span className="text-lg font-mono font-bold text-white mt-2 block">$299<span className="text-xs text-gray-500">/mo</span></span>
                  </div>
                  <button
                    onClick={() => handleUpgradePlan("enterprise")}
                    disabled={upgrading}
                    className="w-full mt-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 text-purple-400 hover:text-purple-300 border border-purple-900/30 text-xs font-bold rounded-lg transition-all cursor-pointer"
                  >
                    Select Enterprise Plan
                  </button>
                </div>

              </div>
            </div>

          </div>

          {/* Ledger History Side */}
          <div className="lg:col-span-5 space-y-4">
            <span className="text-[10px] font-mono text-gray-400 font-bold block uppercase tracking-wider">
              Cryptographic Credit Ledgers
            </span>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {ledger.length === 0 ? (
                <p className="text-xs text-gray-500 font-mono italic p-6 text-center border border-gray-900 bg-[#0c0d12]/30 rounded-xl">
                  No billing credit ledger entries found.
                </p>
              ) : (
                ledger.map((entry) => (
                  <div key={entry.id} className="p-3 bg-[#0c0d12] border border-gray-800/40 rounded-lg flex items-center justify-between text-[11px] font-mono hover:border-gray-800 transition-all">
                    <div className="space-y-0.5 max-w-[170px]">
                      <span className="text-gray-400 font-sans font-semibold capitalize leading-relaxed block truncate">
                        {entry.description || entry.transactionType?.replace(/_/g, " ") || "Usage Deduction"}
                      </span>
                      <span className="text-[10px] text-gray-500 block truncate">
                        Bucket: <b className="uppercase">{entry.creditBucket || "AI"}</b>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-bold block ${entry.amount && entry.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                        {entry.amount && entry.amount < 0 ? "" : "+"}{entry.amount}
                      </span>
                      <span className="text-[9px] text-gray-500 block">{entry.createdAt ? entry.createdAt.split("T")[0] : ""}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

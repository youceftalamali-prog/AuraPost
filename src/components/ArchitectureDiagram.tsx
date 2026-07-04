/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  Key, 
  ShieldCheck, 
  Database, 
  RefreshCw, 
  UserCheck, 
  FileLock2, 
  Lock,
  ArrowRight,
  Server,
  Smartphone,
  Cpu
} from "lucide-react";

interface Step {
  title: string;
  desc: string;
  icon: React.ReactNode;
  side: "client" | "server" | "db";
}

export default function ArchitectureDiagram() {
  const [activeStep, setActiveStep] = useState<number>(0);

  const steps: Step[] = [
    {
      title: "1. Credentials Input & HTTPS Transit",
      desc: "User inputs email & password. Transmission is encrypted in transit via TLS/HTTPS, preventing MITM attacks.",
      icon: <Lock className="w-5 height-5 text-emerald-400" />,
      side: "client"
    },
    {
      title: "2. Server-side Bcrypt Verification",
      desc: "The express backend receives the credentials. Retreives user from DB and compares password using secure Bcrypt hashing algorithm.",
      icon: <Server className="w-5 height-5 text-amber-400" />,
      side: "server"
    },
    {
      title: "3. Stateless JWT & Session Issuance",
      desc: "Generates an Access Token (stateless, short expiry e.g. 15m) and a secure HTTP-Only Refresh Token with automatic rotation.",
      icon: <Key className="w-5 height-5 text-indigo-400" />,
      side: "server"
    },
    {
      title: "4. Multi-Tenant Isolated DB Logging",
      desc: "Registers login activity in the audit logs. Updates last_login timestamp and binds session scope to the user's workspace.",
      icon: <Database className="w-5 height-5 text-rose-400" />,
      side: "db"
    },
    {
      title: "5. Bearer Token API Access",
      desc: "The client stores the short-lived JWT in memory and attaches it as `Authorization: Bearer <token>` to authenticate API requests.",
      icon: <ShieldCheck className="w-5 height-5 text-emerald-400" />,
      side: "client"
    }
  ];

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-800/60 p-6 backdrop-blur-md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-display font-semibold text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            Security & Authentication Flow
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Visualizing the step-by-step AuraPost AI multi-tenant authentication protocol
          </p>
        </div>
        <div className="flex gap-1.5">
          <span className="px-2.5 py-1 rounded text-[10px] font-mono bg-emerald-950/40 text-emerald-400 border border-emerald-900/30">
            SSL ACTIVE
          </span>
          <span className="px-2.5 py-1 rounded text-[10px] font-mono bg-indigo-950/40 text-indigo-400 border border-indigo-900/30">
            JWT ROTATION
          </span>
        </div>
      </div>

      {/* Main Flow Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Step Cards List */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {steps.map((step, idx) => {
            const isActive = idx === activeStep;
            return (
              <button
                key={idx}
                onClick={() => setActiveStep(idx)}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-300 flex gap-4 items-start cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-emerald-950/20 to-indigo-950/20 border-emerald-500/40 shadow-md shadow-emerald-950/10"
                    : "bg-[#161722]/60 border-gray-800/40 hover:border-gray-700/60 hover:bg-[#161722]"
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${
                  isActive ? "bg-emerald-500/10" : "bg-gray-800/40"
                }`}>
                  {step.icon}
                </div>
                <div>
                  <h4 className={`text-sm font-medium font-display ${
                    isActive ? "text-white font-semibold" : "text-gray-300"
                  }`}>
                    {step.title}
                  </h4>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                    {step.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Visualizer Stage */}
        <div className="lg:col-span-7 bg-[#161722] rounded-xl border border-gray-800/40 p-6 flex flex-col justify-between h-full min-h-[400px]">
          {/* Visual Header */}
          <div className="flex items-center justify-between border-b border-gray-800/40 pb-4 mb-4">
            <span className="text-xs font-mono text-gray-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              LIVE INTERACTIVE STAGE
            </span>
            <div className="flex items-center gap-4 text-xs font-mono text-gray-400">
              <span className={steps[activeStep].side === "client" ? "text-emerald-400" : ""}>Client</span>
              <ArrowRight className="w-3 h-3 text-gray-600" />
              <span className={steps[activeStep].side === "server" ? "text-amber-400" : ""}>Express API</span>
              <ArrowRight className="w-3 h-3 text-gray-600" />
              <span className={steps[activeStep].side === "db" ? "text-indigo-400" : ""}>SQLite DB</span>
            </div>
          </div>

          {/* Core Interactive Simulation */}
          <div className="flex-1 flex flex-col items-center justify-center py-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.04),transparent_50%)] pointer-events-none" />

            {/* Simulated Architecture Nodes */}
            <div className="flex justify-around items-center w-full z-10">
              {/* Node Client */}
              <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-500 ${
                steps[activeStep].side === "client" 
                  ? "bg-emerald-950/20 border-emerald-500/40 scale-105 shadow-lg shadow-emerald-500/5" 
                  : "bg-[#12131a] border-gray-800/40 opacity-50"
              }`}>
                <Smartphone className={`w-8 h-8 ${steps[activeStep].side === "client" ? "text-emerald-400" : "text-gray-500"}`} />
                <span className="text-xs font-semibold text-white">Client SPA</span>
                <span className="text-[10px] font-mono text-gray-500">React & Vite</span>
              </div>

              {/* Connector Lines */}
              <div className="flex-1 flex flex-col items-center justify-center px-2">
                <div className="h-[2px] w-full bg-gray-800 relative">
                  {steps[activeStep].side !== "client" && (
                    <motion.div 
                      className="absolute top-[-2px] left-0 h-1 w-4 bg-emerald-400 rounded-full"
                      animate={{ x: ["0%", "100%"] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    />
                  )}
                  {steps[activeStep].side === "client" && (
                    <motion.div 
                      className="absolute top-[-2px] right-0 h-1 w-4 bg-emerald-400 rounded-full"
                      animate={{ x: ["100%", "0%"] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    />
                  )}
                </div>
              </div>

              {/* Node Server */}
              <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-500 ${
                steps[activeStep].side === "server" 
                  ? "bg-amber-950/20 border-amber-500/40 scale-105 shadow-lg shadow-amber-500/5" 
                  : "bg-[#12131a] border-gray-800/40 opacity-50"
              }`}>
                <Cpu className={`w-8 h-8 ${steps[activeStep].side === "server" ? "text-amber-400" : "text-gray-500"}`} />
                <span className="text-xs font-semibold text-white">Node API Server</span>
                <span className="text-[10px] font-mono text-gray-500">Express & TS</span>
              </div>

              {/* Connector Lines */}
              <div className="flex-1 flex flex-col items-center justify-center px-2">
                <div className="h-[2px] w-full bg-gray-800 relative">
                  {steps[activeStep].side === "db" && (
                    <motion.div 
                      className="absolute top-[-2px] left-0 h-1 w-4 bg-indigo-400 rounded-full"
                      animate={{ x: ["0%", "100%"] }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    />
                  )}
                </div>
              </div>

              {/* Node DB */}
              <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-500 ${
                steps[activeStep].side === "db" 
                  ? "bg-indigo-950/20 border-indigo-500/40 scale-105 shadow-lg shadow-indigo-500/5" 
                  : "bg-[#12131a] border-gray-800/40 opacity-50"
              }`}>
                <Database className={`w-8 h-8 ${steps[activeStep].side === "db" ? "text-indigo-400" : "text-gray-500"}`} />
                <span className="text-xs font-semibold text-white">Relational DB</span>
                <span className="text-[10px] font-mono text-gray-500">SQLite / Postgres</span>
              </div>
            </div>

            {/* Active Details Block */}
            <div className="mt-8 w-full p-4 rounded-xl bg-[#12131a] border border-gray-800/40 text-left">
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider font-semibold block mb-1">
                Active Process
              </span>
              <h5 className="text-sm font-semibold text-white font-display">
                {steps[activeStep].title}
              </h5>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                {steps[activeStep].desc}
              </p>
            </div>
          </div>

          {/* Interactive controls */}
          <div className="border-t border-gray-800/40 pt-4 flex justify-between items-center text-xs font-mono text-gray-500">
            <span>Progress: {activeStep + 1} / {steps.length}</span>
            <div className="flex gap-2">
              <button
                disabled={activeStep === 0}
                onClick={() => setActiveStep(prev => prev - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-800 text-gray-300 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={activeStep === steps.length - 1}
                onClick={() => setActiveStep(prev => prev + 1)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer font-medium"
              >
                Next Step
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

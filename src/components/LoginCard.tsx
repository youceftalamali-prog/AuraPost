/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mail, 
  Lock, 
  User, 
  Building, 
  ArrowRight, 
  Cpu, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  CheckCircle2,
  ExternalLink,
  ChevronRight
} from "lucide-react";
import { User as UserType, Workspace } from "../types.ts";

interface LoginCardProps {
  workspaces: Workspace[];
  onLoginSuccess: (email: string, fullName: string, workspaceId: string, role: string, accessToken?: string, refreshToken?: string) => void;
  onRegisterSuccess: (email: string, fullName: string, workspaceName: string, role: string, accessToken?: string, refreshToken?: string) => void;
  onAddAuditLog: (action: string, details: string) => void;
}

export default function LoginCard({ workspaces, onLoginSuccess, onRegisterSuccess, onAddAuditLog }: LoginCardProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("admin"); // Default registration role

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Form validation
    if (!email || !email.includes("@")) {
      setError("Please specify a valid enterprise email address.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Passwords must be at least 8 characters in length.");
      return;
    }

    if (mode === "register" && !fullName) {
      setError("Please specify your full name.");
      return;
    }
    if (mode === "register" && !newWorkspaceName) {
      setError("Please specify a tenant workspace name.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Login failed");
        }
        
        const userFullName = data.user.firstName && data.user.lastName 
          ? `${data.user.firstName} ${data.user.lastName}` 
          : data.user.firstName || data.user.email;
          
        onLoginSuccess(
          data.user.email, 
          userFullName, 
          workspaceId, 
          data.user.role, 
          data.accessToken, 
          data.refreshToken
        );
        onAddAuditLog("auth.login", `Authenticated user ${data.user.email} (Role: ${data.user.role})`);
      } else {
        const nameParts = fullName.trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "User";
        
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            password,
            confirmPassword: password,
            acceptTerms: true
          })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Registration failed");
        }
        
        // Auto-login on registration success
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, password })
        });
        
        const loginData = await loginResponse.json();
        if (!loginResponse.ok) {
          throw new Error(loginData.error || "Auto-login failed after registration");
        }
        
        const userFullName = `${loginData.user.firstName} ${loginData.user.lastName}`;
        onRegisterSuccess(
          loginData.user.email, 
          userFullName, 
          newWorkspaceName, 
          role, 
          loginData.accessToken, 
          loginData.refreshToken
        );
        onAddAuditLog("auth.register", `Registered user ${loginData.user.email} and logged in successfully`);
      }
    } catch (err: any) {
      setError(err.message || "An authentication error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Simulate Shopify OAuth trigger
  const handleShopifyConnect = () => {
    setLoading(true);
    onAddAuditLog("shopify.auth_trigger", "Initiated Shopify App connection flow");
    setTimeout(() => {
      setLoading(false);
      alert("Redirecting securely to Shopify partner store for OAuth authorization...");
    }, 500);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Outer Card with subtle border glow */}
      <div className="bg-[#12131a]/95 rounded-2xl border border-gray-800/80 p-8 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 via-indigo-500 to-purple-600" />
        
        {/* Decorative ambient elements */}
        <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-emerald-500/5 blur-xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-24 h-24 rounded-full bg-indigo-500/5 blur-xl pointer-events-none" />

        {/* Logo and Headings */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/30 border border-indigo-900/30 text-indigo-400 mb-4 select-none">
            <Cpu className="w-4 h-4" />
            <span className="text-[10px] font-mono font-semibold tracking-wider uppercase">
              SaaS Multi-Tenant Gateway
            </span>
          </div>
          <h2 className="text-3xl font-display font-bold text-white tracking-tight flex items-center justify-center gap-2.5">
            <Sparkles className="w-6 h-6 text-emerald-400 shrink-0" />
            AuraPost <span className="text-emerald-400">AI</span>
          </h2>
          <p className="text-xs text-gray-400 mt-2 leading-relaxed">
            {mode === "login" && "Sign in to access your intelligence metrics & content channels"}
            {mode === "register" && "Provision a new secure tenant workspace for product ops"}
            {mode === "forgot" && "Reset your multi-tenant authentication credentials"}
          </p>
        </div>

        {/* Action Error Alerts */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/30 text-rose-400 text-xs flex gap-2.5 items-start"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode Toggle Tabs */}
        {mode !== "forgot" && (
          <div className="flex border-b border-gray-800/40 pb-1 mb-6">
            <button
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`flex-1 pb-2.5 text-xs font-semibold uppercase tracking-wider text-center cursor-pointer transition-all ${
                mode === "login" 
                  ? "border-b-2 border-emerald-400 text-white" 
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Secure Login
            </button>
            <button
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`flex-1 pb-2.5 text-xs font-semibold uppercase tracking-wider text-center cursor-pointer transition-all ${
                mode === "register" 
                  ? "border-b-2 border-emerald-400 text-white" 
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Register Workspace
            </button>
          </div>
        )}

        {/* Forgot password mode return option */}
        {mode === "forgot" && (
          <button
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold mb-6 flex items-center gap-1 cursor-pointer"
          >
            ← Back to Login Gateway
          </button>
        )}

        {/* Forms */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          {/* Full name input (Register Only) */}
          {mode === "register" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                Full Legal Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <User className="h-4 w-4 text-gray-500" />
                </span>
                <input
                  type="text"
                  placeholder="Youcef Talamali"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#161722] border border-gray-800 focus:border-emerald-500/60 focus:outline-none text-sm text-white transition-all placeholder-gray-600"
                />
              </div>
            </div>
          )}

          {/* Email input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
              Workplace Email
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Mail className="h-4 w-4 text-gray-500" />
              </span>
              <input
                type="email"
                placeholder="youcef@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#161722] border border-gray-800 focus:border-emerald-500/60 focus:outline-none text-sm text-white transition-all placeholder-gray-600"
              />
            </div>
          </div>

          {/* Password input */}
          {mode !== "forgot" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                  Password
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                    }}
                    className="text-[11px] text-gray-500 hover:text-gray-300 transition-all cursor-pointer font-sans"
                  >
                    Forgot Credentials?
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <Lock className="h-4 w-4 text-gray-500" />
                </span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#161722] border border-gray-800 focus:border-emerald-500/60 focus:outline-none text-sm text-white transition-all placeholder-gray-600"
                />
              </div>
            </div>
          )}

          {/* Existing Workspaces Dropdown (Login Only) */}
          {mode === "login" && workspaces.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                Select Tenant Workspace
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <Building className="h-4 w-4 text-gray-500" />
                </span>
                <select
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#161722] border border-gray-800 focus:border-emerald-500/60 focus:outline-none text-sm text-white transition-all appearance-none cursor-pointer"
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} (/{w.slug})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Workspace Creation (Register Only) */}
          {mode === "register" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                  New Workspace Name
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                    <Building className="h-4 w-4 text-gray-500" />
                  </span>
                  <input
                    type="text"
                    placeholder="Acme Growth Inc"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#161722] border border-gray-800 focus:border-emerald-500/60 focus:outline-none text-sm text-white transition-all placeholder-gray-600"
                  />
                </div>
              </div>

              {/* Multi-tenant Membership Role option */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                  Assigned Team Role (RBAC)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "owner", label: "Owner" },
                    { id: "admin", label: "Admin" },
                    { id: "manager", label: "Manager" }
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`py-1.5 text-xs rounded-lg border transition-all cursor-pointer ${
                        role === r.id 
                          ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/40 font-semibold" 
                          : "bg-[#161722]/60 border-gray-800 text-gray-400 hover:text-gray-300"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-medium text-sm transition-all hover:shadow-lg hover:shadow-indigo-950/20 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <span>
                  {mode === "login" && "Access Workspace Dashboard"}
                  {mode === "register" && "Deploy Workspace Tenant"}
                  {mode === "forgot" && "Send Security Reset Link"}
                </span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* SSO Sandbox connection */}
        {mode === "login" && (
          <div className="mt-6 pt-6 border-t border-gray-800/40">
            <span className="text-[10px] font-mono text-gray-500 block text-center uppercase tracking-widest mb-3">
              - OR INTEGRATE CHANNELS -
            </span>
            <button
              onClick={handleShopifyConnect}
              className="w-full py-2.5 rounded-xl bg-[#161722] border border-gray-800 hover:border-emerald-500/30 text-gray-300 hover:text-white transition-all text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Connect Shopify Store (OAuth 2.0)</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

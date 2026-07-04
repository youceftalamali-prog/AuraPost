/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Database, Search, Table, RefreshCw } from "lucide-react";
import { User, Workspace, WorkspaceMember, AuditLog } from "../types.ts";

interface DBViewerProps {
  users: User[];
  workspaces: Workspace[];
  members: WorkspaceMember[];
  logs: AuditLog[];
  onReset: () => void;
}

export default function DBViewer({ users, workspaces, members, logs, onReset }: DBViewerProps) {
  const [activeTab, setActiveTab] = useState<"users" | "workspaces" | "members" | "logs">("users");
  const [search, setSearch] = useState("");

  const filteredData = () => {
    switch (activeTab) {
      case "users":
        return users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()) || u.full_name.toLowerCase().includes(search.toLowerCase()));
      case "workspaces":
        return workspaces.filter(w => w.name.toLowerCase().includes(search.toLowerCase()) || w.slug.toLowerCase().includes(search.toLowerCase()));
      case "members":
        return members.filter(m => m.role.toLowerCase().includes(search.toLowerCase()) || m.workspace_id.includes(search) || m.user_id.includes(search));
      case "logs":
        return logs.filter(l => l.action.toLowerCase().includes(search.toLowerCase()) || l.details.toLowerCase().includes(search.toLowerCase()));
    }
  };

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-800/60 p-6 backdrop-blur-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-display font-semibold text-white tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            Relational DB Console (Live Simulation)
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Real-time interactive SQLite state mapping the exact schemas defined in AuraPost AI SQL specifications
          </p>
        </div>
        <button
          onClick={onReset}
          className="self-start md:self-auto px-3.5 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-900/60 text-gray-300 hover:text-white transition-all text-xs font-mono flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
          Seed / Reset Database
        </button>
      </div>

      {/* Tabs and search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-b border-gray-800/40 pb-4 mb-6">
        <div className="flex bg-[#161722] p-1 rounded-xl border border-gray-800/60 w-full sm:w-auto">
          {(["users", "workspaces", "members", "logs"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSearch("");
              }}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-mono capitalize transition-all cursor-pointer ${
                activeTab === tab
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-gray-400 hover:text-gray-200 hover:bg-[#12131a]/50"
              }`}
            >
              {tab === "logs" ? "audit_logs" : tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="h-4 w-4 text-gray-500" />
          </span>
          <input
            type="text"
            placeholder={`Search ${activeTab === "logs" ? "audit_logs" : activeTab}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#161722] border border-gray-800/60 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/80 transition-all font-mono"
          />
        </div>
      </div>

      {/* Table Section */}
      <div className="overflow-x-auto rounded-xl border border-gray-800/40 bg-[#161722]/40">
        <table className="w-full text-left border-collapse font-mono text-xs text-gray-300">
          <thead>
            <tr className="bg-[#161722] border-b border-gray-800/60 text-gray-400 font-semibold uppercase tracking-wider text-[10px] select-none">
              {activeTab === "users" && (
                <>
                  <th className="px-4 py-3">id (UUID)</th>
                  <th className="px-4 py-3">email</th>
                  <th className="px-4 py-3">full_name</th>
                  <th className="px-4 py-3">role</th>
                  <th className="px-4 py-3">active_workspace_id</th>
                  <th className="px-4 py-3">created_at</th>
                </>
              )}
              {activeTab === "workspaces" && (
                <>
                  <th className="px-4 py-3">id (UUID)</th>
                  <th className="px-4 py-3">name</th>
                  <th className="px-4 py-3">slug</th>
                  <th className="px-4 py-3">stripe_customer_id</th>
                  <th className="px-4 py-3">created_at</th>
                </>
              )}
              {activeTab === "members" && (
                <>
                  <th className="px-4 py-3">id</th>
                  <th className="px-4 py-3">workspace_id</th>
                  <th className="px-4 py-3">user_id</th>
                  <th className="px-4 py-3">role</th>
                  <th className="px-4 py-3">created_at</th>
                </>
              )}
              {activeTab === "logs" && (
                <>
                  <th className="px-4 py-3">id</th>
                  <th className="px-4 py-3">action</th>
                  <th className="px-4 py-3">workspace_id</th>
                  <th className="px-4 py-3">ip_address</th>
                  <th className="px-4 py-3">details</th>
                  <th className="px-4 py-3">timestamp</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/40">
            {filteredData().length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-500 font-mono">
                  No records found in active simulated table.
                </td>
              </tr>
            ) : (
              filteredData().map((row: any, index: number) => (
                <tr key={row.id || index} className="hover:bg-[#161722]/60 transition-all">
                  {activeTab === "users" && (
                    <>
                      <td className="px-4 py-3 text-indigo-400 font-semibold max-w-[100px] truncate" title={row.id}>{row.id}</td>
                      <td className="px-4 py-3 font-sans text-gray-200">{row.email}</td>
                      <td className="px-4 py-3 font-sans text-white font-medium">{row.full_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          row.role === "owner" 
                            ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/30" 
                            : row.role === "admin"
                            ? "bg-amber-950/40 text-amber-400 border-amber-900/30"
                            : "bg-gray-800 text-gray-400 border-gray-700/50"
                        }`}>
                          {row.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[100px] truncate" title={row.active_workspace_id || "null"}>
                        {row.active_workspace_id || "null"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{row.created_at.split("T")[0]}</td>
                    </>
                  )}
                  {activeTab === "workspaces" && (
                    <>
                      <td className="px-4 py-3 text-emerald-400 font-semibold max-w-[100px] truncate" title={row.id}>{row.id}</td>
                      <td className="px-4 py-3 font-sans text-white font-semibold">{row.name}</td>
                      <td className="px-4 py-3 text-gray-300 font-semibold">/{row.slug}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono">{row.stripe_customer_id || "null"}</td>
                      <td className="px-4 py-3 text-gray-500">{row.created_at.split("T")[0]}</td>
                    </>
                  )}
                  {activeTab === "members" && (
                    <>
                      <td className="px-4 py-3 text-gray-400 max-w-[100px] truncate" title={row.id}>{row.id}</td>
                      <td className="px-4 py-3 text-emerald-400 max-w-[100px] truncate" title={row.workspace_id}>{row.workspace_id}</td>
                      <td className="px-4 py-3 text-indigo-400 max-w-[100px] truncate" title={row.user_id}>{row.user_id}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-indigo-300 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-900/40 uppercase">
                          {row.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{row.created_at.split("T")[0]}</td>
                    </>
                  )}
                  {activeTab === "logs" && (
                    <>
                      <td className="px-4 py-3 text-gray-500 max-w-[80px] truncate" title={row.id}>{row.id}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold border ${
                          row.action.startsWith("auth") 
                            ? "bg-indigo-950/40 text-indigo-400 border-indigo-900/30" 
                            : "bg-emerald-950/40 text-emerald-400 border-emerald-900/30"
                        }`}>
                          {row.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-emerald-400 max-w-[80px] truncate" title={row.workspace_id || "SYSTEM"}>
                        {row.workspace_id || "SYSTEM"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 font-mono">{row.ip_address}</td>
                      <td className="px-4 py-3 text-gray-200 font-sans max-w-[200px] truncate" title={row.details}>
                        {row.details}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{row.timestamp.split("T")[1].substring(0, 8)}</td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

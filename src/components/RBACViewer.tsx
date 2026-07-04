/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ShieldCheck, UserCheck, CheckCircle2, AlertOctagon, HelpCircle } from "lucide-react";

interface PermissionRow {
  module: string;
  description: string;
  owner: boolean;
  admin: boolean;
  manager: boolean;
  editor: boolean;
  viewer: boolean;
}

export default function RBACViewer() {
  const [selectedRole, setSelectedRole] = useState<"owner" | "admin" | "manager" | "editor" | "viewer">("admin");

  const roles = [
    {
      id: "owner",
      title: "Workspace Owner",
      desc: "Full unrestricted workspace access. Owns subscriptions, billing, and has the authority to delete workspace.",
      color: "border-emerald-500 bg-emerald-950/20 text-emerald-400"
    },
    {
      id: "admin",
      title: "Workspace Administrator",
      desc: "Can manage almost all workspace assets. Operations, user management, queue control, store setups. Cannot transfer ownership.",
      color: "border-amber-500 bg-amber-950/20 text-amber-400"
    },
    {
      id: "manager",
      title: "Operational Manager",
      desc: "Handles daily product workflows, content lists, market intelligence, publishing plans, and generation operations. No billing control.",
      color: "border-indigo-500 bg-indigo-950/20 text-indigo-400"
    },
    {
      id: "editor",
      title: "Content Editor",
      desc: "Generates content, creates AI videos, normalized listings, and initiates social publisher queue runs. No system configs.",
      color: "border-pink-500 bg-pink-950/20 text-pink-400"
    },
    {
      id: "viewer",
      title: "Workspace Viewer",
      desc: "ReadOnly analytics and general metrics visibility. Perfect for stakeholders who do not operate product workflows.",
      color: "border-gray-500 bg-gray-950/20 text-gray-400"
    }
  ] as const;

  const permissions: PermissionRow[] = [
    {
      module: "Marketplace & Product Intelligence",
      description: "Import products, execute competitive normalization, view opportunity scoring lists.",
      owner: true, admin: true, manager: true, editor: true, viewer: true
    },
    {
      module: "AI Content Studio",
      description: "Generate copy, product description variants, landers, social captions.",
      owner: true, admin: true, manager: true, editor: true, viewer: false
    },
    {
      module: "AI Video & Image Studio",
      description: "Render high-conversion product promo clips, overlay luxury AI frames, generate assets.",
      owner: true, admin: true, manager: true, editor: true, viewer: false
    },
    {
      module: "Shopify Store Connections",
      description: "Initiate OAuth connection, bind API tokens, toggle automated webhooks synchronization.",
      owner: true, admin: true, manager: false, editor: false, viewer: false
    },
    {
      module: "Social Publisher Queue",
      description: "Publish scheduled threads to social profiles, clear queue, check publishing health.",
      owner: true, admin: true, manager: true, editor: true, viewer: false
    },
    {
      module: "Billing & Stripe Subscriptions",
      description: "Modify payment structures, access Stripe invoice histories, upgrade workspace quotas.",
      owner: true, admin: false, manager: false, editor: false, viewer: false
    },
    {
      module: "Workspace Member Invitations",
      description: "Invite users, set roles (RBAC), suspend or lock accounts.",
      owner: true, admin: true, manager: false, editor: false, viewer: false
    }
  ];

  const hasAccess = (row: PermissionRow, role: string) => {
    return (row as any)[role] === true;
  };

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-800/60 p-6 backdrop-blur-md">
      <div className="flex items-center gap-3 mb-4">
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
        <div>
          <h3 className="text-xl font-display font-semibold text-white tracking-tight">
            Multi-Tenant Role-Based Access Control (RBAC)
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Demonstrating isolated tenant permissions following Least-Privilege design outlined in AuraPost security manuals
          </p>
        </div>
      </div>

      {/* Roles Grid Selection */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 mt-4">
        {roles.map((r) => {
          const isSelected = selectedRole === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedRole(r.id)}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all duration-300 min-h-[110px] cursor-pointer ${
                isSelected 
                  ? `${r.color} shadow-lg shadow-indigo-950/20` 
                  : "bg-[#161722]/60 border-gray-800/40 hover:border-gray-700/60 hover:bg-[#161722]"
              }`}
            >
              <div className="flex justify-between items-center w-full">
                <span className={`text-[9px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  isSelected ? "bg-white/10" : "bg-gray-800 text-gray-400"
                }`}>
                  {r.id}
                </span>
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-current" />}
              </div>
              <span className="text-xs font-semibold text-white mt-3 block font-display leading-tight">
                {r.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Role details box */}
      <div className="p-4 rounded-xl bg-[#161722] border border-gray-800/60 mb-6">
        <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider font-semibold">
          Active Role Capabilities
        </span>
        <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">
          {roles.find(r => r.id === selectedRole)?.desc}
        </p>
      </div>

      {/* Permissions Grid Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800/40 bg-[#161722]/20">
        <table className="w-full text-left border-collapse font-sans text-xs text-gray-300">
          <thead>
            <tr className="bg-[#161722] border-b border-gray-800/60 text-gray-400 font-semibold tracking-wider text-[10px] select-none">
              <th className="px-4 py-3">Module Name</th>
              <th className="px-4 py-3 hidden md:table-cell">Operation Description</th>
              <th className="px-4 py-3 text-center font-mono">Access Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/40">
            {permissions.map((row, idx) => {
              const allowed = hasAccess(row, selectedRole);
              return (
                <tr key={idx} className="hover:bg-[#161722]/30 transition-all">
                  <td className="px-4 py-3.5 font-medium text-white font-display">
                    {row.module}
                  </td>
                  <td className="px-4 py-3.5 text-gray-400 hidden md:table-cell leading-normal">
                    {row.description}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold border ${
                      allowed 
                        ? "bg-emerald-950/20 text-emerald-400 border-emerald-900/30" 
                        : "bg-rose-950/20 text-rose-400 border-rose-900/30"
                    }`}>
                      {allowed ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>GRANT_AUTHORIZED</span>
                        </>
                      ) : (
                        <>
                          <AlertOctagon className="w-3 h-3 text-rose-400" />
                          <span>DENIED_FORBIDDEN</span>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

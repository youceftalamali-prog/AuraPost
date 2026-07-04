import React, { useState, useEffect } from "react";
import { 
  Activity, 
  RefreshCw, 
  Play, 
  Square, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Trash2, 
  Terminal, 
  ShieldAlert, 
  Cpu 
} from "lucide-react";
import { QueueJobRecord, QueueJobLog, QueueOverview } from "../types.ts";

interface QueueCenterProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
}

export default function QueueCenter({
  workspaceId,
  onAddAuditLog
}: QueueCenterProps) {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<QueueOverview | null>(null);
  const [jobs, setJobs] = useState<QueueJobRecord[]>([]);
  const [logs, setLogs] = useState<QueueJobLog[]>([]);

  const loadQueueData = async () => {
    setLoading(true);
    try {
      // Fetch overview
      const overRes = await fetch(`/api/queue/overview?workspaceId=${workspaceId}`);
      if (overRes.ok) {
        setOverview(await overRes.json());
      }

      // Fetch jobs and logs
      const jobsRes = await fetch(`/api/queue/jobs?workspaceId=${workspaceId}`);
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs(data.jobs || []);
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Error reading queue monitoring:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueueData();
  }, [workspaceId]);

  const handleRetryJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/queue/jobs/${jobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId })
      });
      if (response.ok) {
        onAddAuditLog("queue.retry", `Triggered manual retry for background task node: ${jobId}`);
        alert(`Successfully enqueued background retry for task node ${jobId}`);
        loadQueueData();
      }
    } catch (err) {
      console.error("Failed to retry job:", err);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/queue/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId })
      });
      if (response.ok) {
        onAddAuditLog("queue.cancel", `Cancelled background task node: ${jobId}`);
        alert(`Cancelled background job task node ${jobId}`);
        loadQueueData();
      }
    } catch (err) {
      console.error("Failed to cancel job:", err);
    }
  };

  const handleCleanupQueue = async () => {
    try {
      const response = await fetch("/api/queue/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId })
      });
      if (response.ok) {
        onAddAuditLog("queue.cleanup", "Cleared completed background tasks from the workspace logs.");
        alert("Success! Completed logs cleaned up.");
        loadQueueData();
      }
    } catch (err) {
      console.error("Cleanup failed:", err);
    }
  };

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-800/60 p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            Background Queue Center
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Monitor active server side micro-workers scheduling, scraping processes, generative rendering steps, and task failures.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCleanupQueue}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-rose-400 hover:text-rose-300 rounded-lg transition-all font-medium cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purge Finished Logs
          </button>
          <button
            onClick={loadQueueData}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white rounded-lg transition-all font-medium cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Queue
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-2">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
          <span className="text-xs text-gray-500 font-mono">Connecting with worker telemetry...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Active Job Queues monitor */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-4 gap-3 text-center font-mono text-[11px]">
              <div className="bg-[#0c0d12] p-2.5 rounded-lg border border-gray-850">
                <span className="text-gray-500 block text-[9px] uppercase font-bold">Active Jobs</span>
                <span className="text-base font-bold text-emerald-400 mt-0.5 block">
                  {overview?.activeJobs?.length || 0}
                </span>
              </div>
              <div className="bg-[#0c0d12] p-2.5 rounded-lg border border-gray-850">
                <span className="text-gray-500 block text-[9px] uppercase font-bold">Waiting Jobs</span>
                <span className="text-base font-bold text-indigo-400 mt-0.5 block">
                  {jobs.filter(j => j.status === "queued").length}
                </span>
              </div>
              <div className="bg-[#0c0d12] p-2.5 rounded-lg border border-gray-850">
                <span className="text-gray-500 block text-[9px] uppercase font-bold">Completed</span>
                <span className="text-base font-bold text-gray-300 mt-0.5 block">
                  {jobs.filter(j => j.status === "completed").length}
                </span>
              </div>
              <div className="bg-[#0c0d12] p-2.5 rounded-lg border border-gray-850">
                <span className="text-gray-500 block text-[9px] uppercase font-bold">Failed</span>
                <span className="text-base font-bold text-rose-400 mt-0.5 block">
                  {jobs.filter(j => j.status === "failed").length}
                </span>
              </div>
            </div>

            {/* Jobs list */}
            <div className="space-y-4">
              <span className="text-[10px] font-mono text-gray-400 font-bold block uppercase tracking-wider">
                Jobs Registry Database ({jobs.length})
              </span>

              {jobs.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500 font-mono bg-[#0c0d12]/30 rounded-xl border border-gray-900">
                  No background jobs registered in this container context.
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {jobs.map((job) => (
                    <div key={job.id} className="p-4 bg-[#0c0d12] rounded-xl border border-gray-850 space-y-3 hover:border-gray-800 transition-all font-mono text-[11px]">
                      <div className="flex justify-between items-start border-b border-gray-900 pb-2">
                        <div>
                          <span className="text-indigo-400 font-bold capitalize">{job.kind.replace(/_/g, " ")}</span>
                          <p className="text-[10px] text-gray-500">ID: {job.id}</p>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          job.status === "completed" 
                            ? "bg-emerald-950/40 text-emerald-400" 
                            : job.status === "failed" 
                              ? "bg-rose-950/40 text-rose-400" 
                              : "bg-indigo-950/40 text-indigo-400 animate-pulse"
                        }`}>
                          {job.status}
                        </span>
                      </div>

                      <div className="space-y-1 text-gray-400 text-[10px] leading-relaxed">
                        <p>Attempts: <span className="text-white">{job.attemptCount} / {job.maxAttempts}</span></p>
                        {job.lastError && (
                          <p className="text-rose-400 bg-rose-950/15 p-2 rounded border border-rose-950/45 text-[9px] font-mono leading-relaxed truncate">
                            Error: {job.lastError}
                          </p>
                        )}
                      </div>

                      {/* Job actions */}
                      {(job.status === "failed" || job.status === "processing") && (
                        <div className="flex justify-end gap-2 pt-1">
                          {job.status === "failed" && (
                            <button
                              onClick={() => handleRetryJob(job.id)}
                              className="px-2 py-1 bg-emerald-950/30 hover:bg-emerald-900/30 text-emerald-400 border border-emerald-900/40 text-[9px] font-bold rounded flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-2.5 h-2.5" />
                              Retry Task
                            </button>
                          )}
                          {job.status === "processing" && (
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              className="px-2 py-1 bg-rose-950/30 hover:bg-rose-950/40 text-rose-400 border border-rose-900/30 text-[9px] font-bold rounded flex items-center gap-1 cursor-pointer"
                            >
                              <Square className="w-2.5 h-2.5" />
                              Force Stop
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Core Worker Logs side */}
          <div className="lg:col-span-5 space-y-4">
            <span className="text-[10px] font-mono text-gray-400 font-bold block uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Live Worker Telemetry Logs
            </span>

            <div className="p-4 bg-[#07080d] border border-gray-900 rounded-xl space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {logs.length === 0 ? (
                <p className="text-[10px] text-gray-500 font-mono italic text-center py-10">
                  Waiting for task logs to stream...
                </p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="font-mono text-[9px] leading-relaxed border-b border-gray-900 pb-2 last:border-0 last:pb-0">
                    <div className="flex justify-between text-gray-550 mb-0.5">
                      <span className={`font-bold ${
                        log.status === "failed" 
                          ? "text-rose-400" 
                          : log.status === "completed" 
                            ? "text-emerald-400" 
                            : "text-indigo-400"
                      }`}>
                        [{log.status?.toUpperCase()}]
                      </span>
                      <span>{log.createdAt ? log.createdAt.split("T")[1]?.substring(0, 8) : ""}</span>
                    </div>
                    <p className="text-gray-300">{log.message}</p>
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

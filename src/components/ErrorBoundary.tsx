import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error inside React tree:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetSession = () => {
    try {
      localStorage.removeItem("aurapost_sim_session");
      window.location.reload();
    } catch (e) {
      console.error("Failed to clear session:", e);
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0b10] text-[#f1f3f9] font-sans flex flex-col items-center justify-center p-6 selection:bg-indigo-500/30 selection:text-white">
          <div className="w-full max-w-2xl bg-[#12131a] border border-red-500/30 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[4px] bg-red-500" />
            
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-red-950/40 rounded-xl border border-red-900/40 text-red-400">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <span className="text-xs font-mono text-red-400 uppercase tracking-widest block font-semibold">
                  System Runtime Interrupt
                </span>
                <h1 className="text-2xl font-display font-bold text-white tracking-tight">
                  AuraPost UI Exception Captured
                </h1>
              </div>
            </div>

            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              A critical client-side rendering error was intercepted. The security gateway remains functional, and you can recover the session or reload the gateway.
            </p>

            {/* Error Message Panel */}
            <div className="bg-[#0c0d12] border border-gray-800 rounded-xl p-5 mb-6">
              <div className="flex items-start gap-3 mb-3 text-red-400 font-mono text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-semibold text-white">
                  [{this.state.error?.name || "Error"}]: {this.state.error?.message || "Unknown error"}
                </span>
              </div>
              {this.state.error?.stack && (
                <details className="mt-3 group">
                  <summary className="text-[11px] font-mono text-gray-500 hover:text-gray-300 cursor-pointer select-none outline-none">
                    <span className="group-open:hidden">▶ Show detailed exception trace</span>
                    <span className="hidden group-open:inline">▼ Hide detailed exception trace</span>
                  </summary>
                  <pre className="mt-3 p-3 bg-[#07080b] rounded-lg text-[10px] text-gray-500 font-mono overflow-auto max-h-60 leading-normal border border-gray-900/60 whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-gray-800/60">
              <button
                onClick={this.handleResetSession}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white rounded-xl transition-all cursor-pointer font-semibold font-mono"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                Reset Session & Clean Cache
              </button>
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all hover:shadow-lg hover:shadow-red-950/20 active:scale-[0.99] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reload Portal Gateway
              </button>
            </div>
          </div>
          
          <div className="mt-6 text-center text-[10px] font-mono text-gray-600 uppercase tracking-widest">
            AuraPost Enterprise • Secure Sandbox Container Environment
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

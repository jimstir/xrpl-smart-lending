"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AMLP app error:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center px-6">
          <div className="max-w-lg w-full rounded-2xl border border-red-500/30 bg-slate-900/80 p-8 text-center shadow-2xl shadow-red-950/20">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
              <span className="text-xl font-bold">!</span>
            </div>
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="mt-3 text-sm text-slate-300">
              The app hit an unexpected runtime error and could not finish rendering.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {this.state.error?.message || "Please refresh and try again."}
            </p>
            <button
              onClick={this.reset}
              className="mt-6 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-extrabold text-black transition hover:bg-cyan-400"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

"use client";

import React from "react";
import { ShieldCheck, AlertTriangle, AlertCircle } from "lucide-react";

interface HealthFactorBadgeProps {
  healthFactor: string | number;
  showIcon?: boolean;
}

export function HealthFactorBadge({ healthFactor, showIcon = true }: HealthFactorBadgeProps) {
  const hfString = String(healthFactor);
  const hfNum = parseFloat(hfString);

  if (hfString.includes("∞") || hfString.includes("No Debt") || isNaN(hfNum) || hfNum === 0) {
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono font-medium">
        {showIcon && <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />}
        <span>∞ (No Debt)</span>
      </span>
    );
  }

  if (hfNum >= 1.25) {
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold">
        {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
        <span>Hf: {hfNum.toFixed(2)} (Healthy)</span>
      </span>
    );
  }

  if (hfNum >= 1.05) {
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold">
        {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
        <span>Hf: {hfNum.toFixed(2)} (Caution)</span>
      </span>
    );
  }

  if (hfNum >= 1.00) {
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/40 text-xs font-mono font-bold animate-pulse">
        {showIcon && <AlertCircle className="w-3.5 h-3.5 text-orange-400" />}
        <span>Hf: {hfNum.toFixed(2)} (Critical)</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/50 text-xs font-mono font-bold animate-bounce">
      {showIcon && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
      <span>Hf: {hfNum.toFixed(2)} (Liquidatable)</span>
    </span>
  );
}

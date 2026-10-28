"use client";

import React, { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon?: ReactNode;
  valueColor?: string;
  onClick?: () => void;
  clickableHint?: string;
}

export function MetricCard({
  label,
  value,
  subValue,
  icon,
  valueColor = "text-white",
  onClick,
  clickableHint,
}: MetricCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl bg-slate-950 border border-slate-800 transition group shadow-sm ${
        onClick
          ? "hover:border-cyan-400/80 cursor-pointer hover:bg-slate-900/60"
          : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold text-slate-500 block group-hover:text-cyan-400 transition">
          {label}
        </span>
        {icon}
      </div>
      <div className={`text-base md:text-lg font-mono font-bold ${valueColor} mt-1 flex items-center justify-between`}>
        <span className="truncate">{value}</span>
        {onClick && (
          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
        )}
      </div>
      {subValue && (
        <span className="text-[11px] text-slate-500 mt-1 block truncate">
          {subValue}
        </span>
      )}
      {clickableHint && (
        <span className="text-[10px] text-cyan-400/80 mt-1 flex items-center space-x-1 group-hover:text-cyan-300">
          <span>{clickableHint}</span>
        </span>
      )}
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Building2, ArrowUpRight, Copy, Check, Bot } from "lucide-react";
import { VaultData } from "../../hooks/useVaultList";
import { useModal } from "../../context/ModalContext";

interface LoanServiceCardProps {
  vault: VaultData;
  onRefresh?: () => void;
}

export function LoanServiceCard({ vault, onRefresh }: LoanServiceCardProps) {
  const { openModal } = useModal();
  const [copied, setCopied] = useState(false);

  const handleCardClick = () => {
    openModal("MANAGE_LOAN_SERVICE", { vault, onRefresh });
  };

  const copyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (vault.address) {
      navigator.clipboard.writeText(vault.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className="relative p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-400 transition-all duration-200 cursor-pointer group shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1"
    >
      {/* Header: Service Name & Symbol */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold flex-shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-white truncate group-hover:text-cyan-300 transition">
              {vault.name || "Loan Service"}
            </h3>
            <div className="flex items-center space-x-1 mt-0.5">
              <span className="text-[11px] font-mono text-slate-400">
                {vault.address ? `${vault.address.slice(0, 6)}...${vault.address.slice(-4)}` : ""}
              </span>
              <button
                onClick={copyAddress}
                className="text-slate-500 hover:text-white p-0.5"
                title="Copy Address"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono font-bold shrink-0">
          {vault.symbol || "RLUSD"}
        </span>
      </div>

      {/* Metrics Body */}
      <div className="py-3.5 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Pool Liquidity:</span>
          <span className="font-mono font-bold text-emerald-400">
            ${parseFloat(vault.initialDeposit || "0").toLocaleString()} RLUSD
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">AI Risk Agent:</span>
          <span className="inline-flex items-center space-x-1 text-purple-300 font-medium">
            <Bot className="w-3.5 h-3.5 text-purple-400" />
            <span>Active & Tracking</span>
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Network:</span>
          <span className="font-mono text-slate-300 text-[11px]">XRPL EVM Sidechain</span>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
        <span className="text-cyan-400 font-bold group-hover:text-cyan-300 flex items-center space-x-1">
          <span>Manage Service & Agent</span>
          <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </span>
        <span className="text-[10px] text-slate-500 font-mono">On-Chain</span>
      </div>
    </div>
  );
}

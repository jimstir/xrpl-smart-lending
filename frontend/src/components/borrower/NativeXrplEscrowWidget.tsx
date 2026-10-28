"use client";

import React, { useState } from "react";
import { Zap, ExternalLink, ShieldCheck, Check, Copy } from "lucide-react";
import { useWeb3 } from "../../context/Web3Context";

export function NativeXrplEscrowWidget() {
  const { xrplWallet, fundXRPLWallet, isFundingXRPL } = useWeb3();
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (xrplWallet?.address) {
      navigator.clipboard.writeText(xrplWallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-purple-950/20 border border-purple-800/40 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-900/40 pb-3">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-white uppercase tracking-wider flex items-center space-x-2">
              <span>XLS-47d Native XRPL Escrow Bridge</span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-purple-900/60 text-purple-300 font-normal">Cross-Chain Attestation</span>
            </h3>
            <p className="text-[11px] text-slate-400">Lock native XRP in on-ledger Escrow objects verified by cross-chain witness relayer</p>
          </div>
        </div>

        <div>
          {xrplWallet ? (
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-purple-800/40 text-xs font-mono">
              <span className="text-slate-400">Native:</span>
              <span className="text-purple-300 font-bold">{xrplWallet.address.slice(0, 8)}...</span>
              <button onClick={copyAddress} className="text-slate-500 hover:text-white">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ) : (
            <button
              onClick={fundXRPLWallet}
              disabled={isFundingXRPL}
              className="px-3 py-1.5 rounded-xl bg-purple-500/30 hover:bg-purple-500/40 text-purple-200 border border-purple-500/50 text-xs font-bold transition flex items-center space-x-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isFundingXRPL ? "Funding..." : "Get XRPL Testnet XRP"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Bridge Security Model</span>
          <span className="font-mono text-cyan-300 text-xs mt-0.5 block font-semibold">Non-Custodial Escrow</span>
          <span className="text-[10px] text-slate-500">XRPL XLS-47d On-Chain Proofs</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Oracle Valuation</span>
          <span className="font-mono text-emerald-400 text-xs mt-0.5 block font-semibold">Native PriceOracle Set</span>
          <span className="text-[10px] text-slate-500">Decentralized XLS-47d feeds</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Native Escrow Max LTV</span>
          <span className="font-mono text-purple-300 text-xs mt-0.5 block font-semibold">70.0% Initial LTV</span>
          <span className="text-[10px] text-slate-500">Identical to ERC-20 collateral</span>
        </div>
      </div>
    </div>
  );
}

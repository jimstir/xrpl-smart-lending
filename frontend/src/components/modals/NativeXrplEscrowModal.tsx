"use client";

import React, { useState } from "react";
import { X, Zap, ShieldCheck, Check, Copy, ExternalLink, ArrowRight } from "lucide-react";
import { useModal } from "../../context/ModalContext";
import { useWeb3 } from "../../context/Web3Context";

export function NativeXrplEscrowModal() {
  const { activeModal, closeModal, openModal } = useModal();
  const { xrplWallet, fundXRPLWallet, isFundingXRPL } = useWeb3();
  const [copied, setCopied] = useState(false);

  if (activeModal !== "NATIVE_XRPL_ESCROW") {
    return null;
  }

  const copyAddress = () => {
    if (xrplWallet?.address) {
      navigator.clipboard.writeText(xrplWallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-purple-800/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-purple-900/40 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <span>XLS-47d Native XRPL Escrow</span>
              </h2>
              <span className="text-[11px] text-purple-300/80">Cross-Chain Collateral Attestation</span>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subtitle explanation */}
        <p className="text-xs text-slate-400 leading-relaxed">
          Lock native XRP in on-ledger Escrow objects on XRP Ledger Mainchain/Testnet. Verified by a cross-chain witness relayer, this grants immediate borrowing power on the EVM Sidechain without wrapping tokens.
        </p>

        {/* XRPL Wallet Info & Faucet */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-900/40 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">XRPL Testnet Address:</span>
            {xrplWallet ? (
              <div className="flex items-center space-x-2 font-mono">
                <span className="text-purple-300 font-bold">{xrplWallet.address.slice(0, 10)}...{xrplWallet.address.slice(-6)}</span>
                <button onClick={copyAddress} className="text-slate-500 hover:text-white p-1">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <span className="text-slate-500 font-mono">No Wallet Active</span>
            )}
          </div>

          <div className="pt-2 border-t border-slate-900 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Need XRP testnet tokens for escrow?</span>
            <button
              onClick={fundXRPLWallet}
              disabled={isFundingXRPL}
              className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 text-xs font-bold transition flex items-center space-x-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>{isFundingXRPL ? "Requesting..." : "Get XRPL Testnet XRP"}</span>
            </button>
          </div>
        </div>

        {/* Security & Protocol Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Bridge Model</span>
            <span className="font-mono text-cyan-300 text-xs mt-0.5 block font-semibold">Non-Custodial</span>
            <span className="text-[10px] text-slate-500">XLS-47d Proofs</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Price Oracle</span>
            <span className="font-mono text-emerald-400 text-xs mt-0.5 block font-semibold">Native Feed</span>
            <span className="text-[10px] text-slate-500">XLS-47d Oracles</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Escrow Max LTV</span>
            <span className="font-mono text-purple-300 text-xs mt-0.5 block font-semibold">70.0% LTV</span>
            <span className="text-[10px] text-slate-500">Full Parity</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-between">
          <button
            onClick={closeModal}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
          >
            Close
          </button>
          <button
            onClick={() => {
              closeModal();
              openModal("DEPOSIT_COLLATERAL");
            }}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow flex items-center space-x-1.5"
          >
            <span>Deposit Native XRP Collateral</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

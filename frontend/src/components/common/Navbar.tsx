"use client";

import React from "react";
import { Sparkles, Wallet, Zap } from "lucide-react";
import { useWeb3 } from "../../context/Web3Context";

export function Navbar() {
  const {
    evmAccount,
    isMetaMaskConnected,
    xrplWallet,
    isFundingXRPL,
    actorRole,
    connectMetaMask,
    disconnectWallet,
    fundXRPLWallet,
    switchRole,
  } = useWeb3();

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40">
      {/* Brand & Network */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center text-black font-extrabold shadow-lg shadow-cyan-500/20">
          <Sparkles className="w-5 h-5 text-black" />
        </div>
        <div>
          <h1 className="font-extrabold text-base tracking-tight text-white flex items-center space-x-2">
            <span>AMLP Core Testing Portal</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono font-normal">
              XRPL EVM (1449000)
            </span>
          </h1>
          <p className="text-xs text-slate-400">XRPL EVM Sidechain & Native XRP Ledger</p>
        </div>
      </div>

      {/* Dual Wallet Badges & Role Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Role Switcher */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => switchRole("LENDER")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              actorRole === "LENDER"
                ? "bg-cyan-500 text-black shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Lender View
          </button>
          <button
            onClick={() => switchRole("BORROWER")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              actorRole === "BORROWER"
                ? "bg-cyan-500 text-black shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Borrower View
          </button>
        </div>

        {/* EVM Wallet Badge */}
        {evmAccount ? (
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-200">
                {isMetaMaskConnected ? "MetaMask" : "EVM"}: {evmAccount.slice(0, 6)}...{evmAccount.slice(-4)}
              </span>
            </div>
            <button
              onClick={disconnectWallet}
              title="Disconnect EVM Wallet"
              className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-800 text-xs transition font-medium"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={connectMetaMask}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition flex items-center space-x-1.5 shadow"
          >
            <Wallet className="w-4 h-4" />
            <span>Connect EVM Wallet (MetaMask)</span>
          </button>
        )}

        {/* Native XRPL Wallet Badge */}
        {xrplWallet ? (
          <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            <span className="text-slate-300">
              XRPL: {xrplWallet.address.slice(0, 6)}... ({xrplWallet.balanceXRP} XRP)
            </span>
          </div>
        ) : (
          <button
            onClick={fundXRPLWallet}
            disabled={isFundingXRPL}
            className="px-3 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-semibold flex items-center space-x-1.5 transition"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isFundingXRPL ? "Funding XRPL..." : "Fund XRPL Testnet Wallet"}</span>
          </button>
        )}
      </div>
    </header>
  );
}

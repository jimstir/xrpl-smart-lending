"use client";

import React, { useState } from "react";
import { PlusCircle, Search, Building2, RefreshCw } from "lucide-react";
import { VaultData } from "../../hooks/useVaultList";
import { LoanServiceCard } from "./LoanServiceCard";
import { useModal } from "../../context/ModalContext";
import { useWeb3 } from "../../context/Web3Context";

interface LenderViewProps {
  vaultsList: VaultData[];
  selectedVaultAddress?: string;
  onSelectVault?: (address: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function LenderView({
  vaultsList,
  onRefresh,
  isLoading,
}: LenderViewProps) {
  const { openModal } = useModal();
  const { evmAccount } = useWeb3();
  const [searchQuery, setSearchQuery] = useState("");

  // Strictly filter vaults deployed by this connected address
  const myDeployedVaults = vaultsList.filter((v) => {
    if (!evmAccount || !v?.owner) return false;
    return v.owner.toLowerCase() === evmAccount.toLowerCase();
  });

  const filteredVaults = myDeployedVaults.filter((v) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (v?.address && v.address.toLowerCase().includes(q)) ||
      (v?.name && v.name.toLowerCase().includes(q)) ||
      (v?.symbol && v.symbol.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Clean Header Bar: Title, Search & Deploy New Vault Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Loan Services</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono">
                {myDeployedVaults.length} Deployed
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search loan service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-44 sm:w-56"
            />
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition border border-slate-700"
            title="Refresh Services"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
          </button>

          {/* Deploy New Vault Button */}
          <button
            onClick={() => openModal("DEPLOY_VAULT", { onRefresh })}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center space-x-1.5 whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Deploy New Vault</span>
          </button>
        </div>
      </div>

      {/* Grid of Clickable Loan Service Cards */}
      {filteredVaults.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="font-bold text-sm text-white">No Loan Services Deployed</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You have not deployed any loan services with this address. Click below to deploy a new sovereign loan vault.
          </p>
          <button
            onClick={() => openModal("DEPLOY_VAULT", { onRefresh })}
            className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow inline-flex items-center space-x-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Deploy New Vault</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVaults.map((vault) => (
            <LoanServiceCard
              key={vault.id || vault.address}
              vault={vault}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

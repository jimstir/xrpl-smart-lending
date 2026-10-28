"use client";

import React from "react";
import { AlertCircle, Wallet } from "lucide-react";
import { Web3Provider, useWeb3 } from "../context/Web3Context";
import { ModalProvider } from "../context/ModalContext";
import { AppErrorBoundary } from "../components/common/AppErrorBoundary";
import { Navbar } from "../components/common/Navbar";
import { ModalHost } from "../components/common/ModalHost";
import { BorrowerView } from "../components/borrower/BorrowerView";
import { LenderView } from "../components/lender/LenderView";
import { useVaultList } from "../hooks/useVaultList";
import { useBorrowerPositions } from "../hooks/useBorrowerPositions";
import { useLendingVault } from "../hooks/useLendingVault";

function MainDashboardContent() {
  const {
    evmAccount,
    actorRole,
    statusMessage,
    connectMetaMask,
    getProviderAndSigner,
  } = useWeb3();

  // Vault Discovery & State
  const {
    vaultsList,
    selectedVaultAddress,
    setSelectedVaultAddress,
    selectedVault,
    refreshVaults,
  } = useVaultList(evmAccount);

  // Borrower Data Hook
  const {
    myLoans,
    borrowerHf,
    isLoading: isBorrowerLoading,
    refreshBorrowerData,
  } = useBorrowerPositions(evmAccount, selectedVaultAddress, getProviderAndSigner);

  // Lender & Vault State Hook
  const {
    vaultLoans,
    utilizationRate,
    borrowRate,
    activeProposals,
    isLoading: isVaultLoading,
    refreshVaultData,
  } = useLendingVault(selectedVaultAddress, getProviderAndSigner);

  const handleGlobalRefresh = () => {
    refreshVaults();
    refreshBorrowerData();
    refreshVaultData();
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* 1. Global Header Navigation */}
      <Navbar />

      {/* 2. Main Workspace Body */}
      <main className="max-w-6xl mx-auto w-full px-6 py-8 flex-1 space-y-6">
        {/* Floating Status / Error Alert Banner */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl text-xs flex items-center space-x-3 border animate-in fade-in duration-150 ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : statusMessage.type === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
            }`}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{statusMessage.text}</span>
          </div>
        )}

        {/* Unconnected Wallet State */}
        {!evmAccount && (
          <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
            <Wallet className="w-12 h-12 text-cyan-400 mx-auto opacity-80" />
            <h2 className="text-lg font-bold text-white">No EVM Wallet Connected</h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Please connect your XRPL EVM Sidechain wallet (MetaMask) in the header to view your associated loans and manage credit.
            </p>
            <div className="pt-2 flex justify-center">
              <button
                onClick={connectMetaMask}
                className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow"
              >
                Connect MetaMask
              </button>
            </div>
          </div>
        )}

        {/* Authenticated Workspace */}
        {evmAccount && (
          <>
            {actorRole === "BORROWER" ? (
              <BorrowerView
                myLoans={myLoans}
                borrowerHf={borrowerHf}
                onRefresh={handleGlobalRefresh}
                isLoading={isBorrowerLoading}
              />
            ) : (
              <LenderView
                vaultsList={vaultsList}
                selectedVaultAddress={selectedVaultAddress}
                onSelectVault={setSelectedVaultAddress}
                onRefresh={handleGlobalRefresh}
                isLoading={isVaultLoading}
              />
            )}
          </>
        )}
      </main>

      {/* 3. Global Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-xs text-slate-500">
        AMLP Core Portal • Autonomous Multi-Collateral Lending Protocol on XRPL EVM Sidechain
      </footer>

      {/* 4. Global Modal Portal Host */}
      <ModalHost />
    </div>
  );
}

export default function AMLPDashboard() {
  return (
    <AppErrorBoundary>
      <Web3Provider>
        <ModalProvider>
          <MainDashboardContent />
        </ModalProvider>
      </Web3Provider>
    </AppErrorBoundary>
  );
}

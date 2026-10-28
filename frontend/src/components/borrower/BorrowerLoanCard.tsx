"use client";

import React from "react";
import { CreditCard, ExternalLink, ArrowUpRight, ShieldCheck } from "lucide-react";
import { LoanRecord } from "../../hooks/useBorrowerPositions";
import { HealthFactorBadge } from "../common/HealthFactorBadge";
import { useModal } from "../../context/ModalContext";

interface BorrowerLoanCardProps {
  loan: LoanRecord;
  currentHealthFactor?: string;
}

export function BorrowerLoanCard({ loan, currentHealthFactor }: BorrowerLoanCardProps) {
  const { openModal } = useModal();

  const handleCardClick = () => {
    openModal("BORROWER_LOAN_MANAGE", { loan });
  };

  const isActive = loan.status === "ACTIVE";

  return (
    <div
      onClick={handleCardClick}
      className={`relative p-5 rounded-2xl bg-slate-900/90 border transition-all duration-200 cursor-pointer group shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1 ${
        isActive
          ? "border-slate-800 hover:border-cyan-400"
          : "border-slate-800/60 opacity-75 hover:border-slate-700"
      }`}
    >
      {/* Top Header: Loan ID & Health Factor Badge */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
            <CreditCard className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-mono font-bold text-xs text-white">
              #{loan.id.slice(0, 8)}
            </span>
            <span className="text-[10px] text-slate-500 block truncate font-mono">
              Vault: {loan.vault?.name || (loan.vaultAddress ? `${loan.vaultAddress.slice(0, 6)}...` : "Lending Vault")}
            </span>
          </div>
        </div>

        {isActive ? (
          <HealthFactorBadge healthFactor={currentHealthFactor || "1.50"} />
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold">
            {loan.status}
          </span>
        )}
      </div>

      {/* Main Body: Debt & Collateral */}
      <div className="py-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Principal Debt:</span>
          <span className="font-mono font-bold text-sm text-emerald-400">
            ${parseFloat(loan.amountRLUSD || "0").toFixed(2)} RLUSD
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Pledged Collateral:</span>
          <span className="font-mono font-bold text-xs text-slate-200">
            {loan.collateralAmount} {loan.collateralToken}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Max Borrow LTV:</span>
          <span className="font-mono text-cyan-400 font-semibold">70.0%</span>
        </div>
      </div>

      {/* Card Footer: Action Prompt & Tx Hash */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5 text-cyan-400 font-bold group-hover:text-cyan-300">
          <span>Manage Position</span>
          <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </div>

        {loan.txHash && (
          <a
            href={`https://explorer.testnet.xrplevm.org/tx/${loan.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] font-mono text-slate-500 hover:text-cyan-400 flex items-center space-x-1"
            title="View on Explorer"
          >
            <span>{loan.txHash.slice(0, 6)}...</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

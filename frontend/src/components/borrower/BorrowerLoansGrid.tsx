"use client";

import React, { useState } from "react";
import { CreditCard, PlusCircle, RefreshCw, Filter } from "lucide-react";
import { LoanRecord } from "../../hooks/useBorrowerPositions";
import { BorrowerLoanCard } from "./BorrowerLoanCard";
import { useModal } from "../../context/ModalContext";

interface BorrowerLoansGridProps {
  loans: LoanRecord[];
  currentHealthFactor: string;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function BorrowerLoansGrid({
  loans,
  currentHealthFactor,
  onRefresh,
  isLoading,
}: BorrowerLoansGridProps) {
  const { openModal } = useModal();
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "REPAID">("ALL");

  const filteredLoans = loans.filter((l) => {
    if (filter === "ACTIVE") return l.status === "ACTIVE";
    if (filter === "REPAID") return l.status === "REPAID";
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Grid Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <CreditCard className="w-5 h-5 text-cyan-400" />
          <h2 className="font-bold text-sm text-white">
            My Associated Loans
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono">
            {loans.length} Total
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Filter Pills */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilter("ALL")}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                filter === "ALL"
                  ? "bg-slate-800 text-cyan-300"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              All ({loans.length})
            </button>
            <button
              onClick={() => setFilter("ACTIVE")}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                filter === "ACTIVE"
                  ? "bg-slate-800 text-emerald-400 font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Active ({loans.filter((l) => l.status === "ACTIVE").length})
            </button>
            <button
              onClick={() => setFilter("REPAID")}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                filter === "REPAID"
                  ? "bg-slate-800 text-slate-300"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Repaid ({loans.filter((l) => l.status === "REPAID").length})
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition border border-slate-700"
            title="Refresh Loans"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
          </button>

          {/* Take New Loan Action Button */}
          <button
            onClick={() => openModal("BORROW", { onRefresh })}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center space-x-1.5 whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Take New Loan</span>
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      {filteredLoans.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
          <CreditCard className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="font-bold text-sm text-white">No Loans Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {filter === "ALL"
              ? "You do not have any debt positions yet. Click Take New Loan to draw RLUSD against your pledged collateral."
              : `No ${filter.toLowerCase()} loans found in this category.`}
          </p>
          <button
            onClick={() => openModal("BORROW")}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow inline-flex items-center space-x-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Take New Loan</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLoans.map((loan) => (
            <BorrowerLoanCard
              key={loan.id}
              loan={loan}
              currentHealthFactor={currentHealthFactor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

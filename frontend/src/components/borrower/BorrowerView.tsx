"use client";

import React from "react";
import { BorrowerLoansGrid } from "./BorrowerLoansGrid";
import { NativeXrplEscrowWidget } from "./NativeXrplEscrowWidget";
import { LoanRecord } from "../../hooks/useBorrowerPositions";

interface BorrowerViewProps {
  myLoans: LoanRecord[];
  borrowerHf: string;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function BorrowerView({
  myLoans,
  borrowerHf,
  onRefresh,
  isLoading,
}: BorrowerViewProps) {
  return (
    <div className="space-y-6">

      {/* 2. Hero Section: Responsive Grid of Clickable Associated Loan Cards */}
      <BorrowerLoansGrid
        loans={myLoans}
        currentHealthFactor={borrowerHf}
        onRefresh={onRefresh}
        isLoading={isLoading}
      />

      {/* 3. Compact Cross-Chain XLS-47d Native Escrow Drawer */}
      <NativeXrplEscrowWidget />
    </div>
  );
}

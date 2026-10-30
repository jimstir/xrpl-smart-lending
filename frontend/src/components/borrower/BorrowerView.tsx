"use client";

import React from "react";
import { BorrowerLoansGrid } from "./BorrowerLoansGrid";
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
      {/* Responsive Grid of Clickable Associated Loan Cards */}
      <BorrowerLoansGrid
        loans={myLoans}
        currentHealthFactor={borrowerHf}
        onRefresh={onRefresh}
        isLoading={isLoading}
      />
    </div>
  );
}

"use client";

import React from "react";
import { useModal } from "../../context/ModalContext";
import { BorrowerLoanManageModal } from "../modals/BorrowerLoanManageModal";
import { BorrowModal } from "../modals/BorrowModal";
import { DepositCollateralModal } from "../modals/DepositCollateralModal";
import { LenderDepositModal } from "../modals/LenderDepositModal";
import { DeployVaultModal } from "../modals/DeployVaultModal";
import { JoinVaultModal } from "../modals/JoinVaultModal";
import { ManageLoanServiceModal } from "../modals/ManageLoanServiceModal";
import { NativeXrplEscrowModal } from "../modals/NativeXrplEscrowModal";

export function ModalHost() {
  const { activeModal } = useModal();

  if (!activeModal) return null;

  return (
    <>
      <BorrowerLoanManageModal />
      <BorrowModal />
      <DepositCollateralModal />
      <LenderDepositModal />
      <DeployVaultModal />
      <JoinVaultModal />
      <ManageLoanServiceModal />
      <NativeXrplEscrowModal />
    </>
  );
}

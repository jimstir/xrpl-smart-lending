"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export type ModalType =
  | "MANAGE_LOAN_SERVICE"
  | "BORROWER_LOAN_MANAGE"
  | "BORROW"
  | "DEPOSIT_COLLATERAL"
  | "WITHDRAW_COLLATERAL"
  | "LENDER_DEPOSIT"
  | "DEPLOY_VAULT"
  | "JOIN_VAULT"
  | "FIAT_ONRAMP"
  | "NATIVE_XRPL_ESCROW"
  | null;

interface ModalContextType {
  activeModal: ModalType;
  modalPayload: any;
  openModal: (modal: ModalType, payload?: any) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalPayload, setModalPayload] = useState<any>(null);

  const openModal = (modal: ModalType, payload: any = null) => {
    setModalPayload(payload);
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalPayload(null);
  };

  return (
    <ModalContext.Provider
      value={{
        activeModal,
        modalPayload,
        openModal,
        closeModal,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  DEPLOYED_ADDRESSES,
  LENDING_VAULT_ABI,
  TOKEN_VERIFICATION_GATE_ABI,
} from "../lib/contracts";
import { LoanRecord } from "./useBorrowerPositions";

export interface ActiveProposal {
  id: string;
  title: string;
  description: string;
  actionType: "IDLE_STIMULATION" | "SCARCITY_OPTIMIZATION" | "TOKEN_ONBOARDING";
  actionLabel: string;
}

export function useLendingVault(
  selectedVaultAddress: string,
  getProviderAndSigner: () => Promise<{ provider: ethers.BrowserProvider; signer: ethers.Signer }>
) {
  const [vaultLoans, setVaultLoans] = useState<LoanRecord[]>([]);
  const [utilizationRate, setUtilizationRate] = useState<string>("0.0");
  const [borrowRate, setBorrowRate] = useState<string>("0.0");
  const [vaultOwner, setVaultOwner] = useState<string>("");
  const [isWxrpCompliant, setIsWxrpCompliant] = useState<boolean>(false);
  const [activeProposals, setActiveProposals] = useState<ActiveProposal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshVaultData = useCallback(async () => {
    if (!selectedVaultAddress || !ethers.isAddress(selectedVaultAddress)) {
      setVaultLoans([]);
      setUtilizationRate("0.0");
      setBorrowRate("0.0");
      setVaultOwner("");
      setActiveProposals([]);
      return;
    }

    try {
      setIsLoading(true);
      // 1. Fetch loans associated with this vault from database
      const resVL = await fetch(`/api/loans?vaultAddress=${selectedVaultAddress}`);
      const dataVL = await resVL.json();
      if (dataVL.success && Array.isArray(dataVL.loans)) {
        setVaultLoans(dataVL.loans);
      }

      // 2. Fetch On-Chain State for Vault
      const { provider } = await getProviderAndSigner();
      const vaultContract = new ethers.Contract(selectedVaultAddress, LENDING_VAULT_ABI, provider);

      const ownerAddr = await vaultContract.owner().catch(() => "");
      setVaultOwner(ownerAddr);

      const rawUtil = await vaultContract.getUtilizationRate().catch(() => BigInt(0));
      const utilNum = Number(rawUtil) / 100;
      setUtilizationRate(utilNum.toFixed(2));

      const rawRate = await vaultContract.getBorrowRate().catch(() => BigInt(0));
      const rateNum = Number(rawRate) / 100;
      setBorrowRate(rateNum.toFixed(2));

      // Token verification compliance
      const gateContract = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.TokenVerificationGate,
        TOKEN_VERIFICATION_GATE_ABI,
        provider
      );
      const wxrpStatus = await gateContract.isTokenCompliant(DEPLOYED_ADDRESSES.contracts.wXRP).catch(() => false);
      setIsWxrpCompliant(wxrpStatus);

      // AI proposals
      const proposals: ActiveProposal[] = [];
      if (utilNum < 20.0) {
        proposals.push({
          id: "prop-1",
          title: "Proposal 1: Idle Capital Stimulation",
          description: `Vault utilization is low at ${utilNum.toFixed(1)}%. Lower Base Rate to 1.50% to stimulate borrow demand.`,
          actionType: "IDLE_STIMULATION",
          actionLabel: "Approve & Lower Base Rate",
        });
      } else if (utilNum > 85.0) {
        proposals.push({
          id: "prop-2",
          title: "Proposal 2: Scarcity Jump Optimization",
          description: `Utilization is high at ${utilNum.toFixed(1)}%. Steepen slope2 to 45.0% to protect liquidity reserve.`,
          actionType: "SCARCITY_OPTIMIZATION",
          actionLabel: "Approve & Steepen Jump Rate",
        });
      }

      if (!wxrpStatus) {
        proposals.push({
          id: "prop-8",
          title: "Proposal 8: Token Onboarding (wXRP)",
          description: "Dual-oracle feed verified. Approve wXRP compliance in TokenVerificationGate.",
          actionType: "TOKEN_ONBOARDING",
          actionLabel: "Approve & List Asset",
        });
      }
      setActiveProposals(proposals);
    } catch (err) {
      console.warn("Failed to refresh vault data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedVaultAddress, getProviderAndSigner]);

  useEffect(() => {
    refreshVaultData();
  }, [refreshVaultData]);

  return {
    vaultLoans,
    utilizationRate,
    borrowRate,
    vaultOwner,
    isWxrpCompliant,
    activeProposals,
    isLoading,
    refreshVaultData,
  };
}

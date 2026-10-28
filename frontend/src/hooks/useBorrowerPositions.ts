"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  DEPLOYED_ADDRESSES,
  LENDING_VAULT_ABI,
  MOCK_ERC20_ABI,
  COLLATERAL_VAULT_ABI,
  RISK_ENGINE_ABI,
} from "../lib/contracts";

export interface LoanRecord {
  id: string;
  borrower: string;
  vaultAddress: string;
  amountRLUSD: string;
  collateralToken: string;
  collateralAmount: string;
  txHash: string;
  status: string;
  createdAt?: string;
  vault?: {
    name: string;
    symbol: string;
  };
}

export function useBorrowerPositions(
  evmAccount: string,
  selectedVaultAddress: string,
  getProviderAndSigner: () => Promise<{ provider: ethers.BrowserProvider; signer: ethers.Signer }>
) {
  const [myLoans, setMyLoans] = useState<LoanRecord[]>([]);
  const [borrowerDebt, setBorrowerDebt] = useState<string>("0.0");
  const [borrowerHf, setBorrowerHf] = useState<string>("0.0");
  const [borrowerRlusdBalance, setBorrowerRlusdBalance] = useState<string>("0.0");
  const [borrowerCollateralBalance, setBorrowerCollateralBalance] = useState<string>("0.0");
  const [totalCollateralUSD, setTotalCollateralUSD] = useState<string>("0.0");
  const [availableBorrowCapacityUSD, setAvailableBorrowCapacityUSD] = useState<string>("0.0");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshBorrowerData = useCallback(async () => {
    if (!evmAccount) {
      setMyLoans([]);
      setBorrowerDebt("0.0");
      setBorrowerHf("0.0");
      setBorrowerRlusdBalance("0.0");
      setBorrowerCollateralBalance("0.0");
      setTotalCollateralUSD("0.0");
      setAvailableBorrowCapacityUSD("0.0");
      return;
    }

    try {
      setIsLoading(true);
      // 1. Fetch DB Loans for this borrower
      const resL = await fetch(`/api/loans?borrower=${evmAccount}`);
      const dataL = await resL.json();
      if (dataL.success && Array.isArray(dataL.loans)) {
        setMyLoans(dataL.loans);
      }

      // 2. Fetch On-Chain State
      const { provider } = await getProviderAndSigner();

      // Check debt on active vault
      if (selectedVaultAddress && ethers.isAddress(selectedVaultAddress)) {
        const vaultContract = new ethers.Contract(selectedVaultAddress, LENDING_VAULT_ABI, provider);
        const [, rawDebt] = await vaultContract.getBorrowerDebt(evmAccount).catch(() => [BigInt(0), BigInt(0)]);
        setBorrowerDebt(ethers.formatEther(rawDebt));

        // Check Health Factor from Risk Engine
        const riskContract = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RiskEngine, RISK_ENGINE_ABI, provider);
        const rawHf = await riskContract.calculateHealthFactor(evmAccount).catch(() => BigInt(0));
        if (rawDebt === BigInt(0)) {
          setBorrowerHf("∞ (No Debt)");
        } else {
          setBorrowerHf(Number(ethers.formatEther(rawHf)).toFixed(2));
        }

        // Account values (Collateral USD and Borrow Capacity)
        try {
          const [cUSD, bCap] = await riskContract.calculateAccountValues(evmAccount);
          setTotalCollateralUSD(Number(ethers.formatEther(cUSD)).toFixed(2));
          setAvailableBorrowCapacityUSD(Number(ethers.formatEther(bCap)).toFixed(2));
        } catch {
          // If calculateAccountValues not implemented on contract, estimate from collateral
          setTotalCollateralUSD("0.0");
          setAvailableBorrowCapacityUSD("0.0");
        }
      }

      // Wallet RLUSD balance
      const rlusdContract = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RLUSD, MOCK_ERC20_ABI, provider);
      const bal = await rlusdContract.balanceOf(evmAccount).catch(() => BigInt(0));
      setBorrowerRlusdBalance(ethers.formatEther(bal));

      // Collateral balance (wETH default)
      const collateralContract = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.CollateralVault, COLLATERAL_VAULT_ABI, provider);
      const cBal = await collateralContract.getUserCollateral(evmAccount, DEPLOYED_ADDRESSES.contracts.wETH).catch(() => BigInt(0));
      setBorrowerCollateralBalance(ethers.formatEther(cBal));
    } catch (err) {
      console.warn("Failed to refresh borrower positions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [evmAccount, selectedVaultAddress, getProviderAndSigner]);

  useEffect(() => {
    refreshBorrowerData();
  }, [refreshBorrowerData]);

  return {
    myLoans,
    borrowerDebt,
    borrowerHf,
    borrowerRlusdBalance,
    borrowerCollateralBalance,
    totalCollateralUSD,
    availableBorrowCapacityUSD,
    isLoading,
    refreshBorrowerData,
  };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { DEPLOYED_ADDRESSES } from "../lib/contracts";

export interface VaultData {
  id?: string;
  name: string;
  symbol: string;
  address: string;
  reserveVault?: string;
  riskEngine?: string;
  liquidationManager?: string;
  owner: string;
  asset: string;
  assetSymbol?: string;
  initialDeposit?: string;
  network?: string;
}

export function useVaultList(evmAccount?: string) {
  const [vaultsList, setVaultsList] = useState<VaultData[]>([]);
  const [selectedVaultAddress, setSelectedVaultAddress] = useState<string>("");
  const [joinedVaultAddresses, setJoinedVaultAddresses] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const refreshVaults = useCallback(async () => {
    try {
      const resV = await fetch("/api/vaults");
      const dataV = await resV.json();
      let combined: VaultData[] = dataV.success && Array.isArray(dataV.vaults) ? [...dataV.vaults] : [];

      try {
        const localCustom = localStorage.getItem("amlp_custom_vaults");
        if (localCustom) {
          const parsed = JSON.parse(localCustom);
          if (Array.isArray(parsed)) {
            for (const cv of parsed) {
              if (cv?.address && !combined.some((v) => v?.address && v.address.toLowerCase() === cv.address.toLowerCase())) {
                combined.unshift(cv);
              }
            }
          }
        }
      } catch (e) {}

      setVaultsList(combined);
      setSelectedVaultAddress((prev) => {
        if (prev && combined.some((v) => v?.address && v.address.toLowerCase() === prev.toLowerCase())) {
          return prev;
        }
        return combined[0]?.address || "";
      });
    } catch (err) {
      console.warn("Failed to fetch vaults:", err);
    }
  }, [evmAccount]);

  useEffect(() => {
    refreshVaults();
    try {
      const storedJoined = localStorage.getItem("amlp_joined_vaults");
      if (storedJoined) {
        setJoinedVaultAddresses(JSON.parse(storedJoined));
      }
    } catch (e) {}
  }, [refreshVaults]);

  const addJoinedVault = (address: string) => {
    const updated = Array.from(new Set([...joinedVaultAddresses, address]));
    setJoinedVaultAddresses(updated);
    try {
      localStorage.setItem("amlp_joined_vaults", JSON.stringify(updated));
    } catch (e) {}
  };

  const selectedVault =
    (selectedVaultAddress && vaultsList.find((v) => v?.address && v.address.toLowerCase() === selectedVaultAddress.toLowerCase())) ||
    vaultsList[0] ||
    null;

  return {
    vaultsList,
    selectedVaultAddress,
    setSelectedVaultAddress,
    selectedVault,
    joinedVaultAddresses,
    addJoinedVault,
    searchQuery,
    setSearchQuery,
    refreshVaults,
  };
}

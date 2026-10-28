"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  TrendingUp,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Building2,
  Lock,
  ArrowRight,
} from "lucide-react";
import { ethers } from "ethers";
import { useModal } from "../../context/ModalContext";
import { useWeb3 } from "../../context/Web3Context";
import {
  DEPLOYED_ADDRESSES,
  LENDING_VAULT_ABI,
  MOCK_ERC20_ABI,
  COLLATERAL_VAULT_ABI,
  PRICE_ORACLE_ADAPTER_ABI,
} from "../../lib/contracts";

interface VaultVerification {
  verified: boolean;
  name: string;
  symbol: string;
  totalAssets: string;
  availableFunds: number;
  assetAddress: string;
  error?: string;
}

export function BorrowModal() {
  const { activeModal, closeModal, modalPayload } = useModal();
  const { getProviderAndSigner, showMessage, evmAccount } = useWeb3();

  // Step 1: Vault Address & Verification State
  const [vaultAddress, setVaultAddress] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verification, setVerification] = useState<VaultVerification | null>(null);
  const [knownVaults, setKnownVaults] = useState<any[]>([]);

  // Step 2: Borrow & Collateral Deposit Options
  const [borrowAmount, setBorrowAmount] = useState<string>("");
  const [collateralType, setCollateralType] = useState<"wETH" | "wXRP">("wETH");
  const [collateralAmount, setCollateralAmount] = useState<string>("");
  const [depositMode, setDepositMode] = useState<"FRESH" | "EXISTING">("FRESH");
  const [collateralPriceUSD, setCollateralPriceUSD] = useState<number>(3000); // Default wETH

  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load known platform vaults for quick selection
  useEffect(() => {
    if (activeModal === "BORROW") {
      fetch("/api/vaults")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.vaults)) {
            setKnownVaults(data.vaults);
          }
        })
        .catch(() => {});

      if (modalPayload?.vaultAddress) {
        setVaultAddress(modalPayload.vaultAddress);
      }
    } else {
      // Reset state on close
      setVaultAddress("");
      setVerification(null);
      setBorrowAmount("");
      setCollateralAmount("");
      setIsVerifying(false);
      setIsLoading(false);
    }
  }, [activeModal, modalPayload]);

  // On-chain verification function
  const handleVerifyVault = useCallback(
    async (addressToVerify: string) => {
      const cleanAddr = addressToVerify.trim();
      if (!cleanAddr || !ethers.isAddress(cleanAddr)) {
        setVerification({
          verified: false,
          name: "",
          symbol: "",
          totalAssets: "0",
          availableFunds: 0,
          assetAddress: "",
          error: cleanAddr ? "Invalid Ethereum address format." : undefined,
        });
        return;
      }

      setIsVerifying(true);
      try {
        const { provider } = await getProviderAndSigner();

        // 1. Verify that address is a deployed smart contract
        const code = await provider.getCode(cleanAddr);
        if (!code || code === "0x" || code === "0x0") {
          setVerification({
            verified: false,
            name: "",
            symbol: "",
            totalAssets: "0",
            availableFunds: 0,
            assetAddress: "",
            error: "No smart contract found deployed at this address on XRPL EVM Sidechain.",
          });
          setIsVerifying(false);
          return;
        }

        // 2. Query Lending Vault ERC-4626 Interface
        const vaultContract = new ethers.Contract(cleanAddr, LENDING_VAULT_ABI, provider);

        let rawAssets: bigint;
        let vName = "Loan Vault";
        let vSymbol = "amRLUSD";
        let assetAddr = DEPLOYED_ADDRESSES.contracts.RLUSD;

        try {
          rawAssets = await vaultContract.totalAssets();
        } catch {
          setVerification({
            verified: false,
            name: "",
            symbol: "",
            totalAssets: "0",
            availableFunds: 0,
            assetAddress: "",
            error: "Address is not a compliant LendingVault contract (ERC-4626 totalAssets failed).",
          });
          setIsVerifying(false);
          return;
        }

        try {
          vName = await vaultContract.name();
          vSymbol = await vaultContract.symbol();
          assetAddr = await vaultContract.asset();
        } catch {}

        const formattedAssets = ethers.formatEther(rawAssets);
        const fundsNum = parseFloat(formattedAssets);

        if (fundsNum <= 0) {
          setVerification({
            verified: false,
            name: vName,
            symbol: vSymbol,
            totalAssets: "0.0",
            availableFunds: 0,
            assetAddress: assetAddr,
            error: `Vault "${vName}" currently has $0.00 RLUSD available liquidity. Cannot take loan requests until lenders supply funds.`,
          });
        } else {
          setVerification({
            verified: true,
            name: vName,
            symbol: vSymbol,
            totalAssets: formattedAssets,
            availableFunds: fundsNum,
            assetAddress: assetAddr,
          });
        }
      } catch (err: any) {
        setVerification({
          verified: false,
          name: "",
          symbol: "",
          totalAssets: "0",
          availableFunds: 0,
          assetAddress: "",
          error: `Verification error: ${err.message}`,
        });
      } finally {
        setIsVerifying(false);
      }
    },
    [getProviderAndSigner]
  );

  // Auto-verify on valid address change
  useEffect(() => {
    if (vaultAddress && ethers.isAddress(vaultAddress.trim())) {
      handleVerifyVault(vaultAddress);
    } else {
      setVerification(null);
    }
  }, [vaultAddress, handleVerifyVault]);

  // Update collateral price when collateral asset changes
  useEffect(() => {
    const fetchCollateralPrice = async () => {
      try {
        const { provider } = await getProviderAndSigner();
        const oracle = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.PriceOracleAdapter,
          PRICE_ORACLE_ADAPTER_ABI,
          provider
        );
        const tokenAddr =
          collateralType === "wETH"
            ? DEPLOYED_ADDRESSES.contracts.wETH
            : DEPLOYED_ADDRESSES.contracts.wXRP;
        const [rawPrice] = await oracle.getAssetPrice(tokenAddr);
        const price = Number(rawPrice) / 1e8; // 8 decimals standard Chainlink
        if (price > 0) setCollateralPriceUSD(price);
      } catch {
        // Fallback default mock oracle rates
        setCollateralPriceUSD(collateralType === "wETH" ? 3000 : 0.5);
      }
    };

    if (verification?.verified) {
      fetchCollateralPrice();
    }
  }, [collateralType, verification?.verified, getProviderAndSigner]);

  // Calculate required collateral based on 70% max LTV
  const requiredCollateralTokens = React.useMemo(() => {
    const borrowNum = parseFloat(borrowAmount);
    if (!borrowNum || borrowNum <= 0 || !collateralPriceUSD) return "0.00";
    // At 70% LTV: collateralUSD = borrowAmount / 0.70
    const requiredUSD = borrowNum / 0.7;
    const tokens = requiredUSD / collateralPriceUSD;
    return tokens.toFixed(4);
  }, [borrowAmount, collateralPriceUSD]);

  if (activeModal !== "BORROW") {
    return null;
  }

  const handleExecuteBorrow = async () => {
    if (!evmAccount) {
      showMessage("Please connect your EVM wallet first.", "error");
      return;
    }

    if (!verification?.verified) {
      showMessage("Please verify a valid loan vault with available funds first.", "error");
      return;
    }

    const borrowNum = parseFloat(borrowAmount);
    if (!borrowNum || borrowNum <= 0) {
      showMessage("Please enter a valid borrow amount.", "error");
      return;
    }

    if (borrowNum > verification.availableFunds) {
      showMessage(`Amount exceeds vault available liquidity ($${verification.totalAssets} RLUSD).`, "error");
      return;
    }

    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const userAddr = await signer.getAddress();

      // Step 2.1: Deposit fresh collateral if selected
      if (depositMode === "FRESH") {
        const cAmount = collateralAmount || requiredCollateralTokens;
        if (!cAmount || parseFloat(cAmount) <= 0) {
          showMessage("Please specify the collateral deposit amount.", "error");
          setIsLoading(false);
          return;
        }

        const tokenAddr =
          collateralType === "wETH"
            ? DEPLOYED_ADDRESSES.contracts.wETH
            : DEPLOYED_ADDRESSES.contracts.wXRP;

        showMessage(`Step 1/2: Approving & pledging ${cAmount} ${collateralType} collateral...`, "info");
        const token = new ethers.Contract(tokenAddr, MOCK_ERC20_ABI, signer);
        const cVault = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.CollateralVault,
          COLLATERAL_VAULT_ABI,
          signer
        );

        const cWei = ethers.parseEther(cAmount);
        try {
          // Mint testnet tokens if needed
          await (await token.mint(userAddr, cWei)).wait();
        } catch {}

        await (await token.approve(DEPLOYED_ADDRESSES.contracts.CollateralVault, cWei)).wait();
        const cTx = await cVault.depositCollateral(tokenAddr, cWei);
        await cTx.wait();
      }

      // Step 2.2: Execute vault.borrow
      showMessage(`Step 2/2: Drawing ${borrowAmount} RLUSD loan from vault...`, "info");
      const vault = new ethers.Contract(vaultAddress.trim(), LENDING_VAULT_ABI, signer);
      const bWei = ethers.parseEther(borrowAmount);
      const bTx = await vault.borrow(bWei);
      const receipt = await bTx.wait();

      // Step 2.3: Register loan record in database
      try {
        await fetch("/api/loans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            borrower: userAddr,
            vaultAddress: vaultAddress.trim(),
            amountRLUSD: borrowAmount,
            collateralToken: collateralType,
            collateralAmount: depositMode === "FRESH" ? (collateralAmount || requiredCollateralTokens) : "0",
            txHash: receipt.hash,
          }),
        });
      } catch (dbErr) {
        console.warn("Could not register loan record in DB:", dbErr);
      }

      showMessage(`Successfully originated ${borrowAmount} RLUSD loan! Funds delivered to your wallet.`, "success");
      closeModal();
      if (modalPayload?.onRefresh) modalPayload.onRefresh();
    } catch (err: any) {
      showMessage(`Borrow Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Take New Loan</h3>
              <p className="text-[11px] text-slate-400">
                Verify loan vault availability and draw RLUSD against your pledged collateral
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* STEP 1: Deployed Loan Vault Contract Address */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                <Building2 className="w-4 h-4 text-cyan-400" />
                <span>1. Deployed Loan Vault Contract Address</span>
              </label>
              {isVerifying && (
                <span className="text-[11px] text-cyan-400 flex items-center space-x-1 font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Verifying on-chain...</span>
                </span>
              )}
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={vaultAddress}
                onChange={(e) => setVaultAddress(e.target.value)}
                placeholder="0x... (Enter deployed LendingVault address)"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />

              {/* Quick Select from Known Vaults */}
              {knownVaults.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Available Vaults:</span>
                  {knownVaults.map((kv) => (
                    <button
                      key={kv.address}
                      type="button"
                      onClick={() => setVaultAddress(kv.address)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg font-mono transition border ${
                        vaultAddress.toLowerCase() === kv.address.toLowerCase()
                          ? "bg-cyan-950 text-cyan-300 border-cyan-800 font-bold"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
                      }`}
                    >
                      {kv.name || "Vault"} ({kv.address.slice(0, 6)}...{kv.address.slice(-4)})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Verification Status Feedback */}
            {verification && (
              <div className="pt-1">
                {verification.verified ? (
                  <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/50 flex items-start space-x-2.5 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-bold text-emerald-300 flex items-center space-x-1.5">
                        <span>Vault Verified On-Chain:</span>
                        <span className="font-mono text-white">{verification.name} ({verification.symbol})</span>
                      </div>
                      <div className="text-emerald-400/90 font-mono text-[11px]">
                        Available Liquidity to Borrow: <strong className="text-white">${parseFloat(verification.totalAssets).toLocaleString()} RLUSD</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-red-950/30 border border-red-800/50 flex items-start space-x-2.5 text-xs text-red-300">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Verification Unsuccessful</span>
                      <span className="text-[11px] text-red-400">{verification.error || "Please enter a valid deployed loan vault address."}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STEP 2: UNLOCKED OPTIONS (Amount & Collateral Deposit) */}
          {verification?.verified ? (
            <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Option A: Borrow Amount */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>2. Borrow Amount (RLUSD)</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    Max Available: <span className="text-emerald-400 font-bold">${parseFloat(verification.totalAssets).toLocaleString()}</span>
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={borrowAmount}
                    onChange={(e) => setBorrowAmount(e.target.value)}
                    placeholder="Enter RLUSD amount..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => setBorrowAmount(verification.totalAssets)}
                    className="px-3 py-2.5 bg-slate-800 text-cyan-300 hover:text-white text-xs font-mono font-bold rounded-xl border border-slate-700 transition"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Option B: Collateral Deposit Options */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <span>3. Collateral Deposit Options</span>
                  </label>
                  <span className="text-[11px] text-purple-400 font-medium">70% Max Borrow LTV</span>
                </div>

                {/* Deposit Mode Selector */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDepositMode("FRESH")}
                    className={`py-2 px-3 rounded-xl border text-center transition font-semibold ${
                      depositMode === "FRESH"
                        ? "bg-cyan-500/10 border-cyan-400 text-cyan-300 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Deposit Fresh Collateral
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositMode("EXISTING")}
                    className={`py-2 px-3 rounded-xl border text-center transition font-semibold ${
                      depositMode === "EXISTING"
                        ? "bg-cyan-500/10 border-cyan-400 text-cyan-300 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Use Existing Pledged Collateral
                  </button>
                </div>

                {depositMode === "FRESH" && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Select Collateral Asset</label>
                        <select
                          value={collateralType}
                          onChange={(e: any) => setCollateralType(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-cyan-400"
                        >
                          <option value="wETH">wETH (Ethereum Token)</option>
                          <option value="wXRP">wXRP (XRPL EVM Token)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          Deposit Amount ({collateralType})
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={collateralAmount}
                            onChange={(e) => setCollateralAmount(e.target.value)}
                            placeholder={requiredCollateralTokens !== "0.00" ? requiredCollateralTokens : "0.0"}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                          />
                          {requiredCollateralTokens !== "0.00" && (
                            <button
                              type="button"
                              onClick={() => setCollateralAmount(requiredCollateralTokens)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-cyan-400 hover:underline font-mono"
                            >
                              Auto (70% LTV)
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* LTV & Oracle Guidance */}
                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[11px] flex items-center justify-between font-mono">
                      <span className="text-slate-400">
                        Oracle Value ({collateralType}): ~${collateralPriceUSD.toLocaleString()} USD
                      </span>
                      {borrowAmount && parseFloat(borrowAmount) > 0 && (
                        <span className="text-cyan-300 font-semibold">
                          Req. Min: {requiredCollateralTokens} {collateralType}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  onClick={handleExecuteBorrow}
                  disabled={isLoading || !borrowAmount || parseFloat(borrowAmount) <= 0}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold text-xs transition shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Originating RLUSD Loan on XRPL EVM Sidechain...</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4" />
                      <span>Confirm & Draw RLUSD Loan</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-slate-500 space-y-2">
              <Lock className="w-8 h-8 mx-auto opacity-50 text-slate-600" />
              <p className="text-xs font-medium text-slate-400">
                Loan Amount and Deposit Options are locked
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Please enter and verify a deployed loan vault address with available liquidity above to proceed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

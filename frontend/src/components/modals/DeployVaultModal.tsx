"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Zap,
  RefreshCw,
  Check,
  AlertCircle,
  ExternalLink,
  Copy,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  DollarSign,
  Building2,
} from "lucide-react";
import { ethers } from "ethers";
import { useModal } from "../../context/ModalContext";
import { useWeb3 } from "../../context/Web3Context";
import {
  DEPLOYED_ADDRESSES,
  LENDING_VAULT_ABI,
  MOCK_ERC20_ABI,
  LENDING_VAULT_DEPLOYER_ABI,
  LENDING_VAULT_DEPLOYER_BYTECODE,
} from "../../lib/contracts";

interface DeploySuccessData {
  name: string;
  symbol: string;
  address: string;
  txHash?: string;
  depositedAmount: string;
  requestedDeposit: string;
  depositStatus: "FUNDED" | "UNFUNDED" | "FAILED";
  depositNotice?: string;
}

export function DeployVaultModal() {
  const { activeModal, closeModal, modalPayload } = useModal();
  const { getProviderAndSigner, showMessage, evmAccount, refreshBalances } = useWeb3();

  const [vaultName, setVaultName] = useState<string>("AI-Managed RLUSD Vault");
  const [vaultSymbol, setVaultSymbol] = useState<string>("amRLUSD");
  const [assetAddress, setAssetAddress] = useState<string>(DEPLOYED_ADDRESSES.contracts.RLUSD);
  const [initialDeposit, setInitialDeposit] = useState<string>("0");
  const [rateMode, setRateMode] = useState<"FIXED" | "KINKED">("FIXED");
  const [fixedRate, setFixedRate] = useState<string>("5.0");
  const [baseRate, setBaseRate] = useState<string>("2.0");
  const [optimalUtil, setOptimalUtil] = useState<string>("80.0");
  const [slope1, setSlope1] = useState<string>("4.0");
  const [slope2, setSlope2] = useState<string>("30.0");

  const [walletRlusdBal, setWalletRlusdBal] = useState<number>(0);
  const [isCheckingBalance, setIsCheckingBalance] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionStep, setExecutionStep] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<DeploySuccessData | null>(null);
  const [copiedKey, setCopiedKey] = useState<string>("");

  // Query live wallet balance when modal is active
  const checkWalletBalance = useCallback(async () => {
    if (!evmAccount) return;
    setIsCheckingBalance(true);
    try {
      const { provider } = await getProviderAndSigner();
      const rlusd = new ethers.Contract(assetAddress, MOCK_ERC20_ABI, provider);
      const bal = await rlusd.balanceOf(evmAccount).catch(() => BigInt(0));
      const balNum = parseFloat(ethers.formatEther(bal));
      setWalletRlusdBal(balNum);
    } catch {
      setWalletRlusdBal(0);
    } finally {
      setIsCheckingBalance(false);
    }
  }, [evmAccount, assetAddress, getProviderAndSigner]);

  useEffect(() => {
    if (activeModal === "DEPLOY_VAULT") {
      checkWalletBalance();
      setExecutionError(null);
      setExecutionStep(null);
      setSuccessData(null);
    }
  }, [activeModal, checkWalletBalance]);

  if (activeModal !== "DEPLOY_VAULT") {
    return null;
  }

  const depositNum = parseFloat(initialDeposit || "0");
  const isInsufficientBalance = depositNum > 0 && depositNum > walletRlusdBal;

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  const handleDeploy = async () => {
    setExecutionError(null);

    if (!evmAccount) {
      setExecutionError("Please connect your EVM wallet first.");
      return;
    }
    if (!ethers.isAddress(assetAddress)) {
      setExecutionError("Invalid Lending Asset address format.");
      return;
    }

    if (isInsufficientBalance) {
      setExecutionError(
        `Insufficient RLUSD balance: Your wallet holds ${walletRlusdBal.toLocaleString(undefined, {
          minimumFractionDigits: 2,
        })} RLUSD, which is less than the requested deposit of ${depositNum} RLUSD. Reduce the deposit amount or deploy with $0.00.`
      );
      return;
    }

    setIsLoading(true);
    setExecutionStep("Step 1/3: Deploying Protocol Suite deployer factory...");

    try {
      const { signer } = await getProviderAndSigner();
      const userAddress = await signer.getAddress();

      const deployerFactory = new ethers.ContractFactory(
        LENDING_VAULT_DEPLOYER_ABI,
        LENDING_VAULT_DEPLOYER_BYTECODE,
        signer
      );

      setExecutionStep("Step 1/3: Deploying factory contract on XRPL EVM Sidechain...");
      const deployer = await deployerFactory.deploy();
      await deployer.waitForDeployment();

      const isFixed = rateMode === "FIXED";
      const fixedBps = Math.round(parseFloat(fixedRate || "5.0") * 100);
      const baseBps = Math.round(parseFloat(baseRate || "2.0") * 100);
      const optBps = Math.round(parseFloat(optimalUtil || "80.0") * 100);
      const s1Bps = Math.round(parseFloat(slope1 || "4.0") * 100);
      const s2Bps = Math.round(parseFloat(slope2 || "30.0") * 100);

      setExecutionStep("Step 2/3: Deploying Protocol Suite (ReserveVault, RiskEngine, LiquidationManager, LendingVault)...");
      const tx = await (deployer as any).deployVaultSystem(
        assetAddress,
        DEPLOYED_ADDRESSES.contracts.CollateralVault,
        DEPLOYED_ADDRESSES.contracts.PriceOracleAdapter,
        DEPLOYED_ADDRESSES.contracts.wXRP,
        DEPLOYED_ADDRESSES.contracts.wETH,
        isFixed ? 0 : 1,
        fixedBps,
        baseBps,
        optBps,
        s1Bps,
        s2Bps
      );

      setExecutionStep("Step 2/3: Confirming contract deployment and wiring permissions...");
      const receipt = await tx.wait();

      let newVaultAddress = "";
      let newReserveVaultAddress = "";
      let newRiskEngineAddress = "";
      let newLiquidationManagerAddress = "";

      for (const log of receipt.logs) {
        try {
          const parsed = (deployer as any).interface.parseLog(log);
          if (parsed && parsed.name === "VaultSystemDeployed") {
            newVaultAddress = parsed.args.lendingVault;
            newReserveVaultAddress = parsed.args.reserveVault;
            newRiskEngineAddress = parsed.args.riskEngine;
            newLiquidationManagerAddress = parsed.args.liquidationManager;
            break;
          }
        } catch {}
      }

      if (!newVaultAddress) {
        throw new Error("Could not find deployed vault address in events.");
      }

      // Step 3: Seed initial deposit if requested and available
      let actualDeposited = "0";
      let depositStatus: "FUNDED" | "UNFUNDED" | "FAILED" = "UNFUNDED";
      let depositNotice: string | undefined = undefined;

      if (depositNum > 0) {
        setExecutionStep(`Step 3/3: Checking RLUSD balance and confirming deposit of ${initialDeposit} RLUSD...`);
        try {
          const rlusd = new ethers.Contract(assetAddress, MOCK_ERC20_ABI, signer);
          const depositWei = ethers.parseEther(initialDeposit);
          const currentBal = await rlusd.balanceOf(userAddress).catch(() => BigInt(0));

          if (currentBal < depositWei) {
            depositStatus = "UNFUNDED";
            actualDeposited = "0";
            depositNotice = `Initial deposit skipped: Your wallet only held ${parseFloat(ethers.formatEther(currentBal)).toFixed(2)} RLUSD at transaction time. The vault was deployed with $0.00 liquidity.`;
          } else {
            setExecutionStep(`Step 3/3: Confirming ${initialDeposit} RLUSD approval in MetaMask...`);
            const approveTx = await rlusd.approve(newVaultAddress, depositWei);
            await approveTx.wait();

            setExecutionStep(`Step 3/3: Supplying ${initialDeposit} RLUSD initial liquidity into LendingVault...`);
            const vaultContract = new ethers.Contract(newVaultAddress, LENDING_VAULT_ABI, signer);
            const depTx = await vaultContract.deposit(depositWei, userAddress);
            await depTx.wait();

            actualDeposited = initialDeposit;
            depositStatus = "FUNDED";
          }
        } catch (depositErr: any) {
          if (depositErr?.code === "ACTION_REJECTED" || depositErr?.message?.includes("user rejected")) {
            depositStatus = "FAILED";
            depositNotice = "Initial deposit approval was rejected in MetaMask. The vault was deployed with $0.00 liquidity.";
          } else {
            depositStatus = "FAILED";
            depositNotice = `Initial deposit failed on-chain: ${depositErr.reason || depositErr.message || "Execution reverted"}. The vault was deployed with $0.00 liquidity.`;
          }
        }
      } else {
        actualDeposited = "0";
        depositStatus = "UNFUNDED";
        depositNotice = "Vault deployed with $0.00 initial liquidity. You or other lenders can supply capital anytime via the dashboard.";
      }

      // Build deployed vault record with ACCURATE on-chain deposit
      const newVaultObj = {
        name: vaultName || "AI-Managed RLUSD Vault",
        symbol: vaultSymbol || "amRLUSD",
        address: newVaultAddress,
        reserveVault: newReserveVaultAddress,
        riskEngine: newRiskEngineAddress,
        liquidationManager: newLiquidationManagerAddress,
        owner: userAddress,
        asset: assetAddress,
        assetSymbol: "RLUSD",
        initialDeposit: actualDeposited,
        network: "XRPL EVM Sidechain Testnet",
      };

      // Always save to localStorage immediately so user's on-chain deployment is never lost
      try {
        const stored = localStorage.getItem("amlp_custom_vaults");
        const arr = stored ? JSON.parse(stored) : [];
        const filtered = arr.filter((v: any) => v.address.toLowerCase() !== newVaultAddress.toLowerCase());
        filtered.unshift(newVaultObj);
        localStorage.setItem("amlp_custom_vaults", JSON.stringify(filtered));
      } catch {}

      // Register in database / persistent storage
      try {
        await fetch("/api/vaults", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newVaultObj),
        });
      } catch (apiErr) {
        console.warn("Backend vault registration fallback to localStorage:", apiErr);
      }

      // Refresh balances & dashboard
      await refreshBalances();
      if (modalPayload?.onRefresh) modalPayload.onRefresh();

      setSuccessData({
        name: vaultName,
        symbol: vaultSymbol,
        address: newVaultAddress,
        txHash: receipt?.hash,
        depositedAmount: actualDeposited,
        requestedDeposit: initialDeposit,
        depositStatus,
        depositNotice,
      });

      showMessage(`Deployed ${vaultName} successfully on XRPL EVM Sidechain!`, "success");
    } catch (err: any) {
      if (err?.code === "ACTION_REJECTED" || err?.message?.includes("user rejected")) {
        setExecutionError("Deployment was cancelled in MetaMask.");
      } else {
        setExecutionError(err.message || "Failed to deploy lending vault.");
      }
      showMessage(`Deployment Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
      setExecutionStep(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Deploy Sovereign Lending Vault</h3>
              <p className="text-[11px] text-slate-400">XRPL EVM Sidechain Automated Protocol Suite</p>
            </div>
          </div>
          {!isLoading && (
            <button
              onClick={closeModal}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {successData ? (
            /* DEDICATED SUCCESS & NEXT STEPS CONFIRMATION SCREEN */
            <div className="space-y-6 py-2 animate-in fade-in zoom-in-95 duration-150">
              <div className="text-center space-y-2.5">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Lending Vault Deployed!</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
                    Your sovereign protocol suite is provisioned on the XRPL EVM Sidechain and registered to your address.
                  </p>
                </div>
              </div>

              {/* Position & Contract Summary Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                  <span className="text-slate-400 font-sans">Vault Name:</span>
                  <span className="text-white font-bold">{successData.name} ({successData.symbol})</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                  <span className="text-slate-400 font-sans">Contract Address:</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-cyan-300 font-mono text-[11px] truncate max-w-[140px] sm:max-w-none">
                      {successData.address}
                    </span>
                    <button
                      onClick={() => copyToClipboard(successData.address, "addr")}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Copy Address"
                    >
                      {copiedKey === "addr" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <a
                      href={`https://explorer.testnet.xrplevm.org/address/${successData.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400"
                      title="View on Explorer"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                  <span className="text-slate-400 font-sans">On-Chain Liquidity:</span>
                  <span className={successData.depositStatus === "FUNDED" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                    ${parseFloat(successData.depositedAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} RLUSD
                  </span>
                </div>
                <div className="flex justify-between items-center pt-0.5">
                  <span className="text-slate-400 font-sans">Status:</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    successData.depositStatus === "FUNDED"
                      ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                      : "bg-amber-950 text-amber-300 border-amber-800"
                  }`}>
                    {successData.depositStatus === "FUNDED" ? "Funded & Accepting Borrowers" : "Unfunded Vault Shell"}
                  </span>
                </div>
              </div>

              {/* Status Notice if unfunded or deposit skipped */}
              {successData.depositNotice && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-start space-x-2.5 ${
                  successData.depositStatus === "FUNDED"
                    ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                    : "bg-amber-950/20 border-amber-800/40 text-amber-300"
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">{successData.depositNotice}</p>
                </div>
              )}

              {/* Next Steps Guidance */}
              <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-800/40 space-y-3">
                <h4 className="font-bold text-cyan-300 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Next Steps for Your Loan Service</span>
                </h4>
                <ul className="space-y-2.5 text-slate-300 text-[11px] leading-relaxed">
                  <li className="flex items-start space-x-2.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                    <span><strong>Supply Capital Anytime:</strong> Click your new card on the <em>Lender Dashboard</em> and use the <em>Depositors & Capital Supply</em> section to deposit RLUSD when ready.</span>
                  </li>
                  <li className="flex items-start space-x-2.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                    <span><strong>Verify On-Chain:</strong> Inspect your deployed Protocol Suite (ReserveVault, RiskEngine, LiquidationManager) on the XRPL EVM Explorer.</span>
                  </li>
                  <li className="flex items-start space-x-2.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                    <span><strong>Monitor Autonomous AI Agent:</strong> The AI Solvency Agent is automatically active to monitor utilization rates and interest parameters.</span>
                  </li>
                </ul>
              </div>

              {/* Action CTA */}
              <button
                onClick={() => {
                  closeModal();
                  if (modalPayload?.onRefresh) modalPayload.onRefresh();
                }}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold text-xs transition shadow-lg flex items-center justify-center space-x-2"
              >
                <span>View Loan Service in Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Vault Name
                  </label>
                  <input
                    type="text"
                    value={vaultName}
                    onChange={(e) => setVaultName(e.target.value)}
                    placeholder="AI-Managed RLUSD Vault"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    LP Share Symbol
                  </label>
                  <input
                    type="text"
                    value={vaultSymbol}
                    onChange={(e) => setVaultSymbol(e.target.value)}
                    placeholder="amRLUSD"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Lending Asset (RLUSD)
                  </label>
                  <input
                    type="text"
                    value={assetAddress}
                    onChange={(e) => setAssetAddress(e.target.value.trim())}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Initial Seed Deposit (RLUSD)
                    </label>
                    <div className="flex items-center space-x-1 text-[11px] font-mono">
                      <span className="text-slate-400">Wallet:</span>
                      <span className="text-emerald-400 font-bold">
                        {isCheckingBalance ? "..." : walletRlusdBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} RLUSD
                      </span>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      value={initialDeposit}
                      onChange={(e) => setInitialDeposit(e.target.value)}
                      placeholder="0"
                      min="0"
                      className={`w-full bg-slate-950 border rounded-xl pl-4 pr-24 py-2 text-white font-mono text-xs focus:outline-none ${
                        isInsufficientBalance
                          ? "border-red-500 focus:border-red-400"
                          : "border-slate-700 focus:border-cyan-400"
                      }`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setInitialDeposit("0")}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition"
                        title="Deploy with $0 initial deposit"
                      >
                        $0
                      </button>
                      <button
                        type="button"
                        onClick={() => setInitialDeposit(walletRlusdBal.toString())}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 font-mono transition"
                        title="Use maximum available balance"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  {isInsufficientBalance && (
                    <p className="text-[11px] text-red-400 mt-1 flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>
                        Wallet only has {walletRlusdBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} RLUSD. Enter up to {walletRlusdBal} or $0.
                      </span>
                    </p>
                  )}
                  {!isInsufficientBalance && depositNum === 0 && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Optional: Deploy as an unfunded vault shell and supply liquidity later.
                    </p>
                  )}
                </div>
              </div>

              {/* Rate Mode */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white uppercase tracking-wider">
                    Interest Rate Model
                  </label>
                  <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setRateMode("FIXED")}
                      className={`px-3 py-1 rounded-md font-medium transition ${
                        rateMode === "FIXED"
                          ? "bg-cyan-500 text-black font-bold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Fixed Rate APR
                    </button>
                    <button
                      type="button"
                      onClick={() => setRateMode("KINKED")}
                      className={`px-3 py-1 rounded-md font-medium transition ${
                        rateMode === "KINKED"
                          ? "bg-cyan-500 text-black font-bold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Dynamic Kinked
                    </button>
                  </div>
                </div>

                {rateMode === "FIXED" ? (
                  <div className="pt-1 max-w-xs">
                    <label className="text-[11px] text-slate-400 block mb-1">Fixed Borrow APR (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={fixedRate}
                      onChange={(e) => setFixedRate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Base Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={baseRate}
                        onChange={(e) => setBaseRate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Optimal Util (%)</label>
                      <input
                        type="number"
                        step="1"
                        value={optimalUtil}
                        onChange={(e) => setOptimalUtil(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Slope 1 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={slope1}
                        onChange={(e) => setSlope1(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Slope 2 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={slope2}
                        onChange={(e) => setSlope2(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Inline Execution Error Banner */}
              {executionError && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-start space-x-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <span className="font-bold block">Deployment Notice</span>
                    <p className="text-[11px] text-red-200/90 leading-relaxed">{executionError}</p>
                  </div>
                </div>
              )}

              {/* Live Step Progress Indicator */}
              {isLoading && executionStep && (
                <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-cyan-300 text-xs flex items-center space-x-2 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
                  <span className="font-mono text-[11px]">{executionStep}</span>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                <button
                  onClick={handleDeploy}
                  disabled={isLoading || isInsufficientBalance}
                  className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Deploying Protocol Suite on XRPL EVM Sidechain...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Deploy Lending Vault on XRPL EVM Sidechain</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

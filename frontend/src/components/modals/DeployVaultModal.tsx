"use client";

import React, { useState } from "react";
import { X, Zap, RefreshCw, Check } from "lucide-react";
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

export function DeployVaultModal() {
  const { activeModal, closeModal, modalPayload } = useModal();
  const { getProviderAndSigner, showMessage, evmAccount } = useWeb3();

  const [vaultName, setVaultName] = useState<string>("AI-Managed RLUSD Vault");
  const [vaultSymbol, setVaultSymbol] = useState<string>("amRLUSD");
  const [assetAddress, setAssetAddress] = useState<string>(DEPLOYED_ADDRESSES.contracts.RLUSD);
  const [initialDeposit, setInitialDeposit] = useState<string>("10000");
  const [rateMode, setRateMode] = useState<"FIXED" | "KINKED">("FIXED");
  const [fixedRate, setFixedRate] = useState<string>("5.0");
  const [baseRate, setBaseRate] = useState<string>("2.0");
  const [optimalUtil, setOptimalUtil] = useState<string>("80.0");
  const [slope1, setSlope1] = useState<string>("4.0");
  const [slope2, setSlope2] = useState<string>("30.0");

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successData, setSuccessData] = useState<any | null>(null);

  if (activeModal !== "DEPLOY_VAULT") {
    return null;
  }

  const handleDeploy = async () => {
    if (!evmAccount) {
      showMessage("Please connect your EVM wallet first.", "error");
      return;
    }
    if (!ethers.isAddress(assetAddress)) {
      showMessage("Invalid Lending Asset address format.", "error");
      return;
    }

    setIsLoading(true);
    showMessage("Step 1/3: Deploying automated factory deployer on XRPL EVM Sidechain...", "info");
    try {
      const { signer } = await getProviderAndSigner();
      const userAddress = await signer.getAddress();

      const deployerFactory = new ethers.ContractFactory(
        LENDING_VAULT_DEPLOYER_ABI,
        LENDING_VAULT_DEPLOYER_BYTECODE,
        signer
      );

      showMessage("Step 2/3: Deploying Protocol Suite (ReserveVault, RiskEngine, LiquidationManager, LendingVault)...", "info");
      const deployer = await deployerFactory.deploy();
      await deployer.waitForDeployment();

      const isFixed = rateMode === "FIXED";
      const fixedBps = Math.round(parseFloat(fixedRate || "5.0") * 100);
      const baseBps = Math.round(parseFloat(baseRate || "2.0") * 100);
      const optBps = Math.round(parseFloat(optimalUtil || "80.0") * 100);
      const s1Bps = Math.round(parseFloat(slope1 || "4.0") * 100);
      const s2Bps = Math.round(parseFloat(slope2 || "30.0") * 100);

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
      showMessage("Wiring permissions and transferring contract ownership...", "info");
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

      // Step 3: Seed initial deposit if requested
      const initialDepositNum = parseFloat(initialDeposit);
      if (!isNaN(initialDepositNum) && initialDepositNum > 0) {
        showMessage(`Step 3/3: Depositing initial ${initialDeposit} RLUSD liquidity...`, "info");
        try {
          const rlusd = new ethers.Contract(assetAddress, MOCK_ERC20_ABI, signer);
          const depositWei = ethers.parseEther(initialDeposit);
          const currentBal = await rlusd.balanceOf(userAddress).catch(() => BigInt(0));

          if (currentBal < depositWei) {
            try {
              const mintTx = await rlusd.mint(userAddress, depositWei - currentBal);
              await mintTx.wait();
            } catch {}
          }

          const availableBal = await rlusd.balanceOf(userAddress).catch(() => BigInt(0));
          const toDeposit = availableBal >= depositWei ? depositWei : availableBal;

          if (toDeposit > BigInt(0)) {
            const approveTx = await rlusd.approve(newVaultAddress, toDeposit);
            await approveTx.wait();

            const vaultContract = new ethers.Contract(newVaultAddress, LENDING_VAULT_ABI, signer);
            const depTx = await vaultContract.deposit(toDeposit, userAddress);
            await depTx.wait();
          }
        } catch (depositErr: any) {
          console.warn("Initial deposit warning:", depositErr.message);
        }
      }

      // Build deployed vault record
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
        initialDeposit: initialDeposit || "0",
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

      setSuccessData({
        name: vaultName,
        symbol: vaultSymbol,
        address: newVaultAddress,
      });

      showMessage(`Deployed ${vaultName} successfully on XRPL EVM Sidechain!`, "success");
      if (modalPayload?.onRefresh) modalPayload.onRefresh();
    } catch (err: any) {
      showMessage(`Deployment Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
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
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <Check className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Deployment Successful!</h4>
                <p className="text-xs text-slate-300 mt-1 max-w-sm mx-auto">
                  {successData.name} ({successData.symbol}) has been provisioned and registered in your portfolio.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 max-w-md mx-auto truncate select-all">
                {successData.address}
              </div>
              <button
                onClick={closeModal}
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition shadow"
              >
                Done & Return to Hub
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
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Initial Seed Deposit (RLUSD)
                  </label>
                  <input
                    type="number"
                    value={initialDeposit}
                    onChange={(e) => setInitialDeposit(e.target.value)}
                    placeholder="10000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
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

              {/* Action Button */}
              <div className="pt-2">
                <button
                  onClick={handleDeploy}
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Deploying Protocol Suite to Sidechain...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Deploy Lending Vault on XRPL EVM Sidechain</span>
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

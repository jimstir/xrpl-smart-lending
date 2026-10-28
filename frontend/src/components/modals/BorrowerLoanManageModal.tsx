"use client";

import React, { useState } from "react";
import { X, DollarSign, ShieldCheck, AlertCircle, ArrowDownCircle, RefreshCw, ExternalLink } from "lucide-react";
import { ethers } from "ethers";
import { useModal } from "../../context/ModalContext";
import { useWeb3 } from "../../context/Web3Context";
import { DEPLOYED_ADDRESSES, LENDING_VAULT_ABI, MOCK_ERC20_ABI, COLLATERAL_VAULT_ABI, RISK_ENGINE_ABI } from "../../lib/contracts";

export function BorrowerLoanManageModal() {
  const { activeModal, modalPayload, closeModal } = useModal();
  const { getProviderAndSigner, showMessage } = useWeb3();

  const [activeTab, setActiveTab] = useState<"REPAY" | "COLLATERAL" | "RISK">("REPAY");
  const [repayAmount, setRepayAmount] = useState<string>("");
  const [addCollateralAmount, setAddCollateralAmount] = useState<string>("1.0");
  const [collateralToken, setCollateralToken] = useState<"wETH" | "wXRP">("wETH");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("0.5");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (activeModal !== "BORROWER_LOAN_MANAGE" || !modalPayload?.loan) {
    return null;
  }

  const loan = modalPayload.loan;
  const vaultAddr = loan.vaultAddress || DEPLOYED_ADDRESSES.contracts.LendingVault;
  const principal = parseFloat(loan.amountRLUSD || "0");

  const handleRepay = async (amountToPay: string) => {
    const num = parseFloat(amountToPay);
    if (isNaN(num) || num <= 0) {
      showMessage("Please enter a valid repay amount.", "error");
      return;
    }

    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const userAddr = await signer.getAddress();
      const rlusd = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RLUSD, MOCK_ERC20_ABI, signer);
      const vault = new ethers.Contract(vaultAddr, LENDING_VAULT_ABI, signer);

      const amountWei = ethers.parseEther(amountToPay);

      // Attempt mint if mock token
      try {
        await (await rlusd.mint(userAddr, amountWei)).wait();
      } catch (e) {
        console.log("RLUSD mint skipped:", e);
      }

      await (await rlusd.approve(vaultAddr, amountWei)).wait();
      const tx = await vault.repay(amountWei);
      await tx.wait();

      // If full debt or close to it, mark loan REPAID in DB
      if (num >= principal) {
        await fetch("/api/loans", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: loan.id, status: "REPAID" }),
        });
      }

      showMessage(`Repaid ${amountToPay} RLUSD on loan #${loan.id.slice(0, 8)}!`, "success");
      closeModal();
      if (modalPayload.onRefresh) modalPayload.onRefresh();
    } catch (err: any) {
      showMessage(`Repayment Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCollateral = async () => {
    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const userAddr = await signer.getAddress();
      const tokenAddr = collateralToken === "wETH" ? DEPLOYED_ADDRESSES.contracts.wETH : DEPLOYED_ADDRESSES.contracts.wXRP;

      const token = new ethers.Contract(tokenAddr, MOCK_ERC20_ABI, signer);
      const cVault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.CollateralVault, COLLATERAL_VAULT_ABI, signer);

      const amountWei = ethers.parseEther(addCollateralAmount);
      try {
        await (await token.mint(userAddr, amountWei)).wait();
      } catch {}

      await (await token.approve(DEPLOYED_ADDRESSES.contracts.CollateralVault, amountWei)).wait();
      const tx = await cVault.depositCollateral(tokenAddr, amountWei);
      await tx.wait();

      showMessage(`Pledged additional ${addCollateralAmount} ${collateralToken} collateral!`, "success");
      closeModal();
      if (modalPayload.onRefresh) modalPayload.onRefresh();
    } catch (err: any) {
      showMessage(`Collateral Deposit Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdrawCollateral = async () => {
    setIsLoading(true);
    try {
      const { signer, provider } = await getProviderAndSigner();
      const userAddr = await signer.getAddress();
      const tokenAddr = collateralToken === "wETH" ? DEPLOYED_ADDRESSES.contracts.wETH : DEPLOYED_ADDRESSES.contracts.wXRP;

      // Pre-flight validation on RiskEngine
      const riskContract = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RiskEngine, RISK_ENGINE_ABI, provider);
      const amountWei = ethers.parseEther(withdrawAmount);

      try {
        const [isAllowed, projectedHf] = await riskContract.validateWithdrawal(userAddr, tokenAddr, amountWei);
        const hfNum = Number(ethers.formatEther(projectedHf));
        if (!isAllowed || hfNum < 1.05) {
          showMessage(`Withdrawal Blocked: Projected Health Factor would fall to ${hfNum.toFixed(2)} (< 1.05 safety buffer). Repay debt first.`, "error");
          setIsLoading(false);
          return;
        }
      } catch (simErr) {
        console.warn("Pre-flight check skipped or uncalled:", simErr);
      }

      const cVault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.CollateralVault, COLLATERAL_VAULT_ABI, signer);
      const tx = await cVault.withdrawCollateral(tokenAddr, amountWei);
      await tx.wait();

      showMessage(`Withdrew ${withdrawAmount} ${collateralToken} collateral safely!`, "success");
      closeModal();
      if (modalPayload.onRefresh) modalPayload.onRefresh();
    } catch (err: any) {
      showMessage(`Withdrawal Failed: ${err.message}`, "error");
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
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Manage Loan #{loan.id.slice(0, 8)}</h3>
              <p className="text-[11px] text-slate-400">
                Principal: <span className="text-emerald-400 font-mono font-bold">${principal.toFixed(2)} RLUSD</span> • Collateral: <span className="text-slate-200 font-mono">{loan.collateralAmount} {loan.collateralToken}</span>
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

        {/* Modal Sub-Tabs */}
        <div className="px-6 pt-4 border-b border-slate-800 flex space-x-3 text-xs font-bold">
          <button
            onClick={() => setActiveTab("REPAY")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "REPAY"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Repay Debt
          </button>
          <button
            onClick={() => setActiveTab("COLLATERAL")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "COLLATERAL"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Adjust Collateral
          </button>
          <button
            onClick={() => setActiveTab("RISK")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "RISK"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Risk & Telemetry
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {activeTab === "REPAY" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Repay Amount (RLUSD)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    placeholder={`e.g. ${principal.toFixed(2)}`}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={() => setRepayAmount(principal.toString())}
                    className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold rounded-xl border border-slate-700"
                  >
                    Full Debt
                  </button>
                </div>
              </div>

              {/* Quick Chips */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-slate-500">Quick Pay:</span>
                <button
                  type="button"
                  onClick={() => setRepayAmount((principal * 0.25).toFixed(2))}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
                >
                  25%
                </button>
                <button
                  type="button"
                  onClick={() => setRepayAmount((principal * 0.5).toFixed(2))}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => setRepayAmount(principal.toFixed(2))}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 hover:text-emerald-300 font-bold"
                >
                  100% (Close Loan)
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Current Outstanding:</span>
                  <span className="font-mono text-white">${principal.toFixed(2)} RLUSD</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Remaining after payment:</span>
                  <span className="font-mono text-emerald-400">
                    ${Math.max(0, principal - (parseFloat(repayAmount) || 0)).toFixed(2)} RLUSD
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleRepay(repayAmount)}
                  disabled={isLoading || !repayAmount || parseFloat(repayAmount) <= 0}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition shadow flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Executing Repayment...</span>
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4" />
                      <span>Confirm Repayment</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === "COLLATERAL" && (
            <div className="space-y-5">
              {/* Add Collateral Section */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>Pledge Additional Collateral (Boost Health Factor)</span>
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Asset</label>
                    <select
                      value={collateralToken}
                      onChange={(e: any) => setCollateralToken(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                    >
                      <option value="wETH">wETH (70% LTV)</option>
                      <option value="wXRP">wXRP (70% LTV)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Amount</label>
                    <input
                      type="number"
                      value={addCollateralAmount}
                      onChange={(e) => setAddCollateralAmount(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddCollateral}
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition"
                >
                  Pledge Additional Collateral
                </button>
              </div>

              {/* Withdraw Collateral Section */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <ArrowDownCircle className="w-4 h-4 text-purple-400" />
                  <span>Withdraw Excess Collateral (Solvency Guard)</span>
                </h4>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Amount to Withdraw</label>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Risk Engine enforces that projected Health Factor remains strictly above 1.05.
                  </p>
                </div>
                <button
                  onClick={handleWithdrawCollateral}
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition"
                >
                  Withdraw Collateral
                </button>
              </div>
            </div>
          )}

          {activeTab === "RISK" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Collateral Token</span>
                  <span className="font-mono text-white text-sm font-bold">{loan.collateralToken}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Pledged Amount</span>
                  <span className="font-mono text-cyan-400 text-sm font-bold">{loan.collateralAmount}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Oracle Feeds</span>
                  <span className="font-mono text-emerald-400 text-xs font-bold">Pyth / Band / XLS-47d</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Max LTV Limit</span>
                  <span className="font-mono text-purple-400 text-xs font-bold">70.0% Initial LTV</span>
                </div>
              </div>

              {loan.txHash && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Transaction Hash:</span>
                  <a
                    href={`https://explorer.testnet.xrplevm.org/tx/${loan.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline flex items-center space-x-1"
                  >
                    <span>{loan.txHash.slice(0, 12)}...{loan.txHash.slice(-6)}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

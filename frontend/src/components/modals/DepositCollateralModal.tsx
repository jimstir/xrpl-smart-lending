"use client";

import React, { useState } from "react";
import { X, ShieldCheck, RefreshCw, Zap, Check } from "lucide-react";
import { ethers } from "ethers";
import { useModal } from "../../context/ModalContext";
import { useWeb3 } from "../../context/Web3Context";
import { DEPLOYED_ADDRESSES, MOCK_ERC20_ABI, COLLATERAL_VAULT_ABI, NATIVE_COLLATERAL_BRIDGE_ABI } from "../../lib/contracts";

export function DepositCollateralModal() {
  const { activeModal, closeModal, modalPayload } = useModal();
  const { getProviderAndSigner, showMessage, xrplWallet } = useWeb3();

  const [selectedToken, setSelectedToken] = useState<"wETH" | "wXRP" | "NATIVE_XRPL">("wETH");
  const [depositAmount, setDepositAmount] = useState<string>("2.0");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (activeModal !== "DEPOSIT_COLLATERAL") {
    return null;
  }

  const handleDeposit = async () => {
    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const userAddr = await signer.getAddress();

      if (selectedToken === "NATIVE_XRPL") {
        if (!xrplWallet) {
          showMessage("Please connect or fund an XRPL Testnet wallet first!", "error");
          setIsLoading(false);
          return;
        }

        const bridge = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.NativeCollateralBridge,
          NATIVE_COLLATERAL_BRIDGE_ABI,
          signer
        );
        const amountWei = ethers.parseEther(depositAmount);
        const dummyHash = ethers.hexlify(ethers.randomBytes(32));
        const expiry = Math.floor(Date.now() / 1000) + 3600;

        const tx = await bridge.mockAttestEscrow(
          userAddr,
          DEPLOYED_ADDRESSES.contracts.wXRP,
          amountWei,
          dummyHash,
          expiry
        );
        await tx.wait();
        showMessage(`Attested ${depositAmount} Native XRP from ${xrplWallet.address.slice(0, 8)}... into CollateralVault!`, "success");
      } else {
        const tokenAddr =
          selectedToken === "wETH"
            ? DEPLOYED_ADDRESSES.contracts.wETH
            : DEPLOYED_ADDRESSES.contracts.wXRP;

        const token = new ethers.Contract(tokenAddr, MOCK_ERC20_ABI, signer);
        const cVault = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.CollateralVault,
          COLLATERAL_VAULT_ABI,
          signer
        );

        const amountWei = ethers.parseEther(depositAmount);
        try {
          await (await token.mint(userAddr, amountWei)).wait();
        } catch {}

        await (await token.approve(DEPLOYED_ADDRESSES.contracts.CollateralVault, amountWei)).wait();
        const tx = await cVault.depositCollateral(tokenAddr, amountWei);
        await tx.wait();

        showMessage(`Pledged ${depositAmount} ${selectedToken} into CollateralVault!`, "success");
      }

      closeModal();
      if (modalPayload?.onRefresh) modalPayload.onRefresh();
    } catch (err: any) {
      showMessage(`Collateral Deposit Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Pledge Collateral Assets</h3>
              <p className="text-[11px] text-slate-400">Lock verified multi-collateral to unlock RLUSD borrow capacity</p>
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
          {/* Selectable Collateral Option Cards */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2.5">
              Select Collateral Asset Option:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Option 1: wETH */}
              <div
                onClick={() => setSelectedToken("wETH")}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedToken === "wETH"
                    ? "bg-cyan-950/40 border-cyan-400 ring-1 ring-cyan-400/50"
                    : "bg-slate-950 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">wETH (EVM)</span>
                  {selectedToken === "wETH" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Pyth / Band Feeds</p>
                <span className="text-[10px] font-mono text-cyan-300 block mt-1">70% Max LTV</span>
              </div>

              {/* Option 2: wXRP */}
              <div
                onClick={() => setSelectedToken("wXRP")}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedToken === "wXRP"
                    ? "bg-cyan-950/40 border-cyan-400 ring-1 ring-cyan-400/50"
                    : "bg-slate-950 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">wXRP (EVM)</span>
                  {selectedToken === "wXRP" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Tier-A Sovereign</p>
                <span className="text-[10px] font-mono text-cyan-300 block mt-1">70% Max LTV</span>
              </div>

              {/* Option 3: Native XRPL Escrow */}
              <div
                onClick={() => setSelectedToken("NATIVE_XRPL")}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedToken === "NATIVE_XRPL"
                    ? "bg-purple-950/40 border-purple-400 ring-1 ring-purple-400/50"
                    : "bg-slate-950 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">Native XRPL</span>
                  {selectedToken === "NATIVE_XRPL" && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">XLS-47d Escrow</p>
                <span className="text-[10px] font-mono text-purple-300 block mt-1">Cross-Chain Bridge</span>
              </div>
            </div>
          </div>

          {/* Deposit Amount Input */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Deposit Amount ({selectedToken === "NATIVE_XRPL" ? "Native XRP" : selectedToken})
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="2.0"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => setDepositAmount("5.0")}
                className="px-3 py-2.5 bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700"
              >
                Set 5.0
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Deposited collateral is credited to `CollateralVault.sol` and unlocks 70% borrowing capacity in RLUSD.
            </p>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={handleDeposit}
              disabled={isLoading || !depositAmount || parseFloat(depositAmount) <= 0}
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting Collateral On-Chain...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Pledge Collateral On-Chain</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { X, DollarSign, CreditCard, RefreshCw, Check } from "lucide-react";
import { ethers } from "ethers";
import { useModal } from "../../context/ModalContext";
import { useWeb3 } from "../../context/Web3Context";
import { DEPLOYED_ADDRESSES, LENDING_VAULT_ABI, MOCK_ERC20_ABI, FIAT_GATEWAY_ABI } from "../../lib/contracts";

export function LenderDepositModal() {
  const { activeModal, closeModal, modalPayload } = useModal();
  const { getProviderAndSigner, showMessage, refreshBalances } = useWeb3();

  const [depositMethod, setDepositMethod] = useState<"RLUSD" | "MASTERCARD">("RLUSD");
  const [depositAmount, setDepositAmount] = useState<string>("5000");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (activeModal !== "LENDER_DEPOSIT") {
    return null;
  }

  const vaultAddress = modalPayload?.vaultAddress || DEPLOYED_ADDRESSES.contracts.LendingVault;

  const handleDepositRLUSD = async () => {
    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const userAddr = await signer.getAddress();
      const rlusd = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RLUSD, MOCK_ERC20_ABI, signer);
      const vault = new ethers.Contract(vaultAddress, LENDING_VAULT_ABI, signer);

      const amountWei = ethers.parseEther(depositAmount);
      const currentBal = await rlusd.balanceOf(userAddr).catch(() => BigInt(0));
      if (currentBal < amountWei) {
        throw new Error(`Insufficient RLUSD tokens in wallet (${parseFloat(ethers.formatEther(currentBal)).toFixed(2)} available).`);
      }

      await (await rlusd.approve(vaultAddress, amountWei)).wait();
      const depTx = await vault.deposit(amountWei, userAddr);
      await depTx.wait();

      showMessage(`Deposited ${depositAmount} RLUSD into vault! Minted amRLUSD shares to your wallet.`, "success");
      await refreshBalances();
      closeModal();
      if (modalPayload?.onRefresh) modalPayload.onRefresh();
    } catch (err: any) {
      showMessage(`Deposit Failed: ${err.reason || err.message || "Transaction reverted"}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMastercardSandboxSettle = async () => {
    setIsLoading(true);
    try {
      const { signer, provider } = await getProviderAndSigner();
      const gateway = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.FiatOnRampGateway,
        FIAT_GATEWAY_ABI,
        signer
      );
      const rlusd = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RLUSD, MOCK_ERC20_ABI, signer);

      const voucherId = ethers.hexlify(ethers.randomBytes(32));
      const amountWei = ethers.parseEther(depositAmount);
      const validUntil = Math.floor(Date.now() / 1000) + 3600;

      const network = await provider.getNetwork();
      const domain = {
        name: "MastercardAP4M_OnRamp",
        version: "1.0.0",
        chainId: network.chainId,
        verifyingContract: DEPLOYED_ADDRESSES.contracts.FiatOnRampGateway,
      };

      const types = {
        SettlementVoucher: [
          { name: "voucherId", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "rlusdAmount", type: "uint256" },
          { name: "validUntil", type: "uint256" },
        ],
      };

      const value = {
        voucherId,
        recipient: await signer.getAddress(),
        rlusdAmount: amountWei,
        validUntil,
      };

      const signature = await (signer as any).signTypedData(domain, types, value);
      try {
        await (await rlusd.mint(await signer.getAddress(), amountWei)).wait();
      } catch {}
      await (await rlusd.approve(DEPLOYED_ADDRESSES.contracts.FiatOnRampGateway, amountWei)).wait();

      const tx = await gateway.executeFiatSettlement(value, signature);
      await tx.wait();

      showMessage(`Mastercard AP4M voucher settled! Minted ${depositAmount} amRLUSD shares to vault.`, "success");
      closeModal();
      if (modalPayload?.onRefresh) modalPayload.onRefresh();
    } catch (err: any) {
      showMessage(`AP4M Settle Failed: ${err.message}`, "error");
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
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Supply Capital & Earn Yield</h3>
              <p className="text-[11px] text-slate-400">Deposit stablecoin liquidity to mint amRLUSD shares</p>
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
          {/* Selectable Deposit Method Cards */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2.5">
              Select Deposit Method:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Direct RLUSD */}
              <div
                onClick={() => setDepositMethod("RLUSD")}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  depositMethod === "RLUSD"
                    ? "bg-cyan-950/40 border-cyan-400 ring-1 ring-cyan-400/50"
                    : "bg-slate-950 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-xs text-white">Direct RLUSD</span>
                  </div>
                  {depositMethod === "RLUSD" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">MetaMask EVM Wallet balance</p>
                <span className="text-[10px] font-mono text-emerald-400 block mt-1">Instant on-chain mint</span>
              </div>

              {/* Option 2: Mastercard AP4M Sandbox */}
              <div
                onClick={() => setDepositMethod("MASTERCARD")}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  depositMethod === "MASTERCARD"
                    ? "bg-purple-950/40 border-purple-400 ring-1 ring-purple-400/50"
                    : "bg-slate-950 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="w-4 h-4 text-purple-400" />
                    <span className="font-bold text-xs text-white">Mastercard AP4M</span>
                  </div>
                  {depositMethod === "MASTERCARD" && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Fiat Card / ACH USD Simulation</p>
                <span className="text-[10px] font-mono text-purple-300 block mt-1">1:1 USD-to-RLUSD Voucher</span>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Deposit Amount ({depositMethod === "RLUSD" ? "RLUSD" : "USD"})
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="5000"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => setDepositAmount("10000")}
                className="px-3 py-2.5 bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700"
              >
                10k
              </button>
            </div>
          </div>

          {/* Share Breakdown */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1 font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Estimated amRLUSD Shares:</span>
              <span className="text-cyan-300 font-bold">{depositAmount || "0"} amRLUSD</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Dynamic Supply APY:</span>
              <span className="text-emerald-400 font-bold">~4.18% variable</span>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={depositMethod === "RLUSD" ? handleDepositRLUSD : handleMastercardSandboxSettle}
              disabled={isLoading || !depositAmount || parseFloat(depositAmount) <= 0}
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Supply Deposit...</span>
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4" />
                  <span>{depositMethod === "RLUSD" ? "Supply RLUSD into Vault" : "Execute Mastercard AP4M Settlement"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

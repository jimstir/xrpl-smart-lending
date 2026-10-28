"use client";

import React, { useState } from "react";
import { X, UserPlus, RefreshCw, Copy, Check } from "lucide-react";
import { ethers } from "ethers";
import { useModal } from "../../context/ModalContext";
import { useWeb3 } from "../../context/Web3Context";
import { DEPLOYED_ADDRESSES, LENDING_VAULT_ABI } from "../../lib/contracts";

export function JoinVaultModal() {
  const { activeModal, closeModal, modalPayload } = useModal();
  const { showMessage, getProviderAndSigner } = useWeb3();

  const [inputAddress, setInputAddress] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string>("");

  if (activeModal !== "JOIN_VAULT") {
    return null;
  }

  const vaultsList = modalPayload?.vaultsList || [];
  const joinedVaultAddresses: string[] = modalPayload?.joinedVaultAddresses || [];
  const onSelectVault = modalPayload?.onSelectVault || (() => {});
  const addJoinedVault = modalPayload?.addJoinedVault || (() => {});

  const handleJoin = async (targetAddr?: string) => {
    const rawAddr = (targetAddr || inputAddress).trim();
    if (!rawAddr || !ethers.isAddress(rawAddr)) {
      showMessage("Please enter a valid Ethereum contract address (0x...)", "error");
      return;
    }

    const normalizedAddr = ethers.getAddress(rawAddr);
    setIsLoading(true);

    try {
      const existingVault = vaultsList.find(
        (v: any) => v.address.toLowerCase() === normalizedAddr.toLowerCase()
      );

      if (existingVault) {
        addJoinedVault(normalizedAddr);
        onSelectVault(normalizedAddr);
        showMessage(`Joined ${existingVault.name || normalizedAddr.slice(0, 8)} successfully!`, "success");
        closeModal();
      } else {
        const { provider } = await getProviderAndSigner();
        const vaultContract = new ethers.Contract(normalizedAddr, LENDING_VAULT_ABI, provider);

        let name = "Sovereign Lending Vault";
        let symbol = "sVAULT";
        let asset = DEPLOYED_ADDRESSES.contracts.RLUSD;
        let owner = "0x0000000000000000000000000000000000000000";

        try {
          name = await vaultContract.name();
          symbol = await vaultContract.symbol();
          asset = await vaultContract.asset();
        } catch (e) {}

        try {
          owner = await vaultContract.owner();
        } catch (e) {}

        const res = await fetch("/api/vaults", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            symbol,
            address: normalizedAddr,
            owner,
            asset,
            assetSymbol: "RLUSD",
            initialDeposit: "0",
            network: "XRPL EVM Sidechain Testnet",
          }),
        });

        const data = await res.json();
        if (data.success) {
          addJoinedVault(normalizedAddr);
          onSelectVault(normalizedAddr);
          showMessage(`Joined ${name} (${symbol}) successfully!`, "success");
          closeModal();
          if (modalPayload?.onRefresh) modalPayload.onRefresh();
        } else {
          showMessage(`Failed to register vault: ${data.error || "Unknown error"}`, "error");
        }
      }
    } catch (err: any) {
      showMessage(`Error joining vault: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Join a Lending Vault Service</h3>
              <p className="text-[11px] text-slate-400">Connect to any sovereign LendingVault contract on XRPL EVM Sidechain</p>
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
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              LendingVault Contract Address
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                placeholder="0x..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
              <button
                onClick={() => handleJoin()}
                disabled={isLoading || !inputAddress.trim()}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-extrabold text-xs transition shadow flex items-center space-x-1.5 whitespace-nowrap"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                <span>Join Service</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Paste the contract address of any deployed LendingVault. The credit hub will automatically fetch its dynamic interest rate model, pool liquidity, and risk parameters.
            </p>
          </div>

          {/* Discovered Services List */}
          <div className="pt-2 border-t border-slate-800">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
              Discovered Services on Network
            </span>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {vaultsList.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">
                  No other vaults discovered on the ledger yet.
                </p>
              ) : (
                vaultsList.map((v: any) => {
                  const isJoined = joinedVaultAddresses.some(
                    (ja: string) => ja.toLowerCase() === v.address.toLowerCase()
                  );
                  return (
                    <div
                      key={v.id || v.address}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs text-white truncate">
                            {v.name || "Lending Vault"}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono">
                            {v.symbol || "RLUSD"}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-500 truncate mt-0.5">
                          {v.address}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => copyToClipboard(v.address, `vault-modal-${v.address}`)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                          title="Copy address"
                        >
                          {copiedKey === `vault-modal-${v.address}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleJoin(v.address)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                            isJoined
                              ? "bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30"
                              : "bg-cyan-500 hover:bg-cyan-400 text-black font-bold"
                          }`}
                        >
                          {isJoined ? "Switch" : "Join"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

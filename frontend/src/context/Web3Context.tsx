"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ethers } from "ethers";
import { DEPLOYED_ADDRESSES } from "../lib/contracts";
import { createAndFundXRPLTestnetWallet, XRPLTestnetWallet } from "../lib/xrpl-wallet";

interface Web3ContextType {
  evmAccount: string;
  isMetaMaskConnected: boolean;
  xrplWallet: XRPLTestnetWallet | null;
  isFundingXRPL: boolean;
  actorRole: "LENDER" | "BORROWER";
  statusMessage: { text: string; type: "success" | "error" | "info" } | null;
  connectMetaMask: () => Promise<void>;
  disconnectWallet: () => void;
  fundXRPLWallet: () => Promise<void>;
  switchRole: (role: "LENDER" | "BORROWER") => void;
  showMessage: (text: string, type: "success" | "error" | "info") => void;
  getProviderAndSigner: () => Promise<{ provider: ethers.BrowserProvider; signer: ethers.Signer }>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [evmAccount, setEvmAccount] = useState<string>("");
  const [isMetaMaskConnected, setIsMetaMaskConnected] = useState<boolean>(false);
  const [xrplWallet, setXrplWallet] = useState<XRPLTestnetWallet | null>(null);
  const [isFundingXRPL, setIsFundingXRPL] = useState<boolean>(false);
  const [actorRole, setActorRole] = useState<"LENDER" | "BORROWER">("LENDER");
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const showMessage = (text: string, type: "success" | "error" | "info") => {
    setStatusMessage({ text, type });
    if (type !== "info") {
      setTimeout(() => setStatusMessage(null), 6000);
    }
  };

  const getProviderAndSigner = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await browserProvider.getSigner();
      return { provider: browserProvider, signer };
    }
    throw new Error("MetaMask is required to sign transactions on XRPL EVM Sidechain.");
  };

  const connectMetaMask = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({
          method: "eth_requestAccounts",
        });

        const targetChainIdHex = "0x161c28"; // 1449000
        try {
          await (window as any).ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainIdHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
            await (window as any).ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: targetChainIdHex,
                  chainName: "XRPL EVM Testnet",
                  rpcUrls: ["https://rpc.testnet.xrplevm.org/"],
                  nativeCurrency: {
                    name: "XRP",
                    symbol: "XRP",
                    decimals: 18,
                  },
                  blockExplorerUrls: ["https://explorer.testnet.xrplevm.org/"],
                },
              ],
            });
          } else {
            console.warn("Chain switch notice:", switchError);
          }
        }

        if (accounts && accounts.length > 0) {
          setEvmAccount(accounts[0]);
          setIsMetaMaskConnected(true);
          if (typeof window !== "undefined") {
            localStorage.setItem("amlp_wallet_type", "metamask");
          }
          showMessage(`Connected MetaMask: ${accounts[0].slice(0, 8)}...`, "success");
        }
      } catch (err: any) {
        showMessage(`Connection error: ${err.message}`, "error");
      }
    } else {
      showMessage("MetaMask not found. Please install MetaMask.", "error");
    }
  };

  const switchRole = (role: "LENDER" | "BORROWER") => {
    setActorRole(role);
    if (typeof window !== "undefined") {
      localStorage.setItem("amlp_actor_role", role);
    }
  };

  const disconnectWallet = () => {
    setEvmAccount("");
    setIsMetaMaskConnected(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem("amlp_wallet_type");
    }
    showMessage("Wallet disconnected.", "info");
  };

  const fundXRPLWallet = async () => {
    setIsFundingXRPL(true);
    showMessage("Requesting funds from XRPL Testnet faucet...", "info");
    try {
      const wallet = await createAndFundXRPLTestnetWallet();
      setXrplWallet(wallet);
      showMessage(`XRPL Testnet Wallet Created: ${wallet.address}`, "success");
    } catch (err: any) {
      showMessage(`XRPL Faucet Error: ${err.message}`, "error");
    } finally {
      setIsFundingXRPL(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedRole = localStorage.getItem("amlp_actor_role");
      if (savedRole === "LENDER" || savedRole === "BORROWER") {
        setActorRole(savedRole);
      }

      if ((window as any).ethereum) {
        (window as any).ethereum
          .request({ method: "eth_accounts" })
          .then((accs: string[]) => {
            if (accs && accs.length > 0) {
              setEvmAccount(accs[0]);
              setIsMetaMaskConnected(true);
            }
          })
          .catch((e: any) => console.warn("Silent accounts error:", e));

        const handleAccounts = (accs: string[]) => {
          if (accs && accs.length > 0) {
            setEvmAccount(accs[0]);
            setIsMetaMaskConnected(true);
          } else {
            setEvmAccount("");
            setIsMetaMaskConnected(false);
          }
        };

        const handleChain = () => {
          window.location.reload();
        };

        (window as any).ethereum.on("accountsChanged", handleAccounts);
        (window as any).ethereum.on("chainChanged", handleChain);

        return () => {
          (window as any).ethereum?.removeListener?.("accountsChanged", handleAccounts);
          (window as any).ethereum?.removeListener?.("chainChanged", handleChain);
        };
      }
    }
  }, []);

  return (
    <Web3Context.Provider
      value={{
        evmAccount,
        isMetaMaskConnected,
        xrplWallet,
        isFundingXRPL,
        actorRole,
        statusMessage,
        connectMetaMask,
        disconnectWallet,
        fundXRPLWallet,
        switchRole,
        showMessage,
        getProviderAndSigner,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}

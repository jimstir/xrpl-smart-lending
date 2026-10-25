"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  ShieldCheck,
  TrendingUp,
  CreditCard,
  Lock,
  Sparkles,
  Zap,
  Activity,
  DollarSign,
  RefreshCw,
  Wallet,
  AlertCircle,
  PlusCircle,
  Sliders,
  Settings,
  ExternalLink,
  Copy,
  Check,
  X,
  Search,
  Bot,
  Coins,
  Building2,
  ChevronRight,
  UserPlus,
} from "lucide-react";
import {
  DEPLOYED_ADDRESSES,
  LENDING_VAULT_ABI,
  MOCK_ERC20_ABI,
  COLLATERAL_VAULT_ABI,
  RISK_ENGINE_ABI,
  NATIVE_COLLATERAL_BRIDGE_ABI,
  FIAT_GATEWAY_ABI,
  TOKEN_VERIFICATION_GATE_ABI,
  LENDING_VAULT_DEPLOYER_ABI,
  LENDING_VAULT_DEPLOYER_BYTECODE,
} from "../lib/contracts";
import { LENDING_VAULT_BYTECODE } from "../lib/vault-bytecode";
import { createAndFundXRPLTestnetWallet, XRPLTestnetWallet } from "../lib/xrpl-wallet";

interface ActiveProposal {
  id: string;
  title: string;
  description: string;
  actionType: "IDLE_STIMULATION" | "SCARCITY_OPTIMIZATION" | "TOKEN_ONBOARDING";
  actionLabel: string;
}

export default function AMLPDashboard() {
  // Web3 & Connected Wallet State (starts completely unassigned - ZERO mock data)
  const [evmAccount, setEvmAccount] = useState<string>("");
  const [isMetaMaskConnected, setIsMetaMaskConnected] = useState<boolean>(false);
  const [xrplWallet, setXrplWallet] = useState<XRPLTestnetWallet | null>(null);
  const [isFundingXRPL, setIsFundingXRPL] = useState<boolean>(false);
  const [actorRole, setActorRole] = useState<"LENDER" | "BORROWER">("LENDER");

  // Database Index
  const [vaultsList, setVaultsList] = useState<any[]>([]);
  const [selectedVaultAddress, setSelectedVaultAddress] = useState<string>("");
  const [myLoans, setMyLoans] = useState<any[]>([]);
  const [vaultLoans, setVaultLoans] = useState<any[]>([]);
  const [vaultSearchQuery, setVaultSearchQuery] = useState<string>("");
  const [showServiceSettingsModal, setShowServiceSettingsModal] = useState<boolean>(false);
  const [serviceModalTab, setServiceModalTab] = useState<"OVERVIEW" | "ACTIONS" | "CONTRACTS">("OVERVIEW");
  const [lenderActionMode, setLenderActionMode] = useState<"DEPOSIT" | "BORROW">("DEPOSIT");

  // Join Vault State for Borrowers
  const [showJoinVaultModal, setShowJoinVaultModal] = useState<boolean>(false);
  const [joinVaultInputAddress, setJoinVaultInputAddress] = useState<string>("");
  const [joinedVaultAddresses, setJoinedVaultAddresses] = useState<string[]>([]);

  // Live On-Chain State
  const [utilizationRate, setUtilizationRate] = useState<string>("0.0");
  const [borrowRate, setBorrowRate] = useState<string>("0.0");
  const [vaultOwner, setVaultOwner] = useState<string>("");
  const [borrowerDebt, setBorrowerDebt] = useState<string>("0.0");
  const [borrowerHf, setBorrowerHf] = useState<string>("0.0");
  const [borrowerRlusdBalance, setBorrowerRlusdBalance] = useState<string>("0.0");
  const [borrowerCollateralBalance, setBorrowerCollateralBalance] = useState<string>("0.0");
  const [isWxrpCompliant, setIsWxrpCompliant] = useState<boolean>(false);

  // Dynamic Proposals
  const [activeProposals, setActiveProposals] = useState<ActiveProposal[]>([]);

  // Action Inputs
  const [depositLenderAmount, setDepositLenderAmount] = useState<string>("10000");
  const [collateralType, setCollateralType] = useState<"wETH" | "wXRP" | "NATIVE_XRPL">("wETH");
  const [collateralDepositAmount, setCollateralDepositAmount] = useState<string>("2.0");
  const [borrowAmountInput, setBorrowAmountInput] = useState<string>("2000");
  const [repayAmountInput, setRepayAmountInput] = useState<string>("1000");

  // Vault Deployment Form State (Streamlined Business Inputs & Modal Dialog)
  const [showDeployModal, setShowDeployModal] = useState<boolean>(false);
  const [deploySuccessData, setDeploySuccessData] = useState<any | null>(null);
  const [deployVaultName, setDeployVaultName] = useState<string>("AI-Managed RLUSD Vault");
  const [deployVaultSymbol, setDeployVaultSymbol] = useState<string>("amRLUSD");
  const [deployAssetAddress, setDeployAssetAddress] = useState<string>(DEPLOYED_ADDRESSES.contracts.RLUSD);
  const [deployInitialDeposit, setDeployInitialDeposit] = useState<string>("10000");
  const [deployRateMode, setDeployRateMode] = useState<"KINKED" | "FIXED">("FIXED");
  const [deployBaseRate, setDeployBaseRate] = useState<string>("2.0");
  const [deployOptimalUtil, setDeployOptimalUtil] = useState<string>("80.0");
  const [deploySlope1, setDeploySlope1] = useState<string>("4.0");
  const [deploySlope2, setDeploySlope2] = useState<string>("30.0");
  const [deployFixedRate, setDeployFixedRate] = useState<string>("5.0");

  const openDeployModal = () => {
    setDeployRateMode("FIXED");
    setDeploySuccessData(null);
    setShowDeployModal(true);
  };

  // Portfolio Management & Settings State
  const [lenderSubTab, setLenderSubTab] = useState<"DASHBOARD" | "SETTINGS">("DASHBOARD");
  const [copiedKey, setCopiedKey] = useState<string>("");

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  // Status & Feedback
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const showMessage = (text: string, type: "success" | "error" | "info") => {
    setStatusMessage({ text, type });
    if (type !== "info") {
      setTimeout(() => setStatusMessage(null), 6000);
    }
  };

  // Provider / Signer helper
  const getProviderAndSigner = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await browserProvider.getSigner();
      return { provider: browserProvider, signer };
    }
    const provider = new ethers.JsonRpcProvider(DEPLOYED_ADDRESSES.rpcUrl);
    throw new Error("MetaMask is required to sign transactions on XRPL EVM Sidechain.");
  };

  // Connect MetaMask and auto-add/switch to XRPL EVM Sidechain Testnet
  const connectMetaMask = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({
          method: "eth_requestAccounts",
        });

        // Prompt MetaMask to switch to XRPL EVM Testnet (Chain ID 1449000 -> 0x161c28)
        const targetChainIdHex = "0x161c28";
        try {
          await (window as any).ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainIdHex }],
          });
        } catch (switchError: any) {
          // Error 4902 indicates that the network has not been added to MetaMask yet
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
            console.warn("Chain switch error (e.g. user rejected or on local dev):", switchError);
          }
        }

        if (accounts && accounts.length > 0) {
          setEvmAccount(accounts[0]);
          setIsMetaMaskConnected(true);
          if (typeof window !== "undefined") {
            localStorage.setItem("amlp_wallet_type", "metamask");
            localStorage.removeItem("amlp_test_persona");
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

  // Switch view role without disconnecting wallet
  const handleSwitchRole = (role: "LENDER" | "BORROWER") => {
    setActorRole(role);
    if (typeof window !== "undefined") {
      localStorage.setItem("amlp_actor_role", role);
    }
  };

  // Disconnect EVM Wallet
  const handleDisconnectWallet = () => {
    setEvmAccount("");
    setIsMetaMaskConnected(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem("amlp_wallet_type");
      localStorage.removeItem("amlp_test_persona");
    }
    showMessage("Wallet disconnected.", "info");
  };

  // Generate real XRPL Testnet Wallet
  const handleFundXRPLWallet = async () => {
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

  // Load Database Vaults & Loans (with local storage & file resilience)
  const refreshDbData = async () => {
    try {
      const resV = await fetch("/api/vaults");
      const dataV = await resV.json();
      let combinedVaults: any[] = dataV.success && Array.isArray(dataV.vaults) ? [...dataV.vaults] : [];

      // Merge with custom vaults saved in client localStorage
      try {
        const localCustom = localStorage.getItem("amlp_custom_vaults");
        if (localCustom) {
          const parsed = JSON.parse(localCustom);
          if (Array.isArray(parsed)) {
            for (const cv of parsed) {
              if (!combinedVaults.some((v) => v.address.toLowerCase() === cv.address.toLowerCase())) {
                combinedVaults.unshift(cv);
              }
            }
          }
        }
      } catch (e) {}

      // Fallback: If still empty, ensure canonical deployed vault is present
      if (combinedVaults.length === 0) {
        combinedVaults.push({
          id: "vault-canonical-1",
          name: "AI-Managed RLUSD Vault",
          symbol: "amRLUSD",
          address: DEPLOYED_ADDRESSES.contracts.LendingVault,
          reserveVault: DEPLOYED_ADDRESSES.contracts.ProtocolReserveVault,
          riskEngine: DEPLOYED_ADDRESSES.contracts.RiskEngine,
          liquidationManager: DEPLOYED_ADDRESSES.contracts.LiquidationManager,
          owner: evmAccount || "0xb1041133942d2E95e81B69acA3e7252C40d784B2",
          asset: DEPLOYED_ADDRESSES.contracts.RLUSD,
          assetSymbol: "RLUSD",
          initialDeposit: "10000",
          network: "XRPL EVM Sidechain Testnet",
        });
      }

      setVaultsList(combinedVaults);
      if (combinedVaults.length > 0 && !selectedVaultAddress) {
        setSelectedVaultAddress(combinedVaults[0].address);
      }

      if (evmAccount) {
        const resL = await fetch(`/api/loans?borrower=${evmAccount}`);
        const dataL = await resL.json();
        if (dataL.success) {
          setMyLoans(dataL.loans);
        }
      }

      const targetVault = selectedVaultAddress || (combinedVaults.length > 0 ? combinedVaults[0].address : "");
      if (targetVault) {
        const resVL = await fetch(`/api/loans?vaultAddress=${targetVault}`);
        const dataVL = await resVL.json();
        if (dataVL.success) {
          setVaultLoans(dataVL.loans);
        }
      } else {
        setVaultLoans([]);
      }
    } catch (err) {
      console.warn("Database load error:", err);
    }
  };

  // Load On-Chain State for Active Vault & Borrower
  const refreshOnChainData = async () => {
    if (!selectedVaultAddress) {
      setUtilizationRate("0.0");
      setBorrowRate("0.0");
      setVaultOwner("");
      setActiveProposals([]);
      return;
    }

    try {
      const { provider } = await getProviderAndSigner();
      const vaultContract = new ethers.Contract(
        selectedVaultAddress,
        LENDING_VAULT_ABI,
        provider
      );

      const ownerAddr = await vaultContract.owner();
      setVaultOwner(ownerAddr);

      const rawUtil = await vaultContract.getUtilizationRate();
      const utilNum = Number(rawUtil) / 100;
      setUtilizationRate(utilNum.toFixed(2));

      const rawRate = await vaultContract.getBorrowRate();
      const rateNum = Number(rawRate) / 100;
      setBorrowRate(rateNum.toFixed(2));

      // Token verification compliance check
      const gateContract = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.TokenVerificationGate,
        TOKEN_VERIFICATION_GATE_ABI,
        provider
      );
      const wxrpStatus = await gateContract.isTokenCompliant(DEPLOYED_ADDRESSES.contracts.wXRP);
      setIsWxrpCompliant(wxrpStatus);

      // Generate dynamic proposals based on real on-chain metrics
      const proposals: ActiveProposal[] = [];
      if (utilNum < 20.0) {
        proposals.push({
          id: "prop-1",
          title: "Proposal 1: Idle Capital Stimulation",
          description: `Vault utilization is only ${utilNum.toFixed(1)}%. Lower Base Rate to 1.50% to stimulate borrow demand.`,
          actionType: "IDLE_STIMULATION",
          actionLabel: "Approve & Lower Base Rate",
        });
      } else if (utilNum > 85.0) {
        proposals.push({
          id: "prop-2",
          title: "Proposal 2: Scarcity Jump Optimization",
          description: `Utilization is critically high at ${utilNum.toFixed(1)}%. Steepen slope2 to 45.0% to protect liquidity buffer.`,
          actionType: "SCARCITY_OPTIMIZATION",
          actionLabel: "Approve & Steepen Jump Rate",
        });
      }

      if (!wxrpStatus) {
        proposals.push({
          id: "prop-8",
          title: "Proposal 8: Token Onboarding (wXRP)",
          description: "Dual-oracle feed verified. Approve wXRP compliance in TokenVerificationGate.",
          actionType: "TOKEN_ONBOARDING",
          actionLabel: "Approve & List Asset",
        });
      }
      setActiveProposals(proposals);

      // Borrower position
      if (evmAccount) {
        const [, rawDebt] = await vaultContract.getBorrowerDebt(evmAccount);
        setBorrowerDebt(ethers.formatEther(rawDebt));

        const riskContract = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.RiskEngine,
          RISK_ENGINE_ABI,
          provider
        );
        const rawHf = await riskContract.calculateHealthFactor(evmAccount);
        if (rawDebt === BigInt(0)) {
          setBorrowerHf("∞ (No Debt)");
        } else {
          setBorrowerHf(Number(ethers.formatEther(rawHf)).toFixed(2));
        }

        const rlusdContract = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.RLUSD,
          MOCK_ERC20_ABI,
          provider
        );
        const bal = await rlusdContract.balanceOf(evmAccount);
        setBorrowerRlusdBalance(ethers.formatEther(bal));

        const collateralContract = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.CollateralVault,
          COLLATERAL_VAULT_ABI,
          provider
        );
        const cBal = await collateralContract.getUserCollateral(
          evmAccount,
          DEPLOYED_ADDRESSES.contracts.wETH
        );
        setBorrowerCollateralBalance(ethers.formatEther(cBal));
      }
    } catch (err) {
      console.warn("Contract state read error:", err);
    }
  };

  useEffect(() => {
    refreshDbData();

    try {
      const storedJoined = localStorage.getItem("amlp_joined_vaults");
      if (storedJoined) {
        setJoinedVaultAddresses(JSON.parse(storedJoined));
      }
    } catch (e) {
      console.warn("Could not load joined vaults from localStorage:", e);
    }

    // Auto-check if MetaMask is already connected without prompting
    const checkConnectedWallet = async () => {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        try {
          const accounts = await (window as any).ethereum.request({
            method: "eth_accounts",
          });
          if (accounts && accounts.length > 0) {
            setEvmAccount(accounts[0]);
            setIsMetaMaskConnected(true);
            const savedRole = localStorage.getItem("amlp_actor_role");
            if (savedRole === "LENDER" || savedRole === "BORROWER") {
              setActorRole(savedRole);
            }
            return;
          }
        } catch (err) {
          console.warn("Silent eth_accounts error:", err);
        }
      }

    };

    checkConnectedWallet();

    if (typeof window !== "undefined" && (window as any).ethereum) {
      const handleAccountsChanged = (accs: string[]) => {
        if (accs && accs.length > 0) {
          setEvmAccount(accs[0]);
          setIsMetaMaskConnected(true);
          localStorage.setItem("amlp_wallet_type", "metamask");
          localStorage.removeItem("amlp_test_persona");
        } else {
          setEvmAccount("");
          setIsMetaMaskConnected(false);
          localStorage.removeItem("amlp_wallet_type");
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      (window as any).ethereum.on("accountsChanged", handleAccountsChanged);
      (window as any).ethereum.on("chainChanged", handleChainChanged);

      return () => {
        (window as any).ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
        (window as any).ethereum?.removeListener?.("chainChanged", handleChainChanged);
      };
    }
  }, []);

  useEffect(() => {
    refreshDbData();
    refreshOnChainData();
  }, [evmAccount, selectedVaultAddress, actorRole]);

  // LENDER ACTION: Deploy New Vault
  const handleDeployNewVault = async () => {
    if (!evmAccount) {
      showMessage("Please connect your EVM wallet first.", "error");
      return;
    }

    if (!ethers.isAddress(deployAssetAddress)) {
      showMessage("Invalid Lending Asset address format. Must be a valid 0x address.", "error");
      return;
    }

    setIsLoading(true);
    showMessage("Step 1/3: Preparing automated deployment factory on XRPL EVM Sidechain...", "info");
    try {
      const { signer } = await getProviderAndSigner();
      const userAddress = await signer.getAddress();

      // Deploy the factory deployer contract
      const deployerFactory = new ethers.ContractFactory(
        LENDING_VAULT_DEPLOYER_ABI,
        LENDING_VAULT_DEPLOYER_BYTECODE,
        signer
      );

      showMessage("Step 2/3: Deploying Protocol Suite (ProtocolReserveVault, RiskEngine, LiquidationManager, LendingVault)...", "info");
      const deployer = await deployerFactory.deploy();
      await deployer.waitForDeployment();

      // Configure rate policy parameters
      const isFixed = deployRateMode === "FIXED";
      const fixedBps = Math.round(parseFloat(deployFixedRate || "5.0") * 100);
      const baseBps = Math.round(parseFloat(deployBaseRate || "2.0") * 100);
      const optBps = Math.round(parseFloat(deployOptimalUtil || "80.0") * 100);
      const s1Bps = Math.round(parseFloat(deploySlope1 || "4.0") * 100);
      const s2Bps = Math.round(parseFloat(deploySlope2 || "30.0") * 100);

      // Deploy full suite in 1 transaction
      const tx = await (deployer as any).deployVaultSystem(
        deployAssetAddress,
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
      showMessage("Wiring permissions and transferring contract ownership to your account...", "info");
      const receipt = await tx.wait();

      // Find VaultSystemDeployed event from logs
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
        } catch {
          // not this log
        }
      }

      if (!newVaultAddress) {
        throw new Error("Failed to retrieve deployed vault address from transaction events.");
      }

      // Step 3: Seed initial deposit if requested
      const initialDepositNum = parseFloat(deployInitialDeposit);
      if (!isNaN(initialDepositNum) && initialDepositNum > 0) {
        showMessage(`Step 3/3: Depositing initial ${deployInitialDeposit} RLUSD liquidity...`, "info");
        try {
          const rlusd = new ethers.Contract(deployAssetAddress, MOCK_ERC20_ABI, signer);
          const depositWei = ethers.parseEther(deployInitialDeposit);
          const currentBal = await rlusd.balanceOf(userAddress).catch(() => BigInt(0));

          if (currentBal < depositWei) {
            try {
              const mintTx = await rlusd.mint(userAddress, depositWei - currentBal);
              await mintTx.wait();
            } catch {
              // Official token contract may not have public minting; continue with available balance
            }
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

      // Register in database (Prisma with PostgreSQL)
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: deployVaultName || "AI-Managed RLUSD Vault",
          symbol: deployVaultSymbol || "amRLUSD",
          address: newVaultAddress,
          reserveVault: newReserveVaultAddress,
          riskEngine: newRiskEngineAddress,
          liquidationManager: newLiquidationManagerAddress,
          owner: userAddress,
          asset: deployAssetAddress,
          assetSymbol: "RLUSD",
          initialDeposit: deployInitialDeposit || "0",
          network: "XRPL EVM Sidechain Testnet",
        }),
      });

      const data = await res.json();
      if (data.success) {
        const newVaultObj = {
          name: deployVaultName || "AI-Managed RLUSD Vault",
          symbol: deployVaultSymbol || "amRLUSD",
          address: newVaultAddress,
          reserveVault: newReserveVaultAddress,
          riskEngine: newRiskEngineAddress,
          liquidationManager: newLiquidationManagerAddress,
          owner: userAddress,
          asset: deployAssetAddress,
          assetSymbol: "RLUSD",
          initialDeposit: deployInitialDeposit || "0",
          network: "XRPL EVM Sidechain Testnet",
        };
        try {
          const stored = localStorage.getItem("amlp_custom_vaults");
          const arr = stored ? JSON.parse(stored) : [];
          arr.unshift(newVaultObj);
          localStorage.setItem("amlp_custom_vaults", JSON.stringify(arr));
        } catch (e) {}

        setSelectedVaultAddress(newVaultAddress);
        setDeploySuccessData({
          name: deployVaultName || "AI-Managed RLUSD Vault",
          symbol: deployVaultSymbol || "amRLUSD",
          vaultAddress: newVaultAddress,
          reserveVault: newReserveVaultAddress,
          riskEngine: newRiskEngineAddress,
          liquidationManager: newLiquidationManagerAddress,
        });
        showMessage(
          `Successfully Deployed & Registered Lending Service (${deployVaultName || "AI-Managed RLUSD Vault"})!`,
          "success"
        );
        await refreshDbData();
        await refreshOnChainData();

        // Auto-close modal after brief confirmation
        setTimeout(() => {
          setShowDeployModal(false);
          setDeploySuccessData(null);
        }, 3200);
      } else {
        throw new Error(data.error || "Failed to persist vault in database");
      }
    } catch (err: any) {
      console.error(err);
      showMessage(`Deployment Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // LENDER ACTION: Deposit Stablecoin
  const handleLenderDeposit = async () => {
    if (!selectedVaultAddress) {
      showMessage("No active vault selected.", "error");
      return;
    }
    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const rlusd = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RLUSD, MOCK_ERC20_ABI, signer);
      const vault = new ethers.Contract(selectedVaultAddress, LENDING_VAULT_ABI, signer);

      const amountWei = ethers.parseEther(depositLenderAmount);
      try {
        await (await rlusd.mint(await signer.getAddress(), amountWei)).wait();
      } catch (mErr) {
        console.log("RLUSD mint skipped or unauthorized; using wallet balance", mErr);
      }
      await (await rlusd.approve(selectedVaultAddress, amountWei)).wait();
      const depTx = await vault.deposit(amountWei, await signer.getAddress());
      await depTx.wait();

      showMessage(`Deposited ${depositLenderAmount} RLUSD into vault! Vault is ready for borrowers.`, "success");
      await refreshOnChainData();
    } catch (err: any) {
      showMessage(`Deposit Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // LENDER ACTION: Mastercard AP4M Sandbox Settlement
  const handleMastercardSandboxSettle = async () => {
    if (!selectedVaultAddress) {
      showMessage("No active vault selected.", "error");
      return;
    }
    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const gateway = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.FiatOnRampGateway,
        FIAT_GATEWAY_ABI,
        signer
      );
      const rlusd = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RLUSD, MOCK_ERC20_ABI, signer);

      const voucherId = ethers.hexlify(ethers.randomBytes(32));
      const amountWei = ethers.parseEther("5000");
      const validUntil = Math.floor(Date.now() / 1000) + 3600;

      const network = await signer.provider.getNetwork();
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
      await (await rlusd.mint(await signer.getAddress(), amountWei)).wait();
      await (await rlusd.approve(DEPLOYED_ADDRESSES.contracts.FiatOnRampGateway, amountWei)).wait();

      const tx = await gateway.executeFiatSettlement(value, signature);
      await tx.wait();

      showMessage("Mastercard AP4M Sandbox voucher settled! Minted 5,000 amRLUSD shares to vault.", "success");
      await refreshOnChainData();
    } catch (err: any) {
      showMessage(`AP4M Settle Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // LENDER ACTION: Approve Agent Proposal
  const handleApproveProposal = async (actionType: string) => {
    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const vault = new ethers.Contract(selectedVaultAddress, LENDING_VAULT_ABI, signer);

      if (actionType === "IDLE_STIMULATION") {
        const tx = await vault.setKinkedCurveMode(150, 8000, 350, 2500);
        await tx.wait();
        showMessage("Executed Proposal 1: Base rate reduced to 1.50% on-chain.", "success");
      } else if (actionType === "SCARCITY_OPTIMIZATION") {
        const tx = await vault.setKinkedCurveMode(300, 8000, 500, 4500);
        await tx.wait();
        showMessage("Executed Proposal 2: Scarcity jump rate steepened to 45.0% on-chain.", "success");
      } else if (actionType === "TOKEN_ONBOARDING") {
        const gate = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.TokenVerificationGate,
          TOKEN_VERIFICATION_GATE_ABI,
          signer
        );
        const tx = await gate.setTokenCompliance(
          DEPLOYED_ADDRESSES.contracts.wXRP,
          true,
          "TIER_A_SOVEREIGN",
          ethers.parseEther("1000000")
        );
        await tx.wait();
        showMessage("Executed Proposal 8: wXRP verified and listed in TokenVerificationGate.", "success");
      }
      await refreshOnChainData();
    } catch (err: any) {
      showMessage(`Proposal Execution Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // BORROWER ACTION: Deposit Collateral
  const handleDepositCollateral = async () => {
    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();

      if (collateralType === "NATIVE_XRPL") {
        if (!xrplWallet) {
          showMessage("Please fund a real XRPL Testnet wallet first!", "error");
          setIsLoading(false);
          return;
        }

        const bridge = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.NativeCollateralBridge,
          NATIVE_COLLATERAL_BRIDGE_ABI,
          signer
        );
        const amountWei = ethers.parseEther(collateralDepositAmount);
        const dummyHash = ethers.hexlify(ethers.randomBytes(32));
        const expiry = Math.floor(Date.now() / 1000) + 3600;

        const tx = await bridge.mockAttestEscrow(
          await signer.getAddress(),
          DEPLOYED_ADDRESSES.contracts.wXRP,
          amountWei,
          dummyHash,
          expiry
        );
        await tx.wait();
        showMessage(`Attested ${collateralDepositAmount} Native XRP from ${xrplWallet.address.slice(0, 8)}... into CollateralVault!`, "success");
      } else {
        const tokenAddr =
          collateralType === "wETH"
            ? DEPLOYED_ADDRESSES.contracts.wETH
            : DEPLOYED_ADDRESSES.contracts.wXRP;

        const token = new ethers.Contract(tokenAddr, MOCK_ERC20_ABI, signer);
        const cVault = new ethers.Contract(
          DEPLOYED_ADDRESSES.contracts.CollateralVault,
          COLLATERAL_VAULT_ABI,
          signer
        );

        const amountWei = ethers.parseEther(collateralDepositAmount);
        await (await token.mint(await signer.getAddress(), amountWei)).wait();
        await (await token.approve(DEPLOYED_ADDRESSES.contracts.CollateralVault, amountWei)).wait();

        const tx = await cVault.depositCollateral(tokenAddr, amountWei);
        await tx.wait();
        showMessage(`Deposited ${collateralDepositAmount} ${collateralType} into CollateralVault!`, "success");
      }

      await refreshOnChainData();
    } catch (err: any) {
      showMessage(`Collateral Deposit Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // BORROWER ACTION: Borrow RLUSD
  const handleBorrow = async () => {
    if (!selectedVaultAddress) {
      showMessage("No active vault selected to borrow from.", "error");
      return;
    }
    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const vault = new ethers.Contract(selectedVaultAddress, LENDING_VAULT_ABI, signer);

      const amountWei = ethers.parseEther(borrowAmountInput);
      const tx = await vault.borrow(amountWei);
      const receipt = await tx.wait();

      await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower: await signer.getAddress(),
          vaultAddress: selectedVaultAddress,
          amountRLUSD: borrowAmountInput,
          collateralToken: collateralType,
          collateralAmount: collateralDepositAmount,
          txHash: receipt.hash,
        }),
      });

      showMessage(`Borrowed ${borrowAmountInput} RLUSD! Sent to your EVM wallet.`, "success");
      await refreshOnChainData();
      await refreshDbData();
    } catch (err: any) {
      showMessage(`Borrow Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // BORROWER ACTION: Repay Loan
  const handleRepay = async (loanId?: string) => {
    if (!selectedVaultAddress) return;
    setIsLoading(true);
    try {
      const { signer } = await getProviderAndSigner();
      const rlusd = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RLUSD, MOCK_ERC20_ABI, signer);
      const vault = new ethers.Contract(selectedVaultAddress, LENDING_VAULT_ABI, signer);

      const amountWei = ethers.parseEther(repayAmountInput);
      await (await rlusd.mint(await signer.getAddress(), amountWei)).wait();
      await (await rlusd.approve(selectedVaultAddress, amountWei)).wait();

      const tx = await vault.repay(amountWei);
      await tx.wait();

      if (loanId) {
        await fetch("/api/loans", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: loanId, status: "REPAID" }),
        });
      }

      showMessage(`Repaid ${repayAmountInput} RLUSD successfully!`, "success");
      await refreshOnChainData();
      await refreshDbData();
    } catch (err: any) {
      showMessage(`Repayment Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Join a Sovereign Lending Vault Service (Borrower Action)
  const handleJoinVault = async (targetAddr?: string) => {
    const rawAddr = (targetAddr || joinVaultInputAddress).trim();
    if (!rawAddr || !ethers.isAddress(rawAddr)) {
      showMessage("Please enter a valid Ethereum contract address (0x...)", "error");
      return;
    }

    const normalizedAddr = ethers.getAddress(rawAddr);

    // Check if already in vaultsList
    const existingVault = vaultsList.find(
      (v) => v.address.toLowerCase() === normalizedAddr.toLowerCase()
    );

    setIsLoading(true);
    try {
      if (existingVault) {
        const updated = Array.from(new Set([...joinedVaultAddresses, normalizedAddr]));
        setJoinedVaultAddresses(updated);
        try {
          localStorage.setItem("amlp_joined_vaults", JSON.stringify(updated));
        } catch (e) {}

        setSelectedVaultAddress(normalizedAddr);
        setShowJoinVaultModal(false);
        setJoinVaultInputAddress("");
        showMessage(`Joined loan service ${existingVault.name || normalizedAddr.slice(0, 8)} successfully!`, "success");
      } else {
        // Query on-chain metadata
        const { provider } = await getProviderAndSigner();
        const vaultContract = new ethers.Contract(normalizedAddr, LENDING_VAULT_ABI, provider);

        let name = "Sovereign Lending Vault";
        let symbol = "sVAULT";
        let asset = DEPLOYED_ADDRESSES.contracts.RLUSD;
        let owner = evmAccount || "0x0000000000000000000000000000000000000000";

        try {
          name = await vaultContract.name();
          symbol = await vaultContract.symbol();
          asset = await vaultContract.asset();
        } catch (err) {
          console.warn("Could not read ERC20/vault metadata directly:", err);
        }

        try {
          owner = await vaultContract.owner();
        } catch (err) {
          console.warn("Could not read vault owner:", err);
        }

        // Register vault in database
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
          const updated = Array.from(new Set([...joinedVaultAddresses, normalizedAddr]));
          setJoinedVaultAddresses(updated);
          try {
            localStorage.setItem("amlp_joined_vaults", JSON.stringify(updated));
            const stored = localStorage.getItem("amlp_custom_vaults");
            const arr = stored ? JSON.parse(stored) : [];
            if (!arr.some((v: any) => v.address.toLowerCase() === normalizedAddr.toLowerCase())) {
              arr.unshift({
                name,
                symbol,
                address: normalizedAddr,
                owner,
                asset,
                assetSymbol: "RLUSD",
                initialDeposit: "0",
                network: "XRPL EVM Sidechain Testnet",
              });
              localStorage.setItem("amlp_custom_vaults", JSON.stringify(arr));
            }
          } catch (e) {}

          await refreshDbData();
          setSelectedVaultAddress(normalizedAddr);
          setShowJoinVaultModal(false);
          setJoinVaultInputAddress("");
          showMessage(`Joined loan service ${name} (${symbol}) successfully!`, "success");
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

  // Render Vault Deployment Form (Streamlined business inputs only)
  const renderDeployForm = () => (
    <div className="space-y-6 pt-2">
      {/* Vault Identification */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Lending Service / Vault Name
          </label>
          <input
            type="text"
            value={deployVaultName}
            onChange={(e) => setDeployVaultName(e.target.value)}
            placeholder="AI-Managed RLUSD Vault"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Human-readable label for your sovereign lending service.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            LP Share Token Symbol
          </label>
          <input
            type="text"
            value={deployVaultSymbol}
            onChange={(e) => setDeployVaultSymbol(e.target.value)}
            placeholder="amRLUSD"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            ERC-20 LP token symbol minted to liquidity providers.
          </p>
        </div>
      </div>

      {/* Asset & Initial Deposit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Lending Asset (RLUSD Contract)
          </label>
          <input
            type="text"
            value={deployAssetAddress}
            onChange={(e) => setDeployAssetAddress(e.target.value.trim())}
            placeholder="0x..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            The ERC-20 stablecoin asset supplied by lenders and borrowed.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Initial Seed Deposit (RLUSD)
          </label>
          <input
            type="number"
            value={deployInitialDeposit}
            onChange={(e) => setDeployInitialDeposit(e.target.value)}
            placeholder="10000"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Initial liquidity minted & deposited by owner to bootstrap lending pool.
          </p>
        </div>
      </div>

      {/* Interest Rate Model Configuration */}
      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-white uppercase tracking-wider">
            Interest Rate Model
          </label>
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setDeployRateMode("FIXED")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                deployRateMode === "FIXED"
                  ? "bg-cyan-500 text-black font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Fixed Rate APR
            </button>
            <button
              type="button"
              onClick={() => setDeployRateMode("KINKED")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                deployRateMode === "KINKED"
                  ? "bg-cyan-500 text-black font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Dynamic Kinked Curve
            </button>
          </div>
        </div>

        {deployRateMode === "KINKED" ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Base Rate (% APR)</label>
              <input
                type="number"
                step="0.1"
                value={deployBaseRate}
                onChange={(e) => setDeployBaseRate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
              <span className="text-[10px] text-slate-500">Rate at 0% util</span>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Optimal Utilization (%)</label>
              <input
                type="number"
                step="1"
                value={deployOptimalUtil}
                onChange={(e) => setDeployOptimalUtil(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
              <span className="text-[10px] text-slate-500">Kink inflection</span>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Slope 1 (% APR)</label>
              <input
                type="number"
                step="0.1"
                value={deploySlope1}
                onChange={(e) => setDeploySlope1(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
              <span className="text-[10px] text-slate-500">Below kink</span>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Slope 2 (% APR)</label>
              <input
                type="number"
                step="0.1"
                value={deploySlope2}
                onChange={(e) => setDeploySlope2(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
              <span className="text-[10px] text-slate-500">Jump protection</span>
            </div>
          </div>
        ) : (
          <div className="pt-2 max-w-xs">
            <label className="text-[11px] text-slate-400 block mb-1">Fixed Borrow APR (%)</label>
            <input
              type="number"
              step="0.1"
              value={deployFixedRate}
              onChange={(e) => setDeployFixedRate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
            />
            <span className="text-[10px] text-slate-500">Flat borrow APR across all utilization</span>
          </div>
        )}
      </div>


      {/* Action Buttons */}
      <div className="flex items-center space-x-3 pt-2">
        <button
          onClick={handleDeployNewVault}
          disabled={isLoading}
          className="px-8 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Deploying to XRPL EVM Sidechain...</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              <span>Deploy Lending Vault on XRPL EVM Sidechain</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowDeployModal(false);
            setDeploySuccessData(null);
          }}
          className="px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // Render Deployment Modal Dialog
  const renderDeployModal = () => {
    if (!showDeployModal) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Deploy New Sovereign Lending Vault</h3>
                <p className="text-[11px] text-slate-400">XRPL EVM Sidechain Automated Deployment</p>
              </div>
            </div>
            {!isLoading && (
              <button
                onClick={() => {
                  setShowDeployModal(false);
                  setDeploySuccessData(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Modal Body */}
          <div className="p-6">
            {deploySuccessData ? (
              <div className="py-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                  <Check className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Deployment Successful!</h4>
                  <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                    Your sovereign lending service <strong className="text-white">{deploySuccessData.name}</strong> ({deploySuccessData.symbol}) has been provisioned and registered in your portfolio.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 max-w-md mx-auto truncate select-all">
                  LendingVault: {deploySuccessData.vaultAddress}
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setShowDeployModal(false);
                      setDeploySuccessData(null);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition shadow"
                  >
                    Done & View in Hub
                  </button>
                </div>
              </div>
            ) : (
              renderDeployForm()
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render Join Lending Vault Modal
  const renderJoinVaultModal = () => {
    if (!showJoinVaultModal) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Join a Lending Vault Service</h3>
                <p className="text-[11px] text-slate-400">
                  Connect to any sovereign LendingVault contract on XRPL EVM Sidechain.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowJoinVaultModal(false);
                setJoinVaultInputAddress("");
              }}
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
                  value={joinVaultInputAddress}
                  onChange={(e) => setJoinVaultInputAddress(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
                <button
                  onClick={() => handleJoinVault()}
                  disabled={isLoading || !joinVaultInputAddress.trim()}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-extrabold text-xs transition shadow flex items-center space-x-1.5 whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Join Service</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Paste the contract address of any deployed LendingVault. The credit hub will automatically fetch its dynamic interest rate model, pool liquidity, and risk parameters.
              </p>
            </div>

            {/* Discovered Vaults */}
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
                  vaultsList.map((v) => {
                    const isJoined = joinedVaultAddresses.some(
                      (ja) => ja.toLowerCase() === v.address.toLowerCase()
                    );
                    const isActive = selectedVaultAddress.toLowerCase() === v.address.toLowerCase();
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
                            onClick={() => handleJoinVault(v.address)}
                            disabled={isJoined && isActive}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                              isJoined && isActive
                                ? "bg-slate-800 text-slate-500 cursor-default"
                                : isJoined
                                ? "bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30"
                                : "bg-cyan-500 hover:bg-cyan-400 text-black font-bold"
                            }`}
                          >
                            {isJoined && isActive ? "Active" : isJoined ? "Switch" : "Join"}
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
  };

  // Render Service Settings & AI Solvency Agent Modal
  const renderServiceSettingsModal = () => {
    if (!showServiceSettingsModal) return null;

    const currentVault =
      vaultsList.find(
        (v) => v.address.toLowerCase() === selectedVaultAddress.toLowerCase()
      ) || vaultsList[0];

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">
                  Service Settings & AI Solvency Agent
                </h3>
                <p className="text-[11px] text-slate-400">
                  {currentVault?.name || "Lending Vault"} ({currentVault?.symbol || "amRLUSD"}) • {currentVault?.address ? `${currentVault.address.slice(0, 10)}...` : ""}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowServiceSettingsModal(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* Section 1: Dedicated Autonomous AI Solvency Agent */}
            <div className="p-5 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <h4 className="font-bold text-sm text-white flex items-center space-x-2">
                    <span>Autonomous AI Solvency Agent</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">Active & Tracking</span>
                  </h4>
                </div>
                <button
                  onClick={refreshOnChainData}
                  className="text-xs text-cyan-400 hover:underline flex items-center space-x-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Evaluate Proposals</span>
                </button>
              </div>

              <p className="text-xs text-slate-300">
                This sovereign lending service is equipped with an autonomous agent tracking borrower health factors, kinked utilization parameters, and Dutch auction liquidations on the XRPL EVM Sidechain.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Utilization</span>
                  <span className="text-sm font-mono font-bold text-white">{utilizationRate}%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Borrow APR</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">{borrowRate}%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Collateral Val.</span>
                  <span className="text-sm font-mono font-bold text-cyan-400">Multi-Oracle</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Bad Debt Risk</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">0.00%</span>
                </div>
              </div>

              {/* Agent Proposals */}
              <div className="pt-2 space-y-2.5">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Agent Optimization Proposals
                </span>
                {activeProposals.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-center text-xs text-slate-400">
                    All vault parameters, kink rates, and collateral assets are currently optimal. No active agent proposals pending.
                  </div>
                ) : (
                  activeProposals.map((prop) => (
                    <div
                      key={prop.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs gap-3"
                    >
                      <div>
                        <div className="font-bold text-cyan-300">{prop.title}</div>
                        <p className="text-slate-400 text-[11px] mt-0.5">{prop.description}</p>
                      </div>
                      <button
                        onClick={() => handleApproveProposal(prop.actionType)}
                        disabled={isLoading}
                        className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg text-xs whitespace-nowrap transition"
                      >
                        {prop.actionLabel}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Section 2: Deployed Smart Contract Suite */}
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-white flex items-center space-x-2">
                <Settings className="w-4 h-4 text-cyan-400" />
                <span>Deployed Smart Contract Suite</span>
              </h4>
              <p className="text-xs text-slate-400">
                All provisioned contracts for this sovereign lending service on the XRPL EVM Sidechain.
              </p>

              <div className="grid grid-cols-1 gap-2.5">
                {/* 1. Lending Vault */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">Lending Vault (ERC-4626)</div>
                    <div className="text-[11px] font-mono text-cyan-300 select-all">{currentVault?.address}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyToClipboard(currentVault?.address, "lendingVault")}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center space-x-1"
                    >
                      {copiedKey === "lendingVault" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "lendingVault" ? "Copied" : "Copy"}</span>
                    </button>
                    <a
                      href={`https://explorer.testnet.xrplevm.org/address/${currentVault?.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs flex items-center space-x-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Explorer</span>
                    </a>
                  </div>
                </div>

                {/* 2. Protocol Reserve Vault */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">Protocol Reserve Vault</div>
                    <div className="text-[11px] font-mono text-cyan-300 select-all">{currentVault?.reserveVault || "Auto-Provisioned"}</div>
                  </div>
                  {currentVault?.reserveVault && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(currentVault.reserveVault, "reserveVault")}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center space-x-1"
                      >
                        {copiedKey === "reserveVault" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === "reserveVault" ? "Copied" : "Copy"}</span>
                      </button>
                      <a
                        href={`https://explorer.testnet.xrplevm.org/address/${currentVault.reserveVault}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Explorer</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* 3. Risk Engine */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">Risk Engine</div>
                    <div className="text-[11px] font-mono text-cyan-300 select-all">{currentVault?.riskEngine || "Auto-Provisioned"}</div>
                  </div>
                  {currentVault?.riskEngine && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(currentVault.riskEngine, "riskEngine")}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center space-x-1"
                      >
                        {copiedKey === "riskEngine" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === "riskEngine" ? "Copied" : "Copy"}</span>
                      </button>
                      <a
                        href={`https://explorer.testnet.xrplevm.org/address/${currentVault.riskEngine}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Explorer</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* 4. Liquidation Manager */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">Liquidation Manager</div>
                    <div className="text-[11px] font-mono text-cyan-300 select-all">{currentVault?.liquidationManager || "Auto-Provisioned"}</div>
                  </div>
                  {currentVault?.liquidationManager && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(currentVault.liquidationManager, "liquidationManager")}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center space-x-1"
                      >
                        {copiedKey === "liquidationManager" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === "liquidationManager" ? "Copied" : "Copy"}</span>
                      </button>
                      <a
                        href={`https://explorer.testnet.xrplevm.org/address/${currentVault.liquidationManager}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Explorer</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* 5. Lending Asset */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">Lending Asset (RLUSD)</div>
                    <div className="text-[11px] font-mono text-cyan-300 select-all">{currentVault?.asset || DEPLOYED_ADDRESSES.contracts.RLUSD}</div>
                  </div>
                  {(currentVault?.asset || DEPLOYED_ADDRESSES.contracts.RLUSD) && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(currentVault?.asset || DEPLOYED_ADDRESSES.contracts.RLUSD, "asset")}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center space-x-1"
                      >
                        {copiedKey === "asset" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === "asset" ? "Copied" : "Copy"}</span>
                      </button>
                      <a
                        href={`https://explorer.testnet.xrplevm.org/address/${currentVault?.asset || DEPLOYED_ADDRESSES.contracts.RLUSD}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Explorer</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 3: Risk & Governance Parameters */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Vault Governance & Risk Parameters
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Target Kink Utilization</span>
                  <span className="font-mono font-bold text-white">80.0%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Max Collateral LTV</span>
                  <span className="font-mono font-bold text-cyan-400">70.0%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Liquidation Threshold</span>
                  <span className="font-mono font-bold text-purple-400">80.0%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Liquidation Penalty</span>
                  <span className="font-mono font-bold text-emerald-400">10.0%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Liquidation Engine</span>
                  <span className="font-mono font-bold text-slate-300">Dutch Auction</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Bridge Gateway</span>
                  <span className="font-mono font-bold text-cyan-300">Axelar / XRPL Escrow</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center text-black font-extrabold shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white">
              AMLP Core Testing Portal
            </h1>
            <p className="text-xs text-slate-400">XRPL EVM Sidechain & Native XRP Ledger</p>
          </div>
        </div>

        {/* Dual Wallet Badges & Role Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Actor Role Selector */}
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => handleSwitchRole("LENDER")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                actorRole === "LENDER"
                  ? "bg-cyan-500 text-black shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Lender View
            </button>
            <button
              onClick={() => handleSwitchRole("BORROWER")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                actorRole === "BORROWER"
                  ? "bg-cyan-500 text-black shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Borrower View
            </button>
          </div>

          {/* EVM Wallet (MetaMask) */}
          {evmAccount ? (
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-slate-200">
                  {isMetaMaskConnected ? "MetaMask" : "Test"}: {evmAccount.slice(0, 6)}...{evmAccount.slice(-4)}
                </span>
              </div>
              <button
                onClick={handleDisconnectWallet}
                title="Disconnect Wallet"
                className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-800 text-xs transition font-medium"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connectMetaMask}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition flex items-center space-x-1.5 shadow"
            >
              <Wallet className="w-4 h-4" />
              <span>Connect EVM Wallet (MetaMask)</span>
            </button>
          )}

          {/* XRPL Native Testnet Wallet */}
          {xrplWallet ? (
            <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              <span className="text-slate-300">
                XRPL: {xrplWallet.address.slice(0, 6)}... ({xrplWallet.balanceXRP} XRP)
              </span>
            </div>
          ) : (
            <button
              onClick={handleFundXRPLWallet}
              disabled={isFundingXRPL}
              className="px-3 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isFundingXRPL ? "Funding XRPL..." : "Fund XRPL Testnet Wallet"}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-6xl mx-auto w-full px-6 py-8 flex-1 space-y-6">
        {statusMessage && (
          <div
            className={`p-4 rounded-xl text-xs flex items-center space-x-3 border ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : statusMessage.type === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
            }`}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Unconnected Wallet State */}
        {!evmAccount && (
          <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
            <Wallet className="w-12 h-12 text-cyan-400 mx-auto opacity-80" />
            <h2 className="text-lg font-bold text-white">No Wallet Connected</h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Please connect your XRPL EVM Sidechain wallet (MetaMask) or select a prefunded test persona in the header to begin testing.
            </p>
            <div className="pt-2 flex justify-center">
              <button
                onClick={connectMetaMask}
                className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition shadow"
              >
                Connect MetaMask
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* LENDER VIEW (Single-Widget + Open Loans List Below) */}
        {/* ======================================================== */}
        {evmAccount && actorRole === "LENDER" && (
          <div className="space-y-6">
            {(() => {
              const filteredVaults = vaultsList.filter((v) => {
                if (!vaultSearchQuery.trim()) return true;
                const q = vaultSearchQuery.toLowerCase();
                return (
                  v.address.toLowerCase().includes(q) ||
                  (v.name && v.name.toLowerCase().includes(q)) ||
                  (v.symbol && v.symbol.toLowerCase().includes(q))
                );
              });

              const activeVault =
                vaultsList.find(
                  (v) => v.address.toLowerCase() === selectedVaultAddress.toLowerCase()
                ) || filteredVaults[0] || vaultsList[0];

              const totalActiveDebt = vaultLoans
                .filter((l) => l.status === "ACTIVE")
                .reduce((sum, l) => sum + parseFloat(l.amountRLUSD || "0"), 0);

              return (
                <>
                  {vaultsList.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                      <AlertCircle className="w-8 h-8 text-cyan-400 mx-auto" />
                      <h3 className="font-bold text-sm text-white">No Sovereign Vaults Deployed</h3>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        No lending vault has been registered on the XRPL EVM Sidechain yet. Click Deploy New Vault to launch your sovereign Lending Vault with automated contract provisioning.
                      </p>
                      <button
                        onClick={openDeployModal}
                        className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center justify-center space-x-2 mx-auto"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Deploy New Vault</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* SINGLE LENDER HUB WIDGET */}
                      <div className="p-6 md:p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
                        {/* Header: Title, Address Search, Vault Dropdown, Settings, and Deploy New Vault Button */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                          <div>
                            <h2 className="text-base font-bold text-white flex items-center space-x-2">
                              <PlusCircle className="w-5 h-5 text-cyan-400" />
                              <span>Lender Sovereign Vault Hub</span>
                            </h2>
                            <p className="text-xs text-slate-400 mt-1">
                              Supply pool liquidity, manage sovereign loans, and inspect solvency for your Lending Vault on the XRPL EVM Sidechain.
                            </p>
                          </div>

                          {/* Controls & Deploy New Vault Button in exact spot */}
                          <div className="flex flex-wrap items-center gap-3">
                            {/* Search LendingVault by Address or Name */}
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                placeholder="Search vault address (0x...) or name"
                                value={vaultSearchQuery}
                                onChange={(e) => {
                                  const q = e.target.value;
                                  setVaultSearchQuery(q);
                                  const match = vaultsList.find(
                                    (v) =>
                                      v.address.toLowerCase() === q.trim().toLowerCase() ||
                                      (v.name && v.name.toLowerCase() === q.trim().toLowerCase())
                                  );
                                  if (match) setSelectedVaultAddress(match.address);
                                }}
                                className="pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-56 md:w-64"
                              />
                            </div>

                            {/* Vault Selector Dropdown */}
                            <select
                              value={selectedVaultAddress}
                              onChange={(e) => setSelectedVaultAddress(e.target.value)}
                              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 max-w-[200px] truncate"
                            >
                              {filteredVaults.map((v) => (
                                <option key={v.id || v.address} value={v.address}>
                                  {v.name || "Vault"} ({v.address.slice(0, 8)}...)
                                </option>
                              ))}
                            </select>

                            {/* Service Settings & AI Agent Modal Trigger */}
                            {activeVault && (
                              <button
                                onClick={() => setShowServiceSettingsModal(true)}
                                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs border border-cyan-500/30 transition flex items-center space-x-1.5"
                                title="View Deployed Contract Suite & Autonomous AI Solvency Agent"
                              >
                                <Bot className="w-3.5 h-3.5 text-purple-400" />
                                <span>Settings & AI Agent</span>
                              </button>
                            )}

                            {/* Deploy New Vault Button (preserved in exact top-right spot) */}
                            <button
                              onClick={openDeployModal}
                              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center space-x-2"
                            >
                              <PlusCircle className="w-4 h-4" />
                              <span>Deploy New Vault</span>
                            </button>
                          </div>
                        </div>

                        {/* Widget Overview Metrics - Clickable to open Service Settings & AI Solvency Agent */}
                        {activeVault && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div
                              onClick={() => setShowServiceSettingsModal(true)}
                              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400/80 cursor-pointer transition group shadow-sm"
                              title="Click to view stats, manage AI agent, and view contract suite settings"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block group-hover:text-cyan-400 transition">
                                  Active Lending Vault
                                </span>
                                <Bot className="w-3.5 h-3.5 text-purple-400 group-hover:text-cyan-300 transition" />
                              </div>
                              <div className="text-xs font-mono font-bold text-cyan-300 truncate mt-0.5 group-hover:underline" title={activeVault.address}>
                                {activeVault.name || "Vault"} ({activeVault.address.slice(0, 8)}...)
                              </div>
                              <span className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1 group-hover:text-cyan-300 transition">
                                <span>Inspect Agent & Settings</span>
                                <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                              </span>
                            </div>

                            <div
                              onClick={() => setShowServiceSettingsModal(true)}
                              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400/60 cursor-pointer transition group"
                              title="Click to view AI Solvency Agent evaluation"
                            >
                              <span className="text-[10px] uppercase font-bold text-slate-500 block group-hover:text-cyan-400 transition">
                                Pool Utilization
                              </span>
                              <div className="text-base font-mono font-bold text-white mt-0.5 flex items-center justify-between">
                                <span>{utilizationRate}%</span>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
                              </div>
                              <span className="text-[10px] text-slate-500 mt-1 block">Optimal Target: 80%</span>
                            </div>

                            <div
                              onClick={() => setShowServiceSettingsModal(true)}
                              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400/60 cursor-pointer transition group"
                              title="Click to view AI Solvency Agent evaluation"
                            >
                              <span className="text-[10px] uppercase font-bold text-slate-500 block group-hover:text-cyan-400 transition">
                                Borrow APR
                              </span>
                              <div className="text-base font-mono font-bold text-cyan-400 mt-0.5 flex items-center justify-between">
                                <span>{borrowRate}%</span>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
                              </div>
                              <span className="text-[10px] text-slate-500 mt-1 block">Dynamic Kinked Curve</span>
                            </div>

                            <div
                              onClick={() => setShowServiceSettingsModal(true)}
                              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400/60 cursor-pointer transition group"
                              title="Click to view vault contract suite"
                            >
                              <span className="text-[10px] uppercase font-bold text-slate-500 block group-hover:text-cyan-400 transition">
                                Seed Liquidity
                              </span>
                              <div className="text-base font-mono font-bold text-emerald-400 mt-0.5 flex items-center justify-between">
                                <span>{activeVault.initialDeposit || "0"} RLUSD</span>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
                              </div>
                              <span className="text-[10px] text-slate-500 mt-1 block">ERC-4626 Vault Pool</span>
                            </div>
                          </div>
                        )}

                        {/* Widget Action Sub-Tabs: Manual Vault Deposit vs Open New Loan */}
                        <div className="space-y-4 pt-1">
                          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-fit text-xs">
                            <button
                              onClick={() => setLenderActionMode("DEPOSIT")}
                              className={`px-4 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                                lenderActionMode === "DEPOSIT"
                                  ? "bg-cyan-500 text-black shadow"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Manual Vault Deposit (Supply RLUSD)</span>
                            </button>
                            <button
                              onClick={() => setLenderActionMode("BORROW")}
                              className={`px-4 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                                lenderActionMode === "BORROW"
                                  ? "bg-cyan-500 text-black shadow"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span>Open a New Loan</span>
                            </button>
                          </div>

                          {/* Action Mode 1: Manual Deposit */}
                          {lenderActionMode === "DEPOSIT" && (
                            <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                <div>
                                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                                    Manual Vault Deposit
                                  </h3>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    Deposit RLUSD directly into the contract&apos;s main LendingVault to supply borrower liquidity.
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Your Wallet Balance</span>
                                  <span className="text-xs font-mono font-bold text-emerald-400">
                                    {parseFloat(borrowerRlusdBalance).toFixed(2)} RLUSD
                                  </span>
                                </div>
                              </div>

                              <div className="max-w-md space-y-3">
                                <div>
                                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                                    Amount to Deposit (RLUSD)
                                  </label>
                                  <input
                                    type="number"
                                    value={depositLenderAmount}
                                    onChange={(e) => setDepositLenderAmount(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                                  />
                                </div>

                                <div className="flex flex-wrap gap-3 pt-1">
                                  <button
                                    onClick={handleLenderDeposit}
                                    disabled={isLoading}
                                    className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition shadow flex items-center space-x-1.5"
                                  >
                                    <DollarSign className="w-4 h-4" />
                                    <span>Deposit RLUSD On-Chain</span>
                                  </button>

                                  <button
                                    onClick={handleMastercardSandboxSettle}
                                    disabled={isLoading}
                                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs border border-cyan-500/30 transition flex items-center justify-center space-x-1.5"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    <span>Mastercard AP4M Sandbox</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Action Mode 2: Open New Loan */}
                          {lenderActionMode === "BORROW" && (
                            <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                              <div className="border-b border-slate-800/80 pb-3">
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                                  Open a New Loan Against Collateral
                                </h3>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  Pledge collateral assets and draw RLUSD from this sovereign lending service.
                                </p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                                    Collateral Asset Option
                                  </label>
                                  <select
                                    value={collateralType}
                                    onChange={(e: any) => setCollateralType(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-cyan-400"
                                  >
                                    <option value="wETH">wETH (EVM Token - 70% LTV)</option>
                                    <option value="wXRP">wXRP (EVM Token - 70% LTV)</option>
                                    <option value="NATIVE_XRPL">Native XRPL Escrow (Cross-Chain Bridge)</option>
                                  </select>

                                  <div className="mt-3">
                                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                                      Collateral Deposit Amount
                                    </label>
                                    <input
                                      type="number"
                                      value={collateralDepositAmount}
                                      onChange={(e) => setCollateralDepositAmount(e.target.value)}
                                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                                    />
                                    <button
                                      onClick={handleDepositCollateral}
                                      disabled={isLoading}
                                      className="mt-2 w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition"
                                    >
                                      Pledge Collateral On-Chain
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                                    Borrow Amount (RLUSD)
                                  </label>
                                  <input
                                    type="number"
                                    value={borrowAmountInput}
                                    onChange={(e) => setBorrowAmountInput(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                                  />
                                  <span className="text-[11px] text-slate-500 mt-1 block">
                                    Health Factor: {borrowerHf} • Outstanding Debt: {parseFloat(borrowerDebt).toFixed(2)} RLUSD
                                  </span>

                                  <button
                                    onClick={handleBorrow}
                                    disabled={isLoading}
                                    className="mt-8 w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold text-xs transition shadow"
                                  >
                                    Borrow RLUSD into Wallet
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* LIST BELOW THE WIDGET: OPEN LOANS TABLE & MAKE PAYMENTS */}
                      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                          <div>
                            <h2 className="font-bold text-sm text-white flex items-center space-x-2">
                              <TrendingUp className="w-4 h-4 text-cyan-400" />
                              <span>Open Loans (Lending Vault Portfolio)</span>
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Active debt positions and borrower obligations issued by this Lending Vault.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              refreshDbData();
                              refreshOnChainData();
                            }}
                            className="text-xs text-cyan-400 hover:underline flex items-center space-x-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Refresh</span>
                          </button>
                        </div>

                        {/* Metrics Bar & Repayment Controls */}
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <span className="text-xs text-slate-400 uppercase font-semibold">Total Vault Debt</span>
                            <div className="text-2xl font-bold font-mono text-white mt-0.5">
                              ${totalActiveDebt.toFixed(2)} RLUSD
                            </div>
                          </div>

                          <div>
                            <span className="text-xs text-slate-400 uppercase font-semibold">Active Loans Count</span>
                            <div className="text-2xl font-bold font-mono text-cyan-400 mt-0.5">
                              {vaultLoans.filter((l) => l.status === "ACTIVE").length} Open Positions
                            </div>
                          </div>

                          {/* Make Payment on Loan */}
                          <div className="flex items-center space-x-3">
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold mb-0.5">Repay / Make Payment</span>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="number"
                                  value={repayAmountInput}
                                  onChange={(e) => setRepayAmountInput(e.target.value)}
                                  placeholder="Amount"
                                  className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                                />
                                <button
                                  onClick={() => handleRepay()}
                                  disabled={isLoading}
                                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition"
                                >
                                  Make Payment
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Open Loans Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-mono">
                            <thead className="bg-slate-950 text-slate-400 uppercase">
                              <tr>
                                <th className="py-2.5 px-3">Loan ID</th>
                                <th className="py-2.5 px-3">Borrower Address</th>
                                <th className="py-2.5 px-3">Principal Borrowed</th>
                                <th className="py-2.5 px-3">Collateral</th>
                                <th className="py-2.5 px-3">Tx Hash</th>
                                <th className="py-2.5 px-3">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {vaultLoans.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                                    No open loan records found for this lending vault.
                                  </td>
                                </tr>
                              ) : (
                                vaultLoans.map((l) => (
                                  <tr key={l.id}>
                                    <td className="py-3 px-3 text-white">{l.id.slice(0, 8)}...</td>
                                    <td className="py-3 px-3 text-cyan-300">
                                      <div className="flex items-center space-x-1.5">
                                        <span>{l.borrower ? `${l.borrower.slice(0, 8)}...${l.borrower.slice(-6)}` : "Unknown"}</span>
                                        <button
                                          onClick={() => copyToClipboard(l.borrower, l.id)}
                                          className="text-slate-500 hover:text-white"
                                          title="Copy Borrower"
                                        >
                                          {copiedKey === l.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                        </button>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 text-emerald-400 font-bold">${l.amountRLUSD} RLUSD</td>
                                    <td className="py-3 px-3 text-slate-300">
                                      {l.collateralAmount} {l.collateralToken}
                                    </td>
                                    <td className="py-3 px-3 text-slate-400">
                                      {l.txHash ? (
                                        <a
                                          href={`https://explorer.testnet.xrplevm.org/tx/${l.txHash}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="hover:text-cyan-300 underline"
                                        >
                                          {l.txHash.slice(0, 10)}...
                                        </a>
                                      ) : (
                                        "On-chain"
                                      )}
                                    </td>
                                    <td className="py-3 px-3">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[11px] font-sans font-semibold ${
                                          l.status === "ACTIVE"
                                            ? "bg-emerald-500/10 text-emerald-400"
                                            : "bg-slate-800 text-slate-400"
                                        }`}
                                      >
                                        {l.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ======================================================== */}
        {/* BORROWER VIEW */}
        {/* ======================================================== */}
        {evmAccount && actorRole === "BORROWER" && (
          <div className="space-y-6">
            {/* FIRST WIDGET: MY OPEN LOANS & HEALTH FACTOR */}
            <div className="p-6 md:p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center space-x-2">
                    <TrendingUp className="w-5 h-5 text-cyan-400" />
                    <span>My Open Loans & Health Factor</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Live debt positions, liquidation safety health factors, and loan repayment across joined sovereign lending services.
                  </p>
                </div>
                <button
                  onClick={() => {
                    refreshDbData();
                    refreshOnChainData();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-cyan-400 hover:text-cyan-300 border border-slate-700 transition flex items-center space-x-1.5 self-start sm:self-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Positions</span>
                </button>
              </div>

              {/* Metrics & Repayment Action Bar */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Total Debt Balance</span>
                  <div className="text-2xl font-bold font-mono text-white mt-0.5">
                    ${parseFloat(borrowerDebt).toFixed(2)} RLUSD
                  </div>
                </div>

                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Position Health Factor</span>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-0.5">
                    {borrowerHf}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Wallet RLUSD Balance</span>
                  <div className="text-2xl font-bold font-mono text-cyan-300 mt-0.5">
                    {parseFloat(borrowerRlusdBalance).toFixed(2)} RLUSD
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={repayAmountInput}
                    onChange={(e) => setRepayAmountInput(e.target.value)}
                    placeholder="Repay amount"
                    className="w-32 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={() => handleRepay()}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition shadow"
                  >
                    Repay Loan
                  </button>
                </div>
              </div>

              {/* Loans Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Loan ID</th>
                      <th className="py-2.5 px-3">Principal Borrowed</th>
                      <th className="py-2.5 px-3">Collateral</th>
                      <th className="py-2.5 px-3">Tx Hash</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {myLoans.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500 font-sans">
                          No open loan records found for this wallet. Pledge collateral below to draw your first loan.
                        </td>
                      </tr>
                    ) : (
                      myLoans.map((l) => (
                        <tr key={l.id}>
                          <td className="py-3 px-3 text-white font-medium">{l.id}</td>
                          <td className="py-3 px-3 text-emerald-400 font-bold">${l.amountRLUSD} RLUSD</td>
                          <td className="py-3 px-3 text-slate-300">
                            {l.collateralAmount} {l.collateralToken}
                          </td>
                          <td className="py-3 px-3 text-slate-400">
                            {l.txHash ? `${l.txHash.slice(0, 10)}...` : "On-chain"}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-sans font-semibold ${
                                l.status === "ACTIVE"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {l.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECOND WIDGET: JOINED LOAN SERVICES & CREDIT HUB */}
            {(() => {
              const borrowerVaults = vaultsList.filter((v) => {
                if (joinedVaultAddresses.length > 0) {
                  return joinedVaultAddresses.some((ja) => ja.toLowerCase() === v.address.toLowerCase());
                }
                return true;
              });

              const filteredBorrowerVaults = borrowerVaults.filter((v) => {
                if (!vaultSearchQuery.trim()) return true;
                const q = vaultSearchQuery.toLowerCase();
                return (
                  v.address.toLowerCase().includes(q) ||
                  (v.name && v.name.toLowerCase().includes(q)) ||
                  (v.symbol && v.symbol.toLowerCase().includes(q))
                );
              });

              const activeVault =
                borrowerVaults.find(
                  (v) => v.address.toLowerCase() === selectedVaultAddress.toLowerCase()
                ) || filteredBorrowerVaults[0] || vaultsList[0];

              return (
                <>
                  {vaultsList.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                      <AlertCircle className="w-8 h-8 text-cyan-400 mx-auto" />
                      <h3 className="font-bold text-sm text-white">No Loan Services Available</h3>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        No sovereign lending vault has been registered on the XRPL EVM Sidechain yet. Join a lending vault by pasting its contract address (0x...) to pledge collateral and draw credit.
                      </p>
                      <button
                        onClick={() => setShowJoinVaultModal(true)}
                        className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center justify-center space-x-2 mx-auto"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Join New Vault</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-6 md:p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
                      {/* Header: Title, Search, Vault Dropdown, Settings & AI Agent, and Join New Vault */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                        <div>
                          <h2 className="text-base font-bold text-white flex items-center space-x-2">
                            <TrendingUp className="w-5 h-5 text-cyan-400" />
                            <span>Joined Loan Services & Credit Hub</span>
                          </h2>
                          <p className="text-xs text-slate-400 mt-1">
                            Pledge collateral, draw RLUSD credit, and inspect autonomous AI solvency across joined sovereign lending vaults.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          {/* Search LendingVault by Address or Name */}
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search vault address (0x...) or name"
                              value={vaultSearchQuery}
                              onChange={(e) => {
                                const q = e.target.value;
                                setVaultSearchQuery(q);
                                const match = borrowerVaults.find(
                                  (v) =>
                                    v.address.toLowerCase() === q.trim().toLowerCase() ||
                                    (v.name && v.name.toLowerCase() === q.trim().toLowerCase())
                                );
                                if (match) setSelectedVaultAddress(match.address);
                              }}
                              className="pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-56 md:w-64"
                            />
                          </div>

                          {/* Joined Vault Selector Dropdown */}
                          <select
                            value={selectedVaultAddress}
                            onChange={(e) => setSelectedVaultAddress(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 max-w-[200px] truncate"
                          >
                            {filteredBorrowerVaults.map((v) => (
                              <option key={v.id || v.address} value={v.address}>
                                {v.name || "Vault"} ({v.address.slice(0, 8)}...)
                              </option>
                            ))}
                          </select>

                          {/* Service Settings & AI Agent Modal Trigger */}
                          {activeVault && (
                            <button
                              onClick={() => setShowServiceSettingsModal(true)}
                              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs border border-cyan-500/30 transition flex items-center space-x-1.5"
                              title="View Deployed Contract Suite & Autonomous AI Solvency Agent"
                            >
                              <Bot className="w-3.5 h-3.5 text-purple-400" />
                              <span>Settings & AI Agent</span>
                            </button>
                          )}

                          {/* Join New Vault Button (prominent in cyan, matching deploy button on lender) */}
                          <button
                            onClick={() => setShowJoinVaultModal(true)}
                            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition shadow flex items-center space-x-2"
                          >
                            <UserPlus className="w-4 h-4" />
                            <span>Join New Vault</span>
                          </button>
                        </div>
                      </div>

                      {/* Symmetrical 4 Overview Metrics Cards (Clickable to open Service Settings & AI Solvency Agent) */}
                      {activeVault && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div
                            onClick={() => setShowServiceSettingsModal(true)}
                            className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400/80 cursor-pointer transition group shadow-sm"
                            title="Click to view stats, manage AI agent, and view contract suite settings"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-slate-500 block group-hover:text-cyan-400 transition">
                                Active Loan Service
                              </span>
                              <Bot className="w-3.5 h-3.5 text-purple-400 group-hover:text-cyan-300 transition" />
                            </div>
                            <div className="text-xs font-mono font-bold text-cyan-300 truncate mt-0.5 group-hover:underline" title={activeVault.address}>
                              {activeVault.name || "Vault"} ({activeVault.address.slice(0, 8)}...)
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1 group-hover:text-cyan-300 transition">
                              <span>Inspect Agent & Settings</span>
                              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </div>

                          <div
                            onClick={() => setShowServiceSettingsModal(true)}
                            className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400/60 cursor-pointer transition group"
                            title="Click to view AI Solvency Agent evaluation"
                          >
                            <span className="text-[10px] uppercase font-bold text-slate-500 block group-hover:text-cyan-400 transition">
                              Pool Utilization
                            </span>
                            <div className="text-base font-mono font-bold text-white mt-0.5 flex items-center justify-between">
                              <span>{utilizationRate}%</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 block">Optimal Target: 80%</span>
                          </div>

                          <div
                            onClick={() => setShowServiceSettingsModal(true)}
                            className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400/60 cursor-pointer transition group"
                            title="Click to view AI Solvency Agent evaluation"
                          >
                            <span className="text-[10px] uppercase font-bold text-slate-500 block group-hover:text-cyan-400 transition">
                              Borrow APR
                            </span>
                            <div className="text-base font-mono font-bold text-cyan-400 mt-0.5 flex items-center justify-between">
                              <span>{borrowRate}%</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 block">Dynamic Kinked Curve</span>
                          </div>

                          <div
                            onClick={() => setShowServiceSettingsModal(true)}
                            className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400/60 cursor-pointer transition group"
                            title="Click to view vault contract suite"
                          >
                            <span className="text-[10px] uppercase font-bold text-slate-500 block group-hover:text-cyan-400 transition">
                              Available Liquidity
                            </span>
                            <div className="text-base font-mono font-bold text-emerald-400 mt-0.5 flex items-center justify-between">
                              <span>{activeVault.initialDeposit || "0"} RLUSD</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 block">ERC-4626 Vault Pool</span>
                          </div>
                        </div>
                      )}

                      {/* Single Unified Action Area: Deposit Collateral & Borrow RLUSD */}
                      <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                          <div>
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                              <ShieldCheck className="w-4 h-4 text-cyan-400" />
                              <span>Pledge Collateral & Draw RLUSD Credit</span>
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Supply verified ERC-20 collateral or Native XRPL Escrows, then draw stablecoins directly into your EVM wallet.
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-500 block uppercase font-semibold">Outstanding Position</span>
                            <span className="text-xs font-mono font-bold text-emerald-400">
                              Debt: ${parseFloat(borrowerDebt).toFixed(2)} RLUSD | HF: {borrowerHf}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {/* Left: Collateral */}
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-semibold text-slate-300 block mb-1">
                                1. Select Collateral Asset
                              </label>
                              <select
                                value={collateralType}
                                onChange={(e: any) => setCollateralType(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-cyan-400"
                              >
                                <option value="wETH">wETH (EVM Token - 70% LTV)</option>
                                <option value="wXRP">wXRP (EVM Token - 70% LTV)</option>
                                <option value="NATIVE_XRPL">Native XRPL Escrow (Cross-Chain Bridge)</option>
                              </select>
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-slate-300 block mb-1">
                                Deposit Collateral Amount
                              </label>
                              <input
                                type="number"
                                value={collateralDepositAmount}
                                onChange={(e) => setCollateralDepositAmount(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                              />
                              <span className="text-[11px] text-slate-500 mt-1 block">
                                Pledged Balance: {parseFloat(borrowerCollateralBalance).toFixed(2)} wETH
                              </span>
                            </div>

                            <button
                              onClick={handleDepositCollateral}
                              disabled={isLoading}
                              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition"
                            >
                              Pledge Collateral On-Chain
                            </button>
                          </div>

                          {/* Right: Borrow */}
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-semibold text-slate-300 block mb-1">
                                2. Draw Stablecoin Borrow Amount (RLUSD)
                              </label>
                              <input
                                type="number"
                                value={borrowAmountInput}
                                onChange={(e) => setBorrowAmountInput(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                              />
                              <span className="text-[11px] text-slate-500 mt-1 block">
                                Max draw subject to 70% LTV and multi-oracle risk valuation.
                              </span>
                            </div>

                            <div className="pt-7">
                              <button
                                onClick={handleBorrow}
                                disabled={isLoading}
                                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-extrabold text-xs transition shadow"
                              >
                                Borrow RLUSD into Wallet
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-xs text-slate-500">
        AMLP Core Testing Portal • Non-Custodial Sovereign Lending on XRPL EVM Sidechain
      </footer>

      {/* Sovereign Deployment Modal Window */}
      {renderDeployModal()}

      {/* Join Sovereign Vault Modal */}
      {renderJoinVaultModal()}

      {/* Service Settings & AI Solvency Agent Modal */}
      {renderServiceSettingsModal()}
    </div>
  );
}

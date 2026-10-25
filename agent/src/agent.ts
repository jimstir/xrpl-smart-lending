import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { GeminiRiskAdvisor } from "./gemini";
import { MastercardAP4MService } from "./mastercard";
import { LoanSurveillanceService } from "./surveillance";
import { PrioritizationQueueManager, BorrowRequest } from "./queue";

dotenv.config();

export class AILendingAgentDaemon {
  private advisor: GeminiRiskAdvisor;
  private queueManager: PrioritizationQueueManager;
  private surveillance: LoanSurveillanceService | null = null;
  private ap4mService: MastercardAP4MService | null = null;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private deployedAddresses: any = null;

  constructor() {
    this.advisor = new GeminiRiskAdvisor();
    this.queueManager = new PrioritizationQueueManager();

    const rpcUrl = process.env.XRPL_EVM_RPC || "http://127.0.0.1:8545";
    const privateKey =
      process.env.DEPLOYER_PRIVATE_KEY ||
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);

    this.loadDeployedAddresses();
  }

  private loadDeployedAddresses() {
    const deploymentPath = path.join(__dirname, "../../deployed-addresses.json");
    if (fs.existsSync(deploymentPath)) {
      this.deployedAddresses = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
      console.log("[AILendingAgent] Loaded deployed contract addresses.");

      const c = this.deployedAddresses.contracts;
      this.surveillance = new LoanSurveillanceService(
        c.RiskEngine,
        c.LiquidationManager,
        c.LendingVault,
        this.wallet
      );

      this.ap4mService = new MastercardAP4MService(
        this.wallet.privateKey,
        c.FiatOnRampGateway,
        parseInt(this.deployedAddresses.chainId || "31337")
      );
    } else {
      console.warn("[AILendingAgent] deployed-addresses.json not found. Run deployment script first.");
    }
  }

  /**
   * Run single execution cycle of all agent responsibilities.
   */
  async runCycle() {
    console.log(`\n==================================================`);
    console.log(`[AILendingAgent] Running Cycle @ ${new Date().toISOString()}`);
    console.log(`==================================================`);

    // 1. Vault Health Evaluation & Proposal Generation
    console.log("[AILendingAgent] Evaluating Vault Health with Gemini Risk Engine...");
    const sampleVaultState = {
      utilizationRateBps: 8400, // 84%
      totalAssetsUSD: 100000,
      activeDebtUSD: 84000,
      availableCashUSD: 16000,
      currentMode: "ModeBKinkedCurve",
      currentRateBps: 520,
      benchmarkYieldBps: 510,
    };

    const proposal = await this.advisor.evaluateVaultHealth(sampleVaultState);
    console.log(`[AILendingAgent Proposal Dispatched]`);
    console.log(`- Type: ${proposal.proposalType}`);
    console.log(`- Action: ${proposal.recommendedAction}`);
    console.log(`- Rationale: ${proposal.rationale}`);
    console.log(`- Confidence: ${(proposal.confidenceScore * 100).toFixed(1)}%`);

    // 2. Prioritization Queue Evaluation (Regime B)
    console.log("\n[AILendingAgent] Evaluating Regime B Borrow Queue...");
    const incomingRequests: BorrowRequest[] = [
      {
        applicant: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        requestedAmountUSD: 15000,
        collateralValueUSD: 30000,
        ltvBps: 5000,
        collateralType: "NATIVE_XRPL_ESCROW",
        repaymentHistoryCount: 5,
        submissionTimestamp: Date.now(),
      },
      {
        applicant: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        requestedAmountUSD: 28000,
        collateralValueUSD: 56000,
        ltvBps: 5000,
        collateralType: "EVM_ERC20",
        repaymentHistoryCount: 1,
        submissionTimestamp: Date.now(),
      },
    ];

    const allocations = this.queueManager.processQueue(incomingRequests, 16000, 3000);
    for (const alloc of allocations) {
      console.log(
        `- Applicant: ${alloc.applicant.slice(0, 8)}... | Requested: $${alloc.originalRequestedUSD} | Allocated: $${alloc.allocatedAmountUSD} | Score: ${alloc.priorityScore} | Reason: ${alloc.allocationReason}`
      );
    }

    // 3. AP4M x402 Mastercard Voucher Readiness
    if (this.ap4mService) {
      console.log("\n[AILendingAgent] Mastercard AP4M x402 Engine Ready.");
      console.log(`- Signer Address: ${this.ap4mService.signerAddress}`);
    }

    console.log(`==================================================\n`);
  }
}

// Direct execution entrypoint
if (require.main === module) {
  const daemon = new AILendingAgentDaemon();
  daemon.runCycle().catch(console.error);
}

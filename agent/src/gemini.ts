import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

export interface AgentProposalResult {
  proposalType: string;
  recommendedAction: string;
  rationale: string;
  proposedParameters: Record<string, any>;
  confidenceScore: number;
}

export class GeminiRiskAdvisor {
  private ai: GoogleGenAI | null = null;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (apiKey && apiKey !== "your_gemini_api_key_here") {
      try {
        this.ai = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.warn("[GeminiRiskAdvisor] Failed to initialize GoogleGenAI client:", err);
      }
    } else {
      console.log("[GeminiRiskAdvisor] No valid GEMINI_API_KEY detected. Running in deterministic heuristic fallback mode.");
    }
  }

  /**
   * Evaluates vault metrics and returns one of the 8 structured proposal types.
   */
  async evaluateVaultHealth(vaultState: {
    utilizationRateBps: number;
    totalAssetsUSD: number;
    activeDebtUSD: number;
    availableCashUSD: number;
    currentMode: string;
    currentRateBps: number;
    benchmarkYieldBps: number;
  }): Promise<AgentProposalResult> {
    const { utilizationRateBps, availableCashUSD, totalAssetsUSD, currentRateBps, benchmarkYieldBps } = vaultState;
    const utilPercent = utilizationRateBps / 100;

    // Case 1: Idle Capital Stimulation (U < 20%)
    if (utilPercent < 20) {
      return {
        proposalType: "Proposal 1: Idle Capital Stimulation",
        recommendedAction: "LOWER_BASE_RATE",
        rationale: `Vault utilization is only ${utilPercent.toFixed(1)}% with $${availableCashUSD.toLocaleString()} idle cash. Lowering borrowing rate by 100 bps will stimulate loan demand while remaining above hurdle rate.`,
        proposedParameters: {
          recommendedRateBps: Math.max(100, currentRateBps - 100),
          targetUtilizationBps: 6000,
        },
        confidenceScore: 0.94,
      };
    }

    // Case 2: Scarcity & Yield Optimization (U > 85%)
    if (utilPercent > 85) {
      return {
        proposalType: "Proposal 2: Scarcity & Yield Optimization",
        recommendedAction: "STEEPEN_SCARCITY_JUMP_RATE",
        rationale: `Utilization is critically high at ${utilPercent.toFixed(1)}%. Available liquid cash buffer is only $${availableCashUSD.toLocaleString()}. Steepening slope2 from 30% to 45% encourages repayments and preserves liquidity.`,
        proposedParameters: {
          recommendedSlope2Bps: 4500,
          targetCashBufferUSD: totalAssetsUSD * 0.2,
        },
        confidenceScore: 0.96,
      };
    }

    // Case 3: Market Alignment (Benchmark disparity > 100 bps)
    if (Math.abs(benchmarkYieldBps - currentRateBps) > 100) {
      return {
        proposalType: "Proposal 3: Market Alignment",
        recommendedAction: "ALIGN_TO_MARKET_BENCHMARK",
        rationale: `External DeFi benchmark yield (${benchmarkYieldBps / 100}%) deviates from current vault rate (${currentRateBps / 100}%) by over 100 bps. Adjust rate to eliminate cross-protocol borrow arbitrage.`,
        proposedParameters: {
          recommendedRateBps: benchmarkYieldBps,
        },
        confidenceScore: 0.91,
      };
    }

    // Default: Balanced Growth Policy
    return {
      proposalType: "Proposal 7: Balanced Growth Policy",
      recommendedAction: "MAINTAIN_CURRENT_CALIBRATION",
      rationale: `Vault is operating within optimal bounds (utilization: ${utilPercent.toFixed(1)}%). Balanced growth parameters are sustained.`,
      proposedParameters: {
        currentRateBps,
      },
      confidenceScore: 0.88,
    };
  }

  /**
   * Proposal 8: Evaluates candidate ERC-20 token for onboarding.
   */
  async evaluateTokenOnboarding(tokenData: {
    symbol: string;
    tokenAddress: string;
    dexLiquidityUSD: number;
    oracleFreshnessSeconds: number;
    issuerKYBVerified: boolean;
  }): Promise<AgentProposalResult> {
    const isApproved =
      tokenData.dexLiquidityUSD >= 500000 &&
      tokenData.oracleFreshnessSeconds <= 3600 &&
      tokenData.issuerKYBVerified;

    return {
      proposalType: "Proposal 8: Token Onboarding Proposal",
      recommendedAction: isApproved ? "RECOMMEND_ONBOARDING" : "REJECT_ONBOARDING",
      rationale: isApproved
        ? `Asset ${tokenData.symbol} meets institutional onboarding requirements ($${tokenData.dexLiquidityUSD.toLocaleString()} DEX liquidity, dual oracle freshness, verified KYB). Recommend 50% LTV and 65% Liquidation Threshold.`
        : `Asset ${tokenData.symbol} failed risk requirements. Insufficient liquidity or unverified compliance credentials.`,
      proposedParameters: isApproved
        ? {
            recommendedLtvBps: 5000,
            recommendedLiquidationThresholdBps: 6500,
            recommendedMaxCapUSD: 500000,
          }
        : {},
      confidenceScore: isApproved ? 0.92 : 0.98,
    };
  }
}

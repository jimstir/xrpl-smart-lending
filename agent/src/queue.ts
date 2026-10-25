export interface BorrowRequest {
  applicant: string;
  requestedAmountUSD: number;
  collateralValueUSD: number;
  ltvBps: number;
  collateralType: "NATIVE_XRPL_ESCROW" | "EVM_ERC20" | "FIAT_ONRAMP";
  repaymentHistoryCount: number;
  submissionTimestamp: number;
}

export interface PrioritizedAllocation {
  applicant: string;
  originalRequestedUSD: number;
  allocatedAmountUSD: number;
  priorityScore: number;
  allocationReason: string;
}

export class PrioritizationQueueManager {
  /**
   * Evaluates applicants under Regime B (liquidity constrained) and allocates cash fairly.
   */
  processQueue(
    requests: BorrowRequest[],
    availableCashUSD: number,
    reserveBufferUSD: number = 5000
  ): PrioritizedAllocation[] {
    const unreservedCash = Math.max(0, availableCashUSD - reserveBufferUSD);
    const scoredApplicants: { request: BorrowRequest; score: number; reason: string }[] = [];

    for (const req of requests) {
      let score = 100;
      const reasons: string[] = [];

      // 1. Collateral Safety Cushion (+ bonus for conservative LTV)
      if (req.ltvBps <= 5000) {
        score += 25;
        reasons.push("Conservative LTV cushion (+25)");
      } else if (req.ltvBps > 6500) {
        score -= 15;
        reasons.push("High LTV risk (-15)");
      }

      // 2. Collateral Provenance Defense Check
      if (req.collateralType === "NATIVE_XRPL_ESCROW") {
        score += 20;
        reasons.push("Irrevocable Native XRPL Escrow (+20)");
      } else if (req.collateralType === "FIAT_ONRAMP") {
        score -= 20;
        reasons.push("Provenance Defense: Unseasoned Card/Fiat Deposit (-20)");
      }

      // 3. Historical Track Record
      score += Math.min(25, req.repaymentHistoryCount * 5);
      if (req.repaymentHistoryCount > 0) {
        reasons.push(`Verified repayment track record (+${req.repaymentHistoryCount * 5})`);
      }

      // 4. Anti-Gaming Concentration Penalty
      const consumptionRatio = req.requestedAmountUSD / (availableCashUSD || 1);
      if (consumptionRatio > 0.25) {
        const penalty = Math.round(consumptionRatio * 60);
        score -= penalty;
        reasons.push(`Concentration Penalty: Request consumes ${(consumptionRatio * 100).toFixed(1)}% of vault cash (-${penalty})`);
      }

      scoredApplicants.push({ request: req, score, reason: reasons.join("; ") });
    }

    // Sort descending by priority score
    scoredApplicants.sort((a, b) => b.score - a.score);

    let remainingCash = unreservedCash;
    const allocations: PrioritizedAllocation[] = [];

    for (const item of scoredApplicants) {
      if (remainingCash <= 0) {
        allocations.push({
          applicant: item.request.applicant,
          originalRequestedUSD: item.request.requestedAmountUSD,
          allocatedAmountUSD: 0,
          priorityScore: item.score,
          allocationReason: "Rationed: Liquidity exhausted by higher priority applicants",
        });
        continue;
      }

      // Cap allocation to remaining cash
      const allocated = Math.min(item.request.requestedAmountUSD, remainingCash);
      remainingCash -= allocated;

      allocations.push({
        applicant: item.request.applicant,
        originalRequestedUSD: item.request.requestedAmountUSD,
        allocatedAmountUSD: allocated,
        priorityScore: item.score,
        allocationReason: item.reason,
      });
    }

    return allocations;
  }
}

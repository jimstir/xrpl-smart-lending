import { ethers } from "ethers";

export interface BorrowerHealthSnapshot {
  borrower: string;
  totalDebtUSD: number;
  totalCollateralUSD: number;
  healthFactor: number;
  zone: "HEALTHY" | "WARNING" | "LIQUIDATABLE";
  timestamp: number;
}

export interface LiquidationIntent {
  borrower: string;
  collateralToken: string;
  maxDebtToCoverUSD: number;
  closeFactorPercent: number;
  projectedBonusUSD: number;
}

export class LoanSurveillanceService {
  private riskEngineContract: any;
  private liquidationManagerContract: any;
  private lendingVaultContract: any;
  private signer: any;

  constructor(
    riskEngineAddress: string,
    liquidationManagerAddress: string,
    lendingVaultAddress: string,
    signer: any
  ) {
    this.signer = signer;

    const riskEngineAbi = [
      "function calculateHealthFactor(address borrower) external view returns (uint256)",
      "function calculateAccountValues(address borrower) external view returns (uint256, uint256, uint256)",
      "function isLiquidatable(address borrower) external view returns (bool, uint256)",
    ];

    const liqManagerAbi = [
      "function liquidate(address borrower, address collateralToken, uint256 maxDebtToCover) external returns (uint256, uint256)",
    ];

    const lendingVaultAbi = [
      "function getBorrowerDebt(address borrower) external view returns (uint256 principal, uint256 totalDebt)",
    ];

    this.riskEngineContract = new ethers.Contract(riskEngineAddress, riskEngineAbi, signer);
    this.liquidationManagerContract = new ethers.Contract(liquidationManagerAddress, liqManagerAbi, signer);
    this.lendingVaultContract = new ethers.Contract(lendingVaultAddress, lendingVaultAbi, signer);
  }

  /**
   * Evaluates a borrower position and returns real-time risk snapshot.
   */
  async evaluateBorrower(borrowerAddress: string): Promise<BorrowerHealthSnapshot> {
    const rawHf = await this.riskEngineContract.calculateHealthFactor(borrowerAddress);
    const [, rawTotalDebt] = await this.lendingVaultContract.getBorrowerDebt(borrowerAddress);
    const [rawCollateral] = await this.riskEngineContract.calculateAccountValues(borrowerAddress);

    const healthFactor = Number(ethers.formatEther(rawHf));
    const totalDebtUSD = Number(ethers.formatEther(rawTotalDebt));
    const totalCollateralUSD = Number(ethers.formatEther(rawCollateral));

    let zone: "HEALTHY" | "WARNING" | "LIQUIDATABLE" = "HEALTHY";
    if (healthFactor < 1.0) {
      zone = "LIQUIDATABLE";
    } else if (healthFactor < 1.05) {
      zone = "WARNING";
    }

    return {
      borrower: borrowerAddress,
      totalDebtUSD,
      totalCollateralUSD,
      healthFactor,
      zone,
      timestamp: Date.now(),
    };
  }

  /**
   * Pre-simulates and executes autonomous liquidation when Hf < 1.00.
   */
  async executeAutonomousLiquidation(
    borrowerAddress: string,
    collateralTokenAddress: string
  ): Promise<LiquidationIntent | null> {
    const snapshot = await this.evaluateBorrower(borrowerAddress);
    if (snapshot.zone !== "LIQUIDATABLE") {
      return null;
    }

    // Close factor: 100% if Hf < 0.90, else 50%
    const isDeepDefault = snapshot.healthFactor < 0.90;
    const closeFactor = isDeepDefault ? 1.0 : 0.5;
    const debtToCover = snapshot.totalDebtUSD * closeFactor;
    const projectedBonusUSD = debtToCover * 0.05; // 5% bonus

    const debtToCoverWei = ethers.parseEther(debtToCover.toFixed(6));

    console.log(
      `[LoanSurveillance] Executing Autonomous Liquidation for ${borrowerAddress}. Hf: ${snapshot.healthFactor.toFixed(
        4
      )}, Debt: $${debtToCover.toFixed(2)}, Bonus: $${projectedBonusUSD.toFixed(2)}`
    );

    try {
      const tx = await this.liquidationManagerContract.liquidate(
        borrowerAddress,
        collateralTokenAddress,
        debtToCoverWei
      );
      await tx.wait();
      console.log(`[LoanSurveillance] Liquidation confirmed on-chain. TxHash: ${tx.hash}`);
    } catch (err) {
      console.error(`[LoanSurveillance] Autonomous liquidation transaction failed:`, err);
    }

    return {
      borrower: borrowerAddress,
      collateralToken: collateralTokenAddress,
      maxDebtToCoverUSD: debtToCover,
      closeFactorPercent: closeFactor * 100,
      projectedBonusUSD,
    };
  }
}

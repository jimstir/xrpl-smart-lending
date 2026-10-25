import { expect } from "chai";
import { ethers } from "hardhat";
import {
  LendingVault,
  ProtocolReserveVault,
  CollateralVault,
  RiskEngine,
  PriceOracleAdapter,
  LiquidationManager,
  MockERC20,
} from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Protocol Scenarios (docs/test-cases.md)", function () {
  let rlusd: MockERC20;
  let weth: MockERC20;
  let wxrp: MockERC20;
  let reserveVault: ProtocolReserveVault;
  let collateralVault: CollateralVault;
  let riskEngine: RiskEngine;
  let oracle: PriceOracleAdapter;
  let lendingVault: LendingVault;
  let liquidationManager: LiquidationManager;

  let owner: any;
  let lenderA: any;
  let lenderB: any;
  let lenderC: any;
  let borrower1: any;
  let borrower2: any;
  let userA: any;
  let userB: any;
  let userC: any;
  let userD: any;
  let liquidator: any;

  beforeEach(async function () {
    [
      owner,
      lenderA,
      lenderB,
      lenderC,
      borrower1,
      borrower2,
      userA,
      userB,
      userC,
      userD,
      liquidator,
    ] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    rlusd = (await MockToken.deploy("Ripple USD", "RLUSD", 18)) as MockERC20;
    weth = (await MockToken.deploy("Wrapped Ether", "wETH", 18)) as MockERC20;
    wxrp = (await MockToken.deploy("Wrapped XRP", "wXRP", 18)) as MockERC20;

    const ReserveFactory = await ethers.getContractFactory("ProtocolReserveVault");
    reserveVault = (await ReserveFactory.deploy(await rlusd.getAddress())) as ProtocolReserveVault;

    const CollateralFactory = await ethers.getContractFactory("CollateralVault");
    collateralVault = (await CollateralFactory.deploy()) as CollateralVault;

    const OracleFactory = await ethers.getContractFactory("PriceOracleAdapter");
    oracle = (await OracleFactory.deploy(3600, true, true)) as PriceOracleAdapter;
    await oracle.setDirectPrice(await rlusd.getAddress(), ethers.parseUnits("1", 8));   // $1.00
    await oracle.setDirectPrice(await weth.getAddress(), ethers.parseUnits("2000", 8)); // $2,000
    await oracle.setDirectPrice(await wxrp.getAddress(), ethers.parseUnits("1", 8));    // $1.00

    const RiskFactory = await ethers.getContractFactory("RiskEngine");
    riskEngine = (await RiskFactory.deploy()) as RiskEngine;

    const VaultFactory = await ethers.getContractFactory("LendingVault");
    lendingVault = (await VaultFactory.deploy(
      await rlusd.getAddress(),
      await reserveVault.getAddress()
    )) as LendingVault;

    const LiqFactory = await ethers.getContractFactory("LiquidationManager");
    liquidationManager = (await LiqFactory.deploy()) as LiquidationManager;

    // Protocol Wiring
    await reserveVault.setAuthorizedCallers(await lendingVault.getAddress(), await liquidationManager.getAddress());
    await collateralVault.setProtocolAddresses(
      await riskEngine.getAddress(),
      await liquidationManager.getAddress(),
      owner.address
    );
    await riskEngine.setProtocolAddresses(
      await oracle.getAddress(),
      await collateralVault.getAddress(),
      await lendingVault.getAddress()
    );
    await lendingVault.setProtocolAddresses(
      await riskEngine.getAddress(),
      await liquidationManager.getAddress(),
      owner.address
    );
    await liquidationManager.setProtocolAddresses(
      await lendingVault.getAddress(),
      await collateralVault.getAddress(),
      await riskEngine.getAddress(),
      await oracle.getAddress(),
      await reserveVault.getAddress()
    );

    // Collateral Setup: 70% LTV, 80% Liq Threshold
    await riskEngine.configureCollateral(await weth.getAddress(), 7000, 8000, 18);
    await riskEngine.configureCollateral(await wxrp.getAddress(), 7000, 8000, 18);
  });

  describe("Scenario L-01: Vault Accepting Normal Requests", function () {
    it("should disburse loan instantaneously when U < 75% without queueing", async function () {
      // 1. Lender A supplies 100,000 RLUSD
      await rlusd.mint(lenderA.address, ethers.parseEther("100000"));
      await rlusd.connect(lenderA).approve(await lendingVault.getAddress(), ethers.parseEther("100000"));
      await lendingVault.connect(lenderA).deposit(ethers.parseEther("100000"), lenderA.address);

      // Borrower deposits $20,000 wETH (10 wETH @ $2000)
      await weth.mint(borrower1.address, ethers.parseEther("10"));
      await weth.connect(borrower1).approve(await collateralVault.getAddress(), ethers.parseEther("10"));
      await collateralVault.connect(borrower1).depositCollateral(await weth.getAddress(), ethers.parseEther("10"));

      // 2. Borrower requests 10,000 RLUSD (50% of borrow capacity)
      const borrowAmount = ethers.parseEther("10000");
      await lendingVault.connect(borrower1).borrow(borrowAmount);

      // Verify instantaneous disbursement
      expect(await rlusd.balanceOf(borrower1.address)).to.equal(borrowAmount);
      // Utilization = 10,000 / 100,000 = 10% (well below 75% threshold)
      expect(await lendingVault.getUtilizationRate()).to.equal(1000); // 1000 bps = 10%
    });
  });

  describe("Scenario L-02: Vault with Scarcity of Funds (Low Cash Buffer)", function () {
    it("should detect utilization >= 75% and prevent excessive drawdowns", async function () {
      // 1. Lender B supplies 50,000 RLUSD
      await rlusd.mint(lenderB.address, ethers.parseEther("50000"));
      await rlusd.connect(lenderB).approve(await lendingVault.getAddress(), ethers.parseEther("50000"));
      await lendingVault.connect(lenderB).deposit(ethers.parseEther("50000"), lenderB.address);

      // Borrower 1 deposits collateral and borrows 42,000 RLUSD (U = 84%)
      await weth.mint(borrower1.address, ethers.parseEther("40")); // $80,000 collateral
      await weth.connect(borrower1).approve(await collateralVault.getAddress(), ethers.parseEther("40"));
      await collateralVault.connect(borrower1).depositCollateral(await weth.getAddress(), ethers.parseEther("40"));
      await lendingVault.connect(borrower1).borrow(ethers.parseEther("42000"));

      // Available liquid cash is 8,000 RLUSD. Utilization is 84% (8400 bps)
      expect(await lendingVault.getUtilizationRate()).to.equal(8400);

      // Whale borrower requests 9,000 RLUSD (exceeds total vault cash)
      await weth.mint(borrower2.address, ethers.parseEther("20"));
      await weth.connect(borrower2).approve(await collateralVault.getAddress(), ethers.parseEther("20"));
      await collateralVault.connect(borrower2).depositCollateral(await weth.getAddress(), ethers.parseEther("20"));

      await expect(
        lendingVault.connect(borrower2).borrow(ethers.parseEther("9000"))
      ).to.be.revertedWithCustomError(lendingVault, "InsufficientVaultLiquidity");
    });
  });

  describe("Scenario L-03: Vault with Surplus Idle Funds", function () {
    it("should allow owner to stimulate borrowing by adjusting rates downward", async function () {
      // 1. Lender C supplies 500,000 RLUSD
      await rlusd.mint(lenderC.address, ethers.parseEther("500000"));
      await rlusd.connect(lenderC).approve(await lendingVault.getAddress(), ethers.parseEther("500000"));
      await lendingVault.connect(lenderC).deposit(ethers.parseEther("500000"), lenderC.address);

      // Borrower draws 50,000 RLUSD (U = 10%)
      await weth.mint(borrower1.address, ethers.parseEther("50"));
      await weth.connect(borrower1).approve(await collateralVault.getAddress(), ethers.parseEther("50"));
      await collateralVault.connect(borrower1).depositCollateral(await weth.getAddress(), ethers.parseEther("50"));
      await lendingVault.connect(borrower1).borrow(ethers.parseEther("50000"));

      expect(await lendingVault.getUtilizationRate()).to.equal(1000); // 10%

      // Owner executes rate reduction proposal (lowering base rate to 1% = 100 bps)
      await lendingVault.setKinkedCurveMode(100, 8000, 300, 2000);
      expect(await lendingVault.getBorrowRate()).to.be.lt(200);
    });
  });

  describe("Scenario B-01: Borrower with a Good Loan", function () {
    it("should execute complete healthy lifecycle: borrow, accrue, withdraw excess, repay", async function () {
      // Setup liquidity
      await rlusd.mint(lenderA.address, ethers.parseEther("100000"));
      await rlusd.connect(lenderA).approve(await lendingVault.getAddress(), ethers.parseEther("100000"));
      await lendingVault.connect(lenderA).deposit(ethers.parseEther("100000"), lenderA.address);

      // 1. Borrower deposits $20,000 wETH (10 wETH @ $2000)
      await weth.mint(borrower1.address, ethers.parseEther("10"));
      await weth.connect(borrower1).approve(await collateralVault.getAddress(), ethers.parseEther("10"));
      await collateralVault.connect(borrower1).depositCollateral(await weth.getAddress(), ethers.parseEther("10"));

      // Draw 7,000 RLUSD (Hf = (20,000 * 0.80) / 7,000 = 2.28)
      await lendingVault.connect(borrower1).borrow(ethers.parseEther("7000"));
      const hfBefore = await riskEngine.calculateHealthFactor(borrower1.address);
      expect(hfBefore).to.be.gt(ethers.parseEther("2.28"));

      // 2. Interest accrues over 30 days
      await time.increase(30 * 86400);
      await lendingVault.accrueInterest();

      // 3. Withdraw excess collateral: 2.5 wETH ($5,000)
      // Remaining collateral: $15,000 -> Projected Hf = ($15,000 * 0.80) / ~7020 = ~1.70 >= 1.05
      await collateralVault.connect(borrower1).withdrawCollateral(await weth.getAddress(), ethers.parseEther("2.5"));
      expect(await collateralVault.getUserCollateral(borrower1.address, await weth.getAddress())).to.equal(ethers.parseEther("7.5"));

      // 4. Repay full debt
      await rlusd.mint(borrower1.address, ethers.parseEther("10000"));
      await rlusd.connect(borrower1).approve(await lendingVault.getAddress(), ethers.parseEther("10000"));
      await lendingVault.connect(borrower1).repay(ethers.parseEther("10000"));

      const [, remainingDebt] = await lendingVault.getBorrowerDebt(borrower1.address);
      expect(remainingDebt).to.equal(0);
    });
  });

  describe("Scenario B-02: Borrower with a Bad Loan & Liquidation", function () {
    it("should handle price drop, warning state, and autonomous liquidation", async function () {
      // Setup liquidity
      await rlusd.mint(lenderA.address, ethers.parseEther("100000"));
      await rlusd.connect(lenderA).approve(await lendingVault.getAddress(), ethers.parseEther("100000"));
      await lendingVault.connect(lenderA).deposit(ethers.parseEther("100000"), lenderA.address);

      // Pledges 10,000 wXRP @ $1.00 = $10,000 collateral
      await wxrp.mint(borrower2.address, ethers.parseEther("10000"));
      await wxrp.connect(borrower2).approve(await collateralVault.getAddress(), ethers.parseEther("10000"));
      await collateralVault.connect(borrower2).depositCollateral(await wxrp.getAddress(), ethers.parseEther("10000"));

      // Borrows 7,000 RLUSD (Hf = 1.142)
      await lendingVault.connect(borrower2).borrow(ethers.parseEther("7000"));

      // Step 1: Price drops to $0.90 -> Collateral = $9,000 -> Hf = (9000 * 0.80) / 7000 = 1.028 (Warning Zone)
      await oracle.setDirectPrice(await wxrp.getAddress(), ethers.parseUnits("0.90", 8));
      const hfWarning = await riskEngine.calculateHealthFactor(borrower2.address);
      expect(hfWarning).to.be.lt(ethers.parseEther("1.05"));
      expect(hfWarning).to.be.gt(ethers.parseEther("1.00"));

      // In warning zone, withdrawal is blocked
      const [canWithdraw] = await riskEngine.validateWithdrawal(borrower2.address, await wxrp.getAddress(), ethers.parseEther("100"));
      expect(canWithdraw).to.be.false;

      // Step 2: Severe price drop to $0.80 -> Collateral = $8,000 -> Hf = (8000 * 0.80) / 7000 = 0.914 (< 1.00)
      await oracle.setDirectPrice(await wxrp.getAddress(), ethers.parseUnits("0.80", 8));
      const [isLiq, hfDefault] = await riskEngine.isLiquidatable(borrower2.address);
      expect(isLiq).to.be.true;
      expect(hfDefault).to.be.lt(ethers.parseEther("1.00"));

      // Step 3: Liquidator repays 50% of debt (3,500 RLUSD)
      await rlusd.mint(liquidator.address, ethers.parseEther("10000"));
      await rlusd.connect(liquidator).approve(await liquidationManager.getAddress(), ethers.parseEther("10000"));
      await liquidationManager.connect(liquidator).liquidate(borrower2.address, await wxrp.getAddress(), ethers.parseEther("3500"));

      // Liquidator received wXRP with 5% bonus: $3500 * 1.05 / 0.80 = 4,593.75 wXRP
      const liquidatorWxrp = await wxrp.balanceOf(liquidator.address);
      expect(liquidatorWxrp).to.be.gt(ethers.parseEther("4500"));
    });
  });

  describe("Scenario B-03: Multi-User Concurrent Requests under Abundant Funds", function () {
    it("should fulfill 4 concurrent borrowers in parallel when cash is plentiful", async function () {
      // 1. Vault supplied with 200,000 RLUSD
      await rlusd.mint(lenderA.address, ethers.parseEther("200000"));
      await rlusd.connect(lenderA).approve(await lendingVault.getAddress(), ethers.parseEther("200000"));
      await lendingVault.connect(lenderA).deposit(ethers.parseEther("200000"), lenderA.address);

      const users = [userA, userB, userC, userD];
      for (const u of users) {
        // Each pledges 15 wETH ($30,000 collateral)
        await weth.mint(u.address, ethers.parseEther("15"));
        await weth.connect(u).approve(await collateralVault.getAddress(), ethers.parseEther("15"));
        await collateralVault.connect(u).depositCollateral(await weth.getAddress(), ethers.parseEther("15"));

        // Each borrows 15,000 RLUSD (Total = 60,000 RLUSD)
        await lendingVault.connect(u).borrow(ethers.parseEther("15000"));
        expect(await rlusd.balanceOf(u.address)).to.equal(ethers.parseEther("15000"));
      }

      // Total borrowed = 60,000, cash = 140,000 -> U = 60,000 / 200,000 = 30% < 75%
      expect(await lendingVault.getUtilizationRate()).to.equal(3000); // 30%
    });
  });

  describe("Scenario B-04: Multi-User Requests under Constrained Funds", function () {
    it("should restrict direct excessive originations and allow agent allocation", async function () {
      // Vault has 30,000 RLUSD total cash
      await rlusd.mint(lenderB.address, ethers.parseEther("30000"));
      await rlusd.connect(lenderB).approve(await lendingVault.getAddress(), ethers.parseEther("30000"));
      await lendingVault.connect(lenderB).deposit(ethers.parseEther("30000"), lenderB.address);

      // User A and User B deposit collateral
      await weth.mint(userA.address, ethers.parseEther("20"));
      await weth.connect(userA).approve(await collateralVault.getAddress(), ethers.parseEther("20"));
      await collateralVault.connect(userA).depositCollateral(await weth.getAddress(), ethers.parseEther("20"));

      await weth.mint(userB.address, ethers.parseEther("20"));
      await weth.connect(userB).approve(await collateralVault.getAddress(), ethers.parseEther("20"));
      await collateralVault.connect(userB).depositCollateral(await weth.getAddress(), ethers.parseEther("20"));

      // Agent executes allocated originations:
      // User A allocated 15,000 RLUSD
      await lendingVault.executeBorrowAllocation(userA.address, ethers.parseEther("15000"));
      expect(await rlusd.balanceOf(userA.address)).to.equal(ethers.parseEther("15000"));

      // User B allocated 10,000 RLUSD (preserving 5,000 RLUSD cash buffer)
      await lendingVault.executeBorrowAllocation(userB.address, ethers.parseEther("10000"));
      expect(await rlusd.balanceOf(userB.address)).to.equal(ethers.parseEther("10000"));

      // Whale attempt for 10,000 fails due to insufficient liquidity
      await weth.mint(userC.address, ethers.parseEther("20"));
      await weth.connect(userC).approve(await collateralVault.getAddress(), ethers.parseEther("20"));
      await collateralVault.connect(userC).depositCollateral(await weth.getAddress(), ethers.parseEther("20"));

      await expect(
        lendingVault.connect(userC).borrow(ethers.parseEther("10000"))
      ).to.be.revertedWithCustomError(lendingVault, "InsufficientVaultLiquidity");
    });
  });
});

import { expect } from "chai";
import { ethers } from "hardhat";
import {
  LendingVault,
  ProtocolReserveVault,
  CollateralVault,
  RiskEngine,
  PriceOracleAdapter,
  LiquidationManager,
  TokenVerificationGate,
  MockERC20,
} from "../typechain-types";

describe("AI Agent Proposals & Autonomous Liquidation (Matrix 4)", function () {
  let rlusd: MockERC20;
  let weth: MockERC20;
  let candidateToken: MockERC20;
  let reserveVault: ProtocolReserveVault;
  let collateralVault: CollateralVault;
  let riskEngine: RiskEngine;
  let oracle: PriceOracleAdapter;
  let lendingVault: LendingVault;
  let liquidationManager: LiquidationManager;
  let verificationGate: TokenVerificationGate;

  let owner: any;
  let agent: any;
  let borrower: any;

  beforeEach(async function () {
    [owner, agent, borrower] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    rlusd = (await MockToken.deploy("Ripple USD", "RLUSD", 18)) as MockERC20;
    weth = (await MockToken.deploy("Wrapped Ether", "wETH", 18)) as MockERC20;
    candidateToken = (await MockToken.deploy("Candidate DeFi Asset", "CAD", 18)) as MockERC20;

    const ReserveFactory = await ethers.getContractFactory("ProtocolReserveVault");
    reserveVault = (await ReserveFactory.deploy(await rlusd.getAddress())) as ProtocolReserveVault;

    const CollateralFactory = await ethers.getContractFactory("CollateralVault");
    collateralVault = (await CollateralFactory.deploy()) as CollateralVault;

    const OracleFactory = await ethers.getContractFactory("PriceOracleAdapter");
    oracle = (await OracleFactory.deploy(3600, true, true)) as PriceOracleAdapter;
    await oracle.setDirectPrice(await rlusd.getAddress(), ethers.parseUnits("1", 8));
    await oracle.setDirectPrice(await weth.getAddress(), ethers.parseUnits("2000", 8));
    await oracle.setDirectPrice(await candidateToken.getAddress(), ethers.parseUnits("10", 8));

    const RiskFactory = await ethers.getContractFactory("RiskEngine");
    riskEngine = (await RiskFactory.deploy()) as RiskEngine;

    const VaultFactory = await ethers.getContractFactory("LendingVault");
    lendingVault = (await VaultFactory.deploy(
      await rlusd.getAddress(),
      await reserveVault.getAddress()
    )) as LendingVault;

    const LiqFactory = await ethers.getContractFactory("LiquidationManager");
    liquidationManager = (await LiqFactory.deploy()) as LiquidationManager;

    const GateFactory = await ethers.getContractFactory("TokenVerificationGate");
    verificationGate = (await GateFactory.deploy()) as TokenVerificationGate;

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
      agent.address
    );
    await liquidationManager.setProtocolAddresses(
      await lendingVault.getAddress(),
      await collateralVault.getAddress(),
      await riskEngine.getAddress(),
      await oracle.getAddress(),
      await reserveVault.getAddress()
    );

    await riskEngine.configureCollateral(await weth.getAddress(), 7000, 8000, 18);

    // Initial Vault Liquidity
    await rlusd.mint(owner.address, ethers.parseEther("100000"));
    await rlusd.connect(owner).approve(await lendingVault.getAddress(), ethers.parseEther("100000"));
    await lendingVault.connect(owner).deposit(ethers.parseEther("100000"), owner.address);
  });

  it("Proposal 1: Idle Capital Stimulation - Owner executes agent proposed rate reduction", async function () {
    // Current rate mode is Mode B with base rate 200 bps
    // Owner executes rate reduction to 150 bps base rate to stimulate idle liquidity
    await lendingVault.connect(owner).setKinkedCurveMode(150, 8000, 350, 2500);
    expect(await lendingVault.getBorrowRate()).to.be.lte(200);
  });

  it("Proposal 2: Scarcity & Yield Optimization - Owner steepens jump rate upon high utilization", async function () {
    // Owner executes steepening jump rate to 4500 bps to protect liquidity
    await lendingVault.connect(owner).setKinkedCurveMode(300, 8000, 500, 4500);
    const curve = await lendingVault.curveParams();
    expect(curve.slope2Bps).to.equal(4500);
  });

  it("Proposal 3: Market Alignment - Owner switches to Fixed Mode aligned with benchmark", async function () {
    // External benchmark rose by 150 bps -> Agent proposes Mode A 7.5% (750 bps)
    await lendingVault.connect(owner).setFixedRateMode(750);
    expect(await lendingVault.rateMode()).to.equal(0);
    expect(await lendingVault.fixedRateBps()).to.equal(750);
  });

  it("Proposal 4: Capital Distribution Policy - Agent executes prioritized batch allocations", async function () {
    // Borrower has collateral
    await weth.mint(borrower.address, ethers.parseEther("10"));
    await weth.connect(borrower).approve(await collateralVault.getAddress(), ethers.parseEther("10"));
    await collateralVault.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("10"));

    // Agent executes bounded allocation for borrower
    await lendingVault.connect(agent).executeBorrowAllocation(borrower.address, ethers.parseEther("5000"));
    expect(await rlusd.balanceOf(borrower.address)).to.equal(ethers.parseEther("5000"));
  });

  it("Proposal 5: Volatility Buffer Policy - Owner caps accepted LTV at 45% during volatility", async function () {
    // Reconfigure wETH collateral LTV to 4500 bps (45%)
    await riskEngine.connect(owner).configureCollateral(await weth.getAddress(), 4500, 6500, 18);
    const config = await riskEngine.collateralConfigs(await weth.getAddress());
    expect(config.ltvBps).to.equal(4500);
    expect(config.liquidationThresholdBps).to.equal(6500);
  });

  it("Proposal 6: Provenance Defense Policy - Verification gate restricts unverified tokens", async function () {
    expect(await verificationGate.isTokenCompliant(await candidateToken.getAddress())).to.be.false;
  });

  it("Proposal 7: Balanced Growth Policy - Rate optimization under stable market conditions", async function () {
    await lendingVault.connect(owner).setKinkedCurveMode(250, 8000, 400, 3000);
    const curve = await lendingVault.curveParams();
    expect(curve.baseRateBps).to.equal(250);
  });

  it("Proposal 8: Token Onboarding Proposal - Agent evaluates, Owner manually verifies & configures", async function () {
    // 1. Compliance verification
    await verificationGate.connect(owner).setTokenCompliance(
      await candidateToken.getAddress(),
      true,
      "TIER_B_DEFI",
      ethers.parseEther("500000")
    );
    expect(await verificationGate.isTokenCompliant(await candidateToken.getAddress())).to.be.true;

    // 2. Owner configures in RiskEngine
    await riskEngine.connect(owner).configureCollateral(await candidateToken.getAddress(), 5000, 6500, 18);
    expect(await riskEngine.isAllowedCollateral(await candidateToken.getAddress())).to.be.true;
  });

  it("Autonomous Liquidation Execution - Liquidator or Agent executes liquidation upon breach", async function () {
    // Borrower deposits 5 wETH ($10,000) and borrows 7,000 RLUSD
    await weth.mint(borrower.address, ethers.parseEther("5"));
    await weth.connect(borrower).approve(await collateralVault.getAddress(), ethers.parseEther("5"));
    await collateralVault.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("5"));
    await lendingVault.connect(borrower).borrow(ethers.parseEther("7000"));

    // Drop wETH price to $1,600 -> Collateral = $8,000 -> Liq threshold = $6,400 -> Hf = 6400 / 7000 = 0.914 (< 1.00)
    await oracle.setDirectPrice(await weth.getAddress(), ethers.parseUnits("1600", 8));

    // Agent executes autonomous liquidation (agent has RLUSD)
    await rlusd.mint(agent.address, ethers.parseEther("10000"));
    await rlusd.connect(agent).approve(await liquidationManager.getAddress(), ethers.parseEther("10000"));

    await expect(
      liquidationManager.connect(agent).liquidate(borrower.address, await weth.getAddress(), ethers.parseEther("3500"))
    ).to.emit(liquidationManager, "LiquidationExecuted");
  });
});

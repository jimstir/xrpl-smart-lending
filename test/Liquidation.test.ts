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

describe("LiquidationManager Unit Tests", function () {
  let rlusd: MockERC20;
  let wxrp: MockERC20;
  let reserveVault: ProtocolReserveVault;
  let collateralVault: CollateralVault;
  let riskEngine: RiskEngine;
  let oracle: PriceOracleAdapter;
  let lendingVault: LendingVault;
  let liquidationManager: LiquidationManager;

  let owner: any;
  let lender: any;
  let borrower: any;
  let liquidator: any;

  beforeEach(async function () {
    [owner, lender, borrower, liquidator] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    rlusd = (await MockToken.deploy("Ripple USD", "RLUSD", 18)) as MockERC20;
    wxrp = (await MockToken.deploy("Wrapped XRP", "wXRP", 18)) as MockERC20;

    const ReserveFactory = await ethers.getContractFactory("ProtocolReserveVault");
    reserveVault = (await ReserveFactory.deploy(await rlusd.getAddress())) as ProtocolReserveVault;

    const CollateralFactory = await ethers.getContractFactory("CollateralVault");
    collateralVault = (await CollateralFactory.deploy()) as CollateralVault;

    const OracleFactory = await ethers.getContractFactory("PriceOracleAdapter");
    oracle = (await OracleFactory.deploy(3600, true, true)) as PriceOracleAdapter;
    // Initial XRP price = $1.00
    await oracle.setDirectPrice(await wxrp.getAddress(), ethers.parseUnits("1", 8));
    await oracle.setDirectPrice(await rlusd.getAddress(), ethers.parseUnits("1", 8));

    const RiskFactory = await ethers.getContractFactory("RiskEngine");
    riskEngine = (await RiskFactory.deploy()) as RiskEngine;

    const VaultFactory = await ethers.getContractFactory("LendingVault");
    lendingVault = (await VaultFactory.deploy(
      await rlusd.getAddress(),
      await reserveVault.getAddress()
    )) as LendingVault;

    const LiqFactory = await ethers.getContractFactory("LiquidationManager");
    liquidationManager = (await LiqFactory.deploy()) as LiquidationManager;

    // Wire protocol addresses
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

    // Configure wXRP: 70% LTV, 80% liquidation threshold
    await riskEngine.configureCollateral(await wxrp.getAddress(), 7000, 8000, 18);

    // Fund lender and deposit into vault
    await rlusd.mint(lender.address, ethers.parseEther("100000"));
    await rlusd.connect(lender).approve(await lendingVault.getAddress(), ethers.parseEther("100000"));
    await lendingVault.connect(lender).deposit(ethers.parseEther("100000"), lender.address);

    // Fund borrower: 10,000 wXRP ($10,000 value at $1.00)
    await wxrp.mint(borrower.address, ethers.parseEther("10000"));
    await wxrp.connect(borrower).approve(await collateralVault.getAddress(), ethers.parseEther("10000"));
    await collateralVault.connect(borrower).depositCollateral(await wxrp.getAddress(), ethers.parseEther("10000"));

    // Borrower draws 7,000 RLUSD (70% LTV, Hf = (10,000 * 0.80) / 7,000 = 1.142)
    await lendingVault.connect(borrower).borrow(ethers.parseEther("7000"));

    // Fund liquidator with RLUSD
    await rlusd.mint(liquidator.address, ethers.parseEther("50000"));
    await rlusd.connect(liquidator).approve(await liquidationManager.getAddress(), ethers.parseEther("50000"));
  });

  it("should revert liquidation when borrower is solvent (Hf >= 1.00)", async function () {
    await expect(
      liquidationManager.connect(liquidator).liquidate(borrower.address, await wxrp.getAddress(), ethers.parseEther("3500"))
    ).to.be.revertedWithCustomError(liquidationManager, "BorrowerSolvent");
  });

  it("should execute 50% close factor liquidation when 0.90 <= Hf < 1.00", async function () {
    // Drop XRP price to $0.85
    // Collateral value = $8,500
    // Liquidation threshold value = $8,500 * 0.80 = $6,800
    // Debt = $7,000 -> Hf = 6,800 / 7,000 = 0.9714 (< 1.00 and >= 0.90)
    await oracle.setDirectPrice(await wxrp.getAddress(), ethers.parseUnits("0.85", 8));

    const [isLiq, hf] = await riskEngine.isLiquidatable(borrower.address);
    expect(isLiq).to.be.true;
    expect(hf).to.be.lt(ethers.parseEther("1.0"));
    expect(hf).to.be.gt(ethers.parseEther("0.90"));

    // 50% close factor means max repayable = 3,500 RLUSD
    // Liquidator passes 5,000 RLUSD, contract caps it to 3,500 RLUSD
    const tx = await liquidationManager
      .connect(liquidator)
      .liquidate(borrower.address, await wxrp.getAddress(), ethers.parseEther("5000"));

    // Verify event
    await expect(tx).to.emit(liquidationManager, "LiquidationExecuted");

    // Check borrower remaining debt is close to 3,500 RLUSD (accounting for per-second interest)
    const [, remainingDebt] = await lendingVault.getBorrowerDebt(borrower.address);
    expect(remainingDebt).to.be.closeTo(ethers.parseEther("3500"), ethers.parseEther("0.01"));

    // Liquidator seized collateral value with 5% bonus:
    // 3,500 * 1.05 = $3,675
    // XRP price = $0.85 -> seized XRP = 3,675 / 0.85 = ~4,323.52 wXRP
    const liquidatorXrp = await wxrp.balanceOf(liquidator.address);
    expect(liquidatorXrp).to.be.gt(ethers.parseEther("4300"));
  });

  it("should execute 100% deep default liquidation when Hf < 0.90", async function () {
    // Drop XRP price to $0.70
    // Collateral value = $7,000
    // Liq threshold = $7,000 * 0.80 = $5,600
    // Debt = $7,000 -> Hf = 5,600 / 7,000 = 0.80 (< 0.90 deep default)
    await oracle.setDirectPrice(await wxrp.getAddress(), ethers.parseUnits("0.70", 8));

    const [isLiq, hf] = await riskEngine.isLiquidatable(borrower.address);
    expect(isLiq).to.be.true;
    expect(hf).to.be.lt(ethers.parseEther("0.90"));

    // Liquidator repays full debt (passing 10,000 to cover 100% plus any per-second interest)
    await liquidationManager
      .connect(liquidator)
      .liquidate(borrower.address, await wxrp.getAddress(), ethers.parseEther("10000"));

    const [, remainingDebt] = await lendingVault.getBorrowerDebt(borrower.address);
    expect(remainingDebt).to.equal(0);
  });
});

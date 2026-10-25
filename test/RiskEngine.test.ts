import { expect } from "chai";
import { ethers } from "hardhat";
import {
  LendingVault,
  ProtocolReserveVault,
  CollateralVault,
  RiskEngine,
  PriceOracleAdapter,
  MockERC20,
} from "../typechain-types";

describe("RiskEngine Unit Tests", function () {
  let rlusd: MockERC20;
  let weth: MockERC20;
  let reserveVault: ProtocolReserveVault;
  let collateralVault: CollateralVault;
  let riskEngine: RiskEngine;
  let oracle: PriceOracleAdapter;
  let lendingVault: LendingVault;

  let owner: any;
  let lender: any;
  let borrower: any;

  beforeEach(async function () {
    [owner, lender, borrower] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    rlusd = (await MockToken.deploy("Ripple USD", "RLUSD", 18)) as MockERC20;
    weth = (await MockToken.deploy("Wrapped Ether", "wETH", 18)) as MockERC20;

    const ReserveFactory = await ethers.getContractFactory("ProtocolReserveVault");
    reserveVault = (await ReserveFactory.deploy(await rlusd.getAddress())) as ProtocolReserveVault;

    const CollateralFactory = await ethers.getContractFactory("CollateralVault");
    collateralVault = (await CollateralFactory.deploy()) as CollateralVault;

    const OracleFactory = await ethers.getContractFactory("PriceOracleAdapter");
    oracle = (await OracleFactory.deploy(3600, true, true)) as PriceOracleAdapter;
    await oracle.setDirectPrice(await weth.getAddress(), ethers.parseUnits("2000", 8)); // $2,000 wETH
    await oracle.setDirectPrice(await rlusd.getAddress(), ethers.parseUnits("1", 8));   // $1.00 RLUSD

    const RiskFactory = await ethers.getContractFactory("RiskEngine");
    riskEngine = (await RiskFactory.deploy()) as RiskEngine;

    const VaultFactory = await ethers.getContractFactory("LendingVault");
    lendingVault = (await VaultFactory.deploy(
      await rlusd.getAddress(),
      await reserveVault.getAddress()
    )) as LendingVault;

    await reserveVault.setAuthorizedCallers(await lendingVault.getAddress(), owner.address);
    await collateralVault.setProtocolAddresses(await riskEngine.getAddress(), owner.address, owner.address);
    await riskEngine.setProtocolAddresses(
      await oracle.getAddress(),
      await collateralVault.getAddress(),
      await lendingVault.getAddress()
    );
    await lendingVault.setProtocolAddresses(
      await riskEngine.getAddress(),
      owner.address,
      owner.address
    );

    await riskEngine.configureCollateral(await weth.getAddress(), 7000, 8000, 18);

    // Provide liquidity to vault
    await rlusd.mint(lender.address, ethers.parseEther("100000"));
    await rlusd.connect(lender).approve(await lendingVault.getAddress(), ethers.parseEther("100000"));
    await lendingVault.connect(lender).deposit(ethers.parseEther("100000"), lender.address);

    // Mint collateral to borrower
    await weth.mint(borrower.address, ethers.parseEther("10"));
  });

  it("should calculate correct collateral USD value and borrow capacity", async function () {
    // 5 wETH @ $2000 = $10,000 USD
    await weth.connect(borrower).approve(await collateralVault.getAddress(), ethers.parseEther("5"));
    await collateralVault.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("5"));

    const [totalCollateralUSD, totalBorrowCapacityUSD, totalLiqThresholdUSD] =
      await riskEngine.calculateAccountValues(borrower.address);

    expect(totalCollateralUSD).to.equal(ethers.parseEther("10000"));
    // 70% LTV = $7,000 borrow capacity
    expect(totalBorrowCapacityUSD).to.equal(ethers.parseEther("7000"));
    // 80% liquidation threshold = $8,000 threshold
    expect(totalLiqThresholdUSD).to.equal(ethers.parseEther("8000"));
  });

  it("should enforce borrow limit and prevent borrowing over 70% LTV", async function () {
    await weth.connect(borrower).approve(await collateralVault.getAddress(), ethers.parseEther("5"));
    await collateralVault.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("5"));

    // Borrowing 7,000 RLUSD is allowed (exactly 70%)
    expect(await riskEngine.validateBorrow(borrower.address, ethers.parseEther("7000"))).to.be.true;

    // Borrowing 7,001 RLUSD is rejected (> 70% LTV)
    expect(await riskEngine.validateBorrow(borrower.address, ethers.parseEther("7001"))).to.be.false;

    await expect(
      lendingVault.connect(borrower).borrow(ethers.parseEther("7001"))
    ).to.be.revertedWithCustomError(lendingVault, "BorrowExceedsLtvLimit");
  });

  it("should enforce Hf >= 1.05 invariant on collateral withdrawal", async function () {
    // Borrower deposits 10 wETH ($20,000 collateral)
    await weth.connect(borrower).approve(await collateralVault.getAddress(), ethers.parseEther("10"));
    await collateralVault.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("10"));

    // Borrows 7,000 RLUSD
    await lendingVault.connect(borrower).borrow(ethers.parseEther("7000"));

    // Initial Hf = ($20,000 * 0.80) / 7,000 = 2.285e18
    const hf = await riskEngine.calculateHealthFactor(borrower.address);
    expect(hf).to.be.gt(ethers.parseEther("2.28"));

    // Attempting to withdraw 6 wETH ($12,000 deduction) -> remaining 4 wETH ($8,000)
    // Projected Liq Threshold = $8,000 * 0.80 = $6,400
    // Projected Hf = $6,400 / $7,000 = 0.914 < 1.05 -> Must be rejected!
    const [canWithdraw] = await riskEngine.validateWithdrawal(
      borrower.address,
      await weth.getAddress(),
      ethers.parseEther("6")
    );
    expect(canWithdraw).to.be.false;

    await expect(
      collateralVault.connect(borrower).withdrawCollateral(await weth.getAddress(), ethers.parseEther("6"))
    ).to.be.revertedWithCustomError(collateralVault, "SolvencyViolation");

    // Withdrawing 2.5 wETH ($5,000) leaves 7.5 wETH ($15,000)
    // Projected Liq Threshold = $15,000 * 0.80 = $12,000 -> Projected Hf = 12000 / 7000 = 1.71 >= 1.05 -> Allowed!
    await expect(
      collateralVault.connect(borrower).withdrawCollateral(await weth.getAddress(), ethers.parseEther("2.5"))
    ).to.emit(collateralVault, "CollateralWithdrawn");
  });
});

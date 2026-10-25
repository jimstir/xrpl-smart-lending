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
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("LendingVault Unit Tests", function () {
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

    // 1. Deploy tokens
    const MockToken = await ethers.getContractFactory("MockERC20");
    rlusd = (await MockToken.deploy("Ripple USD", "RLUSD", 18)) as MockERC20;
    weth = (await MockToken.deploy("Wrapped Ether", "wETH", 18)) as MockERC20;

    // 2. Deploy Reserve Vault
    const ReserveFactory = await ethers.getContractFactory("ProtocolReserveVault");
    reserveVault = (await ReserveFactory.deploy(await rlusd.getAddress())) as ProtocolReserveVault;

    // 3. Deploy Collateral Vault
    const CollateralFactory = await ethers.getContractFactory("CollateralVault");
    collateralVault = (await CollateralFactory.deploy()) as CollateralVault;

    // 4. Deploy Oracle (3600s delay, latestPriceMode=true, singleFeed=true)
    const OracleFactory = await ethers.getContractFactory("PriceOracleAdapter");
    oracle = (await OracleFactory.deploy(3600, true, true)) as PriceOracleAdapter;
    await oracle.setDirectPrice(await weth.getAddress(), ethers.parseUnits("2000", 8)); // $2,000 wETH
    await oracle.setDirectPrice(await rlusd.getAddress(), ethers.parseUnits("1", 8));   // $1.00 RLUSD

    // 5. Deploy Risk Engine
    const RiskFactory = await ethers.getContractFactory("RiskEngine");
    riskEngine = (await RiskFactory.deploy()) as RiskEngine;

    // 6. Deploy Lending Vault
    const VaultFactory = await ethers.getContractFactory("LendingVault");
    lendingVault = (await VaultFactory.deploy(
      await rlusd.getAddress(),
      await reserveVault.getAddress()
    )) as LendingVault;

    // 7. Wire protocol addresses
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

    // 8. Configure wETH collateral in RiskEngine (70% LTV, 80% Liq Threshold)
    await riskEngine.configureCollateral(await weth.getAddress(), 7000, 8000, 18);

    // Mint tokens
    await rlusd.mint(lender.address, ethers.parseEther("100000"));
    await weth.mint(borrower.address, ethers.parseEther("10"));
  });

  it("should allow lender to deposit RLUSD and receive amRLUSD shares", async function () {
    const depositAmount = ethers.parseEther("10000");
    await rlusd.connect(lender).approve(await lendingVault.getAddress(), depositAmount);
    await lendingVault.connect(lender).deposit(depositAmount, lender.address);

    const shares = await lendingVault.balanceOf(lender.address);
    expect(shares).to.equal(depositAmount);
    expect(await lendingVault.totalAssets()).to.equal(depositAmount);
  });

  it("should switch between Mode A Fixed APR and Mode B Kinked Curve", async function () {
    // Default is Mode B
    expect(await lendingVault.rateMode()).to.equal(1); // ModeBKinkedCurve

    // Switch to Mode A (Fixed 8% = 800 bps)
    await lendingVault.setFixedRateMode(800);
    expect(await lendingVault.rateMode()).to.equal(0); // ModeAFixed
    expect(await lendingVault.getBorrowRate()).to.equal(800);

    // Switch back to Mode B with custom kink curve
    await lendingVault.setKinkedCurveMode(300, 7500, 500, 2500);
    expect(await lendingVault.rateMode()).to.equal(1);
  });

  it("should accrue interest and allocate 10% reserve cut to ProtocolReserveVault", async function () {
    // 1. Lender deposits 100,000 RLUSD
    const depositAmount = ethers.parseEther("100000");
    await rlusd.connect(lender).approve(await lendingVault.getAddress(), depositAmount);
    await lendingVault.connect(lender).deposit(depositAmount, lender.address);

    // 2. Borrower deposits 5 wETH ($10,000) collateral
    await weth.connect(borrower).approve(await collateralVault.getAddress(), ethers.parseEther("5"));
    await collateralVault.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("5"));

    // 3. Set Fixed APR to 10% (1000 bps) for deterministic calculation
    await lendingVault.setFixedRateMode(1000);

    // 4. Borrower borrows 5,000 RLUSD
    const borrowAmount = ethers.parseEther("5000");
    await lendingVault.connect(borrower).borrow(borrowAmount);

    const initialDebt = (await lendingVault.getBorrowerDebt(borrower.address)).totalDebt;
    expect(initialDebt).to.equal(borrowAmount);

    // 5. Advance time by 1 year (31,536,000 seconds)
    await time.increase(31536000);

    // Accrue interest
    await lendingVault.accrueInterest();

    const updatedDebt = (await lendingVault.getBorrowerDebt(borrower.address)).totalDebt;
    // 5000 * 10% = 500 interest -> ~5500 total debt
    expect(updatedDebt).to.be.gt(borrowAmount);

    // 6. Borrower repays full debt
    await rlusd.mint(borrower.address, ethers.parseEther("2000")); // extra buffer
    await rlusd.connect(borrower).approve(await lendingVault.getAddress(), updatedDebt * 2n);
    await lendingVault.connect(borrower).repay(updatedDebt);

    // 7. Flush reserves and check ProtocolReserveVault balance
    await lendingVault.flushReserves();
    const reserveBalance = await reserveVault.getReserveBalance();
    expect(reserveBalance).to.be.gt(0);
  });
});

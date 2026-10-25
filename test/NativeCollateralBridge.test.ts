import { expect } from "chai";
import { ethers } from "hardhat";
import {
  CollateralVault,
  NativeCollateralBridge,
  MockERC20,
} from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("NativeCollateralBridge Unit Tests", function () {
  let virtualXrp: MockERC20;
  let collateralVault: CollateralVault;
  let bridge: NativeCollateralBridge;

  let owner: any;
  let axelarGateway: any;
  let borrower: any;

  beforeEach(async function () {
    [owner, axelarGateway, borrower] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    virtualXrp = (await MockToken.deploy("Virtual Native XRP", "vXRP", 18)) as MockERC20;

    const CollateralFactory = await ethers.getContractFactory("CollateralVault");
    collateralVault = (await CollateralFactory.deploy()) as CollateralVault;

    // Buffer: 300 seconds (5 mins for testnet), testnetHelperEnabled = true
    const BridgeFactory = await ethers.getContractFactory("NativeCollateralBridge");
    bridge = (await BridgeFactory.deploy(
      await collateralVault.getAddress(),
      axelarGateway.address,
      300,
      true
    )) as NativeCollateralBridge;

    await collateralVault.setProtocolAddresses(owner.address, owner.address, await bridge.getAddress());
  });

  it("should process Axelar GMP execute() and credit virtual collateral", async function () {
    const amount = ethers.parseEther("1000");
    const xrplTxHash = ethers.keccak256(ethers.toUtf8Bytes("xrpl_tx_hash_001"));
    const currentTime = await time.latest();
    const escrowExpiry = currentTime + 3600; // 1 hour out

    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint256", "bytes32", "uint256"],
      [borrower.address, await virtualXrp.getAddress(), amount, xrplTxHash, escrowExpiry]
    );

    await bridge.connect(axelarGateway).execute(
      ethers.ZeroHash,
      "xrpl-mainnet",
      "rNativeEscrowSourceAddress",
      payload
    );

    const balance = await collateralVault.getUserCollateral(borrower.address, await virtualXrp.getAddress());
    expect(balance).to.equal(amount);
  });

  it("should support authorized testnet helper mockAttestEscrow for instant verification", async function () {
    const amount = ethers.parseEther("5000");
    const xrplTxHash = ethers.keccak256(ethers.toUtf8Bytes("xrpl_tx_hash_testnet_002"));
    const currentTime = await time.latest();
    const escrowExpiry = currentTime + 600; // 10 minutes out

    await bridge.mockAttestEscrow(
      borrower.address,
      await virtualXrp.getAddress(),
      amount,
      xrplTxHash,
      escrowExpiry
    );

    const balance = await collateralVault.getUserCollateral(borrower.address, await virtualXrp.getAddress());
    expect(balance).to.equal(amount);
  });

  it("should prevent replay attacks with the same xrplTxHash", async function () {
    const amount = ethers.parseEther("1000");
    const xrplTxHash = ethers.keccak256(ethers.toUtf8Bytes("xrpl_replay_tx"));
    const currentTime = await time.latest();
    const escrowExpiry = currentTime + 1000;

    await bridge.mockAttestEscrow(
      borrower.address,
      await virtualXrp.getAddress(),
      amount,
      xrplTxHash,
      escrowExpiry
    );

    // Replay attempt must revert
    await expect(
      bridge.mockAttestEscrow(
        borrower.address,
        await virtualXrp.getAddress(),
        amount,
        xrplTxHash,
        escrowExpiry
      )
    ).to.be.revertedWithCustomError(bridge, "EscrowAlreadyProcessed");
  });

  it("should reject escrow if expiry is within escrowBufferSeconds lockout window", async function () {
    const amount = ethers.parseEther("1000");
    const xrplTxHash = ethers.keccak256(ethers.toUtf8Bytes("short_expiry_tx"));
    const currentTime = await time.latest();
    const shortExpiry = currentTime + 100; // Only 100s, buffer is 300s!

    await expect(
      bridge.mockAttestEscrow(
        borrower.address,
        await virtualXrp.getAddress(),
        amount,
        xrplTxHash,
        shortExpiry
      )
    ).to.be.revertedWithCustomError(bridge, "EscrowExpiryTooShort");
  });
});

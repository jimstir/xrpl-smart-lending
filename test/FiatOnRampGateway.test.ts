import { expect } from "chai";
import { ethers } from "hardhat";
import {
  LendingVault,
  ProtocolReserveVault,
  FiatOnRampGateway,
  MockERC20,
} from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("FiatOnRampGateway (Mastercard AP4M x402) Unit Tests", function () {
  let rlusd: MockERC20;
  let reserveVault: ProtocolReserveVault;
  let lendingVault: LendingVault;
  let gateway: FiatOnRampGateway;

  let owner: any;
  let mastercardSigner: any;
  let recipient: any;
  let settler: any;

  beforeEach(async function () {
    [owner, mastercardSigner, recipient, settler] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    rlusd = (await MockToken.deploy("Ripple USD", "RLUSD", 18)) as MockERC20;

    const ReserveFactory = await ethers.getContractFactory("ProtocolReserveVault");
    reserveVault = (await ReserveFactory.deploy(await rlusd.getAddress())) as ProtocolReserveVault;

    const VaultFactory = await ethers.getContractFactory("LendingVault");
    lendingVault = (await VaultFactory.deploy(
      await rlusd.getAddress(),
      await reserveVault.getAddress()
    )) as LendingVault;

    const GatewayFactory = await ethers.getContractFactory("FiatOnRampGateway");
    gateway = (await GatewayFactory.deploy(
      await rlusd.getAddress(),
      await lendingVault.getAddress(),
      mastercardSigner.address
    )) as FiatOnRampGateway;

    // Fund settler with RLUSD to fulfill on-ramp fiat conversions
    await rlusd.mint(settler.address, ethers.parseEther("100000"));
    await rlusd.connect(settler).approve(await gateway.getAddress(), ethers.parseEther("100000"));
  });

  async function createSignedVoucher(
    voucherId: string,
    recipientAddress: string,
    amount: bigint,
    validUntil: number,
    signer: any
  ) {
    const domain = {
      name: "MastercardAP4M_OnRamp",
      version: "1.0.0",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await gateway.getAddress(),
    };

    const types = {
      SettlementVoucher: [
        { name: "voucherId", type: "bytes32" },
        { name: "recipient", type: "address" },
        { name: "rlusdAmount", type: "uint256" },
        { name: "validUntil", type: "uint256" },
      ],
    };

    const value = {
      voucherId,
      recipient: recipientAddress,
      rlusdAmount: amount,
      validUntil,
    };

    const signature = await signer.signTypedData(domain, types, value);
    return { voucher: value, signature };
  }

  it("should settle fiat voucher and deposit directly into LendingVault for recipient", async function () {
    const voucherId = ethers.keccak256(ethers.toUtf8Bytes("voucher_001"));
    const amount = ethers.parseEther("5000");
    const currentTime = await time.latest();
    const validUntil = currentTime + 3600;

    const { voucher, signature } = await createSignedVoucher(
      voucherId,
      recipient.address,
      amount,
      validUntil,
      mastercardSigner
    );

    const tx = await gateway.connect(settler).executeFiatSettlement(voucher, signature);
    await expect(tx).to.emit(gateway, "FiatSettlementExecuted");

    // Recipient receives amRLUSD vault shares directly!
    const shares = await lendingVault.balanceOf(recipient.address);
    expect(shares).to.equal(amount);
  });

  it("should process parallel vouchers with distinct voucherIds in any order (non-blocking)", async function () {
    const currentTime = await time.latest();
    const validUntil = currentTime + 3600;

    const v1 = await createSignedVoucher(
      ethers.keccak256(ethers.toUtf8Bytes("voucher_A")),
      recipient.address,
      ethers.parseEther("1000"),
      validUntil,
      mastercardSigner
    );

    const v2 = await createSignedVoucher(
      ethers.keccak256(ethers.toUtf8Bytes("voucher_B")),
      recipient.address,
      ethers.parseEther("2000"),
      validUntil,
      mastercardSigner
    );

    // Execute v2 before v1 (out of sequence) -> succeeds without blocking!
    await gateway.connect(settler).executeFiatSettlement(v2.voucher, v2.signature);
    await gateway.connect(settler).executeFiatSettlement(v1.voucher, v1.signature);

    const shares = await lendingVault.balanceOf(recipient.address);
    expect(shares).to.equal(ethers.parseEther("3000"));
  });

  it("should reject replayed voucherId", async function () {
    const voucherId = ethers.keccak256(ethers.toUtf8Bytes("replay_voucher"));
    const currentTime = await time.latest();
    const validUntil = currentTime + 3600;

    const { voucher, signature } = await createSignedVoucher(
      voucherId,
      recipient.address,
      ethers.parseEther("1000"),
      validUntil,
      mastercardSigner
    );

    await gateway.connect(settler).executeFiatSettlement(voucher, signature);

    // Replay attempt must revert
    await expect(
      gateway.connect(settler).executeFiatSettlement(voucher, signature)
    ).to.be.revertedWithCustomError(gateway, "VoucherAlreadyExecuted");
  });

  it("should reject expired voucher", async function () {
    const voucherId = ethers.keccak256(ethers.toUtf8Bytes("expired_voucher"));
    const currentTime = await time.latest();
    const expiredTime = currentTime - 10;

    const { voucher, signature } = await createSignedVoucher(
      voucherId,
      recipient.address,
      ethers.parseEther("1000"),
      expiredTime,
      mastercardSigner
    );

    await expect(
      gateway.connect(settler).executeFiatSettlement(voucher, signature)
    ).to.be.revertedWithCustomError(gateway, "VoucherExpired");
  });

  it("should reject voucher signed by unauthorized signer", async function () {
    const voucherId = ethers.keccak256(ethers.toUtf8Bytes("unauthorized_signer_voucher"));
    const currentTime = await time.latest();
    const validUntil = currentTime + 3600;

    // Signed by settler instead of mastercardSigner
    const { voucher, signature } = await createSignedVoucher(
      voucherId,
      recipient.address,
      ethers.parseEther("1000"),
      validUntil,
      settler
    );

    await expect(
      gateway.connect(settler).executeFiatSettlement(voucher, signature)
    ).to.be.revertedWithCustomError(gateway, "InvalidVoucherSignature");
  });
});

import { ethers, Wallet } from "ethers";

export interface SettlementVoucher {
  voucherId: string;
  recipient: string;
  rlusdAmount: string; // in wei / 18 decimals string
  validUntil: number;
}

export interface SignedSettlementVoucher {
  voucher: SettlementVoucher;
  signature: string;
  digest: string;
}

export class MastercardAP4MService {
  private signerWallet: Wallet;
  private gatewayAddress: string;
  private chainId: number;

  constructor(signerPrivateKey: string, gatewayAddress: string, chainId: number = 1440002) {
    this.signerWallet = new Wallet(signerPrivateKey);
    this.gatewayAddress = gatewayAddress;
    this.chainId = chainId;
  }

  get signerAddress(): string {
    return this.signerWallet.address;
  }

  /**
   * Generates a unique, non-blocking AP4M x402 settlement voucher.
   */
  async createSignedVoucher(
    recipientAddress: string,
    amountRLUSD: bigint,
    validDurationSeconds: number = 3600
  ): Promise<SignedSettlementVoucher> {
    const voucherId = ethers.hexlify(ethers.randomBytes(32));
    const validUntil = Math.floor(Date.now() / 1000) + validDurationSeconds;

    const voucher: SettlementVoucher = {
      voucherId,
      recipient: recipientAddress,
      rlusdAmount: amountRLUSD.toString(),
      validUntil,
    };

    const domain = {
      name: "MastercardAP4M_OnRamp",
      version: "1.0.0",
      chainId: this.chainId,
      verifyingContract: this.gatewayAddress,
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
      voucherId: voucher.voucherId,
      recipient: voucher.recipient,
      rlusdAmount: BigInt(voucher.rlusdAmount),
      validUntil: voucher.validUntil,
    };

    const signature = await this.signerWallet.signTypedData(domain, types, value);
    const digest = ethers.TypedDataEncoder.hash(domain, types, value);

    return {
      voucher,
      signature,
      digest,
    };
  }

  /**
   * Verifies an EIP-712 settlement voucher signature.
   */
  verifyVoucher(voucher: SettlementVoucher, signature: string): boolean {
    const domain = {
      name: "MastercardAP4M_OnRamp",
      version: "1.0.0",
      chainId: this.chainId,
      verifyingContract: this.gatewayAddress,
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
      voucherId: voucher.voucherId,
      recipient: voucher.recipient,
      rlusdAmount: BigInt(voucher.rlusdAmount),
      validUntil: voucher.validUntil,
    };

    const recovered = ethers.verifyTypedData(domain, types, value, signature);
    return recovered.toLowerCase() === this.signerWallet.address.toLowerCase();
  }
}

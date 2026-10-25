// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/LendingVault.sol";

/**
 * @title FiatOnRampGateway
 * @notice Mastercard Agent Pay for Machines (AP4M) x402 on-ramp settlement contract.
 * Validates cryptographically signed payment vouchers from off-chain institutional rails (BVNK/Mastercard).
 *
 * Invariants:
 * - Uses unique bytes32 voucherId nonces to eliminate head-of-line blocking in parallel allocations
 * - Replay prevention via executedVouchers mapping
 * - Enforces locked destination to LendingVault.deposit() to prevent capital leakage
 */
contract FiatOnRampGateway is EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant VOUCHER_TYPEHASH = keccak256(
        "SettlementVoucher(bytes32 voucherId,address recipient,uint256 rlusdAmount,uint256 validUntil)"
    );

    struct SettlementVoucher {
        bytes32 voucherId;
        address recipient;
        uint256 rlusdAmount;
        uint256 validUntil;
    }

    IERC20 public immutable rlusd;
    LendingVault public immutable lendingVault;
    address public mastercardSigner;

    // voucherId => hasBeenExecuted
    mapping(bytes32 => bool) public executedVouchers;

    event MastercardSignerUpdated(address indexed newSigner);
    event FiatSettlementExecuted(
        bytes32 indexed voucherId,
        address indexed recipient,
        uint256 rlusdAmount,
        uint256 sharesMinted
    );

    error ZeroAddress();
    error ZeroAmount();
    error VoucherAlreadyExecuted(bytes32 voucherId);
    error VoucherExpired(uint256 validUntil, uint256 currentTime);
    error InvalidVoucherSignature();

    constructor(
        address _rlusd,
        address _lendingVault,
        address _mastercardSigner
    )
        EIP712("MastercardAP4M_OnRamp", "1.0.0")
        Ownable(msg.sender)
    {
        if (_rlusd == address(0) || _lendingVault == address(0) || _mastercardSigner == address(0)) {
            revert ZeroAddress();
        }
        rlusd = IERC20(_rlusd);
        lendingVault = LendingVault(payable(_lendingVault));
        mastercardSigner = _mastercardSigner;
    }

    function setMastercardSigner(address _newSigner) external onlyOwner {
        if (_newSigner == address(0)) revert ZeroAddress();
        mastercardSigner = _newSigner;
        emit MastercardSignerUpdated(_newSigner);
    }

    /**
     * @notice Settles fiat-funded liquidity into the lending vault via signed AP4M voucher.
     * @param voucher The settlement voucher containing unique voucherId, recipient, amount, expiry.
     * @param signature The EIP-712 cryptographic signature from the authorized Mastercard AP4M signer.
     */
    function executeFiatSettlement(
        SettlementVoucher calldata voucher,
        bytes calldata signature
    ) external nonReentrant returns (uint256 sharesMinted) {
        if (voucher.rlusdAmount == 0) revert ZeroAmount();
        if (voucher.recipient == address(0)) revert ZeroAddress();
        if (executedVouchers[voucher.voucherId]) revert VoucherAlreadyExecuted(voucher.voucherId);
        if (block.timestamp > voucher.validUntil) revert VoucherExpired(voucher.validUntil, block.timestamp);

        // Verify EIP-712 Signature
        bytes32 structHash = keccak256(
            abi.encode(
                VOUCHER_TYPEHASH,
                voucher.voucherId,
                voucher.recipient,
                voucher.rlusdAmount,
                voucher.validUntil
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(digest, signature);
        if (recoveredSigner != mastercardSigner) revert InvalidVoucherSignature();

        executedVouchers[voucher.voucherId] = true;

        // Pull RLUSD from caller/settler into this contract
        rlusd.safeTransferFrom(msg.sender, address(this), voucher.rlusdAmount);

        // Approve LendingVault and deposit directly on behalf of recipient
        rlusd.forceApprove(address(lendingVault), voucher.rlusdAmount);
        sharesMinted = lendingVault.deposit(voucher.rlusdAmount, voucher.recipient);

        emit FiatSettlementExecuted(
            voucher.voucherId,
            voucher.recipient,
            voucher.rlusdAmount,
            sharesMinted
        );
    }

    function hashVoucher(SettlementVoucher calldata voucher) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                VOUCHER_TYPEHASH,
                voucher.voucherId,
                voucher.recipient,
                voucher.rlusdAmount,
                voucher.validUntil
            )
        );
        return _hashTypedDataV4(structHash);
    }
}

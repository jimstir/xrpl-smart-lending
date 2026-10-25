// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICollateralVaultBridge {
    function creditNativeCollateral(address borrower, address virtualToken, uint256 amount) external;
    function debitNativeCollateral(address borrower, address virtualToken, uint256 amount) external;
    function getUserCollateral(address user, address token) external view returns (uint256);
}

/**
 * @title NativeCollateralBridge
 * @notice Cross-chain collateral bridge connecting XRPL native EscrowCreate locks with EVM lending.
 * Implements:
 * - Axelar GMP standard `execute()` entrypoint
 * - Configurable `escrowBufferSeconds` to prevent premature escrow clawbacks
 * - Authorized testnet helper `mockAttestEscrow(...)` for instant testnet / dev demos
 * - Replay protection via xrplTxHash tracking
 */
contract NativeCollateralBridge is Ownable, ReentrancyGuard {
    address public collateralVault;
    address public axelarGateway;
    uint256 public escrowBufferSeconds; // configurable (e.g. 300s on testnet, 86400s on mainnet)
    bool public testnetHelperEnabled;

    // xrplTxHash => isProcessed
    mapping(bytes32 => bool) public processedEscrowHashes;

    event NativeEscrowAttested(
        address indexed borrower,
        address indexed virtualToken,
        uint256 amount,
        bytes32 indexed xrplTxHash,
        uint256 escrowExpiry
    );

    event NativeEscrowReleased(
        address indexed borrower,
        address indexed virtualToken,
        uint256 amount,
        string xrplDestinationAddress
    );

    event BridgeConfigUpdated(address axelarGateway, uint256 escrowBufferSeconds, bool testnetHelperEnabled);

    error ZeroAddress();
    error ZeroAmount();
    error EscrowAlreadyProcessed(bytes32 xrplTxHash);
    error EscrowExpiryTooShort(uint256 escrowExpiry, uint256 minimumAllowedExpiry);
    error Unauthorized();
    error TestnetHelperDisabled();

    constructor(
        address _collateralVault,
        address _axelarGateway,
        uint256 _escrowBufferSeconds,
        bool _testnetHelperEnabled
    ) Ownable(msg.sender) {
        if (_collateralVault == address(0)) revert ZeroAddress();
        collateralVault = _collateralVault;
        axelarGateway = _axelarGateway;
        escrowBufferSeconds = _escrowBufferSeconds;
        testnetHelperEnabled = _testnetHelperEnabled;
    }

    function setBridgeConfig(
        address _axelarGateway,
        uint256 _escrowBufferSeconds,
        bool _testnetHelperEnabled
    ) external onlyOwner {
        axelarGateway = _axelarGateway;
        escrowBufferSeconds = _escrowBufferSeconds;
        testnetHelperEnabled = _testnetHelperEnabled;
        emit BridgeConfigUpdated(_axelarGateway, _escrowBufferSeconds, _testnetHelperEnabled);
    }

    /**
     * @notice Axelar GMP Relayer execution entrypoint.
     */
    function execute(
        bytes32 /* commandId */,
        string calldata /* sourceChain */,
        string calldata /* sourceAddress */,
        bytes calldata payload
    ) external nonReentrant {
        if (msg.sender != axelarGateway && msg.sender != owner()) revert Unauthorized();

        (
            address borrower,
            address virtualCollateralToken,
            uint256 amount,
            bytes32 xrplTxHash,
            uint256 escrowExpiry
        ) = abi.decode(payload, (address, address, uint256, bytes32, uint256));

        _processAttestation(borrower, virtualCollateralToken, amount, xrplTxHash, escrowExpiry);
    }

    /**
     * @notice Authorized testnet helper to simulate instant cross-chain escrow attestation without bridge lag.
     */
    function mockAttestEscrow(
        address borrower,
        address virtualCollateralToken,
        uint256 amount,
        bytes32 xrplTxHash,
        uint256 escrowExpiry
    ) external onlyOwner nonReentrant {
        if (!testnetHelperEnabled) revert TestnetHelperDisabled();
        _processAttestation(borrower, virtualCollateralToken, amount, xrplTxHash, escrowExpiry);
    }

    function _processAttestation(
        address borrower,
        address virtualCollateralToken,
        uint256 amount,
        bytes32 xrplTxHash,
        uint256 escrowExpiry
    ) internal {
        if (borrower == address(0) || virtualCollateralToken == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (processedEscrowHashes[xrplTxHash]) revert EscrowAlreadyProcessed(xrplTxHash);

        if (escrowExpiry < block.timestamp + escrowBufferSeconds) {
            revert EscrowExpiryTooShort(escrowExpiry, block.timestamp + escrowBufferSeconds);
        }

        processedEscrowHashes[xrplTxHash] = true;
        ICollateralVaultBridge(collateralVault).creditNativeCollateral(borrower, virtualCollateralToken, amount);

        emit NativeEscrowAttested(borrower, virtualCollateralToken, amount, xrplTxHash, escrowExpiry);
    }

    /**
     * @notice Borrower initiates release of native collateral back to XRP Ledger.
     */
    function requestNativeCollateralRelease(
        address virtualToken,
        uint256 amount,
        string calldata xrplDestinationAddress
    ) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        ICollateralVaultBridge(collateralVault).debitNativeCollateral(msg.sender, virtualToken, amount);
        emit NativeEscrowReleased(msg.sender, virtualToken, amount, xrplDestinationAddress);
    }
}

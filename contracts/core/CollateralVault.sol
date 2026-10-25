// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IRiskEngine {
    function validateWithdrawal(address borrower, address token, uint256 amount) external view returns (bool, uint256);
    function isAllowedCollateral(address token) external view returns (bool);
}

/**
 * @title CollateralVault
 * @notice Segregated, non-custodial custody of permitted collateral assets on XRPL EVM Sidechain.
 * Enforces strict non-rehypothecation (collateral is never lent out or commingled with debt capital).
 */
contract CollateralVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // user => token => balance
    mapping(address => mapping(address => uint256)) public userCollateral;
    // token => total deposited
    mapping(address => uint256) public totalCollateralByToken;

    address public riskEngine;
    address public liquidationManager;
    address public nativeBridge;

    event CollateralDeposited(address indexed user, address indexed token, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed token, uint256 amount);
    event CollateralSeized(address indexed borrower, address indexed token, address indexed liquidator, uint256 amount);
    event ProtocolAddressesUpdated(address indexed riskEngine, address indexed liquidationManager, address indexed nativeBridge);

    error ZeroAmount();
    error ZeroAddress();
    error TokenNotAllowed();
    error InsufficientCollateral();
    error SolvencyViolation(uint256 projectedHealthFactor);
    error Unauthorized();

    modifier onlyLiquidationManager() {
        if (msg.sender != liquidationManager) revert Unauthorized();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setProtocolAddresses(
        address _riskEngine,
        address _liquidationManager,
        address _nativeBridge
    ) external onlyOwner {
        if (_riskEngine == address(0) || _liquidationManager == address(0)) revert ZeroAddress();
        riskEngine = _riskEngine;
        liquidationManager = _liquidationManager;
        nativeBridge = _nativeBridge;
        emit ProtocolAddressesUpdated(_riskEngine, _liquidationManager, _nativeBridge);
    }

    /**
     * @notice Deposit approved ERC-20 collateral.
     */
    function depositCollateral(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (riskEngine != address(0) && !IRiskEngine(riskEngine).isAllowedCollateral(token)) {
            revert TokenNotAllowed();
        }

        userCollateral[msg.sender][token] += amount;
        totalCollateralByToken[token] += amount;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralDeposited(msg.sender, token, amount);
    }

    /**
     * @notice Withdraw excess collateral, protected by the Health Factor >= 1.05 invariant.
     */
    function withdrawCollateral(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (userCollateral[msg.sender][token] < amount) revert InsufficientCollateral();

        if (riskEngine != address(0)) {
            (bool isAllowed, uint256 projectedHf) = IRiskEngine(riskEngine).validateWithdrawal(msg.sender, token, amount);
            if (!isAllowed) revert SolvencyViolation(projectedHf);
        }

        userCollateral[msg.sender][token] -= amount;
        totalCollateralByToken[token] -= amount;

        IERC20(token).safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, token, amount);
    }

    /**
     * @notice Called strictly by LiquidationManager to transfer seized collateral to liquidator.
     */
    function seizeCollateral(
        address borrower,
        address token,
        address liquidator,
        uint256 amount
    ) external onlyLiquidationManager nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (userCollateral[borrower][token] < amount) revert InsufficientCollateral();

        userCollateral[borrower][token] -= amount;
        totalCollateralByToken[token] -= amount;

        IERC20(token).safeTransfer(liquidator, amount);
        emit CollateralSeized(borrower, token, liquidator, amount);
    }

    /**
     * @notice Credit virtual collateral from native XRPL escrow locks (via NativeCollateralBridge).
     */
    function creditNativeCollateral(address borrower, address virtualToken, uint256 amount) external {
        if (msg.sender != nativeBridge && msg.sender != owner()) revert Unauthorized();
        userCollateral[borrower][virtualToken] += amount;
        totalCollateralByToken[virtualToken] += amount;
        emit CollateralDeposited(borrower, virtualToken, amount);
    }

    /**
     * @notice Debit virtual collateral upon loan repayment or native liquidation.
     */
    function debitNativeCollateral(address borrower, address virtualToken, uint256 amount) external {
        if (msg.sender != nativeBridge && msg.sender != liquidationManager && msg.sender != owner()) revert Unauthorized();
        if (userCollateral[borrower][virtualToken] < amount) revert InsufficientCollateral();
        userCollateral[borrower][virtualToken] -= amount;
        totalCollateralByToken[virtualToken] -= amount;
        emit CollateralWithdrawn(borrower, virtualToken, amount);
    }

    function getUserCollateral(address user, address token) external view returns (uint256) {
        return userCollateral[user][token];
    }
}

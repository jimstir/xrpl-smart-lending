// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ProtocolReserveVault.sol";

interface IRiskEngineLending {
    function validateBorrow(address borrower, uint256 newBorrowAmount) external view returns (bool);
    function isAllowedCollateral(address token) external view returns (bool);
}

/**
 * @title LendingVault
 * @notice Core ERC-4626 lending vault for RLUSD on XRPL EVM Sidechain.
 * Features:
 * - Dual Rate Model: Mode A (Fixed APR) & Mode B (Owner-Calibrated Kinked Curve)
 * - Continuous compound interest accrual
 * - 90/10 reserve factor split to ProtocolReserveVault
 * - Non-custodial risk engine enforcement
 */
contract LendingVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RateMode {
        ModeAFixed,
        ModeBKinkedCurve
    }

    struct CurveParameters {
        uint256 baseRateBps;        // e.g. 200 = 2%
        uint256 optimalUtilBps;     // e.g. 8000 = 80%
        uint256 slope1Bps;          // e.g. 400 = 4%
        uint256 slope2Bps;          // e.g. 3000 = 30%
    }

    struct BorrowerAccount {
        uint256 principal;
        uint256 interestIndex;
    }

    uint256 public constant SECONDS_PER_YEAR = 31536000;
    uint256 public constant BPS_DIVISOR = 10000;
    uint256 public constant RAY = 1e27;
    uint256 public constant RESERVE_FACTOR_BPS = 1000; // 10% to ProtocolReserveVault

    RateMode public rateMode;
    uint256 public fixedRateBps;
    CurveParameters public curveParams;

    // Debt and interest tracking
    uint256 public totalBorrows;
    uint256 public borrowIndex; // initialized to 1e27 (RAY)
    uint256 public lastAccrualTimestamp;
    uint256 public pendingReserves;

    mapping(address => BorrowerAccount) public borrowers;

    address public riskEngine;
    address public liquidationManager;
    address public protocolReserveVault;
    address public lendingAgent;

    event InterestAccrued(uint256 currentBorrowRate, uint256 interestAccumulated, uint256 newBorrowIndex);
    event Borrowed(address indexed borrower, uint256 amount, uint256 totalDebt);
    event Repaid(address indexed payer, address indexed borrower, uint256 amountRepaid, uint256 remainingDebt);
    event RateModeFixedUpdated(uint256 fixedRateBps);
    event RateModeCurveUpdated(uint256 baseRate, uint256 optimalUtil, uint256 slope1, uint256 slope2);
    event ProtocolAddressesUpdated(address riskEngine, address liquidationManager, address protocolReserveVault, address lendingAgent);

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientVaultLiquidity();
    error BorrowExceedsLtvLimit();
    error NoOutstandingDebt();
    error Unauthorized();
    error InvalidParameters();

    modifier onlyLiquidationOrOwner() {
        if (msg.sender != liquidationManager && msg.sender != owner()) revert Unauthorized();
        _;
    }

    constructor(
        IERC20 _rlusd,
        address _protocolReserveVault
    )
        ERC4626(_rlusd)
        ERC20("AI-Managed RLUSD Vault Share", "amRLUSD")
        Ownable(msg.sender)
    {
        if (address(_rlusd) == address(0) || _protocolReserveVault == address(0)) revert ZeroAddress();
        protocolReserveVault = _protocolReserveVault;

        rateMode = RateMode.ModeBKinkedCurve;
        curveParams = CurveParameters({
            baseRateBps: 200,        // 2%
            optimalUtilBps: 8000,    // 80%
            slope1Bps: 400,          // 4%
            slope2Bps: 3000          // 30%
        });

        borrowIndex = RAY;
        lastAccrualTimestamp = block.timestamp;
    }

    function setProtocolAddresses(
        address _riskEngine,
        address _liquidationManager,
        address _lendingAgent
    ) external onlyOwner {
        if (_riskEngine == address(0) || _liquidationManager == address(0)) revert ZeroAddress();
        riskEngine = _riskEngine;
        liquidationManager = _liquidationManager;
        lendingAgent = _lendingAgent;
        emit ProtocolAddressesUpdated(_riskEngine, _liquidationManager, protocolReserveVault, _lendingAgent);
    }

    function setFixedRateMode(uint256 _fixedRateBps) external onlyOwner {
        accrueInterest();
        rateMode = RateMode.ModeAFixed;
        fixedRateBps = _fixedRateBps;
        emit RateModeFixedUpdated(_fixedRateBps);
    }

    function setKinkedCurveMode(
        uint256 _baseRateBps,
        uint256 _optimalUtilBps,
        uint256 _slope1Bps,
        uint256 _slope2Bps
    ) external onlyOwner {
        if (_optimalUtilBps == 0 || _optimalUtilBps >= BPS_DIVISOR) revert InvalidParameters();
        accrueInterest();
        rateMode = RateMode.ModeBKinkedCurve;
        curveParams = CurveParameters({
            baseRateBps: _baseRateBps,
            optimalUtilBps: _optimalUtilBps,
            slope1Bps: _slope1Bps,
            slope2Bps: _slope2Bps
        });
        emit RateModeCurveUpdated(_baseRateBps, _optimalUtilBps, _slope1Bps, _slope2Bps);
    }

    /**
     * @notice Returns total assets held plus outstanding borrows (for ERC-4626 share pricing).
     */
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + totalBorrows - pendingReserves;
    }

    /**
     * @notice Computes current utilization rate in BPS (10000 = 100%).
     */
    function getUtilizationRate() public view returns (uint256) {
        uint256 cash = IERC20(asset()).balanceOf(address(this));
        if (totalBorrows == 0) return 0;
        return (totalBorrows * BPS_DIVISOR) / (cash + totalBorrows);
    }

    /**
     * @notice Computes current annualized borrow rate in BPS.
     */
    function getBorrowRate() public view returns (uint256) {
        if (rateMode == RateMode.ModeAFixed) {
            return fixedRateBps;
        }

        uint256 util = getUtilizationRate();
        CurveParameters memory p = curveParams;

        if (util <= p.optimalUtilBps) {
            return p.baseRateBps + ((util * p.slope1Bps) / p.optimalUtilBps);
        } else {
            uint256 excessUtil = util - p.optimalUtilBps;
            uint256 remainingUtil = BPS_DIVISOR - p.optimalUtilBps;
            return p.baseRateBps + p.slope1Bps + ((excessUtil * p.slope2Bps) / remainingUtil);
        }
    }

    /**
     * @notice Accrues accumulated borrow interest and allocates the 10% reserve factor.
     */
    function accrueInterest() public {
        uint256 currentTime = block.timestamp;
        uint256 timeElapsed = currentTime - lastAccrualTimestamp;
        if (timeElapsed == 0) return;

        lastAccrualTimestamp = currentTime;

        if (totalBorrows == 0) return;

        uint256 borrowRate = getBorrowRate(); // in BPS
        // interest = totalBorrows * rate * timeElapsed / (SECONDS_PER_YEAR * BPS_DIVISOR)
        uint256 interestAccrued = (totalBorrows * borrowRate * timeElapsed) / (SECONDS_PER_YEAR * BPS_DIVISOR);

        if (interestAccrued > 0) {
            uint256 reserveCut = (interestAccrued * RESERVE_FACTOR_BPS) / BPS_DIVISOR;
            pendingReserves += reserveCut;
            totalBorrows += interestAccrued;

            // Update global borrow index
            borrowIndex += (borrowIndex * interestAccrued) / (totalBorrows - interestAccrued);

            emit InterestAccrued(borrowRate, interestAccrued, borrowIndex);
        }
    }

    /**
     * @notice Flush pending reserves into the ProtocolReserveVault.
     */
    function flushReserves() public {
        accrueInterest();
        uint256 reservesToFlush = pendingReserves;
        if (reservesToFlush > 0 && IERC20(asset()).balanceOf(address(this)) >= reservesToFlush) {
            pendingReserves = 0;
            IERC20(asset()).forceApprove(protocolReserveVault, reservesToFlush);
            ProtocolReserveVault(protocolReserveVault).depositReserve(reservesToFlush);
        }
    }

    /**
     * @notice Returns total debt for a borrower (principal + accrued interest).
     */
    function getBorrowerDebt(address borrower) public view returns (uint256 principal, uint256 totalDebt) {
        BorrowerAccount memory account = borrowers[borrower];
        principal = account.principal;
        if (account.principal == 0 || account.interestIndex == 0) {
            return (0, 0);
        }

        // Calculate accrued debt: principal * currentBorrowIndex / borrowerInterestIndex
        totalDebt = (account.principal * borrowIndex) / account.interestIndex;
    }

    /**
     * @notice Borrow RLUSD against deposited collateral.
     */
    function borrow(uint256 amount) external nonReentrant {
        _executeBorrow(msg.sender, amount);
    }

    /**
     * @notice Prioritized execution of borrow for borrower (e.g. by agent or gateway).
     */
    function executeBorrowAllocation(address borrower, uint256 amount) external nonReentrant {
        if (msg.sender != lendingAgent && msg.sender != owner()) revert Unauthorized();
        _executeBorrow(borrower, amount);
    }

    function _executeBorrow(address borrower, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        accrueInterest();

        uint256 cash = IERC20(asset()).balanceOf(address(this));
        if (amount > cash) revert InsufficientVaultLiquidity();

        if (riskEngine != address(0)) {
            bool valid = IRiskEngineLending(riskEngine).validateBorrow(borrower, amount);
            if (!valid) revert BorrowExceedsLtvLimit();
        }

        // Update borrower debt
        BorrowerAccount storage account = borrowers[borrower];
        if (account.principal > 0) {
            uint256 currentDebt = (account.principal * borrowIndex) / account.interestIndex;
            account.principal = currentDebt + amount;
        } else {
            account.principal = amount;
        }
        account.interestIndex = borrowIndex;

        totalBorrows += amount;

        IERC20(asset()).safeTransfer(borrower, amount);
        emit Borrowed(borrower, amount, account.principal);
    }

    /**
     * @notice Repay loan debt.
     */
    function repay(uint256 amount) external nonReentrant returns (uint256) {
        return _executeRepay(msg.sender, msg.sender, amount);
    }

    /**
     * @notice Repay debt on behalf of borrower (used during liquidation).
     */
    function repayOnBehalf(address borrower, uint256 amount) external nonReentrant returns (uint256) {
        return _executeRepay(msg.sender, borrower, amount);
    }

    function _executeRepay(address payer, address borrower, uint256 amount) internal returns (uint256) {
        if (amount == 0) revert ZeroAmount();
        accrueInterest();

        (, uint256 totalDebt) = getBorrowerDebt(borrower);
        if (totalDebt == 0) revert NoOutstandingDebt();

        uint256 amountToRepay = amount > totalDebt ? totalDebt : amount;

        BorrowerAccount storage account = borrowers[borrower];
        uint256 newDebt = totalDebt - amountToRepay;

        if (newDebt == 0) {
            account.principal = 0;
            account.interestIndex = 0;
        } else {
            account.principal = newDebt;
            account.interestIndex = borrowIndex;
        }

        if (totalBorrows >= amountToRepay) {
            totalBorrows -= amountToRepay;
        } else {
            totalBorrows = 0;
        }

        IERC20(asset()).safeTransferFrom(payer, address(this), amountToRepay);

        emit Repaid(payer, borrower, amountToRepay, newDebt);
        return amountToRepay;
    }
}

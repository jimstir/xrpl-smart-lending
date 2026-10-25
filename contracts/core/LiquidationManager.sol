// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPriceOracleAdapter.sol";

interface IRiskEngineLiq {
    function calculateHealthFactor(address borrower) external view returns (uint256);
    function isAllowedCollateral(address token) external view returns (bool);
}

interface ILendingVaultLiq {
    function asset() external view returns (address);
    function accrueInterest() external;
    function getBorrowerDebt(address borrower) external view returns (uint256 principal, uint256 totalDebt);
    function repayOnBehalf(address borrower, uint256 amount) external returns (uint256);
}

interface ICollateralVaultLiq {
    function getUserCollateral(address user, address token) external view returns (uint256);
    function seizeCollateral(address borrower, address token, address liquidator, uint256 amount) external;
}

/**
 * @title LiquidationManager
 * @notice Executes debt settlements when borrower health factor drops below 1.00.
 * Dynamic rules:
 * - Close factor is 50% when 0.90 <= Hf < 1.00
 * - Deep default close factor is 100% when Hf < 0.90
 * - 5% liquidation bonus to the liquidator
 */
contract LiquidationManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DIVISOR = 10000;
    uint256 public constant WAD = 1e18;
    uint256 public constant LIQUIDATION_HEALTH_FACTOR = 1000000000000000000; // 1.00e18
    uint256 public constant DEEP_DEFAULT_HEALTH_FACTOR = 900000000000000000; // 0.90e18
    uint256 public constant CLOSE_FACTOR_NORMAL_BPS = 5000;                  // 50%
    uint256 public constant CLOSE_FACTOR_DEEP_BPS = 10000;                   // 100%
    uint256 public constant LIQUIDATION_BONUS_BPS = 500;                     // 5% bonus

    address public lendingVault;
    address public collateralVault;
    address public riskEngine;
    address public priceOracle;
    address public protocolReserveVault;

    event LiquidationExecuted(
        address indexed liquidator,
        address indexed borrower,
        address indexed collateralToken,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 healthFactorBefore
    );

    error BorrowerSolvent(uint256 healthFactor);
    error ExceedsMaxCloseFactor(uint256 requested, uint256 maxAllowed);
    error InsufficientCollateralToSeize(uint256 available, uint256 required);
    error ZeroAmount();
    error ZeroAddress();

    constructor() Ownable(msg.sender) {}

    function setProtocolAddresses(
        address _lendingVault,
        address _collateralVault,
        address _riskEngine,
        address _priceOracle,
        address _protocolReserveVault
    ) external onlyOwner {
        if (
            _lendingVault == address(0) ||
            _collateralVault == address(0) ||
            _riskEngine == address(0) ||
            _priceOracle == address(0) ||
            _protocolReserveVault == address(0)
        ) revert ZeroAddress();

        lendingVault = _lendingVault;
        collateralVault = _collateralVault;
        riskEngine = _riskEngine;
        priceOracle = _priceOracle;
        protocolReserveVault = _protocolReserveVault;
    }

    /**
     * @notice Liquidate an undercollateralized loan.
     * @param borrower The address of the borrower in default.
     * @param collateralToken The collateral asset to seize.
     * @param maxDebtToCover The maximum amount of RLUSD the liquidator is willing to repay.
     */
    function liquidate(
        address borrower,
        address collateralToken,
        uint256 maxDebtToCover
    ) external nonReentrant returns (uint256 actualDebtRepaid, uint256 collateralSeized) {
        if (maxDebtToCover == 0) revert ZeroAmount();

        ILendingVaultLiq(lendingVault).accrueInterest();

        uint256 hf = IRiskEngineLiq(riskEngine).calculateHealthFactor(borrower);
        if (hf >= LIQUIDATION_HEALTH_FACTOR) {
            revert BorrowerSolvent(hf);
        }

        (, uint256 totalDebt) = ILendingVaultLiq(lendingVault).getBorrowerDebt(borrower);
        if (totalDebt == 0) revert ZeroAmount();

        // Determine close factor: 50% if Hf >= 0.90, 100% if Hf < 0.90
        uint256 maxCloseBps = (hf < DEEP_DEFAULT_HEALTH_FACTOR) ? CLOSE_FACTOR_DEEP_BPS : CLOSE_FACTOR_NORMAL_BPS;
        uint256 maxRepayableDebt = (totalDebt * maxCloseBps) / BPS_DIVISOR;

        actualDebtRepaid = maxDebtToCover > maxRepayableDebt ? maxRepayableDebt : maxDebtToCover;

        // Calculate collateral to seize: debtRepaid * (1 + bonus) / price
        (uint256 collateralPriceUSD, uint8 oracleDecimals) = IPriceOracleAdapter(priceOracle).getAssetPrice(collateralToken);

        // Value of collateral with 5% bonus:
        // debt (18 dec) * (1 + 0.05) = debt * 10500 / 10000
        uint256 seizeValueUSD = (actualDebtRepaid * (BPS_DIVISOR + LIQUIDATION_BONUS_BPS)) / BPS_DIVISOR;

        // Seized collateral amount in token decimals:
        // seizeValueUSD (18 dec) / (price (oracleDec) / 10^oracleDec) = seizeValueUSD * 10^oracleDec / price
        // Adjust to collateral token decimals (e.g. assume 18 or scale)
        // Here: (seizeValueUSD * 10^oracleDec) / collateralPriceUSD
        collateralSeized = (seizeValueUSD * (10 ** oracleDecimals)) / collateralPriceUSD;

        uint256 userCollateralAvailable = ICollateralVaultLiq(collateralVault).getUserCollateral(borrower, collateralToken);
        if (collateralSeized > userCollateralAvailable) {
            // Cap at available collateral
            collateralSeized = userCollateralAvailable;
        }

        // Execute repayment on behalf of borrower
        address rlusdAsset = ILendingVaultLiq(lendingVault).asset();
        IERC20(rlusdAsset).safeTransferFrom(msg.sender, address(this), actualDebtRepaid);
        IERC20(rlusdAsset).forceApprove(lendingVault, actualDebtRepaid);
        ILendingVaultLiq(lendingVault).repayOnBehalf(borrower, actualDebtRepaid);

        // Seize collateral to liquidator
        ICollateralVaultLiq(collateralVault).seizeCollateral(borrower, collateralToken, msg.sender, collateralSeized);

        emit LiquidationExecuted(msg.sender, borrower, collateralToken, actualDebtRepaid, collateralSeized, hf);
    }
}

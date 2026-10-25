// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPriceOracleAdapter.sol";

interface ICollateralVault {
    function getUserCollateral(address user, address token) external view returns (uint256);
}

interface ILendingVault {
    function getBorrowerDebt(address borrower) external view returns (uint256 principal, uint256 totalDebt);
}

/**
 * @title RiskEngine
 * @notice Evaluates collateralization health, liquidation eligibility, and withdrawal solvency.
 * Invariants:
 * - Max Loan-to-Value (LTV): 70% (7000 bps)
 * - Liquidation Threshold: 80% (8000 bps)
 * - Minimum Withdrawal Health Factor: 1.05 (1.05e18)
 * - Borrowing Health Factor: >= 1.00 (1.00e18)
 */
contract RiskEngine is Ownable {
    uint256 public constant BPS_DIVISOR = 10000;
    uint256 public constant WAD = 1e18;
    uint256 public constant MIN_WITHDRAWAL_HEALTH_FACTOR = 1050000000000000000; // 1.05e18
    uint256 public constant LIQUIDATION_HEALTH_FACTOR = 1000000000000000000;     // 1.00e18

    struct CollateralConfig {
        bool isAllowed;
        uint256 ltvBps;                    // e.g. 7000 for 70%
        uint256 liquidationThresholdBps;  // e.g. 8000 for 80%
        uint8 tokenDecimals;
    }

    // token => config
    mapping(address => CollateralConfig) public collateralConfigs;
    address[] public allowedTokens;

    address public priceOracle;
    address public collateralVault;
    address public lendingVault;

    event CollateralConfigured(address indexed token, uint256 ltvBps, uint256 liqThresholdBps, uint8 decimals);
    event CollateralStatusChanged(address indexed token, bool isAllowed);
    event ProtocolAddressesUpdated(address priceOracle, address collateralVault, address lendingVault);

    error ZeroAddress();
    error InvalidConfiguration();
    error OraclePriceUnavailable();

    constructor() Ownable(msg.sender) {}

    function setProtocolAddresses(
        address _priceOracle,
        address _collateralVault,
        address _lendingVault
    ) external onlyOwner {
        if (_priceOracle == address(0) || _collateralVault == address(0) || _lendingVault == address(0)) {
            revert ZeroAddress();
        }
        priceOracle = _priceOracle;
        collateralVault = _collateralVault;
        lendingVault = _lendingVault;
        emit ProtocolAddressesUpdated(_priceOracle, _collateralVault, _lendingVault);
    }

    function configureCollateral(
        address token,
        uint256 ltvBps,
        uint256 liquidationThresholdBps,
        uint8 tokenDecimals
    ) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (ltvBps > liquidationThresholdBps || liquidationThresholdBps > BPS_DIVISOR) {
            revert InvalidConfiguration();
        }

        if (!collateralConfigs[token].isAllowed) {
            bool exists = false;
            for (uint256 i = 0; i < allowedTokens.length; i++) {
                if (allowedTokens[i] == token) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                allowedTokens.push(token);
            }
        }

        collateralConfigs[token] = CollateralConfig({
            isAllowed: true,
            ltvBps: ltvBps,
            liquidationThresholdBps: liquidationThresholdBps,
            tokenDecimals: tokenDecimals
        });

        emit CollateralConfigured(token, ltvBps, liquidationThresholdBps, tokenDecimals);
    }

    function setCollateralAllowed(address token, bool isAllowed) external onlyOwner {
        collateralConfigs[token].isAllowed = isAllowed;
        emit CollateralStatusChanged(token, isAllowed);
    }

    function isAllowedCollateral(address token) external view returns (bool) {
        return collateralConfigs[token].isAllowed;
    }

    function getAllowedTokens() external view returns (address[] memory) {
        return allowedTokens;
    }

    /**
     * @notice Calculate borrower's total collateral value, borrow capacity, and liquidation threshold value in 18 decimals USD.
     */
    function calculateAccountValues(address borrower)
        public
        view
        returns (
            uint256 totalCollateralUSD,
            uint256 totalBorrowCapacityUSD,
            uint256 totalLiquidationThresholdUSD
        )
    {
        for (uint256 i = 0; i < allowedTokens.length; i++) {
            address token = allowedTokens[i];
            CollateralConfig memory config = collateralConfigs[token];
            if (!config.isAllowed) continue;

            uint256 balance = ICollateralVault(collateralVault).getUserCollateral(borrower, token);
            if (balance == 0) continue;

            (uint256 priceUSD, uint8 oracleDecimals) = IPriceOracleAdapter(priceOracle).getAssetPrice(token);
            
            // Value in 18 decimals: balance * price / (10^tokenDecimals * 10^oracleDecimals) * 1e18
            uint256 itemValueUSD = (balance * priceUSD * WAD) / ((10 ** config.tokenDecimals) * (10 ** oracleDecimals));

            totalCollateralUSD += itemValueUSD;
            totalBorrowCapacityUSD += (itemValueUSD * config.ltvBps) / BPS_DIVISOR;
            totalLiquidationThresholdUSD += (itemValueUSD * config.liquidationThresholdBps) / BPS_DIVISOR;
        }
    }

    /**
     * @notice Returns borrower's health factor in 18 decimals WAD (1e18 = 1.0).
     */
    function calculateHealthFactor(address borrower) public view returns (uint256 healthFactor) {
        (, uint256 totalDebtRLUSD) = ILendingVault(lendingVault).getBorrowerDebt(borrower);
        if (totalDebtRLUSD == 0) {
            return type(uint256).max;
        }

        (, , uint256 totalLiquidationThresholdUSD) = calculateAccountValues(borrower);

        // Assuming RLUSD is $1.00 peg: totalDebtRLUSD in 18 decimals
        return (totalLiquidationThresholdUSD * WAD) / totalDebtRLUSD;
    }

    /**
     * @notice Checks if borrower is eligible for liquidation (Hf < 1.00).
     */
    function isLiquidatable(address borrower) external view returns (bool canLiquidate, uint256 hf) {
        hf = calculateHealthFactor(borrower);
        canLiquidate = (hf < LIQUIDATION_HEALTH_FACTOR);
    }

    /**
     * @notice Validates if borrower can take on an additional borrow amount.
     */
    function validateBorrow(address borrower, uint256 newBorrowAmount) external view returns (bool) {
        (, uint256 currentDebt) = ILendingVault(lendingVault).getBorrowerDebt(borrower);
        uint256 projectedDebt = currentDebt + newBorrowAmount;

        (, uint256 totalBorrowCapacityUSD, ) = calculateAccountValues(borrower);
        return projectedDebt <= totalBorrowCapacityUSD;
    }

    /**
     * @notice Validates collateral withdrawal, ensuring projected Hf >= 1.05.
     */
    function validateWithdrawal(
        address borrower,
        address collateralToken,
        uint256 withdrawAmount
    ) external view returns (bool isAllowed, uint256 projectedHf) {
        (, uint256 currentDebt) = ILendingVault(lendingVault).getBorrowerDebt(borrower);
        if (currentDebt == 0) {
            return (true, type(uint256).max);
        }

        CollateralConfig memory config = collateralConfigs[collateralToken];
        (uint256 priceUSD, uint8 oracleDecimals) = IPriceOracleAdapter(priceOracle).getAssetPrice(collateralToken);

        uint256 withdrawValueUSD = (withdrawAmount * priceUSD * WAD) / ((10 ** config.tokenDecimals) * (10 ** oracleDecimals));
        uint256 withdrawThresholdDeduction = (withdrawValueUSD * config.liquidationThresholdBps) / BPS_DIVISOR;

        (, , uint256 currentLiqThresholdUSD) = calculateAccountValues(borrower);

        if (withdrawThresholdDeduction >= currentLiqThresholdUSD) {
            return (false, 0);
        }

        uint256 projectedLiqThresholdUSD = currentLiqThresholdUSD - withdrawThresholdDeduction;
        projectedHf = (projectedLiqThresholdUSD * WAD) / currentDebt;

        isAllowed = (projectedHf >= MIN_WITHDRAWAL_HEALTH_FACTOR);
    }
}

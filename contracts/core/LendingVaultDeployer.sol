// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LendingVault} from "./LendingVault.sol";
import {ProtocolReserveVault} from "./ProtocolReserveVault.sol";
import {RiskEngine} from "./RiskEngine.sol";
import {LiquidationManager} from "./LiquidationManager.sol";

/**
 * @title LendingVaultDeployer
 * @notice Factory deployer that provisions a complete sovereign lending service in a single transaction.
 */
contract LendingVaultDeployer {
    event VaultSystemDeployed(
        address indexed owner,
        address lendingVault,
        address reserveVault,
        address riskEngine,
        address liquidationManager
    );

    function deployVaultSystem(
        address asset,
        address collateralVault,
        address priceOracle,
        address wxrpToken,
        address wethToken,
        uint8 rateMode,
        uint256 fixedRateBps,
        uint256 baseRateBps,
        uint256 optimalUtilBps,
        uint256 slope1Bps,
        uint256 slope2Bps
    ) external returns (
        address lendingVault,
        address reserveVault,
        address riskEngine,
        address liquidationManager
    ) {
        // 1. Deploy Protocol Reserve Vault
        ProtocolReserveVault reserve = new ProtocolReserveVault(asset);
        reserveVault = address(reserve);

        // 2. Deploy Risk Engine
        RiskEngine risk = new RiskEngine();
        riskEngine = address(risk);

        // 3. Deploy Liquidation Manager
        LiquidationManager liq = new LiquidationManager();
        liquidationManager = address(liq);

        // 4. Deploy Sovereign Lending Vault
        LendingVault vault = new LendingVault(IERC20(asset), reserveVault);
        lendingVault = address(vault);

        // 5. Wire protocol permissions
        reserve.setAuthorizedCallers(lendingVault, liquidationManager);
        vault.setProtocolAddresses(riskEngine, liquidationManager, msg.sender);

        if (priceOracle != address(0) && collateralVault != address(0)) {
            risk.setProtocolAddresses(priceOracle, collateralVault, lendingVault);
            liq.setProtocolAddresses(lendingVault, collateralVault, riskEngine, priceOracle, reserveVault);
            if (wxrpToken != address(0)) {
                risk.configureCollateral(wxrpToken, 7000, 8000, 18);
            }
            if (wethToken != address(0)) {
                risk.configureCollateral(wethToken, 7000, 8000, 18);
            }
        }

        // 6. Configure rate policy
        if (rateMode == 0 && fixedRateBps > 0) {
            vault.setFixedRateMode(fixedRateBps);
        } else if (rateMode == 1 && optimalUtilBps > 0) {
            vault.setKinkedCurveMode(baseRateBps, optimalUtilBps, slope1Bps, slope2Bps);
        }

        // 7. Transfer ownership of all provisioned contracts to the caller
        vault.transferOwnership(msg.sender);
        reserve.transferOwnership(msg.sender);
        risk.transferOwnership(msg.sender);
        liq.transferOwnership(msg.sender);

        emit VaultSystemDeployed(
            msg.sender,
            lendingVault,
            reserveVault,
            riskEngine,
            liquidationManager
        );
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IPriceOracleAdapter {
    function getAssetPrice(address asset) external view returns (uint256 priceInUSD, uint8 decimals);
    function isPriceFresh(address asset) external view returns (bool);
}

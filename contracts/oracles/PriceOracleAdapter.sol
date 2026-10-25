// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPriceOracleAdapter.sol";

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
    function decimals() external view returns (uint8);
}

/**
 * @title PriceOracleAdapter
 * @notice Multi-source price feed adapter supporting Pyth, Band, and Chainlink/XLS-47d oracles.
 * Supports configurable staleness tolerances, testnet latest-price query mode, and direct fallbacks.
 */
contract PriceOracleAdapter is IPriceOracleAdapter, Ownable {
    struct PriceFeedConfig {
        address primaryFeed;
        address secondaryFeed;
        uint8 feedDecimals;
        bool exists;
    }

    struct DirectPriceEntry {
        uint256 price;
        uint256 updatedAt;
        bool isActive;
    }

    // asset => feed config
    mapping(address => PriceFeedConfig) public feeds;
    // asset => direct price fallback (e.g. for testing or emergency override)
    mapping(address => DirectPriceEntry) public directPrices;

    uint256 public maxAllowedOracleDelay; // in seconds (e.g., 3600 on testnet, 300 on mainnet)
    bool public latestPriceMode;          // true allows using latest price even if stale (testnet friendly)
    bool public allowSingleFeedFallback;  // allow single feed if secondary unavailable

    event PriceFeedUpdated(address indexed asset, address primaryFeed, address secondaryFeed, uint8 decimals);
    event DirectPriceUpdated(address indexed asset, uint256 price, uint256 timestamp);
    event OracleConfigUpdated(uint256 maxDelay, bool latestPriceMode, bool allowSingleFeedFallback);

    error StalePrice(address asset, uint256 updatedAt, uint256 currentTime);
    error InvalidPrice(address asset, int256 price);
    error FeedNotFound(address asset);
    error ZeroAddress();

    constructor(
        uint256 _maxAllowedOracleDelay,
        bool _latestPriceMode,
        bool _allowSingleFeedFallback
    ) Ownable(msg.sender) {
        maxAllowedOracleDelay = _maxAllowedOracleDelay;
        latestPriceMode = _latestPriceMode;
        allowSingleFeedFallback = _allowSingleFeedFallback;
    }

    function setOracleConfig(
        uint256 _maxAllowedOracleDelay,
        bool _latestPriceMode,
        bool _allowSingleFeedFallback
    ) external onlyOwner {
        maxAllowedOracleDelay = _maxAllowedOracleDelay;
        latestPriceMode = _latestPriceMode;
        allowSingleFeedFallback = _allowSingleFeedFallback;
        emit OracleConfigUpdated(_maxAllowedOracleDelay, _latestPriceMode, _allowSingleFeedFallback);
    }

    function setAssetFeed(
        address asset,
        address primaryFeed,
        address secondaryFeed,
        uint8 feedDecimals
    ) external onlyOwner {
        if (asset == address(0)) revert ZeroAddress();
        feeds[asset] = PriceFeedConfig({
            primaryFeed: primaryFeed,
            secondaryFeed: secondaryFeed,
            feedDecimals: feedDecimals,
            exists: true
        });
        emit PriceFeedUpdated(asset, primaryFeed, secondaryFeed, feedDecimals);
    }

    function setDirectPrice(address asset, uint256 price) external onlyOwner {
        if (asset == address(0)) revert ZeroAddress();
        directPrices[asset] = DirectPriceEntry({
            price: price,
            updatedAt: block.timestamp,
            isActive: true
        });
        emit DirectPriceUpdated(asset, price, block.timestamp);
    }

    function removeDirectPrice(address asset) external onlyOwner {
        directPrices[asset].isActive = false;
    }

    /**
     * @notice Returns asset price normalized to 8 decimals.
     */
    function getAssetPrice(address asset) external view override returns (uint256 priceInUSD, uint8 decimals) {
        decimals = 8;

        // 1. Direct price override check
        DirectPriceEntry memory direct = directPrices[asset];
        if (direct.isActive) {
            if (!latestPriceMode && block.timestamp - direct.updatedAt > maxAllowedOracleDelay) {
                revert StalePrice(asset, direct.updatedAt, block.timestamp);
            }
            return (direct.price, decimals);
        }

        // 2. Primary feed check
        PriceFeedConfig memory config = feeds[asset];
        if (!config.exists) revert FeedNotFound(asset);

        if (config.primaryFeed != address(0)) {
            try IAggregatorV3(config.primaryFeed).latestRoundData() returns (
                uint80,
                int256 answer,
                uint256,
                uint256 updatedAt,
                uint80
            ) {
                if (answer > 0) {
                    if (latestPriceMode || (block.timestamp >= updatedAt && block.timestamp - updatedAt <= maxAllowedOracleDelay)) {
                        return (_scalePrice(uint256(answer), config.feedDecimals, decimals), decimals);
                    }
                }
            } catch {
                // fall through to secondary or error
            }
        }

        // 3. Secondary feed fallback
        if (config.secondaryFeed != address(0)) {
            try IAggregatorV3(config.secondaryFeed).latestRoundData() returns (
                uint80,
                int256 answerSec,
                uint256,
                uint256 updatedAtSec,
                uint80
            ) {
                if (answerSec > 0) {
                    if (latestPriceMode || (block.timestamp >= updatedAtSec && block.timestamp - updatedAtSec <= maxAllowedOracleDelay)) {
                        return (_scalePrice(uint256(answerSec), config.feedDecimals, decimals), decimals);
                    }
                }
            } catch {
                // fall through
            }
        }

        revert StalePrice(asset, 0, block.timestamp);
    }

    function isPriceFresh(address asset) external view override returns (bool) {
        DirectPriceEntry memory direct = directPrices[asset];
        if (direct.isActive) {
            return latestPriceMode || (block.timestamp - direct.updatedAt <= maxAllowedOracleDelay);
        }

        PriceFeedConfig memory config = feeds[asset];
        if (!config.exists) return false;

        if (config.primaryFeed != address(0)) {
            try IAggregatorV3(config.primaryFeed).latestRoundData() returns (
                uint80,
                int256 answer,
                uint256,
                uint256 updatedAt,
                uint80
            ) {
                if (answer > 0 && (latestPriceMode || (block.timestamp >= updatedAt && block.timestamp - updatedAt <= maxAllowedOracleDelay))) {
                    return true;
                }
            } catch {
                // check secondary
            }
        }

        if (config.secondaryFeed != address(0)) {
            try IAggregatorV3(config.secondaryFeed).latestRoundData() returns (
                uint80,
                int256 answerSec,
                uint256,
                uint256 updatedAtSec,
                uint80
            ) {
                if (answerSec > 0 && (latestPriceMode || (block.timestamp >= updatedAtSec && block.timestamp - updatedAtSec <= maxAllowedOracleDelay))) {
                    return true;
                }
            } catch {
                return false;
            }
        }

        return false;
    }

    function _scalePrice(uint256 rawPrice, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) {
            return rawPrice;
        } else if (fromDecimals < toDecimals) {
            return rawPrice * (10 ** (toDecimals - fromDecimals));
        } else {
            return rawPrice / (10 ** (fromDecimals - toDecimals));
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../oracles/PriceOracleAdapter.sol";

contract MockAggregatorV3 is IAggregatorV3 {
    int256 public answer;
    uint8 public override decimals;
    uint256 public updatedAt;
    uint80 public roundId;

    constructor(int256 _initialAnswer, uint8 _decimals) {
        answer = _initialAnswer;
        decimals = _decimals;
        updatedAt = block.timestamp;
        roundId = 1;
    }

    function setAnswer(int256 _newAnswer) external {
        answer = _newAnswer;
        updatedAt = block.timestamp;
        roundId++;
    }

    function setTimestamp(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }
}

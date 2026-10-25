// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenVerificationGate
 * @notice Enforces institutional asset compliance and KYC/AML eligibility checks for collateral assets.
 * Integrates with AI Lending Agent Token Onboarding Proposals (Proposal 8).
 */
contract TokenVerificationGate is Ownable {
    struct TokenComplianceProfile {
        bool isAllowed;
        string riskTier;            // e.g. "TIER_A_SOVEREIGN", "TIER_B_DEFI", "TIER_C_VOLATILE"
        uint256 maxCollateralCap;   // aggregate vault ceiling
        uint256 onboardingTimestamp;
    }

    // token => compliance profile
    mapping(address => TokenComplianceProfile) public tokenProfiles;
    address public complianceOfficer;

    event TokenComplianceUpdated(address indexed token, bool isAllowed, string riskTier, uint256 maxCollateralCap);
    event ComplianceOfficerUpdated(address indexed newOfficer);

    error Unauthorized();
    error ZeroAddress();

    modifier onlyOfficerOrOwner() {
        if (msg.sender != complianceOfficer && msg.sender != owner()) revert Unauthorized();
        _;
    }

    constructor() Ownable(msg.sender) {
        complianceOfficer = msg.sender;
    }

    function setComplianceOfficer(address _officer) external onlyOwner {
        if (_officer == address(0)) revert ZeroAddress();
        complianceOfficer = _officer;
        emit ComplianceOfficerUpdated(_officer);
    }

    function setTokenCompliance(
        address token,
        bool isAllowed,
        string calldata riskTier,
        uint256 maxCollateralCap
    ) external onlyOfficerOrOwner {
        if (token == address(0)) revert ZeroAddress();

        tokenProfiles[token] = TokenComplianceProfile({
            isAllowed: isAllowed,
            riskTier: riskTier,
            maxCollateralCap: maxCollateralCap,
            onboardingTimestamp: block.timestamp
        });

        emit TokenComplianceUpdated(token, isAllowed, riskTier, maxCollateralCap);
    }

    function isTokenCompliant(address token) external view returns (bool) {
        return tokenProfiles[token].isAllowed;
    }

    function getTokenProfile(address token) external view returns (TokenComplianceProfile memory) {
        return tokenProfiles[token];
    }
}

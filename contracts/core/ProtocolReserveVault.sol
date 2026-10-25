// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProtocolReserveVault
 * @notice Segregated insurance reserve fund for bad-debt protection and protocol security.
 * Receives the 10% reserve factor from interest repayments and liquidation bonuses.
 */
contract ProtocolReserveVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable rlusd;
    address public liquidationManager;
    address public lendingVault;

    uint256 public totalReservesAccumulated;
    uint256 public totalShortfallsCovered;

    event ReserveDeposited(address indexed from, uint256 amount);
    event ShortfallCovered(address indexed to, uint256 amount);
    event AuthorizedCallersUpdated(address indexed lendingVault, address indexed liquidationManager);

    error UnauthorizedCaller();
    error InsufficientReserveBalance();
    error ZeroAddress();

    modifier onlyAuthorized() {
        if (msg.sender != liquidationManager && msg.sender != lendingVault && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }

    constructor(address _rlusd) Ownable(msg.sender) {
        if (_rlusd == address(0)) revert ZeroAddress();
        rlusd = IERC20(_rlusd);
    }

    function setAuthorizedCallers(address _lendingVault, address _liquidationManager) external onlyOwner {
        lendingVault = _lendingVault;
        liquidationManager = _liquidationManager;
        emit AuthorizedCallersUpdated(_lendingVault, _liquidationManager);
    }

    /**
     * @notice Receives reserve factor deposits from lending vault or liquidation manager.
     */
    function depositReserve(uint256 amount) external onlyAuthorized {
        rlusd.safeTransferFrom(msg.sender, address(this), amount);
        totalReservesAccumulated += amount;
        emit ReserveDeposited(msg.sender, amount);
    }

    /**
     * @notice Covers bad debt shortfall by transferring funds to the lending vault.
     */
    function coverShortfall(address recipient, uint256 amount) external onlyAuthorized {
        uint256 available = rlusd.balanceOf(address(this));
        if (amount > available) revert InsufficientReserveBalance();
        totalShortfallsCovered += amount;
        rlusd.safeTransfer(recipient, amount);
        emit ShortfallCovered(recipient, amount);
    }

    function getReserveBalance() external view returns (uint256) {
        return rlusd.balanceOf(address(this));
    }
}

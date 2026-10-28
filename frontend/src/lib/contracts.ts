export const DEPLOYED_ADDRESSES = {
  chainId: 1449000,
  localChainId: 31337,
  rpcUrl: "https://rpc.testnet.xrplevm.org/",
  explorerUrl: "https://explorer.testnet.xrplevm.org",
  localRpcUrl: "http://127.0.0.1:8545",
  contracts: {
    RLUSD: "0x27b57a9D0b8d24EB97259c4E2279e45255e016f3",
    wXRP: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    wETH: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    ProtocolReserveVault: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    CollateralVault: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    PriceOracleAdapter: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    RiskEngine: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
    LendingVault: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
    LiquidationManager: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
    NativeCollateralBridge: "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
    FiatOnRampGateway: "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82",
    TokenVerificationGate: "0x9A676e781A523b5d0C0e43731313A708CB607508",
  },
};

export const LENDING_VAULT_ABI = [
  "constructor(address _rlusd, address _protocolReserveVault)",
  "function totalAssets() view returns (uint256)",
  "function getUtilizationRate() view returns (uint256)",
  "function getBorrowRate() view returns (uint256)",
  "function rateMode() view returns (uint8)",
  "function fixedRateBps() view returns (uint256)",
  "function curveParams() view returns (uint256 baseRateBps, uint256 optimalUtilBps, uint256 slope1Bps, uint256 slope2Bps)",
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function borrow(uint256 amount)",
  "function repay(uint256 amount) returns (uint256)",
  "function getBorrowerDebt(address borrower) view returns (uint256 principal, uint256 totalDebt)",
  "function setFixedRateMode(uint256 fixedRateBps)",
  "function setKinkedCurveMode(uint256 baseRateBps, uint256 optimalUtilBps, uint256 slope1Bps, uint256 slope2Bps)",
  "function setProtocolAddresses(address _riskEngine, address _liquidationManager, address _lendingAgent)",
  "function owner() view returns (address)",
  "function asset() view returns (address)",
];

export const MOCK_ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function mint(address to, uint256 amount)",
];

export const COLLATERAL_VAULT_ABI = [
  "function depositCollateral(address token, uint256 amount)",
  "function withdrawCollateral(address token, uint256 amount)",
  "function getUserCollateral(address user, address token) view returns (uint256)",
];

export const RISK_ENGINE_ABI = [
  "function calculateHealthFactor(address borrower) view returns (uint256)",
  "function calculateAccountValues(address borrower) view returns (uint256 totalCollateralUSD, uint256 totalBorrowCapacityUSD, uint256 totalLiqThresholdUSD)",
  "function validateWithdrawal(address borrower, address collateralToken, uint256 withdrawAmount) view returns (bool isAllowed, uint256 projectedHf)",
  "function isAllowedCollateral(address token) view returns (bool)",
];

export const NATIVE_COLLATERAL_BRIDGE_ABI = [
  "function mockAttestEscrow(address borrower, address virtualCollateralToken, uint256 amount, bytes32 xrplTxHash, uint256 escrowExpiry)",
  "function requestNativeCollateralRelease(address virtualToken, uint256 amount, string xrplDestinationAddress)",
];

export const FIAT_GATEWAY_ABI = [
  "function executeFiatSettlement((bytes32 voucherId, address recipient, uint256 rlusdAmount, uint256 validUntil) voucher, bytes signature) returns (uint256 sharesMinted)",
  "function mastercardSigner() view returns (address)",
];

export const TOKEN_VERIFICATION_GATE_ABI = [
  "function isTokenCompliant(address token) view returns (bool)",
  "function setTokenCompliance(address token, bool isAllowed, string riskTier, uint256 maxCollateralCap)",
];

export const PRICE_ORACLE_ADAPTER_ABI = [
  "function getAssetPrice(address asset) view returns (uint256, uint8)",
];

export { LENDING_VAULT_DEPLOYER_ABI, LENDING_VAULT_DEPLOYER_BYTECODE } from "./deployer-artifact";


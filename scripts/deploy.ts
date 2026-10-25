import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("--------------------------------------------------");
  console.log("Deploying AI-Managed Lending Platform contracts...");
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Network chainId: ${(await ethers.provider.getNetwork()).chainId}`);
  console.log("--------------------------------------------------");

  const maxOracleDelay = parseInt(process.env.MAX_ORACLE_DELAY_SECONDS || "3600");
  const escrowBuffer = parseInt(process.env.ESCROW_LOCKOUT_BUFFER_SECONDS || "300");
  const allowSingleFeed = process.env.ALLOW_SINGLE_FEED_FALLBACK === "true";

  // 1. Deploy Tokens (RLUSD, wXRP, wETH)
  const MockToken = await ethers.getContractFactory("MockERC20");
  const rlusd = await MockToken.deploy("Ripple USD", "RLUSD", 18);
  await rlusd.waitForDeployment();
  const rlusdAddress = await rlusd.getAddress();
  console.log(`RLUSD deployed to: ${rlusdAddress}`);

  const wxrp = await MockToken.deploy("Wrapped XRP", "wXRP", 18);
  await wxrp.waitForDeployment();
  const wxrpAddress = await wxrp.getAddress();
  console.log(`wXRP deployed to: ${wxrpAddress}`);

  const weth = await MockToken.deploy("Wrapped Ether", "wETH", 18);
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log(`wETH deployed to: ${wethAddress}`);

  // 2. Protocol Reserve Vault
  const ReserveFactory = await ethers.getContractFactory("ProtocolReserveVault");
  const reserveVault = await ReserveFactory.deploy(rlusdAddress);
  await reserveVault.waitForDeployment();
  const reserveVaultAddress = await reserveVault.getAddress();
  console.log(`ProtocolReserveVault deployed to: ${reserveVaultAddress}`);

  // 3. Collateral Vault
  const CollateralFactory = await ethers.getContractFactory("CollateralVault");
  const collateralVault = await CollateralFactory.deploy();
  await collateralVault.waitForDeployment();
  const collateralVaultAddress = await collateralVault.getAddress();
  console.log(`CollateralVault deployed to: ${collateralVaultAddress}`);

  // 4. Price Oracle Adapter
  const OracleFactory = await ethers.getContractFactory("PriceOracleAdapter");
  const oracle = await OracleFactory.deploy(maxOracleDelay, true, allowSingleFeed);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log(`PriceOracleAdapter deployed to: ${oracleAddress}`);

  // Initialize initial asset prices (8 decimals)
  await (await oracle.setDirectPrice(rlusdAddress, ethers.parseUnits("1.00", 8))).wait(); // $1.00
  await (await oracle.setDirectPrice(wxrpAddress, ethers.parseUnits("0.55", 8))).wait();  // $0.55
  await (await oracle.setDirectPrice(wethAddress, ethers.parseUnits("2600.00", 8))).wait(); // $2,600
  console.log("Initialized testnet prices (RLUSD=$1.00, wXRP=$0.55, wETH=$2600)");

  // 5. Risk Engine
  const RiskFactory = await ethers.getContractFactory("RiskEngine");
  const riskEngine = await RiskFactory.deploy();
  await riskEngine.waitForDeployment();
  const riskEngineAddress = await riskEngine.getAddress();
  console.log(`RiskEngine deployed to: ${riskEngineAddress}`);

  // 6. Lending Vault
  const VaultFactory = await ethers.getContractFactory("LendingVault");
  const lendingVault = await VaultFactory.deploy(rlusdAddress, reserveVaultAddress);
  await lendingVault.waitForDeployment();
  const lendingVaultAddress = await lendingVault.getAddress();
  console.log(`LendingVault deployed to: ${lendingVaultAddress}`);

  // 7. Liquidation Manager
  const LiqFactory = await ethers.getContractFactory("LiquidationManager");
  const liquidationManager = await LiqFactory.deploy();
  await liquidationManager.waitForDeployment();
  const liquidationManagerAddress = await liquidationManager.getAddress();
  console.log(`LiquidationManager deployed to: ${liquidationManagerAddress}`);

  // 8. Native Collateral Bridge
  const BridgeFactory = await ethers.getContractFactory("NativeCollateralBridge");
  const nativeBridge = await BridgeFactory.deploy(
    collateralVaultAddress,
    deployer.address, // axelarGateway placeholder
    escrowBuffer,
    true
  );
  await nativeBridge.waitForDeployment();
  const nativeBridgeAddress = await nativeBridge.getAddress();
  console.log(`NativeCollateralBridge deployed to: ${nativeBridgeAddress}`);

  // 9. Fiat On-Ramp Gateway (Mastercard AP4M x402)
  const mastercardSigner = process.env.MASTERCARD_SIGNER_ADDRESS || deployer.address;
  const GatewayFactory = await ethers.getContractFactory("FiatOnRampGateway");
  const fiatGateway = await GatewayFactory.deploy(rlusdAddress, lendingVaultAddress, mastercardSigner);
  await fiatGateway.waitForDeployment();
  const fiatGatewayAddress = await fiatGateway.getAddress();
  console.log(`FiatOnRampGateway deployed to: ${fiatGatewayAddress}`);

  // 10. Token Verification Gate
  const GateFactory = await ethers.getContractFactory("TokenVerificationGate");
  const verificationGate = await GateFactory.deploy();
  await verificationGate.waitForDeployment();
  const verificationGateAddress = await verificationGate.getAddress();
  console.log(`TokenVerificationGate deployed to: ${verificationGateAddress}`);

  // 11. Wire protocol addresses
  console.log("Wiring protocol contract permissions...");
  await (await reserveVault.setAuthorizedCallers(lendingVaultAddress, liquidationManagerAddress)).wait();
  await (await collateralVault.setProtocolAddresses(riskEngineAddress, liquidationManagerAddress, nativeBridgeAddress)).wait();
  await (await riskEngine.setProtocolAddresses(oracleAddress, collateralVaultAddress, lendingVaultAddress)).wait();
  await (await lendingVault.setProtocolAddresses(riskEngineAddress, liquidationManagerAddress, deployer.address)).wait();
  await (
    await liquidationManager.setProtocolAddresses(
      lendingVaultAddress,
      collateralVaultAddress,
      riskEngineAddress,
      oracleAddress,
      reserveVaultAddress
    )
  ).wait();

  // Configure Collateral in Risk Engine: 70% LTV (7000 bps), 80% Liquidation Threshold (8000 bps)
  await (await riskEngine.configureCollateral(wxrpAddress, 7000, 8000, 18)).wait();
  await (await riskEngine.configureCollateral(wethAddress, 7000, 8000, 18)).wait();

  // Seed initial liquidity
  await (await rlusd.mint(deployer.address, ethers.parseEther("1000000"))).wait();
  await (await rlusd.approve(lendingVaultAddress, ethers.parseEther("250000"))).wait();
  await (await lendingVault.deposit(ethers.parseEther("250000"), deployer.address)).wait();
  console.log("Deposited initial 250,000 RLUSD liquidity into LendingVault");

  // Save deployment artifact
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    timestamp: new Date().toISOString(),
    contracts: {
      RLUSD: rlusdAddress,
      wXRP: wxrpAddress,
      wETH: wethAddress,
      ProtocolReserveVault: reserveVaultAddress,
      CollateralVault: collateralVaultAddress,
      PriceOracleAdapter: oracleAddress,
      RiskEngine: riskEngineAddress,
      LendingVault: lendingVaultAddress,
      LiquidationManager: liquidationManagerAddress,
      NativeCollateralBridge: nativeBridgeAddress,
      FiatOnRampGateway: fiatGatewayAddress,
      TokenVerificationGate: verificationGateAddress,
    },
  };

  const outputPath = path.join(__dirname, "../deployed-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment configuration written to: ${outputPath}`);
  console.log("Protocol deployment complete!");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});

#!/usr/bin/env node

/**
 * Balance Checker: XRPL Testnet & XRPL EVM Sidechain
 * Checks your wallet balances on both networks without submitting transactions.
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load .env from bridge-tool/.env or root .env
const bridgeEnvPath = path.join(__dirname, ".env");
if (fs.existsSync(bridgeEnvPath)) {
  dotenv.config({ path: bridgeEnvPath });
} else {
  dotenv.config();
}

const xrpl = require("xrpl");
const { ethers } = require(path.join(__dirname, "../frontend/node_modules/ethers"));

const XRPL_TESTNET_WS = process.env.XRPL_WS_URL || "wss://s.altnet.rippletest.net:51233";
const EVM_RPC_URL = process.env.EVM_RPC_URL || "https://rpc.testnet.xrplevm.org/";

async function main() {
  console.log("\n============================================================");
  console.log("   AMLP Dual-Chain Balance Inspector (XRPL & XRPL EVM)");
  console.log("============================================================\n");

  const args = process.argv.slice(2);
  let seed = process.env.XRPL_SEED || "";
  let evmAddress = process.env.EVM_DESTINATION_ADDRESS || "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--seed" && args[i + 1]) seed = args[++i];
    else if (args[i] === "--dest" && args[i + 1]) evmAddress = args[++i];
    else if (args[i].startsWith("s") || args[i].startsWith("r")) seed = args[i];
    else if (args[i].startsWith("0x")) evmAddress = args[i];
  }

  let xrplAddress = "";
  let xrplWallet = null;

  if (seed) {
    try {
      if (seed.startsWith("s")) {
        xrplWallet = xrpl.Wallet.fromSeed(seed.trim());
        xrplAddress = xrplWallet.address;
      } else if (seed.startsWith("r")) {
        xrplAddress = seed.trim();
      }
    } catch (e) {
      console.warn(`[!] Warning: Could not derive XRPL wallet from seed: ${e.message}`);
    }
  }

  // 1. Check XRPL Testnet
  console.log(`[1/2] Connecting to XRPL Testnet (${XRPL_TESTNET_WS})...`);
  const client = new xrpl.Client(XRPL_TESTNET_WS);
  try {
    await client.connect();
    if (xrplAddress) {
      try {
        const accInfo = await client.request({
          command: "account_info",
          account: xrplAddress,
          ledger_index: "validated",
        });
        const xrpBalance = xrpl.dropsToXrp(accInfo.result.account_data.Balance);
        console.log(`  -> XRPL Address : ${xrplAddress}`);
        console.log(`  -> XRP Balance  : \x1b[32m${xrpBalance} XRP\x1b[0m`);
      } catch (err) {
        if (err.data && err.data.error === "actNotFound") {
          console.log(`  -> XRPL Address : ${xrplAddress}`);
          console.log(`  -> Status       : \x1b[33mAccount not yet activated on testnet (Needs 10 XRP reserve)\x1b[0m`);
        } else {
          console.log(`  -> XRPL Address : ${xrplAddress}`);
          console.log(`  -> Error        : ${err.message}`);
        }
      }
    } else {
      console.log(`  -> XRPL Address : \x1b[33mNot configured in bridge-tool/.env (Set XRPL_SEED)\x1b[0m`);
    }
  } catch (err) {
    console.error(`  [X] Failed to connect to XRPL Testnet: ${err.message}`);
  } finally {
    if (client.isConnected()) await client.disconnect();
  }

  // 2. Check XRPL EVM Sidechain
  console.log(`\n[2/2] Connecting to XRPL EVM Sidechain (${EVM_RPC_URL})...`);
  try {
    const provider = new ethers.JsonRpcProvider(EVM_RPC_URL);
    const network = await provider.getNetwork();
    console.log(`  -> Connected to Chain ID: ${network.chainId.toString()}`);

    if (evmAddress && ethers.isAddress(evmAddress.trim())) {
      const cleanAddress = evmAddress.trim();
      const balanceWei = await provider.getBalance(cleanAddress);
      const balanceEther = ethers.formatEther(balanceWei);
      console.log(`  -> EVM Address  : ${cleanAddress}`);
      console.log(`  -> XRP (Gas)    : \x1b[32m${parseFloat(balanceEther).toFixed(4)} XRP\x1b[0m`);
    } else {
      console.log(`  -> EVM Address  : \x1b[33mNot configured in bridge-tool/.env (Set EVM_DESTINATION_ADDRESS)\x1b[0m`);
    }
  } catch (err) {
    console.error(`  [X] Failed to connect to XRPL EVM Sidechain: ${err.message}`);
  }

  console.log("\n------------------------------------------------------------");
  console.log("Ready to bridge? Run:");
  console.log("  npm run bridge");
  console.log("------------------------------------------------------------\n");
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});

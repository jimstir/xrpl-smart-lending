#!/usr/bin/env node

/**
 * XRPL -> XRPL EVM Sidechain Cross-Chain Bridge
 * Connects your XRPL Testnet wallet to the official Axelar Testnet Gateway (rNrjh1KGZk2jBR3wPfAQnoidtFFYQKbQn2)
 * and bridges testnet XRP directly into your MetaMask / EVM address on the XRPL EVM Sidechain.
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

// Axelar XRPL Testnet Gateway
const AXELAR_XRPL_GATEWAY = "rNrjh1KGZk2jBR3wPfAQnoidtFFYQKbQn2";
const DESTINATION_CHAIN = "xrpl-evm";
const XRPL_TESTNET_WS = process.env.XRPL_WS_URL || "wss://s.altnet.rippletest.net:51233";
const EVM_RPC_URL = process.env.EVM_RPC_URL || "https://rpc.testnet.xrplevm.org/";

function parseCliArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--seed" && args[i + 1]) {
      parsed.seed = args[++i];
    } else if (arg === "--dest" && args[i + 1]) {
      parsed.dest = args[++i];
    } else if (arg === "--amount" && args[i + 1]) {
      parsed.amount = args[++i];
    } else if (arg === "--gas" && args[i + 1]) {
      parsed.gas = args[++i];
    } else if (arg === "--no-watch") {
      parsed.noWatch = true;
    } else if (!arg.startsWith("-")) {
      // Positional parameter detection
      if (arg.startsWith("s") && !parsed.seed) {
        parsed.seed = arg;
      } else if (arg.startsWith("0x") && !parsed.dest) {
        parsed.dest = arg;
      } else if (!isNaN(parseFloat(arg)) && !parsed.amount) {
        parsed.amount = arg;
      } else if (!parsed.seed) {
        parsed.seed = arg;
      }
    }
  }
  return parsed;
}

function stringToHex(str) {
  return Buffer.from(str, "utf8").toString("hex").toUpperCase();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function promptInput(questionText) {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(questionText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n============================================================");
  console.log("   AMLP XRPL -> XRPL EVM Sidechain Bridge Tool (Testnet)");
  console.log("============================================================\n");

  const cli = parseCliArgs();

  // 1. Resolve Seed (Prioritize Command-Line Argument for security)
  let seed = (cli.seed || process.env.XRPL_SEED || "").trim();

  if (!seed && process.stdin.isTTY) {
    seed = await promptInput("🔑 Enter your XRPL Testnet Seed (starts with s...): ");
  }

  // Validate Seed
  if (!seed) {
    console.error("\x1b[31m[ERROR] XRPL Seed missing!\x1b[0m");
    console.error("Please supply your testnet seed directly in the command line:");
    console.error("  \x1b[32mnpm run bridge <YOUR_XRPL_SEED>\x1b[0m");
    console.error("Example:");
    console.error("  npm run bridge sEd... [optional_amount]\n");
    console.error("Or with explicit flags:");
    console.error("  npm run bridge -- --seed s... --amount 25\n");
    process.exit(1);
  }

  // Resolve Destination Address
  let destAddress = (cli.dest || process.env.EVM_DESTINATION_ADDRESS || "").trim();
  if (!destAddress && process.stdin.isTTY) {
    destAddress = await promptInput("🦊 Enter Destination MetaMask Address (starts with 0x...): ");
  }
  const amountStr = (cli.amount || process.env.BRIDGE_AMOUNT_XRP || "25").trim();
  const gasFeeDrops = (cli.gas || process.env.BRIDGE_GAS_FEE_DROPS || "150000").trim();
  const watchConfirmation = !cli.noWatch && process.env.WATCH_FOR_CONFIRMATION !== "false";

  // Validate Seed
  if (!seed) {
    console.error("\x1b[31m[ERROR] XRPL Seed missing!\x1b[0m");
    console.error("Please add your testnet seed in \x1b[33mbridge-tool/.env\x1b[0m:");
    console.error("  XRPL_SEED=s...\n");
    console.error("Or pass via CLI:");
    console.error("  npm run bridge -- --seed s... --dest 0x... --amount 25\n");
    process.exit(1);
  }

  let wallet;
  try {
    wallet = xrpl.Wallet.fromSeed(seed);
  } catch (err) {
    console.error(`\x1b[31m[ERROR] Invalid XRPL seed:\x1b[0m ${err.message}`);
    process.exit(1);
  }

  // Validate Destination EVM Address
  if (!destAddress || !ethers.isAddress(destAddress)) {
    console.error(`\x1b[31m[ERROR] Invalid or missing EVM Destination Address:\x1b[0m "${destAddress}"`);
    console.error("Please provide a valid 0x... address in bridge-tool/.env or via --dest 0x...\n");
    process.exit(1);
  }

  const cleanEvmAddress = ethers.getAddress(destAddress); // Checksummed
  const destNo0x = cleanEvmAddress.slice(2).toLowerCase();

  // Validate Bridge Amount
  const amountXrp = parseFloat(amountStr);
  if (isNaN(amountXrp) || amountXrp <= 0) {
    console.error(`\x1b[31m[ERROR] Invalid bridge amount:\x1b[0m "${amountStr}" XRP`);
    process.exit(1);
  }

  const gasFeeXrp = parseFloat(xrpl.dropsToXrp(gasFeeDrops));
  if (amountXrp <= gasFeeXrp) {
    console.error(`\x1b[31m[ERROR] Bridge amount (${amountXrp} XRP) must be greater than relayer fee (${gasFeeXrp} XRP)\x1b[0m`);
    process.exit(1);
  }

  const estimatedArrivalXrp = (amountXrp - gasFeeXrp).toFixed(6);

  console.log("Cross-Chain Routing Parameters:");
  console.log(`  Source Chain        : XRPL Testnet (Native Ledger)`);
  console.log(`  Source Address      : \x1b[36m${wallet.address}\x1b[0m`);
  console.log(`  Destination Chain   : XRPL EVM Sidechain (Chain ID: 1449000)`);
  console.log(`  Destination Address : \x1b[36m${cleanEvmAddress}\x1b[0m`);
  console.log(`  Bridge Gateway      : ${AXELAR_XRPL_GATEWAY} (Axelar Testnet)`);
  console.log(`  Amount to Transfer  : \x1b[32m${amountXrp} XRP\x1b[0m`);
  console.log(`  Relayer Gas Fee     : ${gasFeeXrp} XRP (${gasFeeDrops} drops)`);
  console.log(`  Estimated on EVM    : \x1b[32m~${estimatedArrivalXrp} XRP (Gas Token)\x1b[0m\n`);

  // 2. Connect to EVM Sidechain & Get Starting Balance
  console.log(`[1/4] Querying initial EVM Sidechain balance...`);
  const evmProvider = new ethers.JsonRpcProvider(EVM_RPC_URL);
  let startingEvmBalanceWei = 0n;
  try {
    startingEvmBalanceWei = await evmProvider.getBalance(cleanEvmAddress);
    console.log(`  Current EVM Gas Balance: ${ethers.formatEther(startingEvmBalanceWei)} XRP`);
  } catch (err) {
    console.warn(`  [!] Warning: Could not query starting EVM balance: ${err.message}`);
  }

  // 3. Connect to XRPL Testnet
  console.log(`\n[2/4] Connecting to XRPL Testnet (${XRPL_TESTNET_WS})...`);
  const client = new xrpl.Client(XRPL_TESTNET_WS);
  await client.connect();
  console.log("  Connected successfully!");

  // Verify Source Balance
  let sourceBalanceXrp = 0;
  try {
    const accInfo = await client.request({
      command: "account_info",
      account: wallet.address,
      ledger_index: "validated",
    });
    sourceBalanceXrp = parseFloat(xrpl.dropsToXrp(accInfo.result.account_data.Balance));
    console.log(`  Source Balance: ${sourceBalanceXrp.toFixed(4)} XRP`);
  } catch (err) {
    if (err.data && err.data.error === "actNotFound") {
      console.log(`  [i] Account ${wallet.address} is not yet activated on testnet.`);
      console.log(`  [i] Requesting activation & 100 Testnet XRP from official XRPL faucet...`);
      try {
        const faucetRes = await fetch("https://faucet.altnet.rippletest.net/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination: wallet.address, xrpAmount: "100" }),
        });
        const faucetData = await faucetRes.json();
        console.log(`  [✓] Successfully activated with 100 Testnet XRP! (Tx: ${faucetData.transactionHash.slice(0, 10)}...)`);
        await sleep(3000);
        const retryInfo = await client.request({
          command: "account_info",
          account: wallet.address,
          ledger_index: "validated",
        });
        sourceBalanceXrp = parseFloat(xrpl.dropsToXrp(retryInfo.result.account_data.Balance));
        console.log(`  Source Balance: ${sourceBalanceXrp.toFixed(4)} XRP`);
      } catch (faucetErr) {
        await client.disconnect();
        console.error(`\x1b[31m[ERROR] Auto-activation failed:\x1b[0m ${faucetErr.message}`);
        process.exit(1);
      }
    } else {
      await client.disconnect();
      console.error(`\x1b[31m[ERROR] Account check failed:\x1b[0m ${err.message}`);
      process.exit(1);
    }
  }

  // Ensure balance covers amount + 10 XRP base reserve
  const minRequired = amountXrp + 10.05;
  if (sourceBalanceXrp < minRequired) {
    console.warn(`\x1b[33m[!] Warning: You have ${sourceBalanceXrp.toFixed(2)} XRP. XRPL requires a 10 XRP base reserve.`);
    console.warn(`Attempting to transfer ${amountXrp} XRP may fail if it breaches the reserve limit.\x1b[0m\n`);
  }

  // 4. Construct Axelar Cross-Chain Payment
  console.log(`\n[3/4] Preparing and signing Axelar Interchain Transfer payment...`);
  const paymentTx = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: AXELAR_XRPL_GATEWAY,
    Amount: xrpl.xrpToDrops(amountXrp.toString()),
    Memos: [
      {
        Memo: {
          MemoType: stringToHex("type"),
          MemoData: stringToHex("interchain_transfer"),
        },
      },
      {
        Memo: {
          MemoType: stringToHex("destination_chain"),
          MemoData: stringToHex(DESTINATION_CHAIN),
        },
      },
      {
        Memo: {
          MemoType: stringToHex("destination_address"),
          MemoData: stringToHex(destNo0x),
        },
      },
      {
        Memo: {
          MemoType: stringToHex("gas_fee_amount"),
          MemoData: stringToHex(gasFeeDrops),
        },
      },
    ],
  };

  console.log("  Submitting to XRP Ledger...");
  let response;
  try {
    response = await client.submitAndWait(paymentTx, { wallet });
  } catch (err) {
    await client.disconnect();
    console.error(`\x1b[31m[ERROR] Payment submission failed:\x1b[0m ${err.message}`);
    process.exit(1);
  } finally {
    if (client.isConnected()) await client.disconnect();
  }

  const result = response.result;
  const txResult = result.meta && typeof result.meta === "object" ? result.meta.TransactionResult : "UNKNOWN";

  if (txResult !== "tesSUCCESS") {
    console.error(`\x1b[31m[ERROR] Transaction rejected on-chain:\x1b[0m ${txResult}`);
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const txHash = result.hash;

  console.log("\n============================================================");
  console.log("   \x1b[32m[SUCCESS] Cross-Chain Transfer Submitted to XRP Ledger!\x1b[0m");
  console.log("============================================================");
  console.log(`  XRPL Tx Hash     : \x1b[36m${txHash}\x1b[0m`);
  console.log(`  Ledger Index     : ${result.ledger_index}`);
  console.log(`  Explorer Link    : https://testnet.xrpl.org/transactions/${txHash}`);
  console.log(`  Axelarscan Link  : https://testnet.axelarscan.io/transfer/${txHash}`);
  console.log("------------------------------------------------------------\n");

  if (!watchConfirmation) {
    console.log("Watch mode disabled. You can track confirmation status directly on Axelarscan above.");
    return;
  }

  // 5. Watch for Confirmation on EVM Sidechain
  console.log(`[4/4] Monitoring XRPL EVM Sidechain for token arrival...`);
  console.log(`  Polling address ${cleanEvmAddress} every 10s...`);
  console.log(`  (Axelar testnet relayers typically take 1 to 3 minutes)\n`);

  const startTime = Date.now();
  const maxTimeoutMs = 8 * 60 * 1000; // 8 minutes

  while (Date.now() - startTime < maxTimeoutMs) {
    await sleep(10000);
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    try {
      const currentEvmBalanceWei = await evmProvider.getBalance(cleanEvmAddress);
      if (currentEvmBalanceWei > startingEvmBalanceWei) {
        const receivedWei = currentEvmBalanceWei - startingEvmBalanceWei;
        const receivedEther = ethers.formatEther(receivedWei);

        console.log("\n============================================================");
        console.log("   \x1b[32m🎉 BRIDGE COMPLETE! Funds Landed on XRPL EVM Sidechain!\x1b[0m");
        console.log("============================================================");
        console.log(`  EVM Address       : ${cleanEvmAddress}`);
        console.log(`  Received Gas XRP  : \x1b[32m+${receivedEther} XRP\x1b[0m`);
        console.log(`  New Total Balance : \x1b[32m${ethers.formatEther(currentEvmBalanceWei)} XRP\x1b[0m`);
        console.log(`  Elapsed Time      : ${elapsedSec} seconds`);
        console.log("------------------------------------------------------------");
        console.log("Your MetaMask wallet now has gas to test AMLP Lending Vaults!");
        console.log("Visit: http://localhost:3000\n");
        return;
      }

      process.stdout.write(`  [${elapsedSec}s elapsed] Waiting for Axelar relayer mint... \r`);
    } catch (pollErr) {
      // Ignore transient network glitches during polling
    }
  }

  console.log(`\n\n[INFO] Monitoring timed out after 8 minutes.`);
  console.log(`Your transaction has been validated on XRPL. Relayer processing may still be queued.`);
  console.log(`Check live status on Axelarscan:`);
  console.log(`  https://testnet.axelarscan.io/transfer/${txHash}\n`);
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});

# XRPL $\rightarrow$ XRPL EVM Sidechain Bridge Tool (Testnet)

A self-contained command-line utility to bridge testnet XRP from an **XRP Ledger** account (`r...`) directly into a **MetaMask** wallet (`0x...`) on the **XRPL EVM Sidechain Testnet**.

---

## 1. Quickstart (2 Steps)

### Step 1: Set Your MetaMask Address in `.env`
Create a `.env` file in the `bridge-tool/` directory:

```bash
cp bridge-tool/.env.example bridge-tool/.env
```

Open `bridge-tool/.env` and paste your destination MetaMask address:
```env
EVM_DESTINATION_ADDRESS=0xYourMetaMaskAddress
```

*(Note: Your secret XRPL seed is **not** stored in `.env`. You pass it directly in the command below for security).*

---

### Step 2: Run the Bridge Command
Pass your XRPL testnet seed directly in the terminal:

```bash
npm run bridge <YOUR_XRPL_SEED>
```

**Example**:
```bash
npm run bridge sEdT7a... 25
```

The script will:
1. Derive your `r...` address from the seed without saving it to disk.
2. Check your balance on the XRPL Testnet.
3. Submit the cross-chain transfer to the official **Axelar Testnet Gateway** (`rNrjh1KGZk2jBR3wPfAQnoidtFFYQKbQn2`).
4. Output your XRPL transaction hash, XRPL Explorer link, and Axelarscan tracking link.
5. Automatically watch your MetaMask address on the XRPL EVM Sidechain until the funds arrive!

---

## 2. Check Balances at Any Time
You can check balances on both chains using:

```bash
npm run bridge:balances <YOUR_XRPL_SEED>
```

---

## 3. Alternative Command-Line Flags
If you don't even want to use a `.env` file at all, you can pass everything directly:

```bash
npm run bridge <YOUR_XRPL_SEED> <DESTINATION_0x_ADDRESS> <AMOUNT>
```

Or with explicit flags:
```bash
npm run bridge -- --seed s... --dest 0x... --amount 50
```

Flags:
* `--seed <secret>`: Your XRPL testnet seed (`s...`)
* `--dest <address>`: Your destination EVM address (`0x...`)
* `--amount <number>`: Number of testnet XRP to bridge (e.g. `20`)
* `--gas <drops>`: Relayer gas fee in drops (default: `150000` = 0.15 XRP)
* `--no-watch`: Submits transaction and exits immediately without polling the EVM chain

---

## 3. Frequently Asked Questions

### Do I need real Mainnet XRP?
**No!** This entire process is 100% on the Testnet. You never need real money, mainnet XRP, or credit cards.

### What is the Axelar relayer fee?
Cross-chain bridging requires relayer validators to observe the XRP Ledger and mint native gas tokens on the EVM Sidechain. The 0.15 XRP fee is deducted **directly from the testnet XRP being bridged**.

### How long does the transfer take?
* **XRPL Validation**: ~3 to 5 seconds.
* **Axelar Cross-Chain Relaying**: ~1 to 3 minutes for validators to finalize on the EVM Sidechain.
* The script polls your EVM address every 10 seconds and notifies you as soon as the funds land.

### How do I track my transaction?
Every transaction gives you two direct explorer links:
* **XRPL Testnet Explorer**: `https://testnet.xrpl.org/transactions/<TX_HASH>`
* **Axelarscan Testnet**: `https://testnet.axelarscan.io/transfer/<TX_HASH>`

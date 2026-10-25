# Technical Architecture Document: AI-Managed Lending Platform on XRPL EVM

---

## 1. Executive Summary

The **AI-Managed Lending Platform (AMLP)** is an autonomous, non-custodial decentralized finance (DeFi) credit protocol deployed on the **XRP Ledger (XRPL) EVM Sidechain**. The protocol enables depositors to earn yield on supported stablecoins, allows borrowers to draw liquidity against overcollateralized multi-token vaults, and integrates an autonomous **AI Lending Agent** to perform continuous risk monitoring, liquidation orchestration, loan prioritization, and post-liquidation recovery reconciliation.

A non-negotiable core architectural invariant of the platform is the **Separation of Powers**:
* **Smart Contracts are Sovereign**: All financial state transitions, solvency checks, collateral requirements, liquidation rules, loan-to-value (LTV) limits, and access controls are **hardcoded and deterministically enforced** on-chain.
* **AI Agent is Bounded**: The AI agent reasons over multi-dimensional market telemetry, borrower request queues, and liquidation urgency to prioritize and coordinate actions. The agent holds strictly bounded execution privileges and cannot bypass smart contract risk rules or withdraw protocol funds.

```mermaid
flowchart TB
    subgraph Users ["Market Participants"]
        Depositor["Depositor / LP"]
        Borrower["Borrower"]
        Operator["Protocol Operator"]
    end

    subgraph Dashboard ["Component 4: Monitoring Dashboard"]
        UI["Web UI / Analytics"]
        EventStream["EVM RPC & Event Indexer"]
    end

    subgraph AgentLayer ["Component 3: AI Lending Agent (Off-Chain Autonomous Service)"]
        Telemetry["Telemetry & State Sync Engine"]
        ReasoningCore["AI Reasoning Core (LLM + Risk Heuristics)"]
        TxExecutor["Bounded Transaction Relayer (EIP-712)"]
        Reconciliation["Recovery & Reconciliation Worker"]
    end

    subgraph Oracles ["Component 2: Oracle & FX Engine"]
        XRPL_Feeds["XRPL EVM Price Feeds (Band / Pyth / XRPL Bridge)"]
        Mastercard_API["Mastercard FX / Currency Conversion API"]
    end

    subgraph SmartContracts ["Component 1: Lending Smart Contracts (XRPL EVM)"]
        Pool["LendingVault.sol (Liquidity & Accounting)"]
        Vault["CollateralVault.sol (Multi-Token Escrow)"]
        Risk["RiskEngine.sol (LTV & Health Factor)"]
        LiqEngine["LiquidationEngine.sol (Debt Auction & Settlement)"]
        CircuitBreaker["EmergencyController.sol (Pausable & Circuit Breakers)"]
    end

    Depositor -->|Deposit Stablecoins / Earn Yield| Pool
    Borrower -->|Lock Collateral| Vault
    Borrower -->|Request Borrow / Repay Debt| Pool
    Pool --> Risk
    Vault --> Risk
    Risk --> Oracles
    Mastercard_API -.->|Fiat FX Reference| Oracles

    Telemetry -->|Poll Events & Position States| SmartContracts
    ReasoningCore --> Telemetry
    ReasoningCore -->|Dispatch Prioritized Actions| TxExecutor
    TxExecutor -->|Submit Bounded Liquidations & Parameter Updates| LiqEngine
    TxExecutor -->|Coordinate Loan Approvals| Pool

    Reconciliation -->|Verify Debt Repayment & Waterfall| LiqEngine
    Reconciliation -->|Alert Discrepancies| Operator

    SmartContracts --> EventStream
    AgentLayer --> EventStream
    EventStream --> UI
```

---

## 2. System Architecture & Component Breakdown

### 2.1 Component 1: Lending Smart Contracts (XRPL EVM)

The smart contract layer is deployed on the XRPL EVM Sidechain using Solidity (`^0.8.24`) compiled via EVM Shanghai/Cancun target, leveraging EVM compatibility while inheriting fast finality and low transaction costs.

```mermaid
graph LR
    subgraph CoreContracts ["Lending Contract Suite"]
        LV[LendingVault]
        CV[CollateralVault]
        RE[RiskEngine]
        LE[LiquidationEngine]
        EC[EmergencyController]
    end

    LV <-->|Collateral Balances & Lock State| CV
    LV -->|Validate Borrow & Repay Limits| RE
    LE -->|Liquidate Undercollateralized Debt| LV
    LE -->|Seize & Distribute Collateral| CV
    EC -.->|Emergency Pause / Resume| LV
    EC -.->|Emergency Freeze Asset| CV
    EC -.->|Pause Liquidations| LE
```

#### 2.1.1 `LendingVault.sol` (Vault Core)
- **Role**: Manages supplied liquidity, mints interest-bearing liquidity receipt tokens (`vaultShare`, e.g., `amRLUSD`), coordinates borrowing, and tracks user debt balances.
- **MVP Asset Focus**: Direct deposits and borrowing of one primary EVM stablecoin (e.g., Ripple USD - **RLUSD** or bridged stablecoin).
- **Interest Rate Model**: Owner-configured strategy supporting two primary operational modes:
  - **Mode A (Fixed APR Strategy)**: The owner configures a flat, predictable annual percentage rate (e.g., flat 8.0% APR) applied across all originated loans from the vault.
  - **Mode B (Owner-Calibrated Utilization Curve)**: The owner configures dynamic reserve-protection curve parameters:
    $$\text{Borrow APR}(U) = \begin{cases} 
    R_0 + \left( \frac{U}{U_{\text{optimal}}} \times R_1 \right) & \text{if } U \le U_{\text{optimal}} \\
    R_0 + R_1 + \left( \frac{U - U_{\text{optimal}}}{1 - U_{\text{optimal}}} \times R_2 \right) & \text{if } U > U_{\text{optimal}}
    \end{cases}$$
    Where:
    - $U$ is current capital utilization ($U = D_{\text{total}} / L_{\text{supplied}}$).
    - $U_{\text{optimal}}$ is owner-configured target utilization (e.g., 80%).
    - $R_0$ is owner-configured base borrow rate floor (e.g., 4%).
    - $R_1$ is owner-configured slope 1 rate (e.g., 4%, yielding 8% APR at target).
    - $R_2$ is owner-configured scarcity jump multiplier rate (e.g., scaling up to 40%+).
  - **AI Agent Rate Advisory**: The AI Lending Agent continuously monitors vault activity and submits structured calibration proposals (Idle Capital Stimulation, Scarcity & Yield Optimization, Market Alignment) to the owner dashboard for 1-click execution.

#### 2.1.2 `CollateralVault.sol` (Multi-Collateral Escrow)
- **Role**: Segregated, non-custodial custody of permitted collateral assets.
- **Multi-Token Accounting**: Supports multiple registered ERC-20 assets (e.g., wrapped XRP `wXRP`, wrapped Bitcoin `wBTC`, wrapped Ethereum `wETH`, and stable pairs).
- **Internal Ledger**:
  - Tracks user balances per asset: `mapping(address => mapping(address => uint256)) internal userCollateral`.
  - Distinguishes between free collateral and locked collateral backing active borrows.
  - Cross-margin aggregation or isolated vault mode selectable per asset risk tier.

#### 2.1.3 `RiskEngine.sol` (Risk & Solvency Enforcement)
- **Role**: Mathematical engine computing position solvency, maximum borrowing capacity, and health factors. Smart contracts call `RiskEngine` synchronously during any borrow, collateral withdraw, or liquidation attempt.
- **Core Parameters (Per Asset)**:
  - $\text{LTV}_{\text{max}}$: Maximum Loan-to-Value ratio for new borrowings (e.g., 70%).
  - $\text{LT}$: Liquidation Threshold ratio (e.g., 80%).
  - $\text{LP}$: Liquidation Penalty / Bonus for liquidators (e.g., 5% to 10%).
  - $\text{ReserveFactor}$: Fraction of interest diverted to protocol bad-debt reserve (e.g., 10%).
- **Health Factor Formula**:
  $$H_f = \frac{\sum_{i=1}^{N} \left( C_i \times P_i \times \text{LT}_i \right)}{\sum_{j=1}^{M} \left( B_j \times P_j \right)}$$
  Where:
  - $C_i$ is collateral quantity of asset $i$.
  - $P_i$ is USD price of asset $i$ from `PriceOracle`.
  - $\text{LT}_i$ is the liquidation threshold of asset $i$.
  - $B_j$ is outstanding borrowed principal + accrued interest for borrow asset $j$.
  - $P_j$ is USD price of borrow asset $j$.
- **Invariants**:
  - If $H_f \ge 1.0$, position is **solvent** and cannot be liquidated.
  - If $H_f < 1.0$, position is **undercollateralized** and immediately eligible for liquidation on-chain.
  - A user cannot borrow or withdraw collateral if the resulting operation results in $H_f < 1.05$ (safety margin above liquidation threshold).

#### 2.1.4 `LiquidationEngine.sol` (Settlement & Waterfall)
- **Role**: Allows permitted liquidators (including the AI Lending Agent or external third-party searchers) to repay undercollateralized debt in exchange for discounted collateral.
- **Liquidation Mechanics**:
  - Repayment amount capped at close factor (e.g., up to 50% of outstanding debt in normal conditions, 100% in deep undercollateralization $H_f < 0.90$).
  - Collateral seized:
    $$\text{Collateral Seized} = \frac{\text{Debt Repaid} \times P_{\text{debt}} \times (1 + \text{LP})}{P_{\text{collateral}}}$$
  - **Repayment Waterfall**:
    1. Seized collateral is transferred to the liquidator or liquidated on pool behalf.
    2. Outstanding debt balance is extinguished in `LendingVault`.
    3. Accrued protocol fee fraction is deposited into the Protocol Reserve Vault.
    4. Remaining collateral remains in the borrower's vault balance.

#### 2.1.5 `EmergencyController.sol` (Circuit Breakers & Pausing)
- **Role**: Tiered circuit breaker providing defense-in-depth against market anomalies, oracle corruption, or smart contract exploits.
- **Execution Tiers**:
  - `PAUSE_BORROWING`: Temporarily halts new borrow originations.
  - `PAUSE_DEPOSITS`: Halts new capital deposits.
  - `PAUSE_LIQUIDATIONS`: Freezes liquidation calls in case of erratic oracle data.
  - `FREEZE_ASSET(token)`: Isolates a specific distressed collateral token while keeping other operations live.
  - `EMERGENCY_SHUTDOWN`: Total pause, allowing only orderly collateral withdrawal and debt repayment.
- **Access Control**: Multisig Operator, Timelock, and bounded AI Agent Guardian role (AI can trigger emergency pause under strict automated conditions, but *cannot* unpause without human multisig approval).

---

### 2.2 Component 2: Price Oracle & FX Engine

Reliable asset pricing is critical for collateral valuation, borrower solvency, and liquidation execution. The protocol integrates decentralized on-chain oracle feeds across both the **XRPL EVM Sidechain** and the **XRP Ledger Mainchain**, while bypassing oracle complexity for fiat deposits by exclusively handling **USD stablecoin deposits at 1:1 parity**.

```mermaid
flowchart TD
    subgraph MultiChainOracles ["On-Chain Oracle Systems (Periodically Polled by AI Agent)"]
        SidechainFeeds["XRPL EVM Sidechain Oracles\n(Pyth Network / Band Protocol)"]
        XRPLNativeFeeds["XRPL Mainchain Native Oracles\n(XLS-47d PriceOracle Objects)"]
    end

    subgraph FiatRails ["Fiat Rails (USD Stablecoin Exclusivity)"]
        MastercardDirect["Mastercard / BVNK Rails\n(1:1 Direct USD-to-RLUSD Settlement)"]
    end

    subgraph OracleAdapter ["Oracle Engine (PriceOracleAdapter.sol & BridgeAdapter)"]
        Aggregator["Cross-Chain Valuation Aggregator"]
        FreshnessCheck{"Freshness & Heartbeat Check\n(Price Age < 5 Minutes?)"}
        DeviationCheck{"Deviation Guard\n(Cross-Feed Spread < 2%?)"}
        Cache["Validated Collateral Valuations"]
    end

    SidechainFeeds -->|EVM ERC-20 Asset Prices| Aggregator
    XRPLNativeFeeds -->|Native XRP & Trustline Prices via Relayer| Aggregator
    MastercardDirect -.->|Direct 1:1 USD Mint (No FX Oracle Needed)| Cache
    Aggregator --> FreshnessCheck
    FreshnessCheck -->|Pass| DeviationCheck
    FreshnessCheck -->|Stale Feed| FallbackMode["Reject Query / Freeze Asset Actions"]
    DeviationCheck -->|Pass| Cache
    DeviationCheck -->|Spread > 2%| AlertTrip["Trip Circuit Breaker & Revert"]
```

#### 2.2.1 XRPL EVM Sidechain On-Chain Feeds
- **Integrations**: Integrates available EVM-compatible oracle feeds on the XRPL EVM Sidechain (e.g., Pyth Network pull/push oracles, Band Protocol standard aggregators).
- **Parameters**:
  - `heartbeat`: Maximum acceptable elapsed time since last update. Managed via an environment-configurable parameter `maxAllowedOracleDelay` in `PriceOracleAdapter.sol` (defaults to 300 seconds / 5 minutes on Mainnet; configurable up to 3,600 seconds on Testnet via `MAX_ORACLE_DELAY_SECONDS`).
  - `deviationThreshold`: Price movement trigger (0.5% price delta initiates feed update).
  - `confidenceInterval`: Minimum oracle confidence bounds; wide spreads trigger fallback mechanisms.
- **Testnet Latest-Price Query Mode**:
  - To prevent protocol stalls during intermittent testnet oracle update intervals, `PriceOracleAdapter.sol` provides an explicit testnet query mode allowing the contracts to read the latest recorded round data directly without reverting on heartbeat timeouts during local development and testing.

#### 2.2.2 XRPL Mainchain Native Price Oracles (XLS-47d)
- **Native Implementation**: Integrates native XRPL `PriceOracle` ledger objects introduced in XLS-47d. Decentralized oracle providers submit `OracleSet` transactions on the XRP Ledger mainchain.
- **Relay & Verification**: Relayed across the Axelar General Message Passing (GMP) network and witness relayer nodes to the EVM sidechain bridge adapter.
- **Role**: Provides authoritative pricing for native XRP and issued trustline tokens held in `EscrowCreate` locks, defining which native XRPL assets are eligible for vault collateral.

#### 2.2.3 Mastercard USD Stablecoin Parity (No Oracle Required)
- **Direct 1:1 USD Settlement**: Mastercard payment rails exclusively process **USD stablecoin deposits** (converting USD fiat directly into RLUSD at an exact 1:1 parity).
- **No Foreign Exchange Oracle Needed**: Because deposits and redemptions are strictly dollar-denominated and settled 1:1 into RLUSD, no foreign exchange (FX) conversion oracle or currency quotation engine is required, eliminating foreign exchange volatility risk and oracle attack surfaces.

#### 2.2.4 Periodic AI Agent Oracle Polling & Withdrawal Solvency
- The AI Lending Agent **periodically polls and verifies** oracle health on both the XRPL EVM Sidechain and the native XRP Ledger mainchain.
- When a borrower requests a collateral withdrawal, the smart contract (`RiskEngine.sol`) calculates the position's projected Health Factor using verified, fresh oracle prices. If the projected Health Factor falls below 1.05, the withdrawal transaction reverts on-chain.

---

### 2.3 Component 3: AI Lending Agent Architecture

The AI Lending Agent is an autonomous off-chain service running in a secure, containerized execution environment. It pairs high-speed deterministic state tracking with Large Language Model (LLM) and machine learning risk heuristics.

```mermaid
flowchart TB
    subgraph DataIngestion ["1. Telemetry Ingestion"]
        RPCWatcher["XRPL EVM RPC Listener"]
        XRPLWatcher["XRPL Mainchain Native Listener (XLS-47d)"]
        MempoolWatcher["Mempool & Gas Monitor"]
        MarketDepth["DEX Liquidity & Slippage Monitor"]
    end

    subgraph AgentModules ["2. AI Agent Reasoning Subsystems"]
        Sub1["Subsystem A: Loan Monitoring & Liquidation Coordinator"]
        Sub2["Subsystem B: Borrower Eligibility & Request Prioritizer"]
        Sub3["Subsystem C: Vault Token Eligibility & Onboarding Engine"]
        Sub4["Subsystem D: Cross-Chain Oracle Monitor & Withdrawal Solvency"]
        Sub5["Subsystem E: Recovery Reconciliation & Bad Debt Engine"]
        Sub6["Subsystem F: Pool Telemetry & Risk Intelligence"]
    end

    subgraph DecisionEngine ["3. Decision & Safeguard Boundary"]
        LLMReasoning["LLM Reasoning Core (Context & Policy)"]
        HardcodedRules{"Smart Contract Hardcoded Invariant Filter"}
        EIP712Relayer["EIP-712 Intent Signer & Relayer"]
    end

    DataIngestion --> AgentModules
    AgentModules --> LLMReasoning
    LLMReasoning --> HardcodedRules
    HardcodedRules -->|Valid & In Bounds| EIP712Relayer
    HardcodedRules -->|Violation| AbortAction["Drop Proposal / Log Warning"]
    EIP712Relayer -->|Execute on XRPL EVM| SmartContracts[(Lending Smart Contracts)]
```

#### 2.3.1 Execution Runtime Options

The architecture supports two distinct execution runtime configurations, providing flexibility across local development, testnet simulation, and production deployment:

1. **Option A: Cloud API Execution (Google Gemini via Google AI Studio)**:
   - Utilizes the official `@google/genai` (or legacy `@google/generative-ai`) SDK to connect directly to Google Gemini models using an API key managed through Google AI Studio.
   - Leverages native JSON Schema Tool Calling / Function Calling for high-throughput production cloud deployments, low-maintenance infrastructure, and centralized audit logging.

2. **Option B: Local Agent Porting (Antigravity Agent Runtime for Testnet & Dev)**:
   - For local development and testnet simulation, the platform supports direct porting of an autonomous local agent runtime, such as an **Antigravity agent** or local worker daemon.
   - The local agent interfaces directly with the XRPL testnet and XRPL EVM testnet RPCs/WebSockets via local tool definitions.
   - Signs EIP-712 testnet vouchers and liquidation intents using a local developer keystore, providing zero-cloud latency, complete privacy, and full offline/local developer iteration.

#### 2.3.2 Principle: Hardcoded vs. Agent Reasoning Matrix

| Operational Phase | Hardcoded Smart Contract Rules (Inviolable) | AI Agent Reasoning & Heuristics (Autonomous) |
| :--- | :--- | :--- |
| **Loan Monitoring & Liquidation** | - Health Factor formula ($H_f < 1.0$ is strict requirement)<br>- Approved collateral and debt asset allowlists<br>- Oracle price freshness limits ($\Delta t \le \text{MaxDelay}$)<br>- Close factor and liquidation bonus caps<br>- Liquidation caller permissions | - Dynamic urgency ranking of positions approaching threshold ($H_f \in [1.00, 1.05]$)<br>- Liquidation timing based on DEX liquidity, slippage, and XRPL EVM gas fees<br>- Escalation alerts before undercollateralization occurs<br>- Batch liquidation scheduling to avoid cascading bad debt |
| **Borrower Eligibility & Requests** | - Protocol maximum LTV per collateral type<br>- Minimum collateralization ratio<br>- Absolute borrowing caps per wallet and global pool<br>- Available unborrowed pool liquidity<br>- Mandatory KYC/AML compliance flag checks | - Request prioritization when available liquidity is scarce<br>- Evaluation of borrower risk profiles (historical repayment velocity, wallet volatility)<br>- Human-readable natural language rejection explanations<br>- Recommended loan terms (optimized borrow amount or suggested collateral buffers) |
| **Token Eligibility & Vault Onboarding** | - Enforces immutable allowlist & TokenVerificationGate rules<br>- Reverts deposits of unauthorized tokens<br>- Enforces hard max LTV cap (≤ 60% for new assets)<br>- Requires multisig sign-off to activate token | - Evaluates candidate token contract bytecode & transfer standards<br>- Verifies active Pyth/Band & XLS-47d oracle feeds<br>- Simulates DEX liquidity depth & liquidation slippage<br>- Checks token holder distribution & clawback flags<br>- Proposes bounded risk parameters & supply caps |
| **Oracle Monitoring & Withdrawal Checks** | - Reverts withdrawal if projected Health Factor < 1.05<br>- Reverts if oracle price is older than 5 minutes<br>- Reverts if sidechain/mainnet oracle deviation > 2%<br>- Executes 1:1 USD redemptions without FX oracle | - Periodically polls sidechain (Pyth/Band) & mainnet (XLS-47d) oracles<br>- Detects stale feeds, oracle lag, and cross-chain pricing desync<br>- Pre-simulates borrower withdrawal impacts on pool solvency<br>- Dispatches alerts if oracle heartbeat thresholds are breached |
| **Recovery Reconciliation** | - Repayment waterfall order ($Debt \to Fee \to Reserve \to Available$)<br>- Bad-debt isolation rules<br>- Reserve fund accounting and invariant checks<br>- Conditions for unlocking recovered funds into pool | - Real-time detection of incomplete or reverted liquidations<br>- Root-cause identification of slippage/reversion discrepancies<br>- Coordination of automated retries with revised gas or split order sizes<br>- Operator alert generation for irreconcilable accounting gaps |
| **Pool Telemetry & Health** | - Maximum utilization caps<br>- Reserve replenishment minimums<br>- Emergency pause parameter boundaries | - Predictive liquidity modeling based on market trends<br>- Proactive interest rate curve steepness recommendations<br>- Early detection of collateral concentration risks across borrowers |

#### 2.3.3 Detailed Subsystem Specifications

##### Subsystem A: Loan Monitoring & Liquidation Coordinator
1. **Continuous State Polling**: Subscribes to `PositionUpdated`, `CollateralDeposited`, and `PriceUpdated` events on XRPL EVM.
2. **Predictive Health Simulation**: Computes projected health factors under 1-hour and 4-hour market volatility scenarios:
   $$H_{f,\text{projected}} = H_f \times (1 - \sigma_{\text{asset}} \times \sqrt{\Delta t})$$
3. **Execution Decision Logic**:
   - When $H_f \le 1.00$: Immediately packages an EIP-712 `LiquidationIntent` containing target borrower, debt asset, repayment amount, and seized collateral.
   - Evaluates on-chain DEX slippage on XRPL EVM to ensure liquidation collateral swap will cover debt without creating shortfall.
   - Dispatches transaction through bounded relayer.

##### Subsystem B: Borrower Eligibility & Request Prioritizer
1. **Application Queue Management**: When liquidity pool utilization exceeds $75\%$, incoming borrow requests enter a prioritization queue.
2. **Prioritization Scoring Function**: Evaluates four dynamic market regimes (Scarcity Anti-Monopoly, Volatility Buffer, Provenance & Chargeback Defense, and Balanced Longevity).
3. **Transparent Reasoning Generation**: The LLM engine generates a cryptographic attestation of why a borrower was approved or prioritized, alongside natural language explanations returned to the user interface.

##### Subsystem C: Vault Token Eligibility & Onboarding Engine
1. **Compliance & Bytecode Audit**: Runs static/dynamic inspection verifying candidate tokens adhere to standard ERC-20 rules (strictly rejecting fee-on-transfer, rebasing supply, or reentrancy vectors).
2. **Cross-Chain Oracle Verification**: Confirms active pricing from dual independent EVM feeds (Pyth/Band) and/or native XRPL Price Oracles (XLS-47d).
3. **Liquidity Stress Testing**: Simulates 20% and 40% crash scenarios to ensure liquidations can clear with $<3\%$ slippage.
4. **Bounded Proposal**: Issues cryptographically signed parameter recommendations (Max LTV $\le 60\%$, Liquidation Threshold, and total vault supply caps) for multisig governance approval.

##### Subsystem D: Cross-Chain Oracle Monitor & Withdrawal Solvency
1. **Periodic Oracle Polling**: Continuously queries both XRPL EVM sidechain oracles and XRPL mainchain XLS-47d native oracles.
2. **Freshness & Divergence Guards**: Flags feeds older than 5 minutes or diverging by $>2\%$.
3. **Withdrawal Solvency Simulation**: Pre-simulates borrower collateral releases to guarantee post-withdrawal Health Factor remains $\ge 1.05$ before unlocking escrows.
4. **Mastercard Exemption**: Identifies 1:1 direct USD stablecoin deposits, requiring zero FX oracle queries during redemptions.

##### Subsystem E: Recovery Reconciliation & Bad Debt Engine
1. **Post-Settlement Audit**: After every liquidation event, queries `LiquidationEngine` logs to verify that repaid debt and seized collateral match state changes.
2. **Discrepancy Remediation**:
   - If a shortfall occurs, the agent triggers `isolateBadDebt` and draws from the protocol reserve fund.
   - For discrepancies over $50, the agent dispatches an urgent webhook alert to the operations multisig.

##### Subsystem F: Pool Telemetry & Risk Intelligence
1. **Liquidity Heatmaps**: Tracks supply/borrow ratios, average loan durations, and utilization rates.
2. **Parameter Recommendation Engine**: Emits non-binding risk parameter adjustments (e.g., advising lowering LTV on high-volatility collateral from 70% to 65%) to governance.

---

### 2.4 Component 4: Monitoring Dashboard & Web UI (Next.js)

The monitoring dashboard is a unified full-stack web application built with **Next.js (App Router)**, TailwindCSS, viem, and Recharts. By leveraging Next.js React Server Components along with built-in API Routes and Server Actions, Next.js simultaneously serves as the interactive frontend interface and as the lightweight backend layer for RPC state caching, AI agent telemetry forwarding, and webhook ingestion—eliminating the overhead of running a separate Express or Fastify server for current deployments.

```mermaid
graph TD
    subgraph UIViews ["Next.js Frontend Visual Panels"]
        Panel1["1. Pool Liquidity & Reserve Metrics"]
        Panel2["2. Loan Positions & Health Factor Monitor"]
        Panel3["3. AI Agent Decision Audit Trail"]
        Panel4["4. Alert & Governance Center"]
    end

    subgraph NextBackend ["Next.js Server Layer (API Routes & Server Actions)"]
        NextAPI["Next.js Route Handlers / Telemetry Forwarder"]
        CachedState["In-Memory Server State & RPC Cache"]
    end

    subgraph DataSources ["Data Sources & Nodes"]
        AgentCore["AI Agent Runtime (Google API / Local Antigravity)"]
        EVMNode["XRPL EVM JSON-RPC"]
        XRPLNode["XRPL Mainchain WebSocket"]
    end

    EVMNode --> CachedState
    XRPLNode --> CachedState
    AgentCore --> NextAPI
    CachedState --> NextAPI
    NextAPI --> Panel1
    NextAPI --> Panel2
    NextAPI --> Panel3
    NextAPI --> Panel4
```

#### 2.4.1 Panel Specifications
1. **Pool Liquidity & Metrics Panel**:
   - Total Value Locked (TVL) in USD and native asset units.
   - Available liquidity for borrowing, total borrowed amount, pool utilization rate ($U$).
   - Current borrow APR and supply APY.
   - Reserve fund balance and bad debt counter.
2. **Loan Positions & Health Factor Panel**:
   - Interactive scatter plot of all active loans: Health Factor vs. Debt Size.
   - Color-coded risk indicators:
     - 🟢 **Healthy** ($H_f > 1.25$)
     - 🟡 **Caution** ($1.05 \le H_f \le 1.25$)
     - 🟠 **Critical / Pre-Liquidation** ($1.00 \le H_f < 1.05$)
     - 🔴 **Liquidation Eligible** ($H_f < 1.00$)
   - Detail modal showing collateral breakdown, debt history, and liquidation price thresholds.
3. **AI Agent Decision & Action Audit Trail**:
   - Real-time feed of AI agent activities:
     - Timestamp, action type (`MONITOR_TICK`, `PRIORITIZE_LOAN`, `EXECUTE_LIQUIDATION`, `RECONCILE_RECOVERY`).
     - Natural language explanation of agent reasoning (e.g., *"Position 0x4a... prioritized for liquidation due to 12% price drop in wXRP; estimated slippage on DEX is 0.42%"*).
     - Link to on-chain transaction hash on XRPL EVM block explorer.
     - Execution status (Pending, Success, Reverted, Discrepancy Flagged).
4. **Alerts & Operator Emergency Center**:
   - Protocol alerts (stale oracle warnings, rapid liquidity drawdowns).
   - Operator actions: Circuit breaker trigger buttons (gated by multisig wallet connection).

---

## 3. Deposit Paths & Cross-Chain Bridging Engine

The protocol implements four distinct, active deposit paths designed to accommodate pure EVM stablecoin liquidity, fiat on-ramp settlement, native XRPL cross-chain collateral, and a verification pipeline for additional EVM tokens.

```mermaid
flowchart TD
    subgraph PathA ["Path 1: Direct EVM Stablecoin (MVP Core)"]
        UserA["EVM User / LP"] -->|Direct ERC-20 Deposit (RLUSD)| VaultCore["LendingVault.sol"]
        VaultCore -->|Instant Mint| SharesA["amRLUSD Yield Shares"]
    end

    subgraph PathB ["Path 2: Fiat On-Ramp via Mastercard (USD Stablecoin Only)"]
        UserB["Fiat Depositor"] -->|USD Deposit (Card / ACH)| PayGateway["Fiat Payment Provider"]
        PayGateway -->|1:1 Direct USD-to-RLUSD Settlement| SettlementLock["Off-Chain Settlement Confirmation"]
        SettlementLock -->|Signed Settlement Voucher| OnRampContract["FiatOnRampGateway.sol"]
        OnRampContract -->|Credit Deposit Post-Settlement| VaultCore
    end

    subgraph PathC ["Path 3: Native XRPL Collateral Verification & Bridging"]
        UserC["XRPL Native Holder"] -->|Lock XRP / IOUs in Escrow| XRPLEscrow["XRPL Mainchain Native Escrow"]
        XRPLEscrow -->|Ledger Close Proof & Event| WitnessNet["XRPL-EVM Witness / Relayer Network"]
        WitnessNet -->|Threshold BLS/ECDSA Attestation| NativeAdapter["NativeCollateralVault.sol (EVM)"]
        NativeAdapter -->|Credit Collateral Claim| RiskEngineCore["RiskEngine.sol"]
    end

    subgraph PathD ["Path 4: Additional EVM Token Verification Pipeline"]
        TokenAdmin["Asset Onboarding Candidate"] -->|AI Agent Risk & Compliance Evaluation| TokenVerifier["TokenVerificationGate.sol"]
        TokenVerifier -->|Enforce Allowlist & Dual Feeds| Allowlist["Collateral Allowlist"]
        Allowlist -->|Register Sidechain Feeds (Pyth/Band)| OracleRegistry["PriceOracleAdapter.sol"]
    end
```

---

### 3.1 Path 1: Direct EVM Stablecoin Deposits (MVP Focus)

The primary liquidity engine for the MVP is focused on direct ERC-20 deposits of **RLUSD** (Ripple USD) or standard USD stablecoins natively deployed or canonically bridged to the XRPL EVM Sidechain.
- **Workflow**:
  1. Depositor approves the `LendingVault` contract for the deposit amount.
  2. Depositor calls `LendingVault.deposit(amount)` (or `supply`).
  3. `LendingVault` transfers tokens into vault reserves and mints `amRLUSD` liquidity shares reflecting proportional vault ownership:
     $$\text{Shares Minted} = \frac{\text{Amount Deposited} \times \text{Total Shares Outstanding}}{\text{Total Pool Liquid Assets} + \text{Total Borrowed Debt}}$$
  4. Depositor earns variable interest accrued per block from borrow demand.
  5. Withdrawal is instantaneous upon calling `withdraw()`, provided pool utilization is below 100%.

---

### 3.2 Path 2: Fiat On-Ramp via Mastercard & Regulated Payment Providers (USD Stablecoin Only)

To enable direct non-crypto native deposits, the platform integrates regulated payment gateways with **Mastercard rails**, utilizing an exclusive **Method B (Cryptographic Voucher Relay)** model that strictly processes **USD stablecoin deposits at 1:1 dollar parity (no foreign exchange oracle needed)** and immutably restricts fund delivery directly to the main lending vault.

```mermaid
sequenceDiagram
    autonumber
    actor User as Fiat Depositor
    participant Gateway as Regulated Payment Gateway (Mastercard / BVNK)
    participant Agent as AI Lending Agent (Tool Executor)
    participant Contract as FiatOnRampGateway.sol (Hardcoded Vault Router)
    participant Vault as LendingVault.sol (Main Lending Vault)

    User->>Gateway: Initiate Fiat Deposit ($10,000 USD via Card/ACH)
    Note over Gateway: Direct 1:1 USD-to-RLUSD Settlement (No FX Oracle Needed)
    Gateway->>User: Display Guaranteed 1:1 Parity (10,000 RLUSD)
    User->>Gateway: Confirm Payment & Billing Authorization
    Note over Gateway: Payment Processing & Bank Settlement Window
    Gateway->>Gateway: Await Irrevocable Settlement Confirmation (ACH Cleared / Card Captured)
    Gateway->>Gateway: Mint Cryptographic FiatSettlementVoucher (ECDSA/EIP-712)
    Gateway->>Agent: Deliver Signed Voucher via Secure Webhook / Tool Input
    Note over Agent: Agent calls tool: depositWithFiatVoucher(voucher, signature)
    Agent->>Contract: depositWithFiatVoucher(voucher, signature)
    Contract->>Contract: 1. Verify Gateway Signature & Expiration<br/>2. Replay Protection (gatewayTxId)
    Contract->>Vault: Forward 100% of Converted RLUSD to Immutable LendingVault Address
    Vault->>Vault: Credit 10,000 RLUSD to Lending Liquidity & Mint amRLUSD to Recipient
    Agent->>Gateway: Post-Settlement Audit: Verify Banking Ledger vs. On-Chain Deposit
    alt Settlement Discrepancy Flagged
        Agent->>Contract: Flag Discrepancy & Alert Multisig Operator
    else Fully Reconciled
        Agent->>Agent: Mark Settlement Reconciled in Telemetry Stream
    end
```

#### Key Architecture & Security Specifications:
1. **Method B Exclusivity (Off-Chain Signer, On-Chain Tool Relay)**:
   - The payment gateway does **not** need to manage a gas-funded hot wallet on the XRPL EVM Sidechain. It operates strictly as an off-chain cryptographic signer producing EIP-712 typed `FiatSettlementVoucher` payloads.
   - The on-chain transaction is executed seamlessly by the AI Lending Agent calling the contract tool `depositWithFiatVoucher(voucher, signature)` (or directly by the user), drastically reducing operational costs and enabling trivial sandbox/testnet mocking.
2. **USD Stablecoin Exclusivity (No Oracle Needed)**:
   - Mastercard rails exclusively process **USD stablecoin deposits** (clearing USD fiat directly into RLUSD at an exact 1:1 parity).
   - Because deposits and redemptions are strictly dollar-denominated and settled 1:1 into RLUSD, **no foreign exchange (FX) conversion oracle is needed**, completely eliminating FX rate slippage and currency oracle risk.
3. **Hardcoded Vault Destination (Zero Redirection Risk)**:
   - In `FiatOnRampGateway.sol`, the destination contract address is immutably set to `address(LendingVault)` at deployment.
   - The contract contains **no parameter** allowing callers to specify an arbitrary destination address. 100% of the converted RLUSD funds must flow directly into the main lending vault (`LendingVault.sol`).
4. **Unbounded Agent Voucher Throughput**:
   - The AI agent is not restricted by artificial amount caps when relaying vouchers.
   - Because the voucher amount is cryptographically signed by the authorized payment gateway and the receiving address is immutably locked to `LendingVault`, large institutional fiat deposits can be processed without arbitrary throttling.
5. **Zero Pre-Credit**:
   - Tokens MUST NOT be minted or credited to pool liquidity prior to irrevocable fiat settlement confirmation.
6. **AI Agent Audit Role**:
   - The AI agent independently audits gateway settlement logs every 15 minutes, matching bank clearing receipts to on-chain pool credit events.

---

### 3.3 Path 3: Native XRPL Collateral Verification & Bridging Engine

A critical capability of the protocol is accepting **native XRPL assets** (such as native XRP and XRPL trustline issued currencies) as collateral on the XRPL EVM Sidechain.

```mermaid
flowchart LR
    subgraph XRPLMainnet ["XRPL Native Ledger"]
        UserXRP["Borrower XRPL Account"]
        EscrowObj["XRPL Native Escrow Object\n(Crypto-Condition: PreimageSha256)"]
        UserXRP -->|EscrowCreate (Locks XRP)| EscrowObj
    end

    subgraph RelayerNetwork ["Decentralized Bridge Witness Network"]
        Validator1["Witness Node 1"]
        Validator2["Witness Node 2"]
        ValidatorN["Witness Node N"]
        Aggregator["Threshold Signature Aggregator\n(BLS / Multi-ECDSA)"]
        Validator1 --> Aggregator
        Validator2 --> Aggregator
        ValidatorN --> Aggregator
    end

    subgraph XRPLEVM ["XRPL EVM Sidechain"]
        BridgeReceiver["NativeCollateralBridge.sol"]
        VaultCore["CollateralVault.sol"]
        LendingVaultCore["LendingVault.sol"]
        RiskCore["RiskEngine.sol"]

        BridgeReceiver -->|Verify Threshold Attestation| VaultCore
        VaultCore -->|Update Collateral Balance| RiskCore
        RiskCore -->|Authorize Borrow| LendingVaultCore
    end

    EscrowObj -.->|Observed by Ledger Monitors| Validator1
    EscrowObj -.->|Observed by Ledger Monitors| Validator2
    EscrowObj -.->|Observed by Ledger Monitors| ValidatorN
    Aggregator -->|Relay Attestation Proof| BridgeReceiver
```

#### 3.3.1 XRPL Cross-Chain Landscape & Architectural Evaluation

The XRP Ledger ecosystem has evolved through several cross-chain bridging paradigms:

1. **XLS-38d Native Cross-Chain Bridges (`XChainBridge`)**:
   - Originally proposed by RippleX as a native amendment for `xrpld`, introducing on-ledger primitives (`XChainCreateBridge`, `XChainCommit`, `XChainClaim`) and a native witness server committee.
   - *Status*: While technically complete, RippleX recommended withdrawing the XLS-38 amendment from core ledger voting to avoid validator bloat (~10,000+ lines in `xrpld`), choosing instead to leverage established modular interoperability networks.
2. **Axelar Network (Official XRPL EVM Interoperability Standard)**:
   - Selected by Ripple and Peersyst as the primary decentralized interoperability layer for the XRPL EVM Sidechain.
   - Axelar provides both asset bridging (bridging XRP to `eXRP` on EVM) and **General Message Passing (GMP)**, enabling cross-chain contract calls and state attestations between the XRPL mainnet and EVM sidechain.
3. **XRPL Mainnet Native Ledger Primitives**:
   - What remains permanently native and live on XRPL Mainnet are **XRPL Escrows** (`EscrowCreate`, `EscrowFinish`, `EscrowCancel`), which natively support cryptographic conditions (Interledger RFC draft-thomas-crypto-conditions / SHA-256 preimages) and absolute timelocks (`CancelAfter`).

#### Comparison of Bridging Architectures for Lending Collateral:

| Criterion | Architecture A: Pure Wrapped Token Bridge (Axelar / Peersyst Door) | Architecture B: Native XLS-38 Witness Relayer | Architecture C: Axelar GMP + Native XRPL Crypto-Condition Escrow (Selected) |
| :--- | :--- | :--- | :--- |
| **Trust Model** | Multi-sig federation holding wrapped bridge door account. | Specialized witness server committee monitoring XRPL. | **Axelar BFT Validator Network + Native XRPL Ledger Escrow**. |
| **Custody Risk** | High: Collateral is pooled in wrapped door contract on XRPL. | Moderate: Custom witness set controls door release. | **Zero Wrapped Custody Risk**: Collateral remains in user's native XRPL escrow object. |
| **Liquidation Speed** | Instant on EVM (collateral is local ERC-20). | Latency bound to custom witness attestation (10-30s). | **Sub-5s Atomic**: Preimage revealed on EVM and executed via Axelar GMP / XRPL `EscrowFinish`. |
| **XRPL Native Alignment** | Low: Treats XRPL merely as an external token source. | High: Uses proposed XLS-38 transaction types. | **Optimal**: Combines live native XRPL `EscrowCreate` with official Axelar GMP sidechain tooling. |

#### 3.3.2 Selected Architecture: Axelar GMP + Native Crypto-Condition Escrow
The platform implements **Architecture C**, synergizing XRPL's native on-ledger escrow features with the official XRPL EVM Sidechain Axelar bridge:
1. **Escrow Initiation on XRPL**:
   - The borrower submits a native `EscrowCreate` transaction on the XRP Ledger.
   - The transaction locks XRP with:
     - `Destination`: Protocol Settlement Door account on XRPL.
     - `CancelAfter`: Loan expiry timestamp plus a safety lockout buffer ($\text{CancelAfter} \ge \text{LoanExpiry} + \text{escrowBufferSeconds}$).
     - `Condition`: A SHA-256 hash preimage condition ($H = \text{SHA256}(S)$).
     - `Memos`: Contains the borrower's XRPL EVM address (`0x...`).
   - **Configurable Lockout Buffer**: Parameterized via `ESCROW_LOCKOUT_BUFFER_SECONDS` in environment variables: defaults to 86,400 seconds (24 hours) for Mainnet production, and is configurable down to 300 seconds (5 minutes) for Testnet development and rapid demo testing.
2. **Axelar GMP Attestation & Testnet Attestation Helper**:
   - **Production Relayer Path**: Axelar relayer nodes observe the XRPL ledger close containing the escrow and execute `IAxelarExecutable.execute()` on `NativeCollateralBridge.sol` on XRPL EVM.
   - **Testnet Demo Helper (`mockAttestEscrow`)**: For local testing and timed hackathon demonstrations, `NativeCollateralBridge.sol` includes an authorized `mockAttestEscrow(...)` function (restricted to contract owner on testnet) allowing immediate collateral attestation without waiting for cross-chain relayer queues.
   - `CollateralVault.sol` credits the borrower with virtual native collateral, immediately elevating their borrowing capacity in `RiskEngine.sol`.
3. **Loan Repayment & Collateral Unlock**:
   - When the borrower repays their debt on XRPL EVM, `LendingVault` triggers `NativeCollateralBridge.sol` to reveal the secret preimage $S$.
   - An Axelar GMP message or direct relayer call executes an `EscrowFinish` with preimage $S$ on XRPL, unlocking the native XRP directly back to the borrower's XRPL account.
4. **Cross-Chain Remote Liquidation**:
   - If the borrower's health factor drops below $1.00$ on XRPL EVM, `LiquidationManager` settles the EVM stablecoin debt.
   - `NativeCollateralBridge.sol` emits the preimage $S$ to the liquidator's designated XRPL address.
   - The liquidator executes `EscrowFinish` on the native XRPL mainnet to receive the XRP.
   - The AI Lending Agent monitors both sides of the bridge, verifying that the escrow release matches EVM ledger changes.

---

### 3.4 Path 4: Additional EVM Collateral Tokens & Verification Pipeline

To expand beyond the initial collateral set (wXRP, wETH, wBTC), the platform enforces a rigorous on-boarding and verification pipeline for any new ERC-20 asset:

```mermaid
flowchart TD
    Submit["Token Onboarding Proposal"] --> StaticCheck["1. Static Code Analysis (Bytecode)"]
    StaticCheck --> CheckA{"Has Non-Standard Decimals / Reentrancy?"}
    CheckA -->|Yes| Reject["Reject Asset"]
    CheckA -->|No| DynamicCheck["2. Dynamic Testnet Simulation"]
    DynamicCheck --> CheckB{"Has Fee-on-Transfer or Rebasing Logic?"}
    CheckB -->|Yes| Reject
    CheckB -->|No| OracleEval["3. Price Oracle Verification"]
    OracleEval --> CheckC{"Dual Independent XRPL EVM Feeds Available?"}
    CheckC -->|No| Reject
    CheckC -->|Yes| RiskParam["4. Dynamic Risk Weight Parameterization"]
    RiskParam --> Governance["5. Multisig & Timelock Registration"]
    Governance --> ActiveAsset["Active Collateral in CollateralVault"]
```

#### Token Verification Criteria:
1. **No Fee-on-Transfer**: Tokens that deduct a balance fraction on `transfer()` or `transferFrom()` are rejected, as they break pool balance invariants.
2. **No Rebasing / Elastic Supply**: Tokens whose balances change dynamically without transfers are disallowed in cross-margin vaults.
3. **Oracle Redundancy Requirement**: Every approved collateral asset MUST have at least two uncorrelated on-chain price feeds (e.g., Pyth + Band, or Band + XRPL Native Oracle Bridge) with a medianizer and deviation tripwire.
4. **Bounded Risk Parameters**: New assets are initialized with conservative default parameters:
   - $\text{LTV}_{\text{max}} \le 60\%$
   - $\text{Liquidation Threshold} \le 70\%$
   - $\text{Liquidation Bonus} \ge 8\%$
   - Strict protocol-wide supply caps (`maxSupplyCap`).

---

## 4. Security, Solvency & Trust Model

### 4.1 Separation of Powers & Threat Containment
The system enforces strict principle-of-least-privilege boundaries:

```
+-------------------------------------------------------------------+
|                        SMART CONTRACTS                            |
|  - Sovereign custody of all user assets                           |
|  - Invariant: Zero funds released without valid collateral/debt    |
|  - Invariant: Zero liquidations executed unless Hf < 1.00          |
|  - Enforces hard ceilings on LTV, rates, and borrow sizes         |
+-------------------------------------------------------------------+
                                ^
                                | Bounded Function Calls Only
                                | (executeLiquidation, proposeRate)
+-------------------------------------------------------------------+
|                        AI LENDING AGENT                           |
|  - Holds NO private keys with withdrawal authority                 |
|  - Cannot alter collateral requirements or steal assets           |
|  - Execution bounded by EIP-712 typed data verification           |
|  - Rate-limited and gas-capped per epoch                          |
+-------------------------------------------------------------------+
```

### 4.2 Failure Mode Mitigations

| Failure Mode | Threat Scenario | Protocol Mitigation |
| :--- | :--- | :--- |
| **Oracle Manipulation / Flash Crash** | Malicious actor manipulates on-chain spot DEX to artificially liquidate solvent positions. | - Time-Weighted Average Prices (TWAP) and multi-oracle medianization.<br>- Maximum deviation thresholds (prices changing $>10\%$ in one block are rejected).<br>- Oracle freshness heartbeats. |
| **Agent Compromise / Malicious Prompt** | AI Agent private key compromised or LLM reasoning manipulated via prompt injection. | - Smart contract checks $H_f < 1.0$ regardless of agent instructions.<br>- Agent cannot target arbitrary receiver addresses for seized collateral.<br>- Multisig operator can instantly revoke agent relayer address. |
| **Cascading Liquidation & Bad Debt** | Sharp market downturn causes collateral value to fall faster than liquidators can clear debt. | - Two-tier close factor (allows 100% liquidation when $H_f < 0.90$).<br>- Protocol Reserve Fund backstops shortfalls.<br>- Bad debt isolation prevents contagion across other collateral pools. |
| **XRPL EVM Congestion / Gas Spikes** | Network congestion delays liquidation transactions past point of insolvency. | - AI Agent monitors mempool gas dynamics and pre-emptively executes liquidations when positions enter critical buffer ($H_f \le 1.03$).<br>- Automated transaction replacement with higher priority fee. |

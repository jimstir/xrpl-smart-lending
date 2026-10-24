# XRPL Smart Lending: AI-Managed Lending Platform

Autonomous, non-custodial multi-collateral lending protocol on the **XRP Ledger (XRPL) EVM Sidechain** with bounded AI risk coordination, automated liquidations, and recovery reconciliation.

---

## Documentation

The project documentation is organized under the [`docs/`](docs/) directory:

- 📐 **[Technical Architecture Document](docs/technical-architecture.md)**: Comprehensive systems engineering guide detailing the smart contract architecture, price oracle & FX engine, AI Lending Agent subsystems, monitoring dashboard, and future roadmap (fiat on-ramp & native XRPL collateral verification).
- 📜 **[AMLP-01 Protocol Specification (RFC)](docs/specs/ai-managed-lending.md)**: Formal standards-track specification adhering to the **COSS/1 (Consensus-Oriented Specification System)** framework, defining normative RFC 2119 criteria, Solidity interfaces, state machines, EIP-712 cryptographic intent formats, and threat models.
- 📋 **[Specifications Registry](docs/specs/README.md)**: Specification lifecycle definitions (`raw`, `draft`, `stable`, `retired`) and index.

---

## Core System Overview

The platform is designed around the **Separation of Powers**:
1. **Smart Contracts are Sovereign**: All financial state transitions, solvency checks, collateral requirements, liquidation rules, loan-to-value (LTV) limits, and access controls are **hardcoded and deterministically enforced** on-chain.
2. **AI Lending Agent is Bounded**: The AI agent reasons over multi-dimensional market telemetry, borrower request queues, and liquidation urgency to prioritize and coordinate actions. The agent holds strictly bounded execution privileges and cannot bypass smart contract risk rules or withdraw protocol funds.

### Key Components

- **Component 1: Lending Smart Contracts**: Lending Pool, Multi-Collateral Vaults, Risk Engine, Liquidation Engine, and Emergency Circuit Breakers.
- **Component 2: Price Oracle & FX Engine**: XRPL EVM on-chain feeds (Pyth / Band / XRPL Bridge) paired with Mastercard Currency Conversion & FX API reference.
- **Component 3: AI Lending Agent**: Continuous loan monitoring, borrower eligibility & request prioritization, recovery reconciliation & bad debt engine, and pool telemetry.
- **Component 4: Monitoring Dashboard**: Real-time pool metrics, loan health factors, and agent decision audit trails.
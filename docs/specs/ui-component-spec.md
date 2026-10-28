---
title: AMLP-UI-01
name: Streamlined Card-Driven UI Component Specification (Lender & Borrower Views)
status: draft
category: Standards Track
contributors: Antigravity Agent <agent@xrpl-smart-lending.local>
---

# AMLP-UI-01: Streamlined UI Component Specification

Autonomous Multi-Collateral Lending Protocol (AMLP) on the XRP Ledger EVM Sidechain & XRP Ledger Mainchain.

---

## 1. Executive Summary & Design Vision

This specification defines the streamlined, card-driven architecture for the **XRPL Smart Lending** application.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ NAVBAR: Brand • Role Switcher [Lender View | Borrower View] • [MetaMask] • [XRPL]      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ LENDER VIEW:                                                                           │
│   • Header: Loan Services (Count) • Search • [+ Deploy New Vault]                      │
│   • Grid of Clickable Loan Service Cards (e.g., AI-Managed RLUSD Vault • amRLUSD)      │
│   • Clicking any card opens ManageLoanServiceModal (AI Agent Telemetry, Supply, Suite) │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ BORROWER VIEW:                                                                         │
│   • Header: Summary Bar • [+ Take New Loan] • [+ Pledge Collateral] • [Join Vault]     │
│   • Grid of Clickable Borrower Loan Cards (Loan ID, Principal, Collateral, Health Hf)  │
│   • Clicking any card opens BorrowerLoanManageModal (Repay, Adjust Collateral, Risk)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Separation of Roles

1. **Lender View**:
   - The lender is the credit provider/operator who deploys and operates **Loan Services**.
   - **The lender does NOT take out loans.**
   - The main page has **zero clutter**—no verbose descriptions or complex banners. It features the **`[+ Deploy New Vault]`** button and a clean grid of **Clickable Loan Service Cards**.
   - Every deployed vault on-chain creates a card.
   - Clicking a card opens `ManageLoanServiceModal` to manage that specific vault and its AI solvency agent.
2. **Borrower View**:
   - Reserved strictly for borrowers who connect to loan services to pledge collateral and take loans.
   - Main page displays **Clickable Loan Cards** for their active debt positions.
   - Clicking a loan card opens `BorrowerLoanManageModal` to repay debt or add collateral.

---

## 3. Lender View: Clickable Loan Service Cards

### 3.1 Card Anatomy (`LoanServiceCard.tsx`)
```
┌────────────────────────────────────────────────────────────────┐
│ 🏦 AI-Managed RLUSD Vault                              amRLUSD │
│ 0x6101...d788                                                  │
├────────────────────────────────────────────────────────────────┤
│ Seed Liquidity:             $10,000.00 RLUSD                   │
│ AI Risk Agent:              Active & Tracking                  │
│ Network:                    XRPL EVM Sidechain                 │
├────────────────────────────────────────────────────────────────┤
│ ⚡ Manage Service & Agent ──>                          On-Chain│
└────────────────────────────────────────────────────────────────┘
```
- **Visuals**: Obsidian card, hover border highlight (`border-cyan-400`), subtle lift (`-translate-y-1`), cursor pointer.
- **Click Behavior**: Calls `openModal("MANAGE_LOAN_SERVICE", { vault })`.

---

## 4. Card-Click Modal: `ManageLoanServiceModal`

Clicking any **Loan Service Card** opens its dedicated modal containing the Autonomous AI Solvency Agent Telemetry and vault controls:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🤖 AI-Managed RLUSD Vault (amRLUSD)                                       ✕ │
│ 0x610178dA211FEF7D417bC0e6FeD39F05609AD788                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Autonomous AI Solvency Agent Telemetry           [🟢 Active & Tracking] │
│    Tracking borrower health factors, kinked utilization curve, and          │
│    liquidation risk                                            [ Evaluate ] │
│                                                                             │
│    Pool Utilization: 0.0%    Borrow APR: 0.0%    Seed Liquidity: $10,000    │
│                                                                             │
│    ┌───────────────────────────────────────────────────────────────────┐    │
│    │ All vault parameters, kink rates, and collateral assets are       │    │
│    │ optimal. No active agent proposals pending.                       │    │
│    └───────────────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Supply Liquidity to this Loan Service                                    │
│    Amount: [ 5000 ] RLUSD                               [ Supply RLUSD ]   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Deployed Smart Contract Suite                                            │
│    • Lending Vault (ERC-4626): 0x6101...d788           [ Copy ] [ Explorer ]│
│    • Protocol Reserve Vault:   0xCf7E...0Fc9           [ Copy ] [ Explorer ]│
│    • Risk Engine:              0x8A79...c318           [ Copy ] [ Explorer ]│
│    • Liquidation Manager:      0xB7f8...4F5e           [ Copy ] [ Explorer ]│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Borrower View: Clickable Loan Cards

### 5.1 Card Anatomy (`BorrowerLoanCard.tsx`)
```
┌────────────────────────────────────────────────────────────────┐
│ 💳 Loan #LN-84920                         🟢 Healthy (Hf: 1.62)│
│ Vault: AI-Managed RLUSD Vault (amRLUSD)                        │
├────────────────────────────────────────────────────────────────┤
│ Principal Debt:             $2,500.00 RLUSD                    │
│ Collateral Backing:         1.85 wETH ($4,625.00 USD)          │
│ Max Borrow LTV:             70.0%                              │
├────────────────────────────────────────────────────────────────┤
│ ⚡ Manage Position ──>                                 Explorer│
└────────────────────────────────────────────────────────────────┘
```
- **Click Behavior**: Calls `openModal("BORROWER_LOAN_MANAGE", { loan })`.
- **Card-Click Modal (`BorrowerLoanManageModal`)**:
  - Repay Debt (25%, 50%, Full Debt).
  - Add Collateral (wETH, wXRP, Native XRPL) or Safe Withdraw ($H_f \ge 1.05$ pre-flight guard).
  - Risk Telemetry and Oracle valuation.

---

## 6. Modular File Architecture

```
frontend/src/
├── app/
│   └── page.tsx                         # Thin ~145-line page router
├── components/
│   ├── common/
│   │   ├── Navbar.tsx                   # Role switcher (Lender ⇋ Borrower) & wallet badges
│   │   ├── HealthFactorBadge.tsx        # Risk badge (🟢 Healthy, 🟡 Caution, 🟠 Critical, 🔴 Liquidatable)
│   │   └── ModalHost.tsx                # Centralized modal host portal
│   ├── lender/
│   │   ├── LenderView.tsx               # Clean Loan Services view with [+ Deploy New Vault]
│   │   └── LoanServiceCard.tsx          # The CLICKABLE loan service card
│   ├── borrower/
│   │   ├── BorrowerView.tsx             # Borrower view container
│   │   ├── BorrowerPositionBar.tsx      # Clean summary stats and action buttons
│   │   ├── BorrowerLoansGrid.tsx        # Filterable grid of borrower loans
│   │   ├── BorrowerLoanCard.tsx         # The CLICKABLE borrower loan card
│   │   └── NativeXrplEscrowWidget.tsx   # XLS-47d native escrow drawer
│   └── modals/
│       ├── ManageLoanServiceModal.tsx   # CARD-CLICKED MODAL with AI Agent Telemetry
│       ├── BorrowerLoanManageModal.tsx  # CARD-CLICKED MODAL for borrower loans
│       ├── BorrowModal.tsx              # Originate new loan modal
│       ├── DepositCollateralModal.tsx   # Selectable collateral asset cards (wETH, wXRP, Native)
│       ├── LenderDepositModal.tsx       # Selectable supply options (RLUSD, Mastercard AP4M)
│       ├── DeployVaultModal.tsx         # 1-click sovereign vault deployer
│       └── JoinVaultModal.tsx           # Connect to existing vault
├── context/
│   ├── Web3Context.tsx                  # MetaMask EVM + XRPL Testnet wallet state
│   └── ModalContext.tsx                 # Centralized modal state machine
└── hooks/
    ├── useVaultList.ts                  # Discovered & registered vaults
    └── useBorrowerPositions.ts          # Borrower debt, collateral, Hf
```

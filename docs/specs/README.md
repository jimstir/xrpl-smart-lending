# Specifications & RFCs

This directory contains the formal technical specifications for the **AI-Managed Lending Platform** on the XRP Ledger EVM Sidechain.

All specifications in this repository adhere to the **COSS/1 (Consensus-Oriented Specification System)** standard, a lightweight framework designed to draft, track, and maintain open digital protocols with transparent versioning, normative RFC 2119 criteria, and rough consensus.

---

## Specification Lifecycle

Each specification document tracks its lifecycle state via its metadata header:

| Status | Definition |
| :--- | :--- |
| **`raw`** | Early experimental idea or initial proposal under preliminary review. |
| **`draft`** | Actively developed and refined specification undergoing community and review feedback. |
| **`stable`** | Ratified, reference-complete standard intended for production and interoperability. |
| **`legacy` / `retired`** | Deprecated or superseded by a newer specification. |

---

## Document Format

Every specification must begin with the standard COSS/1 YAML frontmatter:

```yaml
---
title: SPEC-IDENTIFIER
name: Full Descriptive Specification Title
status: draft # raw | draft | stable | retired
category: Standards Track # Standards Track | Best Current Practice | Informational
contributors: Name <@handle>
---
```

Followed by the standardized COSS sections:
1. **Abstract**: Brief summary of the standard's scope and purpose.
2. **Motivation**: Problem statement, current industry limitations, and protocol design rationale.
3. **Specification**: Normative definitions, data schemas, smart contract interfaces, state machines, and cryptographic flows.
4. **Security Considerations**: Threat models, verification integrity, oracle failure modes, agent permission boundaries, and mitigation strategies.
5. **Copyright**: Licensing and open-source terms.
6. **References**: Applicable EIPs, XRPL standards, external specifications, and citations.

---

## Active Specifications

| Specification | Status | Category | Description |
| :--- | :--- | :--- | :--- |
| **[`AMLP-01: AI-Managed Lending Platform`](ai-managed-lending.md)** | `draft` | Component Specification | Protocol component specification for the XRPL EVM lending pool with bounded AI risk coordination, multi-collateral custody, and native XRPL bridging. |

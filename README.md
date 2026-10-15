# NullClear (`nullclear.dev` / `nullclear.com`)

> **Autonomous Non-Custodial Clearing & Reputation Protocol for x402 AI Agents**

[![NullClear Arbiter MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/score.svg)](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear)
[![NullClear Arbiter MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/card.svg)](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear)

NullClear eliminates payment risk in Agent-to-Agent (A2A) commerce. In standard HTTP `402 Payment Required` flows, buyers are forced to pay before seeing whether an upstream agent hallucinates, crashes, or returns malformed data. NullClear introduces **deferred non-custodial schema escrow**: the buyer signs an EIP-3009 `TransferWithAuthorization`, the arbiter cryptographically validates the upstream agent's output against the buyer's schema contract, and only settles payment upon 100% verification. If the seller hallucinates or crashes, **the authorization is voided and $0 is spent**.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────────┐
                      │              BUYER AGENT                 │
                      │  (@nullclear/x402-arbiter client/fetch)   │
                      └─────────────────────┬────────────────────┘
                                            │
                          1. Target request │ (Intercepted 402)
                          2. EIP-3009 signed│ & Schema defined
                                            ▼
                      ┌──────────────────────────────────────────┐
                      │          NULLCLEAR ARBITER               │
                      │     (Cloudflare Worker + Hono)           │
                      │  - Sybil & Wash-Trade Engine             │
                      │  - Deterministic JSON Schema Validator   │
                      │  - EIP-712 Receipt Attestation           │
                      └─────────────┬──────────────┬─────────────┘
                                    │              │
                   3. Proxy Request │              │ 4. If Valid: Settle
                      with Escrow   │              │    If Invalid: VOID ($0)
                                    ▼              ▼
                     ┌──────────────────┐    ┌───────────────────┐
                     │   SELLER AGENT   │    │  EIP-3009 SETTLE  │
                     │  (HTTP 402 API)  │    │  (USDC on Base)   │
                     └──────────────────┘    └───────────────────┘
```

---

## Monorepo Packages

| Package | Path | Description |
|---|---|---|
| [`@nullclear/shared`](./packages/shared) | `packages/shared` | Core constants (Base Mainnet 8453, Sepolia 84532), ERC-8004 ABIs, x402 V2 types, EIP-3009 & KYA EIP-712 schemas. |
| [`@nullclear/worker-arbiter`](./packages/worker-arbiter) | `packages/worker-arbiter` | Cloudflare Worker Hono app handling deferred escrow clearing (`/v1/clear`), Sybil-resistant trust scores (`/v1/score`), KYA mandates (`/v1/kya`), and machine discovery honeypots (`/llms.txt`, `/.well-known/*`, `/openapi.json`). |
| [`@nullclear/x402-arbiter`](./packages/x402-arbiter) | `packages/x402-arbiter` | Agent SDK providing `createNullClearFetch` with automatic HTTP 402 interception, EIP-3009 authorization signing, and Zod/JSON schema protection. |
| [`@nullclear/mcp`](./packages/mcp-server) | `packages/mcp-server` | Model Context Protocol server exposing `nullclear_check_reputation`, `nullclear_escrow_x402_call`, and `nullclear_verify_kya_mandate` tools to autonomous agents. |
| [`@nullclear/e2e-simulator`](./packages/e2e-simulator) | `packages/e2e-simulator` | Self-contained local simulator validating honest sellers, hallucination voids, 500 crash voids, and Sybil wash-trade detection. |

---

## Protocol Guarantees

1. **Non-Custodial Deferred Settlement:** Buyer authorizations are held in escrow by the arbiter and only executed via EIP-3009 if the seller fulfills the schema contract. If the seller returns invalid schema or error codes, settlement is discarded.
2. **Sybil & Wash-Trade Detection:** Analyzes counterparty concentration graph. If $>60\%$ of transaction volume comes from a single buyer address across $\ge 3$ transactions, a wash-trading penalty is applied and the `HIGH_COUNTERPARTY_CONCENTRATION_WASH_RISK` flag is raised.
3. **KYA (Know Your Agent) Corporate Liability Mandates:** Cryptographically ties an on-chain agent wallet to a legally registered corporate entity with defined liability coverage and per-transaction limits.
4. **Machine Discovery & Self-Describing Agents:** Complete `llms.txt`, `/.well-known/agent.json`, `/.well-known/x402.json`, `/.well-known/mcp.json`, and OpenAPI 3.1.0 specifications.

---

## What's New in v1.1.0

- 🛡️ **Deep Deterministic Value Invariants:** Extend basic JSON schema validation with field-level semantic invariants (`gt`, `gte`, `lt`, `lte`, `eq`, `neq`, `minLength`, `maxLength`, `pattern`, `notContains`, and `maxStalenessSeconds`). Stale data or numeric drift triggers instant authorization voiding ($0 charged).
- 🛑 **Canonical LLM Refusal Guard:** Automatically inspects text and JSON responses for common LLM refusal boilerplate (`"as an ai language model"`, `"i cannot fulfill this request"`, `"i am unable to assist"`, rate limits, and server error strings), treating refusal as non-delivery.
- 🔀 **Autonomous Multi-Seller Failover Routing:** Callers can provide ordered fallback candidates (`fallbacks: [{ targetUrl, sellerAgentId, paymentSignatureHeader }]`). If the primary seller crashes or fails validation, the Arbiter voids the primary authorization and automatically routes to the secondary candidate without roundtripping back to the client agent.
- 🔒 **Outbound Spend Firewall & Anti-Abuse Guards:** Protect buyer agent wallets with per-call caps (`maxPerCallAtomic`) and daily rolling spend policies (`maxDailyWalletAtomic`). Rejects self-clearing wash-loops (buyer address === seller address) and enforces minimum on-chain settlement floors.

---

## Quickstart

### Prerequisites
- Node.js $\ge 20$
- pnpm $\ge 9$

### Install Dependencies
```bash
pnpm install
```

### Build All Packages
```bash
pnpm build
```

### Typecheck
```bash
pnpm typecheck
```

### Run Tests
```bash
pnpm test
```

### Run Live Autonomous E2E Simulator
```bash
pnpm demo
```

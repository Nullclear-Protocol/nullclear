# NullClear (`nullclear.com` / `nullclear.dev`)

> **Non-Custodial Pre-Sign Firewall & EIP-712 Policy Co-Signer (`Check → Enforce → Monitor`) — Powering Policy-Guarded Polymarket Execution (`nullclear.com`)**

<p align="left">
  <a href="https://satohub.ai/verify/nullclear-arbiter?utm_source=badge&utm_medium=embed"><img src="https://satohub.ai/api/badge/nullclear-arbiter" alt="Sato Score" /></a>
  <a href="https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear"><img src="https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/score.svg" alt="NullClear Arbiter MCP server – quality and maintenance score on Glama" /></a>
  <a href="https://glama.ai/mcp/connectors/io.github.Nullclear-Protocol/nullclear"><img src="https://glama.ai/mcp/connectors/io.github.Nullclear-Protocol/nullclear/badges/score.svg" alt="NullClear Arbiter MCP connector – quality and maintenance score on Glama" /></a>
  <a href="https://mcpservers.org/servers/nullclear-protocol/nullclear"><img src="https://mcpservers.org/badge.svg" alt="Listed on mcpservers.org" /></a>
  <a href="https://mcptry.com/servers/io.github.Nullclear-Protocol/nullclear"><img src="https://mcptry.com/badge/io.github.Nullclear-Protocol/nullclear" alt="mcptry" /></a>
  <a href="https://nullclear.com/terminal"><img src="https://img.shields.io/badge/Polymarket-CLOB_V2_Guarded-10b981" alt="Polymarket CLOB V2 Guarded" /></a>
  <a href="https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"><img src="https://img.shields.io/badge/ERC--8004-Agent_%23124595-3b82f6" alt="ERC-8004 Agent #124595" /></a>
</p>

<p align="left">
  <a href="https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear"><img src="https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/card.svg" alt="NullClear Arbiter MCP server – Glama Card" height="180" /></a>
  &nbsp;&nbsp;
  <a href="https://mcprush.com/to/nullclear-arbiter-mcp?ref=badge"><img src="https://mcprush.com/badge/nullclear-arbiter-mcp/card.svg" alt="NullClear Arbiter MCP server" height="180" /></a>
</p>

## Flagship Live Consumer Vertical: Policy-Guarded Polymarket Execution (`nullclear.com`)

NullClear's Pre-Sign Firewall & EIP-712 Policy Co-Signer powers **[nullclear.com](https://nullclear.com)** — a zero-custody Polymarket CLOB V2 execution and whale Copy-Tax audit terminal:

- **2026 Real Fee & Copy-Tax Calculator (`/calculator`):** Exact late-2026 category taker fee math (`shares * feeRate * price * (1 - price)`), fill-delay slippage, and Taker vs. `postOnly` Maker (0% fee) comparison.
- **Indexable Whale Reality & Copyability Auditor (`/whale/[address]`):** Audits any wallet via `data-api.polymarket.com/v2` + `clob.polymarket.com/book`, computing Naive PnL vs. Simulated Copier PnL (`0.5¢`, `1.0¢`, `2.0¢` slip), flagging 5m/15m crypto taker traps, and issuing Copyability Grades (`A`–`F`).
- **Copyable Whale Leaderboard (`/leaderboard`):** Ranked by **Net Copier PnL** (not deceptive raw PnL), filterable by category (`Geopolitics 0% Fee`, `Politics`, `Sports`, `Economics`, `Crypto`).
- **Non-Custodial Guarded Execution Terminal (`/terminal`):** Paper Mode (default ON, zero wallet setup) + Live CLOB V2 (`@polymarket/client`, `pUSD` on Polygon `137`, `builder` `bytes32` attribution via `NULLCLEAR_BUILDER_CODE`, `POLY_1271` Deposit Wallet session key scaffold). Every allowed or blocked trade emits a verifiable public receipt at `https://nullclear.dev/receipt/[id]`.
- **Live Whale Feed & BYO Webhooks (`/live`):** Cloudflare Worker cron polling watched whales via `data-api.polymarket.com/v2/trades`, checking live CLOB best asks, persisting Copy-Tax verdicts (`COPYABLE` vs `PASS - SLIPPAGE TOO HIGH`) to D1, and pushing JSON or Discord Embed payloads to any user-supplied HTTPS webhook stored in `poly_policies` (plus email watchlist capture on `/whale/[address]` and `/leaderboard`).

## Core Protocol Engine (`nullclear.dev`)

Underneath `nullclear.com`, `nullclear.dev` runs the 7-chain Pre-Sign Security Firewall, Drop-In Guarded JSON-RPC, EIP-712 Policy Co-Signer (`POST /v1/policy/cosign`, `POST /v1/policy/polymarket/cosign`), 30-Day Watchtower, MCP server, and optional non-custodial x402 schema-escrow clearinghouse (`/v1/clear`, `/v1/bazaar/*`).

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
| [`@nullclear/x402-arbiter`](./packages/x402-arbiter) | `packages/x402-arbiter` | Agent SDK (`v1.7.0`) providing `createNullClearRpcUrl`, `createNullClearPassClient`, `NullClearClient` (7-chain `guard`, `dueDiligence`, `cosign`, `buyPass`), and `createNullClearFetch` deferred x402 escrow. |
| [`@nullclear/agentkit`](./packages/agentkit) | `packages/agentkit` | Coinbase AgentKit `ActionProvider` (`nullclearActionProvider` `v1.1.0`), `nullclear_preflight_guard`, `createNullClearWalletGuard`, and Guarded JSON-RPC across 7 EVM/Solana chains. |
| [`@nullclear/plugin-eliza`](./packages/plugin-eliza) | `packages/plugin-eliza` | ElizaOS 7-chain firewall plugin (`v1.1.0`: `NULLCLEAR_SCAN_TOKEN`, `NULLCLEAR_SCAN_BATCH`, `NULLCLEAR_GUARD_CALLDATA`, `NULLCLEAR_API_KEY` + real-time context provider). |
| [`@nullclear/mcp`](./packages/mcp-server) | `packages/mcp-server` | Model Context Protocol server (`v1.6.0`, STDIO + Streamable HTTP at `https://api.nullclear.dev/mcp`) exposing **14 tools** (`nullclear_preflight_guard`, 7-chain forensics, ERC-8004 reputation, KYA mandate, and x402 escrow). |
| [`@nullclear/e2e-simulator`](./packages/e2e-simulator) | `packages/e2e-simulator` | Self-contained local simulator validating honest sellers, hallucination voids, 500 crash voids, and Sybil wash-trade detection. |

---

## Protocol Guarantees

1. **Non-Custodial Deferred Settlement:** Buyer authorizations are held in escrow by the arbiter and only executed via EIP-3009 if the seller fulfills the schema contract. If the seller returns invalid schema or error codes, settlement is discarded.
2. **Sybil & Wash-Trade Detection:** Analyzes counterparty concentration graph. If $>60\%$ of transaction volume comes from a single buyer address across $\ge 3$ transactions, a wash-trading penalty is applied and the `HIGH_COUNTERPARTY_CONCENTRATION_WASH_RISK` flag is raised.
3. **KYA (Know Your Agent) Corporate Liability Mandates:** Cryptographically ties an on-chain agent wallet to a legally registered corporate entity with defined liability coverage and per-transaction limits.
4. **Machine Discovery & Self-Describing Agents:** Complete `llms.txt`, `/.well-known/agent.json`, `/.well-known/x402.json`, `/.well-known/mcp.json`, and OpenAPI 3.1.0 specifications.

---

## What's New in v1.7.0 (Autonomous Pre-Execution Firewall Pro Suite)
- **Self-Serve x402 Prepaid Passes (`POST /v1/pass/buy`, `$5 / $25 / $100 USDC`) & `<5ms` Edge KV Auth:** Autonomous agents and teams can mint `nc_live_...` Bearer API keys with 2,000–100,000 credits via EIP-3009 USDC settlement, eliminating 1.5s per-call settlement overhead.
- **Drop-In Guarded JSON-RPC Safety Rail (`POST /rpc/:chain/:apiKey`):** Built for Autonomous AI Agents (`AgentKit`, `ElizaOS`, `Virtuals`, `Rig`) and Safe/DAO treasuries. Swap one `RPC_URL` env var across 7 chains — reads pass through via edge KV (`0` credits); every broadcast is pre-screened via `guardTransactionPreflight` with configurable `failMode=closed|open` and `timeoutMs` race budgets.
- **Cryptographic EIP-712 Policy Co-Signer (`POST /v1/policy/register`, `/v1/policy/cosign`):** Evaluates programmable spend/tax/drainer policies and emits on-chain-verifiable EIP-712 `PolicyApproval` co-signatures only when all invariants pass.
- **30-Day Continuous Cron Watchtower (`POST /v1/monitors`) & Institutional Due-Diligence (`POST /v1/bazaar/due-diligence`, `$0.10`):** Scheduled diffs on proxy slots, sell taxes, LP drops, and Solana mint/freeze authorities firing signed webhooks + signed clearance certificates.
- **7-Chain 1-Call Pre-Sign Firewall (`POST /v1/guard` & `/v1/bazaar/guard`) & Package Upgrades:** Added `arbitrum`, `optimism`, `polygon`, `bsc` alongside `base`, `eth`, `solana`, recursive Multicall3/UniversalRouter/Safe unwrapping, EIP-712 Permit2/Seaport audits, Solana Token-2022 checks, stateful `eth_simulateV1` asset diffs, and published SDK updates (`@nullclear/x402-arbiter@1.7.0`, `@nullclear/mcp@1.6.0`, `@nullclear/agentkit@1.1.0`, `@nullclear/plugin-eliza@1.1.0`).

## What's New in v1.6.0
- **Dual-Facilitator Discovery (Coinbase CDP Bazaar + PayAI + 402index.io):** Added Coinbase CDP EdDSA/ES256 JWT auth (`?facilitator=cdp` / `X-NullClear-Facilitator: cdp`) and `402index.io` domain verification (`/.well-known/402index-verify.txt`), getting all **7 / 7** `/v1/bazaar/*` endpoints indexed live across Coinbase CDP Bazaar, 402index.io, and PayAI Discovery.
- **Multi-Chain Batch Firewall (`POST /v1/bazaar/scan-batch`, `$0.025 USDC`) & D1 Param Telemetry:** Scans up to `15` unique Base, Ethereum, and Solana tokens per request (D1 cache-first lookup + bounded parallel chunking engineered for Cloudflare Workers Paid), aggregates `EXECUTE_SAFE` / `CAUTION_HIGH_RISK` / `ABORT_CRITICAL_TRAP` verdicts, logs sanitized `target_address` / `target_chain` / `query_type` in `clearings`, aligns `/v1/bazaar/market-oracle` & `/v1/bazaar/audit` to `$0.005 USDC`, and upgrades `/v1/bazaar/token-security` to full multi-chain forensics (`Base`, `ETH`, `Solana`).
- **Interactive Security Wedge (`/firewall`) & Agent Framework SDKs (`@nullclear/x402-arbiter@1.6.0`, `@nullclear/agentkit@1.0.0`, `@nullclear/plugin-eliza@1.0.0`):** Plug-and-play pre-flight token & drainer-calldata firewalls for Coinbase AgentKit (`nullclearActionProvider`) and ElizaOS (`nullclearPlugin`).

## What's New in v1.5.0
- **`\$0.005` Micro-Tier Pricing & Standard `/.well-known/x402` Resources:** Aligned high-frequency Bazaar intelligence routes (`/v1/bazaar/token-security`, `/v1/bazaar/wallet-risk`, `/v1/bazaar/verified-fetch`) to `\$0.005 USDC` (`5000` atomic), added KV-cached top-level `"resources": [...]` + machine-readable `"guarantee"` blocks on `/.well-known/x402` and `/.well-known/agent.json`, served RFC 9728 `/.well-known/oauth-protected-resource*` and `/.well-known/agent-registration.json`, and prevented `/llms.txt` documentation false-positives in the Canary Auditor.
- **SDK & Shared v1.5.0 (`@nullclear/shared`, `@nullclear/x402-arbiter`):** Added `NullClearClient` methods for x402 directory discovery (`discoverEndpoints`) and zero-key forensics (`scanToken`, `inspectContract`, `decodeCalldata`, `simulateTx`), Bazaar/Guarantee TypeScript schemas, and Base RPC failover constants.

## What's New in v1.4.0
- **13-Tool MCP Server & Streamable HTTP Endpoint (`https://api.nullclear.dev/mcp`):** Uniform `nullclear_<verb>_<noun>` tool suite (`nullclear_scan_token`, `nullclear_inspect_contract`, `nullclear_decode_calldata`, `nullclear_simulate_transaction`, `nullclear_read_markdown`, `nullclear_discover_apis`, `nullclear_audit_paid_token`, `nullclear_score_wallet`, `nullclear_fetch_spot_price`, `nullclear_fetch_guarded`, `nullclear_execute_escrow`, `nullclear_check_reputation`, `nullclear_verify_mandate`, with full legacy name compatibility) plus live `/.well-known/glama.json`, `/.well-known/mcp.json`, and `/.well-known/mcp/server-card.json` metadata.
- **PayAI `settlement_pending` & On-Chain EIP-3009 Recovery:** Polls PayAI `/settle` pending settlements and verifies `AuthorizationUsed` / transaction receipts on Base Mainnet so confirmed payments return `HTTP 200` and record clearings deterministically.
- **Bazaar Discovery & Paid Forensics:** Emits `resource` + `serverExtensions.bazaar` metadata during facilitator settlement for PayAI/CDP Bazaar indexing, and enables `$0.005` (`5000` atomic USDC) EIP-3009 paid access on forensic endpoints alongside the 100 req/day free tier.

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

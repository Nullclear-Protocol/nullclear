# NullClear Protocol — Official Distribution & Ecosystem Submission Kit

This document provides copy-paste ready payloads, metadata configurations, and instructions to list **NullClear** across the autonomous agent payments and AI ecosystem.

---

## 1. Protocol Architecture & Live Production Addresses

- **Protocol Name**: NullClear
- **Website**: [https://nullclear.dev](https://nullclear.dev)
- **Primary Domain**: [https://nullclear.dev](https://nullclear.dev) (canonical redirect from `nullclear.com`)
- **API Base URL**: `https://nullclear.dev`
- **GitHub**: [https://github.com/Nullclear-Protocol/nullclear](https://github.com/Nullclear-Protocol/nullclear)
- **License**: MIT
- **Primary Network**: Base Mainnet (`eip155:8453`)
- **Testnet**: Base Sepolia (`eip155:84532`)
- **Settlement Asset**: USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` on Base)

### Official Protocol Wallets & Contracts
| Role | Address | Description |
| :--- | :--- | :--- |
| **NullClear Treasury** | `0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c` | Cold multi-sig wallet receiving the 0.50% (50 bps) protocol clearing fee. |
| **NullClear Arbiter** | `0xfd74fF802EA0E735514C070AF04E0D6528deD145` | Production hot signer executing on-chain EIP-3009 settlements and EIP-712 clearing attestations. |
| **ERC-8004 Identity Registry** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Canonical ERC-8004 Agent Identity Registry on Base Mainnet. |
| **ERC-8004 Reputation Registry** | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | Canonical ERC-8004 Reputation Feedback Registry on Base Mainnet. |
| **Native Base USDC** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Official USDC token contract supporting EIP-3009 `transferWithAuthorization`. |

---

## 2. Agent Payments Stack (`agentpaymentsstack.com`) Submission Payload

**Category**: **Layer 4 — Governance, Trust & Escrow**

Submit via Pull Request or the submission form at [agentpaymentsstack.com](https://agentpaymentsstack.com):

```json
{
  "name": "NullClear",
  "category": "L4_GOVERNANCE_TRUST_ESCROW",
  "subcategory": "Non-Custodial Clearinghouse & Schema Escrow",
  "tagline": "Autonomous non-custodial clearing and reputation protocol for x402 AI Agents",
  "description": "NullClear eliminates the counterparty risk of paying hallucinating or crashed AI agents upfront. When an agent calls an upstream service via HTTP 402, the buyer signs an EIP-3009 payment authorization held in deferred escrow. NullClear validates the upstream response against a strict JSON schema and HTTP status code. If valid, the payment settles on Base with an on-chain clearing attestation. If malformed or corrupted, payment is voided and the buyer is charged $0.00.",
  "website": "https://nullclear.dev",
  "github": "https://github.com/Nullclear-Protocol/nullclear",
  "documentation": "https://nullclear.dev/llms.txt",
  "chains": ["Base (8453)", "Base Sepolia (84532)"],
  "standards": [
    "x402 V2",
    "ERC-8004 (Agent Identity & Reputation)",
    "EIP-3009 (Transfer With Authorization)",
    "EIP-712 (Typed Structured Data & Corporate KYA)",
    "Deep Invariants & Semantic Bounds (v1.1)",
    "Autonomous Multi-Seller Failover (v1.1)",
    "Outbound Spend Firewall (v1.1)"
  ],
  "contracts": {
    "base": {
      "arbiterWallet": "0xfd74fF802EA0E735514C070AF04E0D6528deD145",
      "treasuryWallet": "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c",
      "erc8004Identity": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      "erc8004Reputation": "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
      "usdc": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    }
  },
  "openApiSpec": "https://nullclear.dev/openapi.json",
  "mcpRegistry": "dev.nullclear/mcp"
}
```

---

## 3. x402 Ecosystem Directory (`x402.org` / Coinbase Developer Platform)

Submit to the x402 ecosystem directory repository or ecosystem index:

### Markdown Listing Snippet
```markdown
### [NullClear](https://nullclear.dev)
- **Role**: Non-Custodial Clearinghouse, Facilitator & Deferred Schema Escrow
- **Supported Chains**: Base Mainnet (`8453`), Base Sepolia (`84532`)
- **Key Feature**: Zero-loss guarantee on agent hallucinations. Validates seller responses against caller JSON schemas and deep semantic invariants before executing EIP-3009 payment settlement. Features autonomous multi-seller failover and outbound spend policies.
- **Protocol Fee**: 50 bps (0.50%)
- **Treasury Address**: `0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c`
- **Arbiter Signer**: `0xfd74fF802EA0E735514C070AF04E0D6528deD145`
- **x402 Manifest**: `https://nullclear.dev/.well-known/x402.json`
- **Agent Card**: `https://nullclear.dev/.well-known/agent.json`
- **Agent Handbook**: `https://nullclear.dev/llms.txt`
```

### JSON Listing Snippet
```json
{
  "id": "nullclear",
  "name": "NullClear Protocol",
  "version": "1.1.0",
  "type": "clearinghouse",
  "url": "https://nullclear.dev",
  "x402Manifest": "https://nullclear.dev/.well-known/x402.json",
  "networks": ["eip155:8453", "eip155:84532"],
  "feeBps": 50,
  "treasuryAddress": "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c",
  "arbiterAddress": "0xfd74fF802EA0E735514C070AF04E0D6528deD145",
  "features": [
    "deferred_schema_escrow",
    "deep_value_invariants",
    "llm_refusal_guard",
    "multi_seller_failover",
    "spend_firewall_policy",
    "zero_loss_abort",
    "erc8004_sybil_scoring",
    "eip712_kya_attestation"
  ]
}
```

---

## 4. MCP Server Registries (Official MCP Registry, Smithery.ai, Glama.ai)

The NullClear Model Context Protocol server (`v1.5.0`) is packaged as [`@nullclear/mcp`](https://www.npmjs.com/package/@nullclear/mcp), hosted over Streamable HTTP at `https://api.nullclear.dev/mcp`, published on Official MCP Registry (`io.github.Nullclear-Protocol/nullclear` via GitHub Actions OIDC), and configured via [`server.json`](./server.json), [`smithery.json`](./smithery.json), and [`glama.json`](./glama.json) (plus `https://api.nullclear.dev/.well-known/glama.json`, `/.well-known/mcp.json`, and `/.well-known/mcp/server-card.json`).

### Official MCP Registry (`modelcontextprotocol/registry`)
Automated via [`.github/workflows/mcp-registry.yml`](./.github/workflows/mcp-registry.yml) (`github-oidc`) using [`server.json`](./server.json) pointing to:
- Remote Streamable HTTP: `https://api.nullclear.dev/mcp`
- npm Package: `@nullclear/mcp` (`1.5.0`, binary: `nullclear-mcp`)
- Config file: `server.json` / `packages/mcp-server/server.json`

### Glama.ai & Smithery.ai Installation & Indexing
- **Glama (`Nullclear-Protocol/nullclear`):** Reads [`glama.json`](./glama.json) and `https://api.nullclear.dev/.well-known/glama.json`.
- **Smithery.ai (`smithery` CLI):** Publishes self-hosted Streamable HTTP endpoint `https://api.nullclear.dev/mcp`:
```bash
npx -y @nullclear/mcp@1.5.0
```

### Direct Claude Desktop / Cursor Configuration (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "nullclear": {
      "command": "npx",
      "args": ["-y", "@nullclear/mcp@1.5.0"],
      "env": {
        "BUYER_PRIVATE_KEY": "<OPTIONAL_AGENT_PRIVATE_KEY_FOR_PAYMENTS>",
        "ARBITER_URL": "https://api.nullclear.dev"
      }
    }
  }
}
```

### Exposed MCP Tools (13 Tools, v1.5.0)
1. **`scan_token_forensics`**: Free-tier multi-oracle Base/ETH/Solana token & rug-pull audit (`GET /v1/scan/:chain/:address`).
2. **`inspect_contract_abi_and_proxy`**: EVM proxy slot (`EIP-1967`/`EIP-1822`) and bytecode function selector extractor (`GET /v1/inspect/:chain/:address`).
3. **`decode_calldata_or_failed_tx`**: Decode hex calldata and detect drainer approvals (`POST /v1/decode`).
4. **`simulate_transaction_preflight`**: Dry-run `eth_call` & gas estimation before signing (`POST /v1/simulate`).
5. **`read_url_clean_markdown`**: Token-efficient HTML-to-Markdown readability scraper (`GET /v1/clean-markdown`).
6. **`nullclear_discover_verified_x402_apis`**: Query live x402 API directory & trust ratings (`GET /v1/bazaar/directory`).
7. **`nullclear_token_security_audit`**: Paid `$0.005` x402 Bazaar real-time token audit (`GET /v1/bazaar/token-security`).
8. **`nullclear_wallet_risk_score`**: Paid `$0.005` x402 Bazaar wallet risk & wash-trade screen (`GET /v1/bazaar/wallet-risk`).
9. **`nullclear_crypto_market_oracle`**: Paid `$0.01` x402 Bazaar live price/liquidity oracle (`GET /v1/bazaar/market-oracle`).
10. **`nullclear_safe_fetch`**: Paid `$0.005` x402 Bazaar JSON-verified clean web fetch (`GET /v1/bazaar/verified-fetch`).
11. **`nullclear_escrow_x402_call`**: Execute any external x402 paid API via NullClear escrow & schema refund protection.
12. **`nullclear_check_reputation`**: Look up an AI agent's ERC-8004 reputation score & grade (`GET /v1/score/:chainId/:agentId`).
13. **`nullclear_verify_kya_mandate`**: Verify an agent's KYA EIP-712 corporate spending mandate (`POST /v1/kya/verify`).

---

## 5. ERC-8004 Agent Registration (`8004scan.io`)

NullClear provides a 1-command registration script to mint the official ERC-8004 Agent Identity on Base Mainnet:

```bash
# Provide the hot signer key and run:
ARBITER_PRIVATE_KEY=0x... pnpm register:erc8004
```

This script:
1. Verifies that the private key derives `0xfd74fF802EA0E735514C070AF04E0D6528deD145`.
2. Connects to Base Mainnet (`8453`).
3. Calls `register("https://nullclear.dev/.well-known/agent.json")` on `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
4. Decodes the minted `agentId`.
5. Automatically updates `ERC8004_AGENT_ID` in `packages/worker-arbiter/wrangler.toml`.
6. Prints the BaseScan transaction and `https://8004scan.io/agents/8453/<agentId>` profile link.

---

## 6. NPM Publishing Guide

To publish all three public packages to npmjs.com:

```bash
# 1. Login to npm
npm login

# 2. Build and verify all packages
pnpm build
pnpm test

# 3. Publish packages in topological order
cd packages/shared && npm publish --access public
cd ../x402-arbiter && npm publish --access public
cd ../mcp-server && npm publish --access public
```

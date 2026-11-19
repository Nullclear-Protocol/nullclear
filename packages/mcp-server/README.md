# @nullclear/mcp

<!-- mcp-name: io.github.Nullclear-Protocol/nullclear -->

[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/nullclear-protocol/nullclear)
[![NullClear Arbiter MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/score.svg)](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear)
[![NullClear Arbiter MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/card.svg)](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear)

Model Context Protocol (MCP) server v1.6.0 enabling autonomous AI agents (Claude Code, Claude Desktop, Cursor, Gemini, OpenAI Agents) to run a **7-chain Pre-Sign Transaction Firewall** (`base`, `eth`, `arbitrum`, `optimism`, `polygon`, `bsc`, `solana`), bytecode/revert inspection, stateful simulation, and non-custodial x402 deferred escrow clearing.

## Remote Endpoint (Zero-Install Streamable HTTP)

```bash
claude mcp add --transport http nullclear https://api.nullclear.dev/mcp
```

## Exposed Tools (14 Curated Tools)

### Zero-Key Forensics & Firewall Tools (10 free calls/day/IP, or `<5ms` Prepaid Pass `NULLCLEAR_API_KEY`)
1. `nullclear_preflight_guard`: **1-Call Pre-Sign Firewall** across all 7 chains (recursive Multicall3/Universal Router/Safe decode, EIP-712 Permit audit, Solana wire tx, stateful `eth_simulateV1`/Solana simulation & touched-token scan).
2. `nullclear_scan_token`: Multi-chain (7 chains + Token-2022) token security, proxy resolution, honeypot, and tax audit.
3. `nullclear_inspect_contract`: EVM proxy slot resolver (EIP-1967/1822/Beacon/Diamond/Safe), Sourcify v2 ABI, batch OpenChain selectors & bytecode CFG risks.
4. `nullclear_decode_calldata`: Recursive calldata, EIP-712, Solana wire tx, custom revert, and verified-router spender trust decoder.
5. `nullclear_simulate_transaction`: Stateful pre-flight `eth_simulateV1` (`stateOverrides`, bundles, asset diffs) & Solana `simulateTransaction` runner.
6. `nullclear_read_markdown`: Clean `<400`-token HTML-to-Markdown documentation reader with SHA-256 provenance.

### x402 Bazaar, Reputation & Escrow Tools
7. `nullclear_discover_apis`: Search verified, high-uptime x402 & ERC-8004 endpoints and proxy URLs.
8. `nullclear_audit_paid_token`: Paid `$0.005` x402 Bazaar multi-chain token audit with signed clearing receipt.
9. `nullclear_score_wallet`: Raw `0x` EVM wallet OFAC sanctions, Sybil concentration, and balance profiler.
10. `nullclear_fetch_spot_price`: Cross-exchange spread-verified spot price oracle with invariant receipt.
11. `nullclear_fetch_guarded`: Auto-guarded HTTP fetcher with 5xx, soft-paywall, and Canonical LLM Refusal protection.
12. `nullclear_execute_escrow`: Execute deferred schema escrow with numeric bounds and LLM refusal guards.
13. `nullclear_check_reputation`: Query an ERC-8004 `agentId` trust score, clearing reliability, and Sybil flags.
14. `nullclear_verify_mandate`: Verify an agent's KYA corporate entity backing and per-transaction limits.

## Drop-In Guarded JSON-RPC Safety Rail (`$5–$100` Prepaid Pass)

Autonomous agent wallets can also point `BASE_RPC_URL` / `SOLANA_RPC_URL` directly to:
```
https://api.nullclear.dev/rpc/base/<nc_live_api_key>
```
Mint a Prepaid Pass instantly via `POST https://api.nullclear.dev/v1/pass/buy` (`$5` Starter = `2,000` credits, `$25` Pro = `15,000` credits, `$100` Scale = `100,000` credits).

## Configuration (stdio)

```json
{
  "mcpServers": {
    "nullclear": {
      "command": "npx",
      "args": ["-y", "@nullclear/mcp@latest"],
      "env": {
        "ARBITER_URL": "https://api.nullclear.dev",
        "NULLCLEAR_API_KEY": "nc_live_optional_prepaid_pass",
        "NULLCLEAR_PRIVATE_KEY": "0x_optional_x402_wallet"
      }
    }
  }
}
```

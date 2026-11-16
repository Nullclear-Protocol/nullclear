# @nullclear/mcp

<!-- mcp-name: io.github.Nullclear-Protocol/nullclear -->

[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/nullclear-protocol/nullclear)
[![NullClear Arbiter MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/score.svg)](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear)
[![NullClear Arbiter MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/card.svg)](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear)

Model Context Protocol (MCP) server v1.4.0 enabling autonomous AI agents (Claude Code, Claude Desktop, Cursor, Gemini, OpenAI Agents) to run zero-key EVM/Solana forensics, bytecode/revert inspection, pre-flight simulation, and deferred HTTP 402 escrow clearing.

## Remote Endpoint (Zero-Install Streamable HTTP)

```bash
claude mcp add --transport http nullclear https://api.nullclear.dev/mcp
```

## Exposed Tools (13 Curated Tools)

### Zero-Key Forensics & URL Tools (100 free calls/day/IP)
1. `scan_token_forensics`: Multi-chain (Base, ETH, Solana) token security, EIP-1967 proxy resolution, honeypot, and tax audit.
2. `inspect_contract_abi_and_proxy`: EVM proxy slot resolver and bytecode PUSH4 selector / SELFDESTRUCT disassembler.
3. `decode_calldata_or_failed_tx`: Historical hex calldata, custom Solidity revert, and failed transaction post-mortem decoder.
4. `simulate_transaction_preflight`: Live pre-flight `eth_call` + `eth_estimateGas` transaction dry-run and drainer check.
5. `read_url_clean_markdown`: Clean `<400`-token HTML-to-Markdown documentation reader with SHA-256 provenance.

### x402 Bazaar, Reputation & Escrow Tools
6. `nullclear_discover_verified_x402_apis`: Search verified, high-uptime x402 & ERC-8004 endpoints and proxy URLs.
7. `nullclear_token_security_audit`: Base Mainnet ERC-20 token security audit with signed Bazaar clearing receipt.
8. `nullclear_wallet_risk_score`: Raw `0x` EVM wallet OFAC sanctions, Sybil concentration, and balance profiler.
9. `nullclear_crypto_market_oracle`: Cross-exchange spread-verified spot price oracle with invariant receipt.
10. `nullclear_safe_fetch`: Auto-guarded HTTP fetcher with 5xx, soft-paywall, and Canonical LLM Refusal protection.
11. `nullclear_escrow_x402_call`: Execute an HTTP 402 call with deferred non-custodial schema escrow and failover ($0 spent on failure).
12. `nullclear_check_reputation`: Query an ERC-8004 `agentId` trust score, clearing reliability, and Sybil flags.
13. `nullclear_verify_kya_mandate`: Verify an agent's KYA corporate liability backing and per-transaction limits.

## Configuration (stdio)

Add to your MCP client config (`claude_desktop_config.json`, `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "nullclear": {
      "command": "npx",
      "args": ["-y", "@nullclear/mcp@latest"],
      "env": {
        "ARBITER_URL": "https://api.nullclear.dev",
        "NULLCLEAR_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

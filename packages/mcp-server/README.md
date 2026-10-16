# @nullclear/mcp

<!-- mcp-name: io.github.mithgalalfayez/nullclear -->

[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/nullclear-protocol/nullclear)
[![NullClear Arbiter MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/score.svg)](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear)
[![NullClear Arbiter MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear/badges/card.svg)](https://glama.ai/mcp/servers/Nullclear-Protocol/nullclear)

Model Context Protocol (MCP) server enabling autonomous AI agents (Claude Desktop, Cursor, Gemini, OpenAI Agents) to safely transact over HTTP 402 with NullClear deferred escrow and reputation scoring.

## Exposed Tools

1. `nullclear_check_reputation`: Query an agent's on-chain trust score, clearing reliability, and Sybil wash-trade penalty flags.
2. `nullclear_escrow_x402_call`: Perform an HTTP 402 call with deferred non-custodial schema escrow, guaranteeing $0 spent if the counterparty agent fails or returns malformed data.
3. `nullclear_verify_kya_mandate`: Verify an agent's legal corporate liability backing and per-transaction limits.

## Configuration

Add to your MCP client config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "nullclear": {
      "command": "node",
      "args": ["/path/to/nullclear/packages/mcp-server/dist/index.js"],
      "env": {
        "ARBITER_URL": "https://arbiter.nullclear.dev",
        "BUYER_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

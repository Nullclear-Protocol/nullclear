# NullClear MCP Registry Assets & Directory Listings

Ready-to-copy metadata and configuration for **Smithery**, **Glama**, **OpenTools**, and official **Model Context Protocol (MCP)** registries.

---

## 📋 Directory Listing Metadata

### Name / Title
`NullClear On-Chain Forensics & Proxy Decoder`

### 1-Line Pitch (Tagline)
Zero-key, proxy-aware smart contract security, honeypot scanner, calldata/revert decoder, and pre-flight simulator for AI agents on Base, Ethereum, and Solana.

### Category / Tags
`blockchain`, `security`, `smart-contracts`, `ethereum`, `base`, `solana`, `forensics`, `mcp`, `ai-agents`, `web3`, `developer-tools`

### Author / Vendor
NullClear Protocol (`https://nullclear.com` / `https://nullclear.dev`)

### Repository URL
`https://github.com/nullclear/nullclear`

### npm Package
`@nullclear/mcp`

### Remote HTTP Endpoint
`https://nullclear.dev/mcp` (or `https://api.nullclear.dev/mcp`)

### License
MIT / Apache-2.0

---

## 📝 Long Description (Markdown)

NullClear is the definitive **Zero-Registration On-Chain Forensic Oracle, Proxy-Aware Bytecode Inspector, Calldata Decoder, and Agent Decision Engine** built specifically for autonomous AI agents (Claude Code, Cursor, Codex, OpenCode, and trading bots).

### Why LLMs & Autonomous Agents Need NullClear:
- **[ZERO API KEY REQUIRED]:** Every core forensic tool operates instantly out of the box with zero API keys, zero wallet connect, and zero registration (100 free requests/day/IP).
- **Sub-400-Token Deterministic Evidence:** Built strictly for LLM context windows with an executive `llmDigest`, deterministic `recommendedAgentAction` enum (`EXECUTE_SAFE`, `CAUTION_HIGH_RISK`, `ABORT_CRITICAL_TRAP`), and cryptographic SHA-256 provenance pinning.
- **Instruction-Boundary EVM Disassembler:** Walks bytecode strictly by instruction boundaries, skipping `PUSH1` through `PUSH32` operands to eliminate false-positive `SELFDESTRUCT` and `DELEGATECALL` alarms.
- **EIP-1967 / EIP-1822 Proxy Awareness:** Reads implementation and admin storage slots on-chain so upgraded tokens (like USDC) are audited at their true implementation logic.
- **Cross-Chain Self-Healing:** Automatically identifies whether an address belongs to Base, Ethereum mainnet, or Solana base58 and resolves the correct chain without returning dead-end errors.
- **Calldata, Revert & Drainer Decoder:** Disassembles function calls, decodes custom Solidity reverts, and flags unlimited ERC-20 allowances or collection-wide NFT drainers before any transaction is signed.

---

## 🛠️ Included MCP Tools (13 Tools)

### Zero-Key Security Tools (Priority Toolset)
1. `scan_token_forensics` — [ZERO API KEY REQUIRED] Block-pinned security, proxy, honeypot, and buy/sell tax audit for Base, ETH, or Solana tokens (<400 tokens).
2. `inspect_contract_abi_and_proxy` — [ZERO API KEY REQUIRED] Disassemble EVM bytecode along instruction boundaries, resolve EIP-1967/1822 proxy implementation slots, and extract verified 4-byte function selectors.
3. `decode_calldata_or_failed_tx` — [ZERO API KEY REQUIRED] Decode raw hex calldata, extract custom revert errors, perform failed tx post-mortems, and flag drainer approvals.
4. `simulate_transaction_preflight` — [ZERO API KEY REQUIRED] Run pre-flight `eth_call` & gas estimation to verify whether a tx will succeed or revert before signing.
5. `read_url_clean_markdown` — [ZERO API KEY REQUIRED] Strip ads, scripts, and navigation clutter into token-efficient clean Markdown (<350 tokens).

### High-Frequency x402 Clearinghouse & Micro-Payment Tools
6. `fetch_with_auto_guard` — Fetch any URL with automated schema verification and response validation.
7. `simulate_escrow_settlement` — Dry-run an x402 clearing settlement with seller score check.
8. `get_seller_trust_score` — Retrieve reputation and attestation history for any x402 seller.
9. `register_seller_gateway` — Create a 1-click x402 paywall gateway.
10. `get_escrow_status` — Check status of an x402 escrow hold.
11. `query_market_oracle` — Query verified real-time pricing feeds with attestation receipts.
12. `check_wallet_risk` — Query AML/Sybil risk score for any EVM wallet.
13. `verify_response_data` — Validate arbitrary JSON data against a JSON schema.

---

## ⚙️ Configuration Snippets

### 1. Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "nullclear": {
      "command": "npx",
      "args": ["-y", "@nullclear/mcp@latest"]
    }
  }
}
```

### 2. Cursor (`~/.cursor/mcp.json` or project `.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "nullclear": {
      "command": "npx",
      "args": ["-y", "@nullclear/mcp@latest"]
    }
  }
}
```

### 3. Smithery CLI One-Liner
```bash
npx -y @smithery/cli install @nullclear/mcp --client claude
```

### 4. Zero-Install Remote HTTP SSE (Cursor / OpenCode / Windsurf)
```json
{
  "mcpServers": {
    "nullclear-remote": {
      "url": "https://nullclear.dev/mcp"
    }
  }
}
```

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
`https://github.com/Nullclear-Protocol/nullclear`

### npm Package
`@nullclear/mcp` (`1.5.0`)

### Remote HTTP Endpoint
`https://api.nullclear.dev/mcp`

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

### x402 Discovery, Bazaar Oracles, Escrow & Reputation Tools
6. `nullclear_discover_verified_x402_apis` — Search NullClear's live ecosystem directory for audited high-uptime x402 endpoints and Zero-Loss Proxy URLs.
7. `nullclear_token_security_audit` — Base Mainnet ERC-20 token security audit with signed Bazaar clearing receipt ($0.01 USDC / 10 free trials/day).
8. `nullclear_wallet_risk_score` — Base Mainnet `0x` wallet OFAC sanctions, Sybil concentration, and ERC-8004 profile ($0.01 USDC / 10 free trials/day).
9. `nullclear_crypto_market_oracle` — Spread-verified spot price oracle (Coinbase + Binance) with invariant attestation ($0.01 USDC / 10 free trials/day).
10. `nullclear_safe_fetch` — Auto-guarded HTTP JSON/API fetcher blocking 5xx crashes, soft-paywalls, and Canonical LLM Refusals ($0.01 USDC / 10 free trials/day).
11. `nullclear_escrow_x402_call` — Execute paid x402 requests through deferred non-custodial EIP-3009 schema escrow, deep invariants, failover & spend caps.
12. `nullclear_check_reputation` — Inspect an ERC-8004 numeric `agentId` composite trust score, grade, and Sybil wash-trading flags.
13. `nullclear_verify_kya_mandate` — Verify a Know Your Agent (KYA) EIP-712 corporate liability mandate and per-transaction limits.

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

### 4. Zero-Install Remote Streamable HTTP (Claude Code / Cursor / OpenCode / Windsurf)
```json
{
  "mcpServers": {
    "nullclear-remote": {
      "url": "https://api.nullclear.dev/mcp"
    }
  }
}
```

# @nullclear/agentkit

Autonomous pre-execution transaction firewall for **Coinbase AgentKit** wallets across **7 chains** (`base`, `eth`, `arbitrum`, `optimism`, `polygon`, `bsc`, `solana`).

- **1-Line Guarded JSON-RPC Safety Rail:** Point your AgentKit wallet `rpcUrl` to `https://api.nullclear.dev/rpc/base/<nc_live_key>` (mint via `POST /v1/pass/buy` for `$5 / $25 / $100` USDC) to automatically block prompt-injected drainers, honeypots, and reverting swaps before hitting the mempool.
- **Zero-Key Quickstart (`10` free calls/day/IP) or Prepaid Pass (`nc_live_...` at `<5ms`):** Works with `nullclear_preflight_guard` (`POST /v1/guard`), recursive Multicall3/UniversalRouter/Safe decoding, EIP-712 Permit audits, Solana Token-2022 checks, and 15-token batch scans (`$0.025`).

## 1-Line Guarded RPC Safety Rail

```bash
# Protect every outgoing AgentKit transaction automatically:
BASE_RPC_URL="https://api.nullclear.dev/rpc/base/nc_live_your_key_here"
```

## 3-Line ActionProvider Setup

```ts
import { AgentKit } from "@coinbase/agentkit";
import { nullclearActionProvider, createNullClearWalletGuard } from "@nullclear/agentkit";

const wallet = createNullClearWalletGuard(walletProvider, {
  apiKey: process.env.NULLCLEAR_API_KEY // optional nc_live_... Prepaid Pass
});

const agentKit = await AgentKit.from({
  walletProvider: wallet,
  actionProviders: [nullclearActionProvider({ apiKey: process.env.NULLCLEAR_API_KEY })]
});
```

## Actions Exposed

- `nullclear_preflight_guard` — 1-Call Pre-Sign Firewall across 7 chains (nested calldata, EIP-712 Permit, Solana wire tx, stateful `eth_simulateV1` asset diffs, and touched-token honeypot checks)
- `nullclear_scan_token` — 7-chain token honeypot, Token-2022, proxy & tax audit (`EXECUTE_SAFE` / `CAUTION_HIGH_RISK` / `ABORT_CRITICAL_TRAP`)
- `nullclear_scan_batch` — Up to 15 tokens per call (`EXECUTE_SAFE` / `ABORT_CRITICAL_TRAP`)
- `nullclear_decode_calldata` — Flags unlimited `approve` / `setApprovalForAll` / nested Multicall3 drainers (`ABORT_DRAINER_APPROVAL`)
- `nullclear_simulate_tx` — Pre-flight stateful `eth_simulateV1` revert & asset diff check (`ABORT_WILL_REVERT`)

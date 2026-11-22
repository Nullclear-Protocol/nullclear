# @nullclear/plugin-eliza

Pre-execution rug, honeypot, Token-2022, and drainer firewall plugin for **ElizaOS** agents across **7 chains** (`base`, `eth`, `arbitrum`, `optimism`, `polygon`, `bsc`, `solana`).

- **1-Line Guarded JSON-RPC Safety Rail:** Point your Eliza character's `EVM_RPC_URL` or `SOLANA_RPC_URL` to `https://api.nullclear.dev/rpc/base/<nc_live_key>` (minted via `POST /v1/pass/buy` for `$5 / $25 / $100` USDC) to automatically block prompt-injected drainers and honeypots before mempool broadcast.
- **Zero-Key Quickstart (`10` free calls/day/IP):** Works out of the box, or authenticates with `NULLCLEAR_API_KEY` (`<5ms` Prepaid Pass) or `NULLCLEAR_PRIVATE_KEY` (x402 EIP-3009) in Eliza character settings.

## 1-Line Guarded RPC Config

```env
# Automatically screens every broadcast before it reaches the mempool:
EVM_RPC_URL=https://api.nullclear.dev/rpc/base/nc_live_your_key_here
SOLANA_RPC_URL=https://api.nullclear.dev/rpc/solana/nc_live_your_key_here
NULLCLEAR_API_KEY=nc_live_your_key_here
```

## 3-Line Plugin Setup

```ts
import { nullclearPlugin } from "@nullclear/plugin-eliza";

const character = {
  name: "SafeTrader",
  plugins: [nullclearPlugin]
};
```

Or with strict mode / custom Prepaid Pass:

```ts
import { createNullClearPlugin, assertSafeElizaSwap } from "@nullclear/plugin-eliza";

const plugin = createNullClearPlugin({
  defaultChain: "solana",
  strict: true,
  apiKey: process.env.NULLCLEAR_API_KEY
});

// Inside custom swap handlers:
await assertSafeElizaSwap(mintAddress, { chain: "solana", strict: true });
```

## Included Actions & Provider

- `NULLCLEAR_SCAN_TOKEN`: Checks any Solana SPL/Token-2022 mint or EVM token (`base`, `eth`, `arbitrum`, `optimism`, `polygon`, `bsc`) for honeypots, taxes, and rug traps
- `NULLCLEAR_SCAN_BATCH`: Batch-checks 2 to 15 tokens across all 7 chains
- `NULLCLEAR_GUARD_CALLDATA`: Runs the 1-Call Pre-Sign Firewall (`guard` / nested `decode`) blocking unlimited approval & Multicall3 drainers (`ABORT_DRAINER_APPROVAL`)
- `nullclear-firewall-context` Provider: Injects real-time NullClear security verdicts into agent context when token addresses appear

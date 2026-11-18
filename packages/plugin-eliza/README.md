# @nullclear/plugin-eliza

Pre-flight rug, honeypot, and drainer firewall plugin for **ElizaOS** trading & DeFi agents across **Solana**, **Base**, and **Ethereum**.

- Works out of the box with **zero API keys** (`100` free scans/day per IP on `https://api.nullclear.dev`), or auto-settles x402 USDC calls when `NULLCLEAR_PRIVATE_KEY` is present in Eliza character settings.
- Automatically evaluates tokens mentioned in chat via `nullclearFirewallProvider` so your trading character sees `EXECUTE_SAFE` vs `ABORT_CRITICAL_TRAP` before executing Jupiter/Raydium/Uniswap swaps.

## 3-Line Setup

```ts
import { nullclearPlugin } from "@nullclear/plugin-eliza";

const character = {
  name: "SafeTrader",
  plugins: [nullclearPlugin]
};
```

Or with strict mode / custom x402 key:

```ts
import { createNullClearPlugin, assertSafeElizaSwap } from "@nullclear/plugin-eliza";

const plugin = createNullClearPlugin({ defaultChain: "solana", strict: true });

// Inside custom swap handlers:
await assertSafeElizaSwap(mintAddress, { chain: "solana", strict: true });
```

## Included Actions & Provider

- `NULLCLEAR_SCAN_TOKEN` — Checks any Solana mint, Base token, or Ethereum ERC-20 for honeypots, taxes, and rug traps
- `NULLCLEAR_SCAN_BATCH` — Batch-checks 2 to 15 tokens across Solana, Base, and Ethereum
- `NULLCLEAR_GUARD_CALLDATA` — Decodes EVM hex calldata and blocks unlimited approval drainers (`ABORT_DRAINER_APPROVAL`)
- `nullclear-firewall-context` Provider — Injects real-time NullClear security verdicts into agent context when token addresses appear

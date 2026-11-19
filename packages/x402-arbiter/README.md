# @nullclear/x402-arbiter

Autonomous Agent Firewall & x402 Clearing SDK (`v1.7.0`) across **7 chains** (`base`, `eth`, `arbitrum`, `optimism`, `polygon`, `bsc`, `solana`):

- **Drop-In Guarded JSON-RPC Safety Rail (`createNullClearRpcUrl`):** Built for Autonomous AI Agents (`AgentKit`, `ElizaOS`, `Virtuals`, `Rig`) and Safe/DAO treasuries. Swap one `RPC_URL` env var — read calls authenticate via `<5ms` edge KV at `0` credits; every broadcast (`eth_sendRawTransaction` / `sendTransaction`) is simulated and blocks drainers, honeypots, and reverts before hitting the mempool.
- **Prepaid Firewall Passes (`$5` / `$25` / `$100` USDC):** Eliminates 1–2s per-call x402 settlement overhead and cuts per-call cost by up to 80% (`nc_live_...` Bearer keys via `client.buyPass("pro")` or `POST /v1/pass/buy`).
- **1-Call Pre-Sign Guard (`client.guard`):** Recursive Multicall3/Universal Router/Safe calldata unwrapping, EIP-712 Permit/Seaport audits, Solana wire tx + Token-2022 checks, stateful `eth_simulateV1` asset diffs, and touched-token honeypot scanning.
- **Cryptographic Policy Co-Signer (`client.cosign`), Watchtower Monitors (`createNullClearPassClient`), & `$0.10` Institutional Dossiers (`client.dueDiligence`).**
- **Non-Custodial x402 Schema Escrow (`createNullClearFetch`):** Holds EIP-3009 authorizations and voids with `$0` spent if an upstream x402 API crashes, stalls, or emits an LLM refusal.

## Quickstart: Guarded JSON-RPC Safety Rail (1 Line)

```typescript
import { createNullClearRpcUrl, createNullClearPassClient } from "@nullclear/x402-arbiter";

// 1. Replace your agent's Base / Ethereum / Solana RPC URL:
const guardedBaseRpc = createNullClearRpcUrl({
  chain: "base",
  apiKey: process.env.NULLCLEAR_API_KEY!, // nc_live_... from POST /v1/pass/buy
  failMode: "closed"
});

// Or with Prepaid Pass helpers:
const pass = createNullClearPassClient(process.env.NULLCLEAR_API_KEY!);
const verdict = await pass.guard({ chain: "base", to, from, data, value });
const dossier = await pass.dueDiligence("solana", mintAddress);
```

## Quickstart: Zero-Key Forensics & Auto-x402 Client

```typescript
import { createNullClearFetch, NullClearClient } from "@nullclear/x402-arbiter";
import { z } from "zod";

// 1-Call Pre-Sign Guard (10 free/day/IP zero-key, or Prepaid Pass / x402 auto-pay)
const client = new NullClearClient({
  apiKey: process.env.NULLCLEAR_API_KEY, // optional nc_live_... Bearer pass
  signer: process.env.BUYER_PRIVATE_KEY as `0x${string}` // optional x402 fallback
});

const guard = await client.guard({ chain: "arbitrum", from, to, data });
if (guard.recommendedAgentAction !== "EXECUTE_SAFE") {
  throw new Error(`Blocked: ${guard.recommendedAgentAction}`);
}

// Non-custodial deferred escrow fetch ($0 spent on seller failure)
const nullclearFetch = createNullClearFetch({
  accountOrPrivateKey: "0x...",
  chainId: 8453
});

const response = await nullclearFetch("https://seller-agent.com/v1/alpha", {
  nullclear: {
    sellerAgentId: "42",
    minTrustScore: 60,
    schema: z.object({ ticker: z.string(), price: z.number() })
  }
});
```

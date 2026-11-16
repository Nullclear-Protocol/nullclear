# @nullclear/x402-arbiter

Autonomous Agent SDK (`v1.5.0`) for zero-risk HTTP 402 calls via NullClear Deferred Non-Custodial Schema Escrow, x402 API discovery, and zero-key EVM/Solana transaction forensics.

## Key Features
- **Automatic 402 Interception:** Intercepts standard `402 Payment Required` headers and signs EIP-3009 authorizations.
- **Zod & JSON Schema Enforcement:** Define expected response structures with standard Zod or JSON schemas.
- **$0 Spend Protection:** If the seller crashes, returns 500, or hallucinates bad types, settlement is voided and $0 is spent.
- **Zero-Key Forensics & Discovery (`NullClearClient`):** Built-in helpers for `discoverEndpoints`, `scanToken`, `inspectContract`, `decodeCalldata`, and `simulateTx`.

## Quickstart

```typescript
import { createNullClearFetch, NullClearClient } from "@nullclear/x402-arbiter";
import { z } from "zod";

const nullclearFetch = createNullClearFetch({
  accountOrPrivateKey: "0x...", // Buyer private key or viem account
  chainId: 8453, // Base Mainnet (or 84532 for Base Sepolia)
  arbiterUrl: "https://api.nullclear.dev"
});

// Make requests normally - 402 will be intercepted and escrow-routed
const response = await nullclearFetch("https://seller-agent.com/v1/alpha", {
  nullclear: {
    sellerAgentId: "42",
    minTrustScore: 60,
    schema: z.object({
      ticker: z.string(),
      price: z.number(),
      confidence: z.number()
    })
  }
});

const data = await response.json();
console.log("Verified data:", data);

// Zero-key transaction decoding & ecosystem discovery
const client = new NullClearClient({ arbiterUrl: "https://api.nullclear.dev" });
const directory = await client.discoverEndpoints({ category: "security" });
const decoded = await client.decodeCalldata("0x095ea7b3...", "base");
```

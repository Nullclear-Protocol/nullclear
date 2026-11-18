# @nullclear/agentkit

Autonomous pre-flight token & calldata security firewall for **Coinbase AgentKit** wallets on **Base**, **Ethereum**, and **Solana**.

- Zero API keys or registration required (`100` free scans/day per IP, automatic x402 EIP-3009 USDC failover when your AgentKit wallet is attached).
- Scans tokens for honeypots, hidden buy/sell taxes, mutable proxies, `SELFDESTRUCT` opcodes, and rug liquidity traps before your agent executes DEX swaps.
- Supports **15-token parallel batch scans** (`POST /v1/bazaar/scan-batch`, `$0.025 USDC`) plus pre-sign calldata decoding & `eth_call` simulation.

## 3-Line Setup

```ts
import { AgentKit } from "@coinbase/agentkit";
import { nullclearActionProvider } from "@nullclear/agentkit";

const agentKit = await AgentKit.from({
  walletProvider,
  actionProviders: [nullclearActionProvider()]
});
```

## Programmatic Pre-Swap & Wallet Guards

```ts
import { assertSafeSwap, createNullClearWalletGuard } from "@nullclear/agentkit";

// 1. Hard-block honeypots/rugs before calling Uniswap/Aerodrome/Jupiter
await assertSafeSwap(tokenAddress, { chain: "base", strict: true });

// 2. Wrap WalletProvider.sendTransaction to decode infinite-approval drainers & simulate reverts automatically
const guardedWallet = createNullClearWalletGuard(walletProvider);
```

## Actions Exposed

- `nullclear_scan_token` — Multi-chain token honeypot & tax audit (`EXECUTE_SAFE` / `CAUTION_HIGH_RISK` / `ABORT_CRITICAL_TRAP`)
- `nullclear_scan_batch` — Up to 15 tokens per call (`EXECUTE_SAFE` / `ABORT_CRITICAL_TRAP`)
- `nullclear_decode_calldata` — Flags unlimited `approve` / `setApprovalForAll` drainers (`ABORT_DRAINER_APPROVAL`)
- `nullclear_simulate_tx` — Pre-flight `eth_call` revert detection (`ABORT_WILL_REVERT`)

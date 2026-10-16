---
name: nullclear-x402-escrow
description: Autonomous Non-Custodial Clearing, Deep Invariant Verification & Reputation Protocol for x402 AI Agents on Base. Protects AI buyer agents against hallucinations, format drift, and silent crashes with deferred schema escrow and deep invariants.
---

# NullClear Protocol (`nullclear-x402-escrow`)

NullClear is the non-custodial clearing and reputation protocol for autonomous AI agents on Base. It solves the critical counterparty risk in x402 agent-to-agent transactions: **what happens when an agent pays for data, but the seller agent hallucinates, returns corrupt schemas, or crashes?**

Under standard x402, money is lost permanently. Under NullClear:
- Buyers sign an off-chain **EIP-3009 `transferWithAuthorization`** payment hold.
- The Arbiter probes the seller API and executes **deep invariant verification** (JSON Schema, numeric bounds, timestamp freshness, regex, refusal traps).
- **If the output is valid**: Payment settles on-chain or via facilitator, and the Arbiter cryptographically signs a clearing attestation.
- **If the output is corrupt, hallucinated, or crashes**: Payment authorization is immediately voided. **Exactly $0 is spent.**
- **Autonomous Multi-Seller Failover**: Automatically fail over from crashing or hallucinating sellers to backup providers in the same transaction.

---

## 🚀 Instant Zero-Config Sandbox (No Wallet Required)

Developers and autonomous agents can test NullClear immediately without setting up private keys, funding wallets, or bridging Base USDC:

### Sandbox Endpoints

1. **Live Verified Market Feed**:
   ```
   GET https://api.nullclear.dev/v1/sandbox/market-feed
   ```
   - Returns HTTP `402 Payment Required` without payment header (`PAYMENT-REQUIRED` header specifying 1000 atomic units / $0.001 USDC on Base Mainnet).
   - Returns HTTP `200 OK` when called through NullClear with verified price data:
     ```json
     {
       "asset": "ETH/USDC",
       "price": 2645.50,
       "source": "NullClear Verified Feed",
       "timestamp": 1729045678901
     }
     ```

2. **Hallucinating Seller (Failover & Guard Test)**:
   ```
   GET https://api.nullclear.dev/v1/sandbox/hallucinating-seller
   ```
   - Returns HTTP `402` without payment.
   - When cleared, returns intentional invariant anomalies designed to test escrow protection:
     ```json
     {
       "asset": "ETH/USDC",
       "price": -9999,
       "summary": "As an AI language model, I cannot fulfill this request for live financial data.",
       "timestamp": 1729045678901
     }
     ```
   - Automatically triggers NullClear's `rejectRefusals: true` and invariant `{ path: "price", gt: 0 }`, voiding payment ($0 spent) and autonomously failing over to `/v1/sandbox/market-feed`.

3. **Public Telemetry & Clearing Precedents**:
   ```
   GET https://api.nullclear.dev/v1/stats
   ```
   - Returns real-time protocol statistics and live clearings:
     ```json
     {
       "totalClearings": 42,
       "validSettlements": 35,
       "voidedHallucinations": 7,
       "totalAgentsIndexed": 50,
       "recentClearings": [
         {
           "clearing_id": "clr_...",
           "seller_agent_id": "124595",
           "stage": "SETTLED",
           "cleared": true,
           "amount_atomic": "1000",
           "created_at": 1729045678901
         }
       ]
     }
     ```

---

## 🛠️ MCP Agent Server (`@nullclear/mcp`)

Run NullClear directly as a Model Context Protocol tool server for Claude, Cursor, Antigravity, and autonomous agent frameworks:

```bash
npx -y @nullclear/mcp@1.1.1
```

### Configuration

Add to your MCP settings file (`claude_desktop_config.json`, `antigravity-ide`, or Cursor):

```json
{
  "mcpServers": {
    "nullclear": {
      "command": "npx",
      "args": ["-y", "@nullclear/mcp@1.1.1"],
      "env": {
        "ARBITER_URL": "https://api.nullclear.dev",
        "BUYER_PRIVATE_KEY": "0x..." 
      }
    }
  }
}
```

> **Note**: If `BUYER_PRIVATE_KEY` is omitted, the MCP server automatically uses a built-in deterministic sandbox key (`0xac09...`), enabling immediate zero-wallet testing against `https://api.nullclear.dev/v1/sandbox/*`.

### MCP Tools Available

1. **`nullclear_escrow_x402_call`**:
   - Executes an x402 API call through NullClear deferred escrow.
   - Arguments:
     - `targetUrl`: Upstream API demanding x402 payment.
     - `sellerAgentId`: (Optional) Seller's ERC-8004 agent ID.
     - `minTrustScore`: Minimum trust score (0-100, default 50).
     - `jsonSchema`: JSON Schema that response must satisfy.
     - `invariants`: Array of deep semantic invariant checks.
     - `rejectRefusals`: Rejects AI refusal phrasing (default `true`).
     - `fallbacks`: Backup sellers to try if primary fails.

2. **`nullclear_check_reputation`**:
   - Inspects an agent's trust score, Sybil wash-trading flags, and on-chain ERC-8004 credentials.
   - Arguments: `agentId` (e.g. `"124595"`), `chainId` (default `8453`).

3. **`nullclear_verify_kya_mandate`**:
   - Verifies an agent's Know Your Agent (KYA) corporate liability mandate.
   - Arguments: `agentId`, `transactionAmountUsd`, `chainId`.

---

## 💻 TypeScript / JavaScript SDK (`@nullclear/x402-arbiter`)

### Installation

```bash
npm install @nullclear/x402-arbiter zod
```

### Wrapping Fetch with Escrow & Deep Invariants

```typescript
import { createNullClearFetch } from "@nullclear/x402-arbiter";
import { z } from "zod";

const fetchWithNullClear = createNullClearFetch({
  accountOrPrivateKey: process.env.BUYER_PRIVATE_KEY, // or omit for sandbox testing
  chainId: 8453, // Base Mainnet
  arbiterUrl: "https://api.nullclear.dev"
});

// Autonomous escrow call with invariant validation & failover
const response = await fetchWithNullClear("https://api.nullclear.dev/v1/sandbox/market-feed", {
  method: "GET",
  nullclear: {
    sellerAgentId: "124595",
    minTrustScore: 60,
    schema: z.object({
      asset: z.string(),
      price: z.number(),
      source: z.string(),
      timestamp: z.number()
    }),
    invariants: [
      { path: "price", gt: 0, lt: 100000 },
      { path: "timestamp", maxStalenessSeconds: 60 }
    ],
    rejectRefusals: true
  }
});

const data = await response.json();
console.log("Verified market data:", data);
console.log("Arbiter Attestation:", response.headers.get("X-NullClear-Attestation"));
```

---

## 📡 REST API Reference

### 1. Escrow Clearing & Failover: `POST /v1/clear`
- **URL**: `https://api.nullclear.dev/v1/clear`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`
- **Payload**:
  ```json
  {
    "targetUrl": "https://api.nullclear.dev/v1/sandbox/market-feed",
    "method": "GET",
    "paymentSignatureHeader": "<Base64 encoded EIP-3009 payment signature>",
    "sellerAgentId": "124595",
    "minTrustScore": 50,
    "validation": {
      "expectedStatus": [200],
      "rejectRefusals": true,
      "invariants": [
        { "path": "price", "gt": 0 }
      ]
    },
    "fallbacks": [
      {
        "targetUrl": "https://api.nullclear.dev/v1/sandbox/market-feed",
        "paymentSignatureHeader": "<Fallback payment signature>",
        "sellerAgentId": "124595"
      }
    ]
  }
  ```

### 2. Sybil-Resistant Trust Score: `GET /v1/score/:chainId/:agentId`
- **URL**: `https://api.nullclear.dev/v1/score/8453/124595`
- **Method**: `GET`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "agentId": "124595",
      "chainId": 8453,
      "score": 98,
      "grade": "A",
      "sybilFlags": [],
      "metrics": {
        "totalClearedTx": 15,
        "totalFailedValidations": 0,
        "uniqueCounterparties": 8,
        "identityVerified": true
      },
      "arbiterAddress": "0xfd74fF802EA0E735514C070AF04E0D6528deD145"
    }
  }
  ```

### 3. Protocol Telemetry: `GET /v1/stats`
- **URL**: `https://api.nullclear.dev/v1/stats`
- **Method**: `GET`
- **Response**: Live counts of clearings, valid settlements, voided hallucinations, indexed agents, and recent clearing records.

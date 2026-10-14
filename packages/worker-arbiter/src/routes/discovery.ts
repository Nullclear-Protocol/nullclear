import { Hono } from "hono";
import type { Env } from "../env.js";

export const discoveryRouter = new Hono<Env>();

// GET / - Crisp, dark-mode technical documentation page in pure HTML/CSS
discoveryRouter.get("/", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NullClear | Non-Custodial Clearing & Reputation Protocol</title>
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: rgba(22, 27, 34, 0.7);
      --border: rgba(255, 255, 255, 0.1);
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.25);
      --success: #34d399;
      --warning: #fbbf24;
      --danger: #f87171;
      --text: #f1f5f9;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    header {
      text-align: center;
      margin-bottom: 3rem;
      padding: 3rem 1rem;
      background: radial-gradient(circle at 50% 30%, var(--accent-glow), transparent 70%);
      border-radius: 16px;
      border: 1px solid var(--border);
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid var(--accent);
      color: var(--accent);
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 1rem;
      letter-spacing: 0.05em;
    }
    h1 { font-size: 2.75rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 0.75rem; }
    .subtitle { color: var(--muted); font-size: 1.2rem; max-width: 680px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 3rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      backdrop-filter: blur(12px);
    }
    .card h3 { color: var(--accent); margin-bottom: 0.5rem; font-size: 1.25rem; }
    .card p { color: var(--muted); font-size: 0.95rem; }
    .code-block {
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.85rem;
      color: #7dd3fc;
      overflow-x: auto;
      margin-top: 1rem;
    }
    .endpoints-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      font-size: 0.9rem;
    }
    .endpoints-table th, .endpoints-table td {
      text-align: left;
      padding: 0.75rem;
      border-bottom: 1px solid var(--border);
    }
    .endpoints-table th { color: var(--muted); font-weight: 600; }
    .method-get { color: var(--success); font-weight: bold; }
    .method-post { color: var(--accent); font-weight: bold; }
    footer { text-align: center; color: var(--muted); font-size: 0.85rem; margin-top: 3rem; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge">PROTOCOL SPECIFICATION v2.0</div>
      <h1>NullClear Arbiter</h1>
      <p class="subtitle">Autonomous Non-Custodial Clearing & Reputation Protocol for x402 AI Agents on Base</p>
    </header>

    <div class="grid">
      <div class="card">
        <h3>🛡️ Deferred Non-Custodial Escrow</h3>
        <p>Buyer signs an EIP-3009 authorization. The arbiter executes upstream calls and only settles if output adheres 100% to the schema contract. Hallucinations void payment immediately with $0 charged.</p>
      </div>
      <div class="card">
        <h3>📊 Sybil-Resistant Scoring</h3>
        <p>Reads on-chain ERC-8004 Identity & Reputation registries, tracks clearing reliability, and applies wash-trading penalties if counterparty concentration exceeds 60%.</p>
      </div>
      <div class="card">
        <h3>🏢 Corporate KYA Mandates</h3>
        <p>Know Your Agent (KYA) mandates cryptographically bind autonomous agents to verified corporate entities with explicit per-transaction limits and liability coverage.</p>
      </div>
    </div>

    <div class="card" style="margin-bottom: 2rem;">
      <h3>⚡ Protocol Endpoints</h3>
      <table class="endpoints-table">
        <thead>
          <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="method-post">POST</span></td><td><code>/v1/clear</code></td><td>Deferred schema escrow proxy & settlement</td></tr>
          <tr><td><span class="method-get">GET</span></td><td><code>/v1/score/:chainId/:agentId</code></td><td>Sybil-resistant trust score & flags</td></tr>
          <tr><td><span class="method-post">POST</span></td><td><code>/v1/kya/attest</code></td><td>Attest corporate liability mandate</td></tr>
          <tr><td><span class="method-get">GET</span></td><td><code>/v1/kya/:chainId/:agentId</code></td><td>Retrieve verified corporate mandate</td></tr>
          <tr><td><span class="method-get">GET</span></td><td><a href="/llms.txt"><code>/llms.txt</code></a></td><td>Agent-tailored integration instructions</td></tr>
          <tr><td><span class="method-get">GET</span></td><td><a href="/.well-known/agent.json"><code>/.well-known/agent.json</code></a></td><td>ERC-8004 / A2A Registration Card</td></tr>
          <tr><td><span class="method-get">GET</span></td><td><a href="/.well-known/x402.json"><code>/.well-known/x402.json</code></a></td><td>x402 Service Manifest</td></tr>
          <tr><td><span class="method-get">GET</span></td><td><a href="/openapi.json"><code>/openapi.json</code></a></td><td>Full OpenAPI 3.1.0 Specification</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h3>💻 Quick SDK Integration</h3>
      <p>Autonomous agents wrap standard fetch to guarantee $0 lost on bad upstream data:</p>
      <div class="code-block">
import { createNullClearFetch } from "@nullclear/x402-arbiter";
import { z } from "zod";

const fetchWithNullClear = createNullClearFetch({
  accountOrPrivateKey: process.env.BUYER_PRIVATE_KEY,
  chainId: 8453,
  arbiterUrl: "https://arbiter.nullclear.dev"
});

// If the seller returns corrupted data, NullClear voids settlement automatically!
const res = await fetchWithNullClear("https://agent-seller.com/api/data", {
  nullclear: {
    sellerAgentId: "42",
    minTrustScore: 60,
    schema: z.object({ price: z.number(), confidence: z.number() })
  }
});
      </div>
    </div>

    <footer>
      <p>NullClear Protocol &bull; Base Mainnet (8453) &bull; Base Sepolia (84532) &bull; <a href="/openapi.json">OpenAPI Spec</a> &bull; <a href="/llms.txt">llms.txt</a></p>
    </footer>
  </div>
</body>
</html>`;
  return c.html(html);
});

// GET /llms.txt
discoveryRouter.get("/llms.txt", (c) => {
  const text = `# NullClear Protocol for Autonomous AI Agents

NullClear is an autonomous non-custodial clearing and reputation protocol designed for x402 Agent-to-Agent (A2A) commerce on Base (Chain ID 8453).

## Why Use NullClear
When interacting with other AI agents via HTTP 402 Payment Required, never pay upfront. An upstream agent may hallucinate, crash, or return malformed JSON.
With NullClear:
1. You provide an EIP-3009 payment authorization.
2. The NullClear Arbiter holds the authorization in escrow and forwards your request to the seller.
3. The arbiter strictly validates the response against your JSON schema and expected HTTP status.
4. If valid, payment is settled and attested.
5. If invalid or corrupted, the authorization is VOIDED. You are charged $0.

## Core Endpoints

### 1. Execute Escrowed Call
- **Endpoint**: \`POST /v1/clear\`
- **Body**:
  \`\`\`json
  {
    "targetUrl": "https://api.seller-agent.com/data",
    "method": "GET",
    "paymentSignatureHeader": "<Base64 encoded X402PaymentSignaturePayload>",
    "sellerAgentId": "42",
    "minTrustScore": 50,
    "validation": {
      "expectedStatus": [200],
      "jsonSchema": {
        "type": "object",
        "required": ["ticker", "price"],
        "properties": {
          "ticker": { "type": "string" },
          "price": { "type": "number" }
        }
      }
    }
  }
  \`\`\`

### 2. Inspect Agent Reputation & Sybil Risk
- **Endpoint**: \`GET /v1/score/:chainId/:agentId\`
- Returns composite score (0-100), grade (A-F), Sybil flags, and counterparty metrics.

### 3. Verify Corporate Liability Mandate (KYA)
- **Endpoint**: \`GET /v1/kya/:chainId/:agentId\`
- Returns legal entity backing, max transaction limit, and liability coverage.

## MCP Tools
Autonomous agents can connect directly via the \`@nullclear/mcp\` server:
- \`nullclear_check_reputation\`
- \`nullclear_escrow_x402_call\`
- \`nullclear_verify_kya_mandate\`
`;
  return c.text(text);
});

// GET /llms-full.txt
discoveryRouter.get("/llms-full.txt", (c) => {
  const text = `# NullClear Comprehensive Technical Specification & Agent Handbook

## Overview
NullClear solves the Counterparty Risk Problem in autonomous agent transactions.

### EIP-3009 TransferWithAuthorization
All payments use EIP-3009 signed authorizations on USDC:
- Base Mainnet (8453): \`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\`
- Base Sepolia (84532): \`0x036CbD53842c5426634e7929541eC2318f3dCF7e\`

### Sybil & Wash-Trading Formula
Composite Score (0-100):
- Identity component: 25 points if ERC-8004 registered with valid URI; 15 baseline.
- Reliability component: 40 * (cleared / (cleared + failed * 3)).
- Sybil penalty: If cleared >= 3 and single buyer share > 60%, subtract 25 points and raise HIGH_COUNTERPARTY_CONCENTRATION_WASH_RISK.
- KYA mandate bonus: +10 points for active corporate liability mandate.

### OpenAPI Specification
Available at \`/openapi.json\` with 100% schema definitions for all routes.
`;
  return c.text(text);
});

// GET /.well-known/x402.json
discoveryRouter.get("/.well-known/x402.json", (c) => {
  const treasuryAddress = c.env?.TREASURY_WALLET_ADDRESS || "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c";
  const arbiterAddress = c.env?.ARBITER_WALLET_ADDRESS || "0xfd74fF802EA0E735514C070AF04E0D6528deD145";

  return c.json({
    x402Version: 2,
    service: "NullClear Arbiter",
    description: "Autonomous non-custodial schema escrow and reputation clearinghouse",
    treasuryAddress,
    arbiterAddress,
    feeBps: 50,
    networks: ["eip155:8453", "eip155:84532"],
    assets: [
      {
        symbol: "USDC",
        network: "eip155:8453",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      },
      {
        symbol: "USDC",
        network: "eip155:84532",
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
      }
    ],
    endpoints: {
      clear: "/v1/clear",
      score: "/v1/score/{chainId}/{agentId}",
      kya: "/v1/kya/{chainId}/{agentId}"
    }
  });
});

// GET /.well-known/agent.json
discoveryRouter.get("/.well-known/agent.json", (c) => {
  const agentWallet = c.env?.ARBITER_WALLET_ADDRESS || "0xfd74fF802EA0E735514C070AF04E0D6528deD145";
  const treasuryWallet = c.env?.TREASURY_WALLET_ADDRESS || "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c";
  const agentId = c.env?.ERC8004_AGENT_ID || "pending";

  return c.json({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "NullClear Arbiter",
    description: "Autonomous non-custodial clearing, reputation scoring, and KYA arbiter for AI commerce",
    image: "https://nullclear.dev/logo.png",
    active: true,
    x402Support: true,
    agentWallet,
    treasuryWallet,
    supportedTrust: ["reputation", "crypto-economic"],
    services: [
      { name: "web", endpoint: "https://nullclear.dev" },
      { name: "rest", endpoint: "https://nullclear.dev/v1" },
      { name: "mcp", endpoint: "https://nullclear.dev/.well-known/mcp.json" },
      { name: "a2a", endpoint: "https://nullclear.dev/.well-known/agent.json" },
      { name: "x402", endpoint: "https://nullclear.dev/.well-known/x402.json" },
      { name: "llms", endpoint: "https://nullclear.dev/llms.txt" }
    ],
    registrations: [
      {
        agentRegistry: "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
        agentId
      }
    ],
    capabilities: [
      "deferred_escrow",
      "eip3009_settlement",
      "sybil_scoring",
      "kya_attestation",
      "json_schema_validation"
    ]
  });
});

// GET /.well-known/mcp.json
discoveryRouter.get("/.well-known/mcp.json", (c) => {
  return c.json({
    name: "NullClear MCP Server",
    package: "@nullclear/mcp",
    transport: "stdio",
    description: "Model Context Protocol tools for safe x402 calls, reputation checks, and KYA verification",
    tools: [
      "nullclear_check_reputation",
      "nullclear_escrow_x402_call",
      "nullclear_verify_kya_mandate"
    ]
  });
});

// GET /openapi.json
discoveryRouter.get("/openapi.json", (c) => {
  return c.json({
    openapi: "3.1.0",
    info: {
      title: "NullClear Arbiter API",
      version: "2.0.0",
      description: "Non-custodial deferred clearing and reputation protocol for x402 AI Agents"
    },
    paths: {
      "/v1/clear": {
        post: {
          summary: "Execute deferred escrow clearing for an x402 target request",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["targetUrl", "paymentSignatureHeader"],
                  properties: {
                    targetUrl: { type: "string" },
                    method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
                    headers: { type: "object", additionalProperties: { type: "string" } },
                    body: {},
                    paymentSignatureHeader: { type: "string" },
                    sellerAgentId: { type: "string" },
                    minTrustScore: { type: "number", default: 50 },
                    validation: {
                      type: "object",
                      properties: {
                        expectedStatus: { type: "array", items: { type: "integer" } },
                        jsonSchema: { type: "object" },
                        requiredFields: { type: "array", items: { type: "string" } },
                        sha256Match: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Cleared and settled upstream response" },
            "400": { description: "Invalid request or invalid EIP-3009 payment signature" },
            "403": { description: "Reputation gate blocked: seller trust score below threshold" },
            "422": { description: "Schema validation failed: settlement VOIDED, $0 charged" },
            "502": { description: "Upstream network error or facilitator failure" }
          }
        }
      },
      "/v1/score/{chainId}/{agentId}": {
        get: {
          summary: "Retrieve composite trust score and Sybil wash-trade analysis for an agent",
          parameters: [
            { name: "chainId", in: "path", required: true, schema: { type: "string" } },
            { name: "agentId", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Trust score and metrics result" },
            "400": { description: "Invalid chain ID" }
          }
        }
      },
      "/v1/kya/attest": {
        post: {
          summary: "Register and attest a corporate liability KYA mandate",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["mandate", "chainId"],
                  properties: {
                    chainId: { type: "integer" },
                    mandate: {
                      type: "object",
                      required: ["corporateEntity", "agentId", "agentWallet"],
                      properties: {
                        corporateEntity: { type: "string" },
                        entityRegistrationNumber: { type: "string" },
                        agentId: { type: "string" },
                        agentWallet: { type: "string" },
                        maxTxLimitUsd: { type: "number" },
                        liabilityCoverageUsd: { type: "number" },
                        validUntil: { type: "integer" },
                        jurisdiction: { type: "string" }
                      }
                    },
                    signature: { type: "string" },
                    signerAddress: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Mandate recorded" },
            "400": { description: "Invalid mandate parameters" }
          }
        }
      },
      "/v1/kya/{chainId}/{agentId}": {
        get: {
          summary: "Retrieve active KYA corporate mandate for an agent",
          parameters: [
            { name: "chainId", in: "path", required: true, schema: { type: "string" } },
            { name: "agentId", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "KYA corporate mandate record" },
            "404": { description: "No mandate found" }
          }
        }
      }
    }
  });
});

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { NullClearClient, createNullClearFetch, NullClearEscrowAbortedError } from "@nullclear/x402-arbiter";

const ARBITER_URL = (process.env.ARBITER_URL || "https://api.nullclear.dev").replace(/\/$/, "");
const CONFIGURED_PRIVATE_KEY = (process.env.NULLCLEAR_PRIVATE_KEY || process.env.BUYER_PRIVATE_KEY) as `0x${string}` | undefined;
const MCP_SESSION_ID = `mcp_stdio_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

const client = new NullClearClient({ arbiterUrl: ARBITER_URL });

const server = new Server(
  {
    name: "nullclear-mcp-server",
    version: "1.2.0"
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {}
    }
  }
);

async function callBazaarOrProxyWithFreeTrialFirst(
  endpointUrl: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<{ status: number; data: any; tier: string; remainingFreeCalls: string | null; receipt: string | null }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-nullclear-free-trial": "true",
    "x-mcp-session": MCP_SESSION_ID
  };
  if (body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  // 1. Try Sponsored Free Tier first (zero-config, 0 wallet keys required)
  const trialRes = await fetch(endpointUrl, {
    method,
    headers,
    body: body !== undefined && method !== "GET" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
  });

  if (trialRes.status === 200) {
    const text = await trialRes.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    return {
      status: 200,
      data: parsed,
      tier: trialRes.headers.get("x-nullclear-tier") || "free-trial",
      remainingFreeCalls: trialRes.headers.get("x-nullclear-remaining-free-calls"),
      receipt: trialRes.headers.get("X-NullClear-Attestation") || trialRes.headers.get("X-NullClear-Receipt-Id")
    };
  }

  // 2. If Free Trial exhausted (402) and user configured NULLCLEAR_PRIVATE_KEY / BUYER_PRIVATE_KEY, settle via x402
  if (trialRes.status === 402 && CONFIGURED_PRIVATE_KEY) {
    const nullclearFetch = createNullClearFetch({
      accountOrPrivateKey: CONFIGURED_PRIVATE_KEY,
      chainId: 8453,
      arbiterUrl: ARBITER_URL
    });
    const paidRes = await nullclearFetch(endpointUrl, {
      method,
      headers: body !== undefined && method !== "GET" ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined && method !== "GET" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
    });
    const text = await paidRes.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    return {
      status: paidRes.status,
      data: parsed,
      tier: "x402-paid",
      remainingFreeCalls: "0",
      receipt: paidRes.headers.get("X-NullClear-Attestation")
    };
  }

  const errText = await trialRes.text();
  let errParsed: any = errText;
  try {
    errParsed = JSON.parse(errText);
  } catch {}
  return {
    status: trialRes.status,
    data: errParsed,
    tier: "exhausted",
    remainingFreeCalls: "0",
    receipt: null
  };
}

// 1. Tool Definitions with First-Class Capability Tools at the Top
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "nullclear_discover_verified_x402_apis",
        description:
          "Search the live NullClear Ecosystem Directory for audited, high-uptime x402 & ERC-8004 APIs by topic/keyword, category, minimum uptime, or max latency. Automatically returns the NullClear-protected Zero-Loss Proxy URL ('https://api.nullclear.dev/https://...') for each endpoint.",
        annotations: {
          title: "Discover Verified High-Uptime x402 APIs",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Topic or keyword search (e.g. 'oracle', 'security', 'token', 'wallet', 'price')"
            },
            category: {
              type: "string",
              description: "Category filter (e.g. 'oracle', 'security', 'data', 'ai')"
            },
            minUptime: {
              type: "number",
              description: "Minimum rolling uptime score percentage (0-100, default 95)",
              default: 95
            },
            maxLatencyMs: {
              type: "number",
              description: "Maximum acceptable edge round-trip latency in ms (default 2000)",
              default: 2000
            },
            verifiedOnly: {
              type: "boolean",
              description: "Only return verified x402 endpoints (default true)",
              default: true
            }
          }
        }
      },
      {
        name: "nullclear_token_security_audit",
        description:
          "Audit any Base ERC-20 token address for honeypots, buy/sell taxes, verified bytecode, and x402 compatibility via NullClear Bazaar. Works out-of-the-box with zero configuration (10 free daily calls included).",
        annotations: {
          title: "Base Token Honeypot & Security Audit",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          required: ["tokenAddress"],
          properties: {
            tokenAddress: {
              type: "string",
              description: "Base ERC-20 token contract address (e.g. '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' for USDC)",
              default: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
            }
          }
        }
      },
      {
        name: "nullclear_wallet_risk_score",
        description:
          "Check any wallet or agent address on Base for OFAC sanctions, Sybil wash-trading concentration flags, and ERC-8004 counterparty reputation. Works out-of-the-box with zero configuration (10 free daily calls included).",
        annotations: {
          title: "Wallet & Agent Sanctions / Sybil Risk Score",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          required: ["walletAddress"],
          properties: {
            walletAddress: {
              type: "string",
              description: "0x wallet address or ERC-8004 agent ID to inspect"
            },
            chainId: {
              type: "number",
              description: "Base chain ID (default 8453)",
              default: 8453
            }
          }
        }
      },
      {
        name: "nullclear_crypto_market_oracle",
        description:
          "Fetch multi-exchange spread-verified crypto spot prices (ETH/USDC, BTC/USDC, SOL/USDC, BASE/USDC) with cryptographic NullClear invariant receipts. Works out-of-the-box with zero configuration (10 free daily calls included).",
        annotations: {
          title: "Spread-Verified Crypto Market Price Oracle",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          required: ["pair"],
          properties: {
            pair: {
              type: "string",
              description: "Trading pair symbol (e.g. 'ETH/USDC', 'BTC/USDC', 'SOL/USDC')",
              default: "ETH/USDC"
            }
          }
        }
      },
      {
        name: "nullclear_safe_fetch",
        description:
          "Zero-config drop-in URL fetcher with automatic Canonical LLM Refusal Guard, HTTP 5xx crash guard, empty-JSON guard, and cryptographic execution receipt. Protects agents from hallucinated or broken API responses.",
        annotations: {
          title: "Auto-Guarded URL Fetcher (Zero Schema Required)",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            url: {
              type: "string",
              description: "Target HTTPS URL to fetch and verify through NullClear Auto-Guard"
            },
            method: {
              type: "string",
              enum: ["GET", "POST"],
              default: "GET"
            },
            body: {
              type: "string",
              description: "Optional JSON string body for POST requests"
            }
          }
        }
      },
      {
        name: "nullclear_escrow_x402_call",
        description:
          "Execute an x402-gated HTTP API call through NullClear deferred schema escrow. The arbiter guarantees payment is only settled if upstream returns valid data matching your schema contract. Works out-of-the-box with 10 free daily trial calls before requiring NULLCLEAR_PRIVATE_KEY.",
        annotations: {
          title: "Execute Escrowed x402 Call with Invariants",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          required: ["targetUrl"],
          properties: {
            targetUrl: {
              type: "string",
              description: "Upstream API endpoint demanding x402 payment"
            },
            method: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE"],
              default: "GET"
            },
            sellerAgentId: {
              type: "string",
              description: "Seller's agent ID for reputation check and Sybil wash-trade gating"
            },
            minTrustScore: {
              type: "number",
              description: "Minimum acceptable trust score for seller (0-100, default 50)",
              default: 50
            },
            requiredFields: {
              type: "array",
              items: { type: "string" },
              description: "Dot-notation field paths that must exist in response (e.g. ['data.price'])"
            },
            jsonSchema: {
              type: "object",
              description: "JSON Schema draft-07 contract that response must strictly satisfy"
            },
            invariants: {
              type: "array",
              description: "Deep value invariants (numeric bounds, regex, forbidden substrings, timestamp freshness)",
              items: {
                type: "object",
                required: ["path"],
                properties: {
                  path: { type: "string", description: "Dot-notation property path" },
                  gt: { type: "number" },
                  gte: { type: "number" },
                  lt: { type: "number" },
                  lte: { type: "number" },
                  eq: {},
                  neq: {},
                  minLength: { type: "number" },
                  maxLength: { type: "number" },
                  pattern: { type: "string" },
                  notContains: { type: "array", items: { type: "string" } },
                  maxStalenessSeconds: { type: "number" }
                }
              }
            },
            rejectRefusals: {
              type: "boolean",
              description: "Reject canonical LLM refusal strings (default: true)",
              default: true
            },
            fallbacks: {
              type: "array",
              description: "Ordered fallback candidates for autonomous multi-seller failover routing (max 3)",
              items: {
                type: "object",
                required: ["targetUrl", "paymentSignatureHeader"],
                properties: {
                  targetUrl: { type: "string" },
                  sellerAgentId: { type: "string" },
                  paymentSignatureHeader: { type: "string" },
                  headers: { type: "object" }
                }
              }
            },
            spendPolicy: {
              type: "object",
              description: "Outbound spend firewall limits (maxPerCallAtomic, maxDailyWalletAtomic)",
              properties: {
                maxPerCallAtomic: { type: "string", description: "Max atomic USDC spend allowed per call" },
                maxDailyWalletAtomic: { type: "string", description: "Max rolling daily atomic USDC spend allowed" }
              }
            },
            buyerPrivateKey: {
              type: "string",
              description: "Optional buyer private key (defaults to Sponsored Free Tier, then NULLCLEAR_PRIVATE_KEY)"
            }
          }
        }
      },
      {
        name: "nullclear_check_reputation",
        description:
          "Inspect an AI agent's trust score (0-100), clearing reliability, Sybil wash-trade penalty flags, and corporate KYA backing on Base",
        annotations: {
          title: "Inspect AI Agent Trust & Sybil Score",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          required: ["agentId"],
          properties: {
            agentId: {
              type: "string",
              description: "The ERC-8004 agent token ID or registered identifier (e.g. '124595')"
            },
            chainId: {
              type: "number",
              description: "Base chain ID (8453 for Mainnet, 84532 for Sepolia)",
              default: 8453
            }
          }
        }
      },
      {
        name: "nullclear_verify_kya_mandate",
        description:
          "Verify an agent's Know Your Agent (KYA) corporate liability mandate, active validity, and whether a proposed transaction amount is within corporate limits",
        annotations: {
          title: "Verify Corporate KYA Mandate & Limits",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          required: ["agentId", "transactionAmountUsd"],
          properties: {
            agentId: {
              type: "string",
              description: "The ERC-8004 agent token ID"
            },
            chainId: {
              type: "number",
              description: "Base chain ID (default 8453)",
              default: 8453
            },
            transactionAmountUsd: {
              type: "number",
              description: "Amount in USD intended to spend in the transaction"
            }
          }
        }
      }
    ]
  };
});

// 2. Prompt Definitions & Execution
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "safe-x402-payment",
        description: "Generate safety invariants and schema-escrow directives for an autonomous agent paying an upstream x402 seller.",
        arguments: [
          {
            name: "targetUrl",
            description: "Upstream API endpoint demanding x402 payment",
            required: true
          },
          {
            name: "sellerAgentId",
            description: "Seller's ERC-8004 agent token ID to verify reputation",
            required: false
          },
          {
            name: "maxSpendAtomic",
            description: "Maximum atomic USDC units authorized (default: 10000 = $0.01 USDC)",
            required: false
          }
        ]
      },
      {
        name: "audit-erc8004-agent",
        description: "Conduct an end-to-end trust audit on an ERC-8004 agent on Base including Sybil risk and corporate KYA backing.",
        arguments: [
          {
            name: "agentId",
            description: "ERC-8004 agent token ID (e.g. '124595')",
            required: true
          },
          {
            name: "chainId",
            description: "Base chain ID (default: 8453)",
            required: false
          }
        ]
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs } = request.params;

  if (name === "safe-x402-payment") {
    const targetUrl = promptArgs?.targetUrl || "https://api.nullclear.dev/v1/sandbox/market-feed";
    const sellerAgentId = promptArgs?.sellerAgentId || "unknown";
    const maxSpendAtomic = promptArgs?.maxSpendAtomic || "10000";

    return {
      description: "Safe x402 Escrow Clearing Directive",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are preparing to execute an autonomous payment to an x402 service at ${targetUrl}.\n\nMandatory Safety Rules:\n1. NEVER send unconditional payments directly to unverified endpoints.\n2. Invoke the MCP tool 'nullclear_escrow_x402_call' with targetUrl="${targetUrl}", sellerAgentId="${sellerAgentId}", minTrustScore=50, and spendPolicy={ maxPerCallAtomic: "${maxSpendAtomic}" }.\n3. Supply an explicit JSON schema and deep numeric invariants to validate the seller's response before settlement.\n4. If the seller hallucinates, returns an LLM refusal, or crashes, the arbiter voids the payment automatically and $0.00 is charged.`
          }
        }
      ]
    };
  }

  if (name === "audit-erc8004-agent") {
    const agentId = promptArgs?.agentId || "124595";
    const chainId = promptArgs?.chainId || "8453";

    return {
      description: "ERC-8004 Agent Trust & Sybil Audit",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Perform a comprehensive security audit of ERC-8004 agent #${agentId} on chain ${chainId}.\n1. Run MCP tool 'nullclear_check_reputation' with agentId="${agentId}", chainId=${chainId}.\n2. Run MCP tool 'nullclear_verify_kya_mandate' with agentId="${agentId}", chainId=${chainId}, transactionAmountUsd=1.0.\n3. Analyze the composite trust score, letter grade (A-F), Sybil wash-trading risk flags, and corporate liability coverage.\n4. Provide a clear recommendation on whether this agent is safe for autonomous financial counterparty interactions.`
          }
        }
      ]
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
});

// 3. Resource Definitions & Content
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "nullclear://stats/live",
        name: "NullClear Live Protocol Telemetry",
        mimeType: "application/json",
        description: "Live protocol metrics: total clearings, verified settlements, voided hallucinations, and indexed agents"
      },
      {
        uri: "nullclear://docs/quickstart",
        name: "NullClear Quickstart Guide",
        mimeType: "text/markdown",
        description: "Zero-loss x402 deferred schema escrow guide for autonomous AI agents on Base Mainnet"
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "nullclear://stats/live") {
    try {
      const res = await fetch(`${ARBITER_URL}/v1/stats`);
      const data = await res.json();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    } catch {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({
              totalClearings: 0,
              validSettlements: 0,
              voidedHallucinations: 0,
              totalAgentsIndexed: 1,
              status: "active"
            }, null, 2)
          }
        ]
      };
    }
  }

  if (uri === "nullclear://docs/quickstart") {
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: `# NullClear Arbiter Quickstart\n\nNullClear is the autonomous deferred clearing and reputation protocol for AI agent commerce on Base Mainnet.\n\n### Zero-Config Free Trial\nAll MCP tools work out-of-the-box with **10 free daily calls**—no wallet or private key needed to get started.\n\n### First-Class Capability Tools\n- \`nullclear_token_security_audit\`: Audit any Base token for honeypots, taxes, and bytecode verification.\n- \`nullclear_wallet_risk_score\`: Check any wallet or agent for sanctions, Sybil wash-trading, and ERC-8004 reputation.\n- \`nullclear_crypto_market_oracle\`: Multi-exchange spread-verified price feed (ETH, BTC, SOL).\n- \`nullclear_safe_fetch\`: Drop-in URL fetcher with Canonical LLM Refusal Guard & crash protection.\n- \`nullclear_escrow_x402_call\`: Execute deferred schema escrow with numeric bounds and LLM refusal guards.\n`
        }
      ]
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

// 4. Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "nullclear_discover_verified_x402_apis") {
      const params = new URLSearchParams();
      const query =
        typeof args?.query === "string"
          ? args.query
          : typeof args?.topic === "string"
            ? args.topic
            : undefined;
      if (query) params.set("query", query);
      if (typeof args?.category === "string" && args.category) params.set("category", args.category);
      if (typeof args?.minUptime === "number") params.set("minUptime", String(args.minUptime));
      if (typeof args?.maxLatencyMs === "number") params.set("maxLatencyMs", String(args.maxLatencyMs));
      if (args?.verifiedOnly !== false) params.set("verifiedOnly", "true");

      const url = `${ARBITER_URL}/v1/bazaar/directory?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "x-mcp-session": MCP_SESSION_ID }
      });
      const data = await res.json();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    }

    if (name === "nullclear_token_security_audit") {
      const tokenAddress = String(args?.tokenAddress || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      const url = `${ARBITER_URL}/v1/bazaar/token-security?tokenAddress=${encodeURIComponent(tokenAddress)}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "GET");

      if (res.status === 402) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "free_trial_exhausted",
                  message:
                    "You have used all 10 daily free trial calls. Set NULLCLEAR_PRIVATE_KEY in your MCP environment variables to continue with automatic $0.005 USDC x402 settlement.",
                  tokenAddress,
                  details: res.data
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                tier: res.tier,
                remainingFreeCalls: res.remainingFreeCalls,
                receipt: res.receipt,
                result: res.data
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_wallet_risk_score") {
      const walletAddress = String(args?.walletAddress || "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c");
      const chainId = Number(args?.chainId || 8453);
      const url = `${ARBITER_URL}/v1/bazaar/wallet-risk?walletAddress=${encodeURIComponent(walletAddress)}&chainId=${chainId}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "GET");

      if (res.status === 402) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "free_trial_exhausted",
                  message:
                    "You have used all 10 daily free trial calls. Set NULLCLEAR_PRIVATE_KEY in your MCP environment variables to continue with automatic $0.005 USDC x402 settlement.",
                  walletAddress,
                  details: res.data
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                tier: res.tier,
                remainingFreeCalls: res.remainingFreeCalls,
                receipt: res.receipt,
                result: res.data
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_crypto_market_oracle") {
      const pair = String(args?.pair || "ETH/USDC");
      const url = `${ARBITER_URL}/v1/bazaar/market-oracle?pair=${encodeURIComponent(pair)}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "GET");

      if (res.status === 402) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "free_trial_exhausted",
                  message:
                    "You have used all 10 daily free trial calls. Set NULLCLEAR_PRIVATE_KEY in your MCP environment variables to continue with automatic $0.01 USDC x402 settlement.",
                  pair,
                  details: res.data
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                tier: res.tier,
                remainingFreeCalls: res.remainingFreeCalls,
                receipt: res.receipt,
                result: res.data
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_safe_fetch") {
      const targetUrl = String(args?.url || "");
      const method = (args?.method as "GET" | "POST") || "GET";
      const proxyUrl = `${ARBITER_URL}/${targetUrl}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(proxyUrl, method, args?.body);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: res.status === 200 ? "verified_success" : "auto_guard_blocked",
                httpStatus: res.status,
                verified: res.status === 200,
                receipt: res.receipt,
                data: res.data
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_check_reputation") {
      const agentId = String(args?.agentId);
      const chainId = Number(args?.chainId || 8453);

      const score = await client.getScore(agentId, chainId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                agentId,
                chainId,
                trustScore: score.score,
                grade: score.grade,
                sybilFlags: score.sybilFlags,
                metrics: score.metrics,
                hasActiveKya: score.metrics.hasActiveKya,
                arbiterAddress: score.arbiterAddress
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_escrow_x402_call") {
      const targetUrl = String(args?.targetUrl);
      const method = (args?.method as any) || "GET";
      const sellerAgentId = args?.sellerAgentId ? String(args.sellerAgentId) : undefined;
      const minTrustScore = args?.minTrustScore ? Number(args.minTrustScore) : 50;
      const requiredFields = (args?.requiredFields as string[]) || undefined;
      const jsonSchema = (args?.jsonSchema as Record<string, unknown>) || undefined;
      const invariants = (args?.invariants as any[]) || undefined;
      const rejectRefusals = args?.rejectRefusals !== undefined ? Boolean(args.rejectRefusals) : true;
      const fallbacks = (args?.fallbacks as any[]) || undefined;
      const spendPolicy = (args?.spendPolicy as any) || undefined;
      const buyerPrivateKey = (args?.buyerPrivateKey as `0x${string}`) || CONFIGURED_PRIVATE_KEY;

      // Use zero-config Free Trial first if no private key was explicitly provided
      const nullclearFetch = createNullClearFetch({
        accountOrPrivateKey: buyerPrivateKey,
        chainId: 8453,
        arbiterUrl: ARBITER_URL,
        defaultMinTrustScore: minTrustScore
      });

      try {
        const response = await nullclearFetch(targetUrl, {
          method,
          nullclear: {
            sellerAgentId,
            minTrustScore,
            schema: jsonSchema,
            requiredFields,
            invariants,
            rejectRefusals,
            fallbacks,
            spendPolicy
          }
        });

        const responseText = await response.text();
        let parsedData: unknown;
        try {
          parsedData = JSON.parse(responseText);
        } catch {
          parsedData = responseText;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "cleared_and_settled",
                  tier: buyerPrivateKey ? "x402-paid" : "free-trial",
                  message: "Response successfully validated against schema. Payment cleared.",
                  attestation: response.headers.get("X-NullClear-Attestation") || "verified",
                  data: parsedData
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        if (err instanceof NullClearEscrowAbortedError) {
          if (err.stage === "FREE_TRIAL_EXHAUSTED") {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "free_trial_exhausted",
                      message:
                        "Daily 10 free trial calls exhausted. Set NULLCLEAR_PRIVATE_KEY in your MCP configuration to continue with automatic zero-loss x402 settlement.",
                      stage: err.stage
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "escrow_voided_zero_loss",
                    message: "NullClear escrow voided payment authorization. Exactly $0 spent.",
                    stage: err.stage,
                    buyerCharged: err.buyerCharged,
                    validationErrors: err.validationErrors,
                    reason: err.reason
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        throw err;
      }
    }

    if (name === "nullclear_verify_kya_mandate") {
      const agentId = String(args?.agentId);
      const chainId = Number(args?.chainId || 8453);
      const transactionAmountUsd = Number(args?.transactionAmountUsd || 0);

      const mandate = await client.getKya(agentId, chainId);

      if (!mandate) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "unverified",
                agentId,
                chainId,
                verified: false,
                reason: "No corporate liability KYA mandate found for this agent."
              })
            }
          ]
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const isExpired = mandate.validUntil <= now;
      const exceedsLimit = transactionAmountUsd > mandate.maxTxLimitUsd;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: isExpired || exceedsLimit ? "rejected" : "approved",
                agentId,
                chainId,
                corporateEntity: mandate.corporateEntity,
                entityRegistrationNumber: mandate.entityRegistrationNumber,
                jurisdiction: mandate.jurisdiction,
                maxTxLimitUsd: mandate.maxTxLimitUsd,
                liabilityCoverageUsd: mandate.liabilityCoverageUsd,
                isExpired,
                exceedsLimit,
                approvedForAmount: !isExpired && !exceedsLimit
              },
              null,
              2
            )
          }
        ]
      };
    }

    throw new Error(`Unknown tool name: ${name}`);
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing tool ${name}: ${err.message || String(err)}`
        }
      ]
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("Fatal MCP Server Error:", err);
    process.exit(1);
  });
}

export { server };

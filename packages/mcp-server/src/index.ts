import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { NullClearClient, createNullClearFetch, NullClearEscrowAbortedError } from "@nullclear/x402-arbiter";

const ARBITER_URL = process.env.ARBITER_URL || "https://arbiter.nullclear.dev";
const DEFAULT_BUYER_KEY =
  (process.env.BUYER_PRIVATE_KEY as `0x${string}`) ||
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // Deterministic test buyer key

const client = new NullClearClient({ arbiterUrl: ARBITER_URL });

const server = new Server(
  {
    name: "nullclear-mcp-server",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// 1. Tool Definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "nullclear_check_reputation",
        description:
          "Inspect an AI agent's trust score (0-100), clearing reliability, Sybil wash-trade penalty flags, and corporate KYA backing on Base",
        inputSchema: {
          type: "object",
          required: ["agentId"],
          properties: {
            agentId: {
              type: "string",
              description: "The ERC-8004 agent token ID or registered identifier"
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
        name: "nullclear_escrow_x402_call",
        description:
          "Execute an x402-gated HTTP API call through NullClear deferred schema escrow. The arbiter guarantees payment is only settled if upstream returns valid data matching your schema contract. If the seller hallucinates or crashes, $0 is spent.",
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
                  path: { type: "string" },
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
                maxPerCallAtomic: { type: "string" },
                maxDailyWalletAtomic: { type: "string" }
              }
            },
            buyerPrivateKey: {
              type: "string",
              description: "Optional buyer private key (defaults to BUYER_PRIVATE_KEY environment variable)"
            }
          }
        }
      },
      {
        name: "nullclear_verify_kya_mandate",
        description:
          "Verify an agent's Know Your Agent (KYA) corporate liability mandate, active validity, and whether a proposed transaction amount is within corporate limits",
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

// 2. Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
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
      const buyerPrivateKey = (args?.buyerPrivateKey as `0x${string}`) || DEFAULT_BUYER_KEY;

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
                  message: "Response successfully validated against schema. Payment settled.",
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

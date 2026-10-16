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

const ARBITER_URL = process.env.ARBITER_URL || "https://api.nullclear.dev";
const SANDBOX_TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const DEFAULT_BUYER_KEY =
  (process.env.BUYER_PRIVATE_KEY as `0x${string}`) ||
  SANDBOX_TEST_KEY; // Zero-config deterministic sandbox test key

const client = new NullClearClient({ arbiterUrl: ARBITER_URL });

const server = new Server(
  {
    name: "nullclear-mcp-server",
    version: "1.1.2"
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {}
    }
  }
);

// 1. Tool Definitions with Smithery/Glama annotations
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
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
        name: "nullclear_escrow_x402_call",
        description:
          "Execute an x402-gated HTTP API call through NullClear deferred schema escrow. The arbiter guarantees payment is only settled if upstream returns valid data matching your schema contract. If the seller hallucinates or crashes, $0 is spent. Users can test immediately against https://api.nullclear.dev/v1/sandbox/market-feed (or fail over from https://api.nullclear.dev/v1/sandbox/hallucinating-seller to https://api.nullclear.dev/v1/sandbox/market-feed) with zero wallet setup.",
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
              description: "Optional buyer private key (defaults to BUYER_PRIVATE_KEY environment variable)"
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
          text: `# NullClear Arbiter Quickstart\n\nNullClear is the autonomous deferred clearing and reputation protocol for AI agent commerce on Base Mainnet.\n\n### Core Philosophy\nNever sign away funds unconditionally. Using EIP-3009 signed authorizations and deterministic JSON schema validation, NullClear holds seller payments in deferred escrow and only settles if output adheres 100% to your contract.\n\n### Primary MCP Tools\n- \`nullclear_escrow_x402_call\`: Execute deferred schema escrow with numeric bounds and LLM refusal guards.\n- \`nullclear_check_reputation\`: Check an ERC-8004 agent's Sybil trust score (0-100) and wash-trading flags.\n- \`nullclear_verify_kya_mandate\`: Verify an agent's corporate entity backing and spending limits.\n\n### Test Sandbox\n- Market Feed (Success): \`https://api.nullclear.dev/v1/sandbox/market-feed\` ($0.01 USDC)\n- Hallucinating Seller (Fails & Voids): \`https://api.nullclear.dev/v1/sandbox/hallucinating-seller\`\n`
        }
      ]
    };
  }

  throw new Error(`Resource not found: ${uri}`);
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

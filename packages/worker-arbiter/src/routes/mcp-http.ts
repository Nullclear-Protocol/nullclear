import { Hono } from "hono";
import type { Env } from "../env.js";
import { getArbiterStore } from "../env.js";
import { computeTrustScore } from "../services/reputation.js";

export const mcpHttpRouter = new Hono<Env>();

const MCP_TOOLS = [
  {
    name: "nullclear_check_reputation",
    description: "Inspect an AI agent's trust score (0-100), clearing reliability, Sybil wash-trade penalty flags, and corporate KYA backing on Base",
    inputSchema: {
      type: "object",
      required: ["agentId"],
      properties: {
        agentId: { type: "string", description: "The ERC-8004 agent token ID or registered identifier" },
        chainId: { type: "number", description: "Base chain ID (8453 for Mainnet, 84532 for Sepolia)", default: 8453 }
      }
    }
  },
  {
    name: "nullclear_escrow_x402_call",
    description: "Execute an x402-gated HTTP API call through NullClear deferred schema escrow. The arbiter guarantees payment is only settled if upstream returns valid data matching your schema contract. If the seller hallucinates or crashes, $0 is spent.",
    inputSchema: {
      type: "object",
      required: ["targetUrl"],
      properties: {
        targetUrl: { type: "string", description: "Upstream API endpoint demanding x402 payment" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
        sellerAgentId: { type: "string", description: "Seller's agent ID for reputation check and Sybil wash-trade gating" },
        minTrustScore: { type: "number", description: "Minimum acceptable trust score for seller (0-100, default 50)", default: 50 },
        requiredFields: { type: "array", items: { type: "string" }, description: "Field paths that must exist in response" },
        jsonSchema: { type: "object", description: "JSON Schema draft-07 contract that response must strictly satisfy" }
      }
    }
  },
  {
    name: "nullclear_verify_kya_mandate",
    description: "Verify an agent's Know Your Agent (KYA) corporate liability mandate, active validity, and whether a proposed transaction amount is within corporate limits",
    inputSchema: {
      type: "object",
      required: ["agentId", "transactionAmountUsd"],
      properties: {
        agentId: { type: "string", description: "The ERC-8004 agent token ID" },
        chainId: { type: "number", description: "Base chain ID (default 8453)", default: 8453 },
        transactionAmountUsd: { type: "number", description: "Amount in USD intended to spend in the transaction" }
      }
    }
  }
];

// GET /mcp - Health & Discovery Information
mcpHttpRouter.get("/", (c) => {
  return c.json({
    status: "active",
    name: "nullclear-mcp",
    version: "1.0.0",
    protocolVersion: "2024-11-05",
    description: "NullClear Model Context Protocol Remote Server",
    endpoint: "https://nullclear.dev/mcp",
    transport: "http-post",
    tools: MCP_TOOLS
  });
});

// POST /mcp - Standard MCP JSON-RPC 2.0 Handler
mcpHttpRouter.post("/", async (c) => {
  const store = getArbiterStore(c.env);
  let rpcRequest: any;

  try {
    rpcRequest = await c.req.json();
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const { id = 1, method, params } = rpcRequest;

  // 1. tools/list
  if (method === "tools/list") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: MCP_TOOLS
      }
    });
  }

  // 2. tools/call
  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      if (toolName === "nullclear_check_reputation") {
        const agentId = String(args.agentId || "124595");
        const chainId = Number(args.chainId || 8453);
        const scoreResult = await computeTrustScore(agentId, chainId, store, {
          arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
          rpcUrl: chainId === 8453 ? (c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL) : c.env.BASE_SEPOLIA_RPC_URL
        });

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "success",
                    agentId,
                    chainId,
                    trustScore: scoreResult.score,
                    grade: scoreResult.grade,
                    sybilFlags: scoreResult.sybilFlags,
                    metrics: scoreResult.metrics,
                    arbiterAddress: scoreResult.arbiterAddress
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
      }

      if (toolName === "nullclear_verify_kya_mandate") {
        const agentId = String(args.agentId || "");
        const chainId = Number(args.chainId || 8453);
        const transactionAmountUsd = Number(args.transactionAmountUsd || 0);

        const mandate = await store.getKyaMandate(agentId, chainId);
        if (!mandate) {
          return c.json({
            jsonrpc: "2.0",
            id,
            result: {
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
            }
          });
        }

        const now = Math.floor(Date.now() / 1000);
        const isExpired = mandate.validUntil <= now;
        const exceedsLimit = transactionAmountUsd > mandate.maxTxLimitUsd;

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
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
          }
        });
      }

      if (toolName === "nullclear_escrow_x402_call") {
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "ready_for_escrow",
                  instruction: "To execute an escrowed x402 call with your wallet signature, send an HTTP POST to https://nullclear.dev/v1/clear or use the @nullclear/x402-arbiter SDK createNullClearFetch() wrapper.",
                  targetUrl: args.targetUrl,
                  endpoint: "https://nullclear.dev/v1/clear"
                })
              }
            ]
          }
        });
      }

      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Tool not found: ${toolName}` }
      });
    } catch (err: any) {
      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: err.message || "Tool execution failed" }
      });
    }
  }

  // 3. initialize
  if (method === "initialize") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "nullclear-mcp",
          version: "1.0.0"
        }
      }
    });
  }

  return c.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not supported: ${method}` }
  });
});

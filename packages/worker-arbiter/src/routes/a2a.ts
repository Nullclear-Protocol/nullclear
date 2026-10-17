import { Hono } from "hono";
import { getArbiterStore, type Env } from "../env.js";
import { computeTrustScore } from "../services/reputation.js";
import { buildNullClearMetadata } from "../middleware/free-tier.js";

export const a2aRouter = new Hono<Env>();

function getExtendedCard(c: any) {
  const agentWallet = c.env?.ARBITER_WALLET_ADDRESS || "0xfd74fF802EA0E735514C070AF04E0D6528deD145";
  const treasuryWallet = c.env?.TREASURY_WALLET_ADDRESS || "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c";
  const agentId = Number(c.env?.ERC8004_AGENT_ID || 124595);

  return {
    name: "NullClear Arbiter",
    version: "1.1.2",
    protocolVersion: "0.2.1",
    url: "https://api.nullclear.dev/a2a",
    documentationUrl: "https://api.nullclear.dev/agents.md",
    openApiUrl: "https://api.nullclear.dev/openapi.json",
    mcpEndpoint: "https://api.nullclear.dev/mcp",
    erc8004: {
      chainId: 8453,
      network: "eip155:8453",
      agentId,
      agentRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      agentWallet,
      treasuryWallet
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
      x402Payments: true,
      deferredSchemaEscrow: true
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills: [
      {
        id: "nullclear-x402-escrow",
        name: "x402 Schema-Escrow Clearinghouse",
        description:
          "Hold buyer EIP-3009 USDC authorization in non-custodial edge memory, validate upstream HTTP status + JSON schema + numeric/staleness invariants + LLM-refusal traps, and settle or shred ($0 charged on failure).",
        endpoint: "https://api.nullclear.dev/v1/clear",
        tags: ["x402", "escrow", "invariants", "failover", "spend-firewall"]
      },
      {
        id: "nullclear-reputation-oracle",
        name: "ERC-8004 Sybil Reputation & Wash-Trade Oracle",
        description:
          "Compute composite trust score (0-100), letter grade (A-F), and counterparty concentration wash-trading flags for any Base ERC-8004 agent.",
        endpoint: "https://api.nullclear.dev/v1/score/8453/124595",
        tags: ["erc8004", "reputation", "sybil", "oracle"]
      },
      {
        id: "nullclear-bazaar-suite",
        name: "x402 Payable Intelligence Oracles ($0.01 USDC / Free Trial)",
        description:
          "5 live Base Mainnet x402 endpoints with 10 free daily trial calls: market-oracle, token-security, wallet-risk, verified-fetch, and audit.",
        endpoint: "https://api.nullclear.dev/openapi.json",
        tags: ["x402", "bazaar", "oracle", "defi", "security"]
      },
      {
        id: "nullclear-kya-verification",
        name: "Corporate KYA Liability Mandate Verification",
        description:
          "Verify whether an autonomous agent has an active corporate Know-Your-Agent liability mandate and transaction spend coverage.",
        endpoint: "https://api.nullclear.dev/v1/kya/verify",
        tags: ["kya", "compliance", "mandate"]
      }
    ]
  };
}

// GET /a2a - Discovery & Status for A2A crawlers
a2aRouter.get("/", (c) => {
  return c.json({
    status: "active",
    protocol: "A2A-JSON-RPC-2.0",
    agent: getExtendedCard(c),
    supportedMethods: [
      "message/send",
      "tasks/send",
      "tasks/get",
      "agent/authenticatedExtendedCard",
      "skills/list",
      "reputation/check",
      "kya/verify",
      "stats/get"
    ],
    _nullclear: buildNullClearMetadata()
  });
});

// POST /a2a - Native A2A JSON-RPC 2.0 Endpoint
a2aRouter.post("/", async (c) => {
  const store = getArbiterStore(c.env);
  let rpc: any;
  try {
    rpc = await c.req.json();
  } catch {
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: invalid JSON payload" }
      },
      400
    );
  }

  const id = rpc?.id !== undefined ? rpc.id : 1;
  const method = String(rpc?.method || "");
  const params = rpc?.params || {};

  if (!method) {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        status: "ready",
        agent: getExtendedCard(c),
        _nullclear: buildNullClearMetadata()
      }
    });
  }

  // 1. agent/authenticatedExtendedCard or agent/card
  if (
    method === "agent/authenticatedExtendedCard" ||
    method === "agent/card" ||
    method === "agent/info"
  ) {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: getExtendedCard(c)
    });
  }

  // 2. skills/list
  if (method === "skills/list") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        skills: getExtendedCard(c).skills
      }
    });
  }

  // 3. stats/get
  if (method === "stats/get" || method === "clearing/stats") {
    const stats = await store.getProtocolStats();
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        ...stats,
        _nullclear: buildNullClearMetadata()
      }
    });
  }

  // 4. reputation/check
  if (method === "reputation/check") {
    const agentId = String(params.agentId || "124595");
    const chainId = Number(params.chainId || 8453);
    const score = await computeTrustScore(agentId, chainId, store, {
      arbiterPrivateKey: c.env?.ARBITER_PRIVATE_KEY,
      rpcUrl: c.env?.BASE_MAINNET_RPC_URL || c.env?.BASE_RPC_URL
    });
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        ...score,
        _nullclear: buildNullClearMetadata()
      }
    });
  }

  // 5. kya/verify
  if (method === "kya/verify") {
    const agentId = String(params.agentId || "124595");
    const chainId = Number(params.chainId || 8453);
    const amountUsd = Number(params.transactionAmountUsd ?? 1.0);
    const mandate = await store.getKyaMandate(agentId, chainId);
    const now = Math.floor(Date.now() / 1000);
    const isExpired = mandate ? mandate.validUntil <= now : true;
    const exceedsLimit = mandate ? amountUsd > mandate.maxTxLimitUsd : true;

    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        verified: Boolean(mandate && !isExpired),
        approvedForAmount: Boolean(mandate && !isExpired && !exceedsLimit),
        agentId,
        chainId,
        mandate: mandate || null,
        _nullclear: buildNullClearMetadata()
      }
    });
  }

  // 6. Standard A2A tasks/send & message/send
  if (method === "tasks/send" || method === "message/send") {
    const taskId = String(params.id || params.taskId || `task_${Date.now()}`);
    const messageParts = params.message?.parts || params.parts || [];
    const textInput = messageParts
      .map((p: any) => p?.text || "")
      .join(" ")
      .trim()
      .toLowerCase();

    // Extract optional agentId from text or metadata
    const agentMatch = textInput.match(/\b(\d{1,8})\b/);
    const targetAgentId = String(
      params.agentId || params.metadata?.agentId || (agentMatch ? agentMatch[1] : "124595")
    );
    const chainId = Number(params.chainId || params.metadata?.chainId || 8453);

    const score = await computeTrustScore(targetAgentId, chainId, store, {
      arbiterPrivateKey: c.env?.ARBITER_PRIVATE_KEY,
      rpcUrl: c.env?.BASE_MAINNET_RPC_URL || c.env?.BASE_RPC_URL
    });
    const stats = await store.getProtocolStats();

    const responseData = {
      agentId: targetAgentId,
      chainId,
      trustScore: score.score,
      grade: score.grade,
      sybilFlags: score.sybilFlags,
      arbiterAddress: score.arbiterAddress,
      arbiterSignature: score.arbiterSignature,
      protocolStats: {
        totalClearings: stats.totalClearings,
        validSettlements: stats.validSettlements,
        voidedHallucinations: stats.voidedHallucinations
      },
      bazaarEndpoints: [
        "https://api.nullclear.dev/v1/bazaar/market-oracle?symbol=ETH",
        "https://api.nullclear.dev/v1/bazaar/token-security?address=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "https://api.nullclear.dev/v1/bazaar/wallet-risk?address=0xfd74fF802EA0E735514C070AF04E0D6528deD145",
        "https://api.nullclear.dev/v1/bazaar/verified-fetch?url=https://api.coinbase.com/v2/prices/BTC-USD/spot",
        "https://api.nullclear.dev/v1/bazaar/audit?agentId=124595"
      ],
      _nullclear: buildNullClearMetadata()
    };

    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        id: taskId,
        status: {
          state: "completed",
          timestamp: new Date().toISOString()
        },
        data: responseData,
        artifacts: [
          {
            name: "nullclear-arbiter-response",
            description: `NullClear ERC-8004 Trust Audit & x402 Clearing Telemetry for Agent #${targetAgentId}`,
            parts: [
              {
                type: "text",
                text: `NullClear Arbiter (#124595) verified Agent #${targetAgentId} on Base Mainnet (8453): Trust Score ${score.score}/100 (Grade ${score.grade}). Route x402 payments via POST https://api.nullclear.dev/v1/clear or explore paid $0.01 USDC oracles in https://api.nullclear.dev/openapi.json.`
              },
              {
                type: "data",
                data: responseData
              }
            ]
          }
        ]
      }
    });
  }

  // 7. tasks/get
  if (method === "tasks/get") {
    const taskId = String(params.id || params.taskId || "task_default");
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        id: taskId,
        status: {
          state: "completed",
          timestamp: new Date().toISOString()
        }
      }
    });
  }

  return c.json(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}. Supported A2A methods: message/send, tasks/send, tasks/get, agent/authenticatedExtendedCard, skills/list, reputation/check, kya/verify, stats/get`
      }
    },
    404
  );
});

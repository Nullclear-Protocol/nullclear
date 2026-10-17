import { Hono } from "hono";
import { getChainConfig } from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";
import { computeTrustScore } from "../services/reputation.js";
import { buildNullClearMetadata } from "../middleware/free-tier.js";

export const scoreRouter = new Hono<Env>();

scoreRouter.get("/", async (c) => {
  const store = getArbiterStore(c.env);
  const result = await computeTrustScore("124595", 8453, store, {
    arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
    rpcUrl: c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL
  });

  return c.json({
    service: "NullClear Agent Reputation & Sybil Scoring Oracle",
    referenceAgent: "124595",
    chainId: 8453,
    data: result,
    _nullclear: buildNullClearMetadata()
  });
});

scoreRouter.get("/:chainId/:agentId", async (c) => {
  let chainIdParam = c.req.param("chainId");
  let agentId = c.req.param("agentId");

  if (!chainIdParam || chainIdParam === "{chainId}") {
    chainIdParam = "8453";
  }
  if (!agentId || agentId === "{agentId}") {
    agentId = "124595";
  }

  let chainId: number;
  try {
    const config = getChainConfig(chainIdParam);
    chainId = config.chainId;
  } catch {
    chainId = 8453;
  }

  const store = getArbiterStore(c.env);
  const result = await computeTrustScore(agentId, chainId, store, {
    arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
    rpcUrl: chainId === 8453 ? (c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL) : c.env.BASE_SEPOLIA_RPC_URL
  });

  return c.json({
    success: true,
    data: result,
    _nullclear: buildNullClearMetadata()
  });
});

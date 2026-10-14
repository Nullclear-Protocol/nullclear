import { Hono } from "hono";
import { getChainConfig } from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";
import { computeTrustScore } from "../services/reputation.js";

export const scoreRouter = new Hono<Env>();

scoreRouter.get("/:chainId/:agentId", async (c) => {
  const chainIdParam = c.req.param("chainId");
  const agentId = c.req.param("agentId");

  let chainId: number;
  try {
    const config = getChainConfig(chainIdParam);
    chainId = config.chainId;
  } catch (err: any) {
    return c.json({ error: `Unsupported chainId: ${chainIdParam}` }, 400);
  }

  const store = getArbiterStore(c.env);
  const result = await computeTrustScore(agentId, chainId, store, {
    arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
    rpcUrl: chainId === 8453 ? (c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL) : c.env.BASE_SEPOLIA_RPC_URL
  });

  return c.json({
    success: true,
    data: result
  });
});

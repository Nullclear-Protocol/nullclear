import { Hono } from "hono";
import { getChainConfig, type KYAMandate } from "@nullclear/shared";
import { getArbiterStore, type Env, type StoredKyaRecord } from "../env.js";

export const kyaRouter = new Hono<Env>();

export interface AttestKyaRequestBody {
  mandate: KYAMandate;
  chainId: number;
  signature?: string;
  signerAddress?: `0x${string}`;
}

kyaRouter.post("/attest", async (c) => {
  let body: AttestKyaRequestBody;
  try {
    body = await c.req.json<AttestKyaRequestBody>();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const { mandate, chainId, signature, signerAddress } = body;
  if (!mandate || !mandate.agentId || !mandate.corporateEntity || !mandate.agentWallet) {
    return c.json({ error: "Missing required mandate fields (agentId, corporateEntity, agentWallet)" }, 400);
  }

  try {
    getChainConfig(chainId);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }

  const store = getArbiterStore(c.env);
  const id = `kya_${mandate.agentId}_${chainId}_${Date.now()}`;
  const record: StoredKyaRecord = {
    id,
    chainId,
    corporateEntity: mandate.corporateEntity,
    entityRegistrationNumber: mandate.entityRegistrationNumber || "UNSPECIFIED",
    agentId: mandate.agentId,
    agentWallet: mandate.agentWallet,
    maxTxLimitUsd: Number(mandate.maxTxLimitUsd || 1000),
    liabilityCoverageUsd: Number(mandate.liabilityCoverageUsd || 10000),
    validUntil: Number(mandate.validUntil || Math.floor(Date.now() / 1000) + 365 * 86400),
    jurisdiction: mandate.jurisdiction || "GLOBAL",
    signature: signature || "0x0",
    signerAddress: signerAddress || mandate.agentWallet,
    createdAt: Date.now()
  };

  await store.saveKyaMandate(record);

  return c.json({
    success: true,
    message: "KYA Corporate Mandate recorded successfully",
    data: record
  });
});

kyaRouter.get("/:chainId/:agentId", async (c) => {
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
  const record = await store.getKyaMandate(agentId, chainId);

  if (!record) {
    return c.json(
      {
        success: false,
        error: `No KYA mandate registered for agent ${agentId} on chain ${chainId}`
      },
      404
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const isExpired = record.validUntil <= now;

  return c.json({
    success: true,
    active: !isExpired,
    data: record
  });
});

kyaRouter.post("/verify", async (c) => {
  let body: { agentId?: string; chainId?: number | string; transactionAmountUsd?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const agentId = String(body.agentId || "");
  if (!agentId) {
    return c.json({ error: "Missing required agentId parameter" }, 400);
  }

  let chainId = 8453;
  if (body.chainId !== undefined) {
    try {
      chainId = getChainConfig(body.chainId).chainId;
    } catch (err: any) {
      return c.json({ error: `Unsupported chainId: ${body.chainId}` }, 400);
    }
  }

  const transactionAmountUsd = Number(body.transactionAmountUsd || 0);
  const store = getArbiterStore(c.env);
  const record = await store.getKyaMandate(agentId, chainId);

  if (!record) {
    return c.json({
      verified: false,
      agentId,
      chainId,
      reason: `No corporate liability KYA mandate found for agent ${agentId} on chain ${chainId}`
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const isExpired = record.validUntil <= now;
  const exceedsLimit = transactionAmountUsd > record.maxTxLimitUsd;

  return c.json({
    verified: !isExpired && !exceedsLimit,
    agentId,
    chainId,
    corporateEntity: record.corporateEntity,
    entityRegistrationNumber: record.entityRegistrationNumber,
    jurisdiction: record.jurisdiction,
    maxTxLimitUsd: record.maxTxLimitUsd,
    liabilityCoverageUsd: record.liabilityCoverageUsd,
    isExpired,
    exceedsLimit,
    approvedForAmount: !isExpired && !exceedsLimit
  });
});


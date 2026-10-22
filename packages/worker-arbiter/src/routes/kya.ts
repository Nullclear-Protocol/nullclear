import { Hono } from "hono";
import { getChainConfig, type KYAMandate } from "@nullclear/shared";
import { getArbiterStore, type Env, type StoredKyaRecord } from "../env.js";
import {
  getVerifiedKyaHeaderForBuyer,
  verifyKyaHeaderAttestation
} from "../services/kya-verifier.js";

export { getVerifiedKyaHeaderForBuyer, verifyKyaHeaderAttestation };

export const kyaRouter = new Hono<Env>();

export interface AttestKyaRequestBody {
  mandate?: Partial<KYAMandate> & {
    agentAddress?: `0x${string}`;
    buyerAddress?: `0x${string}`;
    maxPerCallAtomic?: string;
  };
  chainId?: number | string;
  signature?: string;
  signerAddress?: `0x${string}`;
  // Also support top-level fields for ergonomic B2B mandate registration
  corporateEntity?: string;
  entityRegistrationNumber?: string;
  agentId?: string;
  agentWallet?: `0x${string}`;
  agentAddress?: `0x${string}`;
  buyerAddress?: `0x${string}`;
  maxTxLimitUsd?: number;
  maxPerCallAtomic?: string;
  liabilityCoverageUsd?: number;
  validUntil?: number;
  jurisdiction?: string;
}

kyaRouter.post("/attest", async (c) => {
  let body: AttestKyaRequestBody;
  try {
    body = await c.req.json<AttestKyaRequestBody>();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const m: any = body.mandate || body;
  const corporateEntity = m.corporateEntity || body.corporateEntity;
  const agentWallet = (m.agentWallet ||
    m.agentAddress ||
    m.buyerAddress ||
    body.agentWallet ||
    body.agentAddress ||
    body.buyerAddress) as `0x${string}` | undefined;
  const agentId = String(m.agentId || body.agentId || agentWallet || "");

  if (!corporateEntity || !agentWallet || !agentId) {
    return c.json(
      { error: "Missing required mandate fields (agentId, corporateEntity, agentWallet)" },
      400
    );
  }

  const rawChainId = body.chainId ?? m.chainId ?? 8453;
  let chainId = 8453;
  try {
    chainId = getChainConfig(rawChainId).chainId;
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }

  const maxPerCallAtomic =
    m.maxPerCallAtomic !== undefined
      ? String(m.maxPerCallAtomic)
      : body.maxPerCallAtomic !== undefined
        ? String(body.maxPerCallAtomic)
        : undefined;

  const maxTxLimitUsd =
    m.maxTxLimitUsd !== undefined
      ? Number(m.maxTxLimitUsd)
      : maxPerCallAtomic
        ? Number(maxPerCallAtomic) / 1_000_000
        : 1000;

  const store = getArbiterStore(c.env);
  const id = m.mandateId || m.id || `kya_${agentId}_${chainId}_${Date.now()}`;
  const record: StoredKyaRecord = {
    id,
    chainId,
    corporateEntity,
    entityRegistrationNumber: m.entityRegistrationNumber || body.entityRegistrationNumber || "UNSPECIFIED",
    agentId,
    agentWallet,
    maxTxLimitUsd,
    maxPerCallAtomic,
    liabilityCoverageUsd: Number(m.liabilityCoverageUsd ?? body.liabilityCoverageUsd ?? 10000),
    validUntil: Number(m.validUntil ?? body.validUntil ?? Math.floor(Date.now() / 1000) + 365 * 86400),
    jurisdiction: m.jurisdiction || body.jurisdiction || "GLOBAL",
    signature: body.signature || m.signature || "0x0",
    signerAddress: body.signerAddress || m.signerAddress || agentWallet,
    createdAt: Date.now()
  };

  await store.saveKyaMandate(record);

  return c.json({
    success: true,
    message: "KYA Corporate Mandate recorded successfully",
    data: record
  });
});

kyaRouter.get("/", (c) => {
  return c.json({
    service: "NullClear Know Your Agent (KYA) Verification & Mandate Registry",
    documentation: "https://api.nullclear.dev/openapi.json",
    endpoints: {
      attest: "POST /v1/kya/attest",
      verify: "POST /v1/kya/verify",
      verifyHeader: "POST /v1/kya/verify-header",
      getMandate: "GET /v1/kya/{chainId}/{agentId}"
    }
  });
});

kyaRouter.get("/attest", (c) => {
  return c.json({
    service: "NullClear KYA Attestation Service",
    method: "POST",
    usage: "Submit POST /v1/kya/attest with corporate mandate and signature to register KYA liability backing",
    documentation: "https://api.nullclear.dev/openapi.json"
  });
});

kyaRouter.get("/verify", (c) => {
  return c.json({
    service: "NullClear KYA Verification Service",
    method: "POST",
    usage: "Submit POST /v1/kya/verify with agentId and transactionAmountUsd to check corporate liability backing",
    documentation: "https://api.nullclear.dev/openapi.json"
  });
});

/**
 * POST /v1/kya/verify-header
 * Allows any third-party B2B seller to verify an incoming X-NullClear-Verified-KYA
 * and X-NullClear-KYA-Signature header in a single call.
 */
kyaRouter.post("/verify-header", async (c) => {
  let body: Record<string, any> = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const kyaHeader =
    body["X-NullClear-Verified-KYA"] ||
    body["x-nullclear-verified-kya"] ||
    body.kyaHeader ||
    body.verifiedKya ||
    body.header ||
    body.payload ||
    c.req.header("X-NullClear-Verified-KYA") ||
    c.req.header("x-nullclear-verified-kya") ||
    "";

  const signature =
    body["X-NullClear-KYA-Signature"] ||
    body["x-nullclear-kya-signature"] ||
    body.kyaSignature ||
    body.signature ||
    c.req.header("X-NullClear-KYA-Signature") ||
    c.req.header("x-nullclear-kya-signature") ||
    "";

  if (!kyaHeader || !signature) {
    return c.json(
      {
        valid: false,
        verified: false,
        error: "Missing X-NullClear-Verified-KYA or X-NullClear-KYA-Signature"
      },
      400
    );
  }

  const verification = await verifyKyaHeaderAttestation(c.env, String(kyaHeader), String(signature));
  if (!verification.valid || !verification.payload) {
    return c.json(
      {
        valid: false,
        verified: false,
        error: verification.error || "Invalid KYA header signature"
      },
      401
    );
  }

  return c.json({
    valid: true,
    verified: true,
    payload: verification.payload,
    mandate: verification.payload,
    ...verification.payload
  });
});

kyaRouter.get("/:chainId/:agentId", async (c) => {
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
  let record = await store.getKyaMandate(agentId, chainId);
  if (!record) {
    record = await store.getKyaMandateByWallet(agentId);
  }

  if (!record) {
    return c.json({
      success: true,
      registered: false,
      agentId,
      chainId,
      message: `No active KYA mandate registered for agent ${agentId} on chain ${chainId}`
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const isExpired = record.validUntil <= now;

  return c.json({
    success: true,
    registered: true,
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
  let record = await store.getKyaMandate(agentId, chainId);
  if (!record) {
    record = await store.getKyaMandateByWallet(agentId);
  }

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

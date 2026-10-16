import { Hono } from "hono";
import { keccak256, stringToHex, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CreateSafePayDealRequestSchema,
  DeliverSafePayDealRequestSchema,
  EIP3009_TYPES,
  LockSafePayDealRequestSchema,
  SAFEPAY_TREASURY_ADDRESS,
  computeSafePayFeeBreakdown,
  getChainConfig,
  inferJsonSchemaFromSample,
  type DeliverSafePayDealRequest,
  type X402PaymentOption,
  type X402PaymentResponse,
  type X402PaymentSignaturePayload
} from "@nullclear/shared";
import { getArbiterStore, type Env, type SafePayDealRecord } from "../env.js";
import { verifyEIP3009Local, settleTransfer } from "../services/facilitator.js";
import { verifySafePayDeliverable } from "../services/safepay-verifier.js";
import { signSafePaySettlementReceipt, DEFAULT_ARBITER_KEY } from "../services/attestation.js";
import { computeTrustScore } from "../services/reputation.js";

export const safepayRouter = new Hono<Env>();

function generateDealId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let id = "sp_";
  for (let i = 0; i < bytes.length; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

function toBytes32Hex(hexStr: string): `0x${string}` {
  const clean = hexStr.replace(/^0x/, "").toLowerCase();
  if (clean.length === 64 && /^[0-9a-f]{64}$/.test(clean)) {
    return `0x${clean}`;
  }
  return keccak256(stringToHex(hexStr));
}

async function fetchBuyerUsdcBalanceAtomic(
  buyerAddress: string,
  chainId: 8453 | 84532,
  env?: Env["Bindings"]
): Promise<string | null> {
  if (buyerAddress.toLowerCase() === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266") {
    return "10000000000"; // $10,000 USDC deterministic sandbox test wallet
  }
  if (env?.ENVIRONMENT !== "production" && !env?.BASE_MAINNET_RPC_URL && !env?.BASE_RPC_URL) {
    return null;
  }
  try {
    const chainConfig = getChainConfig(chainId);
    const rpcUrl =
      chainId === 8453
        ? env?.BASE_MAINNET_RPC_URL || env?.BASE_RPC_URL || chainConfig.rpcUrl
        : env?.BASE_SEPOLIA_RPC_URL || chainConfig.rpcUrl;

    const paddedAddr = buyerAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [
          {
            to: chainConfig.usdc,
            data: `0x70a08231${paddedAddr}`
          },
          "latest"
        ]
      })
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data?.result && typeof data.result === "string" && data.result !== "0x") {
      return BigInt(data.result).toString();
    }
    return "0";
  } catch {
    return null;
  }
}

function sanitizeDealForPublicView(deal: SafePayDealRecord) {
  const {
    sellerSignaturePayload,
    feeSignaturePayload,
    encryptedDeliverable,
    ...publicFields
  } = deal;

  return {
    ...publicFields,
    treasuryAddress: SAFEPAY_TREASURY_ADDRESS,
    hasLockedSignatures: Boolean(sellerSignaturePayload && feeSignaturePayload),
    downloadAvailable: deal.status === "SETTLED" && Boolean(encryptedDeliverable),
    shareUrl: `https://nullclear.com/deal/${deal.id}`
  };
}

async function executeAtomicDualSettlement(
  deal: SafePayDealRecord,
  deliverableSha256: string,
  env?: Env["Bindings"]
): Promise<
  | {
      settled: true;
      sellerTxHash: `0x${string}`;
      feeTxHash: `0x${string}`;
      receipt: NonNullable<SafePayDealRecord["receipt"]>;
    }
  | {
      settled: false;
      error: string;
    }
> {
  if (!deal.sellerSignaturePayload || !deal.feeSignaturePayload || !deal.buyerAddress || !deal.sellerAddress) {
    return { settled: false, error: "Deal is missing locked dual EIP-3009 signatures or counterparty addresses" };
  }

  const chainConfig = getChainConfig(deal.chainId);
  const rpcUrl =
    deal.chainId === 8453
      ? env?.BASE_MAINNET_RPC_URL || env?.BASE_RPC_URL || chainConfig.rpcUrl
      : env?.BASE_SEPOLIA_RPC_URL || chainConfig.rpcUrl;
  const isSandboxBuyer = deal.buyerAddress.toLowerCase() === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
  const settlementMode = isSandboxBuyer ? "simulated" : env?.SETTLEMENT_MODE || "onchain";
  const environment = isSandboxBuyer ? "development" : env?.ENVIRONMENT || "development";

  const feeOption: X402PaymentOption = {
    scheme: "exact",
    network: chainConfig.caip2 as "eip155:8453" | "eip155:84532",
    amount: deal.protocolFeeAtomic,
    asset: chainConfig.usdc,
    payTo: SAFEPAY_TREASURY_ADDRESS,
    maxTimeoutSeconds: 3600,
    extra: { name: chainConfig.usdcDomain.name, version: chainConfig.usdcDomain.version }
  };

  const sellerOption: X402PaymentOption = {
    scheme: "exact",
    network: chainConfig.caip2 as "eip155:8453" | "eip155:84532",
    amount: deal.sellerNetAtomic,
    asset: chainConfig.usdc,
    payTo: deal.sellerAddress,
    maxTimeoutSeconds: 3600,
    extra: { name: chainConfig.usdcDomain.name, version: chainConfig.usdcDomain.version }
  };

  // 1. Settle Protocol Fee to 0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c
  const feeSettlement: X402PaymentResponse = await settleTransfer({
    authorization: deal.feeSignaturePayload.payload.authorization,
    signature: deal.feeSignaturePayload.payload.signature,
    accepted: feeOption,
    facilitatorUrl: env?.FACILITATOR_URL,
    settlementMode,
    arbiterPrivateKey: env?.ARBITER_PRIVATE_KEY,
    rpcUrl,
    environment
  });

  if (!feeSettlement.success || !feeSettlement.transaction) {
    return {
      settled: false,
      error: `Protocol fee settlement failed: ${feeSettlement.errorReason || "Unknown settlement error"}`
    };
  }

  // 2. Settle Seller Net Payout to sellerAddress
  const sellerSettlement: X402PaymentResponse = await settleTransfer({
    authorization: deal.sellerSignaturePayload.payload.authorization,
    signature: deal.sellerSignaturePayload.payload.signature,
    accepted: sellerOption,
    facilitatorUrl: env?.FACILITATOR_URL,
    settlementMode,
    arbiterPrivateKey: env?.ARBITER_PRIVATE_KEY,
    rpcUrl,
    environment
  });

  if (!sellerSettlement.success || !sellerSettlement.transaction) {
    return {
      settled: false,
      error: `Seller payout settlement failed: ${sellerSettlement.errorReason || "Unknown settlement error"}`
    };
  }

  const settledAt = Date.now();
  const specHash = keccak256(stringToHex(JSON.stringify(deal.verificationSpec)));

  const receipt = await signSafePaySettlementReceipt(
    {
      dealId: deal.id,
      buyer: deal.buyerAddress,
      seller: deal.sellerAddress,
      sellerNetAtomic: deal.sellerNetAtomic,
      protocolFeeAtomic: deal.protocolFeeAtomic,
      treasuryAddress: SAFEPAY_TREASURY_ADDRESS,
      deliverableSha256: toBytes32Hex(deliverableSha256),
      specHash,
      sellerTxHash: toBytes32Hex(sellerSettlement.transaction),
      feeTxHash: toBytes32Hex(feeSettlement.transaction),
      settledAt
    },
    env?.ARBITER_PRIVATE_KEY,
    deal.chainId
  );

  // Record both nonces & clearing in reputation ledger
  const store = getArbiterStore(env);
  await store.recordPassedClearing(
    deal.sellerAddress.toLowerCase(),
    deal.buyerAddress,
    deal.sellerNetAtomic,
    deal.protocolFeeAtomic,
    {
      id: `safepay_${deal.id}_seller`,
      network: chainConfig.caip2,
      buyerAddress: deal.buyerAddress,
      sellerAgentId: deal.sellerAddress.toLowerCase(),
      amount: deal.sellerNetAtomic,
      fee: deal.protocolFeeAtomic,
      targetUrl: `https://nullclear.com/deal/${deal.id}`,
      status: "PASSED",
      responseHash: toBytes32Hex(deliverableSha256),
      attestationSignature: receipt.signature,
      eip3009Nonce: deal.sellerSignaturePayload.payload.authorization.nonce,
      createdAt: settledAt
    }
  );

  await store.recordPassedClearing(
    env?.ERC8004_AGENT_ID || "124595",
    deal.buyerAddress,
    deal.protocolFeeAtomic,
    "0",
    {
      id: `safepay_${deal.id}_fee`,
      network: chainConfig.caip2,
      buyerAddress: deal.buyerAddress,
      sellerAgentId: env?.ERC8004_AGENT_ID || "124595",
      amount: deal.protocolFeeAtomic,
      fee: "0",
      targetUrl: `https://nullclear.com/deal/${deal.id}#fee`,
      status: "PASSED",
      responseHash: toBytes32Hex(deliverableSha256),
      attestationSignature: receipt.signature,
      eip3009Nonce: deal.feeSignaturePayload.payload.authorization.nonce,
      createdAt: settledAt
    }
  );

  return {
    settled: true,
    sellerTxHash: sellerSettlement.transaction,
    feeTxHash: feeSettlement.transaction,
    receipt
  };
}

// ============================================================================
// 0. POST /api/safepay/infer-schema — Auto-Infer JSON Schema from Sample
// ============================================================================
safepayRouter.post("/infer-schema", async (c) => {
  try {
    const body: any = await c.req.json();
    const rawSample = body?.sample;
    const parsed = typeof rawSample === "string" ? JSON.parse(rawSample) : rawSample;
    const inferred = inferJsonSchemaFromSample(parsed);
    return c.json({
      success: true,
      ...inferred
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: `Failed to infer JSON schema from sample: ${err.message}`
      },
      400
    );
  }
});

// ============================================================================
// 1. POST /api/safepay/deals — Create a New SafePay Escrow Deal
// ============================================================================
safepayRouter.post("/deals", async (c) => {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON request body" }, 400);
  }

  const parsed = CreateSafePayDealRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.issues
      },
      400
    );
  }

  const input = parsed.data;
  let feeBreakdown;
  try {
    feeBreakdown = computeSafePayFeeBreakdown(input.amountAtomic, input.feePayer);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: "INVALID_DEAL_AMOUNT",
        message: err.message
      },
      400
    );
  }

  const now = Date.now();
  const defaultExpiry = Math.floor(now / 1000) + 7 * 86400; // 7 days default
  const expiresAt = input.expiresAt && input.expiresAt > Math.floor(now / 1000) ? input.expiresAt : defaultExpiry;

  const dealId = generateDealId();
  const deal: SafePayDealRecord = {
    id: dealId,
    title: input.title,
    description: input.description || "",
    creatorRole: input.creatorRole,
    buyerAddress: input.buyerAddress as `0x${string}` | undefined,
    sellerAddress: input.sellerAddress as `0x${string}` | undefined,
    chainId: input.chainId,
    amountAtomic: feeBreakdown.amountAtomic,
    feePayer: feeBreakdown.feePayer,
    sellerNetAtomic: feeBreakdown.sellerNetAtomic,
    protocolFeeAtomic: feeBreakdown.protocolFeeAtomic,
    totalBuyerSignAtomic: feeBreakdown.totalBuyerSignAtomic,
    status: "CREATED",
    expiresAt,
    verificationMode: input.verificationMode,
    verificationSpec: input.verificationSpec,
    createdAt: now,
    updatedAt: now
  };

  const store = getArbiterStore(c.env);
  await store.saveSafePayDeal(deal);

  return c.json(
    {
      success: true,
      dealId,
      shareUrl: `https://nullclear.com/deal/${dealId}`,
      feeBreakdown,
      deal: sanitizeDealForPublicView(deal)
    },
    201
  );
});

// ============================================================================
// 2. GET /api/safepay/deals/:dealId — Fetch Deal Room State
// ============================================================================
safepayRouter.get("/deals/:dealId", async (c) => {
  const dealId = c.req.param("dealId");
  const store = getArbiterStore(c.env);
  const deal = await store.getSafePayDeal(dealId);

  if (!deal) {
    return c.json({ success: false, error: "DEAL_NOT_FOUND", message: `Deal ${dealId} not found` }, 404);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const isExpired = nowSec > deal.expiresAt && deal.status !== "SETTLED";

  // Check buyer live USDC balance on Base if buyerAddress is known
  let buyerUsdcBalanceAtomic: string | null = null;
  let buyerWalletFunded: boolean | null = null;
  if (deal.buyerAddress) {
    buyerUsdcBalanceAtomic = await fetchBuyerUsdcBalanceAtomic(deal.buyerAddress, deal.chainId, c.env);
    if (buyerUsdcBalanceAtomic !== null) {
      buyerWalletFunded = BigInt(buyerUsdcBalanceAtomic) >= BigInt(deal.totalBuyerSignAtomic);
    }
  }

  // Fetch NullClear counterparty reputation scores
  const [buyerReputation, sellerReputation] = await Promise.all([
    deal.buyerAddress
      ? computeTrustScore(deal.buyerAddress.toLowerCase(), deal.chainId, store, {
          arbiterPrivateKey: c.env?.ARBITER_PRIVATE_KEY
        })
      : Promise.resolve(null),
    deal.sellerAddress
      ? computeTrustScore(deal.sellerAddress.toLowerCase(), deal.chainId, store, {
          arbiterPrivateKey: c.env?.ARBITER_PRIVATE_KEY
        })
      : Promise.resolve(null)
  ]);

  const chainConfig = getChainConfig(deal.chainId);

  return c.json({
    success: true,
    deal: sanitizeDealForPublicView(deal),
    isExpired,
    network: {
      name: chainConfig.name,
      chainId: chainConfig.chainId,
      caip2: chainConfig.caip2,
      usdcAddress: chainConfig.usdc,
      usdcDomain: chainConfig.usdcDomain,
      blockExplorer: chainConfig.blockExplorer
    },
    walletHealth: {
      buyerAddress: deal.buyerAddress || null,
      buyerUsdcBalanceAtomic,
      requiredAtomic: deal.totalBuyerSignAtomic,
      buyerWalletFunded
    },
    reputation: {
      buyer: buyerReputation
        ? { score: buyerReputation.score, grade: buyerReputation.grade, sybilFlags: buyerReputation.sybilFlags }
        : null,
      seller: sellerReputation
        ? { score: sellerReputation.score, grade: sellerReputation.grade, sybilFlags: sellerReputation.sybilFlags }
        : null
    }
  });
});

// ============================================================================
// 3. POST /api/safepay/deals/:dealId/lock — Buyer Locks Deal via Dual EIP-3009
// ============================================================================
safepayRouter.post("/deals/:dealId/lock", async (c) => {
  const dealId = c.req.param("dealId");
  const store = getArbiterStore(c.env);
  const deal = await store.getSafePayDeal(dealId);

  if (!deal) {
    return c.json({ success: false, error: "DEAL_NOT_FOUND" }, 404);
  }

  if (deal.status === "SETTLED" || deal.status === "VOIDED_EXPIRED" || deal.status === "VOIDED_FAILED") {
    return c.json(
      {
        success: false,
        error: "INVALID_DEAL_STATE",
        message: `Cannot lock deal in status ${deal.status}`
      },
      400
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > deal.expiresAt) {
    return c.json({ success: false, error: "DEAL_EXPIRED", message: "Deal has already expired" }, 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const parsed = LockSafePayDealRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ success: false, error: "VALIDATION_ERROR", details: parsed.error.issues }, 400);
  }

  const { buyerAddress, sellerAddress: bodySellerAddress, sellerSignaturePayload, feeSignaturePayload } = parsed.data;
  const effectiveSellerAddress = (deal.sellerAddress || bodySellerAddress) as `0x${string}` | undefined;

  if (!effectiveSellerAddress) {
    return c.json(
      {
        success: false,
        error: "SELLER_ADDRESS_REQUIRED",
        message: "sellerAddress must be specified on the deal or in the lock request"
      },
      400
    );
  }

  if (buyerAddress.toLowerCase() === effectiveSellerAddress.toLowerCase()) {
    return c.json(
      {
        success: false,
        error: "SELF_ESCROW_PROHIBITED",
        message: "Buyer and Seller addresses must be distinct"
      },
      400
    );
  }

  const sellerAuth = sellerSignaturePayload?.payload?.authorization;
  const sellerSig = sellerSignaturePayload?.payload?.signature;
  const feeAuth = feeSignaturePayload?.payload?.authorization;
  const feeSig = feeSignaturePayload?.payload?.signature;

  if (!sellerAuth || !sellerSig || !feeAuth || !feeSig) {
    return c.json(
      {
        success: false,
        error: "MALFORMED_SIGNATURE_PAYLOAD",
        message: "Both sellerSignaturePayload and feeSignaturePayload must contain payload.authorization and payload.signature"
      },
      400
    );
  }

  if (
    sellerAuth.from.toLowerCase() !== buyerAddress.toLowerCase() ||
    feeAuth.from.toLowerCase() !== buyerAddress.toLowerCase()
  ) {
    return c.json(
      {
        success: false,
        error: "SIGNER_MISMATCH",
        message: "Both EIP-3009 authorizations must be from buyerAddress"
      },
      400
    );
  }

  if (sellerAuth.nonce.toLowerCase() === feeAuth.nonce.toLowerCase()) {
    return c.json(
      {
        success: false,
        error: "DUPLICATE_NONCE",
        message: "Seller payout authorization and Protocol fee authorization must use distinct EIP-3009 nonces"
      },
      400
    );
  }

  // Strictly enforce Treasury recipient on feeAuth
  if (feeAuth.to.toLowerCase() !== SAFEPAY_TREASURY_ADDRESS.toLowerCase()) {
    return c.json(
      {
        success: false,
        error: "INVALID_FEE_RECIPIENT",
        message: `Protocol fee authorization must pay ${SAFEPAY_TREASURY_ADDRESS}, got ${feeAuth.to}`
      },
      400
    );
  }

  // Strictly enforce Seller recipient on sellerAuth
  if (sellerAuth.to.toLowerCase() !== effectiveSellerAddress.toLowerCase()) {
    return c.json(
      {
        success: false,
        error: "INVALID_SELLER_RECIPIENT",
        message: `Seller authorization must pay ${effectiveSellerAddress}, got ${sellerAuth.to}`
      },
      400
    );
  }

  const chainConfig = getChainConfig(deal.chainId);

  // Check nonce replay protection
  const [sellerNonceUsed, feeNonceUsed] = await Promise.all([
    store.hasUsedNonce(chainConfig.caip2, buyerAddress, sellerAuth.nonce),
    store.hasUsedNonce(chainConfig.caip2, buyerAddress, feeAuth.nonce)
  ]);

  if (sellerNonceUsed || feeNonceUsed) {
    return c.json(
      {
        success: false,
        error: "PAYMENT_NONCE_ALREADY_USED",
        message: "One or more EIP-3009 nonces have already been consumed"
      },
      409
    );
  }

  // Verify sellerSignaturePayload cryptographically via viem verifyTypedData
  const sellerVerification = await verifyEIP3009Local(sellerAuth, sellerSig, {
    scheme: "exact",
    network: chainConfig.caip2 as "eip155:8453" | "eip155:84532",
    amount: deal.sellerNetAtomic,
    asset: chainConfig.usdc,
    payTo: effectiveSellerAddress,
    maxTimeoutSeconds: 3600
  });

  if (!sellerVerification.valid) {
    return c.json(
      {
        success: false,
        error: "INVALID_SELLER_SIGNATURE",
        message: sellerVerification.error || "Seller EIP-3009 signature verification failed"
      },
      400
    );
  }

  // Verify feeSignaturePayload cryptographically via viem verifyTypedData
  const feeVerification = await verifyEIP3009Local(feeAuth, feeSig, {
    scheme: "exact",
    network: chainConfig.caip2 as "eip155:8453" | "eip155:84532",
    amount: deal.protocolFeeAtomic,
    asset: chainConfig.usdc,
    payTo: SAFEPAY_TREASURY_ADDRESS,
    maxTimeoutSeconds: 3600
  });

  if (!feeVerification.valid) {
    return c.json(
      {
        success: false,
        error: "INVALID_FEE_SIGNATURE",
        message: feeVerification.error || "Protocol fee EIP-3009 signature verification failed"
      },
      400
    );
  }

  // Optional live on-chain USDC balance check in production
  const buyerBalanceAtomic = await fetchBuyerUsdcBalanceAtomic(buyerAddress, deal.chainId, c.env);
  if (buyerBalanceAtomic !== null && BigInt(buyerBalanceAtomic) < BigInt(deal.totalBuyerSignAtomic)) {
    return c.json(
      {
        success: false,
        error: "INSUFFICIENT_USDC_BALANCE",
        message: `Buyer wallet has ${buyerBalanceAtomic} atomic USDC, but deal requires ${deal.totalBuyerSignAtomic}`
      },
      400
    );
  }

  deal.buyerAddress = buyerAddress as `0x${string}`;
  deal.sellerAddress = effectiveSellerAddress;
  deal.sellerSignaturePayload = sellerSignaturePayload;
  deal.feeSignaturePayload = feeSignaturePayload;
  deal.status = "FUNDED_LOCKED";
  deal.updatedAt = Date.now();

  await store.saveSafePayDeal(deal);

  return c.json({
    success: true,
    status: deal.status,
    deal: sanitizeDealForPublicView(deal),
    lockVerification: {
      sellerAuthorizationVerified: true,
      feeAuthorizationVerified: true,
      sellerNetAtomic: deal.sellerNetAtomic,
      protocolFeeAtomic: deal.protocolFeeAtomic,
      treasuryAddress: SAFEPAY_TREASURY_ADDRESS
    }
  });
});

// ============================================================================
// 4. POST /api/safepay/deals/:dealId/deliver — Seller Deliverable & Settlement
// ============================================================================
safepayRouter.post("/deals/:dealId/deliver", async (c) => {
  const dealId = c.req.param("dealId");
  const store = getArbiterStore(c.env);
  const deal = await store.getSafePayDeal(dealId);

  if (!deal) {
    return c.json({ success: false, error: "DEAL_NOT_FOUND" }, 404);
  }

  if (deal.status !== "FUNDED_LOCKED" && deal.status !== "DELIVERED_AWAITING_APPROVAL") {
    return c.json(
      {
        success: false,
        error: "DEAL_NOT_LOCKED",
        message: `Deal must be in FUNDED_LOCKED state before delivery (current: ${deal.status})`
      },
      400
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > deal.expiresAt) {
    deal.status = "VOIDED_EXPIRED";
    deal.sellerSignaturePayload = null;
    deal.feeSignaturePayload = null;
    deal.updatedAt = Date.now();
    await store.saveSafePayDeal(deal);
    return c.json(
      {
        success: false,
        error: "DEAL_EXPIRED",
        message: "Deal expired prior to delivery; EIP-3009 authorizations have been shredded ($0 charged)."
      },
      410
    );
  }

  let submission: DeliverSafePayDealRequest;
  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const file = formData.get("file");
    const sellerAddress = formData.get("sellerAddress")?.toString();
    const format = formData.get("format")?.toString() as any;
    let content = formData.get("content")?.toString() || "";
    let filename = formData.get("filename")?.toString() || "deliverable.dat";
    let mimeType = "application/octet-stream";

    if (file && typeof file !== "string" && "text" in file) {
      filename = (file as File).name || filename;
      mimeType = (file as File).type || mimeType;
      content = await (file as File).text();
    }

    submission = {
      sellerAddress,
      format,
      filename,
      mimeType,
      content
    };
  } else {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Invalid JSON delivery payload" }, 400);
    }
    const parsed = DeliverSafePayDealRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ success: false, error: "VALIDATION_ERROR", details: parsed.error.issues }, 400);
    }
    submission = parsed.data;
  }

  if (
    submission.sellerAddress &&
    deal.sellerAddress &&
    submission.sellerAddress.toLowerCase() !== deal.sellerAddress.toLowerCase()
  ) {
    return c.json(
      {
        success: false,
        error: "UNAUTHORIZED_SELLER",
        message: `Delivery sellerAddress ${submission.sellerAddress} does not match deal sellerAddress ${deal.sellerAddress}`
      },
      403
    );
  }

  // Run deterministic Edge Verification + Redacted Preview generator
  const outcome = await verifySafePayDeliverable(
    deal.verificationMode,
    deal.verificationSpec,
    submission,
    c.env?.ENVIRONMENT || "development"
  );

  deal.redactedPreview = outcome.redactedPreview;
  deal.deliverableSha256 = outcome.deliverableSha256;
  deal.deliverableFilename =
    submission.filename ||
    (deal.verificationMode === "DATASET_SCHEMA"
      ? `dataset-${deal.id}.${outcome.redactedPreview.datasetSummary?.format || "json"}`
      : deal.verificationMode === "FILE_ARCHIVE"
      ? `archive-${deal.id}.zip`
      : `deliverable-${deal.id}.txt`);
  deal.deliverableMimeType =
    submission.mimeType ||
    (deal.verificationMode === "DATASET_SCHEMA" ? "application/json" : "application/octet-stream");
  deal.updatedAt = Date.now();

  if (!outcome.valid) {
    deal.validationErrors = outcome.errors;
    if (deal.verificationSpec.strictSingleShot) {
      deal.status = "VOIDED_FAILED";
      deal.sellerSignaturePayload = null;
      deal.feeSignaturePayload = null;
    }

    if (deal.buyerAddress && deal.sellerAddress) {
      const chainConfig = getChainConfig(deal.chainId);
      await store.recordFailedValidation(deal.sellerAddress.toLowerCase(), deal.buyerAddress, {
        id: `safepay_fail_${deal.id}_${Date.now()}`,
        network: chainConfig.caip2,
        buyerAddress: deal.buyerAddress,
        sellerAgentId: deal.sellerAddress.toLowerCase(),
        amount: deal.totalBuyerSignAtomic,
        fee: "0",
        targetUrl: `https://nullclear.com/deal/${deal.id}`,
        status: "FAILED_VALIDATION",
        errorReason: outcome.errors.join("; "),
        createdAt: Date.now()
      });
    }

    await store.saveSafePayDeal(deal);

    return c.json(
      {
        success: false,
        verified: false,
        settled: false,
        buyerChargedAtomic: "0",
        status: deal.status,
        validationErrors: outcome.errors,
        redactedPreview: outcome.redactedPreview,
        deal: sanitizeDealForPublicView(deal)
      },
      422
    );
  }

  // Verification PASSED! Stage encrypted deliverable in KV (if bound) and D1 record
  const rawDeliverablePayload =
    submission.content || submission.targetUrl || JSON.stringify(submission.archiveManifest || []);
  deal.encryptedDeliverable = rawDeliverablePayload;
  deal.validationErrors = [];

  if (c.env?.KV) {
    try {
      await c.env.KV.put(`safepay:deliverable:${deal.id}`, rawDeliverablePayload, {
        expirationTtl: 30 * 86400
      });
    } catch {
      // D1 encryptedDeliverable column serves as primary storage
    }
  }

  // Mode D (OPTIMISTIC_PREVIEW) without immediate autoSettleOnPass waits for 1-click buyer approval
  if (deal.verificationMode === "OPTIMISTIC_PREVIEW" && !deal.verificationSpec.autoSettleOnPass) {
    deal.status = "DELIVERED_AWAITING_APPROVAL";
    await store.saveSafePayDeal(deal);
    return c.json({
      success: true,
      verified: true,
      settled: false,
      status: deal.status,
      redactedPreview: outcome.redactedPreview,
      deal: sanitizeDealForPublicView(deal)
    });
  }

  // Modes A, B, C (and Mode D with autoSettleOnPass): Execute Atomic Dual Settlement immediately!
  const settlement = await executeAtomicDualSettlement(deal, outcome.deliverableSha256, c.env);
  if (!settlement.settled) {
    await store.saveSafePayDeal(deal);
    return c.json(
      {
        success: false,
        verified: true,
        settled: false,
        error: "SETTLEMENT_EXECUTION_FAILED",
        message: settlement.error,
        redactedPreview: outcome.redactedPreview
      },
      502
    );
  }

  deal.status = "SETTLED";
  deal.sellerTxHash = settlement.sellerTxHash;
  deal.feeTxHash = settlement.feeTxHash;
  deal.receipt = settlement.receipt;
  deal.settledAt = settlement.receipt.receipt.settledAt;
  // Shred raw EIP-3009 signatures now that settlement is complete
  deal.sellerSignaturePayload = null;
  deal.feeSignaturePayload = null;
  deal.updatedAt = Date.now();

  await store.saveSafePayDeal(deal);

  return c.json({
    success: true,
    verified: true,
    settled: true,
    status: deal.status,
    sellerTxHash: deal.sellerTxHash,
    feeTxHash: deal.feeTxHash,
    treasuryAddress: SAFEPAY_TREASURY_ADDRESS,
    receipt: deal.receipt,
    redactedPreview: deal.redactedPreview,
    deal: sanitizeDealForPublicView(deal)
  });
});

// ============================================================================
// 5. POST /api/safepay/deals/:dealId/approve — 1-Click Buyer Optimistic Release
// ============================================================================
safepayRouter.post("/deals/:dealId/approve", async (c) => {
  const dealId = c.req.param("dealId");
  const store = getArbiterStore(c.env);
  const deal = await store.getSafePayDeal(dealId);

  if (!deal) {
    return c.json({ success: false, error: "DEAL_NOT_FOUND" }, 404);
  }

  if (deal.status !== "DELIVERED_AWAITING_APPROVAL" && deal.status !== "FUNDED_LOCKED") {
    return c.json(
      {
        success: false,
        error: "INVALID_DEAL_STATE",
        message: `Deal cannot be approved from status ${deal.status}`
      },
      400
    );
  }

  const settlement = await executeAtomicDualSettlement(
    deal,
    deal.deliverableSha256 || "0x0",
    c.env
  );
  if (!settlement.settled) {
    return c.json(
      {
        success: false,
        settled: false,
        error: "SETTLEMENT_EXECUTION_FAILED",
        message: settlement.error
      },
      502
    );
  }

  deal.status = "SETTLED";
  deal.sellerTxHash = settlement.sellerTxHash;
  deal.feeTxHash = settlement.feeTxHash;
  deal.receipt = settlement.receipt;
  deal.settledAt = settlement.receipt.receipt.settledAt;
  deal.sellerSignaturePayload = null;
  deal.feeSignaturePayload = null;
  deal.updatedAt = Date.now();

  await store.saveSafePayDeal(deal);

  return c.json({
    success: true,
    settled: true,
    status: deal.status,
    sellerTxHash: deal.sellerTxHash,
    feeTxHash: deal.feeTxHash,
    receipt: deal.receipt,
    deal: sanitizeDealForPublicView(deal)
  });
});

// ============================================================================
// 6. POST /api/safepay/deals/:dealId/void — Instant Buyer Void / Expiry Cancel
// ============================================================================
safepayRouter.post("/deals/:dealId/void", async (c) => {
  const dealId = c.req.param("dealId");
  const store = getArbiterStore(c.env);
  const deal = await store.getSafePayDeal(dealId);

  if (!deal) {
    return c.json({ success: false, error: "DEAL_NOT_FOUND" }, 404);
  }

  if (deal.status === "SETTLED") {
    return c.json(
      {
        success: false,
        error: "ALREADY_SETTLED",
        message: "Cannot void a deal that has already settled on-chain"
      },
      400
    );
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const callerAddress = String(body.callerAddress || body.buyerAddress || "").toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const isExpired = nowSec > deal.expiresAt;
  const isMutualCancel = Boolean(body.mutualCancel);

  if (
    deal.status === "FUNDED_LOCKED" &&
    !isExpired &&
    !isMutualCancel &&
    deal.buyerAddress &&
    callerAddress !== deal.buyerAddress.toLowerCase()
  ) {
    return c.json(
      {
        success: false,
        error: "VOID_NOT_AUTHORIZED",
        message: "Only the buyer or mutual agreement can void a locked deal before expiration"
      },
      403
    );
  }

  deal.status = "VOIDED_EXPIRED";
  deal.sellerSignaturePayload = null;
  deal.feeSignaturePayload = null;
  deal.updatedAt = Date.now();

  await store.saveSafePayDeal(deal);

  return c.json({
    success: true,
    status: deal.status,
    shreddedSignatures: true,
    buyerChargedAtomic: "0",
    deal: sanitizeDealForPublicView(deal)
  });
});

// ============================================================================
// 7. GET /api/safepay/deals/:dealId/download — Buyer Authenticated Download
// ============================================================================
safepayRouter.get("/deals/:dealId/download", async (c) => {
  const dealId = c.req.param("dealId");
  const store = getArbiterStore(c.env);
  const deal = await store.getSafePayDeal(dealId);

  if (!deal) {
    return c.json({ success: false, error: "DEAL_NOT_FOUND" }, 404);
  }

  if (deal.status !== "SETTLED") {
    return c.json(
      {
        success: false,
        error: "DELIVERABLE_LOCKED",
        message: `Deliverable cannot be downloaded until deal status is SETTLED (current: ${deal.status})`
      },
      403
    );
  }

  const buyerParam =
    c.req.query("buyer") ||
    c.req.header("X-Buyer-Address") ||
    c.req.header("x-buyer-address");

  if (!buyerParam || !deal.buyerAddress || buyerParam.toLowerCase() !== deal.buyerAddress.toLowerCase()) {
    return c.json(
      {
        success: false,
        error: "BUYER_AUTHENTICATION_REQUIRED",
        message: "Provide matching buyer wallet address via ?buyer=0x... or X-Buyer-Address header"
      },
      403
    );
  }

  const buyerSig = c.req.query("signature") || c.req.header("X-Buyer-Signature");
  if (buyerSig) {
    const validMsg = await verifyMessage({
      address: deal.buyerAddress,
      message: `NullClear SafePay Download:${deal.id}`,
      signature: buyerSig as `0x${string}`
    }).catch(() => false);

    if (!validMsg) {
      return c.json(
        {
          success: false,
          error: "INVALID_BUYER_SIGNATURE",
          message: "Wallet signature verification failed for deliverable download"
        },
        403
      );
    }
  }

  let payload = deal.encryptedDeliverable;
  if (!payload && c.env?.KV) {
    payload = await c.env.KV.get(`safepay:deliverable:${deal.id}`);
  }

  if (!payload) {
    return c.json({ success: false, error: "DELIVERABLE_PAYLOAD_MISSING" }, 404);
  }

  c.header("Content-Type", deal.deliverableMimeType || "application/octet-stream");
  c.header(
    "Content-Disposition",
    `attachment; filename="${deal.deliverableFilename || `safepay-${deal.id}.dat`}"`
  );
  if (deal.deliverableSha256) {
    c.header("X-NullClear-Deliverable-SHA256", deal.deliverableSha256);
  }
  if (deal.receipt?.signature) {
    c.header("X-NullClear-Receipt-Signature", deal.receipt.signature);
  }

  return c.body(payload);
});

// ============================================================================
// 8. POST /api/safepay/deals/:dealId/demo-lock — Sandbox Dual EIP-3009 Signer
// ============================================================================
safepayRouter.post("/deals/:dealId/demo-lock", async (c) => {
  const dealId = c.req.param("dealId");
  const store = getArbiterStore(c.env);
  const deal = await store.getSafePayDeal(dealId);

  if (!deal) {
    return c.json({ success: false, error: "DEAL_NOT_FOUND" }, 404);
  }

  const sandboxAccount = privateKeyToAccount(DEFAULT_ARBITER_KEY);
  const sellerAddress =
    deal.sellerAddress || ("0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const);
  const chainConfig = getChainConfig(deal.chainId);
  const nowSec = Math.floor(Date.now() / 1000);
  const validAfter = String(nowSec - 60);
  const validBefore = String(nowSec + 3600);

  const randNonce = (tag: string): `0x${string}` =>
    keccak256(stringToHex(`safepay_demo_nonce:${dealId}:${tag}:${Date.now()}:${Math.random()}`));

  const sellerNonce = randNonce("seller");
  const feeNonce = randNonce("fee");

  const sellerSig = await sandboxAccount.signTypedData({
    domain: chainConfig.usdcDomain,
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: sandboxAccount.address,
      to: sellerAddress,
      value: BigInt(deal.sellerNetAtomic),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: sellerNonce
    }
  });

  const feeSig = await sandboxAccount.signTypedData({
    domain: chainConfig.usdcDomain,
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: sandboxAccount.address,
      to: SAFEPAY_TREASURY_ADDRESS,
      value: BigInt(deal.protocolFeeAtomic),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: feeNonce
    }
  });

  const sellerSignaturePayload: X402PaymentSignaturePayload = {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: chainConfig.caip2 as "eip155:8453" | "eip155:84532",
      amount: deal.sellerNetAtomic,
      asset: chainConfig.usdc,
      payTo: sellerAddress,
      maxTimeoutSeconds: 3600
    },
    payload: {
      signature: sellerSig,
      authorization: {
        from: sandboxAccount.address,
        to: sellerAddress,
        value: deal.sellerNetAtomic,
        validAfter,
        validBefore,
        nonce: sellerNonce
      }
    }
  };

  const feeSignaturePayload: X402PaymentSignaturePayload = {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: chainConfig.caip2 as "eip155:8453" | "eip155:84532",
      amount: deal.protocolFeeAtomic,
      asset: chainConfig.usdc,
      payTo: SAFEPAY_TREASURY_ADDRESS,
      maxTimeoutSeconds: 3600
    },
    payload: {
      signature: feeSig,
      authorization: {
        from: sandboxAccount.address,
        to: SAFEPAY_TREASURY_ADDRESS,
        value: deal.protocolFeeAtomic,
        validAfter,
        validBefore,
        nonce: feeNonce
      }
    }
  };

  deal.buyerAddress = sandboxAccount.address;
  deal.sellerAddress = sellerAddress;
  deal.sellerSignaturePayload = sellerSignaturePayload;
  deal.feeSignaturePayload = feeSignaturePayload;
  deal.status = "FUNDED_LOCKED";
  deal.updatedAt = Date.now();

  await store.saveSafePayDeal(deal);

  return c.json({
    success: true,
    status: deal.status,
    deal: sanitizeDealForPublicView(deal),
    lockVerification: {
      sellerAuthorizationVerified: true,
      feeAuthorizationVerified: true,
      sellerNetAtomic: deal.sellerNetAtomic,
      protocolFeeAtomic: deal.protocolFeeAtomic,
      treasuryAddress: SAFEPAY_TREASURY_ADDRESS
    }
  });
});


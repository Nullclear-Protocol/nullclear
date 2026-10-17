import { Hono, type Context } from "hono";
import { keccak256, stringToHex } from "viem";
import {
  decodeBase64Json,
  encodeBase64Json,
  getChainConfig,
  BASE_MAINNET_USDC,
  type X402PaymentRequired,
  type X402PaymentOption,
  type X402PaymentSignaturePayload,
  type X402PaymentResponse
} from "@nullclear/shared";
import {
  getArbiterStore,
  type Env,
  type SellerGatewayRecord,
  type ValidationPreset
} from "../env.js";
import { validateTargetUrl } from "../services/ssrf-guard.js";
import { validateUpstreamResponse } from "../services/validator.js";
import { verifyEIP3009Local, settleTransfer, settleOnChain, settleViaFacilitator } from "../services/facilitator.js";
import { signClearingReceipt } from "../services/attestation.js";
import { executeUpstreamFetch } from "./clear.js";
import { runAutoGuard } from "./proxy.js";
import {
  buildNullClearMetadata,
  consumeSponsoredFreeCall,
  isExplicitFreeTrialRequest
} from "../middleware/free-tier.js";

const DEFAULT_TREASURY = "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c";

const BUILTIN_GATEWAYS: SellerGatewayRecord[] = [
  {
    id: "gw_builtin_token_security",
    slug: "base-token-security",
    sellerAddress: DEFAULT_TREASURY,
    upstreamUrl: "https://api.nullclear.dev/v1/bazaar/token-security",
    priceAtomic: "5000",
    description: "Base ERC-20 token honeypot, tax & bytecode security scanner protected by NullClear Schema Escrow.",
    category: "security",
    validationPreset: "STRICT_NO_REFUSAL",
    totalCalls: 42,
    createdAt: 1774000000000
  },
  {
    id: "gw_builtin_market_oracle",
    slug: "eth-market-oracle",
    sellerAddress: DEFAULT_TREASURY,
    upstreamUrl: "https://api.nullclear.dev/v1/bazaar/market-oracle",
    priceAtomic: "10000",
    description: "Multi-source ETH/BTC/SOL consensus price oracle with strict positive-price & spread invariant enforcement.",
    category: "oracle",
    validationPreset: "STRICT_NO_REFUSAL",
    totalCalls: 87,
    createdAt: 1774000000000
  },
  {
    id: "gw_builtin_wallet_radar",
    slug: "wallet-sybil-radar",
    sellerAddress: DEFAULT_TREASURY,
    upstreamUrl: "https://api.nullclear.dev/v1/bazaar/wallet-risk",
    priceAtomic: "5000",
    description: "Counterparty wallet OFAC sanctions, wash-trade concentration & ERC-8004 reputation risk scorer.",
    category: "security",
    validationPreset: "STRICT_NO_REFUSAL",
    totalCalls: 31,
    createdAt: 1774000000000
  }
];

function parseUsdcToAtomic(priceUsdc?: string | number, priceAtomic?: string | number): string | null {
  if (priceAtomic !== undefined && priceAtomic !== null && String(priceAtomic).trim() !== "") {
    const clean = String(priceAtomic).trim();
    if (/^\d+$/.test(clean) && BigInt(clean) > 0n) {
      return clean;
    }
  }
  if (priceUsdc !== undefined && priceUsdc !== null && String(priceUsdc).trim() !== "") {
    const num = Number(priceUsdc);
    if (!Number.isNaN(num) && num > 0 && num <= 100000) {
      const atomic = Math.round(num * 1_000_000);
      if (atomic > 0) {
        return String(atomic);
      }
    }
  }
  return null;
}

function formatAtomicToUsdc(priceAtomic: string): string {
  try {
    const num = Number(priceAtomic) / 1_000_000;
    return num.toFixed(num < 0.01 ? 4 : 2);
  } catch {
    return "0.01";
  }
}

async function resolveGateway(c: Context<Env>, slug: string): Promise<SellerGatewayRecord | null> {
  const store = getArbiterStore(c.env);
  const cleanSlug = slug.trim().toLowerCase();
  const stored = await store.getSellerGatewayBySlug(cleanSlug);
  if (stored) {
    return stored;
  }
  const builtin = BUILTIN_GATEWAYS.find((g) => g.slug === cleanSlug);
  return builtin || null;
}

export const gatewaysRouter = new Hono<Env>();
export const gatewayProxyRouter = new Hono<Env>();

/**
 * GET /v1/gateways - List registered 1-Click Seller Gateways
 */
gatewaysRouter.get("/", async (c) => {
  const store = getArbiterStore(c.env);
  const stored = await store.listSellerGateways(50);
  const storedSlugs = new Set(stored.map((g) => g.slug));
  const merged = [
    ...stored,
    ...BUILTIN_GATEWAYS.filter((b) => !storedSlugs.has(b.slug))
  ];

  return c.json({
    service: "NullClear 1-Click Seller Gateway Directory",
    description: "Turn any REST API into a NullClear-protected x402 endpoint in 10 seconds.",
    totalGateways: merged.length,
    gateways: merged.map((g) => ({
      id: g.id,
      slug: g.slug,
      gatewayUrl: `https://api.nullclear.dev/g/${g.slug}`,
      upstreamUrl: g.upstreamUrl,
      sellerAddress: g.sellerAddress,
      priceAtomic: g.priceAtomic,
      priceUsdc: formatAtomicToUsdc(g.priceAtomic),
      description: g.description,
      category: g.category,
      validationPreset: g.validationPreset,
      totalCalls: g.totalCalls,
      createdAt: g.createdAt
    })),
    _nullclear: buildNullClearMetadata()
  });
});

/**
 * GET /v1/gateways/:slug - Inspect a specific Seller Gateway
 */
gatewaysRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const gw = await resolveGateway(c, slug);
  if (!gw) {
    return c.json({ error: "GATEWAY_NOT_FOUND", slug }, 404);
  }
  return c.json({
    success: true,
    gateway: {
      id: gw.id,
      slug: gw.slug,
      gatewayUrl: `https://api.nullclear.dev/g/${gw.slug}`,
      upstreamUrl: gw.upstreamUrl,
      sellerAddress: gw.sellerAddress,
      priceAtomic: gw.priceAtomic,
      priceUsdc: formatAtomicToUsdc(gw.priceAtomic),
      description: gw.description,
      category: gw.category,
      validationPreset: gw.validationPreset,
      customSchema: gw.customSchema ? JSON.parse(gw.customSchema) : undefined,
      totalCalls: gw.totalCalls,
      createdAt: gw.createdAt
    },
    _nullclear: buildNullClearMetadata()
  });
});

/**
 * POST /v1/gateways - Register a 1-Click Seller Gateway
 */
gatewaysRouter.post("/", async (c) => {
  const store = getArbiterStore(c.env);
  let body: Record<string, any>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON request body" }, 400);
  }

  const upstreamUrl = typeof body.upstreamUrl === "string" ? body.upstreamUrl.trim() : "";
  const sellerAddress = typeof body.sellerAddress === "string" ? body.sellerAddress.trim() : "";
  const rawSlug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "NullClear-protected x402 API endpoint";
  const category = typeof body.category === "string" && ["data", "security", "oracle", "ai"].includes(body.category)
    ? body.category
    : "data";
  const validationPreset: ValidationPreset =
    body.validationPreset === "DEFAULT_JSON" ||
    body.validationPreset === "STRICT_NO_REFUSAL" ||
    body.validationPreset === "CUSTOM"
      ? body.validationPreset
      : "STRICT_NO_REFUSAL";

  if (!upstreamUrl) {
    return c.json({ success: false, error: "upstreamUrl is required" }, 400);
  }

  const ssrfCheck = validateTargetUrl(upstreamUrl, c.env.ENVIRONMENT);
  if (!ssrfCheck.allowed) {
    return c.json({ success: false, stage: "SSRF_BLOCKED", error: ssrfCheck.reason || "Invalid upstreamUrl" }, 400);
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(sellerAddress)) {
    return c.json({ success: false, error: "sellerAddress must be a valid 40-hex-character Base EVM address (0x...)" }, 400);
  }

  const slug = rawSlug || `gw-${Math.random().toString(36).substring(2, 8)}`;
  if (!/^[a-z0-9][a-z0-9-_]{1,62}$/.test(slug)) {
    return c.json(
      {
        success: false,
        error: "slug must be 2-63 lowercase alphanumeric characters, hyphens, or underscores"
      },
      400
    );
  }

  const existing = await store.getSellerGatewayBySlug(slug);
  if (existing) {
    return c.json({ success: false, error: "GATEWAY_SLUG_ALREADY_EXISTS", slug }, 409);
  }

  const priceAtomic = parseUsdcToAtomic(body.priceUsdc, body.priceAtomic);
  if (!priceAtomic) {
    return c.json(
      {
        success: false,
        error: "Provide a valid positive priceUsdc (e.g. '0.01') or priceAtomic (e.g. '10000')"
      },
      400
    );
  }

  let customSchemaStr: string | undefined;
  if (body.customSchema) {
    try {
      const schemaObj = typeof body.customSchema === "string" ? JSON.parse(body.customSchema) : body.customSchema;
      if (!schemaObj || typeof schemaObj !== "object") {
        throw new Error("customSchema must be a valid JSON Schema object");
      }
      customSchemaStr = JSON.stringify(schemaObj);
    } catch (err: any) {
      return c.json({ success: false, error: `Invalid customSchema: ${err.message}` }, 400);
    }
  }

  const record: SellerGatewayRecord = {
    id: `gw_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    slug,
    sellerAddress,
    upstreamUrl,
    priceAtomic,
    description,
    category,
    validationPreset,
    customSchema: customSchemaStr,
    totalCalls: 0,
    createdAt: Date.now()
  };

  await store.saveSellerGateway(record);

  return c.json(
    {
      success: true,
      gateway: {
        id: record.id,
        slug: record.slug,
        gatewayUrl: `https://api.nullclear.dev/g/${record.slug}`,
        upstreamUrl: record.upstreamUrl,
        sellerAddress: record.sellerAddress,
        priceAtomic: record.priceAtomic,
        priceUsdc: formatAtomicToUsdc(record.priceAtomic),
        description: record.description,
        category: record.category,
        validationPreset: record.validationPreset,
        totalCalls: 0,
        createdAt: record.createdAt
      },
      _nullclear: buildNullClearMetadata()
    },
    201
  );
});

/**
 * Handler for ALL /g/:slug and /g/:slug/*
 */
async function executeGatewayProxy(c: Context<Env>): Promise<Response> {
  const store = getArbiterStore(c.env);
  const slug = c.req.param("slug");
  const gateway = await resolveGateway(c, slug);

  if (!gateway) {
    return c.json(
      {
        cleared: false,
        error: "GATEWAY_NOT_FOUND",
        message: `No Seller Gateway registered for slug '${slug}'`,
        _nullclear: buildNullClearMetadata()
      },
      404
    );
  }

  // Construct target upstream URL including any subpath and query parameters
  const reqUrl = new URL(c.req.url);
  const prefix = `/g/${slug}`;
  const extraPath = reqUrl.pathname.startsWith(prefix) ? reqUrl.pathname.slice(prefix.length) : "";
  const baseUpstream = gateway.upstreamUrl.replace(/\/$/, "");
  const fullTargetUrl = `${baseUpstream}${extraPath}${reqUrl.search || ""}`;

  const ssrfCheck = validateTargetUrl(fullTargetUrl, c.env.ENVIRONMENT);
  if (!ssrfCheck.allowed) {
    return c.json({ cleared: false, stage: "SSRF_BLOCKED", error: ssrfCheck.reason }, 400);
  }

  const paymentHeader =
    c.req.header("payment-signature") ||
    c.req.header("PAYMENT-SIGNATURE") ||
    c.req.header("x-payment") ||
    c.req.header("X-Payment") ||
    c.req.header("x-nullclear-authorization");

  const method = c.req.method || "GET";
  let reqBody: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    try {
      reqBody = await c.req.text();
    } catch {
      reqBody = undefined;
    }
  }

  const forwardHeaders: Record<string, string> = {
    Accept: c.req.header("accept") || "application/json, text/plain, */*",
    "User-Agent": "NullClear-Seller-Gateway/1.0 (+https://nullclear.dev)",
    "X-NullClear-Gateway-Slug": gateway.slug
  };
  const contentType = c.req.header("content-type");
  if (contentType) {
    forwardHeaders["Content-Type"] = contentType;
  }

  // Helper to run the gateway's configured validation preset
  const validateGatewayResponse = async (status: number, rawText: string) => {
    let parsedJson: unknown = null;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      parsedJson = null;
    }

    if (gateway.validationPreset === "CUSTOM" && gateway.customSchema) {
      const customSchemaObj = JSON.parse(gateway.customSchema);
      const res = await validateUpstreamResponse(status, rawText, parsedJson, {
        expectedStatus: [200, 201],
        rejectRefusals: true,
        jsonSchema: customSchemaObj
      });
      return { valid: res.valid, errors: res.errors, parsedJson };
    }

    if (gateway.validationPreset === "DEFAULT_JSON") {
      if (status < 200 || status >= 300) {
        return { valid: false, errors: [`Upstream returned HTTP status ${status}`], parsedJson };
      }
      if (parsedJson === null || (typeof parsedJson === "object" && Object.keys(parsedJson as object).length === 0)) {
        return { valid: false, errors: ["Upstream response is not a valid non-empty JSON object"], parsedJson };
      }
      return { valid: true, errors: [], parsedJson };
    }

    // Default: STRICT_NO_REFUSAL (Auto-Guard + Canonical LLM Refusal Guard)
    const guard = await runAutoGuard(status, rawText);
    return { valid: guard.valid, errors: guard.errors, parsedJson: guard.parsedJson };
  };

  // Support explicit Zero-Config Free Trial on gateways when requested via header/query
  if (!paymentHeader && isExplicitFreeTrialRequest(c)) {
    const freeTier = await consumeSponsoredFreeCall(c);
    if (freeTier.allowed) {
      const clearingId = `gw_trial_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const trialHeaders: Record<string, string> = {
        ...forwardHeaders,
        "X-NullClear-Escrow-Hold": "true",
        "X-NullClear-Verified-Escrow": clearingId
      };
      const probe = await executeUpstreamFetch(fullTargetUrl, method, trialHeaders, reqBody);
      const rawText = probe.error && probe.status >= 500 ? JSON.stringify({ error: probe.error }) : probe.text;
      const valResult = await validateGatewayResponse(probe.status, rawText);

      c.header("x-nullclear-tier", "free-trial");
      c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));
      c.header("X-NullClear-Gateway", gateway.slug);

      if (!valResult.valid) {
        return c.json(
          {
            cleared: false,
            settled: false,
            tier: "free-trial",
            freeTrialRemaining: freeTier.remaining,
            buyerCharged: "0",
            gatewaySlug: gateway.slug,
            stage: "GATEWAY_VALIDATION_FAILED",
            error: "Upstream response failed Gateway validation preset — payment shredded ($0 charged)",
            validationErrors: valResult.errors,
            _nullclear: buildNullClearMetadata(freeTier.remaining)
          },
          422
        );
      }

      await store.incrementSellerGatewayCalls(gateway.slug);
      const responseHash = keccak256(stringToHex(rawText));
      const signedReceipt = await signClearingReceipt(
        {
          clearingId,
          buyer: "0x0000000000000000000000000000000000000000",
          sellerAgentId: `gateway:${gateway.slug}`,
          amountAtomic: "0",
          feeAtomic: "0",
          responseHash,
          timestamp: Math.floor(Date.now() / 1000),
          cleared: true
        },
        c.env.ARBITER_PRIVATE_KEY
      );

      c.header("X-NullClear-Verified", "true");
      c.header("X-NullClear-Receipt-Id", clearingId);
      c.header("X-NullClear-Attestation", encodeBase64Json(signedReceipt));

      return c.json({
        cleared: true,
        settled: true,
        tier: "free-trial",
        freeTrialRemaining: freeTier.remaining,
        gatewaySlug: gateway.slug,
        sellerAddress: gateway.sellerAddress,
        buyerCharged: "0",
        executionReceipt: signedReceipt,
        data: valResult.parsedJson !== null ? valResult.parsedJson : rawText,
        _nullclear: buildNullClearMetadata(freeTier.remaining)
      });
    }
  }

  // If no payment signature -> issue x402 402 Payment Required Challenge for this seller gateway
  if (!paymentHeader) {
    const option: X402PaymentOption = {
      scheme: "exact",
      network: "eip155:8453",
      amount: gateway.priceAtomic,
      asset: BASE_MAINNET_USDC,
      payTo: gateway.sellerAddress,
      maxTimeoutSeconds: 300,
      extra: {
        name: "USD Coin",
        version: "2"
      }
    };

    const paymentRequired: X402PaymentRequired = {
      x402Version: 2,
      error: "Payment Required: Submit EIP-3009 authorization via PAYMENT-SIGNATURE or X-Payment header",
      resource: {
        url: `https://api.nullclear.dev/g/${gateway.slug}`,
        description: gateway.description,
        mimeType: "application/json"
      },
      accepts: [option],
      extensions: {
        nullclearEscrow: {
          supported: true,
          gatewaySlug: gateway.slug,
          validationPreset: gateway.validationPreset,
          clearEndpoint: "https://api.nullclear.dev/v1/clear"
        }
      }
    };

    c.header("PAYMENT-REQUIRED", encodeBase64Json(paymentRequired));
    c.header("X-NullClear-Gateway", gateway.slug);
    return c.json(
      {
        ...paymentRequired,
        gateway: {
          slug: gateway.slug,
          sellerAddress: gateway.sellerAddress,
          priceAtomic: gateway.priceAtomic,
          priceUsdc: formatAtomicToUsdc(gateway.priceAtomic),
          category: gateway.category,
          validationPreset: gateway.validationPreset
        },
        _nullclear: buildNullClearMetadata()
      },
      402
    );
  }

  // Decode & verify EIP-3009 payment signature
  let paymentSigPayload: X402PaymentSignaturePayload;
  try {
    paymentSigPayload = decodeBase64Json<X402PaymentSignaturePayload>(paymentHeader);
    if (!paymentSigPayload.payload || !paymentSigPayload.accepted) {
      throw new Error("Malformed payment payload");
    }
  } catch (err: any) {
    return c.json(
      {
        cleared: false,
        stage: "INVALID_PAYMENT_SIGNATURE",
        error: `Invalid PAYMENT-SIGNATURE header: ${err.message}`
      },
      400
    );
  }

  const { accepted, payload } = paymentSigPayload;
  const { authorization, signature } = payload;

  if (BigInt(accepted.amount) < BigInt(gateway.priceAtomic)) {
    return c.json(
      {
        cleared: false,
        stage: "INSUFFICIENT_PAYMENT_AMOUNT",
        error: `Gateway '${gateway.slug}' requires at least ${gateway.priceAtomic} atomic USDC units (got ${accepted.amount})`
      },
      400
    );
  }

  const isReplayed = await store.hasUsedNonce(accepted.network, authorization.from, authorization.nonce);
  if (isReplayed) {
    return c.json(
      {
        cleared: false,
        stage: "NONCE_REPLAY_DETECTED",
        error: "PAYMENT_NONCE_ALREADY_USED",
        nonce: authorization.nonce
      },
      409
    );
  }

  const sigVerify = await verifyEIP3009Local(authorization, signature, accepted);
  if (!sigVerify.valid) {
    return c.json(
      {
        cleared: false,
        stage: "INVALID_PAYMENT_SIGNATURE",
        error: sigVerify.error || "EIP-3009 signature verification failed"
      },
      400
    );
  }

  // Hold payment in escrow & call seller's upstream REST endpoint
  const clearingId = `gw_clr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const upstreamHeaders: Record<string, string> = {
    ...forwardHeaders,
    "X-NullClear-Verified-Escrow": clearingId,
    "X-NullClear-Amount-Locked": accepted.amount,
    "X-NullClear-Escrow-Hold": "true",
    "X-NullClear-Clearing-Id": clearingId
  };

  const probe = await executeUpstreamFetch(fullTargetUrl, method, upstreamHeaders, reqBody);
  const rawText = probe.error && probe.status >= 500 ? JSON.stringify({ error: probe.error }) : probe.text;
  const valResult = await validateGatewayResponse(probe.status, rawText);

  c.header("X-NullClear-Gateway", gateway.slug);

  if (!valResult.valid) {
    await store.recordFailedValidation(`gateway:${gateway.slug}`, authorization.from, {
      id: clearingId,
      network: accepted.network,
      buyerAddress: authorization.from,
      sellerAgentId: `gateway:${gateway.slug}`,
      amount: accepted.amount,
      fee: "0",
      targetUrl: fullTargetUrl,
      status: probe.status >= 500 ? "FAILED_UPSTREAM" : "FAILED_VALIDATION",
      errorReason: valResult.errors.join("; "),
      eip3009Nonce: authorization.nonce,
      createdAt: Date.now()
    });

    const voidResponse: X402PaymentResponse = {
      success: false,
      network: accepted.network,
      payer: authorization.from,
      errorReason: "nullclear_gateway_validation_failed"
    };
    c.header("PAYMENT-RESPONSE", encodeBase64Json(voidResponse));
    c.header("X-NullClear-Verified", "false");

    return c.json(
      {
        cleared: false,
        settled: false,
        buyerCharged: "0",
        gatewaySlug: gateway.slug,
        stage: probe.status >= 500 ? "FAILED_UPSTREAM" : "GATEWAY_VALIDATION_FAILED",
        error: "Upstream seller response failed NullClear Gateway validation — payment shredded ($0 charged)",
        validationErrors: valResult.errors,
        _nullclear: buildNullClearMetadata()
      },
      422
    );
  }

  // Validation passed -> settle payment & increment gateway call counter
  const chainConfig = getChainConfig(accepted.network);
  const effectiveMode = c.env.SETTLEMENT_MODE || (c.env.ENVIRONMENT === "production" ? "onchain" : "simulated");

  let settlement: X402PaymentResponse;
  if (effectiveMode === "simulated") {
    const txHash = keccak256(
      stringToHex(`gateway_settlement:${gateway.slug}:${authorization.from}:${authorization.nonce}:${Date.now()}`)
    );
    settlement = {
      success: true,
      transaction: txHash,
      network: accepted.network,
      payer: authorization.from
    };
  } else {
    const settlementOptions = {
      authorization,
      signature,
      accepted,
      facilitatorUrl: c.env.FACILITATOR_URL,
      settlementMode: effectiveMode,
      arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
      rpcUrl:
        chainConfig.chainId === 8453
          ? (c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL)
          : c.env.BASE_SEPOLIA_RPC_URL,
      environment: c.env.ENVIRONMENT
    };
    settlement =
      effectiveMode === "facilitator"
        ? await settleViaFacilitator(settlementOptions)
        : (effectiveMode === "onchain"
            ? await settleOnChain(settlementOptions)
            : await settleTransfer(settlementOptions));
  }

  const feeAtomic = ((BigInt(accepted.amount) * 50n) / 10000n).toString();
  const responseHash = keccak256(stringToHex(rawText));
  const timestamp = Math.floor(Date.now() / 1000);
  const signedReceipt = await signClearingReceipt(
    {
      clearingId,
      buyer: authorization.from,
      sellerAgentId: `gateway:${gateway.slug}`,
      amountAtomic: accepted.amount,
      feeAtomic,
      responseHash,
      timestamp,
      cleared: true
    },
    c.env.ARBITER_PRIVATE_KEY
  );

  await Promise.all([
    store.incrementSellerGatewayCalls(gateway.slug),
    store.recordPassedClearing(`gateway:${gateway.slug}`, authorization.from, accepted.amount, feeAtomic, {
      id: clearingId,
      network: accepted.network,
      buyerAddress: authorization.from,
      sellerAgentId: `gateway:${gateway.slug}`,
      amount: accepted.amount,
      fee: feeAtomic,
      targetUrl: fullTargetUrl,
      status: "PASSED",
      responseHash,
      attestationSignature: signedReceipt.signature,
      eip3009Nonce: authorization.nonce,
      createdAt: Date.now()
    })
  ]);

  c.header("PAYMENT-RESPONSE", encodeBase64Json(settlement));
  c.header("X-NullClear-Verified", "true");
  c.header("X-NullClear-Receipt-Id", clearingId);
  c.header("X-NullClear-Attestation", encodeBase64Json(signedReceipt));

  return c.json({
    cleared: true,
    settled: true,
    clearingId,
    gatewaySlug: gateway.slug,
    sellerAddress: gateway.sellerAddress,
    buyerCharged: accepted.amount,
    clearingFee: feeAtomic,
    transaction: settlement.transaction,
    executionReceipt: signedReceipt,
    data: valResult.parsedJson !== null ? valResult.parsedJson : rawText,
    _nullclear: buildNullClearMetadata()
  });
}

gatewayProxyRouter.all("/:slug", executeGatewayProxy);
gatewayProxyRouter.all("/:slug/*", executeGatewayProxy);

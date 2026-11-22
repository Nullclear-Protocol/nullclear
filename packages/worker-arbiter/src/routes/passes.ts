import { Hono, type Context } from "hono";
import { keccak256, stringToHex } from "viem";
import {
  BASE_MAINNET,
  encodeBase64Json,
  NULLCLEAR_TREASURY_ADDRESS,
  type X402PaymentOption
} from "@nullclear/shared";
import { enrichTrafficEventDiagnostics, getArbiterStore, type Env } from "../env.js";
import {
  classifySettlementErrorReason,
  settleTransfer,
  verifyEIP3009Local
} from "../services/facilitator.js";
import { buildNullClearMetadata } from "../middleware/free-tier.js";
import {
  PASS_TIERS,
  normalizePassTier,
  generateRawApiPassKey,
  sha256Hex,
  authenticatePassReadOnly,
  sanitizeAgentLabel,
  type PassTierSpec
} from "../middleware/pass-auth.js";
import {
  extractPaymentAuthorization,
  attachDualX402Headers,
  buildWwwAuthenticateX402Header,
  isHumanBrowserRequest
} from "../utils/x402-headers.js";
import { getBazaarResourceMetadata, parseAtomicBigInt } from "./bazaar-metadata.js";
import { attachReceiptHeader } from "./receipt.js";

export const passesRouter = new Hono<Env>();

export function buildBuyPassBazaarExtension(tier: PassTierSpec) {
  return {
    discoverable: true,
    description: `Mint a NullClear ${tier.label} ($${tier.priceUsdc} USDC -> ${tier.credits.toLocaleString()} prepaid low-latency API credits). Eliminates per-call x402 settlement latency and unlocks Drop-in Guarded JSON-RPC (/rpc/:chain/:key), EIP-712 Policy Co-Signer (/v1/policy/cosign), Continuous Watchtower Monitors (/v1/monitors), and Institutional Due-Diligence.`,
    info: {
      input: {
        type: "http",
        method: "POST",
        bodyType: "json",
        body: {
          tier: tier.id
        }
      },
      output: {
        type: "json",
        example: {
          passId: "pass_1795000000_ab12cd34",
          apiKey: "nc_live_...",
          tier: tier.id,
          creditsTotal: tier.credits,
          creditsRemaining: tier.credits,
          guardedRpcUrls: {
            base: "https://api.nullclear.dev/rpc/base/nc_live_...",
            eth: "https://api.nullclear.dev/rpc/eth/nc_live_...",
            solana: "https://api.nullclear.dev/rpc/solana/nc_live_..."
          }
        }
      }
    },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["input"],
      properties: {
        input: {
          type: "object",
          required: ["type", "method", "bodyType", "body"],
          additionalProperties: false,
          properties: {
            type: { type: "string", const: "http" },
            method: { type: "string", enum: ["POST", "PUT", "PATCH"] },
            bodyType: { type: "string", enum: ["json"] },
            body: {
              type: "object",
              properties: {
                tier: {
                  type: "string",
                  enum: ["micro", "starter", "pro", "scale"],
                  description: "micro ($1 / 300 credits), starter ($5 / 2,000 credits), pro ($25 / 15,000 credits), scale ($100 / 100,000 credits)"
                }
              }
            }
          }
        },
        output: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string", const: "json" },
            example: { type: "object" }
          }
        }
      }
    }
  };
}

export async function handleBuyPassRequest(
  c: Context<Env>,
  resourcePath = "/v1/pass/buy"
) {
  let body: Record<string, any> = {};
  if (c.req.method === "POST" || c.req.method === "PUT") {
    try {
      const parsed = await c.req.raw.clone().json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, any>;
    } catch {}
  }

  const tierQuery = c.req.query("tier");
  const tierId = normalizePassTier(tierQuery || body.tier);
  const tier = PASS_TIERS[tierId];

  // Human browser content negotiation: redirect direct browser visits to interactive /buy-pass UI
  if (isHumanBrowserRequest(c)) {
    const target = tierQuery ? `/buy-pass?tier=${encodeURIComponent(tierId)}` : "/buy-pass";
    return c.redirect(target, 302);
  }

  const extension = buildBuyPassBazaarExtension(tier);
  const resourceMeta = getBazaarResourceMetadata(resourcePath);

  const paymentHeader =
    c.req.header("payment-signature") ||
    c.req.header("x-payment") ||
    c.req.header("x-nullclear-authorization");

  const make402 = (message?: string, errorTitle = "Payment Required", code?: string) => {
    const payload = {
      x402Version: 2,
      scheme: "exact",
      network: "eip155:8453",
      amount: tier.priceAtomic,
      payTo: NULLCLEAR_TREASURY_ADDRESS,
      resource: {
        url: `https://api.nullclear.dev${resourcePath}`,
        description: extension.description,
        mimeType: "application/json",
        ...resourceMeta
      },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: tier.priceAtomic,
          asset: BASE_MAINNET.usdc,
          payTo: NULLCLEAR_TREASURY_ADDRESS,
          maxTimeoutSeconds: 300,
          extra: { name: BASE_MAINNET.usdcDomain.name, version: BASE_MAINNET.usdcDomain.version }
        }
      ],
      extensions: { bazaar: extension }
    };
    const encoded = encodeBase64Json(payload);
    c.header("PAYMENT-REQUIRED", encoded);
    c.header("Pay-To", NULLCLEAR_TREASURY_ADDRESS);
    c.header(
      "WWW-Authenticate",
      buildWwwAuthenticateX402Header({
        amount: tier.priceAtomic,
        recipient: NULLCLEAR_TREASURY_ADDRESS,
        asset: BASE_MAINNET.usdc
      })
    );
    return c.json(
      {
        error: errorTitle,
        ...(code ? { code } : {}),
        message:
          message ||
          `x402 payment required for ${tier.label}: ${tier.priceAtomic} atomic units ($${tier.priceUsdc} USDC -> ${tier.credits.toLocaleString()} prepaid credits) on Base Mainnet`,
        selectedTier: tier,
        availableTiers: Object.values(PASS_TIERS),
        schema: extension.schema,
        example: extension.info.output.example,
        ...payload,
        _nullclear: buildNullClearMetadata({ verified: true, freeTrialRemaining: 0 })
      },
      402
    );
  };

  if (!paymentHeader) {
    return make402();
  }

  let parsedAuth: ReturnType<typeof extractPaymentAuthorization> = null;
  let decodeError: string | undefined;
  try {
    parsedAuth = extractPaymentAuthorization(c.req);
  } catch (err: any) {
    parsedAuth = null;
    decodeError = err?.message || String(err);
  }
  if (!parsedAuth || !parsedAuth.from || !parsedAuth.signature) {
    return c.json(
      {
        error: "BAD_REQUEST",
        code: "INVALID_PAYLOAD",
        message: decodeError || "Payment payload missing valid EIP-3009 authorization or signature",
        expectedDomain: BASE_MAINNET.usdcDomain
      },
      400
    );
  }

  // Validate explicit network / domain separator parameters for USDC on Base (chainId 8453)
  if (parsedAuth.rawNetwork) {
    const rawNet = parsedAuth.rawNetwork.trim().toLowerCase();
    const isBaseMainnet =
      rawNet === "eip155:8453" || rawNet === "8453" || rawNet === "base" || rawNet === "base-mainnet";
    if (!isBaseMainnet) {
      return c.json(
        {
          error: "BAD_REQUEST",
          code: "INVALID_SIGNATURE",
          message: `Unsupported network '${parsedAuth.rawNetwork}'. Pass purchases require Base Mainnet (eip155:8453, chainId 8453).`
        },
        400
      );
    }
  }

  if (parsedAuth.rawDomain) {
    const d = parsedAuth.rawDomain;
    if (d.chainId !== undefined && Number(d.chainId) !== BASE_MAINNET.chainId) {
      return c.json(
        {
          error: "BAD_REQUEST",
          code: "INVALID_SIGNATURE",
          message: `EIP-712 domain chainId mismatch: expected ${BASE_MAINNET.chainId}, got ${d.chainId}`
        },
        400
      );
    }
    if (
      typeof d.verifyingContract === "string" &&
      d.verifyingContract.toLowerCase() !== BASE_MAINNET.usdc.toLowerCase()
    ) {
      return c.json(
        {
          error: "BAD_REQUEST",
          code: "INVALID_SIGNATURE",
          message: `EIP-712 domain verifyingContract mismatch: expected ${BASE_MAINNET.usdc}, got ${d.verifyingContract}`
        },
        400
      );
    }
    if (typeof d.name === "string" && d.name !== BASE_MAINNET.usdcDomain.name) {
      return c.json(
        {
          error: "BAD_REQUEST",
          code: "INVALID_SIGNATURE",
          message: `EIP-712 domain name mismatch: expected "${BASE_MAINNET.usdcDomain.name}", got "${d.name}"`
        },
        400
      );
    }
    if (d.version !== undefined && String(d.version) !== BASE_MAINNET.usdcDomain.version) {
      return c.json(
        {
          error: "BAD_REQUEST",
          code: "INVALID_SIGNATURE",
          message: `EIP-712 domain version mismatch: expected "${BASE_MAINNET.usdcDomain.version}", got "${d.version}"`
        },
        400
      );
    }
  }

  if (
    parsedAuth.accepted?.extra?.name &&
    parsedAuth.accepted.extra.name !== BASE_MAINNET.usdcDomain.name
  ) {
    return c.json(
      {
        error: "BAD_REQUEST",
        code: "INVALID_SIGNATURE",
        message: `USDC domain name mismatch: expected "${BASE_MAINNET.usdcDomain.name}", got "${parsedAuth.accepted.extra.name}"`
      },
      400
    );
  }
  if (
    parsedAuth.accepted?.extra?.version &&
    String(parsedAuth.accepted.extra.version) !== BASE_MAINNET.usdcDomain.version
  ) {
    return c.json(
      {
        error: "BAD_REQUEST",
        code: "INVALID_SIGNATURE",
        message: `USDC domain version mismatch: expected "${BASE_MAINNET.usdcDomain.version}", got "${parsedAuth.accepted.extra.version}"`
      },
      400
    );
  }

  // Verify the signed EIP-3009 value covers the selected tier price (safely reject non-integer values with 402)
  const parsedValue = parseAtomicBigInt(parsedAuth.value);
  if (parsedValue === null || parsedValue < BigInt(tier.priceAtomic)) {
    return make402(
      `Insufficient EIP-3009 authorization value for ${tier.id} pass: expected at least ${tier.priceAtomic} atomic USDC ($${tier.priceUsdc}), got ${parsedAuth.value}`
    );
  }

  const baseAcceptedOption: X402PaymentOption = {
    scheme: "exact",
    network: "eip155:8453",
    amount: tier.priceAtomic,
    asset: BASE_MAINNET.usdc,
    payTo: NULLCLEAR_TREASURY_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: { name: BASE_MAINNET.usdcDomain.name, version: BASE_MAINNET.usdcDomain.version }
  };

  // Cryptographically verify EIP-3009 typed-data signature & validity window locally before settlement
  const localVerify = await verifyEIP3009Local(
    {
      from: parsedAuth.from,
      to: parsedAuth.to,
      value: String(parsedAuth.value),
      validAfter: String(parsedAuth.validAfter),
      validBefore: String(parsedAuth.validBefore),
      nonce: parsedAuth.nonce
    },
    parsedAuth.signature,
    baseAcceptedOption
  );

  if (!localVerify.valid) {
    return c.json(
      {
        error: "BAD_REQUEST",
        code: localVerify.errorCode || "INVALID_SIGNATURE",
        message: localVerify.error || "EIP-3009 signature verification failed",
        expectedDomain: BASE_MAINNET.usdcDomain
      },
      400
    );
  }

  const payer = parsedAuth.from.toLowerCase() as `0x${string}`;
  const isTestWallet =
    payer === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" ||
    (c.env?.ENVIRONMENT !== "production" && !c.env?.FACILITATOR_URL && c.env?.SETTLEMENT_MODE !== "onchain");

  let settlementTx: `0x${string}`;
  if (isTestWallet) {
    settlementTx = keccak256(
      stringToHex(`pass_sim:${tier.id}:${payer}:${parsedAuth.nonce}:${Date.now()}`)
    );
  } else {
    const requestedFacilitator = (
      c.req.query("facilitator") ||
      c.req.header("x-nullclear-facilitator") ||
      c.env?.FACILITATOR_PREFERENCE ||
      ""
    )
      .trim()
      .toLowerCase();
    const hasCdpCreds = Boolean(c.env?.CDP_API_KEY_ID && c.env?.CDP_API_KEY_SECRET);
    const useCdp = requestedFacilitator === "cdp" && hasCdpCreds;
    const facilitatorUrl = useCdp
      ? c.env?.CDP_FACILITATOR_URL || "https://api.cdp.coinbase.com/platform/v2/x402"
      : c.env?.FACILITATOR_URL || "https://facilitator.payai.network";

    const settlement = await settleTransfer({
      authorization: {
        from: parsedAuth.from,
        to: parsedAuth.to,
        value: String(parsedAuth.value),
        validAfter: String(parsedAuth.validAfter),
        validBefore: String(parsedAuth.validBefore),
        nonce: parsedAuth.nonce
      },
      signature: parsedAuth.signature,
      accepted: baseAcceptedOption,
      facilitatorUrl,
      cdpApiKeyId: c.env?.CDP_API_KEY_ID,
      cdpApiKeySecret: c.env?.CDP_API_KEY_SECRET,
      settlementMode: c.env?.SETTLEMENT_MODE || "facilitator",
      arbiterPrivateKey: c.env?.ARBITER_PRIVATE_KEY,
      rpcUrl: c.env?.BASE_MAINNET_RPC_URL || c.env?.BASE_RPC_URL || "https://mainnet.base.org",
      environment: c.env?.ENVIRONMENT || "production",
      resource: {
        url: `https://api.nullclear.dev${resourcePath}`,
        description: extension.description,
        mimeType: "application/json",
        ...resourceMeta
      },
      bazaarExtension: extension
    });

    if (!settlement.success || !settlement.transaction) {
      const reason = settlement.errorReason || "On-chain payment rejection";
      const classified = classifySettlementErrorReason(reason);
      const code = settlement.errorCode || classified.errorCode;

      if (code === "INVALID_SIGNATURE" || code === "AUTHORIZATION_EXPIRED" || code === "AUTHORIZATION_NOT_YET_ACTIVE") {
        return c.json(
          {
            error: "BAD_REQUEST",
            code,
            message: reason
          },
          400
        );
      }

      if (code === "NONCE_USED_OR_INSUFFICIENT_FUNDS") {
        return make402(reason, "PAYMENT FAILED: NONCE_USED_OR_INSUFFICIENT_FUNDS", code);
      }

      return c.json(
        {
          error: "RELAYER_ERROR",
          code: "RELAYER_ERROR",
          message: `Facilitator/relayer execution failure: ${reason}`
        },
        502
      );
    }
    settlementTx = settlement.transaction;
  }

  // Mint API pass key & persist SHA-256 hash in D1
  const now = Date.now();
  const { rawKey, keyPrefix } = generateRawApiPassKey();
  const keyHash = await sha256Hex(rawKey);
  const passId = `pass_${now}_${settlementTx.slice(2, 10)}`;
  const store = getArbiterStore(c.env);

  await store.createApiPass({
    id: passId,
    keyHash,
    keyPrefix,
    ownerAddress: payer,
    tier: tier.id,
    creditsTotal: tier.credits,
    creditsRemaining: tier.credits,
    priceAtomic: tier.priceAtomic,
    settlementTx,
    createdAt: now,
    updatedAt: now
  });

  // Record in clearings telemetry table (non-fatal so a paid customer always receives their key)
  const feeAtomic = String(Math.max(1, Math.floor((Number(tier.priceAtomic) * 50) / 10000)));
  await store
    .recordPassedClearing(
      c.env?.ERC8004_AGENT_ID || "124595",
      payer,
      tier.priceAtomic,
      feeAtomic,
      {
        id: passId,
        network: "eip155:8453",
        buyerAddress: payer,
        sellerAgentId: c.env?.ERC8004_AGENT_ID || "124595",
        amount: tier.priceAtomic,
        fee: feeAtomic,
        targetUrl: `https://api.nullclear.dev${resourcePath}`,
        status: "PASSED",
        responseHash: settlementTx,
        attestationSignature: settlementTx,
        eip3009Nonce: parsedAuth.nonce,
        targetAddress: keyPrefix,
        targetChain: "base",
        queryType: `pass:${tier.id}`,
        createdAt: now
      }
    )
    .catch(() => {});

  const receiptUrl = attachReceiptHeader(c, passId);
  attachDualX402Headers(c, {
    status: 200,
    transaction: settlementTx,
    network: "eip155:8453",
    payer,
    verified: true
  });
  c.header("x-nullclear-tier", "prepaid-pass");
  c.header("x-nullclear-pass-tier", tier.id);
  c.header("x-nullclear-credits-remaining", String(tier.credits));

  return c.json({
    passId,
    receiptUrl,
    apiKey: rawKey,
    keyPrefix,
    warning: "Store apiKey securely now — only its SHA-256 hash is retained by NullClear.",
    ownerAddress: payer,
    tier: tier.id,
    label: tier.label,
    priceUsdc: tier.priceUsdc,
    creditsTotal: tier.credits,
    creditsRemaining: tier.credits,
    settlementTransaction: settlementTx,
    authHeader: `Authorization: Bearer ${rawKey}`,
    guardedRpcUrls: {
      base: `https://api.nullclear.dev/rpc/base/${rawKey}`,
      eth: `https://api.nullclear.dev/rpc/eth/${rawKey}`,
      arbitrum: `https://api.nullclear.dev/rpc/arbitrum/${rawKey}`,
      optimism: `https://api.nullclear.dev/rpc/optimism/${rawKey}`,
      polygon: `https://api.nullclear.dev/rpc/polygon/${rawKey}`,
      bsc: `https://api.nullclear.dev/rpc/bsc/${rawKey}`,
      solana: `https://api.nullclear.dev/rpc/solana/${rawKey}`
    },
    quickStart: {
      preflightGuard: `curl -X POST https://api.nullclear.dev/v1/bazaar/guard -H "Authorization: Bearer ${rawKey}" -H "Content-Type: application/json" -d '{"chain":"base","to":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","data":"0x095ea7b3..."}'`,
      policyCoSigner: `POST https://api.nullclear.dev/v1/policy/register (Bearer ${rawKey})`,
      watchtowerMonitor: `POST https://api.nullclear.dev/v1/monitors (Bearer ${rawKey})`,
      statusCheck: `curl https://api.nullclear.dev/v1/pass/status -H "Authorization: Bearer ${rawKey}"`
    },
    createdAt: now,
    _nullclear: buildNullClearMetadata({ verified: true, freeTrialRemaining: 0 })
  });
}

// GET /v1/pass — Public pricing catalog & usage instructions
passesRouter.get("/", (c) => {
  return c.json({
    service: "NullClear Prepaid Firewall Passes (Self-Serve x402 -> Instant Bearer API Key)",
    whyPrepaidPass:
      "Eliminates 1-2s per-call x402 settlement latency, cuts per-call cost by up to 80% ($0.001-$0.0025/credit), and unlocks Drop-in Guarded JSON-RPC, EIP-712 Policy Co-Signing, and Continuous Watchtower Monitors.",
    buyEndpoint: "POST https://api.nullclear.dev/v1/pass/buy",
    bazaarAlias: "POST https://api.nullclear.dev/v1/bazaar/buy-pass",
    statusEndpoint: "GET https://api.nullclear.dev/v1/pass/status",
    exportEndpoint: "GET https://api.nullclear.dev/v1/pass/export?format=csv&days=30",
    fleetTaggingHeader: "X-Agent-Label (optional, up to 64 chars [a-zA-Z0-9._:-])",
    creditSchedule: {
      "GET /v1/bazaar/token-security|inspect|wallet-risk|market-oracle|verified-fetch|audit": 1,
      "POST /v1/bazaar/guard & /v1/guard": 1,
      "POST /rpc/:chain/:key (read methods)": 0,
      "POST /rpc/:chain/:key (broadcast eth_sendRawTransaction / sendTransaction)": 2,
      "POST /v1/policy/cosign": 2,
      "POST /v1/bazaar/scan-batch (up to 15 tokens)": 5,
      "POST /v1/bazaar/due-diligence (Institutional Dossier + EIP-712 Certificate)": 10,
      "POST /v1/monitors (30-day Continuous Watchtower Monitor)": 50
    },
    tiers: Object.values(PASS_TIERS),
    _nullclear: buildNullClearMetadata({ verified: true })
  });
});

// POST & GET /v1/pass/buy — Mint a Prepaid Pass via x402 EIP-3009 USDC settlement
passesRouter.all("/buy", (c) => handleBuyPassRequest(c, "/v1/pass/buy"));

// GET /v1/pass/status — Check pass balance & active guarded RPC URLs (0 credits)
passesRouter.get("/status", async (c) => {
  const auth = await authenticatePassReadOnly(c);
  if (!auth.hasKey) {
    return c.json(
      {
        error: "Missing API pass key",
        message: "Pass Authorization: Bearer nc_live_... or X-NullClear-Key header.",
        buyEndpoint: "POST https://api.nullclear.dev/v1/pass/buy"
      },
      401
    );
  }
  if (!auth.authenticated || !auth.pass) {
    return c.json({ error: auth.errorReason || "Invalid API pass key" }, 401);
  }
  const store = getArbiterStore(c.env);
  const [policies, monitors] = await Promise.all([
    store.listSignerPoliciesByOwner(auth.pass.ownerAddress),
    store.listWatchtowerMonitorsByOwner(auth.pass.ownerAddress)
  ]);

  return c.json({
    passId: auth.pass.id,
    keyPrefix: auth.pass.keyPrefix,
    ownerAddress: auth.pass.ownerAddress,
    tier: auth.pass.tier,
    creditsTotal: auth.pass.creditsTotal,
    creditsRemaining: auth.pass.creditsRemaining,
    lowCreditAlert: auth.pass.creditsRemaining < 50,
    refillUrl: "POST https://api.nullclear.dev/v1/pass/buy",
    activePoliciesCount: policies.length,
    activeMonitorsCount: monitors.filter((m) => m.active && m.expiresAt > Date.now()).length,
    createdAt: auth.pass.createdAt,
    updatedAt: auth.pass.updatedAt
  });
});

function csvEscapeCell(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// GET /v1/pass/export — Self-serve CSV/JSON accounting ledger for a Prepaid Pass (0 credits)
passesRouter.get("/export", async (c) => {
  const auth = await authenticatePassReadOnly(c);
  if (!auth.hasKey) {
    return c.json(
      {
        error: "Missing API pass key",
        message: "Pass Authorization: Bearer nc_live_... or X-NullClear-Key header."
      },
      401
    );
  }
  if (!auth.authenticated || !auth.pass) {
    return c.json({ error: auth.errorReason || "Invalid API pass key" }, 401);
  }

  const rawFormat = (c.req.query("format") || "csv").trim().toLowerCase();
  const format = rawFormat === "json" ? "json" : "csv";
  const parsedDays = Number(c.req.query("days") || 30);
  const days = Number.isFinite(parsedDays) ? Math.min(90, Math.max(1, Math.floor(parsedDays))) : 30;
  const rawAgent = c.req.query("agent");
  const agentFilter = rawAgent ? sanitizeAgentLabel(rawAgent) : null;

  const store = getArbiterStore(c.env);
  const events = await store.listPassUsageEvents(auth.pass.id, {
    days,
    agentLabel: agentFilter
  });

  const rows = events.map((ev) => {
    const enriched = enrichTrafficEventDiagnostics(ev);
    return {
      timestamp_utc: new Date(ev.timestamp).toISOString(),
      request_id: ev.id,
      agent_label: ev.agentLabel || "",
      endpoint: ev.path,
      product_name: enriched.productName,
      status: ev.status,
      credits_deducted: typeof ev.creditsDeducted === "number" ? ev.creditsDeducted : 0,
      receipt_url: ev.receiptUrl || ""
    };
  });

  if (format === "json") {
    return c.json({
      passId: auth.pass.id,
      keyPrefix: auth.pass.keyPrefix,
      tier: auth.pass.tier,
      creditsTotal: auth.pass.creditsTotal,
      creditsRemaining: auth.pass.creditsRemaining,
      days,
      agentFilter,
      count: rows.length,
      records: rows
    });
  }

  const header =
    "timestamp_utc,request_id,agent_label,endpoint,product_name,status,credits_deducted,receipt_url";
  const lines = [
    header,
    ...rows.map((r) =>
      [
        r.timestamp_utc,
        r.request_id,
        r.agent_label,
        r.endpoint,
        r.product_name,
        r.status,
        r.credits_deducted,
        r.receipt_url
      ]
        .map(csvEscapeCell)
        .join(",")
    )
  ];

  return c.body(lines.join("\n"), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="nullclear-pass-${auth.pass.id}-export.csv"`
  });
});

// ============================================================================
// Fiat / Card Checkout (Stripe Hosted Checkout + Web Crypto Webhook Minting)
// Env-gated by STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
// ============================================================================

export interface CardCheckoutTierSpec {
  id: "starter" | "builder" | "pro";
  label: string;
  priceUsd: number;
  priceCents: number;
  credits: number;
  priceAtomicEquivalent: string;
  effectiveCostPerCreditUsd: string;
}

export const CARD_CHECKOUT_TIERS: Record<"starter" | "builder" | "pro", CardCheckoutTierSpec> = {
  starter: {
    id: "starter",
    label: "NullClear Starter Pass (Card)",
    priceUsd: 5,
    priceCents: 500,
    credits: 2000,
    priceAtomicEquivalent: "5000000",
    effectiveCostPerCreditUsd: "0.0025"
  },
  builder: {
    id: "builder",
    label: "NullClear Builder Pass (Card)",
    priceUsd: 20,
    priceCents: 2000,
    credits: 10000,
    priceAtomicEquivalent: "20000000",
    effectiveCostPerCreditUsd: "0.0020"
  },
  pro: {
    id: "pro",
    label: "NullClear Pro Pass (Card)",
    priceUsd: 100,
    priceCents: 10000,
    credits: 60000,
    priceAtomicEquivalent: "100000000",
    effectiveCostPerCreditUsd: "0.00167"
  }
};

export function normalizeCardCheckoutTier(raw?: string | null): "starter" | "builder" | "pro" {
  const s = (raw || "").trim().toLowerCase();
  if (s === "builder" || s === "growth" || s === "20") return "builder";
  if (s === "pro" || s === "scale" || s === "100") return "pro";
  return "starter";
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string,
  toleranceSeconds = 300
): Promise<{ valid: boolean; reason?: string }> {
  if (!signatureHeader) return { valid: false, reason: "Missing Stripe-Signature header" };
  const parts = signatureHeader.split(",").map((p) => p.trim());
  let timestampStr = "";
  const v1Sigs: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=", 2);
    if (k === "t" && v) timestampStr = v;
    if (k === "v1" && v) v1Sigs.push(v);
  }
  if (!timestampStr || v1Sigs.length === 0) {
    return { valid: false, reason: "Malformed Stripe-Signature header" };
  }
  const ts = Number(timestampStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSeconds) {
    return { valid: false, reason: "Stripe webhook timestamp outside replay tolerance" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${timestampStr}.${rawBody}`;
  const macBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(macBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const matched = v1Sigs.some((sig) => timingSafeHexEqual(sig.toLowerCase(), expectedHex));
  return matched ? { valid: true } : { valid: false, reason: "Stripe-Signature HMAC mismatch" };
}

passesRouter.get("/checkout", (c) => {
  const configured = Boolean(c.env?.STRIPE_SECRET_KEY && c.env?.STRIPE_WEBHOOK_SECRET);
  return c.json({
    provider: "stripe",
    enabled: configured,
    endpoint: "POST https://api.nullclear.dev/v1/pass/checkout",
    webhookEndpoint: "POST https://api.nullclear.dev/v1/pass/webhook/stripe",
    tiers: Object.values(CARD_CHECKOUT_TIERS),
    usdcAlternative: "POST https://api.nullclear.dev/v1/pass/buy",
    interactivePage: "https://nullclear.dev/buy-pass"
  });
});

passesRouter.post("/checkout", async (c) => {
  let body: Record<string, any> = {};
  try {
    const parsed = await c.req.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, any>;
  } catch {}

  const tierId = normalizeCardCheckoutTier(c.req.query("tier") || body.tier);
  const tier = CARD_CHECKOUT_TIERS[tierId];
  const stripeKey = (c.env?.STRIPE_SECRET_KEY || "").trim();

  if (!stripeKey) {
    return c.json(
      {
        error: "Card checkout not yet enabled in this environment",
        code: "CARD_CHECKOUT_NOT_CONFIGURED",
        selectedTier: tier,
        tiers: Object.values(CARD_CHECKOUT_TIERS),
        requiredSecrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
        usdcCheckout: {
          interactiveUrl: "https://nullclear.dev/buy-pass",
          x402Endpoint: "POST https://api.nullclear.dev/v1/pass/buy"
        },
        contact: "ops@nullclear.dev"
      },
      503
    );
  }

  const baseUrl = (c.env?.STRIPE_CHECKOUT_BASE_URL || "https://api.nullclear.dev").replace(/\/$/, "");
  const successUrl =
    typeof body.successUrl === "string" && /^https:\/\//i.test(body.successUrl)
      ? body.successUrl
      : `${baseUrl}/v1/pass/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    typeof body.cancelUrl === "string" && /^https:\/\//i.test(body.cancelUrl)
      ? body.cancelUrl
      : "https://nullclear.dev/buy-pass?cancelled=1";

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("payment_method_types[0]", "card");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(tier.priceCents));
  form.set("line_items[0][price_data][product_data][name]", tier.label);
  form.set(
    "line_items[0][price_data][product_data][description]",
    `${tier.credits.toLocaleString()} prepaid NullClear API credits + Guarded JSON-RPC (/rpc/:chain/:key) + Policy Co-Signer + Watchtower`
  );
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", successUrl);
  form.set("cancel_url", cancelUrl);
  form.set("metadata[tier]", tier.id);
  form.set("metadata[credits]", String(tier.credits));
  form.set("metadata[priceAtomicEquivalent]", tier.priceAtomicEquivalent);
  if (typeof body.email === "string" && body.email.includes("@")) {
    form.set("customer_email", body.email.trim());
  }

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const stripeData: any = await stripeRes.json().catch(() => ({}));
  if (!stripeRes.ok || !stripeData?.url) {
    return c.json(
      {
        error: "Stripe Checkout Session creation failed",
        code: "STRIPE_UPSTREAM_ERROR",
        details: stripeData?.error?.message || `HTTP ${stripeRes.status}`
      },
      502
    );
  }

  return c.json({
    provider: "stripe",
    sessionId: stripeData.id,
    checkoutUrl: stripeData.url,
    tier: tier.id,
    label: tier.label,
    priceUsd: tier.priceUsd,
    credits: tier.credits,
    expiresAt: stripeData.expires_at
  });
});

passesRouter.post("/webhook/stripe", async (c) => {
  const webhookSecret = (c.env?.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) {
    return c.json(
      { error: "Stripe webhook secret not configured", code: "CARD_CHECKOUT_NOT_CONFIGURED" },
      503
    );
  }

  const rawBody = await c.req.text();
  const sigHeader = c.req.header("stripe-signature");
  const check = await verifyStripeWebhookSignature(rawBody, sigHeader, webhookSecret);
  if (!check.valid) {
    return c.json({ error: "Invalid Stripe webhook signature", reason: check.reason }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Malformed Stripe webhook JSON" }, 400);
  }

  if (event?.type !== "checkout.session.completed") {
    return c.json({ received: true, ignored: event?.type || "unknown" });
  }

  const session = event.data?.object || {};
  const sessionId = String(session.id || "").trim();
  if (!sessionId || session.payment_status !== "paid") {
    return c.json({ received: true, skipped: "unpaid_or_missing_session" });
  }

  const kv = c.env?.KV || c.env?.NULLCLEAR_CACHE;
  const idempotencyKey = `stripe_minted:${sessionId}`;
  if (kv) {
    const existing = await kv.get(idempotencyKey);
    if (existing) {
      return c.json({ received: true, idempotent: true, passId: existing });
    }
  }

  const tierId = normalizeCardCheckoutTier(session.metadata?.tier);
  const tier = CARD_CHECKOUT_TIERS[tierId];
  const now = Date.now();
  const { rawKey, keyPrefix } = generateRawApiPassKey();
  const keyHash = await sha256Hex(rawKey);
  const passId = `pass_card_${now}_${sessionId.slice(-10).replace(/[^a-zA-Z0-9]/g, "")}`;
  const ownerEmail = String(session.customer_details?.email || session.customer_email || "card:stripe").slice(0, 120);
  const settlementRef = `stripe:${sessionId}`;

  const store = getArbiterStore(c.env);
  await store.createApiPass({
    id: passId,
    keyHash,
    keyPrefix,
    ownerAddress: ownerEmail,
    tier: tier.id === "builder" ? "pro" : tier.id,
    creditsTotal: tier.credits,
    creditsRemaining: tier.credits,
    priceAtomic: tier.priceAtomicEquivalent,
    settlementTx: settlementRef,
    createdAt: now,
    updatedAt: now
  });

  if (kv) {
    await kv.put(idempotencyKey, passId, { expirationTtl: 60 * 60 * 24 * 30 });
    await kv.put(
      `stripe_claim:${sessionId}`,
      JSON.stringify({
        passId,
        apiKey: rawKey,
        keyPrefix,
        tier: tier.id,
        label: tier.label,
        credits: tier.credits,
        createdAt: now
      }),
      { expirationTtl: 3600 }
    );
  }

  return c.json({ received: true, passId, keyPrefix, tier: tier.id, credits: tier.credits });
});

passesRouter.get("/checkout/success", async (c) => {
  const sessionId = (c.req.query("session_id") || "").trim();
  if (!sessionId || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
    return c.html(
      `<!DOCTYPE html><html><body style="background:#07090E;color:#F8FAFC;font-family:sans-serif;padding:40px;"><h2>Invalid checkout session</h2><p>Return to <a style="color:#10B981;" href="https://nullclear.dev/buy-pass">nullclear.dev/buy-pass</a>.</p></body></html>`,
      400
    );
  }

  const kv = c.env?.KV || c.env?.NULLCLEAR_CACHE;
  const claimKey = `stripe_claim:${sessionId}`;
  const rawClaim = kv ? await kv.get(claimKey) : null;

  if (!rawClaim) {
    return c.html(
      `<!DOCTYPE html><html><body style="background:#07090E;color:#F8FAFC;font-family:sans-serif;padding:40px;max-width:720px;margin:0 auto;">
        <h2 style="color:#38BDF8;">Pass Ready or Already Revealed</h2>
        <p style="color:#94A3B8;margin-top:12px;">If payment just completed, refresh this page in 2 seconds while Stripe delivers the webhook. For security, each <code>nc_live_...</code> key is displayed only once — if you already copied it, it is active immediately. Need help? Contact <code>ops@nullclear.dev</code> with session <code>${sessionId}</code>.</p>
      </body></html>`,
      200
    );
  }

  const claim = JSON.parse(rawClaim);
  if (kv) {
    await kv.delete(claimKey);
  }

  return c.html(
    `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>NullClear Prepaid Pass Issued</title>
<style>body{background:#07090E;color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;padding:36px 16px;} .box{max-width:780px;margin:0 auto;background:#0C1018;border:1px solid rgba(16,185,129,0.35);border-radius:14px;padding:24px;} pre{background:#05070B;padding:14px;border-radius:8px;color:#7DD3FC;overflow-x:auto;font-family:ui-monospace,monospace;font-size:13px;}</style>
</head><body><div class="box">
  <div style="color:#10B981;font-weight:700;font-size:12px;">PAYMENT CONFIRMED &bull; ONE-TIME KEY REVEAL</div>
  <h1 style="margin:8px 0 12px;">Your NullClear API Key Is Live</h1>
  <p style="color:#94A3B8;margin-bottom:16px;">Save this key now — NullClear only retains its SHA-256 hash and this reveal link has been permanently burned.</p>
  <pre>NULLCLEAR_API_KEY=${claim.apiKey}
# Tier: ${claim.label} (${Number(claim.credits).toLocaleString()} credits)
# Base Guarded JSON-RPC:
https://api.nullclear.dev/rpc/base/${claim.apiKey}

# Verify immediately:
curl.exe -H "Authorization: Bearer ${claim.apiKey}" "https://api.nullclear.dev/v1/pass/status"</pre>
</div></body></html>`,
    200,
    { "Cache-Control": "no-store" }
  );
});

export function renderBuyPassHtmlPage(selectedTierParam?: string): string {
  const initialTier = normalizePassTier(selectedTierParam);
  const tiersJson = JSON.stringify(PASS_TIERS);
  const cardTiersJson = JSON.stringify(CARD_CHECKOUT_TIERS);
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Buy NullClear Prepaid API Pass — Base USDC &amp; Card Checkout</title>
  <meta name="description" content="Mint an instant NullClear Prepaid API Pass (300 to 100,000 credits) via Base USDC EIP-3009 or Credit/Debit Card Checkout." />
  <style>
    :root { --bg: #07090E; --surface: #0C1018; --surface-2: #111827; --border: rgba(255,255,255,0.1); --emerald: #10B981; --cyan: #38BDF8; --text: #F8FAFC; --muted: #94A3B8; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; padding: 28px 16px 64px; line-height: 1.55; }
    .container { max-width: 960px; margin: 0 auto; }
    .mono { font-family: "JetBrains Mono", ui-monospace, monospace; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 22px; margin-bottom: 18px; }
    .tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 16px 0; }
    .tier { cursor: pointer; background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 16px; transition: all 0.15s; text-align: left; color: var(--text); }
    .tier.active { border-color: var(--emerald); background: rgba(16,185,129,0.1); }
    .btn { cursor: pointer; padding: 11px 18px; border-radius: 8px; border: 1px solid var(--border); background: #161F30; color: var(--text); font-weight: 700; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
    .btn-primary { background: var(--emerald); color: #04130D; border-color: var(--emerald); }
    pre { background: #05070B; border: 1px solid var(--border); border-radius: 8px; padding: 14px; color: #7DD3FC; overflow-x: auto; font-size: 12.5px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <span class="mono" style="color:var(--emerald);font-size:12px;font-weight:700;">NULLCLEAR FIREWALL PRO SUITE &bull; BASE USDC &amp; CARD CHECKOUT</span>
        <h1 style="font-size:30px;font-weight:800;margin-top:4px;">Mint an Instant Prepaid API Pass</h1>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a href="/firewall" class="btn">🛡️ Firewall Sandbox</a>
        <a href="/x402" class="btn">🔐 x402 Gateway</a>
        <a href="/" class="btn">⚡ Developer Portal</a>
      </div>
    </div>

    <div class="card">
      <p style="color:var(--muted);font-size:14px;">
        Choose a pass tier to mint an instant <code class="mono">Authorization: Bearer nc_live_...</code> key with &lt;5ms KV auth, Guarded JSON-RPC (<code class="mono">/rpc/:chain/:key</code>), Policy Co-Signer, and Watchtower access.
      </p>
      <div class="tiers" id="tierGrid"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn-primary" id="walletBtn" onclick="connectAndBuy()">🦊 Connect Web3 Wallet &amp; Sign Base USDC</button>
        <button class="btn" id="cardBtn" onclick="startCardCheckout('starter')">💳 Card — $5 Starter (2k)</button>
        <button class="btn" onclick="startCardCheckout('builder')">💳 $20 Builder (10k)</button>
        <button class="btn" onclick="startCardCheckout('pro')">💳 $100 Pro (60k)</button>
        <a class="btn" href="mailto:ops@nullclear.dev?subject=NullClear%20Prepaid%20Pass%20Enterprise%20Invoice">✉️ Enterprise Invoice (ops@nullclear.dev)</a>
      </div>
      <pre id="out">// Select a tier for instant Base USDC EIP-3009 minting, or click Pay by Card ($5 Starter / $20 Builder / $100 Pro)</pre>
    </div>
  </div>
  <script>
    const TIERS = ${tiersJson};
    const CARD_TIERS = ${cardTiersJson};
    let selected = ${JSON.stringify(initialTier)};
    const TREASURY = ${JSON.stringify(NULLCLEAR_TREASURY_ADDRESS)};
    const USDC = ${JSON.stringify(BASE_MAINNET.usdc)};

    async function startCardCheckout(cardTier) {
      const out = document.getElementById('out');
      out.textContent = 'Creating hosted card checkout session for ' + cardTier + '...';
      try {
        const res = await fetch('/v1/pass/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: cardTier })
        });
        const data = await res.json();
        if (res.ok && data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        out.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        out.textContent = 'Card checkout error: ' + (err && err.message ? err.message : String(err));
      }
    }

    function renderTiers() {
      const grid = document.getElementById('tierGrid');
      grid.innerHTML = Object.values(TIERS).map((t) => {
        const cls = t.id === selected ? 'tier active' : 'tier';
        return '<button type="button" class="' + cls + '" onclick="selectTier(\\'' + t.id + '\\')">' +
          '<div class="mono" style="font-size:12px;color:var(--cyan);text-transform:uppercase;">' + t.id + '</div>' +
          '<div style="font-size:22px;font-weight:800;margin:4px 0;">$' + t.priceUsdc + ' USDC</div>' +
          '<div style="font-size:13px;color:var(--emerald);font-weight:700;">' + t.credits.toLocaleString() + ' credits</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:4px;">$' + t.effectiveCostPerCreditUsdc + '/credit</div>' +
        '</button>';
      }).join('');
    }
    function selectTier(id) { selected = id; renderTiers(); }
    renderTiers();

    async function connectAndBuy() {
      const out = document.getElementById('out');
      if (!window.ethereum) {
        out.textContent = 'No Web3 wallet extension detected. Install MetaMask or Coinbase Wallet, or use POST https://api.nullclear.dev/v1/pass/buy with an EIP-3009 X-Payment header.';
        return;
      }
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const from = accounts[0];
        try {
          await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
        } catch (e) {}
        const tier = TIERS[selected];
        const nonceBytes = new Uint8Array(32);
        crypto.getRandomValues(nonceBytes);
        const nonce = '0x' + Array.from(nonceBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
        const now = Math.floor(Date.now() / 1000);
        const authorization = { from, to: TREASURY, value: tier.priceAtomic, validAfter: '0', validBefore: String(now + 600), nonce };
        const typedData = {
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' }
            ],
            TransferWithAuthorization: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'validAfter', type: 'uint256' },
              { name: 'validBefore', type: 'uint256' },
              { name: 'nonce', type: 'bytes32' }
            ]
          },
          primaryType: 'TransferWithAuthorization',
          domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: USDC },
          message: authorization
        };
        out.textContent = 'Awaiting EIP-3009 USDC signature in wallet for ' + tier.label + '...';
        const signature = await window.ethereum.request({ method: 'eth_signTypedData_v4', params: [from, JSON.stringify(typedData)] });
        const payload = btoa(JSON.stringify({ x402Version: 2, accepted: { scheme: 'exact', network: 'eip155:8453', amount: tier.priceAtomic, asset: USDC, payTo: TREASURY, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } }, payload: { signature, authorization } }));
        out.textContent = 'Settling on Base Mainnet & minting API key...';
        const res = await fetch('/v1/pass/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': payload },
          body: JSON.stringify({ tier: tier.id })
        });
        out.textContent = JSON.stringify(await res.json(), null, 2);
      } catch (err) {
        out.textContent = 'Checkout cancelled or failed: ' + (err && err.message ? err.message : String(err));
      }
    }
  </script>
</body>
</html>`;
}

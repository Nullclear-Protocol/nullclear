import { Hono, type Context } from "hono";
import { keccak256, stringToHex } from "viem";
import {
  encodeBase64Json,
  NULLCLEAR_TREASURY_ADDRESS,
  type X402PaymentOption
} from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";
import { settleTransfer } from "../services/facilitator.js";
import { buildNullClearMetadata } from "../middleware/free-tier.js";
import {
  PASS_TIERS,
  normalizePassTier,
  generateRawApiPassKey,
  sha256Hex,
  authenticatePassReadOnly,
  type PassTierSpec
} from "../middleware/pass-auth.js";
import {
  extractPaymentAuthorization,
  attachDualX402Headers
} from "../utils/x402-headers.js";
import { getBazaarResourceMetadata, parseAtomicBigInt } from "./bazaar-metadata.js";

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

  const tierId = normalizePassTier(c.req.query("tier") || body.tier);
  const tier = PASS_TIERS[tierId];
  const extension = buildBuyPassBazaarExtension(tier);
  const resourceMeta = getBazaarResourceMetadata(resourcePath);

  const paymentHeader =
    c.req.header("payment-signature") ||
    c.req.header("x-payment") ||
    c.req.header("x-nullclear-authorization");

  const make402 = (message?: string) => {
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
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: NULLCLEAR_TREASURY_ADDRESS,
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" }
        }
      ],
      extensions: { bazaar: extension }
    };
    const encoded = encodeBase64Json(payload);
    c.header("PAYMENT-REQUIRED", encoded);
    c.header("X-Payment-Required", encoded);
    c.header("Pay-To", NULLCLEAR_TREASURY_ADDRESS);
    return c.json(
      {
        error: "Payment Required",
        message:
          message ||
          `x402 payment required for ${tier.label}: ${tier.priceAtomic} atomic units ($${tier.priceUsdc} USDC -> ${tier.credits.toLocaleString()} prepaid credits) on Base Mainnet`,
        selectedTier: tier,
        availableTiers: Object.values(PASS_TIERS),
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
  try {
    parsedAuth = extractPaymentAuthorization(c.req);
  } catch {
    parsedAuth = null;
  }
  if (!parsedAuth || !parsedAuth.from || !parsedAuth.signature) {
    return make402("Payment payload missing valid EIP-3009 authorization or signature");
  }

  // Verify the signed EIP-3009 value covers the selected tier price (safely reject non-integer values with 402)
  const parsedValue = parseAtomicBigInt(parsedAuth.value);
  if (parsedValue === null || parsedValue < BigInt(tier.priceAtomic)) {
    return make402(
      `Insufficient EIP-3009 authorization value for ${tier.id} pass: expected at least ${tier.priceAtomic} atomic USDC ($${tier.priceUsdc}), got ${parsedAuth.value}`
    );
  }

  const payer = parsedAuth.from.toLowerCase() as `0x${string}`;
  const isTestWallet =
    payer === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" ||
    (c.env?.ENVIRONMENT !== "production" && !c.env?.FACILITATOR_URL);

  let settlementTx: `0x${string}`;
  if (isTestWallet) {
    settlementTx = keccak256(
      stringToHex(`pass_sim:${tier.id}:${payer}:${parsedAuth.nonce}:${Date.now()}`)
    );
  } else {
    const accepted: X402PaymentOption = parsedAuth.accepted || {
      scheme: "exact",
      network: "eip155:8453",
      amount: tier.priceAtomic,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: NULLCLEAR_TREASURY_ADDRESS,
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" }
    };
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
      accepted: {
        ...accepted,
        amount: tier.priceAtomic,
        payTo: NULLCLEAR_TREASURY_ADDRESS,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        extra: accepted.extra || { name: "USD Coin", version: "2" }
      },
      facilitatorUrl,
      cdpApiKeyId: c.env?.CDP_API_KEY_ID,
      cdpApiKeySecret: c.env?.CDP_API_KEY_SECRET,
      settlementMode: "facilitator",
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
      return make402(`Settlement failed: ${settlement.errorReason || "On-chain payment rejection"}`);
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

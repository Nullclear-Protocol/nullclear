import { Hono, type Context } from "hono";
import { keccak256, stringToHex } from "viem";
import {
  decodeBase64Json,
  encodeBase64Json,
  getChainConfig,
  type X402PaymentSignaturePayload,
  type X402PaymentResponse
} from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";
import { validateTargetUrl } from "../services/ssrf-guard.js";
import { validateUpstreamResponse } from "../services/validator.js";
import { verifyEIP3009Local, settleTransfer, settleOnChain, settleViaFacilitator } from "../services/facilitator.js";
import { signClearingReceipt } from "../services/attestation.js";
import { executeUpstreamFetch } from "./clear.js";
import {
  buildNullClearMetadata,
  consumeSponsoredFreeCall
} from "../middleware/free-tier.js";
import {
  attachDualX402Headers,
  extractPaymentAuthorization
} from "../utils/x402-headers.js";
import { inspectSoftPaywallAndContent } from "../services/soft-paywall-guard.js";
import { getVerifiedKyaHeaderForBuyer } from "../services/kya-verifier.js";

export const proxyRouter = new Hono<Env>();

export interface AutoGuardResult {
  valid: boolean;
  errors: string[];
  parsedJson: unknown | null;
  isJson: boolean;
}

function isSandboxOrBazaarUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return u.pathname.startsWith("/v1/sandbox") || u.pathname.startsWith("/v1/bazaar");
  } catch {
    return urlStr.includes("/v1/sandbox") || urlStr.includes("/v1/bazaar");
  }
}

/**
 * Auto-Guard Mode (Zero Schema Required):
 * Runs HTTP 5xx/non-2xx guard, empty-JSON/null-payload guard, Canonical LLM Refusal Guard,
 * and basic type/structure sanity checks.
 */
export async function runAutoGuard(status: number, rawText: string): Promise<AutoGuardResult> {
  const errors: string[] = [];

  if (status < 200 || status >= 300) {
    errors.push(`Upstream returned non-2xx HTTP status ${status}`);
  }

  const trimmed = (rawText || "").trim();
  if (!trimmed) {
    errors.push("Empty upstream response payload");
    return { valid: false, errors, parsedJson: null, isJson: false };
  }

  if (
    trimmed === "null" ||
    trimmed === "undefined" ||
    trimmed === "{}" ||
    trimmed === "[]"
  ) {
    errors.push(`Null or empty JSON container returned (${trimmed})`);
  }

  let parsedJson: unknown = null;
  let isJson = false;
  try {
    parsedJson = JSON.parse(trimmed);
    isJson = true;
  } catch {
    parsedJson = null;
    isJson = false;
  }

  // Run Canonical LLM Refusal Guard & status validator
  const baseValidation = await validateUpstreamResponse(status, rawText, parsedJson, {
    expectedStatus: [200, 201, 202, 204],
    rejectRefusals: true
  });

  if (!baseValidation.valid) {
    for (const err of baseValidation.errors) {
      if (!errors.includes(err)) {
        errors.push(err);
      }
    }
  }

  // Structure & type sanity checks for JSON responses
  if (isJson) {
    if (parsedJson === null) {
      errors.push("JSON payload evaluated to null");
    } else if (typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
      const obj = parsedJson as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        errors.push("JSON object has 0 keys (empty object)");
      }
      // Check for sentinel corrupted numeric fields (e.g. negative price or NaN strings)
      if (typeof obj.price === "number" && (obj.price <= 0 || Number.isNaN(obj.price))) {
        errors.push(`Sanity check failed: invalid non-positive price value (${obj.price})`);
      }
      if (typeof obj.price === "string" && (obj.price === "NaN" || obj.price.toLowerCase() === "null")) {
        errors.push(`Sanity check failed: corrupted price string (${obj.price})`);
      }
      // Check if object is exclusively an error payload on a 200 OK
      if (
        keys.length <= 2 &&
        typeof obj.error === "string" &&
        obj.error.length > 0 &&
        obj.data === undefined &&
        obj.result === undefined
      ) {
        errors.push(`Upstream returned error object inside 2xx payload: ${obj.error}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    parsedJson,
    isJson
  };
}

/**
 * Extracts normalized target URL from `/https://...` or `/http://...` path
 */
export function extractPrefixTargetUrl(reqUrlStr: string): string | null {
  try {
    const reqUrl = new URL(reqUrlStr);
    // Match pathname starting with /https://, /http://, /https:/, /http:/
    const rawPath = reqUrl.pathname.slice(1); // strip leading '/'
    let normalized = rawPath;
    if (/^https?:\/[^/]/i.test(normalized)) {
      normalized = normalized.replace(/^(https?):\//i, "$1://");
    }
    if (!/^https?:\/\//i.test(normalized)) {
      return null;
    }
    // Re-attach query string if present on outer URL
    const targetWithQuery = reqUrl.search ? `${normalized}${reqUrl.search}` : normalized;
    // Validate URL syntax
    const parsedTarget = new URL(targetWithQuery);
    return parsedTarget.toString();
  } catch {
    return null;
  }
}

export async function handleUrlProxyRequest(c: Context<Env>, explicitTargetUrl?: string): Promise<Response> {
  const store = getArbiterStore(c.env);
  const targetUrl = explicitTargetUrl || extractPrefixTargetUrl(c.req.url);

  if (!targetUrl) {
    return c.json(
      {
        verified: false,
        error: "Invalid or missing target URL for NullClear URL-Prefix Proxy",
        usage: "Prefix any URL with https://api.nullclear.dev/ (e.g. https://api.nullclear.dev/https://api.example.com/v1/data) or call /v1/proxy?url=...",
        _nullclear: buildNullClearMetadata()
      },
      400
    );
  }

  // 1. SSRF & Opt-Out Guard
  const ssrfCheck = validateTargetUrl(targetUrl, c.env.ENVIRONMENT);
  if (!ssrfCheck.allowed) {
    const isOptOut = ssrfCheck.reason?.includes("PUBLISHER_OPT_OUT");
    return c.json(
      {
        verified: false,
        stage: isOptOut ? "PUBLISHER_OPT_OUT" : "SSRF_BLOCKED",
        error: isOptOut ? "Publisher Opt-Out" : (ssrfCheck.reason || "Target URL blocked by SSRF filter"),
        message: isOptOut
          ? "This publisher has opted out of third-party proxy wrapping. Please query the upstream endpoint directly."
          : undefined
      },
      isOptOut ? 403 : 400
    );
  }

  const method = c.req.method || "GET";
  let reqBody: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    try {
      reqBody = await c.req.text();
    } catch {
      reqBody = undefined;
    }
  }

  const paymentHeader =
    c.req.header("PAYMENT-SIGNATURE") ||
    c.req.header("payment-signature") ||
    c.req.header("x-payment") ||
    c.req.header("X-Payment") ||
    c.req.header("x-nullclear-authorization") ||
    c.req.header("X-NullClear-Authorization") ||
    (c.req.header("Authorization")?.match(/^x402\s+(.+)$/i)?.[1]);

  const forwardHeaders: Record<string, string> = {
    Accept: c.req.header("accept") || "application/json, text/plain, */*",
    "User-Agent": "NullClear-AutoGuard-Proxy/1.0 (+https://nullclear.dev)"
  };
  const contentType = c.req.header("content-type");
  if (contentType) {
    forwardHeaders["Content-Type"] = contentType;
  }

  // Case A: Caller passed an EIP-3009 payment header -> Route through NullClear clearing pipeline
  if (paymentHeader && paymentHeader !== "free-trial") {
    const clearingId = `clr_proxy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    let paymentSigPayload: X402PaymentSignaturePayload;
    try {
      const normalized = extractPaymentAuthorization(c.req) || extractPaymentAuthorization(paymentHeader);
      if (!normalized) {
        throw new Error("Missing payload or accepted payment option in signature header");
      }
      paymentSigPayload = normalized.paymentSigPayload;
    } catch (err: any) {
      return c.json(
        {
          cleared: false,
          verified: false,
          stage: "INVALID_PAYMENT_SIGNATURE",
          error: `Failed to decode payment signature header: ${err.message}`
        },
        400
      );
    }

    const { accepted, payload } = paymentSigPayload;
    const { authorization, signature } = payload;

    if (authorization.from.toLowerCase() === authorization.to.toLowerCase()) {
      return c.json(
        {
          cleared: false,
          verified: false,
          error: "SELF_CLEARING_PROHIBITED",
          message: "Buyer and seller wallet addresses cannot be identical."
        },
        400
      );
    }

    const isReplayed = await store.hasUsedNonce(accepted.network, authorization.from, authorization.nonce);
    if (isReplayed) {
      return c.json(
        {
          cleared: false,
          verified: false,
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
          verified: false,
          stage: "INVALID_PAYMENT_SIGNATURE",
          error: sigVerify.error || "EIP-3009 signature verification failed"
        },
        400
      );
    }

    // Hold payment in escrow & probe upstream
    const candidateHeaders: Record<string, string> = {
      ...forwardHeaders,
      "X-NullClear-Verified-Escrow": clearingId,
      "X-NullClear-Amount-Locked": accepted.amount,
      "X-NullClear-Escrow-Hold": "true",
      "X-NullClear-Clearing-Id": clearingId
    };

    // Pre-Flight Corporate KYA Header Forwarding
    const buyerAddrForKya =
      authorization.from ||
      c.req.header("X-Buyer-Address") ||
      c.req.header("x-buyer-address");
    const kyaHeaders = await getVerifiedKyaHeaderForBuyer(c.env, buyerAddrForKya);
    if (kyaHeaders) {
      candidateHeaders["X-NullClear-Verified-KYA"] = kyaHeaders["X-NullClear-Verified-KYA"];
      candidateHeaders["X-NullClear-KYA-Signature"] = kyaHeaders["X-NullClear-KYA-Signature"];
    }

    let probe = await executeUpstreamFetch(targetUrl, method, candidateHeaders, reqBody);
    if (probe.status === 402) {
      candidateHeaders["PAYMENT-SIGNATURE"] = paymentHeader;
      candidateHeaders["X-PAYMENT"] = paymentHeader;
      probe = await executeUpstreamFetch(targetUrl, method, candidateHeaders, reqBody);
    }

    const upstreamRawText = probe.error && probe.status >= 500 ? JSON.stringify({ error: probe.error }) : probe.text;

    // Soft-Paywall, CAPTCHA & Truncated Teaser Guard
    if (!(probe.error && probe.status >= 500)) {
      const softPaywallCheck = inspectSoftPaywallAndContent(
        upstreamRawText,
        probe.contentType || "",
        probe.status
      );
      if (softPaywallCheck.triggered && softPaywallCheck.errorPayload) {
        await store.recordFailedValidation("proxy-upstream", authorization.from, {
          id: clearingId,
          network: accepted.network,
          buyerAddress: authorization.from,
          sellerAgentId: "proxy-upstream",
          amount: accepted.amount,
          fee: "0",
          targetUrl,
          status: "FAILED_VALIDATION",
          errorReason: `${softPaywallCheck.errorPayload.reason}: ${softPaywallCheck.ruleTriggered}`,
          eip3009Nonce: authorization.nonce,
          createdAt: Date.now()
        });

        c.header("X-NullClear-Verified", "false");
        c.header("X-NullClear-Payment-Shredded", "true");
        return c.json(softPaywallCheck.errorPayload, 502);
      }
    }

    const guardResult = await runAutoGuard(probe.status, upstreamRawText);

    if (!guardResult.valid) {
      // Shred payment ($0 charged)
      await store.recordFailedValidation("proxy-upstream", authorization.from, {
        id: clearingId,
        network: accepted.network,
        buyerAddress: authorization.from,
        sellerAgentId: "proxy-upstream",
        amount: accepted.amount,
        fee: "0",
        targetUrl,
        status: probe.status >= 500 ? "FAILED_UPSTREAM" : "FAILED_VALIDATION",
        errorReason: guardResult.errors.join("; "),
        eip3009Nonce: authorization.nonce,
        createdAt: Date.now()
      });

      c.header("X-NullClear-Verified", "false");
      c.header("X-NullClear-Payment-Shredded", "true");
      return c.json(
        {
          cleared: false,
          settled: false,
          verified: false,
          buyerCharged: "0",
          stage: "AUTO_GUARD_FAILED",
          error: "Upstream response failed NullClear Auto-Guard — payment shredded ($0 charged)",
          validationErrors: guardResult.errors,
          _nullclear: buildNullClearMetadata()
        },
        422
      );
    }

    // Auto-Guard passed -> settle payment
    const chainConfig = getChainConfig(accepted.network);
    const isSandbox = isSandboxOrBazaarUrl(targetUrl) && BigInt(accepted.amount) <= 10000n;
    const effectiveMode = isSandbox
      ? "simulated"
      : (c.env.SETTLEMENT_MODE || (c.env.ENVIRONMENT === "production" ? "onchain" : "simulated"));

    let settlement: X402PaymentResponse;
    if (isSandbox || effectiveMode === "simulated") {
      const txHash = keccak256(
        stringToHex(`proxy_clearing:${authorization.from}:${authorization.to}:${authorization.nonce}:${Date.now()}`)
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
          : await settleOnChain(settlementOptions);
    }

    const feeAtomic = ((BigInt(accepted.amount) * 50n) / 10000n).toString();
    const responseHash = keccak256(stringToHex(upstreamRawText));
    const timestamp = Math.floor(Date.now() / 1000);
    const signedReceipt = await signClearingReceipt(
      {
        clearingId,
        buyer: authorization.from,
        sellerAgentId: "proxy-upstream",
        amountAtomic: accepted.amount,
        feeAtomic,
        responseHash,
        timestamp,
        cleared: true
      },
      c.env.ARBITER_PRIVATE_KEY
    );

    await store.recordPassedClearing("proxy-upstream", authorization.from, accepted.amount, feeAtomic, {
      id: clearingId,
      network: accepted.network,
      buyerAddress: authorization.from,
      sellerAgentId: "proxy-upstream",
      amount: accepted.amount,
      fee: feeAtomic,
      targetUrl,
      status: "PASSED",
      responseHash,
      attestationSignature: signedReceipt.signature,
      eip3009Nonce: authorization.nonce,
      createdAt: Date.now()
    });

    const outHeaders = new Headers({
      "Content-Type": guardResult.isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      "X-NullClear-Verified": "true",
      "X-NullClear-Receipt-Id": clearingId,
      "X-NullClear-Attestation": encodeBase64Json(signedReceipt)
    });

    if (settlement.transaction) {
      const paymentRespPayload: X402PaymentResponse = {
        success: true,
        transaction: settlement.transaction,
        network: accepted.network,
        payer: authorization.from
      };
      attachDualX402Headers(outHeaders, { paymentResponse: paymentRespPayload, verified: true });
      attachDualX402Headers(c, { paymentResponse: paymentRespPayload, verified: true });
    }

    c.header("X-NullClear-Verified", "true");
    c.header("X-NullClear-Receipt-Id", clearingId);
    c.header("X-NullClear-Attestation", encodeBase64Json(signedReceipt));

    return new Response(upstreamRawText, {
      status: 200,
      headers: outHeaders
    });
  }

  // Case B: No payment header provided -> Fetch upstream with Auto-Guard (and Sponsored Free Tier for Bazaar/Sandbox)
  const explicitBuyerAddr =
    c.req.header("X-Buyer-Address") || c.req.header("x-buyer-address");
  if (explicitBuyerAddr) {
    const kyaHeaders = await getVerifiedKyaHeaderForBuyer(c.env, explicitBuyerAddr);
    if (kyaHeaders) {
      forwardHeaders["X-NullClear-Verified-KYA"] = kyaHeaders["X-NullClear-Verified-KYA"];
      forwardHeaders["X-NullClear-KYA-Signature"] = kyaHeaders["X-NullClear-KYA-Signature"];
    }
  }

  let probe = await executeUpstreamFetch(targetUrl, method, forwardHeaders, reqBody);
  let freeTierRemaining: number | undefined;

  if (probe.status === 402 && isSandboxOrBazaarUrl(targetUrl)) {
    const freeTier = await consumeSponsoredFreeCall(c);
    if (freeTier.allowed) {
      freeTierRemaining = freeTier.remaining;
      const trialHeaders: Record<string, string> = {
        ...forwardHeaders,
        "X-NullClear-Escrow-Hold": "true",
        "X-NullClear-Verified-Escrow": `proxy_trial_${Date.now()}`
      };
      probe = await executeUpstreamFetch(targetUrl, method, trialHeaders, reqBody);
    }
  }

  if (probe.status === 402) {
    c.header("X-NullClear-Verified", "false");
    c.header("X-NullClear-Hint", "Attach X-Payment or PAYMENT-SIGNATURE header to clear via NullClear Auto-Guard");
    return new Response(probe.text || JSON.stringify({ error: "Payment Required" }), {
      status: 402,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-NullClear-Verified": "false",
        "X-NullClear-Hint": "Attach X-Payment or PAYMENT-SIGNATURE header to clear via NullClear Auto-Guard"
      }
    });
  }

  const upstreamRawText = probe.error && probe.status >= 500 ? JSON.stringify({ error: probe.error }) : probe.text;

  // Soft-Paywall, CAPTCHA & Truncated Teaser Guard
  if (!(probe.error && probe.status >= 500)) {
    const softPaywallCheck = inspectSoftPaywallAndContent(
      upstreamRawText,
      probe.contentType || "",
      probe.status
    );
    if (softPaywallCheck.triggered && softPaywallCheck.errorPayload) {
      c.header("X-NullClear-Verified", "false");
      c.header("X-NullClear-Payment-Shredded", "true");
      return c.json(softPaywallCheck.errorPayload, 502);
    }
  }

  const guardResult = await runAutoGuard(probe.status, upstreamRawText);

  if (!guardResult.valid) {
    c.header("X-NullClear-Verified", "false");
    if (freeTierRemaining !== undefined) {
      c.header("x-nullclear-tier", "free-trial");
      c.header("x-nullclear-remaining-free-calls", String(freeTierRemaining));
    }
    return c.json(
      {
        cleared: false,
        verified: false,
        stage: "AUTO_GUARD_FAILED",
        upstreamStatus: probe.status,
        error: "Upstream response failed NullClear Auto-Guard verification",
        validationErrors: guardResult.errors,
        _nullclear: buildNullClearMetadata(freeTierRemaining)
      },
      422
    );
  }

  const receiptId = `rcpt_proxy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const responseHash = keccak256(stringToHex(upstreamRawText));
  const signedReceipt = await signClearingReceipt(
    {
      clearingId: receiptId,
      buyer: "0x0000000000000000000000000000000000000000",
      sellerAgentId: "auto-guard-proxy",
      amountAtomic: "0",
      feeAtomic: "0",
      responseHash,
      timestamp: Math.floor(Date.now() / 1000),
      cleared: true
    },
    c.env.ARBITER_PRIVATE_KEY
  );

  const responseHeaders: Record<string, string> = {
    "Content-Type": guardResult.isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "X-NullClear-Verified": "true",
    "X-NullClear-Receipt-Id": receiptId,
    "X-NullClear-Attestation": encodeBase64Json(signedReceipt)
  };

  if (freeTierRemaining !== undefined) {
    responseHeaders["x-nullclear-tier"] = "free-trial";
    responseHeaders["x-nullclear-remaining-free-calls"] = String(freeTierRemaining);
  }

  return new Response(upstreamRawText, {
    status: 200,
    headers: responseHeaders
  });
}

proxyRouter.all("/", async (c) => {
  const urlParam = c.req.query("url");
  if (!urlParam && c.req.method === "GET") {
    return c.json({
      service: "NullClear Auto-Guard URL-Prefix Proxy",
      description: "Zero-schema 1-line drop-in URL prefix proxy with Canonical LLM Refusal Guard, HTTP 5xx crash guard, empty-JSON guard, and automatic x402 payment shredding on failure.",
      usage: {
        urlPrefix: "https://api.nullclear.dev/https://api.example.com/v1/data",
        queryParam: "https://api.nullclear.dev/v1/proxy?url=https://api.example.com/v1/data"
      },
      headersReturned: [
        "X-NullClear-Verified: true",
        "X-NullClear-Receipt-Id: rcpt_proxy_...",
        "X-NullClear-Attestation: <base64-signed-receipt>"
      ],
      _nullclear: buildNullClearMetadata()
    });
  }
  return handleUrlProxyRequest(c, urlParam);
});

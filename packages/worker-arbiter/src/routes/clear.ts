import { Hono } from "hono";
import { keccak256, stringToHex } from "viem";
import {
  decodeBase64Json,
  encodeBase64Json,
  getChainConfig,
  type X402PaymentSignaturePayload,
  type X402PaymentResponse
} from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";
import { computeTrustScore } from "../services/reputation.js";
import { verifyEIP3009Local, settleTransfer } from "../services/facilitator.js";
import { validateUpstreamResponse, type ValidationOptions } from "../services/validator.js";
import { signClearingReceipt } from "../services/attestation.js";
import {
  validateTargetUrl,
  MAX_PAYLOAD_BYTES,
  UPSTREAM_TIMEOUT_MS
} from "../services/ssrf-guard.js";

export const clearRouter = new Hono<Env>();

export interface ClearRequestBody {
  targetUrl: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  paymentSignatureHeader: string;
  sellerAgentId?: string;
  minTrustScore?: number;
  twoPhaseRelease?: boolean;
  validation?: ValidationOptions;
}

clearRouter.post("/", async (c) => {
  const store = getArbiterStore(c.env);
  let reqBody: ClearRequestBody;

  try {
    reqBody = await c.req.json<ClearRequestBody>();
  } catch {
    return c.json({ cleared: false, error: "Invalid JSON request body" }, 400);
  }

  const {
    targetUrl,
    method = "GET",
    headers = {},
    body,
    paymentSignatureHeader,
    sellerAgentId,
    minTrustScore = 50,
    twoPhaseRelease = false,
    validation = { expectedStatus: [200] }
  } = reqBody;

  if (!targetUrl || !paymentSignatureHeader) {
    return c.json(
      { cleared: false, error: "targetUrl and paymentSignatureHeader are required parameters" },
      400
    );
  }

  // 1. SSRF Guard
  const ssrfCheck = validateTargetUrl(targetUrl, c.env.ENVIRONMENT);
  if (!ssrfCheck.allowed) {
    return c.json(
      { cleared: false, stage: "SSRF_BLOCKED", error: ssrfCheck.reason },
      400
    );
  }

  // 2. Decode PAYMENT-SIGNATURE payload
  let paymentSigPayload: X402PaymentSignaturePayload;
  try {
    paymentSigPayload = decodeBase64Json<X402PaymentSignaturePayload>(paymentSignatureHeader);
    if (!paymentSigPayload.payload || !paymentSigPayload.accepted) {
      throw new Error("Missing payload or accepted payment option in signature header");
    }
  } catch (err: any) {
    return c.json(
      { cleared: false, stage: "INVALID_PAYMENT_SIGNATURE", error: `Failed to decode signature header: ${err.message}` },
      400
    );
  }

  const { accepted, payload } = paymentSigPayload;
  const { authorization, signature } = payload;
  const chainConfig = getChainConfig(accepted.network);

  // 3. Replay Protection: Check if (network, from, nonce) tuple was already used
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

  // Step 1: Reputation Check (if sellerAgentId provided)
  if (sellerAgentId) {
    const scoreResult = await computeTrustScore(sellerAgentId, chainConfig.chainId, store, {
      arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
      rpcUrl: chainConfig.chainId === 8453 ? (c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL) : c.env.BASE_SEPOLIA_RPC_URL
    });

    if (scoreResult.score < minTrustScore) {
      return c.json(
        {
          cleared: false,
          stage: "REPUTATION_GATE",
          score: scoreResult.score,
          minRequired: minTrustScore,
          reason: "Seller trust score below threshold",
          sybilFlags: scoreResult.sybilFlags
        },
        403
      );
    }
  }

  // Step 2: Cryptographic Pre-Verification of EIP-3009 Signature
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

  // Step 3: Hold Signature in Escrow & Execute Upstream Call
  // Security Enhancement: Strip PAYMENT-SIGNATURE from initial inspection headers to prevent seller signature theft
  const clearingId = `clr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const inspectionHeaders: Record<string, string> = {
    ...headers,
    "X-NullClear-Verified-Escrow": clearingId,
    "X-NullClear-Amount-Locked": accepted.amount,
    "X-NullClear-Escrow-Hold": "true",
    "X-NullClear-Clearing-Id": clearingId
  };

  // Strip signature unless explicitly in two-phase release mode
  if (!twoPhaseRelease) {
    delete inspectionHeaders["PAYMENT-SIGNATURE"];
    delete inspectionHeaders["payment-signature"];
  } else {
    inspectionHeaders["PAYMENT-SIGNATURE"] = paymentSignatureHeader;
  }

  let upstreamStatus = 0;
  let upstreamRawText = "";
  let upstreamJson: unknown = null;
  let upstreamConnectionFailed = false;

  async function executeUpstreamFetch(reqHeaders: Record<string, string>): Promise<{ status: number; text: string; error?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: reqHeaders,
        signal: controller.signal
      };

      if (body !== undefined && method !== "GET") {
        fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
        if (!reqHeaders["Content-Type"]) {
          reqHeaders["Content-Type"] = "application/json";
        }
      }

      const res = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeoutId);

      // Enforce Content-Length payload protection
      const contentLengthHdr = res.headers.get("content-length");
      if (contentLengthHdr && parseInt(contentLengthHdr, 10) > MAX_PAYLOAD_BYTES) {
        return { status: 413, text: "", error: "Payload Too Large: Content-Length exceeds 1 MB limit" };
      }

      const raw = await res.text();
      if (raw.length > MAX_PAYLOAD_BYTES) {
        return { status: 413, text: "", error: "Payload Too Large: response body exceeds 1 MB limit" };
      }

      return { status: res.status, text: raw };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        return { status: 504, text: "", error: `Upstream request timed out after ${UPSTREAM_TIMEOUT_MS}ms` };
      }
      return { status: 502, text: "", error: `Upstream connection failed: ${err.message}` };
    }
  }

  // Initial Probe
  let probe = await executeUpstreamFetch(inspectionHeaders);

  // If upstream returns 402 Payment Required and we held the signature, retry with PAYMENT-SIGNATURE
  if (probe.status === 402 && !twoPhaseRelease) {
    inspectionHeaders["PAYMENT-SIGNATURE"] = paymentSignatureHeader;
    probe = await executeUpstreamFetch(inspectionHeaders);
  }

  if (probe.error && probe.status === 413) {
    return c.json(
      {
        cleared: false,
        settled: false,
        buyerCharged: "0",
        stage: "PAYLOAD_TOO_LARGE",
        error: probe.error
      },
      413
    );
  }

  if (probe.error && probe.status >= 500) {
    upstreamConnectionFailed = true;
    upstreamStatus = probe.status;
    upstreamRawText = JSON.stringify({ error: probe.error });
  } else {
    upstreamStatus = probe.status;
    upstreamRawText = probe.text;
  }

  try {
    upstreamJson = JSON.parse(upstreamRawText);
  } catch {
    upstreamJson = null;
  }

  // Inspect upstream response against validation contract
  const validationResult = upstreamConnectionFailed
    ? { valid: false, errors: [`Upstream call failed: ${probe.error || "Connection error"}`] }
    : await validateUpstreamResponse(upstreamStatus, upstreamRawText, upstreamJson, validation);

  // Step 4A: Upstream Failed or Hallucinated -> VOID SETTLEMENT ($0 spent)
  if (!validationResult.valid) {
    if (sellerAgentId) {
      await store.recordFailedValidation(sellerAgentId, authorization.from, {
        id: clearingId,
        network: accepted.network,
        buyerAddress: authorization.from,
        sellerAgentId,
        amount: accepted.amount,
        fee: "0",
        targetUrl,
        status: upstreamStatus >= 500 ? "FAILED_UPSTREAM" : "FAILED_VALIDATION",
        errorReason: validationResult.errors.join("; "),
        eip3009Nonce: authorization.nonce,
        createdAt: Date.now()
      });
    }

    const voidResponse: X402PaymentResponse = {
      success: false,
      network: accepted.network,
      payer: authorization.from,
      errorReason: "nullclear_schema_validation_failed"
    };

    c.header("PAYMENT-RESPONSE", encodeBase64Json(voidResponse));
    return c.json(
      {
        cleared: false,
        settled: false,
        buyerCharged: "0",
        stage: "SCHEMA_VALIDATION_FAILED",
        upstreamStatus,
        validationErrors: validationResult.errors,
        PaymentResponse: voidResponse
      },
      422
    );
  }

  // Step 4B: Upstream Validated -> SETTLE & ATTEST
  const settlement = await settleTransfer({
    authorization,
    signature,
    accepted,
    facilitatorUrl: c.env.FACILITATOR_URL,
    settlementMode: c.env.SETTLEMENT_MODE || (c.env.ENVIRONMENT === "production" ? "onchain" : "simulated"),
    arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
    rpcUrl: chainConfig.chainId === 8453 ? (c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL) : c.env.BASE_SEPOLIA_RPC_URL,
    environment: c.env.ENVIRONMENT
  });

  if (!settlement.success) {
    return c.json(
      {
        cleared: false,
        settled: false,
        buyerCharged: "0",
        stage: "SETTLEMENT_EXECUTION_FAILED",
        error: settlement.errorReason
      },
      502
    );
  }

  // Calculate 0.50% NullClear clearing fee: (amount * 50) / 10000
  const feeAtomic = ((BigInt(accepted.amount) * 50n) / 10000n).toString();
  const responseHash = keccak256(stringToHex(upstreamRawText));
  const timestamp = Math.floor(Date.now() / 1000);

  // Sign Arbiter Clearing Attestation
  const signedReceipt = await signClearingReceipt(
    {
      clearingId,
      buyer: authorization.from,
      sellerAgentId: sellerAgentId || "anonymous",
      amountAtomic: accepted.amount,
      feeAtomic,
      responseHash,
      timestamp,
      cleared: true
    },
    c.env.ARBITER_PRIVATE_KEY
  );

  // Record passed clearing in storage with EIP-3009 nonce for replay protection
  await store.recordPassedClearing(
    sellerAgentId || "anonymous",
    authorization.from,
    accepted.amount,
    feeAtomic,
    {
      id: clearingId,
      network: accepted.network,
      buyerAddress: authorization.from,
      sellerAgentId: sellerAgentId || "anonymous",
      amount: accepted.amount,
      fee: feeAtomic,
      targetUrl,
      status: "PASSED",
      responseHash,
      attestationSignature: signedReceipt.signature,
      eip3009Nonce: authorization.nonce,
      createdAt: Date.now()
    }
  );

  // Headers
  const paymentResponsePayload: X402PaymentResponse = {
    success: true,
    transaction: settlement.transaction,
    network: accepted.network,
    payer: authorization.from
  };

  c.header("PAYMENT-RESPONSE", encodeBase64Json(paymentResponsePayload));
  c.header("X-NullClear-Attestation", encodeBase64Json(signedReceipt));

  return c.json({
    cleared: true,
    settled: true,
    clearingId,
    buyerCharged: accepted.amount,
    clearingFee: feeAtomic,
    transaction: settlement.transaction,
    attestation: signedReceipt,
    data: upstreamJson !== null ? upstreamJson : upstreamRawText
  });
});

import { Hono } from "hono";
import { keccak256, stringToHex } from "viem";
import {
  decodeBase64Json,
  encodeBase64Json,
  getChainConfig,
  type X402PaymentSignaturePayload,
  type X402PaymentResponse,
  type ClearRequestPayload,
  type FallbackTarget,
  type SpendPolicy,
  type ValidationConfig
} from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";
import { computeTrustScore } from "../services/reputation.js";
import { verifyEIP3009Local, settleTransfer, settleOnChain, settleViaFacilitator } from "../services/facilitator.js";
import { validateUpstreamResponse } from "../services/validator.js";
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
  validation?: ValidationConfig;
  fallbacks?: FallbackTarget[];
  spendPolicy?: SpendPolicy;
}

interface CandidateTarget {
  targetUrl: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  paymentSignatureHeader: string;
  sellerAgentId?: string;
}

async function executeUpstreamFetch(
  targetUrl: string,
  method: string,
  reqHeaders: Record<string, string>,
  body?: unknown
): Promise<{ status: number; text: string; error?: string }> {
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
    validation = { expectedStatus: [200], rejectRefusals: true },
    fallbacks = [],
    spendPolicy
  } = reqBody;

  if (!targetUrl || !paymentSignatureHeader) {
    return c.json(
      { cleared: false, error: "targetUrl and paymentSignatureHeader are required parameters" },
      400
    );
  }

  // Build candidate targets list: primary followed by up to 3 fallback candidates
  const allCandidates: CandidateTarget[] = [
    { targetUrl, method, headers, paymentSignatureHeader, sellerAgentId },
    ...fallbacks.slice(0, 3).map((f) => ({
      targetUrl: f.targetUrl,
      method,
      headers: f.headers || headers,
      paymentSignatureHeader: f.paymentSignatureHeader,
      sellerAgentId: f.sellerAgentId
    }))
  ];

  const failedCandidates: Array<{
    targetUrl: string;
    sellerAgentId?: string;
    stage: string;
    reason: string;
  }> = [];

  let winningCandidate: CandidateTarget | null = null;
  let winningPaymentPayload: X402PaymentSignaturePayload | null = null;
  let winningSettlement: X402PaymentResponse | null = null;
  let winningSettlementRouting = "";
  let winningClearingId = "";
  let winningRawText = "";
  let winningJson: unknown = null;
  let winningFeeAtomic = "0";
  let winningSignedReceipt: any = null;

  for (let i = 0; i < allCandidates.length; i++) {
    const candidate = allCandidates[i];
    const candidateClearingId = `clr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 1. SSRF Guard
    const ssrfCheck = validateTargetUrl(candidate.targetUrl, c.env.ENVIRONMENT);
    if (!ssrfCheck.allowed) {
      if (i === 0 && allCandidates.length === 1) {
        return c.json(
          { cleared: false, stage: "SSRF_BLOCKED", error: ssrfCheck.reason },
          400
        );
      }
      failedCandidates.push({
        targetUrl: candidate.targetUrl,
        sellerAgentId: candidate.sellerAgentId,
        stage: "SSRF_BLOCKED",
        reason: ssrfCheck.reason || "Target URL blocked by SSRF filter"
      });
      continue;
    }

    // 2. Decode PAYMENT-SIGNATURE payload
    let paymentSigPayload: X402PaymentSignaturePayload;
    try {
      paymentSigPayload = decodeBase64Json<X402PaymentSignaturePayload>(candidate.paymentSignatureHeader);
      if (!paymentSigPayload.payload || !paymentSigPayload.accepted) {
        throw new Error("Missing payload or accepted payment option in signature header");
      }
    } catch (err: any) {
      if (i === 0 && allCandidates.length === 1) {
        return c.json(
          { cleared: false, stage: "INVALID_PAYMENT_SIGNATURE", error: `Failed to decode signature header: ${err.message}` },
          400
        );
      }
      failedCandidates.push({
        targetUrl: candidate.targetUrl,
        sellerAgentId: candidate.sellerAgentId,
        stage: "INVALID_PAYMENT_SIGNATURE",
        reason: `Failed to decode signature header: ${err.message}`
      });
      continue;
    }

    const { accepted, payload } = paymentSigPayload;
    const { authorization, signature } = payload;
    const chainConfig = getChainConfig(accepted.network);

    // Guard 1: Self-Clearing / Wash-Loop Rejection (400 Bad Request)
    if (authorization.from.toLowerCase() === authorization.to.toLowerCase()) {
      if (i === 0 && allCandidates.length === 1) {
        return c.json(
          {
            error: "SELF_CLEARING_PROHIBITED",
            message: "Buyer and seller wallet addresses cannot be identical (wash-trading guard)."
          },
          400
        );
      }
      failedCandidates.push({
        targetUrl: candidate.targetUrl,
        sellerAgentId: candidate.sellerAgentId,
        stage: "SELF_CLEARING_PROHIBITED",
        reason: "Buyer and seller wallet addresses cannot be identical (wash-trading guard)."
      });
      continue;
    }

    // Guard 2: Buyer Outbound Spend Firewall
    if (spendPolicy?.maxPerCallAtomic && BigInt(accepted.amount) > BigInt(spendPolicy.maxPerCallAtomic)) {
      return c.json(
        {
          error: "SPEND_LIMIT_EXCEEDED",
          message: "Transaction amount exceeds per-call spend policy limit."
        },
        403
      );
    }

    const utcDate = new Date().toISOString().slice(0, 10);
    const kv = c.env.KV || c.env.NULLCLEAR_CACHE;
    let currentDailySpend = 0n;
    const spendKey = `spend_firewall:${utcDate}:${authorization.from.toLowerCase()}`;
    if (spendPolicy?.maxDailyWalletAtomic && kv) {
      const val = await kv.get(spendKey);
      currentDailySpend = BigInt(val || "0");
      if (currentDailySpend + BigInt(accepted.amount) > BigInt(spendPolicy.maxDailyWalletAtomic)) {
        return c.json(
          {
            error: "DAILY_SPEND_CAP_EXCEEDED",
            message: "Transaction would exceed buyer daily spend cap."
          },
          403
        );
      }
    }

    // 3. Replay Protection
    const isReplayed = await store.hasUsedNonce(accepted.network, authorization.from, authorization.nonce);
    if (isReplayed) {
      if (i === 0 && allCandidates.length === 1) {
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
      failedCandidates.push({
        targetUrl: candidate.targetUrl,
        sellerAgentId: candidate.sellerAgentId,
        stage: "NONCE_REPLAY_DETECTED",
        reason: `Payment nonce ${authorization.nonce} already used`
      });
      continue;
    }

    // Step 1: Reputation Check (if sellerAgentId provided)
    if (candidate.sellerAgentId) {
      const scoreResult = await computeTrustScore(candidate.sellerAgentId, chainConfig.chainId, store, {
        arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
        rpcUrl: chainConfig.chainId === 8453 ? (c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL) : c.env.BASE_SEPOLIA_RPC_URL
      });

      if (scoreResult.score < minTrustScore) {
        if (i === 0 && allCandidates.length === 1) {
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
        failedCandidates.push({
          targetUrl: candidate.targetUrl,
          sellerAgentId: candidate.sellerAgentId,
          stage: "REPUTATION_GATE",
          reason: `Seller trust score ${scoreResult.score} is below required threshold ${minTrustScore}`
        });
        continue;
      }
    }

    // Step 2: Cryptographic Pre-Verification of EIP-3009 Signature
    const sigVerify = await verifyEIP3009Local(authorization, signature, accepted);
    if (!sigVerify.valid) {
      if (i === 0 && allCandidates.length === 1) {
        return c.json(
          {
            cleared: false,
            stage: "INVALID_PAYMENT_SIGNATURE",
            error: sigVerify.error || "EIP-3009 signature verification failed"
          },
          400
        );
      }
      failedCandidates.push({
        targetUrl: candidate.targetUrl,
        sellerAgentId: candidate.sellerAgentId,
        stage: "INVALID_PAYMENT_SIGNATURE",
        reason: sigVerify.error || "EIP-3009 signature verification failed"
      });
      continue;
    }

    // Step 3: Hold Signature in Escrow & Execute Upstream Call
    const candidateHeaders: Record<string, string> = {
      ...(candidate.headers || headers),
      "X-NullClear-Verified-Escrow": candidateClearingId,
      "X-NullClear-Amount-Locked": accepted.amount,
      "X-NullClear-Escrow-Hold": "true",
      "X-NullClear-Clearing-Id": candidateClearingId
    };

    if (!twoPhaseRelease) {
      delete candidateHeaders["PAYMENT-SIGNATURE"];
      delete candidateHeaders["payment-signature"];
    } else {
      candidateHeaders["PAYMENT-SIGNATURE"] = candidate.paymentSignatureHeader;
    }

    let probe = await executeUpstreamFetch(
      candidate.targetUrl,
      candidate.method || method,
      candidateHeaders,
      body
    );

    // If upstream returns 402 Payment Required and we held signature, retry with signature attached
    if (probe.status === 402 && !twoPhaseRelease) {
      candidateHeaders["PAYMENT-SIGNATURE"] = candidate.paymentSignatureHeader;
      probe = await executeUpstreamFetch(
        candidate.targetUrl,
        candidate.method || method,
        candidateHeaders,
        body
      );
    }

    if (probe.error && probe.status === 413) {
      if (i === 0 && allCandidates.length === 1) {
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
      failedCandidates.push({
        targetUrl: candidate.targetUrl,
        sellerAgentId: candidate.sellerAgentId,
        stage: "PAYLOAD_TOO_LARGE",
        reason: probe.error
      });
      continue;
    }

    const upstreamConnectionFailed = probe.error !== undefined && probe.status >= 500;
    const upstreamStatus = probe.status;
    const upstreamRawText = upstreamConnectionFailed ? JSON.stringify({ error: probe.error }) : probe.text;

    let upstreamJson: unknown = null;
    try {
      upstreamJson = JSON.parse(upstreamRawText);
    } catch {
      upstreamJson = null;
    }

    // Inspect upstream response against validation contract (Schema + Invariants + Refusals)
    const validationResult = upstreamConnectionFailed
      ? { valid: false, errors: [`Upstream call failed: ${probe.error || "Connection error"}`] }
      : await validateUpstreamResponse(upstreamStatus, upstreamRawText, upstreamJson, validation);

    if (!validationResult.valid) {
      // Record failed validation against candidate seller in storage
      if (candidate.sellerAgentId) {
        await store.recordFailedValidation(candidate.sellerAgentId, authorization.from, {
          id: candidateClearingId,
          network: accepted.network,
          buyerAddress: authorization.from,
          sellerAgentId: candidate.sellerAgentId,
          amount: accepted.amount,
          fee: "0",
          targetUrl: candidate.targetUrl,
          status: upstreamStatus >= 500 ? "FAILED_UPSTREAM" : "FAILED_VALIDATION",
          errorReason: validationResult.errors.join("; "),
          eip3009Nonce: authorization.nonce,
          createdAt: Date.now()
        });
      }

      failedCandidates.push({
        targetUrl: candidate.targetUrl,
        sellerAgentId: candidate.sellerAgentId,
        stage: upstreamStatus >= 500 ? "FAILED_UPSTREAM" : "SCHEMA_VALIDATION_FAILED",
        reason: validationResult.errors.join("; ")
      });
      // Signature discarded ($0 spent). Proceed to next failover candidate!
      continue;
    }

    // Step 4B: Candidate Validated -> SETTLE WINNING CANDIDATE
    const defaultMode = c.env.SETTLEMENT_MODE || (c.env.ENVIRONMENT === "production" ? "onchain" : "simulated");
    let effectiveMode: "onchain" | "facilitator" | "simulated" = defaultMode;
    let settlementRouting = defaultMode === "onchain" ? "onchain_sponsored" : defaultMode;

    if (defaultMode === "onchain") {
      const minOnchainAtomic = BigInt(c.env.MIN_ONCHAIN_ATOMIC || "5000");
      const amountAtomic = BigInt(accepted.amount);

      // Guard 3: Minimum Value Floor for On-Chain Gas Sponsorship ($0.005 USDC / 5000 atomic units)
      if (amountAtomic < minOnchainAtomic) {
        effectiveMode = "facilitator";
        settlementRouting = "micro_tier_offchain_guarded";
      } else {
        // Guard 4: Per-Wallet & Per-IP Daily On-Chain Gas Cap (50 / UTC day)
        if (kv) {
          const clientIp =
            c.req.header("cf-connecting-ip") ||
            c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
            "127.0.0.1";
          const maxDaily = Number(c.env.MAX_DAILY_ONCHAIN_PER_WALLET || "50");

          const walletKey = `gas_cap:wallet:${utcDate}:${authorization.from.toLowerCase()}`;
          const ipKey = `gas_cap:ip:${utcDate}:${clientIp}`;

          const [walletCountStr, ipCountStr] = await Promise.all([
            kv.get(walletKey),
            kv.get(ipKey)
          ]);

          const walletCount = Number(walletCountStr || 0);
          const ipCount = Number(ipCountStr || 0);

          if (walletCount >= maxDaily || ipCount >= maxDaily) {
            effectiveMode = "facilitator";
            settlementRouting = "facilitator_daily_cap_fallback";
          } else {
            await Promise.all([
              kv.put(walletKey, String(walletCount + 1), { expirationTtl: 86400 }),
              kv.put(ipKey, String(ipCount + 1), { expirationTtl: 86400 })
            ]);
            settlementRouting = "onchain_sponsored";
          }
        } else {
          settlementRouting = "onchain_sponsored";
        }
      }
    }

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

    const settlement =
      effectiveMode === "facilitator"
        ? await settleViaFacilitator(settlementOptions)
        : (effectiveMode === "onchain"
            ? await settleOnChain(settlementOptions)
            : await settleTransfer(settlementOptions));

    if (!settlement.success) {
      failedCandidates.push({
        targetUrl: candidate.targetUrl,
        sellerAgentId: candidate.sellerAgentId,
        stage: "SETTLEMENT_EXECUTION_FAILED",
        reason: settlement.errorReason || "Settlement execution failed"
      });
      continue;
    }

    // Update cumulative spend in firewall KV
    if (spendPolicy?.maxDailyWalletAtomic && kv) {
      await kv.put(spendKey, String(currentDailySpend + BigInt(accepted.amount)), { expirationTtl: 86400 });
    }

    // 0.50% NullClear clearing fee: (amount * 50) / 10000
    const feeAtomic = ((BigInt(accepted.amount) * 50n) / 10000n).toString();
    const responseHash = keccak256(stringToHex(upstreamRawText));
    const timestamp = Math.floor(Date.now() / 1000);

    // Sign Arbiter Clearing Attestation
    const signedReceipt = await signClearingReceipt(
      {
        clearingId: candidateClearingId,
        buyer: authorization.from,
        sellerAgentId: candidate.sellerAgentId || "anonymous",
        amountAtomic: accepted.amount,
        feeAtomic,
        responseHash,
        timestamp,
        cleared: true
      },
      c.env.ARBITER_PRIVATE_KEY
    );

    await store.recordPassedClearing(
      candidate.sellerAgentId || "anonymous",
      authorization.from,
      accepted.amount,
      feeAtomic,
      {
        id: candidateClearingId,
        network: accepted.network,
        buyerAddress: authorization.from,
        sellerAgentId: candidate.sellerAgentId || "anonymous",
        amount: accepted.amount,
        fee: feeAtomic,
        targetUrl: candidate.targetUrl,
        status: "PASSED",
        responseHash,
        attestationSignature: signedReceipt.signature,
        eip3009Nonce: authorization.nonce,
        createdAt: Date.now()
      }
    );

    winningCandidate = candidate;
    winningPaymentPayload = paymentSigPayload;
    winningSettlement = settlement;
    winningSettlementRouting = settlementRouting;
    winningClearingId = candidateClearingId;
    winningRawText = upstreamRawText;
    winningJson = upstreamJson;
    winningFeeAtomic = feeAtomic;
    winningSignedReceipt = signedReceipt;
    break;
  }

  // If a candidate passed and settled successfully:
  if (winningCandidate && winningPaymentPayload && winningSettlement) {
    const paymentResponsePayload: X402PaymentResponse = {
      success: true,
      transaction: winningSettlement.transaction,
      network: winningPaymentPayload.accepted.network,
      payer: winningPaymentPayload.payload.authorization.from
    };

    c.header("PAYMENT-RESPONSE", encodeBase64Json(paymentResponsePayload));
    c.header("X-NullClear-Attestation", encodeBase64Json(winningSignedReceipt));

    return c.json({
      cleared: true,
      settled: true,
      clearingId: winningClearingId,
      buyerCharged: winningPaymentPayload.accepted.amount,
      clearingFee: winningFeeAtomic,
      settlementRouting: winningSettlementRouting,
      transaction: winningSettlement.transaction,
      attestation: winningSignedReceipt,
      data: winningJson !== null ? winningJson : winningRawText,
      failoverAttempts: failedCandidates.length,
      winningSellerAgentId: winningCandidate.sellerAgentId || "anonymous",
      failedCandidates
    });
  }

  // All candidates failed: VOID SETTLEMENT ($0 spent)
  const primaryFailed = failedCandidates[0];
  const stage = allCandidates.length === 1 && primaryFailed
    ? primaryFailed.stage
    : "ALL_CANDIDATES_FAILED";

  const voidResponse: X402PaymentResponse = {
    success: false,
    network: "eip155:8453",
    payer: "0x0000000000000000000000000000000000000000",
    errorReason: "nullclear_schema_validation_failed"
  };

  c.header("PAYMENT-RESPONSE", encodeBase64Json(voidResponse));
  return c.json(
    {
      cleared: false,
      settled: false,
      buyerCharged: "0",
      stage,
      failoverAttempts: failedCandidates.length,
      failedCandidates,
      error: "All clearing candidates failed validation or upstream execution",
      validationErrors: failedCandidates.flatMap((f) => f.reason.split("; "))
    },
    422
  );
});

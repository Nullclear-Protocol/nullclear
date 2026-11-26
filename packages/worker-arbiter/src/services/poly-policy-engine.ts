import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  DEFAULT_NULLCLEAR_BUILDER_FEE_PCT,
  POLYMARKET_CHAIN_ID,
  evaluatePolymarketPolicy,
  normalizeBuilderCodeBytes32,
  type PolymarketCandidateOrder,
  type PolymarketPolicyConfig,
  type PolymarketPolicyEvaluationResult
} from "@nullclear/shared";
import type { Env } from "../env.js";
import {
  buildLiveGuardedClobV2OrderBundle,
  fetchClobOrderBook
} from "./poly-api.js";
import {
  getPolyStore,
  type PaperPositionRecord,
  type PaperTradeRecord,
  type PolicyReceiptRecord
} from "./poly-store.js";

const FALLBACK_DEV_ARBITER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

export const POLY_POLICY_EIP712_TYPES = {
  PolymarketPolicyApproval: [
    { name: "receiptId", type: "string" },
    { name: "policyId", type: "string" },
    { name: "assetId", type: "string" },
    { name: "side", type: "string" },
    { name: "orderSizeMicroUsd", type: "uint256" },
    { name: "limitPriceBps", type: "uint256" },
    { name: "builderCode", type: "bytes32" },
    { name: "validUntil", type: "uint256" }
  ]
} as const;

function getArbiterAccount(privateKey?: string) {
  const key = (
    privateKey && privateKey.startsWith("0x") && privateKey.length === 66
      ? privateKey
      : FALLBACK_DEV_ARBITER_KEY
  ) as `0x${string}`;
  return privateKeyToAccount(key);
}

export interface ExecuteGuardedOrderInput {
  userId: string;
  mode?: "paper" | "live";
  walletAddress?: `0x${string}` | null;
  sessionSigner?: `0x${string}` | null;
  useDepositWallet1271?: boolean;
  assetId: string;
  marketTitle: string;
  category: string;
  side: "BUY" | "SELL";
  orderSizeUsd: number;
  triggerPrice: number;
  liveBookAsk?: number | null;
  tickSize?: number | string | null;
  postOnly?: boolean;
  whaleAddress?: string | null;
  clobOrderId?: string | null;
  polygonTxHash?: string | null;
  policyOverride?: Partial<PolymarketPolicyConfig>;
  accountStateOverride?: {
    rolling24hSpendUsd?: number;
    dailyRealizedAndMtmLossUsd?: number;
  };
  skipLiveBookFetch?: boolean;
}

export interface ExecuteGuardedOrderResult {
  verdict: "ALLOWED" | "BLOCKED";
  receipt: PolicyReceiptRecord;
  receiptUrl: string;
  evaluation: PolymarketPolicyEvaluationResult;
  paperTrade?: PaperTradeRecord;
  liveOrderBundle?: ReturnType<typeof buildLiveGuardedClobV2OrderBundle>;
  eip712Approval?: {
    coSignerAddress: string;
    signature: string;
    domain: { name: string; version: string; chainId: number };
    message: Record<string, string>;
  };
}

/**
 * Core NullClear Polymarket Policy Guard & Execution Engine.
 * Evaluates every Paper or Live order against user-defined guardrails, signs an EIP-712
 * PolymarketPolicyApproval attestation when ALLOWED, persists a public Policy Receipt in D1,
 * and records simulated fills/positions in Paper Mode.
 *
 * ZERO-CUSTODY INVARIANT: Never accepts, stores, or logs any user private key.
 */
export async function executeGuardedPolymarketOrder(
  input: ExecuteGuardedOrderInput,
  env?: Env["Bindings"]
): Promise<ExecuteGuardedOrderResult> {
  const store = getPolyStore(env);
  const storedPolicy = await store.getPolicyByUser(input.userId);
  const effectivePolicy: PolymarketPolicyConfig = {
    ...storedPolicy,
    ...(input.policyOverride || {}),
    mode: input.mode || input.policyOverride?.mode || storedPolicy.mode || "paper"
  };

  // Resolve live CLOB order book if liveBookAsk or tickSize not supplied
  let liveBookAsk =
    typeof input.liveBookAsk === "number" && input.liveBookAsk > 0 && input.liveBookAsk < 1
      ? input.liveBookAsk
      : null;
  let tickSize: number | string = input.tickSize ?? 0.005;
  let liveApiFeeRate: number | null = null;

  if (liveBookAsk === null && !input.skipLiveBookFetch) {
    const book = await fetchClobOrderBook(input.assetId, env, input.triggerPrice);
    liveBookAsk = input.side === "SELL" ? book.bestBid : book.bestAsk;
    tickSize = input.tickSize ?? book.tickSize;
    liveApiFeeRate = book.liveFeeRate ?? null;
  }
  if (liveBookAsk === null) {
    liveBookAsk = Math.min(0.99, Math.max(0.01, input.triggerPrice));
  }

  const metrics = await store.getPaperAccountMetrics(input.userId);
  const accountState = {
    rolling24hSpendUsd:
      input.accountStateOverride?.rolling24hSpendUsd ?? metrics.rolling24hSpendUsd,
    dailyRealizedAndMtmLossUsd:
      input.accountStateOverride?.dailyRealizedAndMtmLossUsd ?? metrics.dailyRealizedAndMtmLossUsd
  };

  const candidate: PolymarketCandidateOrder = {
    assetId: input.assetId,
    marketTitle: input.marketTitle,
    category: input.category,
    side: input.side,
    orderSizeUsd: input.orderSizeUsd,
    triggerPrice: input.triggerPrice,
    liveBookAsk,
    tickSize,
    postOnly: Boolean(input.postOnly),
    whaleAddress: input.whaleAddress ?? null,
    liveApiFeeRate,
    builderFeePct: effectivePolicy.mode === "live" ? DEFAULT_NULLCLEAR_BUILDER_FEE_PCT * 100 : 0
  };

  const evaluation = evaluatePolymarketPolicy(effectivePolicy, candidate, accountState);
  const now = Date.now();
  const randSuffix = keccak256(
    stringToHex(`${input.userId}:${input.assetId}:${now}:${Math.random()}`)
  ).slice(2, 10);
  const receiptId = `poly_rcpt_${now}_${randSuffix}`;
  const builderCode = normalizeBuilderCodeBytes32(env?.NULLCLEAR_BUILDER_CODE);
  const account = getArbiterAccount(env?.ARBITER_PRIVATE_KEY);

  let cosignerSignature: string | null = null;
  let eip712Approval: ExecuteGuardedOrderResult["eip712Approval"];

  if (evaluation.verdict === "ALLOWED") {
    const validUntil = Math.floor(now / 1000) + 300;
    const domain = {
      name: "NullClearPolymarketPolicyCoSigner",
      version: "2",
      chainId: POLYMARKET_CHAIN_ID
    } as const;
    const orderSizeMicroUsd = BigInt(Math.max(0, Math.round(input.orderSizeUsd * 1_000_000)));
    const limitPriceBps = BigInt(Math.max(1, Math.round(evaluation.flooredLimitPrice * 10_000)));

    cosignerSignature = await account.signTypedData({
      domain,
      types: POLY_POLICY_EIP712_TYPES,
      primaryType: "PolymarketPolicyApproval",
      message: {
        receiptId,
        policyId: effectivePolicy.id || "default",
        assetId: input.assetId,
        side: input.side,
        orderSizeMicroUsd,
        limitPriceBps,
        builderCode,
        validUntil: BigInt(validUntil)
      }
    });

    eip712Approval = {
      coSignerAddress: account.address,
      signature: cosignerSignature,
      domain: { ...domain },
      message: {
        receiptId,
        policyId: effectivePolicy.id || "default",
        assetId: input.assetId,
        side: input.side,
        orderSizeMicroUsd: orderSizeMicroUsd.toString(),
        limitPriceBps: limitPriceBps.toString(),
        builderCode,
        validUntil: String(validUntil)
      }
    };
  }

  const receipt: PolicyReceiptRecord = {
    id: receiptId,
    userId: input.userId,
    policyId: effectivePolicy.id || null,
    mode: effectivePolicy.mode,
    walletAddress: input.walletAddress || effectivePolicy.walletAddress || null,
    whaleAddress: input.whaleAddress ? input.whaleAddress.toLowerCase() : null,
    assetId: input.assetId,
    marketTitle: input.marketTitle,
    category: evaluation.category,
    side: input.side,
    orderSizeUsd: Number(input.orderSizeUsd.toFixed(2)),
    triggerPrice: Number(input.triggerPrice.toFixed(4)),
    liveBookAsk: Number(liveBookAsk.toFixed(4)),
    executionPrice: evaluation.executionPrice,
    computedFeeUsd: evaluation.polymarketFeeUsd,
    computedFeeDragPct: evaluation.combinedFeeDragPct,
    slippageCents: evaluation.slippageCents,
    verdict: evaluation.verdict,
    rejectionCode: evaluation.primaryRejectionCode,
    rulesEvaluated: evaluation.checks,
    policySnapshot: effectivePolicy,
    clobOrderId: input.clobOrderId || null,
    polygonTxHash: input.polygonTxHash || null,
    builderCode,
    cosignerAddress: account.address,
    cosignerSignature,
    createdAt: now
  };

  await store.savePolicyReceipt(receipt);
  const receiptUrl = `https://nullclear.dev/receipt/${encodeURIComponent(receiptId)}`;

  // Paper Mode trade + position accounting
  let paperTrade: PaperTradeRecord | undefined;
  if (effectivePolicy.mode === "paper") {
    paperTrade = {
      id: `pt_${now}_${randSuffix}`,
      userId: input.userId,
      policyId: effectivePolicy.id || null,
      receiptId,
      whaleAddress: receipt.whaleAddress,
      assetId: input.assetId,
      marketTitle: input.marketTitle,
      category: evaluation.category,
      side: input.side,
      postOnly: Boolean(input.postOnly),
      triggerPrice: receipt.triggerPrice,
      fillPrice: evaluation.executionPrice,
      shares: evaluation.verdict === "ALLOWED" ? evaluation.shares : 0,
      notionalUsd: receipt.orderSizeUsd,
      feeUsd: evaluation.verdict === "ALLOWED" ? evaluation.polymarketFeeUsd : 0,
      slippageCents: evaluation.slippageCents,
      status: evaluation.verdict === "ALLOWED" ? "FILLED" : "BLOCKED",
      rejectionReason: evaluation.primaryRejectionCode,
      createdAt: now
    };
    await store.savePaperTrade(paperTrade);

    if (evaluation.verdict === "ALLOWED") {
      const existingPositions = await store.listPaperPositions(input.userId);
      const prev = existingPositions.find((p) => p.assetId === input.assetId);
      const nextShares =
        input.side === "BUY"
          ? (prev?.shares || 0) + evaluation.shares
          : Math.max(0, (prev?.shares || 0) - evaluation.shares);
      const nextCostBasis =
        input.side === "BUY"
          ? (prev?.costBasisUsd || 0) + input.orderSizeUsd
          : Math.max(0, (prev?.costBasisUsd || 0) - input.orderSizeUsd);
      const avgEntry = nextShares > 0 ? nextCostBasis / nextShares : evaluation.executionPrice;
      const markPrice = liveBookAsk;
      const unrealizedPnlUsd = Number(
        (nextShares * (markPrice - avgEntry)).toFixed(2)
      );

      const pos: PaperPositionRecord = {
        id: prev?.id || `pos_${input.userId.slice(0, 16)}_${input.assetId.slice(0, 18)}`,
        userId: input.userId,
        assetId: input.assetId,
        marketTitle: input.marketTitle,
        category: evaluation.category,
        side: input.side,
        shares: Number(nextShares.toFixed(4)),
        avgEntryPrice: Number(avgEntry.toFixed(4)),
        costBasisUsd: Number(nextCostBasis.toFixed(2)),
        markPrice: Number(markPrice.toFixed(4)),
        unrealizedPnlUsd,
        realizedPnlUsd: prev?.realizedPnlUsd || 0,
        updatedAt: now
      };
      await store.upsertPaperPosition(pos);
    }
  }

  // Live Non-Custodial Mode bundle (never holds private key, embeds NULLCLEAR_BUILDER_CODE in CLOB V2 struct)
  let liveOrderBundle: ReturnType<typeof buildLiveGuardedClobV2OrderBundle> | undefined;
  if (effectivePolicy.mode === "live" && evaluation.verdict === "ALLOWED") {
    const makerWallet =
      input.walletAddress ||
      (effectivePolicy.walletAddress as `0x${string}` | null) ||
      "0x0000000000000000000000000000000000000000";
    liveOrderBundle = buildLiveGuardedClobV2OrderBundle({
      makerWallet,
      sessionSigner: input.sessionSigner || undefined,
      assetId: input.assetId,
      side: input.side,
      rawPrice: evaluation.flooredLimitPrice,
      tickSize,
      sizeUsd: input.orderSizeUsd,
      postOnly: Boolean(input.postOnly),
      useDepositWallet1271: input.useDepositWallet1271,
      env
    });
  }

  return {
    verdict: evaluation.verdict,
    receipt,
    receiptUrl,
    evaluation,
    paperTrade,
    liveOrderBundle,
    eip712Approval
  };
}

import { z } from "zod";
import { NULLCLEAR_TREASURY_ADDRESS } from "./chains.js";
import { InvariantRuleSchema, type InvariantRule } from "./schemas.js";
import type { X402PaymentSignaturePayload } from "./x402-types.js";

/**
 * Hardcoded SafePay Protocol Constants
 */
export const SAFEPAY_TREASURY_ADDRESS = NULLCLEAR_TREASURY_ADDRESS;
export const SAFEPAY_MIN_FEE_ATOMIC = 500_000n; // $0.50 USDC minimum fee floor (6 decimals)
export const SAFEPAY_DEFAULT_FEE_BPS = 100n; // 1.00% (100 bps)
export const SAFEPAY_WHALE_THRESHOLD_ATOMIC = 10_000_000_000n; // $10,000 USDC
export const SAFEPAY_WHALE_FEE_BPS = 75n; // 0.75% (75 bps) for deals > $10,000 USDC

export const SafePayFeePayerSchema = z.enum(["buyer", "seller", "split"]);
export type SafePayFeePayer = z.infer<typeof SafePayFeePayerSchema>;

export const SafePayCreatorRoleSchema = z.enum(["buyer", "seller"]);
export type SafePayCreatorRole = z.infer<typeof SafePayCreatorRoleSchema>;

export const SafePayVerificationModeSchema = z.enum([
  "DATASET_SCHEMA",
  "FILE_ARCHIVE",
  "LIVE_API",
  "OPTIMISTIC_PREVIEW"
]);
export type SafePayVerificationMode = z.infer<typeof SafePayVerificationModeSchema>;

export const SafePayDealStatusSchema = z.enum([
  "CREATED",
  "FUNDED_LOCKED",
  "DELIVERED_VERIFYING",
  "DELIVERED_AWAITING_APPROVAL",
  "SETTLED",
  "VOIDED_EXPIRED",
  "VOIDED_FAILED"
]);
export type SafePayDealStatus = z.infer<typeof SafePayDealStatusSchema>;

export interface SafePayFeeBreakdown {
  amountAtomic: string;
  sellerNetAtomic: string;
  protocolFeeAtomic: string;
  totalBuyerSignAtomic: string;
  effectiveFeeBps: number;
  feePayer: SafePayFeePayer;
  treasuryAddress: `0x${string}`;
}

/**
 * Deterministically computes the SafePay atomic fee breakdown in 6-decimal Base USDC.
 * - Default fee: 1.0% (100 bps), or 0.75% (75 bps) for deals > $10,000 USDC
 * - Minimum fee floor: $0.50 USDC (500,000 atomic units)
 * - Every settled SafePay deal routes protocolFeeAtomic to 0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c
 */
export function computeSafePayFeeBreakdown(
  amountAtomicInput: string | bigint | number,
  feePayer: SafePayFeePayer = "seller"
): SafePayFeeBreakdown {
  const totalDealAtomic = BigInt(amountAtomicInput);
  if (totalDealAtomic <= 0n) {
    throw new Error("Deal amountAtomic must be greater than 0");
  }

  const feeBps =
    totalDealAtomic > SAFEPAY_WHALE_THRESHOLD_ATOMIC
      ? SAFEPAY_WHALE_FEE_BPS
      : SAFEPAY_DEFAULT_FEE_BPS;

  const percentageFee = (totalDealAtomic * feeBps) / 10_000n;
  const protocolFeeAtomic =
    percentageFee > SAFEPAY_MIN_FEE_ATOMIC ? percentageFee : SAFEPAY_MIN_FEE_ATOMIC;

  let sellerNetAtomic: bigint;
  let totalBuyerSignAtomic: bigint;

  if (feePayer === "buyer") {
    sellerNetAtomic = totalDealAtomic;
    totalBuyerSignAtomic = totalDealAtomic + protocolFeeAtomic;
  } else if (feePayer === "split") {
    const buyerHalf = protocolFeeAtomic / 2n;
    const sellerHalf = protocolFeeAtomic - buyerHalf;
    if (totalDealAtomic <= sellerHalf) {
      throw new Error(
        `Deal amount (${totalDealAtomic}) must exceed seller's share of protocol fee (${sellerHalf})`
      );
    }
    sellerNetAtomic = totalDealAtomic - sellerHalf;
    totalBuyerSignAtomic = sellerNetAtomic + protocolFeeAtomic;
  } else {
    // seller absorbs fee
    if (totalDealAtomic <= protocolFeeAtomic) {
      throw new Error(
        `Deal amount (${totalDealAtomic}) must exceed minimum protocol fee floor (${protocolFeeAtomic} = $0.50 USDC)`
      );
    }
    sellerNetAtomic = totalDealAtomic - protocolFeeAtomic;
    totalBuyerSignAtomic = totalDealAtomic;
  }

  return {
    amountAtomic: totalDealAtomic.toString(),
    sellerNetAtomic: sellerNetAtomic.toString(),
    protocolFeeAtomic: protocolFeeAtomic.toString(),
    totalBuyerSignAtomic: totalBuyerSignAtomic.toString(),
    effectiveFeeBps: Number(feeBps),
    feePayer,
    treasuryAddress: SAFEPAY_TREASURY_ADDRESS
  };
}

/**
 * Deliverable Verification Specification across all 4 Verification Modes
 */
export const SafePayVerificationSpecSchema = z.object({
  // Mode A: DATASET_SCHEMA (JSON / CSV / NDJSON)
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
  requiredColumns: z.array(z.string()).optional(),
  minRows: z.number().int().nonnegative().optional(),
  disallowNulls: z.boolean().optional(),
  invariants: z.array(InvariantRuleSchema).optional(),
  rejectRefusals: z.boolean().optional().default(true),

  // Mode B: FILE_ARCHIVE (.zip, .tar.gz, source bundle, binary seal)
  requiredFiles: z.array(z.string()).optional(),
  minBytes: z.number().int().nonnegative().optional(),
  expectedSha256: z.string().optional(),

  // Mode C: LIVE_API (Live endpoint / webhook SLA)
  targetEndpointUrl: z.string().optional(),
  expectedStatus: z.array(z.number().int()).optional(),
  maxLatencyMs: z.number().int().positive().optional(),

  // Mode D: OPTIMISTIC_PREVIEW (Human inspection + auto-settle window)
  inspectionWindowSeconds: z.number().int().positive().optional().default(86400),
  autoSettleOnPass: z.boolean().optional().default(false),
  strictSingleShot: z.boolean().optional().default(false)
});

export type SafePayVerificationSpec = z.infer<typeof SafePayVerificationSpecSchema>;

/**
 * POST /api/safepay/deals Request Schema
 */
export const CreateSafePayDealRequestSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(2000).optional().default(""),
  creatorRole: SafePayCreatorRoleSchema.optional().default("seller"),
  buyerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  sellerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  chainId: z.union([z.literal(8453), z.literal(84532)]).optional().default(8453),
  amountAtomic: z.string().regex(/^\d+$/),
  feePayer: SafePayFeePayerSchema.optional().default("seller"),
  expiresAt: z.number().int().positive().optional(),
  verificationMode: SafePayVerificationModeSchema,
  verificationSpec: SafePayVerificationSpecSchema.optional().default({})
});

export type CreateSafePayDealRequest = z.infer<typeof CreateSafePayDealRequestSchema>;

/**
 * POST /api/safepay/deals/:dealId/lock Request Schema (Dual EIP-3009 Signatures)
 */
export const LockSafePayDealRequestSchema = z.object({
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sellerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  sellerSignaturePayload: z.custom<X402PaymentSignaturePayload>((v) => Boolean(v && typeof v === "object")),
  feeSignaturePayload: z.custom<X402PaymentSignaturePayload>((v) => Boolean(v && typeof v === "object"))
});

export type LockSafePayDealRequest = z.infer<typeof LockSafePayDealRequestSchema>;

/**
 * POST /api/safepay/deals/:dealId/deliver Request Schema
 */
export const DeliverSafePayDealRequestSchema = z.object({
  sellerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  format: z.enum(["json", "csv", "ndjson", "zip_base64", "text", "live_url"]).optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  content: z.string().optional(),
  targetUrl: z.string().optional(),
  archiveManifest: z
    .array(
      z.object({
        path: z.string(),
        sizeBytes: z.number().int().nonnegative()
      })
    )
    .optional()
});

export type DeliverSafePayDealRequest = z.infer<typeof DeliverSafePayDealRequestSchema>;

/**
 * Redacted Preview generated by the Edge Arbiter before Buyer settlement
 */
export interface SafePayRedactedPreview {
  mode: SafePayVerificationMode;
  verified: boolean;
  deliverableSha256: string;
  byteSize: number;
  computedAt: number;
  checks: Array<{
    label: string;
    passed: boolean;
    detail: string;
  }>;
  datasetSummary?: {
    format: "json" | "csv" | "ndjson";
    totalRows: number;
    columns: string[];
    redactedSampleRows: Array<Record<string, unknown>>;
  };
  archiveSummary?: {
    filename: string;
    totalFiles: number;
    totalUncompressedBytes: number;
    verifiedPaths: string[];
    fileTree: Array<{ path: string; sizeBytes: number; sha256Prefix?: string }>;
  };
  liveApiSummary?: {
    endpointUrl: string;
    httpStatus: number;
    latencyMs: number;
    verifiedKeys: string[];
    redactedResponseSample: Record<string, unknown>;
  };
  optimisticSummary?: {
    watermarkedExcerpt: string;
    autoSettleDeadline: number;
  };
}

/**
 * EIP-712 SafePay Cryptographic Settlement Receipt
 */
export interface SafePaySettlementReceipt {
  dealId: string;
  buyer: `0x${string}`;
  seller: `0x${string}`;
  sellerNetAtomic: string;
  protocolFeeAtomic: string;
  treasuryAddress: `0x${string}`;
  deliverableSha256: `0x${string}`;
  specHash: `0x${string}`;
  sellerTxHash: `0x${string}`;
  feeTxHash: `0x${string}`;
  settledAt: number;
}

export interface SignedSafePaySettlementReceipt {
  receipt: SafePaySettlementReceipt;
  signature: `0x${string}`;
  arbiterAddress: `0x${string}`;
}

export const SAFEPAY_RECEIPT_TYPES = {
  SafePaySettlementReceipt: [
    { name: "dealId", type: "string" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "sellerNetAtomic", type: "uint256" },
    { name: "protocolFeeAtomic", type: "uint256" },
    { name: "treasuryAddress", type: "address" },
    { name: "deliverableSha256", type: "bytes32" },
    { name: "specHash", type: "bytes32" },
    { name: "sellerTxHash", type: "bytes32" },
    { name: "feeTxHash", type: "bytes32" },
    { name: "settledAt", type: "uint256" }
  ]
} as const;

export const SAFEPAY_RECEIPT_DOMAIN = {
  name: "NullClear SafePay",
  version: "1",
  chainId: 8453
} as const;

/**
 * Deterministically infers a JSON Schema Draft-07 and value invariants from a sample JSON object or array
 */
export function inferJsonSchemaFromSample(sample: unknown): {
  jsonSchema: Record<string, unknown>;
  requiredColumns: string[];
  invariants: InvariantRule[];
  minRows?: number;
} {
  const invariants: InvariantRule[] = [];
  const requiredColumns: string[] = [];

  if (Array.isArray(sample) && sample.length > 0 && typeof sample[0] === "object" && sample[0] !== null) {
    const first = sample[0] as Record<string, unknown>;
    const propSchemas: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(first)) {
      requiredColumns.push(k);
      if (typeof v === "number") {
        propSchemas[k] = { type: Number.isInteger(v) ? "integer" : "number" };
      } else if (typeof v === "boolean") {
        propSchemas[k] = { type: "boolean" };
      } else if (Array.isArray(v)) {
        propSchemas[k] = { type: "array" };
      } else if (typeof v === "object" && v !== null) {
        propSchemas[k] = { type: "object" };
      } else {
        propSchemas[k] = { type: "string", minLength: 1 };
      }
    }

    return {
      jsonSchema: {
        type: "array",
        items: {
          type: "object",
          required: requiredColumns,
          properties: propSchemas
        }
      },
      requiredColumns,
      invariants,
      minRows: sample.length
    };
  }

  if (typeof sample === "object" && sample !== null && !Array.isArray(sample)) {
    const obj = sample as Record<string, unknown>;
    const propSchemas: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(obj)) {
      requiredColumns.push(k);
      if (typeof v === "number") {
        propSchemas[k] = { type: Number.isInteger(v) ? "integer" : "number" };
        if (v > 0) {
          invariants.push({ path: k, gt: 0 });
        }
      } else if (typeof v === "boolean") {
        propSchemas[k] = { type: "boolean" };
      } else if (Array.isArray(v)) {
        propSchemas[k] = { type: "array" };
        if (v.length > 0) {
          invariants.push({ path: k, minLength: 1 });
        }
      } else if (typeof v === "object" && v !== null) {
        propSchemas[k] = { type: "object" };
      } else {
        propSchemas[k] = { type: "string", minLength: 1 };
      }
    }

    return {
      jsonSchema: {
        type: "object",
        required: requiredColumns,
        properties: propSchemas
      },
      requiredColumns,
      invariants
    };
  }

  return {
    jsonSchema: { type: typeof sample },
    requiredColumns: [],
    invariants: []
  };
}

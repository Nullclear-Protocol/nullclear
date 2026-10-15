import { z } from "zod";

/**
 * Deterministic Value Invariant Rule for deep field-level verification
 */
export const InvariantRuleSchema = z.object({
  path: z.string(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  eq: z.union([z.string(), z.number(), z.boolean()]).optional(),
  neq: z.union([z.string(), z.number(), z.boolean()]).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  notContains: z.array(z.string()).optional(),
  maxStalenessSeconds: z.number().optional()
});

export type InvariantRule = z.infer<typeof InvariantRuleSchema>;

/**
 * Validation Configuration contract
 */
export const ValidationConfigSchema = z.object({
  expectedStatus: z.array(z.number()).optional(),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
  requiredFields: z.array(z.string()).optional(),
  sha256Match: z.string().optional(),
  rejectRefusals: z.boolean().optional(),
  invariants: z.array(InvariantRuleSchema).optional()
});

export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;

/**
 * Fallback Candidate Target for autonomous multi-seller failover
 */
export const FallbackTargetSchema = z.object({
  targetUrl: z.string(),
  sellerAgentId: z.string().optional(),
  paymentSignatureHeader: z.string(),
  headers: z.record(z.string(), z.string()).optional()
});

export type FallbackTarget = z.infer<typeof FallbackTargetSchema>;

/**
 * Outbound Spend Policy Firewall
 */
export const SpendPolicySchema = z.object({
  maxPerCallAtomic: z.string().optional(),
  maxDailyWalletAtomic: z.string().optional()
});

export type SpendPolicy = z.infer<typeof SpendPolicySchema>;

/**
 * Full POST /v1/clear Request Schema
 */
export const ClearRequestSchema = z.object({
  targetUrl: z.string(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  paymentSignatureHeader: z.string(),
  sellerAgentId: z.string().optional(),
  minTrustScore: z.number().optional().default(50),
  twoPhaseRelease: z.boolean().optional().default(false),
  validation: ValidationConfigSchema.optional(),
  fallbacks: z.array(FallbackTargetSchema).max(3).optional(),
  spendPolicy: SpendPolicySchema.optional()
});

export type ClearRequestPayload = z.infer<typeof ClearRequestSchema>;

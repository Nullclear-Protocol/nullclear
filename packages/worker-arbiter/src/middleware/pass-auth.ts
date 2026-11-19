import type { Context } from "hono";
import { getArbiterStore, type ApiPassRecord, type Env } from "../env.js";

export type PassTierId = "starter" | "pro" | "scale";

export interface PassTierSpec {
  id: PassTierId;
  label: string;
  priceAtomic: string;
  priceUsdc: string;
  credits: number;
  effectiveCostPerCreditUsdc: string;
  includes: string[];
}

export const PASS_TIERS: Record<PassTierId, PassTierSpec> = {
  starter: {
    id: "starter",
    label: "Starter Agent Safety Pass",
    priceAtomic: "5000000", // $5.00 USDC
    priceUsdc: "5.00",
    credits: 2000,
    effectiveCostPerCreditUsdc: "0.0025",
    includes: [
      "2,000 low-latency (<5ms KV auth) API credits across all 7 chains",
      "Drop-in Guarded JSON-RPC Safety Rail (/rpc/:chain/:key) for AI agents & wallets — 0-credit reads, 2 credits/broadcast",
      "Instant access to /v1/guard, /v1/bazaar/*, /v1/policy/cosign, /v1/monitors"
    ]
  },
  pro: {
    id: "pro",
    label: "Pro Autonomous Agent & Treasury Pass",
    priceAtomic: "25000000", // $25.00 USDC
    priceUsdc: "25.00",
    credits: 15000,
    effectiveCostPerCreditUsdc: "0.00167",
    includes: [
      "15,000 low-latency API credits (67% cheaper than per-call x402)",
      "Drop-in Guarded JSON-RPC Safety Rail for AgentKit, ElizaOS, Virtuals, Rig & Safe wallets",
      "Cryptographic EIP-712 Policy Co-Signer (/v1/policy/cosign) blocking prompt-injected drains",
      "Continuous Cron Watchtower Monitors (/v1/monitors) with signed webhooks"
    ]
  },
  scale: {
    id: "scale",
    label: "Scale Institutional Treasury Pass",
    priceAtomic: "100000000", // $100.00 USDC
    priceUsdc: "100.00",
    credits: 100000,
    effectiveCostPerCreditUsdc: "0.0010",
    includes: [
      "100,000 low-latency API credits ($0.001/credit)",
      "High-volume Guarded RPC + Policy Co-Signer + Institutional Due-Diligence Dossiers",
      "Multi-contract Continuous Watchtower Monitoring across EVM + Solana"
    ]
  }
};

export function normalizePassTier(raw?: string | null): PassTierId {
  const v = (raw || "").trim().toLowerCase();
  if (v === "pro" || v === "25" || v === "25000000") return "pro";
  if (v === "scale" || v === "institutional" || v === "100" || v === "100000000") return "scale";
  return "starter";
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export function generateRawApiPassKey(): { rawKey: string; keyPrefix: string } {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const rawKey = `nc_live_${bytesToHex(randomBytes)}`;
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, 16)
  };
}

/**
 * Extracts a NullClear Prepaid Pass key (`nc_live_...`) from:
 * - `Authorization: Bearer nc_live_...`
 * - `X-NullClear-Key: nc_live_...`
 * - explicit path/query fallback (for `/rpc/:chain/:apiKey`)
 */
export function extractApiPassKey(c: Context<Env>, explicitKey?: string): string | null {
  if (explicitKey && explicitKey.startsWith("nc_live_")) {
    return explicitKey.trim();
  }
  const xKey = c.req.header("x-nullclear-key") || c.req.header("X-NullClear-Key");
  if (xKey && xKey.trim().startsWith("nc_live_")) {
    return xKey.trim();
  }
  const auth = c.req.header("authorization") || c.req.header("Authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith("nc_live_")) {
      return token;
    }
  }
  const qKey = c.req.query("apiKey") || c.req.query("key");
  if (qKey && qKey.trim().startsWith("nc_live_")) {
    return qKey.trim();
  }
  return null;
}

export interface PassAuthResult {
  hasKey: boolean;
  authenticated: boolean;
  pass: ApiPassRecord | null;
  creditsRemaining: number;
  errorReason?: string;
}

const PASS_KV_CACHE_TTL_SEC = 60;

export async function authenticatePassReadOnly(
  c: Context<Env>,
  explicitKey?: string
): Promise<PassAuthResult> {
  const rawKey = extractApiPassKey(c, explicitKey);
  if (!rawKey) {
    return { hasKey: false, authenticated: false, pass: null, creditsRemaining: 0 };
  }
  const keyHash = await sha256Hex(rawKey);
  const kv = c.env?.KV || c.env?.NULLCLEAR_CACHE;
  const kvKey = `pass_meta:${keyHash}`;

  let pass: ApiPassRecord | null = null;
  if (kv) {
    try {
      const cached = await kv.get(kvKey);
      if (cached) {
        pass = JSON.parse(cached) as ApiPassRecord;
      }
    } catch {}
  }

  if (!pass) {
    const store = getArbiterStore(c.env);
    pass = await store.getApiPassByHash(keyHash);
    if (pass && kv) {
      try {
        await kv.put(kvKey, JSON.stringify(pass), { expirationTtl: PASS_KV_CACHE_TTL_SEC });
      } catch {}
    }
  }

  if (!pass) {
    return {
      hasKey: true,
      authenticated: false,
      pass: null,
      creditsRemaining: 0,
      errorReason: "Invalid NullClear API pass key"
    };
  }
  c.header("x-nullclear-tier", "prepaid-pass");
  c.header("x-nullclear-pass-tier", pass.tier);
  c.header("x-nullclear-credits-remaining", String(pass.creditsRemaining));
  return {
    hasKey: true,
    authenticated: true,
    pass,
    creditsRemaining: pass.creditsRemaining
  };
}

export async function authenticateAndDebitPass(
  c: Context<Env>,
  costCredits = 1,
  explicitKey?: string
): Promise<PassAuthResult> {
  const rawKey = extractApiPassKey(c, explicitKey);
  if (!rawKey) {
    return { hasKey: false, authenticated: false, pass: null, creditsRemaining: 0 };
  }
  const keyHash = await sha256Hex(rawKey);
  const store = getArbiterStore(c.env);
  const debit = await store.consumeApiPassCredit(keyHash, costCredits);
  const kv = c.env?.KV || c.env?.NULLCLEAR_CACHE;
  if (debit.pass && kv) {
    try {
      await kv.put(`pass_meta:${keyHash}`, JSON.stringify(debit.pass), {
        expirationTtl: PASS_KV_CACHE_TTL_SEC
      });
    } catch {}
  }
  if (!debit.pass) {
    return {
      hasKey: true,
      authenticated: false,
      pass: null,
      creditsRemaining: 0,
      errorReason: "Invalid NullClear API pass key"
    };
  }
  if (!debit.allowed) {
    c.header("x-nullclear-tier", "prepaid-pass-exhausted");
    c.header("x-nullclear-pass-tier", debit.pass.tier);
    c.header("x-nullclear-credits-remaining", String(debit.creditsRemaining));
    return {
      hasKey: true,
      authenticated: false,
      pass: debit.pass,
      creditsRemaining: debit.creditsRemaining,
      errorReason: `Insufficient pass credits (need ${costCredits}, remaining ${debit.creditsRemaining}). Refill at POST https://api.nullclear.dev/v1/pass/buy`
    };
  }
  c.header("x-nullclear-tier", "prepaid-pass");
  c.header("x-nullclear-pass-tier", debit.pass.tier);
  c.header("x-nullclear-credits-remaining", String(debit.creditsRemaining));
  return {
    hasKey: true,
    authenticated: true,
    pass: debit.pass,
    creditsRemaining: debit.creditsRemaining
  };
}

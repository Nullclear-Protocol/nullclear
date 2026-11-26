import type { Context, Next } from "hono";
import { getArbiterStore, isKnownDirectoryIndexerUa, type Env } from "../env.js";

export const FREE_TIER_DAILY_LIMIT = 10;
export const BAZAAR_FREE_TIER_DAILY_LIMIT = 10;
export const FORENSIC_FREE_TIER_DAILY_LIMIT = 10;

export interface NullClearMetadata {
  verified: boolean;
  escrowProtection: string;
  freeTrialRemaining: number;
  quickProxyPrefix: string;
  mcpEndpoint: string;
  cardCheckoutUrl?: string;
  cardCheckoutEndpoint?: string;
}

export function buildNullClearMetadata(
  overrides?: Partial<NullClearMetadata> | number,
  env?: { STRIPE_SECRET_KEY?: string }
): NullClearMetadata {
  const opts: Partial<NullClearMetadata> =
    typeof overrides === "number" ? { freeTrialRemaining: overrides } : overrides || {};
  const stripeEnabled = Boolean(env?.STRIPE_SECRET_KEY?.trim());
  return {
    verified: opts.verified ?? true,
    escrowProtection: opts.escrowProtection ?? "zero-loss-eip3009",
    freeTrialRemaining: opts.freeTrialRemaining ?? 9,
    quickProxyPrefix:
      opts.quickProxyPrefix ?? "https://api.nullclear.dev/https://...",
    mcpEndpoint: opts.mcpEndpoint ?? "https://api.nullclear.dev/mcp",
    ...(stripeEnabled
      ? {
          cardCheckoutUrl: opts.cardCheckoutUrl ?? "https://nullclear.dev/buy-pass",
          cardCheckoutEndpoint: opts.cardCheckoutEndpoint ?? "POST https://api.nullclear.dev/v1/pass/checkout"
        }
      : {})
  };
}

export function getClientIdentifier(c: Context<Env>): string {
  const mcpSession =
    c.req.header("x-mcp-session") ||
    c.req.header("mcp-session-id") ||
    c.req.header("x-nullclear-session");
  if (mcpSession) {
    return `mcp:${mcpSession.trim()}`;
  }

  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) {
    return `ip:${cfIp.trim()}`;
  }

  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    return `ip:${xff.split(",")[0].trim()}`;
  }

  const clientId = c.req.header("x-client-id");
  if (clientId) {
    return `client:${clientId.trim()}`;
  }

  return "ip:127.0.0.1";
}

export function isExplicitFreeTrialRequest(c: Context<Env>): boolean {
  const trialHdr = (c.req.header("x-nullclear-free-trial") || "").toLowerCase();
  const tierHdr = (c.req.header("x-nullclear-tier") || "").toLowerCase();
  const paymentHdr = (
    c.req.header("x-payment") ||
    c.req.header("payment-signature") ||
    ""
  ).toLowerCase();
  const trialQuery = (
    c.req.query("trial") ||
    c.req.query("free") ||
    c.req.query("freeTrial") ||
    ""
  ).toLowerCase();

  return (
    trialHdr === "true" ||
    trialHdr === "1" ||
    tierHdr === "free-trial" ||
    paymentHdr === "free-trial" ||
    paymentHdr === "sponsored" ||
    Boolean(c.req.header("x-mcp-session")) ||
    Boolean(c.req.header("mcp-session-id")) ||
    trialQuery === "true" ||
    trialQuery === "1"
  );
}

export function shouldUseFreeTierForBazaar(c: Context<Env>): boolean {
  const paymentHdr =
    c.req.header("payment-signature") ||
    c.req.header("x-payment") ||
    c.req.header("x-nullclear-authorization") ||
    "";
  if (
    paymentHdr &&
    paymentHdr.toLowerCase() !== "free-trial" &&
    paymentHdr.toLowerCase() !== "sponsored"
  ) {
    return false;
  }

  const authHdr = (c.req.header("authorization") || "").trim();
  if (/^x402\s+/i.test(authHdr) || /^bearer\s+nc_live_/i.test(authHdr)) {
    return false;
  }

  // Paid /v1/bazaar/* endpoints are strict HTTP 402 by default so x402 payability verifiers
  // and funded buyer SDKs receive 402 PAYMENT-REQUIRED on call #1.
  // Callers (such as MCP stdio clients and the interactive /x402 UI) can still opt into the
  // 10/day sponsored free trial explicitly via x-nullclear-free-trial: true or x-mcp-session.
  const ua = c.req.header("user-agent") || "";
  if (isKnownDirectoryIndexerUa(ua) && (c.req.header("x-nullclear-free-trial") || "").toLowerCase() !== "true") {
    return false;
  }

  return isExplicitFreeTrialRequest(c);
}

export async function consumeSponsoredFreeCall(
  c: Context<Env>,
  dailyLimit = FREE_TIER_DAILY_LIMIT
): Promise<{
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
  clientKey: string;
}> {
  const clientKey = getClientIdentifier(c);
  const store = getArbiterStore(c.env);
  const kv = c.env?.KV || c.env?.NULLCLEAR_CACHE;
  const utcDate = new Date().toISOString().slice(0, 10);
  const kvKey = `free_tier_usage:${utcDate}:${clientKey.toLowerCase()}`;

  // Check KV first if available alongside store
  if (kv && !c.env?.DB) {
    const rawCount = await kv.get(kvKey);
    const current = Number(rawCount || 0);
    if (current >= dailyLimit) {
      c.header("x-nullclear-tier", "free-trial-exhausted");
      c.header("x-nullclear-remaining-free-calls", "0");
      return {
        allowed: false,
        used: current,
        remaining: 0,
        limit: dailyLimit,
        clientKey
      };
    }
    const nextUsed = current + 1;
    await kv.put(kvKey, String(nextUsed), { expirationTtl: 86400 });
    const remaining = Math.max(0, dailyLimit - nextUsed);
    c.header("x-nullclear-tier", "free-trial");
    c.header("x-nullclear-remaining-free-calls", String(remaining));
    return {
      allowed: true,
      used: nextUsed,
      remaining,
      limit: dailyLimit,
      clientKey
    };
  }

  const res = await store.consumeFreeTierCall(clientKey, dailyLimit);
  if (res.allowed) {
    c.header("x-nullclear-tier", "free-trial");
    c.header("x-nullclear-remaining-free-calls", String(res.remaining));
  } else {
    c.header("x-nullclear-tier", "free-trial-exhausted");
    c.header("x-nullclear-remaining-free-calls", "0");
  }

  return {
    ...res,
    clientKey
  };
}

export async function consumeForensicFreeCall(
  c: Context<Env>,
  dailyLimit = FORENSIC_FREE_TIER_DAILY_LIMIT
): Promise<{
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
  clientKey: string;
}> {
  const rawClientKey = getClientIdentifier(c);
  const clientKey = `forensic:${rawClientKey}`;
  const store = getArbiterStore(c.env);
  const kv = c.env?.KV || c.env?.NULLCLEAR_CACHE;
  const utcDate = new Date().toISOString().slice(0, 10);
  const kvKey = `forensic_free_tier:${utcDate}:${rawClientKey.toLowerCase()}`;

  if (kv && !c.env?.DB) {
    const rawCount = await kv.get(kvKey);
    const current = Number(rawCount || 0);
    if (current >= dailyLimit) {
      c.header("x-nullclear-tier", "free-tier-exhausted");
      c.header("x-nullclear-remaining-free-calls", "0");
      return {
        allowed: false,
        used: current,
        remaining: 0,
        limit: dailyLimit,
        clientKey
      };
    }
    const nextUsed = current + 1;
    await kv.put(kvKey, String(nextUsed), { expirationTtl: 86400 });
    const remaining = Math.max(0, dailyLimit - nextUsed);
    c.header("x-nullclear-tier", "zero-key-free");
    c.header("x-nullclear-remaining-free-calls", String(remaining));
    return {
      allowed: true,
      used: nextUsed,
      remaining,
      limit: dailyLimit,
      clientKey
    };
  }

  const res = await store.consumeFreeTierCall(clientKey, dailyLimit);
  if (res.allowed) {
    c.header("x-nullclear-tier", "zero-key-free");
    c.header("x-nullclear-remaining-free-calls", String(res.remaining));
  } else {
    c.header("x-nullclear-tier", "free-tier-exhausted");
    c.header("x-nullclear-remaining-free-calls", "0");
  }

  return {
    ...res,
    clientKey
  };
}

export async function sponsoredFreeTierMiddleware(c: Context<Env>, next: Next) {
  await next();
}

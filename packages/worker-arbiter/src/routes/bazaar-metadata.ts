export const NULLCLEAR_ICON_URL = "https://nullclear.dev/logo.png";

export interface BazaarResourceMeta {
  serviceName: string;
  toolName: string;
  tags: string[];
  iconUrl: string;
}

export const BAZAAR_RESOURCE_METADATA: Record<string, BazaarResourceMeta> = {
  "/v1/bazaar/market-oracle": {
    serviceName: "NullClear Market Oracle",
    toolName: "nullclear_market_oracle",
    tags: ["oracle", "price", "market-data", "crypto", "trading", "verified", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/token-security": {
    serviceName: "NullClear Token Security",
    toolName: "nullclear_token_security",
    tags: ["security", "honeypot", "token", "defi", "tax", "solana", "base", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/token-verdict": {
    serviceName: "NullClear Token Verdict",
    toolName: "nullclear_token_verdict",
    tags: ["verdict", "grade", "card", "security", "honeypot", "token", "solana", "base", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/scan-batch": {
    serviceName: "NullClear Batch Token Scanner",
    toolName: "nullclear_scan_batch",
    tags: ["security", "batch", "honeypot", "token", "defi", "firewall", "multichain"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/wallet-risk": {
    serviceName: "NullClear Wallet Risk",
    toolName: "nullclear_wallet_risk",
    tags: ["security", "wallet", "risk", "sybil", "erc8004", "base", "compliance"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/verified-fetch": {
    serviceName: "NullClear Verified Fetch",
    toolName: "nullclear_verified_fetch",
    tags: ["fetch", "proxy", "anti-hallucination", "attestation", "oracle", "json", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/audit": {
    serviceName: "NullClear Agent Audit",
    toolName: "nullclear_audit",
    tags: ["erc8004", "reputation", "sybil", "audit", "trust", "agents", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/verify": {
    serviceName: "NullClear Schema Verify",
    toolName: "nullclear_verify",
    tags: ["x402", "schema", "verification", "escrow", "agents", "compatibility"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/guard": {
    serviceName: "NullClear Pre-Sign Firewall",
    toolName: "nullclear_guard",
    tags: ["security", "firewall", "pre-sign", "simulation", "drainer", "evm", "solana", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/inspect": {
    serviceName: "NullClear Contract Inspector",
    toolName: "nullclear_inspect",
    tags: ["security", "smart-contract", "proxy", "abi", "bytecode", "audit", "evm"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/due-diligence": {
    serviceName: "NullClear Due Diligence",
    toolName: "nullclear_due_diligence",
    tags: ["security", "due-diligence", "audit", "compliance", "certificate", "eip712", "defi"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/bazaar/buy-pass": {
    serviceName: "NullClear Prepaid Pass",
    toolName: "nullclear_buy_pass",
    tags: ["api-key", "prepaid", "guarded-rpc", "firewall", "security", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/pass/buy": {
    serviceName: "NullClear Prepaid Pass",
    toolName: "nullclear_buy_pass",
    tags: ["api-key", "prepaid", "guarded-rpc", "firewall", "security", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/policy/cosign": {
    serviceName: "NullClear Policy Co-Signer",
    toolName: "nullclear_policy_cosign",
    tags: ["policy", "cosigner", "eip712", "treasury", "firewall", "security", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  },
  "/v1/monitors": {
    serviceName: "NullClear Watchtower",
    toolName: "nullclear_watchtower_monitor",
    tags: ["monitoring", "watchtower", "alerts", "webhooks", "security", "defi", "x402"],
    iconUrl: NULLCLEAR_ICON_URL
  }
};

export function getBazaarResourceMetadata(resourcePath: string): BazaarResourceMeta {
  return (
    BAZAAR_RESOURCE_METADATA[resourcePath] || {
      serviceName: "NullClear Protocol",
      toolName: "nullclear_x402",
      tags: ["security", "firewall", "x402", "base"],
      iconUrl: NULLCLEAR_ICON_URL
    }
  );
}

/**
 * Safely parses a non-negative integer atomic USDC string into BigInt without throwing on malformed input.
 */
export function parseAtomicBigInt(val: unknown): bigint | null {
  const s = String(val ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

export type ForensicChain =
  | "base"
  | "eth"
  | "arbitrum"
  | "optimism"
  | "polygon"
  | "bsc"
  | "solana";

export type SecurityRecommendedAction =
  | "EXECUTE_SAFE"
  | "CAUTION_HIGH_RISK"
  | "ABORT_CRITICAL_TRAP"
  | "ABORT_DRAINER_APPROVAL"
  | "ABORT_WILL_REVERT";

export class NullClearSecurityBlockError extends Error {
  public readonly recommendedAction: string;
  public readonly target: string;
  public readonly score?: number;
  public readonly reason: string;
  public readonly payload?: any;

  constructor(
    message: string,
    details: {
      recommendedAction: string;
      target: string;
      score?: number;
      reason: string;
      payload?: any;
    }
  ) {
    super(message);
    this.name = "NullClearSecurityBlockError";
    this.recommendedAction = details.recommendedAction;
    this.target = details.target;
    this.score = details.score;
    this.reason = details.reason;
    this.payload = details.payload;
  }
}

export function isEvmAddressFormat(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isSolanaAddressFormat(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export function normalizeForensicTarget(
  rawAddress: string,
  defaultChain: ForensicChain = "base"
): { chain: ForensicChain; address: string } {
  const trimmed = (rawAddress || "").trim();
  if (isEvmAddressFormat(trimmed)) {
    const evmChain: ForensicChain = defaultChain === "solana" ? "base" : defaultChain;
    return { chain: evmChain, address: trimmed.toLowerCase() };
  }
  if (isSolanaAddressFormat(trimmed)) {
    return { chain: "solana", address: trimmed };
  }
  throw new Error(`Unsupported token or contract address format: "${trimmed}"`);
}

export function isUnsafeSecurityAction(action?: string, strict = false): boolean {
  if (!action) return true;
  if (action.startsWith("ABORT_")) return true;
  if (strict && action === "CAUTION_HIGH_RISK") return true;
  return action !== "EXECUTE_SAFE" && action !== "CAUTION_HIGH_RISK";
}

export function assertSafeSecurityVerdict(
  payload: any,
  options: { strict?: boolean; targetLabel?: string } = {}
): void {
  const strict = Boolean(options.strict);
  const label = options.targetLabel || payload?.address || payload?.tokenAddress || payload?.to || "target";

  if (!payload || typeof payload !== "object") {
    throw new NullClearSecurityBlockError(`NullClear firewall blocked ${label}: empty security verdict`, {
      recommendedAction: "CAUTION_HIGH_RISK",
      target: label,
      reason: "Malformed or empty NullClear response"
    });
  }

  if (payload.error && !payload.recommendedAgentAction) {
    throw new NullClearSecurityBlockError(`NullClear firewall could not verify ${label}: ${payload.message || payload.error}`, {
      recommendedAction: "CAUTION_HIGH_RISK",
      target: label,
      reason: String(payload.message || payload.error),
      payload
    });
  }

  const action = String(payload.recommendedAgentAction || "CAUTION_HIGH_RISK");
  const isHoneypot = Boolean(payload?.evidence?.isHoneypot ?? payload?.isHoneypot);
  const wouldRevert = Boolean(payload?.wouldRevert);
  const score = typeof payload.score === "number" ? payload.score : typeof payload.securityScore === "number" ? payload.securityScore : undefined;

  if (isHoneypot || wouldRevert || isUnsafeSecurityAction(action, strict)) {
    const reason =
      payload.llmDigest ||
      payload.revertReason ||
      payload.reason ||
      (isHoneypot ? "Honeypot or blocked transfer detected" : `Firewall returned ${action}`);
    throw new NullClearSecurityBlockError(
      `NullClear blocked ${label}: ${action}${score !== undefined ? ` (${score}/100)` : ""} - ${reason}`,
      {
        recommendedAction: action,
        target: label,
        score,
        reason,
        payload
      }
    );
  }
}

export function formatSecurityVerdictText(payload: any, label?: string): string {
  if (!payload || typeof payload !== "object") {
    return `NullClear Security Check (${label || "unknown"}): Unavailable or empty response.`;
  }
  if (payload.error && !payload.recommendedAgentAction) {
    return `NullClear Security Check Failed (${label || "target"}): ${payload.message || payload.error}`;
  }
  const target = payload.address || payload.tokenAddress || label || "unknown";
  const chain = String(payload.chain || "base").toUpperCase();
  const action = payload.recommendedAgentAction || "UNKNOWN";
  const score = payload.score ?? payload.securityScore;
  const verdict = payload.verdict || payload.riskLevel || "";
  const symbol = payload.symbol ? `${payload.symbol} ` : "";
  const ev = payload.evidence || {};
  const buyTax = ev.buyTaxPercent ?? (payload.buyTaxBps !== undefined ? payload.buyTaxBps / 100 : undefined);
  const sellTax = ev.sellTaxPercent ?? (payload.sellTaxBps !== undefined ? payload.sellTaxBps / 100 : undefined);
  const liq = ev.liquidityUsd ?? payload.liquidityUsd;
  const parts = [
    `[NullClear] ${symbol}(${chain}:${target}) -> ${action}`,
    score !== undefined ? `Score: ${score}/100 (${verdict})` : verdict ? `Verdict: ${verdict}` : "",
    buyTax !== undefined && sellTax !== undefined ? `Tax: ${buyTax}% buy / ${sellTax}% sell` : "",
    liq !== undefined ? `Liquidity: $${Number(liq).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "",
    payload.llmDigest ? `Summary: ${payload.llmDigest}` : "",
    payload.links?.webReportUrl ? `Report: ${payload.links.webReportUrl}` : ""
  ].filter(Boolean);
  return parts.join(" | ");
}

export function formatBatchVerdictText(batch: any): string {
  if (!batch || typeof batch !== "object") {
    return "NullClear Batch Scan: Unavailable response.";
  }
  if (batch.error && !batch.recommendedAgentAction) {
    return `NullClear Batch Scan Blocked: ${batch.message || batch.error}`;
  }
  const s = batch.summary || {};
  const flagged = Array.isArray(batch.results)
    ? batch.results
        .filter((r: any) => r.recommendedAgentAction !== "EXECUTE_SAFE")
        .map((r: any) => `${r.symbol || r.address} (${r.chain}: ${r.recommendedAgentAction}, ${r.score}/100)`)
    : [];
  const header = `[NullClear Batch] ${batch.recommendedAgentAction} (${batch.batchVerdict}) | Evaluated: ${s.uniqueEvaluated ?? "?"} | Safe: ${s.safeCount ?? 0} | Caution: ${s.cautionCount ?? 0} | Critical Traps: ${s.criticalTrapCount ?? 0} | Cache Hits: ${s.cacheHits ?? 0}`;
  return flagged.length > 0 ? `${header} | Flagged: ${flagged.join(", ")}` : header;
}

export const DEFAULT_NULLCLEAR_API_BASE = "https://api.nullclear.dev";

export interface NullClearRpcOptions {
  chain: "base" | "eth" | "arbitrum" | "optimism" | "polygon" | "bsc" | "solana";
  apiKey: string;
  apiBaseUrl?: string;
  failMode?: "closed" | "open";
  timeoutMs?: number;
  blockCaution?: boolean;
}

/**
 * Builds a drop-in Guarded JSON-RPC Safety Rail URL for autonomous AI agents (Coinbase AgentKit,
 * ElizaOS, Virtuals, Rig, MCP wallets) and Safe / DAO treasuries using viem, ethers, Foundry, or Solana Web3.js.
 * Read methods pass through via edge KV auth at 0 credits; broadcast methods are audited before mempool broadcast.
 */
export function createNullClearRpcUrl(options: NullClearRpcOptions): string {
  const base = (options.apiBaseUrl || DEFAULT_NULLCLEAR_API_BASE).replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (options.failMode) params.set("failMode", options.failMode);
  if (typeof options.timeoutMs === "number") params.set("timeoutMs", String(Math.floor(options.timeoutMs)));
  if (options.blockCaution) params.set("blockCaution", "true");
  const qs = params.toString();
  return `${base}/rpc/${options.chain}/${options.apiKey}${qs ? `?${qs}` : ""}`;
}

/**
 * Lightweight Prepaid Pass client for low-latency (<10ms auth) Guard, Policy Co-Signer,
 * Watchtower Monitor, and Institutional Due-Diligence calls without per-call x402 overhead.
 */
export function createNullClearPassClient(apiKey: string, apiBaseUrl = DEFAULT_NULLCLEAR_API_BASE) {
  const base = apiBaseUrl.replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
  return {
    rpcUrl: (
      chain: NullClearRpcOptions["chain"],
      opts?: { failMode?: "closed" | "open"; blockCaution?: boolean }
    ) => createNullClearRpcUrl({ chain, apiKey, apiBaseUrl: base, ...opts }),
    status: async () => {
      const res = await fetch(`${base}/v1/pass/status`, { headers: { Authorization: `Bearer ${apiKey}` } });
      return res.json();
    },
    guard: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${base}/v1/bazaar/guard`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      return res.json();
    },
    dueDiligence: async (chain: string, address: string) => {
      const res = await fetch(`${base}/v1/bazaar/due-diligence`, {
        method: "POST",
        headers,
        body: JSON.stringify({ chain, address })
      });
      return res.json();
    },
    cosign: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${base}/v1/policy/cosign`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      return res.json();
    },
    createMonitor: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${base}/v1/monitors`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      return res.json();
    }
  };
}

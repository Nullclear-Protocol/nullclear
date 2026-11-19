import {
  decodeBase64Json,
  type KYAMandate,
  type ValidationConfig,
  type FallbackTarget,
  type SpendPolicy,
  type X402PaymentRequired,
  type X402PaymentOption
} from "@nullclear/shared";
import { signX402Payment, type SignerInput } from "./signer.js";
import {
  assertSafeSecurityVerdict,
  createNullClearRpcUrl,
  normalizeForensicTarget,
  type ForensicChain,
  type NullClearRpcOptions
} from "./firewall.js";

export interface NullClearClientConfig {
  arbiterUrl?: string;
  defaultChainId?: number;
  fetch?: typeof fetch;
  signer?: SignerInput;
  /** Optional Prepaid Pass Bearer API key (`nc_live_...`) for <5ms auth without per-call x402 latency */
  apiKey?: string;
  timeoutMs?: number;
}

export interface ClearRequest {
  targetUrl: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  paymentSignatureHeader?: string;
  sellerAgentId?: string;
  minTrustScore?: number;
  twoPhaseRelease?: boolean;
  validation?: ValidationConfig;
  fallbacks?: FallbackTarget[];
  spendPolicy?: SpendPolicy;
}

export interface ClearResult<T = unknown> {
  cleared: boolean;
  settled: boolean;
  tier?: string;
  freeTrialRemaining?: number;
  clearingId?: string;
  buyerCharged: string;
  clearingFee?: string;
  settlementRouting?: string;
  transaction?: `0x${string}`;
  attestation?: unknown;
  executionReceipt?: unknown;
  data?: T;
  stage?: string;
  error?: string;
  validationErrors?: string[];
  failoverAttempts?: number;
  winningSellerAgentId?: string;
  failedCandidates?: Array<{
    targetUrl: string;
    sellerAgentId?: string;
    stage: string;
    reason: string;
  }>;
}

export class NullClearClient {
  private arbiterUrl: string;
  private defaultChainId: number;
  private customFetch: typeof fetch;
  private signer?: SignerInput;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(config: NullClearClientConfig = {}) {
    this.arbiterUrl = (config.arbiterUrl || "https://api.nullclear.dev").replace(/\/$/, "");
    this.defaultChainId = config.defaultChainId || 8453;
    this.customFetch = config.fetch || fetch;
    this.signer = config.signer;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  private async requestJsonWithAutoX402(
    path: string,
    init: RequestInit & { paymentSignatureHeader?: string } = {}
  ): Promise<any> {
    const url = `${this.arbiterUrl}${path}`;
    const { paymentSignatureHeader, headers: rawHeaders, signal, ...restInit } = init;
    const headers: Record<string, string> = {
      ...(rawHeaders && typeof rawHeaders === "object" && !(rawHeaders instanceof Headers)
        ? (rawHeaders as Record<string, string>)
        : {})
    };
    if (this.apiKey && !headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (paymentSignatureHeader) {
      headers["PAYMENT-SIGNATURE"] = paymentSignatureHeader;
    }

    const requestSignal =
      signal ||
      (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(this.timeoutMs)
        : undefined);

    let res = await this.customFetch(url, {
      ...restInit,
      headers,
      signal: requestSignal
    });

    if (res.status === 402 && !paymentSignatureHeader && this.signer) {
      let paymentOption: X402PaymentOption | undefined;
      const paymentReqHeader =
        res.headers.get("PAYMENT-REQUIRED") || res.headers.get("X-Payment-Required");
      if (paymentReqHeader) {
        try {
          const decoded = decodeBase64Json<X402PaymentRequired>(paymentReqHeader);
          paymentOption = decoded.accepts?.[0];
        } catch {}
      }

      const fallbackBody = await res.json().catch(() => null);
      if (!paymentOption && Array.isArray(fallbackBody?.accepts) && fallbackBody.accepts[0]) {
        paymentOption = fallbackBody.accepts[0] as X402PaymentOption;
      }

      if (paymentOption) {
        const paymentSig = await signX402Payment(this.signer, paymentOption, url);
        res = await this.customFetch(url, {
          ...restInit,
          headers: { ...headers, "PAYMENT-SIGNATURE": paymentSig },
          signal: requestSignal
        });
      } else if (fallbackBody) {
        return { ...fallbackBody, httpStatus: 402 };
      }
    }

    const parsed = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`NullClear returned non-JSON response (${res.status}) for ${path}`);
    }
    return parsed;
  }

  async getScore(agentId: string, chainId?: number): Promise<any> {
    const targetChainId = chainId || this.defaultChainId;
    const res = await this.customFetch(`${this.arbiterUrl}/v1/score/${targetChainId}/${agentId}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch score for agent ${agentId}: ${res.status} ${err}`);
    }
    const data = (await res.json()) as any;
    return data.data;
  }

  async clear<T = unknown>(request: ClearRequest): Promise<ClearResult<T>> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!request.paymentSignatureHeader || request.paymentSignatureHeader === "free-trial") {
      headers["x-nullclear-free-trial"] = "true";
    }
    const res = await this.customFetch(`${this.arbiterUrl}/v1/clear`, {
      method: "POST",
      headers,
      body: JSON.stringify(request)
    });

    const data = (await res.json()) as ClearResult<T>;
    return data;
  }

  async safeFetch(targetUrl: string, init?: RequestInit): Promise<Response> {
    return this.customFetch(`${this.arbiterUrl}/${targetUrl}`, init);
  }

  async createGateway(params: {
    upstreamUrl: string;
    sellerAddress: string;
    priceUsdc?: string;
    priceAtomic?: string;
    slug?: string;
    description?: string;
    category?: "data" | "security" | "oracle" | "ai";
    validationPreset?: "DEFAULT_JSON" | "STRICT_NO_REFUSAL" | "CUSTOM";
    customSchema?: Record<string, unknown>;
  }): Promise<any> {
    const res = await this.customFetch(`${this.arbiterUrl}/v1/gateways`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    return res.json();
  }

  async getKya(agentId: string, chainId?: number): Promise<any> {
    const targetChainId = chainId || this.defaultChainId;
    const res = await this.customFetch(`${this.arbiterUrl}/v1/kya/${targetChainId}/${agentId}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      const err = await res.text();
      throw new Error(`Failed to fetch KYA mandate for agent ${agentId}: ${res.status} ${err}`);
    }
    const data = (await res.json()) as any;
    return data.data;
  }

  async attestKya(
    mandate: KYAMandate,
    chainId?: number,
    signature?: string,
    signerAddress?: `0x${string}`
  ): Promise<any> {
    const targetChainId = chainId || this.defaultChainId;
    const res = await this.customFetch(`${this.arbiterUrl}/v1/kya/attest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mandate,
        chainId: targetChainId,
        signature,
        signerAddress
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to attest KYA mandate: ${res.status} ${err}`);
    }

    const data = (await res.json()) as any;
    return data.data;
  }

  /**
   * Discover live verified x402 & ERC-8004 APIs from the NullClear Ecosystem Directory.
   */
  async discoverEndpoints(params?: {
    query?: string;
    category?: "data" | "security" | "oracle" | "ai";
    minUptime?: number;
    maxLatencyMs?: number;
    verifiedOnly?: boolean;
  }): Promise<any> {
    const qs = new URLSearchParams();
    if (params?.query) qs.set("query", params.query);
    if (params?.category) qs.set("category", params.category);
    if (params?.minUptime !== undefined) qs.set("minUptime", String(params.minUptime));
    if (params?.maxLatencyMs !== undefined) qs.set("maxLatencyMs", String(params.maxLatencyMs));
    if (params?.verifiedOnly) qs.set("verifiedOnly", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await this.customFetch(`${this.arbiterUrl}/v1/bazaar/directory${suffix}`);
    if (!res.ok) {
      throw new Error(`Failed to query x402 directory: ${res.status}`);
    }
    return res.json();
  }

  /**
   * Zero-key token audit across Base, Ethereum, or Solana (auto-settles x402 when signer is configured).
   */
  async scanToken(
    chain: ForensicChain,
    address: string,
    paymentSignatureHeader?: string
  ): Promise<any> {
    const target = normalizeForensicTarget(address, chain);
    return this.requestJsonWithAutoX402(`/v1/scan/${target.chain}/${target.address}`, {
      paymentSignatureHeader
    });
  }

  /**
   * Batch token pre-flight firewall (up to 15 unique tokens per $0.025 USDC call on Base Mainnet).
   * When signer is omitted, falls back cleanly if fallbackToFreeSingleScans is true and batch <= 5.
   */
  async scanBatch(
    tokens: Array<string | { chain?: ForensicChain; address: string }>,
    options?: {
      defaultChain?: ForensicChain;
      paymentSignatureHeader?: string;
      fallbackToFreeSingleScans?: boolean;
    }
  ): Promise<any> {
    const res = await this.requestJsonWithAutoX402("/v1/bazaar/scan-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      paymentSignatureHeader: options?.paymentSignatureHeader,
      body: JSON.stringify({
        chain: options?.defaultChain || "base",
        tokens
      })
    });

    if (
      res?.error === "Payment Required" &&
      options?.fallbackToFreeSingleScans &&
      tokens.length > 0 &&
      tokens.length <= 5
    ) {
      const normalized = tokens.map((entry) =>
        typeof entry === "string"
          ? normalizeForensicTarget(entry, options.defaultChain || "base")
          : normalizeForensicTarget(entry.address, entry.chain || options.defaultChain || "base")
      );
      const scans = await Promise.all(normalized.map((t) => this.scanToken(t.chain, t.address)));
      const criticalTrapCount = scans.filter(
        (s) => s?.recommendedAgentAction === "ABORT_CRITICAL_TRAP" || s?.evidence?.isHoneypot
      ).length;
      const cautionCount = scans.filter(
        (s) => s?.recommendedAgentAction === "CAUTION_HIGH_RISK" && !s?.evidence?.isHoneypot
      ).length;
      const safeCount = scans.length - criticalTrapCount - cautionCount;
      return {
        recommendedAgentAction:
          criticalTrapCount > 0
            ? "ABORT_CRITICAL_TRAP"
            : cautionCount > 0
              ? "CAUTION_HIGH_RISK"
              : "EXECUTE_SAFE",
        batchVerdict:
          criticalTrapCount > 0
            ? "CRITICAL_TRAP_DETECTED"
            : cautionCount > 0
              ? "CAUTION"
              : "ALL_CLEAR",
        summary: {
          totalRequested: tokens.length,
          uniqueEvaluated: scans.length,
          cacheHits: scans.filter((s) => Boolean(s?.cached)).length,
          freshScans: scans.filter((s) => !s?.cached).length,
          safeCount,
          cautionCount,
          criticalTrapCount,
          lowestScore: Math.min(...scans.map((s) => Number(s?.score ?? 0)))
        },
        results: scans,
        fallbackMode: "free-single-scans"
      };
    }

    return res;
  }

  /**
   * Scans a token across Base, Ethereum, or Solana and throws NullClearSecurityBlockError on ABORT_* verdicts.
   */
  async assertSafeTokenSwap(
    address: string,
    chain: ForensicChain = "base",
    options?: { strict?: boolean; paymentSignatureHeader?: string }
  ): Promise<any> {
    const scan = await this.scanToken(chain, address, options?.paymentSignatureHeader);
    assertSafeSecurityVerdict(scan, {
      strict: options?.strict,
      targetLabel: `${chain}:${address}`
    });
    return scan;
  }

  /**
   * Zero-key proxy resolution, Sourcify ABI, and bytecode selector extraction.
   */
  async inspectContract(
    chain: Exclude<ForensicChain, "solana">,
    address: string,
    paymentSignatureHeader?: string
  ): Promise<any> {
    return this.requestJsonWithAutoX402(`/v1/inspect/${chain}/${address}`, {
      paymentSignatureHeader
    });
  }

  /**
   * Decode calldata (with recursive Multicall3/UniversalRouter/Safe unwrapping), EIP-712 typedData,
   * Solana wire txs, or revert reasons.
   */
  async decodeCalldata(
    input: string,
    chain: ForensicChain = "base",
    paymentSignatureHeader?: string,
    options?: { typedData?: Record<string, unknown> }
  ): Promise<any> {
    return this.requestJsonWithAutoX402("/v1/decode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      paymentSignatureHeader,
      body: JSON.stringify({ input, chain, ...(options?.typedData ? { typedData: options.typedData } : {}) })
    });
  }

  /**
   * Stateful pre-flight simulation across EVM (eth_simulateV1 + stateOverrides + multi-tx bundles)
   * and Solana (simulateTransaction + wire parser).
   */
  async simulateTx(params: {
    to?: string;
    data?: string;
    from?: string;
    value?: string;
    chain?: ForensicChain;
    transactions?: Array<{ to: string; data?: string; value?: string }>;
    stateOverrides?: Record<string, unknown>;
    transaction?: string;
    paymentSignatureHeader?: string;
  }): Promise<any> {
    return this.requestJsonWithAutoX402("/v1/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      paymentSignatureHeader: params.paymentSignatureHeader,
      body: JSON.stringify({
        to: params.to,
        data: params.data,
        from: params.from,
        value: params.value,
        chain: params.chain || "base",
        ...(params.transactions ? { transactions: params.transactions } : {}),
        ...(params.stateOverrides ? { stateOverrides: params.stateOverrides } : {}),
        ...(params.transaction ? { transaction: params.transaction } : {})
      })
    });
  }

  /**
   * Composite 1-call Pre-Sign Firewall (`POST /v1/guard`): decodes nested calldata / EIP-712 / Solana tx,
   * simulates stateful asset diffs, and automatically scans all touched token contracts.
   */
  async guard(params: {
    chain?: ForensicChain;
    from?: string;
    to?: string;
    data?: string;
    value?: string;
    transactions?: Array<{ to: string; data?: string; value?: string }>;
    stateOverrides?: Record<string, unknown>;
    typedData?: Record<string, unknown>;
    transaction?: string;
    paymentSignatureHeader?: string;
  }): Promise<any> {
    return this.requestJsonWithAutoX402("/v1/guard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      paymentSignatureHeader: params.paymentSignatureHeader,
      body: JSON.stringify({
        chain: params.chain || "base",
        from: params.from,
        to: params.to,
        data: params.data,
        value: params.value,
        transactions: params.transactions,
        stateOverrides: params.stateOverrides,
        typedData: params.typedData,
        transaction: params.transaction
      })
    });
  }

  /**
   * Builds a Drop-In Guarded JSON-RPC URL (`https://api.nullclear.dev/rpc/:chain/:apiKey`).
   */
  guardedRpcUrl(
    chain: ForensicChain,
    options?: Omit<NullClearRpcOptions, "chain" | "apiKey" | "apiBaseUrl"> & { apiKey?: string }
  ): string {
    const key = options?.apiKey || this.apiKey;
    if (!key) {
      throw new Error("NullClear Prepaid Pass apiKey (`nc_live_...`) required to build a Guarded RPC URL.");
    }
    return createNullClearRpcUrl({
      chain,
      apiKey: key,
      apiBaseUrl: this.arbiterUrl,
      failMode: options?.failMode,
      timeoutMs: options?.timeoutMs,
      blockCaution: options?.blockCaution
    });
  }

  /**
   * Institutional 7-chain Token & Contract Due-Diligence Dossier ($0.10 USDC or 10 Prepaid Pass credits).
   */
  async dueDiligence(
    chain: ForensicChain,
    address: string,
    paymentSignatureHeader?: string
  ): Promise<any> {
    const target = normalizeForensicTarget(address, chain);
    return this.requestJsonWithAutoX402("/v1/bazaar/due-diligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      paymentSignatureHeader,
      body: JSON.stringify({ chain: target.chain, address: target.address })
    });
  }

  /**
   * Cryptographic Non-Custodial Policy Co-Signer ($0.02 USDC or 2 Prepaid Pass credits).
   */
  async cosign(params: {
    policyId?: string;
    policy?: Record<string, unknown>;
    chain?: ForensicChain;
    from?: string;
    to?: string;
    data?: string;
    value?: string;
    typedData?: Record<string, unknown>;
    transaction?: string;
    paymentSignatureHeader?: string;
  }): Promise<any> {
    const { paymentSignatureHeader, ...body } = params;
    return this.requestJsonWithAutoX402("/v1/policy/cosign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      paymentSignatureHeader,
      body: JSON.stringify(body)
    });
  }

  /**
   * Mint a Prepaid Firewall Pass ($5 Starter / $25 Pro / $100 Scale) via x402 EIP-3009 USDC.
   */
  async buyPass(
    tier: "starter" | "pro" | "scale" = "starter",
    paymentSignatureHeader?: string
  ): Promise<any> {
    return this.requestJsonWithAutoX402("/v1/pass/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      paymentSignatureHeader,
      body: JSON.stringify({ tier })
    });
  }
}

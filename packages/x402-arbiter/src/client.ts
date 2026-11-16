import type {
  KYAMandate,
  ValidationConfig,
  FallbackTarget,
  SpendPolicy
} from "@nullclear/shared";

export interface NullClearClientConfig {
  arbiterUrl?: string;
  defaultChainId?: number;
  fetch?: typeof fetch;
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

  constructor(config: NullClearClientConfig = {}) {
    this.arbiterUrl = (config.arbiterUrl || "https://api.nullclear.dev").replace(/\/$/, "");
    this.defaultChainId = config.defaultChainId || 8453;
    this.customFetch = config.fetch || fetch;
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
   * Zero-key token audit across Base, Ethereum, or Solana (optional X-Payment header for >100/day calls).
   */
  async scanToken(
    chain: "base" | "eth" | "solana",
    address: string,
    paymentSignatureHeader?: string
  ): Promise<any> {
    const headers: Record<string, string> = {};
    if (paymentSignatureHeader) headers["PAYMENT-SIGNATURE"] = paymentSignatureHeader;
    const res = await this.customFetch(`${this.arbiterUrl}/v1/scan/${chain}/${address}`, {
      headers
    });
    return res.json();
  }

  /**
   * Zero-key EIP-1967/1822 proxy resolution and bytecode selector extraction.
   */
  async inspectContract(
    chain: "base" | "eth",
    address: string,
    paymentSignatureHeader?: string
  ): Promise<any> {
    const headers: Record<string, string> = {};
    if (paymentSignatureHeader) headers["PAYMENT-SIGNATURE"] = paymentSignatureHeader;
    const res = await this.customFetch(`${this.arbiterUrl}/v1/inspect/${chain}/${address}`, {
      headers
    });
    return res.json();
  }

  /**
   * Decode calldata, revert reasons, or flag unlimited drainer approvals before signing.
   */
  async decodeCalldata(
    input: string,
    chain: "base" | "eth" = "base",
    paymentSignatureHeader?: string
  ): Promise<any> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (paymentSignatureHeader) headers["PAYMENT-SIGNATURE"] = paymentSignatureHeader;
    const res = await this.customFetch(`${this.arbiterUrl}/v1/decode`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input, chain })
    });
    return res.json();
  }

  /**
   * Pre-flight eth_call simulation & revert decoding on Base or Ethereum.
   */
  async simulateTx(params: {
    to: string;
    data?: string;
    from?: string;
    value?: string;
    chain?: "base" | "eth";
    paymentSignatureHeader?: string;
  }): Promise<any> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (params.paymentSignatureHeader) headers["PAYMENT-SIGNATURE"] = params.paymentSignatureHeader;
    const res = await this.customFetch(`${this.arbiterUrl}/v1/simulate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: params.to,
        data: params.data,
        from: params.from,
        value: params.value,
        chain: params.chain || "base"
      })
    });
    return res.json();
  }
}

import type { KYAMandate } from "@nullclear/shared";

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
  paymentSignatureHeader: string;
  sellerAgentId?: string;
  minTrustScore?: number;
  validation?: {
    expectedStatus?: number[];
    jsonSchema?: Record<string, unknown>;
    requiredFields?: string[];
    sha256Match?: string;
  };
}

export interface ClearResult<T = unknown> {
  cleared: boolean;
  settled: boolean;
  clearingId?: string;
  buyerCharged: string;
  clearingFee?: string;
  transaction?: `0x${string}`;
  attestation?: unknown;
  data?: T;
  stage?: string;
  error?: string;
  validationErrors?: string[];
}

export class NullClearClient {
  private arbiterUrl: string;
  private defaultChainId: number;
  private customFetch: typeof fetch;

  constructor(config: NullClearClientConfig = {}) {
    this.arbiterUrl = (config.arbiterUrl || "https://arbiter.nullclear.dev").replace(/\/$/, "");
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
    const res = await this.customFetch(`${this.arbiterUrl}/v1/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });

    const data = (await res.json()) as ClearResult<T>;
    return data;
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
}

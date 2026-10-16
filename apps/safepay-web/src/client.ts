import type {
  CreateSafePayDealRequest,
  DeliverSafePayDealRequest,
  LockSafePayDealRequest,
  SafePayFeeBreakdown,
  SafePayRedactedPreview,
  SignedSafePaySettlementReceipt
} from "@nullclear/shared";

export interface SafePayClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class SafePayClient {
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(options: SafePayClientOptions = {}) {
    this.baseUrl = (options.baseUrl || "https://nullclear.com").replace(/\/$/, "");
    this.fetchFn = options.fetchFn || fetch;
  }

  async createDeal(req: CreateSafePayDealRequest): Promise<{
    success: boolean;
    dealId: string;
    shareUrl: string;
    feeBreakdown: SafePayFeeBreakdown;
    deal: Record<string, unknown>;
  }> {
    const res = await this.fetchFn(`${this.baseUrl}/api/safepay/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    });
    return (await res.json()) as any;
  }

  async getDeal(dealId: string): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`${this.baseUrl}/api/safepay/deals/${dealId}`);
    return (await res.json()) as any;
  }

  async lockDeal(dealId: string, req: LockSafePayDealRequest): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`${this.baseUrl}/api/safepay/deals/${dealId}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    });
    return (await res.json()) as any;
  }

  async submitDeliverable(
    dealId: string,
    req: DeliverSafePayDealRequest
  ): Promise<{
    success: boolean;
    verified: boolean;
    settled: boolean;
    status: string;
    sellerTxHash?: `0x${string}`;
    feeTxHash?: `0x${string}`;
    receipt?: SignedSafePaySettlementReceipt;
    redactedPreview?: SafePayRedactedPreview;
    validationErrors?: string[];
  }> {
    const res = await this.fetchFn(`${this.baseUrl}/api/safepay/deals/${dealId}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    });
    return (await res.json()) as any;
  }

  async downloadDeliverable(dealId: string, buyerAddress: `0x${string}`, signature?: `0x${string}`): Promise<Response> {
    const headers: Record<string, string> = {
      "X-Buyer-Address": buyerAddress
    };
    if (signature) {
      headers["X-Buyer-Signature"] = signature;
    }
    return this.fetchFn(`${this.baseUrl}/api/safepay/deals/${dealId}/download`, {
      method: "GET",
      headers
    });
  }
}

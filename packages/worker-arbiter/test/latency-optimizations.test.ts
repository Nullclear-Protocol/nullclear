import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  BASE_MAINNET,
  EIP3009_TYPES,
  NULLCLEAR_TREASURY_ADDRESS,
  encodeBase64Json,
  type EIP3009Authorization,
  type X402PaymentSignaturePayload
} from "@nullclear/shared";
import app from "../src/index.js";
import { getArbiterStore } from "../src/env.js";

function createMockKv() {
  const map = new Map<string, string>();
  return {
    map,
    get: vi.fn(async (key: string) => map.get(key) ?? null),
    put: vi.fn(async (key: string, val: string) => {
      map.set(key, val);
    }),
    delete: vi.fn(async (key: string) => {
      map.delete(key);
    })
  };
}

describe("Bazaar x402 Latency Optimizations & Server-Timing", () => {
  const arbiterKey = generatePrivateKey();
  const buyerKey = generatePrivateKey();
  const buyerAccount = privateKeyToAccount(buyerKey);
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    getArbiterStore().reset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function signPaymentHeader(opts: {
    amount: string;
    corruptSignature?: boolean;
  }): Promise<string> {
    const nonce = ("0x" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`;

    const authorization: EIP3009Authorization = {
      from: buyerAccount.address,
      to: NULLCLEAR_TREASURY_ADDRESS,
      value: opts.amount,
      validAfter: "0",
      validBefore: String(Math.floor(Date.now() / 1000) + 600),
      nonce
    };

    const sig = await buyerAccount.signTypedData({
      domain: {
        name: BASE_MAINNET.usdcDomain.name,
        version: BASE_MAINNET.usdcDomain.version,
        chainId: BASE_MAINNET.chainId,
        verifyingContract: BASE_MAINNET.usdc
      },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce
      }
    });

    const finalSig = opts.corruptSignature
      ? (`0x${"11".repeat(64)}1b` as `0x${string}`)
      : sig;

    const payload: X402PaymentSignaturePayload = {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "eip155:8453",
        amount: opts.amount,
        asset: BASE_MAINNET.usdc,
        payTo: NULLCLEAR_TREASURY_ADDRESS,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" }
      },
      payload: {
        signature: finalSig,
        authorization
      }
    };
    return encodeBase64Json(payload);
  }

  function installMockUpstreams(opts?: {
    settleDelayMs?: number;
    upstreamDelayMs?: number;
    settleFailReason?: string;
  }) {
    const counts = {
      settle: 0,
      goplus: 0,
      honeypot: 0,
      dexscreener: 0,
      sourcify: 0,
      openchain: 0,
      rpc: 0
    };
    const timestamps: { settleStart?: number; firstComputeStart?: number } = {};
    const settleDelay = opts?.settleDelayMs ?? 220;
    const upstreamDelay = opts?.upstreamDelayMs ?? 180;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("facilitator.payai.network/settle")) {
        counts.settle++;
        timestamps.settleStart = Date.now();
        await new Promise((r) => setTimeout(r, settleDelay));
        if (opts?.settleFailReason) {
          return new Response(
            JSON.stringify({ success: false, errorReason: opts.settleFailReason }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            transaction: "0x" + "ab".repeat(32),
            network: "eip155:8453",
            payer: buyerAccount.address
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (!timestamps.firstComputeStart) timestamps.firstComputeStart = Date.now();

      if (url.includes("api.gopluslabs.io")) {
        counts.goplus++;
        await new Promise((r) => setTimeout(r, upstreamDelay));
        return new Response(
          JSON.stringify({
            result: {
              "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
                token_symbol: "USDC",
                token_name: "USD Coin",
                is_honeypot: "0",
                buy_tax: "0",
                sell_tax: "0",
                is_proxy: "1"
              }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("api.honeypot.is")) {
        counts.honeypot++;
        await new Promise((r) => setTimeout(r, upstreamDelay));
        return new Response(
          JSON.stringify({
            honeypotResult: { isHoneypot: false },
            simulationResult: { buyTax: 0, sellTax: 0 }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("api.dexscreener.com")) {
        counts.dexscreener++;
        await new Promise((r) => setTimeout(r, upstreamDelay));
        return new Response(
          JSON.stringify({
            pairs: [
              {
                chainId: "base",
                baseToken: { symbol: "USDC", name: "USD Coin" },
                liquidity: { usd: 68500000 }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("sourcify.dev")) {
        counts.sourcify++;
        await new Promise((r) => setTimeout(r, upstreamDelay));
        return new Response(
          JSON.stringify({
            match: "exact_match",
            name: "FiatTokenProxy",
            abi: [{ type: "function", name: "transfer", inputs: [{ type: "address" }, { type: "uint256" }] }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("api.openchain.xyz")) {
        counts.openchain++;
        return new Response(JSON.stringify({ result: { function: {} } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // EVM JSON-RPC batch or single call
      counts.rpc++;
      await new Promise((r) => setTimeout(r, Math.min(upstreamDelay, 60)));
      const bodyStr = typeof init?.body === "string" ? init.body : "";
      if (bodyStr.startsWith("[")) {
        return new Response(
          JSON.stringify([
            { jsonrpc: "2.0", id: 1, result: "0x1b20700" },
            { jsonrpc: "2.0", id: 2, result: "0x608060405263a9059cbb63095ea7b3" },
            { jsonrpc: "2.0", id: 3, result: "0x0000000000000000000000002ce6311ddae708829bc0784c967b7d77d19fd779" },
            { jsonrpc: "2.0", id: 4, result: "0x00000000000000000000000007c1d2b633fb8f2f5b20b86b685f7913e2f5b6c4" },
            { jsonrpc: "2.0", id: 5, result: "0x0" },
            { jsonrpc: "2.0", id: 6, result: "0x0" },
            { jsonrpc: "2.0", id: 7, result: "0x0" },
            { jsonrpc: "2.0", id: 8, result: "0x" },
            { jsonrpc: "2.0", id: 9, result: "0x" },
            { jsonrpc: "2.0", id: 10, result: "0x0" },
            { jsonrpc: "2.0", id: 11, result: "0x0" },
            { jsonrpc: "2.0", id: 12, result: "0x0" },
            { jsonrpc: "2.0", id: 13, result: "0x" }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x608060405263a9059cbb63095ea7b3" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    return { counts, timestamps };
  }

  it("overlaps read-only compute with PayAI settlement, avoids double scanTokenForensics, and emits Server-Timing on /v1/bazaar/due-diligence", async () => {
    const kv = createMockKv();
    const { counts } = installMockUpstreams({ settleDelayMs: 250, upstreamDelayMs: 200 });
    const paymentHeader = await signPaymentHeader({ amount: "100000" });

    const start = Date.now();
    const res = await app.request(
      "https://api.nullclear.dev/v1/bazaar/due-diligence?chain=base&address=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      {
        method: "GET",
        headers: {
          "PAYMENT-SIGNATURE": paymentHeader
        }
      },
      {
        ENVIRONMENT: "production",
        FACILITATOR_URL: "https://facilitator.payai.network",
        ARBITER_PRIVATE_KEY: arbiterKey,
        NULLCLEAR_CACHE: kv as any
      }
    );
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.symbol).toBe("USDC");
    expect(data.recommendedAgentAction).toBe("EXECUTE_SAFE");
    expect(data.clearanceCertificate?.signature).toMatch(/^0x/);
    expect(data.contractInspection?.sourcify?.verified).toBe(true);

    // 1. Server-Timing header is present and exposed in CORS
    const serverTiming = res.headers.get("Server-Timing") || "";
    expect(serverTiming).toContain("verify;dur=");
    expect(serverTiming).toContain("settle;dur=");
    expect(serverTiming).toContain("persist;dur=");
    expect(serverTiming).toContain('desc="overlapped"');
    expect(serverTiming).toContain("total;dur=");
    expect(res.headers.get("Access-Control-Expose-Headers") || "").toContain("Server-Timing");

    // 2. Overlap actually happened: total time < settle(250) + compute(200)
    expect(elapsedMs).toBeLessThan(410);

    // 3. Deduplication: scanTokenForensics ran ONCE (not twice!) so GoPlus/Honeypot/DexScreener each hit exactly once
    expect(counts.settle).toBe(1);
    expect(counts.goplus).toBe(1);
    expect(counts.honeypot).toBe(1);
    expect(counts.dexscreener).toBe(1);
    expect(counts.sourcify).toBe(1);

    // 4. Second call hits KV cache for BOTH scan and inspect (zero extra GoPlus/Sourcify calls!)
    const paymentHeader2 = await signPaymentHeader({ amount: "100000" });
    const res2 = await app.request(
      "https://api.nullclear.dev/v1/bazaar/due-diligence?chain=base&address=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      {
        method: "GET",
        headers: { "PAYMENT-SIGNATURE": paymentHeader2 }
      },
      {
        ENVIRONMENT: "production",
        FACILITATOR_URL: "https://facilitator.payai.network",
        ARBITER_PRIVATE_KEY: arbiterKey,
        NULLCLEAR_CACHE: kv as any
      }
    );
    expect(res2.status).toBe(200);
    const data2: any = await res2.json();
    expect(data2.forensics?.cached).toBe(true);
    expect(data2.contractInspection?.cached).toBe(true);
    expect(counts.goplus).toBe(1);
    expect(counts.sourcify).toBe(1);
  });

  it("NEVER triggers speculative prefetch when EIP-3009 signature fails local verification (DoS protection)", async () => {
    const kv = createMockKv();
    const { counts } = installMockUpstreams({
      settleDelayMs: 60,
      upstreamDelayMs: 60,
      settleFailReason: "invalid_exact_evm_payload_signature"
    });
    const badHeader = await signPaymentHeader({ amount: "100000", corruptSignature: true });

    const res = await app.request(
      "https://api.nullclear.dev/v1/bazaar/due-diligence?chain=base&address=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      {
        method: "GET",
        headers: { "PAYMENT-SIGNATURE": badHeader }
      },
      {
        ENVIRONMENT: "production",
        FACILITATOR_URL: "https://facilitator.payai.network",
        ARBITER_PRIVATE_KEY: arbiterKey,
        NULLCLEAR_CACHE: kv as any
      }
    );

    expect(res.status).toBe(400);
    expect(counts.settle).toBe(1);
    // Zero upstream forensic/oracle calls triggered by invalid signature!
    expect(counts.goplus).toBe(0);
    expect(counts.honeypot).toBe(0);
    expect(counts.dexscreener).toBe(0);
    expect(counts.sourcify).toBe(0);
  });

  it("discards prefetched compute and returns 402 if PayAI rejects settlement (e.g. insufficient USDC)", async () => {
    const kv = createMockKv();
    installMockUpstreams({
      settleDelayMs: 80,
      upstreamDelayMs: 40,
      settleFailReason: "insufficient_funds"
    });
    const validSigHeader = await signPaymentHeader({ amount: "100000" });

    const res = await app.request(
      "https://api.nullclear.dev/v1/bazaar/due-diligence?chain=base&address=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      {
        method: "GET",
        headers: { "PAYMENT-SIGNATURE": validSigHeader }
      },
      {
        ENVIRONMENT: "production",
        FACILITATOR_URL: "https://facilitator.payai.network",
        ARBITER_PRIVATE_KEY: arbiterKey,
        NULLCLEAR_CACHE: kv as any
      }
    );

    expect(res.status).toBe(402);
    const body: any = await res.json();
    expect(body.clearanceCertificate).toBeUndefined();
    expect(body.forensics).toBeUndefined();
    expect(body.code).toBe("NONCE_USED_OR_INSUFFICIENT_FUNDS");
  });
});

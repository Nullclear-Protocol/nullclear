import { describe, it, expect, beforeEach } from "vitest";
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

describe("Production Audit Fixes (Tasks 1-5)", () => {
  const arbiterKey = generatePrivateKey();
  const buyerKey = generatePrivateKey();
  const buyerAccount = privateKeyToAccount(buyerKey);

  const testEnv = {
    ARBITER_PRIVATE_KEY: arbiterKey
  };

  beforeEach(() => {
    const store = getArbiterStore();
    store.reset();
  });

  async function buildPassPaymentHeader(opts?: {
    amount?: string;
    validAfter?: string;
    validBefore?: string;
    domainOverride?: Partial<typeof BASE_MAINNET.usdcDomain>;
    encodeSigBase64?: boolean;
    x402Version?: 1 | 2;
    networkOverride?: string;
  }): Promise<string> {
    const amount = opts?.amount ?? "1000000";
    const validAfter = opts?.validAfter ?? "0";
    const validBefore = opts?.validBefore ?? String(Math.floor(Date.now() / 1000) + 600);
    const nonce = ("0x" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`;

    const authorization: EIP3009Authorization = {
      from: buyerAccount.address,
      to: NULLCLEAR_TREASURY_ADDRESS,
      value: amount,
      validAfter,
      validBefore,
      nonce
    };

    const domain = {
      name: opts?.domainOverride?.name ?? BASE_MAINNET.usdcDomain.name,
      version: opts?.domainOverride?.version ?? BASE_MAINNET.usdcDomain.version,
      chainId: opts?.domainOverride?.chainId ?? BASE_MAINNET.chainId,
      verifyingContract: opts?.domainOverride?.verifyingContract ?? BASE_MAINNET.usdc
    };

    const hexSignature = await buyerAccount.signTypedData({
      domain,
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

    let signatureOut: string = hexSignature;
    if (opts?.encodeSigBase64) {
      const clean = hexSignature.slice(2);
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      signatureOut = Buffer.from(bytes).toString("base64");
    }

    if (opts?.x402Version === 1) {
      return encodeBase64Json({
        x402Version: 1,
        scheme: "exact",
        network: opts?.networkOverride ?? "base",
        payload: {
          signature: signatureOut,
          authorization
        }
      });
    }

    const payload: X402PaymentSignaturePayload = {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: (opts?.networkOverride as any) ?? "eip155:8453",
        amount,
        asset: BASE_MAINNET.usdc,
        payTo: NULLCLEAR_TREASURY_ADDRESS,
        maxTimeoutSeconds: 300,
        extra: { name: domain.name, version: domain.version }
      },
      payload: {
        signature: signatureOut as `0x${string}`,
        authorization
      }
    };

    return encodeBase64Json(payload);
  }

  describe("Task 1: EIP-3009 Settlement & Error Discrimination on POST /v1/pass/buy", () => {
    it("accepts valid EIP-3009 signatures in both raw hex and base64-encoded signature buffer formats", async () => {
      const hexHeader = await buildPassPaymentHeader({ amount: "1000000", x402Version: 1 });
      const resHex = await app.fetch(
        new Request("https://api.nullclear.dev/v1/pass/buy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payment": hexHeader
          },
          body: JSON.stringify({ tier: "micro" })
        }),
        testEnv
      );
      expect(resHex.status).toBe(200);
      const jsonHex = (await resHex.json()) as any;
      expect(jsonHex.apiKey).toMatch(/^nc_live_/);
      expect(jsonHex.tier).toBe("micro");

      const b64SigHeader = await buildPassPaymentHeader({
        amount: "5000000",
        encodeSigBase64: true,
        x402Version: 1
      });
      const resB64 = await app.fetch(
        new Request("https://api.nullclear.dev/v1/pass/buy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payment": b64SigHeader
          },
          body: JSON.stringify({ tier: "starter" })
        }),
        testEnv
      );
      expect(resB64.status).toBe(200);
      const jsonB64 = (await resB64.json()) as any;
      expect(jsonB64.apiKey).toMatch(/^nc_live_/);
      expect(jsonB64.tier).toBe("starter");
    });

    it("returns 400 BAD_REQUEST for expired validBefore and invalid domain/signature", async () => {
      const expiredHeader = await buildPassPaymentHeader({
        validBefore: String(Math.floor(Date.now() / 1000) - 60)
      });
      const expiredRes = await app.fetch(
        new Request("https://api.nullclear.dev/v1/pass/buy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payment": expiredHeader
          },
          body: JSON.stringify({ tier: "micro" })
        }),
        testEnv
      );
      expect(expiredRes.status).toBe(400);
      const expiredJson = (await expiredRes.json()) as any;
      expect(expiredJson.code).toBe("AUTHORIZATION_EXPIRED");

      const wrongDomainHeader = await buildPassPaymentHeader({
        domainOverride: { version: "1", name: "USDC" }
      });
      const wrongDomainRes = await app.fetch(
        new Request("https://api.nullclear.dev/v1/pass/buy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payment": wrongDomainHeader
          },
          body: JSON.stringify({ tier: "micro" })
        }),
        testEnv
      );
      expect(wrongDomainRes.status).toBe(400);
      const wrongDomainJson = (await wrongDomainRes.json()) as any;
      expect(wrongDomainJson.code).toBe("INVALID_SIGNATURE");

      const wrongNetworkHeader = await buildPassPaymentHeader({
        networkOverride: "eip155:1"
      });
      const wrongNetRes = await app.fetch(
        new Request("https://api.nullclear.dev/v1/pass/buy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payment": wrongNetworkHeader
          },
          body: JSON.stringify({ tier: "micro" })
        }),
        testEnv
      );
      expect(wrongNetRes.status).toBe(400);
    });

    it("discriminates 402 NONCE_USED_OR_INSUFFICIENT_FUNDS vs 502 RELAYER_ERROR when settlement fails in production", async () => {
      const validHeader = await buildPassPaymentHeader({ amount: "1000000" });
      const origFetch = globalThis.fetch;

      try {
        // 1. Relayer out of Base ETH for gas -> 502 RELAYER_ERROR
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (url.includes("mock-base-rpc.test")) {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            if (body.method === "eth_getBalance") {
              return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x0" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
              });
            }
          }
          if (url.includes("mock-facilitator.test")) {
            return new Response("upstream gateway timeout", { status: 504 });
          }
          return origFetch(input, init);
        }) as typeof fetch;

        const relayerFailRes = await app.fetch(
          new Request("https://api.nullclear.dev/v1/pass/buy", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Payment": validHeader
            },
            body: JSON.stringify({ tier: "micro" })
          }),
          {
            ...testEnv,
            ENVIRONMENT: "production",
            SETTLEMENT_MODE: "onchain",
            BASE_MAINNET_RPC_URL: "https://mock-base-rpc.test",
            FACILITATOR_URL: "https://mock-facilitator.test"
          }
        );
        expect(relayerFailRes.status).toBe(502);
        const relayerFailJson = (await relayerFailRes.json()) as any;
        expect(relayerFailJson.code).toBe("RELAYER_ERROR");

        // 2. Facilitator reports nonce reuse / insufficient USDC -> 402 NONCE_USED_OR_INSUFFICIENT_FUNDS
        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (url.includes("mock-facilitator.test")) {
            return new Response(
              JSON.stringify({
                success: false,
                errorReason: "FiatTokenV2: authorization is used"
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return origFetch(input, undefined);
        }) as typeof fetch;

        const nonceUsedRes = await app.fetch(
          new Request("https://api.nullclear.dev/v1/pass/buy", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Payment": validHeader
            },
            body: JSON.stringify({ tier: "micro" })
          }),
          {
            ...testEnv,
            ENVIRONMENT: "production",
            SETTLEMENT_MODE: "facilitator",
            FACILITATOR_URL: "https://mock-facilitator.test"
          }
        );
        expect(nonceUsedRes.status).toBe(402);
        const nonceUsedJson = (await nonceUsedRes.json()) as any;
        expect(nonceUsedJson.error).toContain("NONCE_USED_OR_INSUFFICIENT_FUNDS");
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe("Task 2: Strict 402 Default & Opt-In 10/Day Free Quota on /v1/bazaar/*", () => {
    it("returns strict 402 on call #1 without opt-in header, allows 10 calls with x-nullclear-free-trial: true, and returns 402 with WWW-Authenticate + schema/example on call #11", async () => {
      const ip = "198.51.100.77";
      const strict402Res = await app.fetch(
        new Request("https://api.nullclear.dev/v1/bazaar/audit?agentId=124595", {
          headers: {
            "CF-Connecting-IP": ip,
            "User-Agent": "BlockchainIQ-ETL (team@blockchainiq.co) x402-ros"
          }
        }),
        { ...testEnv, ENVIRONMENT: "production" }
      );
      expect(strict402Res.status).toBe(402);
      expect(strict402Res.headers.get("PAYMENT-REQUIRED")).toBeTruthy();

      for (let i = 1; i <= 10; i++) {
        const res = await app.fetch(
          new Request("https://api.nullclear.dev/v1/bazaar/audit?agentId=124595", {
            headers: {
              "CF-Connecting-IP": ip,
              "User-Agent": "BlockchainIQ-ETL (team@blockchainiq.co) x402-ros",
              "x-nullclear-free-trial": "true"
            }
          }),
          { ...testEnv, ENVIRONMENT: "production" }
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("x-nullclear-remaining-free-calls")).toBe(String(10 - i));
      }

      const res11 = await app.fetch(
        new Request("https://api.nullclear.dev/v1/bazaar/audit?agentId=124595", {
          headers: {
            "CF-Connecting-IP": ip,
            "User-Agent": "BlockchainIQ-ETL (team@blockchainiq.co) x402-ros",
            "x-nullclear-free-trial": "true"
          }
        }),
        { ...testEnv, ENVIRONMENT: "production" }
      );
      expect(res11.status).toBe(402);

      const wwwAuth = res11.headers.get("WWW-Authenticate") || "";
      expect(wwwAuth).toContain('x402 realm="NullClear"');
      expect(wwwAuth).toContain('token="USDC"');
      expect(wwwAuth).toContain('network="base"');
      expect(wwwAuth).toContain(`recipient="${NULLCLEAR_TREASURY_ADDRESS}"`);
      expect(wwwAuth).toContain('amount="5000"');
      expect(wwwAuth).toContain(`asset="${BASE_MAINNET.usdc}"`);
      expect(wwwAuth).toContain('facilitator="https://api.nullclear.dev/v1/pass/buy"');

      const body11 = (await res11.json()) as any;
      expect(body11.schema).toBeDefined();
      expect(body11.example).toBeDefined();
    });
  });

  describe("Task 3: Human Browser Content Negotiation & /agents.md", () => {
    it("redirects Accept: text/html requests on /v1/bazaar/inspect and /v1/pass/buy to UI pages", async () => {
      const inspectRedirect = await app.fetch(
        new Request("https://api.nullclear.dev/v1/bazaar/inspect", {
          headers: { Accept: "text/html,application/xhtml+xml" }
        }),
        testEnv
      );
      expect(inspectRedirect.status).toBe(302);
      expect(inspectRedirect.headers.get("Location")).toBe("/firewall");

      const passRedirect = await app.fetch(
        new Request("https://api.nullclear.dev/v1/pass/buy?tier=starter", {
          headers: {
            Accept: "text/html",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
          }
        }),
        testEnv
      );
      expect(passRedirect.status).toBe(302);
      expect(passRedirect.headers.get("Location")).toBe("/buy-pass?tier=starter");

      const buyPassPage = await app.fetch(
        new Request("https://api.nullclear.dev/buy-pass?tier=starter"),
        testEnv
      );
      expect(buyPassPage.status).toBe(200);
      const html = await buyPassPage.text();
      expect(html).toContain("Connect Web3 Wallet");
      expect(html).toContain("ops@nullclear.dev");
    });

    it("serves GET /agents.md with HTTP 200 and Content-Type: text/markdown; charset=utf-8", async () => {
      const res = await app.fetch(
        new Request("https://api.nullclear.dev/agents.md", {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
          }
        }),
        testEnv
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
      const md = await res.text();
      expect(md).toContain("# NullClear Protocol");
      expect(md).toContain("https://api.nullclear.dev/v1/guard");
    });
  });

  describe("Task 4: Edge Caching & KV Lookup on Public Scorecards", () => {
    it("sets Cloudflare edge Cache-Control headers and serves cached Solana scorecards from KV without calling Solana RPC", async () => {
      const pumpMint = "So11111111111111111111111111111111111111112";
      const kvMap = new Map<string, string>();
      const mockKv = {
        get: async (k: string) => kvMap.get(k) ?? null,
        put: async (k: string, v: string) => {
          kvMap.set(k, v);
        }
      };

      const cachedPayload = {
        address: pumpMint,
        chain: "solana",
        symbol: "PUMP",
        name: "Pump Test Token",
        llmDigest: "VERIFIED CLEAR (92/100): Pump Test Token on SOLANA",
        recommendedAgentAction: "EXECUTE_SAFE",
        score: 92,
        verdict: "VERIFIED CLEAR",
        isProxy: false,
        implementationAddress: null,
        buyTaxPercent: 0,
        sellTaxPercent: 0,
        provenance: {
          chainId: "solana-mainnet",
          blockNumber: 300000000,
          timestampIso: new Date().toISOString(),
          attestationSha256: "0x" + "ab".repeat(32),
          sourcesAgreed: ["solana_rpc"]
        },
        evidence: {
          isContract: true,
          isProxy: false,
          proxyType: null,
          implementationAddress: null,
          adminAddress: null,
          isHoneypot: false,
          buyTaxPercent: 0,
          sellTaxPercent: 0,
          liquidityUsd: 50000,
          lpLockedPercent: 95,
          topHoldersPercent: 12,
          ownerAddress: null,
          ownerStatus: "RENOUNCED",
          hasSelfDestruct: false,
          hasDelegateCall: false,
          functionSelectorsCount: 0,
          dangerousSelectorsFound: []
        },
        links: {
          webReportUrl: `https://nullclear.com/scan/solana/${pumpMint}`,
          markdownTwinUrl: `https://nullclear.com/scan/solana/${pumpMint}.md`,
          ogImageUrl: `https://nullclear.com/og/solana/${pumpMint}.svg`,
          xShareIntentUrl: "https://x.com/intent/tweet"
        }
      };
      kvMap.set(`scan_v22:solana:${pumpMint}`, JSON.stringify(cachedPayload));

      let rpcFetchCount = 0;
      const origFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        rpcFetchCount++;
        throw new Error("Should not hit upstream RPC on KV cache hit");
      }) as typeof fetch;

      try {
        const htmlRes = await app.fetch(
          new Request(`https://nullclear.com/scan/solana/${pumpMint}`, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)" }
          }),
          { ...testEnv, KV: mockKv as any }
        );
        expect(htmlRes.status).toBe(200);
        expect(htmlRes.headers.get("Cache-Control")).toBe(
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        );
        expect(htmlRes.headers.get("X-NullClear-Cache")).toBe("KV_HIT");
        expect(rpcFetchCount).toBe(0);

        const mdRes = await app.fetch(
          new Request(`https://nullclear.com/scan/solana/${pumpMint}.md`, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)" }
          }),
          { ...testEnv, KV: mockKv as any }
        );
        expect(mdRes.status).toBe(200);
        expect(mdRes.headers.get("Content-Type")).toContain("text/markdown");
        expect(mdRes.headers.get("Cache-Control")).toBe(
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        );
        expect(rpcFetchCount).toBe(0);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});

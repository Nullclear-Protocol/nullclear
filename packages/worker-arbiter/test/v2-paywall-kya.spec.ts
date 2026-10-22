import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  BASE_MAINNET,
  EIP3009_TYPES,
  encodeBase64Json,
  type EIP3009Authorization,
  type X402PaymentOption,
  type X402PaymentSignaturePayload
} from "@nullclear/shared";
import app from "../src/index.js";
import { getArbiterStore } from "../src/env.js";
import {
  extractPaymentAuthorization,
  parseUpstream402Challenge,
  attachDualX402Headers
} from "../src/utils/x402-headers.js";
import { inspectSoftPaywallAndContent } from "../src/services/soft-paywall-guard.js";

describe("Next-Gen Protocol Upgrades: x402 V1/V2 Headers, Soft-Paywall Guard & Pre-Flight KYA", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let lastUpstreamHeaders: http.IncomingHttpHeaders = {};

  const arbiterKey = generatePrivateKey();
  const buyerKey = generatePrivateKey();
  const buyerAccount = privateKeyToAccount(buyerKey);
  const sellerKey = generatePrivateKey();
  const sellerAccount = privateKeyToAccount(sellerKey);

  const testEnv = {
    ARBITER_PRIVATE_KEY: arbiterKey
  };

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      lastUpstreamHeaders = req.headers;
      const url = req.url || "/";
      if (url === "/honest-b2b") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ticker: "BTC-USDC",
            price: 68500,
            active: true,
            kyaHeaderReceived: Boolean(req.headers["x-nullclear-verified-kya"]),
            kyaSignatureReceived: Boolean(req.headers["x-nullclear-kya-signature"])
          })
        );
      } else if (url === "/captcha-trap") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><head><title>Attention Required! | Cloudflare</title></head><body><div class=\"cf-turnstile\">Verify you are human</div></body></html>"
        );
      } else if (url === "/paywall-trap") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><article><h1>Alpha Report</h1><p>Subscribe to continue reading the full institutional analysis.</p></article></body></html>"
        );
      } else if (url === "/teaser-trap") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>Short</body></html>");
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address() as { port: number };
        mockServerPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  beforeEach(() => {
    const store = getArbiterStore();
    store.reset();
    lastUpstreamHeaders = {};
  });

  async function createSignedAuth(
    payTo: Address,
    amount = "10000",
    version: 1 | 2 = 2
  ): Promise<string> {
    const nonce = ("0x" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`;

    const validAfter = "0";
    const validBefore = String(Math.floor(Date.now() / 1000) + 600);

    const authorization: EIP3009Authorization = {
      from: buyerAccount.address,
      to: payTo,
      value: amount,
      validAfter,
      validBefore,
      nonce
    };

    const signature = await buyerAccount.signTypedData({
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

    const accepted: X402PaymentOption = {
      scheme: "exact",
      network: "eip155:8453",
      amount,
      asset: BASE_MAINNET.usdc,
      payTo,
      maxTimeoutSeconds: 600
    };

    if (version === 1) {
      return encodeBase64Json({
        x402Version: 1,
        scheme: "exact",
        network: "base",
        payload: {
          signature,
          authorization
        }
      });
    }

    const payload: X402PaymentSignaturePayload = {
      x402Version: 2,
      resource: { url: `http://127.0.0.1:${mockServerPort}/honest-b2b` },
      accepted,
      payload: {
        signature,
        authorization
      }
    };

    return encodeBase64Json(payload);
  }

  describe("TASK 1.1: Bidirectional x402 V1 & V2 Header Compatibility", () => {
    it("extractPaymentAuthorization decodes PAYMENT-SIGNATURE (V2), X-Payment (V1), and Authorization: x402 ...", async () => {
      const v2Header = await createSignedAuth(sellerAccount.address, "10000", 2);
      const reqV2 = new Request("https://api.nullclear.dev/v1/clear", {
        headers: { "PAYMENT-SIGNATURE": v2Header }
      });
      const parsedV2 = extractPaymentAuthorization(reqV2);
      expect(parsedV2).not.toBeNull();
      expect(parsedV2?.protocolVersion).toBe("v2");
      expect(parsedV2?.from.toLowerCase()).toBe(buyerAccount.address.toLowerCase());
      expect(parsedV2?.value).toBe("10000");

      const v1Header = await createSignedAuth(sellerAccount.address, "15000", 1);
      const reqV1 = new Request("https://api.nullclear.dev/v1/clear", {
        headers: { "X-Payment": v1Header }
      });
      const parsedV1 = extractPaymentAuthorization(reqV1);
      expect(parsedV1).not.toBeNull();
      expect(parsedV1?.protocolVersion).toBe("v1");
      expect(parsedV1?.value).toBe("15000");

      const reqAuth = new Request("https://api.nullclear.dev/v1/clear", {
        headers: { Authorization: `x402 ${v2Header}` }
      });
      const parsedAuth = extractPaymentAuthorization(reqAuth);
      expect(parsedAuth).not.toBeNull();
      expect(parsedAuth?.from.toLowerCase()).toBe(buyerAccount.address.toLowerCase());
    });

    it("parseUpstream402Challenge parses PAYMENT-REQUIRED, X-Payment-Required, crawler-price, and JSON accepts", () => {
      const challengeB64 = encodeBase64Json({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            amount: "25000",
            payTo: sellerAccount.address,
            description: "V2 Feed"
          }
        ]
      });
      const resV2 = new Response("Payment Required", {
        status: 402,
        headers: { "PAYMENT-REQUIRED": challengeB64 }
      });
      const parsedV2 = parseUpstream402Challenge(resV2);
      expect(parsedV2?.sellerAddress).toBe(sellerAccount.address);
      expect(parsedV2?.priceAtomic).toBe("25000");

      const resCrawler = new Response("Payment Required", {
        status: 402,
        headers: {
          "crawler-price": "0.05",
          "Pay-To": sellerAccount.address
        }
      });
      const parsedCrawler = parseUpstream402Challenge(resCrawler);
      expect(parsedCrawler?.priceAtomic).toBe("50000");
      expect(parsedCrawler?.sellerAddress).toBe(sellerAccount.address);
    });

    it("accepts both PAYMENT-SIGNATURE (V2) and X-Payment (V1) on /v1/clear and /https://... and returns dual response headers", async () => {
      const v2Sig = await createSignedAuth(sellerAccount.address, "10000", 2);
      const clearResV2 = await app.fetch(
        new Request("http://localhost/v1/clear", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "PAYMENT-SIGNATURE": v2Sig
          },
          body: JSON.stringify({
            targetUrl: `http://127.0.0.1:${mockServerPort}/honest-b2b`
          })
        }),
        testEnv
      );
      expect(clearResV2.status).toBe(200);
      expect(clearResV2.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
      expect(clearResV2.headers.get("X-Payment-Response")).toBeTruthy();
      expect(clearResV2.headers.get("X-NullClear-Verified")).toBe("true");

      const v1Sig = await createSignedAuth(sellerAccount.address, "10000", 1);
      const proxyResV1 = await app.fetch(
        new Request(`http://localhost/http://127.0.0.1:${mockServerPort}/honest-b2b`, {
          method: "GET",
          headers: {
            "X-Payment": v1Sig
          }
        }),
        testEnv
      );
      expect(proxyResV1.status).toBe(200);
      expect(proxyResV1.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
      expect(proxyResV1.headers.get("X-Payment-Response")).toBeTruthy();
      expect(proxyResV1.headers.get("X-NullClear-Verified")).toBe("true");
    });
  });

  describe("TASK 1.2: Publisher Soft-Paywall, CAPTCHA & Truncated Teaser Guard", () => {
    it("inspectSoftPaywallAndContent flags CAPTCHA_BLOCK, SOFT_PAYWALL, and TRUNCATED_TEASER", () => {
      const rCaptcha = inspectSoftPaywallAndContent(
        "<html><title>Just a moment...</title><div class='cf-turnstile'></div></html>",
        "text/html",
        200
      );
      expect(rCaptcha.blocked).toBe(true);
      expect(rCaptcha.ruleTriggered).toBe("CAPTCHA_BLOCK");

      const rPaywall = inspectSoftPaywallAndContent(
        "<html><body><h1>Market Wrap</h1><p>You have reached your free article limit. Subscribe to continue reading.</p></body></html>",
        "text/html",
        200
      );
      expect(rPaywall.blocked).toBe(true);
      expect(rPaywall.ruleTriggered).toBe("SOFT_PAYWALL");

      const rTeaser = inspectSoftPaywallAndContent(
        "<html><body></body></html>",
        "text/html",
        200
      );
      expect(rTeaser.blocked).toBe(true);
      expect(rTeaser.ruleTriggered).toBe("TRUNCATED_TEASER");
    });

    it("/v1/sandbox/soft-paywall-seller triggers SOFT_PAYWALL_OR_CAPTCHA_DETECTED, returns HTTP 502, and shreds settlement (0 USDC charged)", async () => {
      const v2Sig = await createSignedAuth(sellerAccount.address, "10000", 2);

      // 1. Test via /v1/clear
      const clearRes = await app.fetch(
        new Request("http://localhost/v1/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUrl: "https://api.nullclear.dev/v1/sandbox/soft-paywall-seller",
            paymentSignatureHeader: v2Sig
          })
        }),
        testEnv
      );
      expect(clearRes.status).toBe(502);
      const clearBody = (await clearRes.json()) as any;
      expect(clearBody.error).toBe("NULLCLEAR_ESCROW_ABORTED");
      expect(clearBody.reason).toBe("SOFT_PAYWALL_OR_CAPTCHA_DETECTED");
      expect(clearBody.settled).toBe(false);
      expect(clearBody.amountChargedAtomic).toBe("0");

      // 2. Test via /https://... URL-prefix proxy against mock paywall trap
      const proxySig = await createSignedAuth(sellerAccount.address, "10000", 2);
      const proxyRes = await app.fetch(
        new Request(`http://localhost/http://127.0.0.1:${mockServerPort}/paywall-trap`, {
          method: "GET",
          headers: { "PAYMENT-SIGNATURE": proxySig }
        }),
        testEnv
      );
      expect(proxyRes.status).toBe(502);
      const proxyBody = (await proxyRes.json()) as any;
      expect(proxyBody.error).toBe("NULLCLEAR_ESCROW_ABORTED");
      expect(proxyBody.reason).toBe("SOFT_PAYWALL_OR_CAPTCHA_DETECTED");
      expect(proxyBody.ruleTriggered).toBe("SOFT_PAYWALL");
      expect(proxyBody.settled).toBe(false);
      expect(proxyBody.amountChargedAtomic).toBe("0");
    });
  });

  describe("TASK 1.3: Pre-Flight Corporate KYA Header Forwarding", () => {
    it("attaches X-NullClear-Verified-KYA & X-NullClear-KYA-Signature to upstream requests and verifies via POST /v1/kya/verify-header", async () => {
      // 1. Register KYA mandate for buyerAccount.address
      const attestRes = await app.fetch(
        new Request("http://localhost/v1/kya/attest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId: 8453,
            mandate: {
              agentId: "124595",
              corporateEntity: "Acme Quant Desk LLC",
              entityRegistrationNumber: "DE-994821",
              agentWallet: buyerAccount.address,
              maxTxLimitUsd: 50,
              maxPerCallAtomic: "50000000",
              liabilityCoverageUsd: 100000,
              jurisdiction: "US-DE"
            }
          })
        }),
        testEnv
      );
      expect(attestRes.status).toBe(200);

      // 2. Call /v1/clear with buyer's signed EIP-3009 authorization
      const v2Sig = await createSignedAuth(sellerAccount.address, "10000", 2);
      const clearRes = await app.fetch(
        new Request("http://localhost/v1/clear", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "PAYMENT-SIGNATURE": v2Sig
          },
          body: JSON.stringify({
            targetUrl: `http://127.0.0.1:${mockServerPort}/honest-b2b`
          })
        }),
        testEnv
      );
      expect(clearRes.status).toBe(200);
      const clearJson = (await clearRes.json()) as any;
      expect(clearJson.data.kyaHeaderReceived).toBe(true);
      expect(clearJson.data.kyaSignatureReceived).toBe(true);

      const kyaHeader = lastUpstreamHeaders["x-nullclear-verified-kya"] as string;
      const kyaSig = lastUpstreamHeaders["x-nullclear-kya-signature"] as string;
      expect(kyaHeader).toBeTruthy();
      expect(kyaSig).toBeTruthy();

      // 3. Verify the KYA header via POST /v1/kya/verify-header
      const verifyRes = await app.fetch(
        new Request("http://localhost/v1/kya/verify-header", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kyaHeader,
            signature: kyaSig
          })
        }),
        testEnv
      );
      expect(verifyRes.status).toBe(200);
      const verifyJson = (await verifyRes.json()) as any;
      expect(verifyJson.verified).toBe(true);
      expect(verifyJson.payload.corporateEntity).toBe("Acme Quant Desk LLC");
      expect(verifyJson.payload.jurisdiction).toBe("US-DE");
      expect(verifyJson.payload.maxPerCallAtomic).toBe("50000000");
      expect(verifyJson.payload.arbiterAgentId).toBe(124595);
    });
  });
});

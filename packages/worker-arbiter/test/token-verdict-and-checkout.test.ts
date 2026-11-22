import { describe, it, expect } from "vitest";
import app from "../src/index.js";
import {
  buildTokenVerdictPayload,
  renderTokenVerdictSvg
} from "../src/services/verdict-card.js";
import { verifyStripeWebhookSignature } from "../src/routes/passes.js";
import type { ForensicScanPayload } from "../src/services/forensics-engine.js";

function makeScanFixture(overrides?: Partial<ForensicScanPayload>): ForensicScanPayload {
  return {
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    chain: "base",
    symbol: "USDC",
    name: "USD Coin",
    llmDigest: "Verified USDC on Base",
    recommendedAgentAction: "EXECUTE_SAFE",
    score: 99,
    verdict: "VERIFIED CLEAR",
    provenance: {
      chainId: 8453,
      blockNumber: 60565619,
      timestampIso: "2026-11-22T00:00:00.000Z",
      attestationSha256: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      sourcesAgreed: ["rpc", "dexscreener"]
    },
    evidence: {
      isContract: true,
      isProxy: false,
      proxyType: null,
      implementationAddress: null,
      isHoneypot: false,
      buyTaxPercent: 0,
      sellTaxPercent: 0,
      liquidityUsd: 103137.73,
      lpLockedPercent: 100,
      topHoldersPercent: 12,
      ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
      hasSelfDestruct: false,
      hasDelegateCall: false,
      functionSelectorsCount: 28,
      dangerousSelectorsFound: []
    },
    links: {
      webReportUrl: "https://nullclear.com/scan/base/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      markdownTwinUrl: "https://nullclear.com/scan/base/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.md",
      xShareIntentUrl: "https://x.com/intent/tweet"
    },
    ...overrides
  };
}

describe("Option B wire cleanup, Token Verdict & Card Checkout", () => {
  it("keeps 402 response headers compact (< 6 KB) without duplicate X-Payment-Required", async () => {
    const res = await app.request("/v1/bazaar/token-security", {
      headers: { Accept: "application/json" }
    });
    expect(res.status).toBe(402);
    expect(res.headers.get("payment-required")).toBeTruthy();
    expect(res.headers.get("x-payment-required")).toBeNull();

    let totalHeaderBytes = 0;
    res.headers.forEach((v, k) => {
      totalHeaderBytes += k.length + v.length + 4;
    });
    expect(totalHeaderBytes).toBeLessThan(6000);
  });

  it("returns strict HTTP 402 on /v1/bazaar/token-verdict by default with compact headers and omits cardCheckoutUrl when Stripe is unset", async () => {
    const res = await app.request("/v1/bazaar/token-verdict", {
      headers: { Accept: "application/json" }
    });
    expect(res.status).toBe(402);
    expect(res.headers.get("payment-required")).toBeTruthy();
    expect(res.headers.get("x-payment-required")).toBeNull();
    const json: any = await res.json();
    expect(json.amount).toBe("5000");
    expect(json._nullclear?.cardCheckoutUrl).toBeUndefined();
    expect(json._nullclear?.cardCheckoutEndpoint).toBeUndefined();

    // /buy-pass hides card checkout buttons when STRIPE_SECRET_KEY is unset
    const buyPassRes = await app.request("/buy-pass");
    expect(buyPassRes.status).toBe(200);
    const html = await buyPassRes.text();
    expect(html).toContain("Connect Web3 Wallet");
    expect(html).not.toContain('id="cardBtn"');
  });

  it("maps safe, high-tax, and honeypot scans into A/C/F verdicts and valid escaped SVGs", () => {
    const safe = buildTokenVerdictPayload(makeScanFixture());
    expect(safe.grade).toBe("A");
    expect(safe.recommendedAgentAction).toBe("EXECUTE_SAFE");
    expect(safe.scorecardUrl).toBe(
      "https://nullclear.dev/verdict/base/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
    );
    expect(safe.shareCardImageUrl).toBe(
      "https://api.nullclear.dev/v1/verdict-card/base/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.svg"
    );

    const svgSafe = renderTokenVerdictSvg(safe);
    expect(svgSafe).toContain("<svg");
    expect(svgSafe).toContain("EXECUTE_SAFE");
    expect(svgSafe).toContain("USDC");

    const trap = buildTokenVerdictPayload(
      makeScanFixture({
        symbol: "RUG<script>",
        score: 8,
        verdict: "CRITICAL TRAP",
        recommendedAgentAction: "ABORT_CRITICAL_TRAP",
        evidence: {
          ...makeScanFixture().evidence,
          isHoneypot: true,
          sellTaxPercent: 100
        }
      })
    );
    expect(trap.grade).toBe("F");
    expect(trap.recommendedAgentAction).toBe("BLOCK_HONEYPOT");
    const svgTrap = renderTokenVerdictSvg(trap);
    expect(svgTrap).toContain("BLOCK_HONEYPOT");
    expect(svgTrap).not.toContain("<script>");
    expect(svgTrap).toContain("&lt;script&gt;");

    const highTax = buildTokenVerdictPayload(
      makeScanFixture({
        score: 62,
        verdict: "CAUTION",
        recommendedAgentAction: "CAUTION_HIGH_RISK",
        evidence: {
          ...makeScanFixture().evidence,
          buyTaxPercent: 7,
          sellTaxPercent: 8
        }
      })
    );
    expect(highTax.grade).toBe("C");
    expect(highTax.recommendedAgentAction).toBe("CAUTION_HIGH_TAX");
    expect(highTax.evidence.buyTaxBps).toBe(700);
    expect(highTax.evidence.sellTaxBps).toBe(800);
  });

  it("exposes /v1/bazaar/token-verdict in /.well-known/x402, /openapi.json and /llms.txt", async () => {
    const [x402Res, oaRes, llmsRes] = await Promise.all([
      app.request("/.well-known/x402"),
      app.request("/openapi.json"),
      app.request("/llms.txt")
    ]);
    const x402: any = await x402Res.json();
    expect(x402.resources).toContain("https://api.nullclear.dev/v1/bazaar/token-verdict");

    const oa: any = await oaRes.json();
    expect(oa.paths["/v1/bazaar/token-verdict"]?.get).toBeTruthy();

    const llms = await llmsRes.text();
    expect(llms).toContain("/v1/bazaar/token-verdict");
    expect(llms).toContain("/v1/pass/checkout");
  });

  it("gates POST /v1/pass/checkout cleanly when STRIPE_SECRET_KEY is unset and verifies Stripe HMAC signatures", async () => {
    const res = await app.request("/v1/pass/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "builder" })
    });
    expect(res.status).toBe(503);
    const json: any = await res.json();
    expect(json.code).toBe("CARD_CHECKOUT_NOT_CONFIGURED");
    expect(json.selectedTier.priceUsd).toBe(20);
    expect(json.selectedTier.credits).toBe(10000);
    expect(json.requiredSecrets).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);

    // Verify Stripe HMAC-SHA256 helper
    const secret = "whsec_test_nullclear_12345";
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${body}`));
    const sigHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const validCheck = await verifyStripeWebhookSignature(body, `t=${ts},v1=${sigHex}`, secret);
    expect(validCheck.valid).toBe(true);

    const badCheck = await verifyStripeWebhookSignature(body, `t=${ts},v1=${"0".repeat(64)}`, secret);
    expect(badCheck.valid).toBe(false);
  });
});

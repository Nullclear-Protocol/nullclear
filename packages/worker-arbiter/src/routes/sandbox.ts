import { Hono } from "hono";
import { encodeBase64Json, NULLCLEAR_TREASURY_ADDRESS } from "@nullclear/shared";
import type { Env } from "../env.js";
import { buildNullClearMetadata } from "../middleware/free-tier.js";
import { attachDualX402Headers } from "../utils/x402-headers.js";

export const sandboxRouter = new Hono<Env>();

export const SOFT_PAYWALL_SANDBOX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Attention Required! | Cloudflare</title>
</head>
<body>
  <div class="cf-turnstile" data-sitekey="0x4AAAAAA_sandbox_turnstile"></div>
  <h1>Subscribe to continue reading...</h1>
  <p>You have reached your free article limit. Sign in to read the full article or upgrade your plan to access members-only content.</p>
  <p>Verify you are human to proceed.</p>
</body>
</html>`;

function createPaymentRequiredHeader(
  resourcePath: string,
  description: string,
  bazaarInfo?: {
    description: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    schema: Record<string, unknown>;
  }
) {
  const payload: Record<string, unknown> = {
    x402Version: 2,
    scheme: "exact",
    network: "eip155:8453",
    amount: "1000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: NULLCLEAR_TREASURY_ADDRESS,
    maxTimeoutSeconds: 60,
    resource: {
      url: `https://api.nullclear.dev${resourcePath}`,
      description
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: NULLCLEAR_TREASURY_ADDRESS,
        maxTimeoutSeconds: 60
      }
    ]
  };

  if (bazaarInfo) {
    payload.extensions = {
      bazaar: {
        discoverable: true,
        description: bazaarInfo.description,
        info: {
          input: bazaarInfo.input,
          output: bazaarInfo.output
        },
        schema: bazaarInfo.schema
      }
    };
  }

  return encodeBase64Json(payload);
}

function hasPayment(c: any): boolean {
  return Boolean(
    c.req.header("payment-signature") ||
    c.req.header("x-payment") ||
    c.req.header("x-nullclear-authorization") ||
    c.req.header("x-nullclear-escrow-hold") === "true" ||
    c.req.header("x-nullclear-verified-escrow")
  );
}

sandboxRouter.get("/", (c) => {
  return c.json({
    service: "NullClear Sandbox Testing Endpoints",
    documentation: "https://api.nullclear.dev/openapi.json",
    endpoints: {
      marketFeed: "GET /v1/sandbox/market-feed (payable: 1000 atomic / $0.001 USDC)",
      hallucinatingSeller: "GET /v1/sandbox/hallucinating-seller (payable: 1000 atomic / $0.001 USDC)",
      softPaywallSeller: "GET /v1/sandbox/soft-paywall-seller (returns HTTP 200 OK with fake Soft-Paywall / Turnstile HTML)",
      crashingSeller: "GET /v1/sandbox/crashing-seller (payable: 1000 atomic / $0.001 USDC)"
    },
    _nullclear: buildNullClearMetadata()
  });
});

// 1. GET & POST /v1/sandbox/market-feed
sandboxRouter.all("/market-feed", async (c) => {
  c.header(
    "Access-Control-Expose-Headers",
    "PAYMENT-REQUIRED, Payment-Required, X-Payment-Required, X-Payment-Response, Pay-To, PAYMENT-RESPONSE, X-NullClear-Attestation"
  );
  c.header("Pay-To", NULLCLEAR_TREASURY_ADDRESS);

  if (!hasPayment(c)) {
    const bazaarExtension = {
      discoverable: true,
      description:
        "NullClear Verified Market Feed & Schema Canary ($0.01 USDC) with live cross-verified spot price on Base Mainnet (eip155:8453).",
      info: {
        input: {
          type: "http",
          method: "GET",
          queryParams: {
            asset: {
              type: "string",
              example: "ETH",
              description: "Asset symbol (default ETH)"
            }
          }
        },
        output: {
          type: "json",
          example: {
            asset: "ETH/USDC",
            price: 2645.5,
            source: "NullClear Verified Feed",
            timestamp: 1729045678901
          }
        }
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          input: {
            type: "object",
            properties: {
              type: { type: "string", const: "http" },
              method: { type: "string", enum: ["GET", "POST"] },
              asset: { type: "string", default: "ETH", example: "ETH" },
              queryParams: {
                type: "object",
                properties: {
                  asset: { type: "string", default: "ETH", example: "ETH" }
                }
              },
              body: {
                type: "object",
                properties: {
                  asset: { type: "string", default: "ETH", example: "ETH" }
                }
              }
            }
          },
          output: {
            type: "object",
            required: ["asset", "price", "source", "timestamp"],
            properties: {
              type: { type: "string", const: "json" },
              asset: { type: "string" },
              price: { type: "number" },
              source: { type: "string" },
              timestamp: { type: "integer" },
              example: {
                type: "object",
                required: ["asset", "price", "source", "timestamp"],
                properties: {
                  asset: { type: "string" },
                  price: { type: "number" },
                  source: { type: "string" },
                  timestamp: { type: "integer" }
                }
              }
            }
          }
        }
      }
    };

    const bazaarHeader = createPaymentRequiredHeader(
      "/v1/sandbox/market-feed",
      "NullClear Verified Market Feed & Schema Canary ($0.01 USDC)",
      {
        description: bazaarExtension.description,
        input: bazaarExtension.info.input,
        output: bazaarExtension.info.output,
        schema: bazaarExtension.schema
      }
    );

    attachDualX402Headers(c, { paymentRequired: bazaarHeader });
    return c.json(
      {
        error: "Payment Required",
        message: "x402 payment required: 1000 atomic units ($0.001 USDC) on Base Mainnet",
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000",
        payTo: NULLCLEAR_TREASURY_ADDRESS,
        resource: {
          url: "https://api.nullclear.dev/v1/sandbox/market-feed",
          description: bazaarExtension.description,
          mimeType: "application/json"
        },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            amount: "1000",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: NULLCLEAR_TREASURY_ADDRESS,
            maxTimeoutSeconds: 60
          }
        ],
        extensions: {
          bazaar: bazaarExtension
        },
        _nullclear: buildNullClearMetadata()
      },
      402
    );
  }

  let livePrice = 2645.50;
  if (c.env?.ENVIRONMENT === "production") {
    try {
      const cbRes = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
        headers: { "User-Agent": "NullClear-MarketFeed/1.1" }
      });
      if (cbRes.ok) {
        const cbData: any = await cbRes.json();
        const p = parseFloat(cbData?.data?.amount);
        if (p > 0) livePrice = p;
      }
    } catch {}
  }

  return c.json({
    asset: "ETH/USDC",
    price: livePrice,
    source: "NullClear Verified Feed",
    timestamp: Date.now(),
    _nullclear: buildNullClearMetadata()
  });
});

// 2. GET & POST /v1/sandbox/hallucinating-seller
sandboxRouter.all("/hallucinating-seller", (c) => {
  if (!hasPayment(c)) {
    const bazaarHeader = createPaymentRequiredHeader(
      "/v1/sandbox/hallucinating-seller",
      "NullClear Sandbox Hallucinating Seller",
      {
        description: "Synthetic failing seller returning invalid data & LLM refusal strings to verify NullClear schema-escrow failover protection on Base Mainnet.",
        input: { type: "http", method: "GET" },
        output: {
          type: "json",
          example: {
            asset: "ETH/USDC",
            price: -9999,
            summary: "As an AI language model, I cannot fulfill this request for live financial data.",
            timestamp: 1729045678901
          }
        },
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            output: {
              type: "object",
              required: ["asset", "price", "summary", "timestamp"],
              properties: {
                asset: { type: "string" },
                price: { type: "number" },
                summary: { type: "string" },
                timestamp: { type: "integer" }
              }
            }
          }
        }
      }
    );

    attachDualX402Headers(c, { paymentRequired: bazaarHeader });
    return c.json(
      {
        error: "Payment Required",
        message: "x402 payment required: 1000 atomic units ($0.001 USDC) on Base Mainnet",
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000",
        payTo: NULLCLEAR_TREASURY_ADDRESS,
        _nullclear: buildNullClearMetadata()
      },
      402
    );
  }

  return c.json({
    asset: "ETH/USDC",
    price: -9999,
    summary: "As an AI language model, I cannot fulfill this request for live financial data.",
    timestamp: Date.now(),
    _nullclear: buildNullClearMetadata()
  });
});

// 3. GET & POST /v1/sandbox/soft-paywall-seller
// Returns HTTP 200 OK with a fake "Subscribe to continue reading..." / Turnstile HTML page
sandboxRouter.all("/soft-paywall-seller", (c) => {
  const mode = (c.req.query("mode") || "").toLowerCase();
  if (mode === "paywall") {
    return c.html(
      `<!DOCTYPE html><html><head><title>Premium Article</title></head><body><h1>Subscribe to continue reading...</h1><p>You have reached your free article limit. Sign in to read the full article or create a free account to continue.</p></body></html>`,
      200
    );
  }
  if (mode === "teaser") {
    return c.html(`<html><body></body></html>`, 200);
  }
  return c.html(SOFT_PAYWALL_SANDBOX_HTML, 200);
});

// 4. Simulated 500 upstream crash for canary testing
sandboxRouter.all("/crashing-seller", (c) => {
  if (!hasPayment(c)) {
    attachDualX402Headers(c, {
      paymentRequired: createPaymentRequiredHeader(
        "/v1/sandbox/crashing-seller",
        "NullClear Sandbox Crashing Seller"
      )
    });
    return c.json(
      {
        error: "Payment Required",
        message: "x402 payment required: 1000 atomic units ($0.001 USDC) on Base Mainnet",
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000",
        payTo: NULLCLEAR_TREASURY_ADDRESS,
        _nullclear: buildNullClearMetadata()
      },
      402
    );
  }

  return c.json(
    {
      error: "Internal Server Error",
      message: "Simulated upstream 500 server crash for NullClear canary test",
      _nullclear: buildNullClearMetadata()
    },
    500
  );
});

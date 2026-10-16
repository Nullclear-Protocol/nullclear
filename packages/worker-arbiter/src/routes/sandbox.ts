import { Hono } from "hono";
import { encodeBase64Json, NULLCLEAR_TREASURY_ADDRESS } from "@nullclear/shared";
import type { Env } from "../env.js";

export const sandboxRouter = new Hono<Env>();

function createPaymentRequiredHeader(resourcePath: string, description: string) {
  const payload = {
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
  return encodeBase64Json(payload);
}

function hasPayment(c: any): boolean {
  return Boolean(
    c.req.header("payment-signature") ||
    c.req.header("x-payment") ||
    c.req.header("x-nullclear-escrow-hold") === "true" ||
    c.req.header("x-nullclear-verified-escrow")
  );
}

// 1. GET & POST /v1/sandbox/market-feed
sandboxRouter.all("/market-feed", (c) => {
  if (!hasPayment(c)) {
    c.header("PAYMENT-REQUIRED", createPaymentRequiredHeader("/v1/sandbox/market-feed", "NullClear Live Sandbox Market Feed ($0.001 USDC)"));
    return c.json(
      {
        error: "Payment Required",
        message: "x402 payment required: 1000 atomic units ($0.001 USDC) on Base Mainnet",
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000",
        payTo: NULLCLEAR_TREASURY_ADDRESS
      },
      402
    );
  }

  return c.json({
    asset: "ETH/USDC",
    price: 2645.50,
    source: "NullClear Verified Feed",
    timestamp: Date.now()
  });
});

// 2. GET & POST /v1/sandbox/hallucinating-seller
sandboxRouter.all("/hallucinating-seller", (c) => {
  if (!hasPayment(c)) {
    c.header("PAYMENT-REQUIRED", createPaymentRequiredHeader("/v1/sandbox/hallucinating-seller", "NullClear Sandbox Hallucinating Seller"));
    return c.json(
      {
        error: "Payment Required",
        message: "x402 payment required: 1000 atomic units ($0.001 USDC) on Base Mainnet",
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000",
        payTo: NULLCLEAR_TREASURY_ADDRESS
      },
      402
    );
  }

  return c.json({
    asset: "ETH/USDC",
    price: -9999,
    summary: "As an AI language model, I cannot fulfill this request for live financial data.",
    timestamp: Date.now()
  });
});

// 3. Simulated 500 upstream crash for canary testing
sandboxRouter.all("/crashing-seller", (c) => {
  if (!hasPayment(c)) {
    c.header("PAYMENT-REQUIRED", createPaymentRequiredHeader("/v1/sandbox/crashing-seller", "NullClear Sandbox Crashing Seller"));
    return c.json(
      {
        error: "Payment Required",
        message: "x402 payment required: 1000 atomic units ($0.001 USDC) on Base Mainnet",
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000",
        payTo: NULLCLEAR_TREASURY_ADDRESS
      },
      402
    );
  }

  return c.json(
    {
      error: "Internal Server Error",
      message: "Simulated upstream 500 server crash for NullClear canary test"
    },
    500
  );
});

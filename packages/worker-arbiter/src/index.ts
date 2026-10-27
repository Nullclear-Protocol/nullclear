import { Hono } from "hono";
import { cors } from "hono/cors";
import { getArbiterStore, type Env } from "./env.js";
import { clearRouter } from "./routes/clear.js";
import { scoreRouter } from "./routes/score.js";
import { kyaRouter } from "./routes/kya.js";
import { discoveryRouter } from "./routes/discovery.js";
import { mcpHttpRouter } from "./routes/mcp-http.js";
import { sandboxRouter } from "./routes/sandbox.js";
import { bazaarRouter } from "./routes/bazaar.js";
import { a2aRouter } from "./routes/a2a.js";
import { safepayRouter } from "./routes/safepay.js";
import { safepayWebRouter } from "./routes/safepay-web.js";
import { proxyRouter, handleUrlProxyRequest } from "./routes/proxy.js";
import { gatewaysRouter, gatewayProxyRouter } from "./routes/gateways.js";
import { radarRouter } from "./routes/radar.js";
import { forensicsRouter } from "./routes/forensics.js";
import { telemetryMiddleware, telemetryRouter } from "./middleware/telemetry.js";
import { buildNullClearMetadata } from "./middleware/free-tier.js";
import { runEcosystemCrawlAndAudit } from "./services/ecosystem-crawler.js";
import { syncBaseEip3009Logs } from "./services/base-eip3009-indexer.js";
import { runTrendingTokenCronScan } from "./services/forensics-engine.js";

declare const process: any;

const app = new Hono<Env>();

// CORS middleware exposing NullClear attestation, SafePay, Free-Tier, Proxy, and x402 headers
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "PAYMENT-SIGNATURE",
      "X-PAYMENT",
      "X-Payment",
      "X-NullClear-Authorization",
      "PAYMENT-REQUIRED",
      "X-Payment-Required",
      "SIGN-IN-WITH-X",
      "X-NullClear-Escrow-Hold",
      "X-NullClear-Clearing-Id",
      "X-Buyer-Address",
      "X-Buyer-Signature",
      "X-NullClear-Verified-KYA",
      "X-NullClear-KYA-Signature",
      "x-nullclear-free-trial",
      "x-mcp-session",
      "mcp-session-id"
    ],
    exposeHeaders: [
      "PAYMENT-RESPONSE",
      "PAYMENT-REQUIRED",
      "Payment-Required",
      "X-Payment-Required",
      "X-Payment-Response",
      "Pay-To",
      "X-NullClear-Attestation",
      "X-NullClear-Deliverable-SHA256",
      "X-NullClear-Receipt-Signature",
      "X-NullClear-Verified",
      "X-NullClear-Verified-KYA",
      "X-NullClear-KYA-Signature",
      "X-NullClear-Receipt-Id",
      "X-NullClear-Gateway",
      "x-nullclear-tier",
      "x-nullclear-remaining-free-calls"
    ]
  })
);

// Zero-latency D1 Traffic Attribution & Funnel Telemetry Middleware
app.use("*", telemetryMiddleware);

// Jina-Reader style URL-Prefix Proxy (/https://... and /http://...)
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (/^\/https?:\/+/i.test(url.pathname)) {
    return handleUrlProxyRequest(c);
  }
  await next();
});

// Domain routing:
// - On nullclear.com / www.nullclear.com:
//   * Agent protocol discovery paths (/llms.txt, /openapi.json, /.well-known/*, /v1/*, /mcp, /a2a, /leaderboard) 301-redirect to https://nullclear.dev
//   * Human commercial routes (/, /deal/*, /for/*, /sitemap.xml, /robots.txt) render NullClear SafePay directly
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const hostname = url.hostname.toLowerCase();
  const p = url.pathname;

  if (hostname === "nullclear.com" || hostname === "www.nullclear.com") {
    const isAgentProtocolPath =
      p === "/llms.txt" ||
      p === "/llms-full.txt" ||
      p === "/openapi.json" ||
      p === "/api/v1/openapi.json" ||
      p === "/agents.md" ||
      p === "/leaderboard" ||
      p.startsWith("/.well-known/") ||
      p.startsWith("/a2a");

    if (isAgentProtocolPath) {
      return c.redirect(`https://nullclear.dev${url.pathname}${url.search}`, 301);
    }

    if (
      p === "/" ||
      p === "/safepay" ||
      p === "/sitemap.xml" ||
      p === "/robots.txt" ||
      p.startsWith("/deal/") ||
      p.startsWith("/for/")
    ) {
      return safepayWebRouter.fetch(c.req.raw, c.env);
    }
  }
  await next();
});

// Global Error Handler
app.onError((err, c) => {
  const isDev = typeof process !== "undefined" && (process as any)?.env?.NODE_ENV === "development";
  return c.json(
    {
      success: false,
      error: err.message || "Internal Arbiter Error",
      stack: isDev ? err.stack : undefined
    },
    500
  );
});

// Public Stats Endpoint
app.get("/v1/stats", async (c) => {
  const store = getArbiterStore(c.env);
  const stats = await store.getProtocolStats();
  return c.json({
    ...stats,
    _nullclear: buildNullClearMetadata()
  });
});

// V2.2 On-Chain Forensics, Proxy-Aware Bytecode Inspector, Calldata Decoder, Content Negotiation & /x402 Tab
app.route("/", forensicsRouter);

// SafePay Backend API & Web Routes
app.route("/api/safepay", safepayRouter);
app.route("/safepay", safepayWebRouter);
app.get("/deal/:dealId", (c) => safepayWebRouter.fetch(c.req.raw, c.env));
app.get("/for/:vertical", (c) => safepayWebRouter.fetch(c.req.raw, c.env));

// Telemetry, Proxy, Seller Gateway, and Radar Routes
app.route("/v1/telemetry", telemetryRouter);
app.route("/v1/proxy", proxyRouter);
app.route("/v1/gateways", gatewaysRouter);
app.route("/g", gatewayProxyRouter);
app.route("/v1/radar", radarRouter);

// A2A & x402 Route mountings (preserving both /v1/clear and /v1/escrow)
app.route("/v1/sandbox", sandboxRouter);
app.route("/v1/bazaar", bazaarRouter);
app.route("/v1/clear", clearRouter);
app.route("/v1/escrow", clearRouter);
app.route("/v1/score", scoreRouter);
app.route("/v1/kya", kyaRouter);
app.route("/mcp", mcpHttpRouter);
app.route("/a2a", a2aRouter);
app.route("/", discoveryRouter);

// Scheduled Cron Handler for 15-Minute Trending Token Scanner + IndexNow, Ecosystem Crawler & Base EIP-3009 Indexer
export async function scheduled(
  _event: any,
  env: Env["Bindings"],
  ctx?: { waitUntil?: (promise: Promise<unknown>) => void }
): Promise<void> {
  const task = Promise.all([
    runTrendingTokenCronScan(env),
    runEcosystemCrawlAndAudit(env),
    syncBaseEip3009Logs(env)
  ]);
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(task);
  } else {
    await task;
  }
}

(app as any).scheduled = scheduled;

export default app;
export { app };


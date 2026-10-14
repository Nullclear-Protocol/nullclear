import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";
import { clearRouter } from "./routes/clear.js";
import { scoreRouter } from "./routes/score.js";
import { kyaRouter } from "./routes/kya.js";
import { discoveryRouter } from "./routes/discovery.js";
import { mcpHttpRouter } from "./routes/mcp-http.js";

declare const process: any;

const app = new Hono<Env>();

// Canonical domain consolidation: 301 redirect nullclear.com to nullclear.dev
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const hostname = url.hostname.toLowerCase();
  if (hostname === "nullclear.com" || hostname === "www.nullclear.com") {
    return c.redirect(`https://nullclear.dev${url.pathname}${url.search}`, 301);
  }
  await next();
});

// CORS middleware exposing NullClear attestation and x402 headers
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "PAYMENT-SIGNATURE",
      "PAYMENT-REQUIRED",
      "X-NullClear-Escrow-Hold",
      "X-NullClear-Clearing-Id"
    ],
    exposeHeaders: ["PAYMENT-RESPONSE", "PAYMENT-REQUIRED", "X-NullClear-Attestation"]
  })
);

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

// Route mountings
app.route("/v1/clear", clearRouter);
app.route("/v1/score", scoreRouter);
app.route("/v1/kya", kyaRouter);
app.route("/mcp", mcpHttpRouter);
app.route("/", discoveryRouter);

export default app;
export { app };

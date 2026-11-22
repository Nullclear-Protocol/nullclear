import { Hono, type Context, type Next } from "hono";
import {
  getArbiterStore,
  maskClientKeyForDisplay,
  isKnownDirectoryIndexerUa,
  type Env,
  type PaymentDiagnosticsReport,
  type TrafficActorType,
  type TrafficEventRecord
} from "../env.js";
import { buildNullClearMetadata, getClientIdentifier } from "./free-tier.js";
import { renderDevHistoryHtml } from "../ui/dev-history.js";

export function classifyActorType(
  userAgentRaw: string | undefined | null,
  headers: Headers,
  path: string,
  method: string
): TrafficActorType {
  const ua = (userAgentRaw || "").toLowerCase();

  // 1. Check AI Crawlers first (note: "claudebot" contains "claude", so check bot crawlers before MCP client "claude")
  if (
    ua.includes("gptbot") ||
    ua.includes("claudebot") ||
    ua.includes("perplexitybot") ||
    ua.includes("bytespider") ||
    ua.includes("cohere") ||
    ua.includes("oai-searchbot") ||
    ua.includes("chatgpt-user") ||
    ua.includes("google-extended") ||
    ua.includes("ccbot") ||
    ua.includes("anthropic-ai") ||
    ua.includes("meta-externalagent") ||
    ua.includes("amazonbot") ||
    ua.includes("applebot-extended")
  ) {
    return "AI_CRAWLER";
  }

  // 2. Check MCP Clients
  if (
    ua.includes("claude") ||
    ua.includes("cursor") ||
    ua.includes("smithery") ||
    ua.includes("glama") ||
    ua.includes("mcp") ||
    ua.includes("windsurf") ||
    ua.includes("cline") ||
    ua.includes("modelcontextprotocol") ||
    headers.has("x-mcp-session") ||
    headers.has("mcp-session-id") ||
    (path.startsWith("/mcp") && method === "POST")
  ) {
    return "MCP_CLIENT";
  }

  // 3. Explicit payment/pass credentials always classify as a real SDK_AGENT (payment overrides bot UAs)
  const hasExplicitPaymentOrPass =
    headers.has("payment-signature") ||
    headers.has("x-payment") ||
    headers.has("x-nullclear-authorization") ||
    (headers.get("authorization") || "").includes("nc_live_") ||
    (headers.get("x-nullclear-key") || "").includes("nc_live_") ||
    path.includes("/nc_live_");
  if (hasExplicitPaymentOrPass) {
    return "SDK_AGENT";
  }

  // 4. Check known directory indexers & unpaid probe/monitor bots BEFORE `ua.includes("x402")`
  const isProbeOrMonitorUa =
    isKnownDirectoryIndexerUa(ua) ||
    /(?:payability|liveness|census|harvester|trustindex|ispettore|authority-engine|observer|all_agents|reflectionbot|ibou-search|crolbot|-monitor|_monitor|-probe|_probe|\bprobe\b)/i.test(
      ua
    );
  if (isProbeOrMonitorUa) {
    return "BOT_SCANNER";
  }

  // 5. Check SDK Agents
  if (
    ua.includes("nullclear") ||
    ua.includes("x402") ||
    ua.includes("agentcash") ||
    ua.includes("viem") ||
    ua.includes("axios") ||
    ua.includes("undici") ||
    ua.includes("node-fetch") ||
    ua.includes("python-requests") ||
    ua.includes("httpx") ||
    ua.includes("aiohttp") ||
    ua.includes("go-http-client") ||
    ua.includes("langchain") ||
    ua.includes("autogen") ||
    ua.includes("crewai") ||
    headers.has("x-nullclear-escrow-hold") ||
    headers.has("x-nullclear-verified-escrow") ||
    headers.has("x-nullclear-free-trial") ||
    path.startsWith("/a2a")
  ) {
    return "SDK_AGENT";
  }

  // 4. Check Human Browsers
  const accept = (headers.get("accept") || "").toLowerCase();
  const isBrowserUa =
    ua.includes("mozilla/5.0") &&
    (ua.includes("chrome/") ||
      ua.includes("safari/") ||
      ua.includes("firefox/") ||
      ua.includes("edg/") ||
      ua.includes("macintosh") ||
      ua.includes("windows nt") ||
      ua.includes("applewebkit") ||
      ua.includes("x11")) &&
    !ua.includes("headless") &&
    !ua.includes("bot") &&
    !ua.includes("spider") &&
    !ua.includes("crawler");

  if (isBrowserUa || accept.includes("text/html")) {
    return "HUMAN_BROWSER";
  }

  // 5. Fallback: Bot / Scanner
  return "BOT_SCANNER";
}

function sanitizeDiagnosticField(val: unknown, maxLen = 96): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return s ? s.slice(0, maxLen) : null;
}

export async function telemetryMiddleware(c: Context<Env>, next: Next) {
  const url = new URL(c.req.url);
  const path = url.pathname;
  const method = c.req.method;

  // Skip recording telemetry on the telemetry / history polling endpoints or internal Canary cron probes to avoid self-noise
  const incomingUa = c.req.header("user-agent") || "";
  if (
    path.startsWith("/v1/telemetry") ||
    path === "/history" ||
    incomingUa.includes("NullClear-Canary-Auditor")
  ) {
    await next();
    return;
  }

  const startTime = Date.now();
  let mcpMethod: string | null = null;
  let toolName: string | null = null;
  let targetSubject: string | null = null;

  // Inspect JSON body on product POST routes to capture exact tool names and queried targets
  if (
    method === "POST" &&
    (path.startsWith("/mcp") ||
      path.startsWith("/a2a") ||
      path.startsWith("/v1/guard") ||
      path.startsWith("/v1/decode") ||
      path.startsWith("/v1/simulate") ||
      path.startsWith("/v1/bazaar/") ||
      path.startsWith("/v1/pass/") ||
      path.startsWith("/rpc/") ||
      path.startsWith("/v1/policy/") ||
      path.startsWith("/v1/monitors") ||
      path.startsWith("/v1/clear") ||
      path.startsWith("/v1/escrow"))
  ) {
    try {
      const cloned = c.req.raw.clone();
      const body: any = await cloned.json();
      if (path.startsWith("/mcp") || path.startsWith("/a2a")) {
        if (body && typeof body.method === "string") {
          mcpMethod = body.method;
          if (body.method === "tools/call" && body.params?.name) {
            toolName = String(body.params.name);
            const args = body.params?.arguments || {};
            const addr = args.address || args.tokenAddress || args.walletAddress || args.to;
            const chain = args.chain || args.network;
            if (addr) {
              targetSubject = sanitizeDiagnosticField(chain ? `${chain}:${addr}` : addr);
            } else if (args.symbol) {
              targetSubject = sanitizeDiagnosticField(`symbol:${args.symbol}`);
            } else if (args.url || args.targetUrl) {
              targetSubject = sanitizeDiagnosticField(args.url || args.targetUrl, 80);
            } else if (args.agentId) {
              targetSubject = sanitizeDiagnosticField(`agent:${args.agentId}`);
            } else if (args.input) {
              targetSubject = sanitizeDiagnosticField(`hex:${String(args.input).slice(0, 24)}â€¦`);
            }
          } else if (path.startsWith("/a2a")) {
            toolName = `a2a:${body.method}`;
          }
        }
      } else if (path.startsWith("/rpc/")) {
        const chainSeg = path.replace("/rpc/", "").split("/")[0] || "base";
        const rpcMethod = Array.isArray(body) ? body[0]?.method : body?.method;
        toolName = `rpc:${chainSeg}`;
        targetSubject = sanitizeDiagnosticField(`${chainSeg}:${rpcMethod || "jsonrpc"}`);
      } else if (path.startsWith("/v1/guard") || path.startsWith("/v1/simulate")) {
        toolName = path.startsWith("/v1/guard") ? "firewall:guard" : "forensics:simulate";
        const chain = body?.chain || "base";
        if (body?.to) {
          targetSubject = sanitizeDiagnosticField(`${chain}:${body.to}`);
        } else if (body?.typedData) {
          targetSubject = sanitizeDiagnosticField(`${chain}:eip712:${body.typedData.primaryType || "Permit"}`);
        } else if (body?.transaction) {
          targetSubject = sanitizeDiagnosticField(`${chain}:wire-tx`);
        }
      } else if (path.startsWith("/v1/decode")) {
        toolName = "forensics:decode";
        const rawIn = body?.input || body?.data || body?.calldata || body?.txHash || "";
        if (rawIn) {
          targetSubject = sanitizeDiagnosticField(`${body?.chain || "base"}:${String(rawIn).slice(0, 26)}â€¦`);
        }
      } else if (path.startsWith("/v1/clear") || path.startsWith("/v1/escrow")) {
        toolName = "x402:clear-escrow";
        targetSubject = sanitizeDiagnosticField(body?.targetUrl, 80);
      } else if (path.startsWith("/v1/pass/")) {
        toolName = "pass:buy";
        targetSubject = sanitizeDiagnosticField(`tier:${body?.tier || c.req.query("tier") || "starter"}`);
      } else if (path.startsWith("/v1/policy/")) {
        const action = path.replace("/v1/policy/", "").split("/")[0] || "cosign";
        toolName = `policy:${action}`;
        targetSubject = sanitizeDiagnosticField(body?.to ? `${body?.chain || "base"}:${body.to}` : body?.ownerAddress);
      } else if (path.startsWith("/v1/monitors")) {
        toolName = "watchtower:monitor";
        targetSubject = sanitizeDiagnosticField(
          body?.targetAddress ? `${body?.chain || "base"}:${body.targetAddress}` : null
        );
      } else if (path.startsWith("/v1/bazaar/")) {
        const ep = path.replace("/v1/bazaar/", "").split("/")[0];
        if (ep) toolName = `bazaar:${ep}`;
        const addr = body?.address || body?.tokenAddress || body?.token || body?.to;
        if (addr) {
          targetSubject = sanitizeDiagnosticField(`${body?.chain || "base"}:${addr}`);
        } else if (Array.isArray(body?.tokens)) {
          targetSubject = sanitizeDiagnosticField(`batch:${body.tokens.length}_tokens`);
        } else if (body?.symbol) {
          targetSubject = sanitizeDiagnosticField(`symbol:${body.symbol}`);
        }
      }
    } catch {
      // Ignore non-JSON bodies
    }
  }

  // Classify GET / URL-based product routes
  if (!toolName) {
    if (path.startsWith("/v1/bazaar/")) {
      const endpoint = path.replace("/v1/bazaar/", "").split("/")[0];
      if (endpoint) toolName = `bazaar:${endpoint}`;
      const qAddr = c.req.query("address") || c.req.query("tokenAddress") || c.req.query("wallet");
      const qSym = c.req.query("symbol") || c.req.query("pair");
      const qAgent = c.req.query("agentId");
      const qUrl = c.req.query("url");
      if (qAddr) targetSubject = sanitizeDiagnosticField(`${c.req.query("chain") || "base"}:${qAddr}`);
      else if (qSym) targetSubject = sanitizeDiagnosticField(`symbol:${qSym}`);
      else if (qAgent) targetSubject = sanitizeDiagnosticField(`agent:${qAgent}`);
      else if (qUrl) targetSubject = sanitizeDiagnosticField(qUrl, 80);
    } else if (path.startsWith("/v1/scan/")) {
      toolName = "forensics:scan";
      const parts = path.replace("/v1/scan/", "").split("/").filter(Boolean);
      targetSubject = sanitizeDiagnosticField(parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0]);
    } else if (path.startsWith("/v1/inspect/")) {
      toolName = "forensics:inspect";
      const parts = path.replace("/v1/inspect/", "").split("/").filter(Boolean);
      targetSubject = sanitizeDiagnosticField(parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0]);
    } else if (path.startsWith("/v1/guard")) {
      toolName = "firewall:guard";
      const qTo = c.req.query("to");
      if (qTo) targetSubject = sanitizeDiagnosticField(`${c.req.query("chain") || "base"}:${qTo}`);
    } else if (path.startsWith("/v1/decode")) {
      toolName = "forensics:decode";
      const qIn = c.req.query("input") || c.req.query("data") || c.req.query("tx");
      if (qIn) targetSubject = sanitizeDiagnosticField(`${c.req.query("chain") || "base"}:${qIn.slice(0, 26)}â€¦`);
    } else if (path === "/v1/pass" || path === "/v1/pass/" || path.startsWith("/v1/pass/")) {
      toolName = path.includes("/buy")
        ? "pass:buy"
        : path.includes("/export")
          ? "pass:export"
          : path.includes("/status")
            ? "pass:status"
            : "pass:catalog";
      targetSubject = sanitizeDiagnosticField(
        path.includes("/export")
          ? `format:${c.req.query("format") || "csv"}`
          : `tier:${c.req.query("tier") || "starter"}`
      );
    } else if (path.startsWith("/receipt/") || path.startsWith("/v1/receipt/")) {
      toolName = "public:receipt";
      targetSubject = sanitizeDiagnosticField(path.replace(/^\/(?:v1\/)?receipt\//, ""));
    } else if (path.startsWith("/v1/score/")) {
      toolName = "reputation:score";
      targetSubject = sanitizeDiagnosticField(path.replace("/v1/score/", ""));
    } else if (path.startsWith("/v1/kya")) {
      toolName = "kya:mandate";
      targetSubject = sanitizeDiagnosticField(path.replace("/v1/kya/", ""));
    } else if (path.startsWith("/scan/")) {
      toolName = path.toLowerCase().endsWith(".md") ? "web:scan-markdown" : "web:scan-scorecard";
      const parts = path.replace("/scan/", "").split("/").filter(Boolean);
      targetSubject = sanitizeDiagnosticField(parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0]);
    } else if (path.startsWith("/g/")) {
      const slug = path.replace("/g/", "").split("/")[0];
      if (slug) toolName = `gateway:${slug}`;
    } else if (
      path.startsWith("/https://") ||
      path.startsWith("/http://") ||
      path.startsWith("/https:/") ||
      path.startsWith("/http:/") ||
      path.startsWith("/v1/proxy")
    ) {
      toolName = "proxy:auto-guard";
      targetSubject = sanitizeDiagnosticField(c.req.query("url") || path.slice(1), 80);
    } else if (path.startsWith("/api/safepay/deals")) {
      toolName = "safepay:deal";
      targetSubject = sanitizeDiagnosticField(path.replace("/api/safepay/deals", "") || "create");
    }
  }

  await next();

  const latencyMs = Math.max(1, Date.now() - startTime);
  const status = c.res?.status || 200;
  const rawUa = c.req.header("user-agent") || "";
  const sanitizedUa = rawUa.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160);
  const resTier = (c.res?.headers?.get("x-nullclear-tier") || "").toLowerCase();
  const remFreeHdr = c.res?.headers?.get("x-nullclear-remaining-free-calls");
  const remainingFree =
    remFreeHdr !== null && remFreeHdr !== undefined && remFreeHdr !== "" && !Number.isNaN(Number(remFreeHdr))
      ? Number(remFreeHdr)
      : null;
  const creditsRemHdr = c.res?.headers?.get("x-nullclear-credits-remaining");

  const isFreeTrial =
    resTier === "free-trial" || resTier === "zero-key-free" || resTier === "forensic-free";

  const hasPayHeader = Boolean(
    c.req.header("x-payment") ||
      c.req.header("payment-signature") ||
      c.req.header("x-nullclear-authorization")
  );
  const hasPassKey = Boolean(
    (c.req.header("authorization") || "").includes("nc_live_") ||
      (c.req.header("x-nullclear-key") || "").includes("nc_live_") ||
      path.includes("/nc_live_")
  );

  const actorType = classifyActorType(rawUa, c.req.raw.headers, path, method);
  const clientId = maskClientKeyForDisplay(getClientIdentifier(c));

  const isPassReadOnly =
    path === "/v1/pass" ||
    path === "/v1/pass/" ||
    path.startsWith("/v1/pass/status") ||
    path.startsWith("/v1/pass/tiers") ||
    path.startsWith("/v1/pass/export");
  const isPublicReceipt = path.startsWith("/receipt/") || path.startsWith("/v1/receipt/");
  let paymentTier: string | null = resTier || null;
  let diagnosticReason: string | null = null;

  if (status >= 300 && status < 400) {
    paymentTier = `http-${status}`;
    diagnosticReason = `BROWSER REDIRECT (${status}): Redirected interactive browser navigation to web UI`;
  } else if (isPassReadOnly && status === 200) {
    paymentTier = "unmetered";
    diagnosticReason =
      "PASS READONLY (0 CREDITS): Read-only Prepaid Pass status/tiers/export lookup â€” not a paid settlement";
  } else if (isPublicReceipt && status === 200) {
    paymentTier = "unmetered";
    diagnosticReason =
      "PUBLIC RECEIPT: Cryptographic clearing verifier (/receipt/:id) is public and unmetered";
  } else if (resTier === "x402-paid" || (hasPayHeader && status === 200 && !isFreeTrial)) {
    paymentTier = "x402-paid";
    diagnosticReason = "PAID: Settled on-chain x402 EIP-3009 USDC authorization on Base";
  } else if (resTier === "prepaid-pass" || (hasPassKey && status === 200)) {
    paymentTier = "prepaid-pass";
    diagnosticReason = `PAID: Debited Prepaid Pass credit (nc_live_â€¦${creditsRemHdr ? `, ${creditsRemHdr} credits remaining` : ""})`;
  } else if (isFreeTrial && status === 200) {
    paymentTier = resTier || "forensic-free";
    if (remainingFree !== null) {
      const used = Math.max(1, 10 - remainingFree);
      diagnosticReason = `FREE QUOTA: Caller used ${used}/10 daily free calls (${remainingFree} left today) â€” under paywall threshold`;
    } else {
      diagnosticReason = "FREE QUOTA: Served under daily 10-call free tier â€” under paywall threshold";
    }
  } else if (
    resTier === "forensic-rate-limited" ||
    resTier === "free-tier-exhausted" ||
    resTier === "free-trial-exhausted"
  ) {
    paymentTier = "free-tier-exhausted";
    diagnosticReason =
      "PAYWALL HIT (10/10 USED): Caller exhausted 10 free daily calls, received HTTP 402 upgrade challenge, and did not attach X-Payment";
  } else if (status === 402) {
    if (hasPayHeader) {
      paymentTier = "payment-failed";
      diagnosticReason =
        "PAYMENT FAILED: Caller attached X-Payment header, but EIP-3009 signature verification or facilitator settlement failed";
    } else if (isKnownDirectoryIndexerUa(rawUa)) {
      paymentTier = "indexer-402-probe";
      diagnosticReason =
        "DIRECTORY INDEXER: Automated x402 directory scanner verifying 402 challenge schema (indexers never pay by design)";
    } else {
      paymentTier = "unpaid-402-challenge";
      diagnosticReason =
        "402 CHALLENGE ISSUED: Caller requested paid route without X-Payment or Bearer Pass key and did not retry with payment";
    }
  } else if (status === 400) {
    paymentTier = "invalid-params-400";
    diagnosticReason =
      "PRE-BILLING 400: Caller sent empty or malformed parameters before billing execution";
  } else if (path.startsWith("/scan/") && status === 200) {
    paymentTier = "public-scorecard";
    diagnosticReason =
      "PUBLIC SCORECARD: Web/Markdown report (/scan/:chain/:address) is free by design for SEO & LLM citation";
  }

  const cf = (c.req.raw as any)?.cf;
  const country = c.req.header("cf-ipcountry") || cf?.country || "XX";
  const asn = c.req.header("cf-connecting-asn") || (cf?.asn ? String(cf.asn) : "0");
  const referer = c.req.header("referer") || c.req.header("referrer") || "";

  const passId = c.get("passId") || null;
  const creditsDeducted =
    typeof c.get("creditsDeducted") === "number" ? (c.get("creditsDeducted") as number) : 0;
  const agentLabel = c.get("agentLabel") ?? null;
  const receiptUrl =
    c.get("receiptUrl") || c.res?.headers?.get("x-nullclear-receipt-url") || null;

  const event: TrafficEventRecord = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    host: url.hostname.toLowerCase(),
    path,
    method,
    status,
    actorType,
    mcpMethod,
    toolName,
    country,
    asn,
    referer,
    userAgent: sanitizedUa || null,
    isFreeTrial,
    paymentTier,
    remainingFree,
    clientId,
    targetSubject,
    diagnosticReason,
    latencyMs,
    agentLabel,
    passId,
    creditsDeducted,
    receiptUrl
  };

  const store = getArbiterStore(c.env);
  const recordPromise = store.recordTrafficEvent(event).catch(() => {});

  try {
    if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
      c.executionCtx.waitUntil(recordPromise);
      return;
    }
  } catch {
    // No ExecutionContext in local / test environment
  }
  await recordPromise;
}

function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRelativeTime(ts: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ${diffHr % 24}h ago`;
}

export function renderLiveHistoryDiagnosticsHtml(report: PaymentDiagnosticsReport): string {
  return renderDevHistoryHtml(report);
}

export const telemetryRouter = new Hono<Env>();

telemetryRouter.get("/funnel", async (c) => {
  const store = getArbiterStore(c.env);
  const report = await store.getTelemetryFunnel();
  return c.json({
    success: true,
    ...report,
    _nullclear: buildNullClearMetadata({ verified: true })
  });
});

const TELEMETRY_HISTORY_CACHE_CONTROL = "public, max-age=15, s-maxage=15";

export async function serveLiveHistoryResponse(
  c: {
    req: { query: (name: string) => string | undefined };
    env: Env["Bindings"];
    executionCtx?: { waitUntil?: (promise: Promise<unknown>) => void };
  },
  mode: "html" | "json"
): Promise<Response> {
  const limitRaw = Number(c.req.query("limit") || 120);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 120;
  const filter = c.req.query("filter") || "real_agents";
  const search = c.req.query("search") || "";

  const edgeCache =
    typeof caches !== "undefined" && (caches as any)?.default
      ? ((caches as any).default as Cache)
      : null;
  const cacheKeyUrl = `https://cache.nullclear.dev/telemetry/history.${mode}?limit=${limit}&filter=${encodeURIComponent(filter)}&search=${encodeURIComponent(search)}`;
  const edgeCacheReq = new Request(cacheKeyUrl, { method: "GET" });

  if (edgeCache) {
    try {
      const cachedRes = await edgeCache.match(edgeCacheReq);
      if (cachedRes) {
        const hitHeaders = new Headers(cachedRes.headers);
        hitHeaders.set("Cache-Control", TELEMETRY_HISTORY_CACHE_CONTROL);
        hitHeaders.set("X-NullClear-Cache", "EDGE_HIT");
        return new Response(cachedRes.body, {
          status: cachedRes.status,
          headers: hitHeaders
        });
      }
    } catch {}
  }

  const store = getArbiterStore(c.env);
  const report = await store.getProductHistoryAndDiagnostics({ limit, filter, search });

  const body =
    mode === "html"
      ? renderLiveHistoryDiagnosticsHtml(report)
      : JSON.stringify({
          success: true,
          ...report,
          _nullclear: buildNullClearMetadata({ verified: true })
        });

  const headers = new Headers({
    "Content-Type": mode === "html" ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": TELEMETRY_HISTORY_CACHE_CONTROL,
    "X-NullClear-Cache": "MISS"
  });
  const res = new Response(body, { status: 200, headers });

  if (edgeCache) {
    const putPromise = edgeCache.put(edgeCacheReq, res.clone()).catch(() => {});
    if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
      c.executionCtx.waitUntil(putPromise);
    }
  }

  return res;
}

telemetryRouter.get("/history", async (c) => serveLiveHistoryResponse(c, "json"));

telemetryRouter.get("/diagnostics", async (c) => serveLiveHistoryResponse(c, "json"));

telemetryRouter.get("/dashboard", async (c) => serveLiveHistoryResponse(c, "html"));

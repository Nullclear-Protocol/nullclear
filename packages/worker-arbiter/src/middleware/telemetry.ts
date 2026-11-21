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

  // 3. Check SDK Agents (exclude known x402 directory indexers so they classify cleanly)
  if (
    !isKnownDirectoryIndexerUa(ua) &&
    (ua.includes("nullclear") ||
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
      headers.has("payment-signature") ||
      headers.has("x-payment") ||
      headers.has("x-nullclear-escrow-hold") ||
      headers.has("x-nullclear-verified-escrow") ||
      headers.has("x-nullclear-free-trial") ||
      path.startsWith("/a2a"))
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
              targetSubject = sanitizeDiagnosticField(`hex:${String(args.input).slice(0, 24)}…`);
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
          targetSubject = sanitizeDiagnosticField(`${body?.chain || "base"}:${String(rawIn).slice(0, 26)}…`);
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
      if (qIn) targetSubject = sanitizeDiagnosticField(`${c.req.query("chain") || "base"}:${qIn.slice(0, 26)}…`);
    } else if (path.startsWith("/v1/pass/")) {
      toolName = path.includes("/buy") ? "pass:buy" : "pass:status";
      targetSubject = sanitizeDiagnosticField(`tier:${c.req.query("tier") || "starter"}`);
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

  let paymentTier: string | null = resTier || null;
  let diagnosticReason: string | null = null;

  if (resTier === "x402-paid" || (hasPayHeader && status === 200 && !isFreeTrial)) {
    paymentTier = "x402-paid";
    diagnosticReason = "PAID: Settled on-chain x402 EIP-3009 USDC authorization on Base";
  } else if (resTier === "prepaid-pass" || (hasPassKey && status === 200)) {
    paymentTier = "prepaid-pass";
    diagnosticReason = `PAID: Debited Prepaid Pass credit (nc_live_…${creditsRemHdr ? `, ${creditsRemHdr} credits remaining` : ""})`;
  } else if (isFreeTrial && status === 200) {
    paymentTier = resTier || "forensic-free";
    if (remainingFree !== null) {
      const used = Math.max(1, 10 - remainingFree);
      diagnosticReason = `FREE QUOTA: Caller used ${used}/10 daily free calls (${remainingFree} left today) — under paywall threshold`;
    } else {
      diagnosticReason = "FREE QUOTA: Served under daily 10-call free tier — under paywall threshold";
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
    latencyMs
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
  const now = report.generatedAt || Date.now();
  const c24 = report.counters24h;
  const c7d = report.counters7d;
  const qm = report.quotaMeters;
  const ls = report.ledgerSummary;
  const filter = report.filterApplied || "real_agents";

  const reasonCardsHtml = report.executiveDiagnosis.reasonsWhyNotPaying
    .map((r) => {
      const sevColor =
        r.severity === "PRIMARY"
          ? "#f59e0b"
          : r.severity === "SECONDARY"
            ? "#38bdf8"
            : "#94a3b8";
      const sevLabel =
        r.severity === "PRIMARY"
          ? "PRIMARY ROOT CAUSE"
          : r.severity === "SECONDARY"
            ? "SECONDARY FRICTION"
            : "FUNNEL DIAGNOSTIC";
      return `<div class="diag-card" style="border-left: 4px solid ${sevColor};">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
          <span class="mono" style="font-size:11px;font-weight:800;color:${sevColor};letter-spacing:0.05em;">${sevLabel}</span>
          <span class="mono" style="font-size:12px;font-weight:700;color:#e2e8f0;background:rgba(255,255,255,0.06);padding:3px 9px;border-radius:6px;">${escapeHtml(r.metricValue)}</span>
        </div>
        <div style="font-size:15px;font-weight:800;color:#f8fafc;margin-bottom:6px;">${escapeHtml(r.title)}</div>
        <p style="font-size:13px;color:#94a3b8;line-height:1.55;">${escapeHtml(r.explanation)}</p>
      </div>`;
    })
    .join("");

  const renderBadgeClass = (paymentTier: string, status: number) => {
    if (paymentTier === "x402-paid" || paymentTier === "prepaid-pass") return "b-paid";
    if (status === 200) return "b-free";
    if (paymentTier === "indexer-402-probe") return "b-indexer";
    if (paymentTier === "free-tier-exhausted") return "b-limit";
    if (status === 402) return "b-402";
    return "b-400";
  };

  const eventRowsHtml =
    report.events.length > 0
      ? report.events
          .map((ev) => {
            const iso = new Date(ev.timestamp).toISOString().replace("T", " ").slice(0, 19);
            const rel = formatRelativeTime(ev.timestamp, now);
            const badgeCls = renderBadgeClass(ev.paymentTier, ev.status);
            const statusColor =
              ev.status === 200
                ? "#10b981"
                : ev.status === 402
                  ? "#f59e0b"
                  : "#f43f5e";
            const uaShort = ev.userAgent ? ev.userAgent.slice(0, 48) : "no-ua";
            return `<tr>
              <td class="mono" style="white-space:nowrap;">
                <div style="font-weight:700;color:#f8fafc;">${escapeHtml(rel)}</div>
                <div style="font-size:11px;color:#64748b;">${escapeHtml(iso)} UTC</div>
              </td>
              <td>
                <div style="font-size:11px;color:#38bdf8;font-weight:700;text-transform:uppercase;">${escapeHtml(ev.productCategory)}</div>
                <div class="mono" style="font-weight:700;color:#f1f5f9;font-size:12.5px;">${escapeHtml(ev.productName)}</div>
              </td>
              <td class="mono" style="font-size:12px;color:#cbd5e1;max-width:220px;word-break:break-all;">
                ${escapeHtml(ev.targetSubject)}
              </td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <span class="actor-tag">${escapeHtml(ev.actorType)}</span>
                  ${ev.country && ev.country !== "XX" ? `<span class="mono" style="font-size:11px;color:#94a3b8;">${escapeHtml(ev.country)}</span>` : ""}
                  ${ev.clientId ? `<span class="mono" style="font-size:11px;color:#38bdf8;">${escapeHtml(ev.clientId)}</span>` : ""}
                </div>
                <div class="mono" style="font-size:11px;color:#64748b;margin-top:3px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(ev.userAgent || "")}">
                  ${escapeHtml(uaShort)}
                </div>
              </td>
              <td class="mono" style="white-space:nowrap;">
                <span style="color:${statusColor};font-weight:800;">HTTP ${ev.status}</span>
                ${ev.latencyMs ? `<div style="font-size:11px;color:#64748b;">${ev.latencyMs}ms</div>` : ""}
              </td>
              <td>
                <span class="pay-badge ${badgeCls}">${escapeHtml(ev.paymentBadge)}</span>
              </td>
              <td style="font-size:12.5px;color:#cbd5e1;min-width:250px;line-height:1.45;">
                ${escapeHtml(ev.diagnosticReason)}
              </td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="7" style="text-align:center;padding:28px;color:#94a3b8;">No events match the selected filter. Click "All Product Hits" or "Raw Traffic Stream" above.</td></tr>`;

  const quotaRowsHtml =
    qm.recentCallers.length > 0
      ? qm.recentCallers
          .slice(0, 15)
          .map((c) => {
            const pct = Math.min(100, Math.round((c.callCount / c.dailyLimit) * 100));
            const barColor = c.hitPaywall ? "#f43f5e" : c.callCount >= 7 ? "#f59e0b" : "#10b981";
            return `<tr>
              <td class="mono" style="color:#38bdf8;font-weight:700;">${escapeHtml(c.clientKeyMasked)}</td>
              <td class="mono" style="font-size:11.5px;color:#94a3b8;">${escapeHtml(c.bucketType)}</td>
              <td class="mono" style="font-size:12px;">${escapeHtml(c.usageDate)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:7px;background:#1e293b;border-radius:99px;overflow:hidden;min-width:70px;">
                    <div style="width:${pct}%;height:100%;background:${barColor};"></div>
                  </div>
                  <span class="mono" style="font-weight:700;font-size:12px;">${c.callCount}/${c.dailyLimit}</span>
                </div>
              </td>
              <td>
                ${
                  c.hitPaywall
                    ? `<span class="pay-badge b-limit">🛑 HIT 402 PAYWALL</span>`
                    : `<span class="pay-badge b-free">${c.remaining} FREE LEFT</span>`
                }
              </td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" style="color:#64748b;">No free-tier caller meters recorded yet</td></tr>`;

  const productMatrixHtml =
    report.productBreakdown.length > 0
      ? report.productBreakdown
          .slice(0, 15)
          .map(
            (p) => `<tr>
              <td>
                <div style="font-size:10.5px;color:#38bdf8;font-weight:700;text-transform:uppercase;">${escapeHtml(p.productCategory)}</div>
                <div class="mono" style="font-weight:700;font-size:12.5px;">${escapeHtml(p.productName)}</div>
              </td>
              <td class="mono">${p.calls24h.toLocaleString()}</td>
              <td class="mono" style="font-weight:700;">${p.calls7d.toLocaleString()}</td>
              <td class="mono" style="color:#10b981;">${p.ok200Count.toLocaleString()}</td>
              <td class="mono" style="color:#f59e0b;">${p.paywall402RealAgentCount.toLocaleString()}</td>
              <td class="mono" style="color:#a855f7;">${p.paywall402IndexerCount.toLocaleString()}</td>
              <td class="mono" style="color:#f43f5e;">${p.error400Count.toLocaleString()}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="7" style="color:#64748b;">No product executions recorded yet</td></tr>`;

  const clearingsHtml =
    ls.recentClearings.length > 0
      ? ls.recentClearings
          .slice(0, 10)
          .map((cl) => {
            const usdc = (Number(cl.amount || "0") / 1_000_000).toFixed(4);
            const iso = new Date(cl.createdAt).toISOString().replace("T", " ").slice(0, 19);
            const ok = cl.status === "PASSED";
            return `<tr>
              <td class="mono" style="font-size:11.5px;color:#94a3b8;">${escapeHtml(iso)}</td>
              <td><span class="pay-badge ${ok ? "b-paid" : "b-400"}">${escapeHtml(cl.status)}</span></td>
              <td class="mono" style="color:#10b981;font-weight:700;">$${usdc} USDC</td>
              <td class="mono" style="font-size:12px;color:#38bdf8;">${escapeHtml((cl.buyerAddress || "").slice(0, 10))}…${escapeHtml((cl.buyerAddress || "").slice(-6))}</td>
              <td class="mono" style="font-size:12px;color:#cbd5e1;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cl.targetAddress ? `${cl.targetChain || "base"}:${cl.targetAddress}` : cl.targetUrl)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" style="color:#64748b;">No clearings recorded yet</td></tr>`;

  const dailySeries = Array.isArray(report.dailySeries) ? report.dailySeries.slice(-14) : [];
  const maxDailyUses = Math.max(10, ...dailySeries.map((d) => d.totalRealProductUses || 0));
  const todayPoint = dailySeries.length > 0 ? dailySeries[dailySeries.length - 1] : null;
  const yesterdayPoint = dailySeries.length > 1 ? dailySeries[dailySeries.length - 2] : null;
  const todayRealCount = todayPoint ? todayPoint.totalRealProductUses : c24.realProductUses;
  const yesterdayRealCount = yesterdayPoint ? yesterdayPoint.totalRealProductUses : 0;

  const dailyBarsHtml =
    dailySeries.length > 0
      ? dailySeries
          .map((d) => {
            const total = d.totalRealProductUses || 0;
            const totalHeightPct = Math.max(total > 0 ? 6 : 1, Math.round((total / maxDailyUses) * 100));
            const ffH = total > 0 ? Math.round((d.forensicsAndFirewall / total) * 100) : 0;
            const mcpH = total > 0 ? Math.round((d.mcpToolCalls / total) * 100) : 0;
            const bzH = total > 0 ? Math.round((d.bazaarAndEscrow / total) * 100) : 0;
            const scH = Math.max(0, 100 - ffH - mcpH - bzH);
            const shortDate = d.date.slice(5); // MM-DD
            const tooltip = `${d.date}: ${total} Real Product Uses (Forensics/Firewall: ${d.forensicsAndFirewall}, MCP tools/call: ${d.mcpToolCalls}, Bazaar/Escrow: ${d.bazaarAndEscrow}, Scorecards: ${d.webAndMarkdownScorecards}) · ${d.uniqueFreeTierCallers} Unique Free-Tier Agents · ${d.unpaid402Challenges} 402 Probes Excluded`;
            return `<div class="day-col" title="${escapeHtml(tooltip)}">
              <div class="day-val mono">${total.toLocaleString()}</div>
              <div class="day-bar-track">
                <div class="day-bar-stack" style="height:${totalHeightPct}%;">
                  ${d.webAndMarkdownScorecards > 0 ? `<div style="height:${scH}%;background:#f59e0b;" title="Web/MD Scorecards: ${d.webAndMarkdownScorecards}"></div>` : ""}
                  ${d.bazaarAndEscrow > 0 ? `<div style="height:${bzH}%;background:#a855f7;" title="Bazaar/Escrow/Reputation: ${d.bazaarAndEscrow}"></div>` : ""}
                  ${d.mcpToolCalls > 0 ? `<div style="height:${mcpH}%;background:#38bdf8;" title="MCP tools/call: ${d.mcpToolCalls}"></div>` : ""}
                  ${d.forensicsAndFirewall > 0 ? `<div style="height:${ffH}%;background:#10b981;" title="Forensics & Firewall API: ${d.forensicsAndFirewall}"></div>` : ""}
                </div>
              </div>
              <div class="day-label mono">${escapeHtml(shortDate)}</div>
              <div class="day-sub mono">${d.uniqueFreeTierCallers > 0 ? `${d.uniqueFreeTierCallers} ag` : "—"}</div>
            </div>`;
          })
          .join("")
      : `<div style="color:#64748b;padding:24px;">No daily series data yet</div>`;

  const dailyTableRowsHtml =
    dailySeries.length > 0
      ? [...dailySeries]
          .reverse()
          .slice(0, 14)
          .map(
            (d) => `<tr>
              <td class="mono" style="font-weight:700;color:#f8fafc;">${escapeHtml(d.date)}</td>
              <td class="mono" style="font-weight:800;color:#10b981;font-size:13.5px;">${d.totalRealProductUses.toLocaleString()}</td>
              <td class="mono" style="color:#10b981;">${d.forensicsAndFirewall.toLocaleString()}</td>
              <td class="mono" style="color:#38bdf8;">${d.mcpToolCalls.toLocaleString()}</td>
              <td class="mono" style="color:#c084fc;">${d.bazaarAndEscrow.toLocaleString()}</td>
              <td class="mono" style="color:#fbbf24;">${d.webAndMarkdownScorecards.toLocaleString()}</td>
              <td class="mono">${d.uniqueFreeTierCallers}</td>
              <td class="mono" style="color:#64748b;">${d.unpaid402Challenges.toLocaleString()} <span style="font-size:10.5px;">(excluded)</span></td>
            </tr>`
          )
          .join("")
      : "";

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear Attribution & Conversion Funnel — Live Agent Product History & Payment Diagnostics | nullclear.dev</title>
  <meta name="description" content="Real-time transparency stream of every autonomous agent product invocation, free-tier quota meter, and x402 payment conversion diagnostic across NullClear." />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    :root {
      --bg: #07090e;
      --surface: #0c1018;
      --surface-2: #111827;
      --border: rgba(255, 255, 255, 0.09);
      --accent: #38bdf8;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --purple: #a855f7;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      padding-bottom: 64px;
    }
    .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
    .container { max-width: 1340px; margin: 0 auto; padding: 0 20px; }
    .top-nav {
      border-bottom: 1px solid var(--border);
      background: rgba(7, 9, 14, 0.92);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .top-nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 64px;
      gap: 14px;
      flex-wrap: wrap;
      padding: 10px 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      text-decoration: none;
      font-weight: 800;
      font-size: 18px;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #10b981, #38bdf8);
      color: #04130d;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
    }
    .nav-tabs {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .nav-tab {
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 7px 12px;
      border-radius: 8px;
      border: 1px solid transparent;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .nav-tab:hover { color: var(--text); border-color: var(--border); background: var(--surface); }
    .nav-tab.active {
      color: var(--emerald);
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.38);
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--emerald);
      display: inline-block;
      box-shadow: 0 0 8px var(--emerald);
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.45; transform: scale(1.25); }
    }
    .hero-bar {
      margin-top: 24px;
      background: linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(12, 16, 24, 0.96) 100%);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 14px;
      padding: 22px 24px;
      margin-bottom: 20px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
    }
    .kpi-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 700;
    }
    .kpi-val {
      font-size: 26px;
      font-weight: 800;
      margin-top: 6px;
    }
    .kpi-sub {
      font-size: 12px;
      color: var(--muted);
      margin-top: 4px;
    }
    .diag-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 14px;
      margin-top: 14px;
    }
    .diag-card {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
    }
    .filter-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 14px;
    }
    .filter-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill-btn {
      cursor: pointer;
      padding: 7px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      transition: all 0.15s;
    }
    .pill-btn:hover, .pill-btn.active {
      color: var(--text);
      border-color: var(--accent);
      background: rgba(56, 189, 248, 0.14);
    }
    .btn {
      cursor: pointer;
      padding: 8px 13px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      font-size: 12.5px;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { border-color: var(--accent); }
    .btn-emerald {
      background: var(--emerald);
      color: #04130d;
      border-color: var(--emerald);
      font-weight: 700;
    }
    input.search-box {
      background: #05070b;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      min-width: 260px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    th, td {
      text-align: left;
      padding: 11px 10px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.02);
    }
    tr:hover td { background: rgba(255, 255, 255, 0.015); }
    .pay-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .b-paid { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.45); }
    .b-free { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); }
    .b-indexer { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35); }
    .b-402 { background: rgba(245, 158, 11, 0.16); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .b-limit { background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.45); }
    .b-400 { background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); }
    .actor-tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.07);
      color: #e2e8f0;
      font-family: monospace;
      font-size: 10.5px;
      font-weight: 700;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(520px, 1fr));
      gap: 20px;
    }
    .daily-chart-wrap {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
      gap: 10px;
      align-items: end;
      padding: 18px 14px 12px;
      background: #06080d;
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-top: 14px;
    }
    .day-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }
    .day-val {
      font-size: 11.5px;
      font-weight: 800;
      color: #f8fafc;
    }
    .day-bar-track {
      width: 100%;
      max-width: 38px;
      height: 150px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 6px;
      display: flex;
      align-items: flex-end;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .day-bar-stack {
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      border-radius: 5px 5px 0 0;
      overflow: hidden;
      transition: height 0.25s ease;
    }
    .day-label {
      font-size: 11px;
      font-weight: 700;
      color: var(--text);
      margin-top: 2px;
    }
    .day-sub {
      font-size: 10px;
      color: var(--muted);
    }
    .legend-row {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      font-size: 12px;
      color: var(--muted);
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      display: inline-block;
      margin-right: 5px;
      vertical-align: middle;
    }
    @media (max-width: 768px) {
      .grid-2, .diag-grid { grid-template-columns: 1fr; }
    }
    footer {
      border-top: 1px solid var(--border);
      margin-top: 40px;
      padding-top: 24px;
      color: var(--muted);
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    footer a { color: var(--accent); text-decoration: none; }
  </style>
</head>
<body>
  <nav class="top-nav">
    <div class="container top-nav-inner">
      <a href="/" class="brand">
        <span class="brand-mark">N</span>
        <span>NullClear <span style="color:var(--emerald)">Arbiter</span></span>
        <span class="mono" style="font-size:11px;color:var(--muted);padding:3px 8px;border:1px solid var(--border);border-radius:6px;">ERC-8004 #124595</span>
      </a>
      <div class="nav-tabs">
        <a href="/" class="nav-tab">⚡ Developer Portal</a>
        <a href="/history" class="nav-tab active"><span class="live-dot"></span> Live History &amp; Diagnostics</a>
        <a href="/firewall" class="nav-tab">🛡️ Pre-Sign Firewall &amp; RPC</a>
        <a href="/x402" class="nav-tab">🔐 x402 Clearinghouse</a>
        <a href="/leaderboard" class="nav-tab">🏆 Leaderboard &amp; Radar</a>
        <a href="https://nullclear.com" class="nav-tab">💼 SafePay (nullclear.com) ↗</a>
        <a href="mailto:ops@nullclear.dev" class="nav-tab mono" style="color:var(--accent);">✉️ ops@nullclear.dev</a>
      </div>
    </div>
  </nav>

  <main class="container">
    <!-- Hero Diagnostic Summary -->
    <section class="hero-bar">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;">
        <div>
          <div class="mono" style="font-size:11.5px;color:var(--emerald);font-weight:800;letter-spacing:0.06em;display:flex;align-items:center;gap:8px;">
            <span class="live-dot"></span>
            <span>NULLCLEAR ATTRIBUTION &amp; CONVERSION FUNNEL &bull; REAL-TIME AGENT USAGE TELEMETRY &amp; PAYMENT DIAGNOSTICS</span>
          </div>
          <h1 style="font-size:26px;font-weight:800;margin-top:6px;">NullClear Attribution & Conversion Funnel — Live Product History &amp; Payment Diagnostics</h1>
          <p id="execHeadline" style="color:#cbd5e1;font-size:14px;margin-top:8px;max-width:980px;line-height:1.55;">
            ${escapeHtml(report.executiveDiagnosis.headline)}
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button type="button" id="toggleLiveBtn" class="btn" onclick="toggleAutoPoll()">⏸ Pause Live (5s)</button>
          <button type="button" class="btn" onclick="fetchLiveHistory()">🔄 Refresh Now</button>
          <button type="button" class="btn btn-emerald" onclick="triggerLiveTestScan(this)">🧪 Fire Live Test Scan</button>
          <a href="/v1/telemetry/history" target="_blank" class="btn mono">JSON API ↗</a>
        </div>
      </div>
    </section>

    <!-- 6 High-Signal KPIs -->
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">1. Real Executed Product Uses (7d)</div>
        <div id="kpiProductUses" class="kpi-val mono" style="color:var(--emerald);">${c7d.realProductUses.toLocaleString()}</div>
        <div id="kpiProductUsesSub" class="kpi-sub">${todayRealCount.toLocaleString()} today &bull; ${yesterdayRealCount.toLocaleString()} yesterday (${c24.realProductUses.toLocaleString()} in rolling 24h)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">2. API/MCP vs. Scorecards (7d)</div>
        <div id="kpiFree200" class="kpi-val mono" style="color:var(--accent);">${c7d.executedFreeTier200.toLocaleString()} <span style="font-size:14px;color:var(--muted);">API</span> / <span style="color:var(--amber);">${c7d.publicScorecardReads.toLocaleString()}</span></div>
        <div id="kpiFree200Sub" class="kpi-sub">${c7d.mcpToolCalls.toLocaleString()} MCP tools/call in 7d (${c24.mcpToolCalls.toLocaleString()} in 24h)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">3. Active Free-Tier Agents Today</div>
        <div id="kpiActiveToday" class="kpi-val mono" style="color:#f8fafc;">${qm.activeCallersToday}</div>
        <div id="kpiActiveTodaySub" class="kpi-sub">Avg ${qm.avgCallsPerCallerToday}/10 calls &bull; Peak caller: ${qm.maxCallsBySingleCallerToday}/10</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">4. Agents Hitting 10-Call Paywall</div>
        <div id="kpiHitLimit" class="kpi-val mono" style="color:${qm.callersHittingPaywallToday > 0 ? "var(--rose)" : "var(--amber)"};">${qm.callersHittingPaywallToday} <span style="font-size:14px;color:var(--muted);">today</span></div>
        <div id="kpiHitLimitSub" class="kpi-sub">${qm.callersHittingPaywall7d} callers hit &ge;10/day limit in last 7d</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">5. Excluded 402 Probes (Not Uses)</div>
        <div id="kpi402Split" class="kpi-val mono" style="color:var(--purple);">${c7d.indexerBot402Probes.toLocaleString()} <span style="font-size:14px;color:var(--muted);">bots</span> / <span style="color:var(--amber);">${(c7d.realAgentUnpaid402 + c7d.freeTierExhausted402).toLocaleString()}</span></div>
        <div id="kpi402SplitSub" class="kpi-sub">Directory health bots vs. unfunded agent 402s</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">6. Settled x402 &amp; Passes</div>
        <div id="kpiSettled" class="kpi-val mono" style="color:var(--emerald);">${ls.totalPassedClearings} <span style="font-size:14px;color:var(--muted);">txs</span></div>
        <div id="kpiSettledSub" class="kpi-sub">$${ls.totalClearedVolumeUsdc} USDC &bull; ${ls.activePrepaidPasses} Passes (${ls.totalPassCreditsRemaining.toLocaleString()} cr)</div>
      </div>
    </section>

    <!-- Day-by-Day Real Product Usage Chart (14 Days) -->
    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="font-size:19px;font-weight:800;">📊 Day-by-Day Real Executed Product Usage (Last 14 Days, UTC)</h2>
          <p style="font-size:13px;color:var(--muted);">
            Strictly counts completed <code>HTTP 200</code> product executions (excludes all automated HTTP 402 directory uptime probes &amp; HTTP 400 bad-param probes)
          </p>
        </div>
        <div class="legend-row">
          <span><span class="legend-dot" style="background:#10b981;"></span>Forensics &amp; 1-Call Firewall API</span>
          <span><span class="legend-dot" style="background:#38bdf8;"></span>MCP Tool Calls (<code>tools/call</code>)</span>
          <span><span class="legend-dot" style="background:#a855f7;"></span>Bazaar Oracles, Escrow &amp; Reputation</span>
          <span><span class="legend-dot" style="background:#f59e0b;"></span>Web &amp; .MD Scorecards</span>
        </div>
      </div>

      <div id="dailyChartBars" class="daily-chart-wrap">
        ${dailyBarsHtml}
      </div>

      <details style="margin-top:14px;">
        <summary class="mono" style="cursor:pointer;font-size:12px;color:var(--accent);font-weight:700;">
          📋 View Exact Day-by-Day Breakdown Table (14 Days: Product Uses vs. Excluded 402 Probes)
        </summary>
        <div style="overflow-x:auto;margin-top:10px;">
          <table>
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>Total Real Product Uses (200 OK)</th>
                <th>Forensics &amp; Firewall API</th>
                <th>MCP tools/call</th>
                <th>Bazaar, Escrow &amp; Score</th>
                <th>Web &amp; .MD Scorecards</th>
                <th>Unique Free-Tier Agents</th>
                <th>Unpaid 402 Probes (Excluded)</th>
              </tr>
            </thead>
            <tbody id="dailyTableTbody">
              ${dailyTableRowsHtml}
            </tbody>
          </table>
        </div>
      </details>
    </section>

    <!-- Root-Cause Diagnosis: Why People Aren't Paying -->
    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 style="font-size:19px;font-weight:800;">🔬 Automated Root-Cause Diagnosis: Why Callers Aren&rsquo;t Paying</h2>
          <p style="font-size:13px;color:var(--muted);">Live attribution across D1 <code>traffic_events</code>, <code>free_tier_usage</code>, <code>clearings</code>, and <code>api_passes</code></p>
        </div>
        <span id="lastUpdatedLabel" class="mono" style="font-size:12px;color:var(--muted);">Updated just now</span>
      </div>
      <div id="reasonsContainer" class="diag-grid">
        ${reasonCardsHtml}
      </div>
    </section>

    <!-- Real-Time Product Usage History Feed -->
    <section class="card">
      <div class="filter-bar">
        <div>
          <h2 style="font-size:19px;font-weight:800;display:flex;align-items:center;gap:8px;">
            <span class="live-dot"></span>
            <span>Real-Time Product Usage History Stream</span>
          </h2>
          <p style="font-size:13px;color:var(--muted);">Every product call with caller fingerprint, target parameters, HTTP latency, and exact payment/non-payment reason</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input
            type="text"
            id="historySearchInput"
            class="search-box mono"
            placeholder="Filter by tool, 0x address, chain, UA, country..."
            oninput="debouncedFetchHistory()"
          />
        </div>
      </div>

      <div class="filter-pills" style="margin-bottom:16px;">
        <button type="button" class="pill-btn ${filter === "real_agents" ? "active" : ""}" data-filter="real_agents" onclick="setHistoryFilter('real_agents')">⚡ Real Agent Executions (No Indexer/400 Noise)</button>
        <button type="button" class="pill-btn ${filter === "executed_200" ? "active" : ""}" data-filter="executed_200" onclick="setHistoryFilter('executed_200')">✅ Executed 200 OK (Free &amp; Paid)</button>
        <button type="button" class="pill-btn ${filter === "mcp_calls" ? "active" : ""}" data-filter="mcp_calls" onclick="setHistoryFilter('mcp_calls')">🔌 MCP Tool Calls (tools/call)</button>
        <button type="button" class="pill-btn ${filter === "paywall_402" ? "active" : ""}" data-filter="paywall_402" onclick="setHistoryFilter('paywall_402')">🛑 Real Agent 402 Paywalls</button>
        <button type="button" class="pill-btn ${filter === "product_all" ? "active" : ""}" data-filter="product_all" onclick="setHistoryFilter('product_all')">🔥 All Product Hits (incl. Indexer 402 &amp; 400)</button>
        <button type="button" class="pill-btn ${filter === "error_400" ? "active" : ""}" data-filter="error_400" onclick="setHistoryFilter('error_400')">⚠️ Pre-Billing 400 Errors</button>
        <button type="button" class="pill-btn ${filter === "raw_all" ? "active" : ""}" data-filter="raw_all" onclick="setHistoryFilter('raw_all')">🌐 Raw Traffic Stream (incl. Handshakes)</button>
      </div>

      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Product / Tool Used</th>
              <th>Target / Query</th>
              <th>Agent / Caller Identity</th>
              <th>Status</th>
              <th>Billing Tier</th>
              <th>Why Unpaid / Payment Diagnostic</th>
            </tr>
          </thead>
          <tbody id="historyEventsTbody">
            ${eventRowsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Per-Caller Daily Quota Meters & Product Matrix -->
    <div class="grid-2">
      <section class="card">
        <h3 style="font-size:17px;font-weight:800;margin-bottom:4px;">⏱️ Per-Agent Daily Free-Tier Quota Meters (10 Calls/Day Limit)</h3>
        <p style="font-size:12.5px;color:var(--muted);margin-bottom:12px;">
          Tracks how close each active agent is to hitting call #11 (where the HTTP 402 x402 / Prepaid Pass paywall triggers):
        </p>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>Caller ID (Masked)</th>
                <th>Quota Bucket</th>
                <th>Date (UTC)</th>
                <th>Daily Usage</th>
                <th>Paywall Status</th>
              </tr>
            </thead>
            <tbody id="quotaMetersTbody">
              ${quotaRowsHtml}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h3 style="font-size:17px;font-weight:800;margin-bottom:4px;">📦 Product-by-Product Usage &amp; Outcome Matrix (7d)</h3>
        <p style="font-size:12.5px;color:var(--muted);margin-bottom:12px;">
          Separates successful 200 executions from real agent 402 challenges, directory indexer 402 probes, and 400 errors:
        </p>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>Product / Endpoint</th>
                <th>24h</th>
                <th>7d</th>
                <th>200 OK</th>
                <th>Agent 402</th>
                <th>Bot 402</th>
                <th>400 Err</th>
              </tr>
            </thead>
            <tbody id="productMatrixTbody">
              ${productMatrixHtml}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Settled x402 Clearings Ledger -->
    <section class="card">
      <h3 style="font-size:17px;font-weight:800;margin-bottom:4px;">💳 On-Chain x402 Clearing &amp; Escrow Ledger (<code>clearings</code>)</h3>
      <p style="font-size:12.5px;color:var(--muted);margin-bottom:12px;">
        Verified Base Mainnet EIP-3009 settlements and schema-escrow verifications:
      </p>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Timestamp (UTC)</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Buyer Wallet</th>
              <th>Target Resource / Token Audited</th>
            </tr>
          </thead>
          <tbody id="clearingsTbody">
            ${clearingsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <footer>
      <div>
        <strong>NullClear Organization</strong> &bull; Autonomous Agent Security, Pre-Execution Firewall &amp; Non-Custodial x402 Clearinghouse<br />
        Operations &amp; Enterprise Desk: <a href="mailto:ops@nullclear.dev" class="mono">ops@nullclear.dev</a> &bull; Base Mainnet (8453) &bull; ERC-8004 Agent #124595
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        <a href="/">Developer Portal</a>
        <a href="/firewall">Pre-Sign Firewall</a>
        <a href="/x402">x402 Clearinghouse</a>
        <a href="/leaderboard">Leaderboard</a>
        <a href="https://nullclear.com">NullClear SafePay (nullclear.com)</a>
        <a href="/openapi.json">OpenAPI 3.1</a>
      </div>
    </footer>
  </main>

  <script>
    let currentFilter = ${JSON.stringify(filter)};
    let livePollTimer = null;
    let isLivePolling = true;
    let searchDebounceTimer = null;

    function esc(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function relTime(ts, now) {
      const d = Math.max(0, Math.floor((now - ts) / 1000));
      if (d < 60) return d + 's ago';
      const m = Math.floor(d / 60);
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ' + (m % 60) + 'm ago';
      return Math.floor(h / 24) + 'd ' + (h % 24) + 'h ago';
    }

    function badgeCls(tier, status) {
      if (tier === 'x402-paid' || tier === 'prepaid-pass') return 'b-paid';
      if (status === 200) return 'b-free';
      if (tier === 'indexer-402-probe') return 'b-indexer';
      if (tier === 'free-tier-exhausted') return 'b-limit';
      if (status === 402) return 'b-402';
      return 'b-400';
    }

    function setHistoryFilter(f) {
      currentFilter = f;
      document.querySelectorAll('.filter-pills .pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === f);
      });
      fetchLiveHistory();
    }

    function debouncedFetchHistory() {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => fetchLiveHistory(), 280);
    }

    function toggleAutoPoll() {
      isLivePolling = !isLivePolling;
      const btn = document.getElementById('toggleLiveBtn');
      if (isLivePolling) {
        btn.textContent = '⏸ Pause Live (5s)';
        fetchLiveHistory();
      } else {
        btn.textContent = '▶ Resume Live';
      }
    }

    async function triggerLiveTestScan(btn) {
      const orig = btn.textContent;
      btn.textContent = '⏳ Running /v1/scan/base/USDC...';
      btn.disabled = true;
      try {
        await fetch('/v1/scan/base/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
        setTimeout(async () => {
          await fetchLiveHistory();
          btn.textContent = '✅ Logged in Stream!';
          setTimeout(() => {
            btn.textContent = orig;
            btn.disabled = false;
          }, 1500);
        }, 350);
      } catch (e) {
        btn.textContent = orig;
        btn.disabled = false;
      }
    }

    async function fetchLiveHistory() {
      const search = (document.getElementById('historySearchInput')?.value || '').trim();
      const url = '/v1/telemetry/history?limit=120&filter=' + encodeURIComponent(currentFilter) +
        (search ? '&search=' + encodeURIComponent(search) : '');
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data || !data.success) return;

        const now = data.generatedAt || Date.now();
        const c24 = data.counters24h;
        const c7d = data.counters7d;
        const qm = data.quotaMeters;
        const ls = data.ledgerSummary;

        document.getElementById('execHeadline').textContent = data.executiveDiagnosis.headline;
        document.getElementById('lastUpdatedLabel').textContent = 'Live · Updated ' + new Date(now).toISOString().slice(11, 19) + ' UTC';

        const ds = Array.isArray(data.dailySeries) ? data.dailySeries.slice(-14) : [];
        const todayPt = ds.length > 0 ? ds[ds.length - 1] : null;
        const yestPt = ds.length > 1 ? ds[ds.length - 2] : null;
        const todayCnt = todayPt ? todayPt.totalRealProductUses : c24.realProductUses;
        const yestCnt = yestPt ? yestPt.totalRealProductUses : 0;

        document.getElementById('kpiProductUses').textContent = c7d.realProductUses.toLocaleString();
        document.getElementById('kpiProductUsesSub').textContent =
          todayCnt.toLocaleString() + ' today · ' + yestCnt.toLocaleString() + ' yesterday (' + c24.realProductUses.toLocaleString() + ' in rolling 24h)';

        document.getElementById('kpiFree200').innerHTML =
          c7d.executedFreeTier200.toLocaleString() + ' <span style="font-size:14px;color:var(--muted);">API</span> / <span style="color:var(--amber);">' +
          c7d.publicScorecardReads.toLocaleString() + '</span>';
        document.getElementById('kpiFree200Sub').textContent =
          c7d.mcpToolCalls.toLocaleString() + ' MCP tools/call in 7d (' + c24.mcpToolCalls.toLocaleString() + ' in 24h)';

        document.getElementById('kpiActiveToday').textContent = qm.activeCallersToday;
        document.getElementById('kpiActiveTodaySub').textContent = 'Avg ' + qm.avgCallsPerCallerToday + '/10 calls · Peak caller: ' + qm.maxCallsBySingleCallerToday + '/10';

        document.getElementById('kpiHitLimit').innerHTML = qm.callersHittingPaywallToday + ' <span style="font-size:14px;color:var(--muted);">today</span>';
        document.getElementById('kpiHitLimitSub').textContent = qm.callersHittingPaywall7d + ' callers hit >=10/day limit in last 7d';

        document.getElementById('kpi402Split').innerHTML =
          c7d.indexerBot402Probes.toLocaleString() + ' <span style="font-size:14px;color:var(--muted);">bots</span> / <span style="color:var(--amber);">' +
          (c7d.realAgentUnpaid402 + c7d.freeTierExhausted402).toLocaleString() + '</span>';

        document.getElementById('kpiSettled').innerHTML = ls.totalPassedClearings + ' <span style="font-size:14px;color:var(--muted);">txs</span>';
        document.getElementById('kpiSettledSub').textContent = '$' + ls.totalClearedVolumeUsdc + ' USDC · ' + ls.activePrepaidPasses + ' Passes (' + ls.totalPassCreditsRemaining.toLocaleString() + ' cr)';

        const tbody = document.getElementById('historyEventsTbody');
        if (Array.isArray(data.events) && data.events.length > 0) {
          tbody.innerHTML = data.events.map(ev => {
            const iso = new Date(ev.timestamp).toISOString().replace('T', ' ').slice(0, 19);
            const rel = relTime(ev.timestamp, now);
            const bCls = badgeCls(ev.paymentTier, ev.status);
            const sCol = ev.status === 200 ? '#10b981' : ev.status === 402 ? '#f59e0b' : '#f43f5e';
            const uaShort = ev.userAgent ? ev.userAgent.slice(0, 48) : 'no-ua';
            return '<tr>' +
              '<td class="mono" style="white-space:nowrap;"><div style="font-weight:700;color:#f8fafc;">' + esc(rel) + '</div><div style="font-size:11px;color:#64748b;">' + esc(iso) + ' UTC</div></td>' +
              '<td><div style="font-size:11px;color:#38bdf8;font-weight:700;text-transform:uppercase;">' + esc(ev.productCategory) + '</div><div class="mono" style="font-weight:700;color:#f1f5f9;font-size:12.5px;">' + esc(ev.productName) + '</div></td>' +
              '<td class="mono" style="font-size:12px;color:#cbd5e1;max-width:220px;word-break:break-all;">' + esc(ev.targetSubject) + '</td>' +
              '<td><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span class="actor-tag">' + esc(ev.actorType) + '</span>' +
              (ev.country && ev.country !== 'XX' ? '<span class="mono" style="font-size:11px;color:#94a3b8;">' + esc(ev.country) + '</span>' : '') +
              (ev.clientId ? '<span class="mono" style="font-size:11px;color:#38bdf8;">' + esc(ev.clientId) + '</span>' : '') +
              '</div><div class="mono" style="font-size:11px;color:#64748b;margin-top:3px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(ev.userAgent || '') + '">' + esc(uaShort) + '</div></td>' +
              '<td class="mono" style="white-space:nowrap;"><span style="color:' + sCol + ';font-weight:800;">HTTP ' + ev.status + '</span>' + (ev.latencyMs ? '<div style="font-size:11px;color:#64748b;">' + ev.latencyMs + 'ms</div>' : '') + '</td>' +
              '<td><span class="pay-badge ' + bCls + '">' + esc(ev.paymentBadge) + '</span></td>' +
              '<td style="font-size:12.5px;color:#cbd5e1;min-width:250px;line-height:1.45;">' + esc(ev.diagnosticReason) + '</td>' +
              '</tr>';
          }).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:#94a3b8;">No events match the selected filter.</td></tr>';
        }
      } catch {}
    }

    livePollTimer = setInterval(() => {
      if (isLivePolling) fetchLiveHistory();
    }, 5000);
  </script>
</body>
</html>`;
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

telemetryRouter.get("/history", async (c) => {
  const store = getArbiterStore(c.env);
  const limit = Number(c.req.query("limit") || 120);
  const filter = c.req.query("filter") || "real_agents";
  const search = c.req.query("search") || "";
  const report = await store.getProductHistoryAndDiagnostics({ limit, filter, search });
  return c.json({
    success: true,
    ...report,
    _nullclear: buildNullClearMetadata({ verified: true })
  });
});

telemetryRouter.get("/diagnostics", async (c) => {
  const store = getArbiterStore(c.env);
  const limit = Number(c.req.query("limit") || 120);
  const filter = c.req.query("filter") || "real_agents";
  const search = c.req.query("search") || "";
  const report = await store.getProductHistoryAndDiagnostics({ limit, filter, search });
  return c.json({
    success: true,
    ...report,
    _nullclear: buildNullClearMetadata({ verified: true })
  });
});

telemetryRouter.get("/dashboard", async (c) => {
  const store = getArbiterStore(c.env);
  const filter = c.req.query("filter") || "real_agents";
  const search = c.req.query("search") || "";
  const report = await store.getProductHistoryAndDiagnostics({ limit: 120, filter, search });
  return c.html(renderLiveHistoryDiagnosticsHtml(report));
});

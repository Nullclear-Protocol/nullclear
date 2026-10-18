import { Hono, type Context, type Next } from "hono";
import {
  getArbiterStore,
  type Env,
  type TrafficActorType,
  type TrafficEventRecord
} from "../env.js";
import { buildNullClearMetadata } from "./free-tier.js";

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

  // 3. Check SDK Agents
  if (
    ua.includes("nullclear") ||
    ua.includes("x402") ||
    ua.includes("agentcash") ||
    ua.includes("payai") ||
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

export async function telemetryMiddleware(c: Context<Env>, next: Next) {
  const url = new URL(c.req.url);
  const path = url.pathname;
  const method = c.req.method;

  // Skip recording telemetry on the telemetry polling endpoints themselves to avoid self-noise
  if (path.startsWith("/v1/telemetry")) {
    await next();
    return;
  }

  let mcpMethod: string | null = null;
  let toolName: string | null = null;

  if ((path.startsWith("/mcp") || path.startsWith("/a2a")) && method === "POST") {
    try {
      const cloned = c.req.raw.clone();
      const body: any = await cloned.json();
      if (body && typeof body.method === "string") {
        mcpMethod = body.method;
        if (body.method === "tools/call" && body.params?.name) {
          toolName = String(body.params.name);
        } else if (path.startsWith("/a2a")) {
          toolName = `a2a:${body.method}`;
        }
      }
    } catch {
      // Ignore non-JSON bodies
    }
  } else if (path.startsWith("/v1/bazaar/")) {
    const endpoint = path.replace("/v1/bazaar/", "").split("/")[0];
    if (endpoint) toolName = `bazaar:${endpoint}`;
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
  }

  await next();

  const actorType = classifyActorType(
    c.req.header("user-agent"),
    c.req.raw.headers,
    path,
    method
  );

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
    status: c.res?.status || 200,
    actorType,
    mcpMethod,
    toolName,
    country,
    asn,
    referer
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

telemetryRouter.get("/dashboard", async (c) => {
  const store = getArbiterStore(c.env);
  const report = await store.getTelemetryFunnel();
  const w24 = report.last24h;
  const w7d = report.last7d;

  const actorRows = (Object.entries(w24.byActorType) as Array<[string, number]>)
    .map(
      ([actor, count24]) =>
        `<tr>
          <td><span class="badge">${actor}</span></td>
          <td class="mono">${count24.toLocaleString()}</td>
          <td class="mono">${(w7d.byActorType[actor as TrafficActorType] || 0).toLocaleString()}</td>
        </tr>`
    )
    .join("");

  const hostRows = Object.entries(w7d.byHost)
    .map(
      ([host, count7d]) =>
        `<tr>
          <td class="mono">${host}</td>
          <td class="mono">${(w24.byHost[host] || 0).toLocaleString()}</td>
          <td class="mono">${count7d.toLocaleString()}</td>
        </tr>`
    )
    .join("");

  const toolRows =
    w7d.mcp.topTools.length > 0
      ? w7d.mcp.topTools
          .map(
            (t) =>
              `<tr>
                <td class="mono">${t.toolName}</td>
                <td class="mono">${t.count.toLocaleString()}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="2" style="color:#64748b;">No tool invocations recorded in window yet</td></tr>`;

  const pathRows =
    w7d.topPaths.length > 0
      ? w7d.topPaths
          .map(
            (p) =>
              `<tr>
                <td class="mono">${p.path}</td>
                <td class="mono">${p.count.toLocaleString()}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="2" style="color:#64748b;">No paths recorded in window yet</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear Telemetry & Conversion Funnel Dashboard</title>
  <style>
    :root {
      --bg: #07090e;
      --card: #0f1420;
      --border: rgba(255,255,255,0.09);
      --accent: #38bdf8;
      --emerald: #10b981;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 32px 16px;
      line-height: 1.5;
    }
    .container { max-width: 1140px; margin: 0 auto; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    h1 { font-size: 28px; font-weight: 800; margin-bottom: 6px; }
    .sub { color: var(--muted); font-size: 14px; margin-bottom: 24px; }
    .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px; margin-bottom: 24px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }
    .stat-val { font-size: 28px; font-weight: 800; color: var(--emerald); margin-top: 6px; }
    .stat-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(56, 189, 248, 0.14);
      color: var(--accent);
      font-size: 11px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>NullClear Attribution & Conversion Funnel</h1>
    <p class="sub">Real-time D1 traffic classification across <code>api.nullclear.dev</code>, <code>nullclear.dev</code>, and <code>nullclear.com</code> · <a href="/v1/telemetry/funnel" style="color:var(--accent)">JSON API (/v1/telemetry/funnel)</a></p>

    <div class="grid-4">
      <div class="card">
        <div class="stat-label">1. Discovery Probes (7d)</div>
        <div class="stat-val mono">${w7d.funnel.discovery.toLocaleString()}</div>
        <div class="stat-sub">/.well-known/*, /llms.txt, /openapi.json (${w24.funnel.discovery} in 24h)</div>
      </div>
      <div class="card">
        <div class="stat-label">2. MCP Handshakes (7d)</div>
        <div class="stat-val mono">${w7d.funnel.mcpHandshake.toLocaleString()}</div>
        <div class="stat-sub">initialize &amp; tools/list (${w24.funnel.mcpHandshake} in 24h)</div>
      </div>
      <div class="card">
        <div class="stat-label">3. Free / Sandbox Tool Calls (7d)</div>
        <div class="stat-val mono">${w7d.funnel.freeOrSandboxCall.toLocaleString()}</div>
        <div class="stat-sub">tools/call, /v1/bazaar/*, /https://... (${w24.funnel.freeOrSandboxCall} in 24h)</div>
      </div>
      <div class="card">
        <div class="stat-label">4. Verified x402 Settlements (7d)</div>
        <div class="stat-val mono">${w7d.funnel.realX402Settlement.toLocaleString()}</div>
        <div class="stat-sub">Settled EIP-3009 clearings (${w24.funnel.realX402Settlement} in 24h)</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>Invocations by Actor Type</h3>
        <table>
          <thead><tr><th>Actor Class</th><th>24h</th><th>7d</th></tr></thead>
          <tbody>${actorRows}</tbody>
        </table>
      </div>
      <div class="card">
        <h3>Invocations by Host</h3>
        <table>
          <thead><tr><th>Hostname</th><th>24h</th><th>7d</th></tr></thead>
          <tbody>${hostRows || '<tr><td colspan="3" style="color:#64748b;">No host events yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>MCP Tools: Listed (${w7d.mcp.toolsListed}) vs Called (${w7d.mcp.toolsCalled}) · ${w7d.mcp.conversionRatePct}%</h3>
        <table>
          <thead><tr><th>Tool / Oracle Identifier</th><th>7d Calls</th></tr></thead>
          <tbody>${toolRows}</tbody>
        </table>
      </div>
      <div class="card">
        <h3>Top Requested Paths (7d)</h3>
        <table>
          <thead><tr><th>Path</th><th>7d Hits</th></tr></thead>
          <tbody>${pathRows}</tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;

  return c.html(html);
});

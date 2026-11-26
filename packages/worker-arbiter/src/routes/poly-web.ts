import { Hono } from "hono";
import type { Env } from "../env.js";
import { getTrendingScans } from "../services/forensics-engine.js";
import { auditPolymarketWhale } from "../services/poly-api.js";
import { getPolyStore } from "../services/poly-store.js";
import { renderPolyCalculatorHtml } from "../ui/poly-calculator.js";
import { renderPolyHomeHtml } from "../ui/poly-home.js";
import { renderPolyLeaderboardHtml } from "../ui/poly-leaderboard.js";
import { renderPolyLiveHtml } from "../ui/poly-live.js";
import { renderPolyTerminalHtml } from "../ui/poly-terminal.js";
import { renderPolyWhaleHtml } from "../ui/poly-whale.js";

export const polyWebRouter = new Hono<Env>();

// GET / — Refreshed Polymarket Policy-Guarded Execution & Whale Auditor Landing Page
polyWebRouter.get("/", async (c) => {
  const store = getPolyStore(c.env);
  const whales = await store.listAuditedWhales({ limit: 5 });
  return c.html(renderPolyHomeHtml(whales));
});

// GET /calculator — Free Tool 1: 2026 Real Fee & Copy-Tax Calculator
polyWebRouter.get("/calculator", (c) => {
  return c.html(renderPolyCalculatorHtml());
});

// GET /whale/:address — Free Tool 2: Indexable Whale Reality & Copyability Auditor
polyWebRouter.get("/whale/:address", async (c) => {
  const address = (c.req.param("address") || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return c.html(
      `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Invalid Wallet — NullClear</title></head><body style="background:#07090D;color:#F8FAFC;font-family:sans-serif;padding:48px;text-align:center;"><h1>Invalid Polymarket Address</h1><p style="color:#94A3B8;margin:12px 0;">Expected a 42-character Polygon 0x address.</p><a href="/" style="color:#10B981;">&larr; Back to NullClear</a></body></html>`,
      400
    );
  }
  const forceRefresh = c.req.query("refresh") === "true";
  const audited = await auditPolymarketWhale(address, c.env, { forceRefresh });
  c.header("Cache-Control", "public, max-age=180");
  return c.html(renderPolyWhaleHtml(audited));
});

// GET /leaderboard — Free Tool 3: Copyable Whale Leaderboard (sorted by Net Copier PnL)
polyWebRouter.get("/leaderboard", async (c) => {
  const category = (c.req.query("category") || "all").trim().toLowerCase();
  const store = getPolyStore(c.env);
  const whales = await store.listAuditedWhales({ category, limit: 100 });
  return c.html(renderPolyLeaderboardHtml(whales, category));
});

// GET /live — Live Whale Feed populated by Cloudflare Worker cron + D1 Copy-Tax verdicts
polyWebRouter.get("/live", async (c) => {
  const category = (c.req.query("category") || "all").trim().toLowerCase();
  const verdict = (c.req.query("verdict") || "ALL").trim().toUpperCase();
  const store = getPolyStore(c.env);
  const alerts = await store.listLiveWhaleAlerts({ category, verdict, limit: 40 });
  c.header("Cache-Control", "public, max-age=30");
  return c.html(renderPolyLiveHtml(alerts, category, verdict));
});

// GET /terminal — Phase 2 Non-Custodial Guarded Execution Terminal & Paper Mode
polyWebRouter.get("/terminal", (c) => {
  const liveAutocopyEnabled =
    String(c.env?.LIVE_AUTOCOPY_ENABLED || "false").toLowerCase() === "true";
  return c.html(
    renderPolyTerminalHtml({
      copyWhale: c.req.query("copy") || undefined,
      assetId: c.req.query("asset") || undefined,
      marketTitle: c.req.query("title") || undefined,
      category: c.req.query("category") || undefined,
      price: c.req.query("price") || undefined,
      size: c.req.query("size") || undefined,
      makerOnly: c.req.query("maker") === "1",
      mode: c.req.query("mode") === "live" ? "live" : "paper",
      liveAutocopyEnabled
    })
  );
});

// GET /sitemap.xml — Dynamic SEO Sitemap including /, /calculator, /leaderboard, /terminal, all cached D1 /whale/:address pages, plus SafePay & scan pages
polyWebRouter.get("/sitemap.xml", async (c) => {
  const [whales, trending] = await Promise.all([
    getPolyStore(c.env).listAuditedWhales({ limit: 250 }),
    getTrendingScans(c.env, undefined, 25)
  ]);

  const urls = [
    "https://nullclear.com/",
    "https://nullclear.com/live",
    "https://nullclear.com/calculator",
    "https://nullclear.com/leaderboard",
    "https://nullclear.com/terminal",
    ...whales.map((w) => `https://nullclear.com/whale/${w.address}`),
    "https://nullclear.com/safepay",
    "https://nullclear.com/for/freelancers",
    "https://nullclear.com/for/data-brokers",
    "https://nullclear.com/for/ai-bounties",
    "https://nullclear.com/for/otc-digital",
    ...trending.map((t) => `https://nullclear.com/scan/${t.chain}/${t.address}`)
  ];

  const uniqueUrls = Array.from(new Set(urls));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniqueUrls
  .map(
    (u) => `  <url>
    <loc>${u}</loc>
    <changefreq>daily</changefreq>
    <priority>${u === "https://nullclear.com/" ? "1.0" : u.includes("/whale/") ? "0.95" : "0.9"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});

// GET /robots.txt
polyWebRouter.get("/robots.txt", (c) => {
  const txt = `User-agent: *
Allow: /
Allow: /live
Allow: /calculator
Allow: /leaderboard
Allow: /whale/
Allow: /terminal
Allow: /safepay
Allow: /for/freelancers
Allow: /for/data-brokers
Allow: /for/ai-bounties
Allow: /for/otc-digital
Sitemap: https://nullclear.com/sitemap.xml
`;
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(txt);
});

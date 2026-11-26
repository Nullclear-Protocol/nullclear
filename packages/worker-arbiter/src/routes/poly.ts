import { Hono } from "hono";
import {
  DEFAULT_POLY_POLICY,
  POLYMARKET_2026_FEE_RATES,
  POLYMARKET_CHAIN_ID,
  POLYMARKET_COLLATERAL,
  POLYMARKET_ENDPOINTS,
  calculateCopyTaxComparison,
  normalizePolymarketCategory,
  type PolyWebhookFormat,
  type PolymarketCategory,
  type PolymarketPolicyConfig
} from "@nullclear/shared";
import type { Env } from "../env.js";
import {
  auditPolymarketWhale,
  fetchClobOrderBook,
  seedLeaderboardWhales
} from "../services/poly-api.js";
import { executeGuardedPolymarketOrder } from "../services/poly-policy-engine.js";
import { getPolyStore } from "../services/poly-store.js";
import {
  buildLiveWhaleAlertRecord,
  deliverByoWebhook,
  formatByoWebhookPayload,
  runPolymarketLiveFeedCron
} from "../services/poly-alerts.js";
import { validateTargetUrl } from "../services/ssrf-guard.js";

export const polyApiRouter = new Hono<Env>();

function sanitizeUserId(raw?: string | null): string {
  const cleaned = String(raw || "paper-guest").trim().replace(/[^a-zA-Z0-9_.:-]/g, "");
  return cleaned.slice(0, 64) || "paper-guest";
}

function isEvmAddress(raw: string): raw is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(raw.trim());
}

function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

// GET /api/poly/config — Public 2026 Polymarket fee table & V2 protocol config
polyApiRouter.get("/config", (c) => {
  return c.json({
    protocol: "Polymarket CLOB V2",
    chainId: POLYMARKET_CHAIN_ID,
    collateral: POLYMARKET_COLLATERAL,
    endpoints: POLYMARKET_ENDPOINTS,
    feeRates2026: POLYMARKET_2026_FEE_RATES,
    defaultPolicy: DEFAULT_POLY_POLICY,
    liveAutocopyEnabled: String(c.env?.LIVE_AUTOCOPY_ENABLED || "false").toLowerCase() === "true",
    builderCodeConfigured: Boolean(c.env?.NULLCLEAR_BUILDER_CODE?.trim()),
    builderKeyConfigured: Boolean(
      c.env?.POLYMARKET_BUILDER_API_KEY?.trim() &&
        c.env?.POLYMARKET_BUILDER_SECRET?.trim() &&
        c.env?.POLYMARKET_BUILDER_PASSPHRASE?.trim()
    ),
    relayerKeyConfigured: Boolean(
      c.env?.POLYMARKET_RELAYER_API_KEY?.trim() && c.env?.POLYMARKET_RELAYER_ADDRESS?.trim()
    )
  });
});

// GET & POST /api/poly/calculator — Exact 2026 Copy-Tax Calculator
polyApiRouter.all("/calculator", async (c) => {
  let body: any = {};
  if (c.req.method === "POST") {
    try {
      body = await c.req.json();
    } catch {}
  }
  const category = body.category ?? c.req.query("category") ?? "crypto";
  const entryPrice = Number(body.entryPrice ?? c.req.query("entryPrice") ?? 0.5);
  const orderSizeUsd = Number(body.orderSizeUsd ?? c.req.query("orderSizeUsd") ?? 250);
  const orderType =
    (body.orderType ?? c.req.query("orderType")) === "maker" ? "maker" : "taker";
  const slippageCents = Number(body.slippageCents ?? c.req.query("slippageCents") ?? 1.0);
  const competitorBotFeePct = Number(
    body.competitorBotFeePct ?? c.req.query("competitorBotFeePct") ?? 1.0
  );
  const nullclearBuilderFeePct = Number(
    body.nullclearBuilderFeePct ?? c.req.query("nullclearBuilderFeePct") ?? 0.4
  );

  const result = calculateCopyTaxComparison({
    category,
    entryPrice,
    orderSizeUsd,
    orderType,
    slippageCents,
    competitorBotFeePct,
    nullclearBuilderFeePct
  });
  return c.json({ success: true, ...result });
});

// GET /api/poly/whale/:address — KV-cached & D1-persisted Whale Reality & Copyability Auditor
polyApiRouter.get("/whale/:address", async (c) => {
  const address = (c.req.param("address") || "").trim();
  if (!isEvmAddress(address)) {
    return c.json(
      {
        success: false,
        error: "Invalid Polymarket wallet address. Expected 0x followed by 40 hex characters."
      },
      400
    );
  }
  const forceRefresh = c.req.query("refresh") === "true";
  const record = await auditPolymarketWhale(address, c.env, { forceRefresh });
  c.header("Cache-Control", "public, max-age=180");
  if (record.report.rateLimitWarning) {
    c.header("X-Poly-RateLimit-Warning", record.report.rateLimitWarning);
  }
  return c.json({
    success: true,
    whale: record
  });
});

// GET /api/poly/leaderboard — Ranked Copyable Whale Leaderboard (sorted by Net Copier PnL)
polyApiRouter.get("/leaderboard", async (c) => {
  const category = c.req.query("category") || "all";
  const limit = Math.min(250, Math.max(1, Number(c.req.query("limit") || 100) || 100));
  const store = getPolyStore(c.env);
  const whales = await store.listAuditedWhales({ category, limit });
  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    success: true,
    category,
    count: whales.length,
    whales: whales.map((w) => ({
      address: w.address,
      displayName: w.displayName,
      copyabilityGrade: w.copyabilityGrade,
      copyabilityScore: w.copyabilityScore,
      naivePnlUsd: w.naivePnlUsd,
      netCopierPnlUsd: w.netCopierPnlUsd,
      makerPnlUsd: w.makerPnlUsd,
      totalVolumeUsd: w.totalVolumeUsd,
      dragPct: w.dragPct,
      primaryCategory: w.primaryCategory,
      tradeCount: w.tradeCount,
      redFlagCount: w.report.redFlags.length,
      auditedAt: w.auditedAt
    }))
  });
});

// POST /api/poly/admin/seed-leaderboard — Admin/cron-callable Top-100 Month+Week Leaderboard Seeder
// Protected by POLY_ADMIN_TOKEN (`x-admin-token` or `Authorization: Bearer <token>`), or local-only dev guard.
polyApiRouter.post("/admin/seed-leaderboard", async (c) => {
  const configuredToken = c.env?.POLY_ADMIN_TOKEN?.trim();
  const isProd = (c.env?.ENVIRONMENT || "production").toLowerCase() === "production";
  const reqUrl = new URL(c.req.url);
  const isLocalHost =
    reqUrl.hostname === "localhost" ||
    reqUrl.hostname === "127.0.0.1" ||
    reqUrl.hostname === "::1";

  const authHeader = c.req.header("authorization") || "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const providedToken = (c.req.header("x-admin-token") || bearerToken || "").trim();

  if (configuredToken) {
    if (!providedToken || providedToken !== configuredToken) {
      return c.json({ success: false, error: "Unauthorized: invalid or missing admin token" }, 401);
    }
  } else if (isProd || !isLocalHost) {
    return c.json(
      {
        success: false,
        error: "Forbidden: POLY_ADMIN_TOKEN must be configured in production (or call from localhost in dev)"
      },
      403
    );
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const offset = Math.max(0, Number(body.offset ?? c.req.query("offset") ?? 0) || 0);
  const batchSize = Math.min(30, Math.max(1, Number(body.batchSize ?? c.req.query("batchSize") ?? 15) || 15));
  const limitPerPeriod = Math.min(
    100,
    Math.max(1, Number(body.limitPerPeriod ?? c.req.query("limitPerPeriod") ?? 100) || 100)
  );
  const forceRefresh = body.forceRefresh !== false && c.req.query("forceRefresh") !== "false";

  const result = await seedLeaderboardWhales(c.env, {
    offset,
    batchSize,
    limitPerPeriod,
    forceRefresh
  });

  return c.json({
    success: true,
    ...result,
    leaderboardUrl: "https://nullclear.com/leaderboard",
    sitemapUrl: "https://nullclear.com/sitemap.xml"
  });
});

// GET /api/poly/live-feed — D1-backed live whale fills + real-time Copy-Tax verdicts
polyApiRouter.get("/live-feed", async (c) => {
  const category = c.req.query("category") || "all";
  const verdict = c.req.query("verdict") || "ALL";
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 40) || 40));
  const store = getPolyStore(c.env);
  const alerts = await store.listLiveWhaleAlerts({ category, verdict, limit });
  c.header("Cache-Control", "public, max-age=30");
  return c.json({
    success: true,
    category,
    verdict,
    count: alerts.length,
    alerts
  });
});

// POST /api/poly/live-feed/run-cron — Manual diagnostic trigger for Live Whale Feed cron
polyApiRouter.post("/live-feed/run-cron", async (c) => {
  const dryRunWebhooks = c.req.query("dryRunWebhooks") !== "false";
  const result = await runPolymarketLiveFeedCron(c.env, { dryRunWebhooks });
  return c.json({ success: true, dryRunWebhooks, ...result });
});

// GET /api/poly/book/:assetId — Live CLOB V2 book snapshot
polyApiRouter.get("/book/:assetId", async (c) => {
  const assetId = (c.req.param("assetId") || "").trim();
  if (!assetId) {
    return c.json({ success: false, error: "Missing assetId" }, 400);
  }
  const fallback = Number(c.req.query("fallbackPrice") || 0.5) || 0.5;
  const book = await fetchClobOrderBook(assetId, c.env, fallback);
  return c.json({ success: true, book });
});

// GET /api/poly/policy — Fetch user policy (Paper Mode default ON)
polyApiRouter.get("/policy", async (c) => {
  const userId = sanitizeUserId(c.req.query("userId") || c.req.header("x-nullclear-user"));
  const store = getPolyStore(c.env);
  const policy = await store.getPolicyByUser(userId);
  return c.json({ success: true, policy });
});

// POST /api/poly/policy — Save user policy guardrails & optional BYO Webhook into D1 `poly_policies`
polyApiRouter.post("/policy", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  // Zero-custody safeguard: hard reject any payload attempting to submit a privateKey/mnemonic
  if (body.privateKey || body.private_key || body.mnemonic || body.seedPhrase) {
    return c.json(
      {
        success: false,
        error: "ZERO_CUSTODY_VIOLATION",
        message: "NullClear NEVER accepts or stores wallet private keys or mnemonics."
      },
      400
    );
  }

  let webhookUrl: string | null | undefined = undefined;
  if (body.webhookUrl !== undefined) {
    const rawUrl = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
    if (!rawUrl) {
      webhookUrl = null;
    } else {
      const check = validateTargetUrl(rawUrl, c.env?.ENVIRONMENT || "production");
      if (!check.allowed) {
        return c.json(
          {
            success: false,
            error: check.reason || "Invalid or unsafe webhookUrl (HTTPS required)"
          },
          400
        );
      }
      webhookUrl = rawUrl;
    }
  }

  const userId = sanitizeUserId(body.userId || c.req.header("x-nullclear-user"));
  const store = getPolyStore(c.env);
  const existing = await store.getPolicyByUser(userId);

  const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  const toCats = (arr: unknown, fallback: PolymarketCategory[]): PolymarketCategory[] => {
    if (!Array.isArray(arr)) return fallback;
    return Array.from(new Set(arr.map((x) => normalizePolymarketCategory(String(x)))));
  };

  const webhookFormat: PolyWebhookFormat =
    body.webhookFormat === "discord"
      ? "discord"
      : body.webhookFormat === "json"
        ? "json"
        : existing.webhookFormat || "json";

  const updated: PolymarketPolicyConfig = {
    ...existing,
    userId,
    walletAddress:
      typeof body.walletAddress === "string" && isEvmAddress(body.walletAddress)
        ? body.walletAddress.toLowerCase()
        : existing.walletAddress,
    mode: body.mode === "live" ? "live" : "paper",
    maxTradeUsd: clampNum(body.maxTradeUsd, 1, 250_000, existing.maxTradeUsd),
    maxDailySpendUsd: clampNum(body.maxDailySpendUsd, 1, 1_000_000, existing.maxDailySpendUsd),
    maxDailyLossUsd: clampNum(body.maxDailyLossUsd, 1, 500_000, existing.maxDailyLossUsd),
    maxSlippageCents: clampNum(body.maxSlippageCents, 0, 25, existing.maxSlippageCents),
    maxFeeDragPct: clampNum(body.maxFeeDragPct, 0, 50, existing.maxFeeDragPct),
    makerOnlyMode:
      typeof body.makerOnlyMode === "boolean" ? body.makerOnlyMode : existing.makerOnlyMode,
    allowedCategories: toCats(body.allowedCategories, existing.allowedCategories),
    blockedCategories: toCats(body.blockedCategories, existing.blockedCategories),
    webhookUrl: webhookUrl !== undefined ? webhookUrl : existing.webhookUrl ?? null,
    webhookFormat,
    active: typeof body.active === "boolean" ? body.active : existing.active
  };

  const saved = await store.upsertPolicy(updated);
  return c.json({ success: true, policy: saved });
});

// POST /api/poly/webhook/test — Send a formatted test alert (JSON or Discord Embed) to a BYO Webhook
polyApiRouter.post("/webhook/test", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }
  const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  const format: PolyWebhookFormat = body.webhookFormat === "discord" ? "discord" : "json";
  if (!webhookUrl) {
    return c.json({ success: false, error: "Missing webhookUrl" }, 400);
  }
  const sampleAlert = buildLiveWhaleAlertRecord({
    tradeId: `test_${Date.now()}`,
    whaleAddress: "0x9d84ce0306f8551e02efef1680475fc0f1dc1344",
    whaleLabel: "GeoMacro Alpha (Test Alert)",
    assetId: "71321045679252212594626385532706912750332728571942532289631379312455583992563",
    marketTitle: "Will a diplomatic ceasefire agreement be signed before Q2?",
    category: "geopolitics",
    side: "BUY",
    whalePrice: 0.34,
    currentBestAsk: 0.345,
    notionalUsd: 5000
  });

  if (body.dryRun === true) {
    return c.json({
      success: true,
      delivered: true,
      status: 200,
      dryRun: true,
      payload: formatByoWebhookPayload(sampleAlert, format)
    });
  }

  const delivery = await deliverByoWebhook({
    webhookUrl,
    format,
    alert: sampleAlert,
    environment: c.env?.ENVIRONMENT
  });
  return c.json({
    success: delivery.delivered,
    ...delivery
  });
});

// GET /api/poly/terminal/state — Full Paper + Guarded Live Terminal state for user
polyApiRouter.get("/terminal/state", async (c) => {
  const userId = sanitizeUserId(c.req.query("userId") || c.req.header("x-nullclear-user"));
  const store = getPolyStore(c.env);
  const [policy, metrics, positions, trades, receipts] = await Promise.all([
    store.getPolicyByUser(userId),
    store.getPaperAccountMetrics(userId),
    store.listPaperPositions(userId),
    store.listPaperTrades(userId, 40),
    store.listPolicyReceipts(userId, 30)
  ]);

  return c.json({
    success: true,
    userId,
    liveAutocopyEnabled: String(c.env?.LIVE_AUTOCOPY_ENABLED || "false").toLowerCase() === "true",
    policy,
    metrics,
    positions,
    trades,
    receipts: receipts.map((r) => ({
      ...r,
      receiptUrl: `https://nullclear.dev/receipt/${encodeURIComponent(r.id)}`
    }))
  });
});

// POST /api/poly/terminal/execute — Execute Paper or Live Guarded Order through NullClear Policy Engine
polyApiRouter.post("/terminal/execute", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (body.privateKey || body.private_key || body.mnemonic || body.seedPhrase) {
    return c.json(
      {
        success: false,
        error: "ZERO_CUSTODY_VIOLATION",
        message: "NullClear NEVER accepts, stores, or logs wallet private keys."
      },
      400
    );
  }

  const userId = sanitizeUserId(body.userId || c.req.header("x-nullclear-user"));
  const assetId = String(body.assetId || "").trim();
  const marketTitle = String(body.marketTitle || "Polymarket Contract").trim().slice(0, 200);
  const category = String(body.category || "geopolitics").trim();
  const side = String(body.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const orderSizeUsd = Number(body.orderSizeUsd);
  const triggerPrice = Number(body.triggerPrice);

  if (!assetId || !Number.isFinite(orderSizeUsd) || orderSizeUsd <= 0 || !Number.isFinite(triggerPrice)) {
    return c.json(
      {
        success: false,
        error: "Missing or invalid required fields: assetId, orderSizeUsd, triggerPrice"
      },
      400
    );
  }

  const result = await executeGuardedPolymarketOrder(
    {
      userId,
      mode: body.mode === "live" ? "live" : "paper",
      walletAddress: isEvmAddress(String(body.walletAddress || ""))
        ? (body.walletAddress.toLowerCase() as `0x${string}`)
        : null,
      sessionSigner: isEvmAddress(String(body.sessionSigner || ""))
        ? (body.sessionSigner.toLowerCase() as `0x${string}`)
        : null,
      useDepositWallet1271: Boolean(body.useDepositWallet1271),
      assetId,
      marketTitle,
      category,
      side,
      orderSizeUsd,
      triggerPrice,
      liveBookAsk: typeof body.liveBookAsk === "number" ? body.liveBookAsk : null,
      tickSize: body.tickSize ?? null,
      postOnly: Boolean(body.postOnly),
      whaleAddress: typeof body.whaleAddress === "string" ? body.whaleAddress : null,
      clobOrderId: typeof body.clobOrderId === "string" ? body.clobOrderId : null,
      polygonTxHash: typeof body.polygonTxHash === "string" ? body.polygonTxHash : null,
      policyOverride: body.policyOverride,
      accountStateOverride: body.accountStateOverride,
      skipLiveBookFetch: Boolean(body.skipLiveBookFetch)
    },
    c.env
  );

  c.header("X-NullClear-Policy-Verdict", result.verdict);
  c.header("X-NullClear-Receipt-Url", result.receiptUrl);

  return c.json(
    {
      success: true,
      ...result
    },
    200
  );
});

// POST /api/poly/leads — Simple email lead capture with watched whale addresses (`user_leads` in D1)
polyApiRouter.post("/leads", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 140) : "";
  if (!isValidEmail(email)) {
    return c.json({ success: false, error: "Please provide a valid email address." }, 400);
  }
  const watchedWhales: string[] = Array.isArray(body.watchedWhales)
    ? body.watchedWhales.map((x: unknown) => String(x))
    : typeof body.whaleAddress === "string"
      ? [body.whaleAddress]
      : [];
  const walletAddress =
    typeof body.walletAddress === "string" && isEvmAddress(body.walletAddress)
      ? body.walletAddress.toLowerCase()
      : null;

  const store = getPolyStore(c.env);
  const lead = await store.upsertUserLead({
    email,
    watchedWhales,
    walletAddress,
    source: String(body.source || "whale_page"),
    subscribed: true
  });
  return c.json({ success: true, lead });
});

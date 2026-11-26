import {
  POLYMARKET_ENDPOINTS,
  POLYMARKET_SIGNATURE_TYPES,
  buildClobV2OrderStruct,
  floorToTickSize,
  normalizeBuilderCodeBytes32,
  normalizePolymarketCategory,
  resolvePolymarketAssetIds,
  simulateWhaleCopyability,
  type ClobV2OrderStruct,
  type PolymarketCategory,
  type WhaleAuditReport,
  type WhaleTradeSample
} from "@nullclear/shared";
import type { Env } from "../env.js";
import {
  CURATED_SEED_WHALES,
  getPolyStore,
  type AuditedWhaleRecord
} from "./poly-store.js";

export interface ClobOrderBookSummary {
  assetId: string;
  bestBid: number;
  bestAsk: number;
  spreadCents: number;
  askDepthUsd: number;
  bidDepthUsd: number;
  tickSize: number;
  liveFeeRate?: number | null;
  rateLimitWarning?: string | null;
  source: "live_clob" | "fallback";
}

export interface LiveMarketMeta {
  assetId: string;
  title: string;
  category: PolymarketCategory;
  tickSize: number;
  liveFeeRate?: number | null;
  slug?: string;
  protocolVersion: "v2_position_ids" | "legacy_ctf_clob_token_ids" | "single_asset";
}

export interface LeaderboardEntryV2 {
  rank: number;
  address: string;
  displayName: string;
  pnlUsd: number;
  volumeUsd: number;
  sourcePeriod: "month" | "week" | "month+week";
}

const WHALE_CACHE_TTL_SEC = 420; // 7 minutes KV cache TTL
const BOOK_CACHE_TTL_SEC = 15; // 15 seconds KV cache TTL

function getKv(env?: Env["Bindings"]): KVNamespace | undefined {
  return env?.NULLCLEAR_CACHE || env?.KV;
}

/**
 * Fetch wrapper respecting Polymarket rate limits and surfacing `Poly-RateLimit-Warning` headers.
 */
async function polyFetchJson<T>(
  url: string,
  timeoutMs = 5500
): Promise<{ ok: boolean; status: number; data: T | null; rateLimitWarning: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "NullClear-Polymarket-Guard/2.0"
      },
      signal: controller.signal
    });
    const rateLimitWarning =
      res.headers.get("Poly-RateLimit-Warning") || res.headers.get("poly-ratelimit-warning");
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, rateLimitWarning };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, rateLimitWarning };
  } catch {
    return { ok: false, status: 0, data: null, rateLimitWarning: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pure parser for Polymarket CLOB `/book` levels.
 *
 * CRITICAL: Polymarket CLOB `/book` returns `bids` ASCENDING (worst -> best at end)
 * and `asks` DESCENDING (worst -> best at end).
 * We explicitly compute:
 * - `bestBid` = `Math.max` across valid bid prices
 * - `bestAsk` = `Math.min` across valid ask prices
 * - `bidDepthUsd` = top 10 levels closest to bestBid (sorted descending)
 * - `askDepthUsd` = top 10 levels closest to bestAsk (sorted ascending)
 */
export function parseClobBookLevels(
  rawBids: Array<{ price?: string | number; size?: string | number }> | undefined,
  rawAsks: Array<{ price?: string | number; size?: string | number }> | undefined,
  fallbackPrice = 0.5
): {
  bestBid: number;
  bestAsk: number;
  bidDepthUsd: number;
  askDepthUsd: number;
} {
  const validBids = (Array.isArray(rawBids) ? rawBids : [])
    .map((b) => ({ price: Number(b?.price), size: Number(b?.size) }))
    .filter(
      (b) =>
        Number.isFinite(b.price) &&
        b.price > 0 &&
        b.price < 1 &&
        Number.isFinite(b.size) &&
        b.size > 0
    );

  const validAsks = (Array.isArray(rawAsks) ? rawAsks : [])
    .map((a) => ({ price: Number(a?.price), size: Number(a?.size) }))
    .filter(
      (a) =>
        Number.isFinite(a.price) &&
        a.price > 0 &&
        a.price < 1 &&
        Number.isFinite(a.size) &&
        a.size > 0
    );

  const bestBid =
    validBids.length > 0
      ? Math.max(...validBids.map((b) => b.price))
      : Math.max(0.005, fallbackPrice - 0.01);

  const bestAsk =
    validAsks.length > 0
      ? Math.min(...validAsks.map((a) => a.price))
      : Math.min(0.995, fallbackPrice + 0.005);

  // Near-touch top 10 levels (bids sorted highest->lowest, asks sorted lowest->highest)
  const bidDepthUsd = [...validBids]
    .sort((a, b) => b.price - a.price)
    .slice(0, 10)
    .reduce((sum, b) => sum + b.price * b.size, 0);

  const askDepthUsd = [...validAsks]
    .sort((a, b) => a.price - b.price)
    .slice(0, 10)
    .reduce((sum, a) => sum + a.price * a.size, 0);

  return {
    bestBid,
    bestAsk,
    bidDepthUsd: Number(bidDepthUsd.toFixed(2)),
    askDepthUsd: Number(askDepthUsd.toFixed(2))
  };
}

/**
 * Fetch live CLOB order book (`clob.polymarket.com/book?token_id=...`) with KV caching.
 */
export async function fetchClobOrderBook(
  assetId: string,
  env?: Env["Bindings"],
  fallbackPrice = 0.5
): Promise<ClobOrderBookSummary> {
  const kv = getKv(env);
  const cacheKey = `poly:book:${assetId}`;
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, "json");
      if (cached && typeof cached === "object") {
        return cached as ClobOrderBookSummary;
      }
    } catch {}
  }

  const url = `${POLYMARKET_ENDPOINTS.clob}/book?token_id=${encodeURIComponent(assetId)}`;
  const resp = await polyFetchJson<any>(url, 4000);

  if (resp.ok && resp.data) {
    const tickSize = Number(resp.data.tick_size || resp.data.minimum_tick_size || 0.01) || 0.01;
    const parsed = parseClobBookLevels(resp.data.bids, resp.data.asks, fallbackPrice);
    const liveFeeRate =
      resp.data.fee_rate !== undefined && resp.data.fee_rate !== null
        ? Number(resp.data.fee_rate)
        : null;

    const bestBid = floorToTickSize(parsed.bestBid, tickSize);
    const bestAsk = floorToTickSize(parsed.bestAsk, tickSize);

    const summary: ClobOrderBookSummary = {
      assetId,
      bestBid,
      bestAsk,
      spreadCents: Number(Math.max(0, (bestAsk - bestBid) * 100).toFixed(2)),
      askDepthUsd: parsed.askDepthUsd,
      bidDepthUsd: parsed.bidDepthUsd,
      tickSize,
      liveFeeRate: Number.isFinite(liveFeeRate) ? liveFeeRate : null,
      rateLimitWarning: resp.rateLimitWarning,
      source: "live_clob"
    };

    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify(summary), { expirationTtl: BOOK_CACHE_TTL_SEC });
      } catch {}
    }
    return summary;
  }

  const safeFallback = Math.min(0.98, Math.max(0.02, fallbackPrice));
  return {
    assetId,
    bestBid: floorToTickSize(Math.max(0.01, safeFallback - 0.005), 0.005),
    bestAsk: floorToTickSize(Math.min(0.99, safeFallback + 0.005), 0.005),
    spreadCents: 1.0,
    askDepthUsd: 25000,
    bidDepthUsd: 25000,
    tickSize: 0.005,
    liveFeeRate: null,
    rateLimitWarning: resp.rateLimitWarning,
    source: "fallback"
  };
}

/**
 * Fetch market metadata via `gamma-api.polymarket.com`, handling BOTH `version=v2` (`positionIds`)
 * and legacy v1 (`clobTokenIds`) markets cleanly.
 */
export async function fetchGammaMarketByAssetId(
  assetId: string,
  env?: Env["Bindings"]
): Promise<LiveMarketMeta | null> {
  const kv = getKv(env);
  const cacheKey = `poly:gamma:v2:${assetId}`;
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, "json");
      if (cached && typeof cached === "object") return cached as LiveMarketMeta;
    } catch {}
  }

  const encoded = encodeURIComponent(assetId);
  // Query Protocol V2 (`version=v2`) and legacy CTF (`clob_token_ids`) endpoints
  const candidateUrls = [
    `${POLYMARKET_ENDPOINTS.gamma}/markets?version=v2&position_ids=${encoded}&limit=1`,
    `${POLYMARKET_ENDPOINTS.gamma}/markets?clob_token_ids=${encoded}&limit=1`,
    `${POLYMARKET_ENDPOINTS.gamma}/markets?version=v2&clob_token_ids=${encoded}&limit=1`
  ];

  let matchedMarket: any = null;
  for (const url of candidateUrls) {
    const resp = await polyFetchJson<any>(url, 3800);
    const list: any[] = Array.isArray(resp.data)
      ? resp.data
      : Array.isArray(resp.data?.data)
        ? resp.data.data
        : [];
    if (resp.ok && list[0]) {
      matchedMarket = list[0];
      break;
    }
  }

  if (matchedMarket) {
    const m = matchedMarket;
    const resolved = resolvePolymarketAssetIds(m);
    const meta: LiveMarketMeta = {
      assetId: resolved.assetIds[0] || assetId,
      title: String(m.question || m.title || "Polymarket Prediction Market"),
      category: normalizePolymarketCategory(
        m.category ||
          (Array.isArray(m.tags) ? m.tags.map((t: any) => t?.label || t).join(" ") : "") ||
          m.question
      ),
      tickSize: Number(m.orderPriceMinTickSize || m.minimum_tick_size || 0.01) || 0.01,
      liveFeeRate: m.feeRate !== undefined && m.feeRate !== null ? Number(m.feeRate) : null,
      slug: m.slug,
      protocolVersion: resolved.protocolVersion
    };
    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify(meta), { expirationTtl: 1800 });
      } catch {}
    }
    return meta;
  }
  return null;
}

/**
 * Fetch wallet trades from Polymarket Data API V2 (`data-api.polymarket.com/v2/trades` — snake_case).
 * NEVER calls deprecated v1 endpoints (HTTP 410).
 */
export async function fetchWhaleTradesV2(
  address: string,
  limit = 40
): Promise<{
  trades: WhaleTradeSample[];
  displayName?: string;
  rateLimitWarning: string | null;
  fromLiveApi: boolean;
}> {
  const normalizedAddr = address.toLowerCase();
  const url = `${POLYMARKET_ENDPOINTS.dataV2}/trades?user=${encodeURIComponent(normalizedAddr)}&limit=${limit}`;
  const resp = await polyFetchJson<any>(url, 5500);

  const rawList: any[] = Array.isArray(resp.data)
    ? resp.data
    : Array.isArray(resp.data?.data)
      ? resp.data.data
      : Array.isArray(resp.data?.trades)
        ? resp.data.trades
        : [];

  if (!resp.ok || rawList.length === 0) {
    return { trades: [], rateLimitWarning: resp.rateLimitWarning, fromLiveApi: resp.ok };
  }

  let discoveredName: string | undefined;
  const trades: WhaleTradeSample[] = rawList
    .map((row: any, idx: number): WhaleTradeSample | null => {
      if (!discoveredName && typeof row.name === "string" && row.name.trim() && !row.name.startsWith("0x")) {
        discoveredName = row.name.trim().slice(0, 48);
      }
      const price = Number(row.price ?? row.avg_price ?? 0);
      const sizeShares = Number(row.size ?? row.shares ?? row.amount ?? 0);
      if (!Number.isFinite(price) || price <= 0 || price >= 1 || !Number.isFinite(sizeShares) || sizeShares <= 0) {
        return null;
      }
      const resolved = resolvePolymarketAssetIds({
        position_ids: row.position_id ? [row.position_id] : row.position_ids,
        asset_id: row.asset_id ?? row.asset ?? row.token_id
      });
      const assetId = resolved.assetIds[0] || `asset_${idx}`;
      const marketTitle = String(row.title ?? row.market_title ?? row.question ?? "Polymarket Market");
      const category = normalizePolymarketCategory(
        row.category ?? row.event_category ?? row.tag ?? row.event_slug ?? marketTitle
      );
      const rawTs = Number(row.timestamp ?? row.created_at ?? Date.now());
      const timestampMs = rawTs > 1e12 ? rawTs : rawTs * 1000;
      const side = String(row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";

      return {
        id: String(row.id ?? row.transaction_hash ?? `${normalizedAddr}_${timestampMs}_${idx}`),
        assetId,
        marketTitle,
        category,
        side,
        price,
        sizeShares,
        notionalUsd: Number((price * sizeShares).toFixed(2)),
        timestampMs,
        outcome: row.outcome ? String(row.outcome) : undefined,
        realizedPnlUsd:
          row.realized_pnl !== undefined && Number.isFinite(Number(row.realized_pnl))
            ? Number(row.realized_pnl)
            : null
      };
    })
    .filter((t): t is WhaleTradeSample => t !== null);

  return {
    trades,
    displayName: discoveredName,
    rateLimitWarning: resp.rateLimitWarning,
    fromLiveApi: true
  };
}

/**
 * Fetch wallet positions from Polymarket Data API V2 (`data-api.polymarket.com/v2/positions` — snake_case).
 */
export async function fetchWhalePositionsV2(address: string): Promise<{
  reportedPnlUsd: number | null;
  positionCount: number;
  rateLimitWarning: string | null;
}> {
  const url = `${POLYMARKET_ENDPOINTS.dataV2}/positions?user=${encodeURIComponent(address.toLowerCase())}&limit=100`;
  const resp = await polyFetchJson<any>(url, 5500);

  const rawList: any[] = Array.isArray(resp.data)
    ? resp.data
    : Array.isArray(resp.data?.data)
      ? resp.data.data
      : Array.isArray(resp.data?.positions)
        ? resp.data.positions
        : [];

  if (!resp.ok || rawList.length === 0) {
    return { reportedPnlUsd: null, positionCount: 0, rateLimitWarning: resp.rateLimitWarning };
  }

  let pnlSum = 0;
  let hasAnyPnl = false;
  for (const p of rawList) {
    const cashPnl = Number(p.total_pnl ?? p.cash_pnl ?? p.realized_pnl ?? NaN);
    if (Number.isFinite(cashPnl)) {
      pnlSum += cashPnl;
      hasAnyPnl = true;
    }
  }
  return {
    reportedPnlUsd: hasAnyPnl ? Number(pnlSum.toFixed(2)) : null,
    positionCount: rawList.length,
    rateLimitWarning: resp.rateLimitWarning
  };
}

/**
 * Fetch live top PnL leaderboard wallets from Polymarket Data API V2:
 * `https://data-api.polymarket.com/v2/leaderboard?time_period=month|week&sort_by=PNL&limit=100`
 */
export async function fetchLeaderboardV2(
  timePeriod: "month" | "week" = "month",
  limit = 100
): Promise<{ entries: LeaderboardEntryV2[]; rateLimitWarning: string | null }> {
  const clamped = Math.min(100, Math.max(1, limit));
  const url = `${POLYMARKET_ENDPOINTS.dataV2}/leaderboard?time_period=${timePeriod}&sort_by=PNL&limit=${clamped}`;
  const resp = await polyFetchJson<any>(url, 7000);

  const rawList: any[] = Array.isArray(resp.data?.data)
    ? resp.data.data
    : Array.isArray(resp.data)
      ? resp.data
      : [];

  const entries: LeaderboardEntryV2[] = [];
  for (const row of rawList) {
    const addr = String(row.user_id ?? row.proxy_wallet ?? row.address ?? "")
      .trim()
      .toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(addr)) continue;
    const rawName = String(row.user_name ?? row.name ?? "").trim();
    const cleanName =
      rawName && !rawName.toLowerCase().startsWith(addr)
        ? rawName.slice(0, 48)
        : `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    entries.push({
      rank: Number(row.rank || entries.length + 1),
      address: addr,
      displayName: cleanName,
      pnlUsd: Number(row.pnl || 0),
      volumeUsd: Number(row.volume || row.vol || 0),
      sourcePeriod: timePeriod
    });
  }

  return { entries, rateLimitWarning: resp.rateLimitWarning };
}

/**
 * Full Whale Reality & Copyability Audit with KV caching (7 min TTL) and D1 persistence.
 */
export async function auditPolymarketWhale(
  address: string,
  env?: Env["Bindings"],
  options?: {
    forceRefresh?: boolean;
    skipLiveFetch?: boolean;
    skipBookEnrich?: boolean;
    displayNameHint?: string;
    reportedPnlHintUsd?: number | null;
    reportedVolumeHintUsd?: number | null;
  }
): Promise<AuditedWhaleRecord> {
  const normalized = address.trim().toLowerCase();
  const store = getPolyStore(env);
  const kv = getKv(env);
  const kvKey = `poly:whale:v2:${normalized}`;

  if (!options?.forceRefresh && kv) {
    try {
      const cached = await kv.get(kvKey, "json");
      if (cached && typeof cached === "object" && (cached as AuditedWhaleRecord).report) {
        return cached as AuditedWhaleRecord;
      }
    } catch {}
  }

  const seedPreset = CURATED_SEED_WHALES.find((w) => w.address.toLowerCase() === normalized);

  let trades: WhaleTradeSample[] = [];
  let reportedPnlUsd: number | null = options?.reportedPnlHintUsd ?? null;
  const reportedVolumeUsd: number | null = options?.reportedVolumeHintUsd ?? null;
  let rateLimitWarning: string | null = null;
  let displayName =
    options?.displayNameHint ||
    seedPreset?.displayName ||
    `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;

  if (!options?.skipLiveFetch) {
    const tradesPromise = fetchWhaleTradesV2(normalized, 50);
    const posPromise =
      reportedPnlUsd === null
        ? fetchWhalePositionsV2(normalized)
        : Promise.resolve({ reportedPnlUsd, positionCount: 0, rateLimitWarning: null });
    const [tradesRes, posRes] = await Promise.all([tradesPromise, posPromise]);
    rateLimitWarning = tradesRes.rateLimitWarning || posRes.rateLimitWarning;

    if (tradesRes.displayName && displayName.includes("...")) {
      displayName = tradesRes.displayName;
    }

    if (tradesRes.trades.length > 0) {
      trades = tradesRes.trades;
      if (reportedPnlUsd === null) {
        reportedPnlUsd = posRes.reportedPnlUsd;
      }

      if (!options?.skipBookEnrich) {
        // Enrich top 3 distinct assets with live CLOB book depth (bounded to respect rate limits)
        const uniqueAssets = Array.from(new Set(trades.map((t) => t.assetId))).slice(0, 3);
        const bookEntries = await Promise.all(
          uniqueAssets.map(async (id) => [id, await fetchClobOrderBook(id, env)] as const)
        );
        const bookMap = new Map(bookEntries);
        trades = trades.map((t) => {
          const b = bookMap.get(t.assetId);
          return b ? { ...t, bookDepthUsd: b.askDepthUsd, liveAsk: b.bestAsk } : t;
        });
      }
    }
  }

  if (trades.length === 0) {
    const existing = await store.getAuditedWhale(normalized);
    if (existing && !options?.forceRefresh) {
      return existing;
    }
    if (seedPreset) {
      trades = seedPreset.trades;
      reportedPnlUsd = reportedPnlUsd ?? seedPreset.reportedPnlUsd;
      displayName = seedPreset.displayName;
    }
  }

  const report: WhaleAuditReport = simulateWhaleCopyability({
    address: normalized,
    displayName,
    trades,
    reportedPnlUsd,
    reportedVolumeUsd,
    rateLimitWarning
  });

  const primaryCategory =
    report.categoryBreakdown[0]?.category || seedPreset?.primaryCategory || "other";

  const record: AuditedWhaleRecord = {
    address: normalized,
    displayName,
    copyabilityGrade: report.copyabilityGrade,
    copyabilityScore: report.copyabilityScore,
    naivePnlUsd: report.naivePnlUsd,
    netCopierPnlUsd: report.scenarios.slip10.simulatedCopierPnlUsd,
    makerPnlUsd: report.makerSimulatedPnlUsd,
    totalVolumeUsd: report.totalVolumeUsd,
    dragPct: report.scenarios.slip10.dragPctOfVolume,
    primaryCategory,
    tradeCount: report.tradeCount,
    report,
    auditedAt: report.auditedAt,
    updatedAt: Date.now()
  };

  await store.upsertAuditedWhale(record);
  if (kv) {
    try {
      await kv.put(kvKey, JSON.stringify(record), { expirationTtl: WHALE_CACHE_TTL_SEC });
    } catch {}
  }

  return record;
}

/**
 * Rate-limit-safe Admin/Cron Leaderboard Seeder:
 * Fetches top 100 month + top 100 week PnL wallets from Data API v2, merges & deduplicates,
 * upserts into `watched_whales`, and audits `batchSize` wallets starting at `offset` into `audited_whales`.
 */
export async function seedLeaderboardWhales(
  env?: Env["Bindings"],
  options?: {
    offset?: number;
    batchSize?: number;
    limitPerPeriod?: number;
    skipWatchUpsert?: boolean;
    forceRefresh?: boolean;
  }
): Promise<{
  monthCount: number;
  weekCount: number;
  intersectionCount: number;
  totalUniqueWallets: number;
  watchedUpserted: number;
  offset: number;
  batchSize: number;
  auditedInBatch: number;
  nextOffset: number | null;
  done: boolean;
  rateLimitWarnings: string[];
  sampleResults: Array<{
    address: string;
    displayName: string;
    grade: string;
    category: string;
    naivePnlUsd: number;
    netCopierPnlUsd: number;
    dragPct: number;
  }>;
}> {
  const limitPerPeriod = Math.min(100, Math.max(1, options?.limitPerPeriod ?? 100));
  const offset = Math.max(0, options?.offset ?? 0);
  const batchSize = Math.min(30, Math.max(1, options?.batchSize ?? 15));

  const [monthRes, weekRes] = await Promise.all([
    fetchLeaderboardV2("month", limitPerPeriod),
    fetchLeaderboardV2("week", limitPerPeriod)
  ]);

  const rateLimitWarnings: string[] = [];
  if (monthRes.rateLimitWarning) rateLimitWarnings.push(`month:${monthRes.rateLimitWarning}`);
  if (weekRes.rateLimitWarning) rateLimitWarnings.push(`week:${weekRes.rateLimitWarning}`);

  const mergedMap = new Map<string, LeaderboardEntryV2>();
  for (const e of monthRes.entries) {
    mergedMap.set(e.address, e);
  }
  let intersectionCount = 0;
  for (const e of weekRes.entries) {
    const existing = mergedMap.get(e.address);
    if (existing) {
      intersectionCount += 1;
      existing.sourcePeriod = "month+week";
    } else {
      mergedMap.set(e.address, e);
    }
  }

  // Prioritize month+week intersection whales first, then top monthly PnL whales
  const allEntries = Array.from(mergedMap.values()).sort((a, b) => {
    const aBoth = a.sourcePeriod === "month+week" ? 1 : 0;
    const bBoth = b.sourcePeriod === "month+week" ? 1 : 0;
    if (aBoth !== bBoth) return bBoth - aBoth;
    return b.pnlUsd - a.pnlUsd;
  });

  const store = getPolyStore(env);
  let watchedUpserted = 0;

  // Upsert watched_whales on first batch (offset === 0) unless skipped
  if (!options?.skipWatchUpsert && offset === 0) {
    const now = Date.now();
    for (const entry of allEntries.slice(0, 120)) {
      await store.upsertWatchedWhale({
        address: entry.address,
        label: entry.displayName,
        primaryCategory: "other",
        minAlertUsd: 1500,
        active: true,
        lastPolledAt: 0,
        createdAt: now
      });
      watchedUpserted += 1;
    }
  }

  const slice = allEntries.slice(offset, offset + batchSize);
  const sampleResults: Array<{
    address: string;
    displayName: string;
    grade: string;
    category: string;
    naivePnlUsd: number;
    netCopierPnlUsd: number;
    dragPct: number;
  }> = [];

  // Process in small concurrency chunks of 3 to stay well within Polymarket & CF subrequest budgets
  for (let i = 0; i < slice.length; i += 3) {
    const chunk = slice.slice(i, i + 3);
    const auditedChunk = await Promise.all(
      chunk.map((entry) =>
        auditPolymarketWhale(entry.address, env, {
          forceRefresh: options?.forceRefresh ?? true,
          skipBookEnrich: true,
          displayNameHint: entry.displayName,
          reportedPnlHintUsd: entry.pnlUsd,
          reportedVolumeHintUsd: entry.volumeUsd
        })
      )
    );
    for (const rec of auditedChunk) {
      if (rec.report.rateLimitWarning) {
        rateLimitWarnings.push(`${rec.address}:${rec.report.rateLimitWarning}`);
      }
      // Keep watched_whales primaryCategory updated with the discovered real category
      await store.upsertWatchedWhale({
        address: rec.address,
        label: rec.displayName,
        primaryCategory: rec.primaryCategory,
        minAlertUsd: 1500,
        active: true,
        lastPolledAt: 0,
        createdAt: rec.auditedAt
      });
      sampleResults.push({
        address: rec.address,
        displayName: rec.displayName,
        grade: rec.copyabilityGrade,
        category: rec.primaryCategory,
        naivePnlUsd: rec.naivePnlUsd,
        netCopierPnlUsd: rec.netCopierPnlUsd,
        dragPct: rec.dragPct
      });
    }
  }

  const nextOffset = offset + slice.length < allEntries.length ? offset + slice.length : null;
  return {
    monthCount: monthRes.entries.length,
    weekCount: weekRes.entries.length,
    intersectionCount,
    totalUniqueWallets: allEntries.length,
    watchedUpserted,
    offset,
    batchSize,
    auditedInBatch: sampleResults.length,
    nextOffset,
    done: nextOffset === null,
    rateLimitWarnings,
    sampleResults
  };
}

/**
 * Prepare a Live Non-Custodial CLOB V2 Order payload + Relayer V2 Deposit Wallet (POLY_1271) scaffold.
 *
 * ZERO-CUSTODY INVARIANT:
 * - Never accepts, stores, or logs a user's wallet private key or mnemonic.
 * - Attaches NULLCLEAR_BUILDER_CODE (`bytes32`) INSIDE the signed V2 order struct (`builder` field).
 * - Never sends deprecated `POLY_BUILDER_*` headers on CLOB requests.
 * - Keeps HMAC Relayer credentials strictly scoped to `relayer-v2.polymarket.com`.
 */
export function buildLiveGuardedClobV2OrderBundle(params: {
  makerWallet: `0x${string}`;
  sessionSigner?: `0x${string}`;
  assetId: string;
  side: "BUY" | "SELL";
  rawPrice: number;
  tickSize: number | string;
  sizeUsd: number;
  postOnly: boolean;
  useDepositWallet1271?: boolean;
  env?: Env["Bindings"];
}): {
  sdkPackage: "@polymarket/client";
  orderStruct: ClobV2OrderStruct;
  clobSubmitUrl: string;
  relayerUrl: string;
  liveAutocopyEnabled: boolean;
  depositWalletFlow: {
    signatureType: number;
    mode: "MANUAL_EIP712" | "POLY_1271_SESSION_KEY";
    withdrawalPermission: false;
    note: string;
  };
} {
  const liveAutocopyEnabled =
    String(params.env?.LIVE_AUTOCOPY_ENABLED || "false").toLowerCase() === "true";
  const builderBytes32 = normalizeBuilderCodeBytes32(params.env?.NULLCLEAR_BUILDER_CODE);
  const use1271 = Boolean(params.useDepositWallet1271);

  const orderStruct = buildClobV2OrderStruct({
    maker: params.makerWallet,
    signer: use1271 && params.sessionSigner ? params.sessionSigner : params.makerWallet,
    assetId: params.assetId,
    side: params.side,
    rawPrice: params.rawPrice,
    tickSize: params.tickSize,
    sizeUsd: params.sizeUsd,
    postOnly: params.postOnly,
    signatureType: use1271
      ? POLYMARKET_SIGNATURE_TYPES.POLY_1271_DEPOSIT_WALLET
      : POLYMARKET_SIGNATURE_TYPES.EOA,
    builderCode: builderBytes32
  });

  return {
    sdkPackage: "@polymarket/client",
    orderStruct,
    clobSubmitUrl: `${POLYMARKET_ENDPOINTS.clob}/order`,
    relayerUrl: POLYMARKET_ENDPOINTS.relayerV2,
    liveAutocopyEnabled,
    depositWalletFlow: {
      signatureType: orderStruct.signatureType,
      mode: use1271 ? "POLY_1271_SESSION_KEY" : "MANUAL_EIP712",
      withdrawalPermission: false,
      note: use1271
        ? liveAutocopyEnabled
          ? "POLY_1271 Deposit Wallet scoped session key active (non-withdrawal, NullClear policy-gated)."
          : "POLY_1271 Deposit Wallet scaffold ready. Set LIVE_AUTOCOPY_ENABLED=true after small-balance verification."
        : "Sign CLOB V2 EIP-712 order directly in browser wallet; builder code embedded in order.builder bytes32."
    }
  };
}

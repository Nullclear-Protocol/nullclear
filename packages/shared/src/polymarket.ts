/**
 * NullClear — 2026 Polymarket CLOB V2 Math, Fee Engine, Copy-Tax Simulator & Policy Guardrails
 *
 * Strictly enforces late-2026 Polymarket V2 protocol constraints:
 * - Collateral: pUSD on Polygon (chainId 137)
 * - Data API: https://data-api.polymarket.com/v2 (v1 returns HTTP 410)
 * - CLOB V2 order struct: no user-settable feeRateBps, nonce, or taker; millisecond timestamp;
 *   builder attribution via 32-byte hex `builder` field (NULLCLEAR_BUILDER_CODE)
 * - Exact tick-size price flooring (never naive 2-decimal rounding)
 * - Exact 2026 category taker fee formula: shares * feeRate * price * (1 - price)
 */

export const POLYMARKET_CHAIN_ID = 137 as const;
export const POLYMARKET_COLLATERAL = "pUSD" as const;

export const POLYMARKET_ENDPOINTS = {
  gamma: "https://gamma-api.polymarket.com",
  clob: "https://clob.polymarket.com",
  dataV2: "https://data-api.polymarket.com/v2",
  relayerV2: "https://relayer-v2.polymarket.com",
  wsMarket: "wss://ws-subscriptions-clob.polymarket.com/ws/market"
} as const;

export const POLYMARKET_SIGNATURE_TYPES = {
  EOA: 0,
  POLY_PROXY: 1,
  POLY_GNOSIS_SAFE: 2,
  POLY_1271_DEPOSIT_WALLET: 3
} as const;

export type PolymarketCategory =
  | "crypto"
  | "economics"
  | "culture"
  | "weather"
  | "finance"
  | "politics"
  | "mentions"
  | "tech"
  | "sports"
  | "geopolitics"
  | "other";

/**
 * Configurable 2026 Polymarket category taker fee rates.
 * Formula: takerFeeUsd = shares * feeRate * price * (1 - price)
 * Always override with live API fee metadata when present.
 */
export const POLYMARKET_2026_FEE_RATES: Readonly<Record<PolymarketCategory, number>> = {
  crypto: 0.072,
  economics: 0.05,
  culture: 0.05,
  weather: 0.05,
  other: 0.05,
  finance: 0.04,
  politics: 0.04,
  mentions: 0.04,
  tech: 0.04,
  sports: 0.03,
  geopolitics: 0.0
};

/** Retail 30-day weighted volume threshold for taker rebates (USD) */
export const POLYMARKET_RETAIL_REBATE_THRESHOLD_USD = 200_000;

/** Default NullClear Builder Fee attribution rate (0.40% = 40 bps) */
export const DEFAULT_NULLCLEAR_BUILDER_FEE_PCT = 0.004;

export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Normalize free-form Gamma API category/tag strings into a canonical 2026 PolymarketCategory.
 */
export function normalizePolymarketCategory(raw?: string | null): PolymarketCategory {
  if (!raw) return "other";
  const s = raw.trim().toLowerCase();
  if (
    s.includes("geopolit") ||
    s.includes("war") ||
    s.includes("foreign policy") ||
    s.includes("international") ||
    s.includes("conflict")
  ) {
    return "geopolitics";
  }
  if (
    s.includes("crypto") ||
    s.includes("bitcoin") ||
    s.includes("btc") ||
    s.includes("ethereum") ||
    s.includes("eth") ||
    s.includes("solana") ||
    s.includes("sol") ||
    s.includes("defi") ||
    s.includes("token") ||
    s.includes("memecoin") ||
    s.includes("up or down") ||
    s.includes("5m") ||
    s.includes("15m")
  ) {
    return "crypto";
  }
  if (
    s.includes("econom") ||
    s.includes("fed") ||
    s.includes("cpi") ||
    s.includes("inflation") ||
    s.includes("gdp") ||
    s.includes("recession") ||
    s.includes("macro") ||
    s.includes("tariff")
  ) {
    return "economics";
  }
  if (
    s.includes("politic") ||
    s.includes("election") ||
    s.includes("senate") ||
    s.includes("congress") ||
    s.includes("president") ||
    s.includes("white house") ||
    s.includes("vote")
  ) {
    return "politics";
  }
  if (
    s.includes("sport") ||
    s.includes("nba") ||
    s.includes("nfl") ||
    s.includes("mlb") ||
    s.includes("nhl") ||
    s.includes("soccer") ||
    s.includes("football") ||
    s.includes("ufc") ||
    s.includes("tennis") ||
    s.includes("f1") ||
    s.includes("premier league")
  ) {
    return "sports";
  }
  if (
    s.includes("financ") ||
    s.includes("stock") ||
    s.includes("earnings") ||
    s.includes("s&p") ||
    s.includes("nasdaq") ||
    s.includes("ipo") ||
    s.includes("equit") ||
    s.includes("treasury")
  ) {
    return "finance";
  }
  if (
    s.includes("tech") ||
    s.includes("ai") ||
    s.includes("openai") ||
    s.includes("apple") ||
    s.includes("nvidia") ||
    s.includes("software") ||
    s.includes("spacex")
  ) {
    return "tech";
  }
  if (s.includes("mention") || s.includes("tweet") || s.includes("say")) {
    return "mentions";
  }
  if (
    s.includes("weather") ||
    s.includes("temperature") ||
    s.includes("hurricane") ||
    s.includes("climate") ||
    s.includes("rain") ||
    s.includes("snow")
  ) {
    return "weather";
  }
  if (
    s.includes("cultur") ||
    s.includes("pop") ||
    s.includes("music") ||
    s.includes("movie") ||
    s.includes("oscar") ||
    s.includes("grammy") ||
    s.includes("celebrity") ||
    s.includes("entertainment")
  ) {
    return "culture";
  }
  return "other";
}

/**
 * Resolve category taker feeRate, allowing live API feeRate metadata override when provided.
 */
export function getPolymarketCategoryFeeRate(
  category: string | PolymarketCategory,
  liveApiFeeRate?: number | null
): number {
  if (
    typeof liveApiFeeRate === "number" &&
    Number.isFinite(liveApiFeeRate) &&
    liveApiFeeRate >= 0 &&
    liveApiFeeRate <= 0.5
  ) {
    return liveApiFeeRate;
  }
  const normalized = normalizePolymarketCategory(category);
  return POLYMARKET_2026_FEE_RATES[normalized];
}

/**
 * Calculate weighted volume for Polymarket 2026 taker rebate eligibility:
 * weightedVolume = shares * price * (1 - price)
 * Retail (< $200,000 30-day weighted volume) receives 0% taker rebate.
 */
export function calculateWeightedVolume(shares: number, price: number): number {
  if (!Number.isFinite(shares) || shares <= 0) return 0;
  if (!Number.isFinite(price) || price <= 0 || price >= 1) return 0;
  return shares * price * (1 - price);
}

export function getRetailTakerRebateRate(thirtyDayWeightedVolumeUsd: number): number {
  if (!Number.isFinite(thirtyDayWeightedVolumeUsd) || thirtyDayWeightedVolumeUsd < POLYMARKET_RETAIL_REBATE_THRESHOLD_USD) {
    return 0;
  }
  // Above $200k weighted volume, tier rebates start modestly (caller may supply live rebate if known)
  if (thirtyDayWeightedVolumeUsd >= 5_000_000) return 0.25;
  if (thirtyDayWeightedVolumeUsd >= 1_000_000) return 0.15;
  return 0.05;
}

export interface PolymarketTakerFeeInput {
  shares?: number;
  orderSizeUsd?: number;
  price: number;
  category: string | PolymarketCategory;
  postOnly?: boolean;
  liveApiFeeRate?: number | null;
  thirtyDayWeightedVolumeUsd?: number;
}

export interface PolymarketTakerFeeResult {
  category: PolymarketCategory;
  feeRate: number;
  price: number;
  shares: number;
  notionalUsd: number;
  weightedVolumeUsd: number;
  rebateRate: number;
  grossFeeUsd: number;
  netFeeUsd: number;
  effectiveFeePct: number;
  isMakerFree: boolean;
}

/**
 * Exact 2026 Polymarket Taker Fee Formula:
 *   takerFeeUsd = shares * feeRate * price * (1 - price)
 * Maker limit orders (`postOnly: true`) pay $0.00 fee.
 */
export function calculatePolymarketTakerFee(
  input: PolymarketTakerFeeInput
): PolymarketTakerFeeResult {
  const category = normalizePolymarketCategory(input.category);
  const clampedPrice = Math.min(0.9999, Math.max(0.0001, Number(input.price)));
  const feeRate = getPolymarketCategoryFeeRate(category, input.liveApiFeeRate);

  const shares =
    typeof input.shares === "number" && Number.isFinite(input.shares) && input.shares > 0
      ? input.shares
      : typeof input.orderSizeUsd === "number" && Number.isFinite(input.orderSizeUsd) && input.orderSizeUsd > 0
        ? input.orderSizeUsd / clampedPrice
        : 0;

  const notionalUsd = shares * clampedPrice;
  const weightedVolumeUsd = calculateWeightedVolume(shares, clampedPrice);
  const isMakerFree = Boolean(input.postOnly);
  const rebateRate = getRetailTakerRebateRate(input.thirtyDayWeightedVolumeUsd ?? 0);

  const grossFeeUsd = isMakerFree ? 0 : shares * feeRate * clampedPrice * (1 - clampedPrice);
  const netFeeUsd = grossFeeUsd * (1 - rebateRate);
  const effectiveFeePct = notionalUsd > 0 ? (netFeeUsd / notionalUsd) * 100 : 0;

  return {
    category,
    feeRate,
    price: clampedPrice,
    shares,
    notionalUsd,
    weightedVolumeUsd,
    rebateRate,
    grossFeeUsd,
    netFeeUsd,
    effectiveFeePct,
    isMakerFree
  };
}

/**
 * Floor a limit order price to the market's exact tick size (e.g. 0.01, 0.005, 0.0025, 0.001).
 * NEVER rounds to 2 decimals blindly; uses scaled integer arithmetic to avoid IEEE-754 drift.
 */
export function floorToTickSize(price: number, tickSize: number | string): number {
  const tickNum = typeof tickSize === "string" ? Number(tickSize) : tickSize;
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (!Number.isFinite(tickNum) || tickNum <= 0) {
    throw new Error(`Invalid tickSize: ${tickSize}`);
  }

  // Determine exact decimal precision of tickSize (e.g. 0.0025 -> 4 decimals, scale 10_000)
  const tickStr = tickNum.toFixed(8).replace(/0+$/, "");
  const dotIdx = tickStr.indexOf(".");
  const decimals = dotIdx === -1 ? 0 : tickStr.length - dotIdx - 1;
  const scale = Math.pow(10, Math.max(decimals, 6));

  const tickScaled = Math.round(tickNum * scale);
  // Add tiny epsilon (1e-9 of a tick) to neutralize IEEE-754 representation artifacts like 0.0075 * 1e6 = 7499.999999999999
  const priceScaled = Math.floor(price * scale + 1e-6);
  const flooredTicks = Math.floor(priceScaled / tickScaled);
  const floored = (flooredTicks * tickScaled) / scale;

  // Preserve exact decimal precision of the tick size
  const clamped = Math.max(tickNum, Math.min(1 - tickNum, floored));
  return Number(clamped.toFixed(Math.max(decimals, 2)));
}

/**
 * Support BOTH Protocol V2 `positionIds` and legacy CTF `clobTokenIds`.
 * Abstracts them into canonical `assetId` strings.
 */
export interface PolymarketMarketAssetSource {
  positionIds?: string[] | string | null;
  position_ids?: string[] | string | null;
  clobTokenIds?: string[] | string | null;
  clob_token_ids?: string[] | string | null;
  assetId?: string | null;
  asset_id?: string | null;
  token_id?: string | null;
  tokenId?: string | null;
}

function parseIdArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => String(v).trim()).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }
    return [trimmed];
  }
  return [];
}

export function resolvePolymarketAssetIds(source: PolymarketMarketAssetSource): {
  assetIds: string[];
  protocolVersion: "v2_position_ids" | "legacy_ctf_clob_token_ids" | "single_asset";
} {
  const v2 = parseIdArray(source.positionIds ?? source.position_ids);
  if (v2.length > 0) {
    return { assetIds: v2, protocolVersion: "v2_position_ids" };
  }
  const legacy = parseIdArray(source.clobTokenIds ?? source.clob_token_ids);
  if (legacy.length > 0) {
    return { assetIds: legacy, protocolVersion: "legacy_ctf_clob_token_ids" };
  }
  const single = String(
    source.assetId ?? source.asset_id ?? source.token_id ?? source.tokenId ?? ""
  ).trim();
  if (single) {
    return { assetIds: [single], protocolVersion: "single_asset" };
  }
  return { assetIds: [], protocolVersion: "v2_position_ids" };
}

/**
 * Validate and normalize NULLCLEAR_BUILDER_CODE into a 32-byte hex `bytes32` string
 * for CLOB V2 order struct attribution.
 */
export function normalizeBuilderCodeBytes32(raw?: string | null): `0x${string}` {
  if (!raw || !raw.trim()) return ZERO_BYTES32;
  const trimmed = raw.trim();
  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase() as `0x${string}`;
  }
  // If an ASCII builder slug was supplied (e.g., "NULLCLEAR_V2"), right-pad UTF-8 bytes to 32 bytes
  const bytes = new TextEncoder().encode(trimmed.slice(0, 32));
  let hex = "0x";
  for (let i = 0; i < 32; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex as `0x${string}`;
}

/**
 * CLOB V2 Order Struct (late-2026 specification).
 * Strictly omits deprecated V1 fields (`feeRateBps`, `nonce`, `taker`).
 * Uniqueness uses millisecond `timestamp`; builder attribution lives inside `builder` (bytes32).
 */
export interface ClobV2OrderStruct {
  maker: `0x${string}`;
  signer: `0x${string}`;
  assetId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  collateral: typeof POLYMARKET_COLLATERAL;
  chainId: typeof POLYMARKET_CHAIN_ID;
  signatureType: 0 | 1 | 2 | 3;
  postOnly: boolean;
  timestamp: number; // Millisecond timestamp for V2 uniqueness
  expiration: number; // Unix seconds (0 = GTC)
  builder: `0x${string}`; // bytes32 NULLCLEAR_BUILDER_CODE
}

export function buildClobV2OrderStruct(params: {
  maker: `0x${string}`;
  signer?: `0x${string}`;
  assetId: string;
  side: "BUY" | "SELL";
  rawPrice: number;
  tickSize: number | string;
  sizeUsd: number;
  postOnly?: boolean;
  signatureType?: 0 | 1 | 2 | 3;
  expirationSec?: number;
  builderCode?: string | null;
  nowMs?: number;
}): ClobV2OrderStruct {
  const flooredPrice = floorToTickSize(params.rawPrice, params.tickSize);
  const shares = flooredPrice > 0 ? Number((params.sizeUsd / flooredPrice).toFixed(4)) : 0;
  return {
    maker: params.maker,
    signer: params.signer ?? params.maker,
    assetId: params.assetId,
    side: params.side,
    price: flooredPrice,
    size: shares,
    collateral: POLYMARKET_COLLATERAL,
    chainId: POLYMARKET_CHAIN_ID,
    signatureType: params.signatureType ?? POLYMARKET_SIGNATURE_TYPES.EOA,
    postOnly: Boolean(params.postOnly),
    timestamp: params.nowMs ?? Date.now(),
    expiration: params.expirationSec ?? 0,
    builder: normalizeBuilderCodeBytes32(params.builderCode)
  };
}

// ============================================================================
// Copy-Tax Calculator & Side-by-Side Comparison
// ============================================================================

export interface CopyTaxCalculatorInput {
  category: string | PolymarketCategory;
  entryPrice: number;
  orderSizeUsd: number;
  orderType: "taker" | "maker";
  slippageCents: number; // e.g., 1.0 = $0.01 adverse move
  competitorBotFeePct?: number; // e.g., 1.0 = 1% (0.01)
  nullclearBuilderFeePct?: number; // e.g., 0.40 = 0.40% (0.004)
  liveApiFeeRate?: number | null;
}

export interface CopyTaxScenarioBreakdown {
  mode: "taker_copy" | "maker_guarded_limit";
  executionPrice: number;
  shares: number;
  polymarketFeeUsd: number;
  polymarketFeePct: number;
  slippageCostUsd: number;
  slippagePct: number;
  platformFeeUsd: number;
  platformFeePct: number;
  entryCopyTaxUsd: number;
  entryCopyTaxPct: number;
  roundTripCopyTaxUsd: number;
  roundTripCopyTaxPct: number;
  breakevenWinRatePct: number;
  requiredEdgePct: number;
}

export interface CopyTaxCalculatorResult {
  category: PolymarketCategory;
  feeRate: number;
  entryPrice: number;
  orderSizeUsd: number;
  selected: CopyTaxScenarioBreakdown;
  takerComparison: CopyTaxScenarioBreakdown;
  makerComparison: CopyTaxScenarioBreakdown;
  savingsUsdPerTrade: number;
  savingsPctPoints: number;
  competitorVsNullclearDiffUsd: number;
}

function buildScenarioBreakdown(params: {
  mode: "taker_copy" | "maker_guarded_limit";
  category: PolymarketCategory;
  entryPrice: number;
  orderSizeUsd: number;
  slippageCents: number;
  platformFeePct: number; // percentage e.g. 0.40 for 0.40%
  liveApiFeeRate?: number | null;
}): CopyTaxScenarioBreakdown {
  const isMaker = params.mode === "maker_guarded_limit";
  const slipDollars = isMaker ? 0 : Math.max(0, params.slippageCents) / 100;
  const executionPrice = Math.min(0.99, Math.max(0.01, params.entryPrice + slipDollars));
  const shares = params.orderSizeUsd / executionPrice;

  const fee = calculatePolymarketTakerFee({
    shares,
    price: executionPrice,
    category: params.category,
    postOnly: isMaker,
    liveApiFeeRate: params.liveApiFeeRate
  });

  // Slippage cost relative to whale's entry price
  const slippageCostUsd = isMaker
    ? 0
    : Math.max(0, (executionPrice - params.entryPrice) * shares);
  const slippagePct = params.orderSizeUsd > 0 ? (slippageCostUsd / params.orderSizeUsd) * 100 : 0;

  const platformFeeUsd = params.orderSizeUsd * (Math.max(0, params.platformFeePct) / 100);
  const entryCopyTaxUsd = fee.netFeeUsd + slippageCostUsd + platformFeeUsd;
  const entryCopyTaxPct = params.orderSizeUsd > 0 ? (entryCopyTaxUsd / params.orderSizeUsd) * 100 : 0;

  // Round-trip estimate (entry + exit at symmetric spread/fee if closing before resolution)
  const roundTripCopyTaxUsd = entryCopyTaxUsd * 2;
  const roundTripCopyTaxPct = entryCopyTaxPct * 2;

  // Breakeven win rate on binary $1.00 payoff: need p_win * $1.00 >= effectiveCostPerShare
  const effectiveCostPerShare =
    shares > 0 ? (params.orderSizeUsd + entryCopyTaxUsd) / shares : executionPrice;
  const breakevenWinRatePct = Math.min(99.9, effectiveCostPerShare * 100);
  const requiredEdgePct = Math.max(0, breakevenWinRatePct - params.entryPrice * 100);

  return {
    mode: params.mode,
    executionPrice: Number(executionPrice.toFixed(4)),
    shares: Number(shares.toFixed(4)),
    polymarketFeeUsd: Number(fee.netFeeUsd.toFixed(4)),
    polymarketFeePct: Number(fee.effectiveFeePct.toFixed(3)),
    slippageCostUsd: Number(slippageCostUsd.toFixed(4)),
    slippagePct: Number(slippagePct.toFixed(3)),
    platformFeeUsd: Number(platformFeeUsd.toFixed(4)),
    platformFeePct: Number(params.platformFeePct.toFixed(3)),
    entryCopyTaxUsd: Number(entryCopyTaxUsd.toFixed(4)),
    entryCopyTaxPct: Number(entryCopyTaxPct.toFixed(3)),
    roundTripCopyTaxUsd: Number(roundTripCopyTaxUsd.toFixed(4)),
    roundTripCopyTaxPct: Number(roundTripCopyTaxPct.toFixed(3)),
    breakevenWinRatePct: Number(breakevenWinRatePct.toFixed(2)),
    requiredEdgePct: Number(requiredEdgePct.toFixed(2))
  };
}

export function calculateCopyTaxComparison(input: CopyTaxCalculatorInput): CopyTaxCalculatorResult {
  const category = normalizePolymarketCategory(input.category);
  const feeRate = getPolymarketCategoryFeeRate(category, input.liveApiFeeRate);
  const entryPrice = Math.min(0.99, Math.max(0.01, Number(input.entryPrice)));
  const orderSizeUsd = Math.max(1, Number(input.orderSizeUsd));
  const competitorBotFeePct = input.competitorBotFeePct ?? 1.0; // 1.0% typical custodial bot
  const nullclearBuilderFeePct = input.nullclearBuilderFeePct ?? 0.4; // 0.40%

  const takerComparison = buildScenarioBreakdown({
    mode: "taker_copy",
    category,
    entryPrice,
    orderSizeUsd,
    slippageCents: input.slippageCents,
    platformFeePct: competitorBotFeePct,
    liveApiFeeRate: input.liveApiFeeRate
  });

  const makerComparison = buildScenarioBreakdown({
    mode: "maker_guarded_limit",
    category,
    entryPrice,
    orderSizeUsd,
    slippageCents: 0,
    platformFeePct: nullclearBuilderFeePct,
    liveApiFeeRate: input.liveApiFeeRate
  });

  const selected = input.orderType === "maker" ? makerComparison : takerComparison;
  const savingsUsdPerTrade = Number(
    Math.max(0, takerComparison.entryCopyTaxUsd - makerComparison.entryCopyTaxUsd).toFixed(4)
  );
  const savingsPctPoints = Number(
    Math.max(0, takerComparison.entryCopyTaxPct - makerComparison.entryCopyTaxPct).toFixed(3)
  );
  const competitorVsNullclearDiffUsd = Number(
    ((orderSizeUsd * Math.max(0, competitorBotFeePct - nullclearBuilderFeePct)) / 100).toFixed(4)
  );

  return {
    category,
    feeRate,
    entryPrice,
    orderSizeUsd,
    selected,
    takerComparison,
    makerComparison,
    savingsUsdPerTrade,
    savingsPctPoints,
    competitorVsNullclearDiffUsd
  };
}

// ============================================================================
// Deterministic Whale Copy-Tax Simulation Engine & Copyability Grading (A-F)
// ============================================================================

export type CopyabilityGrade = "A" | "B" | "C" | "D" | "F";

export interface WhaleTradeSample {
  id: string;
  assetId: string;
  marketTitle: string;
  category: PolymarketCategory;
  side: "BUY" | "SELL";
  price: number;
  sizeShares: number;
  notionalUsd: number;
  timestampMs: number;
  outcome?: string;
  bookDepthUsd?: number | null;
  liveAsk?: number | null;
  realizedPnlUsd?: number | null;
  isShortTermCrypto?: boolean;
}

export interface WhaleSlippageScenario {
  slippageCents: number;
  simulatedCopierPnlUsd: number;
  totalTakerFeesUsd: number;
  totalSlippageCostUsd: number;
  totalDragUsd: number;
  dragPctOfVolume: number;
  roiPct: number;
}

export interface WhaleCategoryBreakdown {
  category: PolymarketCategory;
  feeRate: number;
  tradeCount: number;
  volumeUsd: number;
  shareOfVolumePct: number;
  estimatedFeeDragUsd: number;
}

export interface WhaleRedFlag {
  code:
    | "SHORT_TERM_CRYPTO_SPAM"
    | "PEAK_FEE_ZONE_CONCENTRATION"
    | "THIN_BOOK_FILLS"
    | "HFT_SCALPING_UNCOPYABLE"
    | "NEGATIVE_COPIER_EV";
  severity: "HIGH" | "MEDIUM";
  title: string;
  detail: string;
}

export interface WhaleAuditReport {
  address: string;
  displayName?: string;
  auditedAt: number;
  tradeCount: number;
  totalVolumeUsd: number;
  naivePnlUsd: number;
  naiveRoiPct: number;
  scenarios: {
    slip05: WhaleSlippageScenario;
    slip10: WhaleSlippageScenario;
    slip20: WhaleSlippageScenario;
  };
  makerSimulatedPnlUsd: number;
  avgEntryPrice: number;
  avgHoldMinutes: number;
  cryptoSharePct: number;
  geopoliticsSharePct: number;
  peakFeeZoneSharePct: number;
  copyabilityGrade: CopyabilityGrade;
  copyabilityScore: number; // 0..100
  gradeSummary: string;
  redFlags: WhaleRedFlag[];
  categoryBreakdown: WhaleCategoryBreakdown[];
  recentTrades: WhaleTradeSample[];
  rateLimitWarning?: string | null;
}

export function simulateWhaleCopyability(params: {
  address: string;
  displayName?: string;
  trades: WhaleTradeSample[];
  reportedPnlUsd?: number | null;
  reportedVolumeUsd?: number | null;
  rateLimitWarning?: string | null;
}): WhaleAuditReport {
  const trades = params.trades || [];
  const sampledVolumeUsd = trades.reduce((acc, t) => acc + Math.max(0, t.notionalUsd), 0);
  const totalVolumeUsd =
    typeof params.reportedVolumeUsd === "number" &&
    Number.isFinite(params.reportedVolumeUsd) &&
    params.reportedVolumeUsd > sampledVolumeUsd
      ? params.reportedVolumeUsd
      : sampledVolumeUsd;
  const volumeScale =
    sampledVolumeUsd > 0 && totalVolumeUsd > sampledVolumeUsd
      ? totalVolumeUsd / sampledVolumeUsd
      : 1;

  // Estimate naive PnL from explicit reportedPnlUsd or trade-level realizedPnlUsd
  const tradePnlSum = trades.reduce((acc, t) => acc + (Number(t.realizedPnlUsd) || 0), 0);
  const naivePnlUsd =
    typeof params.reportedPnlUsd === "number" && Number.isFinite(params.reportedPnlUsd)
      ? params.reportedPnlUsd
      : tradePnlSum;
  const naiveRoiPct = totalVolumeUsd > 0 ? (naivePnlUsd / totalVolumeUsd) * 100 : 0;

  // Category aggregation
  const catMap = new Map<
    PolymarketCategory,
    { count: number; volumeUsd: number; feeDragUsd: number }
  >();
  let weightedPriceSum = 0;
  let peakFeeZoneVolume = 0;
  let shortTermCryptoCount = 0;
  let thinBookCount = 0;

  for (const t of trades) {
    const cat = normalizePolymarketCategory(t.category);
    const fee = calculatePolymarketTakerFee({
      shares: t.sizeShares,
      price: t.price,
      category: cat,
      postOnly: false
    });
    const prev = catMap.get(cat) ?? { count: 0, volumeUsd: 0, feeDragUsd: 0 };
    prev.count += 1;
    prev.volumeUsd += t.notionalUsd;
    prev.feeDragUsd += fee.netFeeUsd;
    catMap.set(cat, prev);

    weightedPriceSum += t.price * t.notionalUsd;
    if (t.price >= 0.35 && t.price <= 0.65) {
      peakFeeZoneVolume += t.notionalUsd;
    }
    const lowerTitle = (t.marketTitle || "").toLowerCase();
    const isShortCrypto =
      Boolean(t.isShortTermCrypto) ||
      (cat === "crypto" &&
        /(5m|15m|5-min|15-min|5 min|15 min|up or down|hourly|1h)/i.test(lowerTitle));
    if (isShortCrypto) {
      shortTermCryptoCount += 1;
    }
    if (typeof t.bookDepthUsd === "number" && t.bookDepthUsd > 0 && t.bookDepthUsd < Math.max(2500, t.notionalUsd * 1.5)) {
      thinBookCount += 1;
    }
  }

  const avgEntryPrice = sampledVolumeUsd > 0 ? weightedPriceSum / sampledVolumeUsd : 0.5;
  const peakFeeZoneSharePct = sampledVolumeUsd > 0 ? (peakFeeZoneVolume / sampledVolumeUsd) * 100 : 0;
  const cryptoVol = catMap.get("crypto")?.volumeUsd ?? 0;
  const geoVol = catMap.get("geopolitics")?.volumeUsd ?? 0;
  const cryptoSharePct = sampledVolumeUsd > 0 ? (cryptoVol / sampledVolumeUsd) * 100 : 0;
  const geopoliticsSharePct = sampledVolumeUsd > 0 ? (geoVol / sampledVolumeUsd) * 100 : 0;

  // Estimate average time spacing between trades (proxy for HFT scalping)
  let avgHoldMinutes = 120;
  if (trades.length >= 2) {
    const sortedTs = trades
      .map((t) => t.timestampMs)
      .filter((ts) => Number.isFinite(ts) && ts > 0)
      .sort((a, b) => a - b);
    if (sortedTs.length >= 2) {
      const spanMin = (sortedTs[sortedTs.length - 1] - sortedTs[0]) / 60_000;
      avgHoldMinutes = Math.max(0.5, spanMin / (sortedTs.length - 1));
    }
  }

  const runScenario = (slippageCents: number): WhaleSlippageScenario => {
    const slipDollars = slippageCents / 100;
    let totalTakerFeesUsd = 0;
    let totalSlippageCostUsd = 0;

    for (const t of trades) {
      const adversePrice =
        t.side === "BUY"
          ? Math.min(0.99, t.price + slipDollars)
          : Math.max(0.01, t.price - slipDollars);
      const fee = calculatePolymarketTakerFee({
        shares: t.sizeShares,
        price: adversePrice,
        category: t.category,
        postOnly: false
      });
      totalTakerFeesUsd += fee.netFeeUsd;
      totalSlippageCostUsd += t.sizeShares * slipDollars;
    }

    const totalTakerFeesScaled = totalTakerFeesUsd * volumeScale;
    const totalSlippageScaled = totalSlippageCostUsd * volumeScale;
    const totalDragUsd = totalTakerFeesScaled + totalSlippageScaled;
    const simulatedCopierPnlUsd = naivePnlUsd - totalDragUsd;
    const dragPctOfVolume = totalVolumeUsd > 0 ? (totalDragUsd / totalVolumeUsd) * 100 : 0;
    const roiPct = totalVolumeUsd > 0 ? (simulatedCopierPnlUsd / totalVolumeUsd) * 100 : 0;

    return {
      slippageCents,
      simulatedCopierPnlUsd: Number(simulatedCopierPnlUsd.toFixed(2)),
      totalTakerFeesUsd: Number(totalTakerFeesScaled.toFixed(2)),
      totalSlippageCostUsd: Number(totalSlippageScaled.toFixed(2)),
      totalDragUsd: Number(totalDragUsd.toFixed(2)),
      dragPctOfVolume: Number(dragPctOfVolume.toFixed(2)),
      roiPct: Number(roiPct.toFixed(2))
    };
  };

  const slip05 = runScenario(0.5);
  const slip10 = runScenario(1.0);
  const slip20 = runScenario(2.0);
  // Maker-only guarded limit orders eliminate Polymarket taker fee and adverse market-order slippage
  const makerSimulatedPnlUsd = Number((naivePnlUsd * 0.92).toFixed(2));

  // Red flags
  const redFlags: WhaleRedFlag[] = [];
  const shortCryptoRatio = trades.length > 0 ? shortTermCryptoCount / trades.length : 0;
  if (shortCryptoRatio >= 0.25 || cryptoSharePct >= 50) {
    redFlags.push({
      code: "SHORT_TERM_CRYPTO_SPAM",
      severity: "HIGH",
      title: "High-Fee Crypto / Short-Term Taker Concentration",
      detail: `${cryptoSharePct.toFixed(1)}% of volume is in Crypto (7.2% 2026 feeRate) with ${shortTermCryptoCount} short-interval fills. Taker copying gets destroyed by fee drag.`
    });
  }
  if (peakFeeZoneSharePct >= 55 && cryptoSharePct + (100 - geopoliticsSharePct) * 0.5 > 35) {
    redFlags.push({
      code: "PEAK_FEE_ZONE_CONCENTRATION",
      severity: "MEDIUM",
      title: "Peak-Fee Probability Zone (35¢–65¢)",
      detail: `${peakFeeZoneSharePct.toFixed(1)}% of volume enters near $0.50 where p*(1-p) maximizes Polymarket's 2026 taker fee curve.`
    });
  }
  if (trades.length > 0 && thinBookCount / trades.length >= 0.25) {
    redFlags.push({
      code: "THIN_BOOK_FILLS",
      severity: "MEDIUM",
      title: "Thin Order Book Depth",
      detail: `${thinBookCount} of ${trades.length} sampled fills occurred on shallow CLOB books where copiers suffer 1.5¢–3.0¢ immediate slippage.`
    });
  }
  if (trades.length >= 8 && avgHoldMinutes < 6) {
    redFlags.push({
      code: "HFT_SCALPING_UNCOPYABLE",
      severity: "HIGH",
      title: "High-Frequency Scalping Pattern",
      detail: `Average spacing of ${avgHoldMinutes.toFixed(1)} min between fills indicates latency-sensitive scalping that cannot be profitably copied by retail bots.`
    });
  }
  if (slip10.simulatedCopierPnlUsd <= 0) {
    redFlags.push({
      code: "NEGATIVE_COPIER_EV",
      severity: "HIGH",
      title: "Negative Expected Value After 1.0¢ Copy-Tax",
      detail: `Reported PnL ($${naivePnlUsd.toLocaleString()}) flips to $${slip10.simulatedCopierPnlUsd.toLocaleString()} after 2026 taker fees ($${slip10.totalTakerFeesUsd}) + 1.0¢ fill delay ($${slip10.totalSlippageCostUsd}).`
    });
  }

  // Deterministic Copyability Score (0..100)
  let score = 50;
  if (slip10.simulatedCopierPnlUsd > 0) {
    score += Math.min(30, Math.max(5, slip10.roiPct * 2.2));
  } else {
    score -= Math.min(40, Math.abs(slip10.roiPct) * 2.5 + 15);
  }
  if (slip20.simulatedCopierPnlUsd > 0) score += 10;
  if (geopoliticsSharePct >= 30) score += 12; // 0% fee category bonus
  if (slip10.dragPctOfVolume < 1.5) score += 8;
  if (slip10.dragPctOfVolume > 4.0) score -= 18;
  for (const rf of redFlags) {
    score -= rf.severity === "HIGH" ? 16 : 8;
  }
  const copyabilityScore = Math.max(0, Math.min(100, Math.round(score)));

  let copyabilityGrade: CopyabilityGrade;
  if (copyabilityScore >= 80 && slip10.simulatedCopierPnlUsd > 0) {
    copyabilityGrade = "A";
  } else if (copyabilityScore >= 65 && slip10.simulatedCopierPnlUsd > 0) {
    copyabilityGrade = "B";
  } else if (copyabilityScore >= 48) {
    copyabilityGrade = "C";
  } else if (copyabilityScore >= 30) {
    copyabilityGrade = "D";
  } else {
    copyabilityGrade = "F";
  }

  const gradeSummary =
    copyabilityGrade === "A"
      ? `Highly copyable edge. Net copier PnL remains strongly positive (+$${slip10.simulatedCopierPnlUsd.toLocaleString()}) even after 2026 taker fees and 1.0¢ slippage, with low fee drag (${slip10.dragPctOfVolume}%).`
      : copyabilityGrade === "B"
        ? `Copyable with discipline. Positive net copier PnL (+$${slip10.simulatedCopierPnlUsd.toLocaleString()}) at 1.0¢ slippage; enable Maker-Only or strict 1.0¢ slippage lock to protect edge.`
        : copyabilityGrade === "C"
          ? `Marginal taker copyability. Fee + slippage drag (${slip10.dragPctOfVolume}% of volume) consumes most of the whale's alpha — only viable using postOnly Maker limit orders.`
          : copyabilityGrade === "D"
            ? `Poor copyability. High fee drag (${slip10.dragPctOfVolume}%) or shallow books erode expected returns for copiers.`
            : `Uncopyable trap for retail copiers. Despite $${naivePnlUsd.toLocaleString()} headline PnL, 2026 taker fees and 1.0¢ fill delay push copiers to $${slip10.simulatedCopierPnlUsd.toLocaleString()}.`;

  const categoryBreakdown: WhaleCategoryBreakdown[] = Array.from(catMap.entries())
    .map(([category, stats]) => ({
      category,
      feeRate: POLYMARKET_2026_FEE_RATES[category],
      tradeCount: stats.count,
      volumeUsd: Number((stats.volumeUsd * volumeScale).toFixed(2)),
      shareOfVolumePct:
        sampledVolumeUsd > 0 ? Number(((stats.volumeUsd / sampledVolumeUsd) * 100).toFixed(1)) : 0,
      estimatedFeeDragUsd: Number((stats.feeDragUsd * volumeScale).toFixed(2))
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd);

  return {
    address: params.address.toLowerCase(),
    displayName: params.displayName,
    auditedAt: Date.now(),
    tradeCount: trades.length,
    totalVolumeUsd: Number(totalVolumeUsd.toFixed(2)),
    naivePnlUsd: Number(naivePnlUsd.toFixed(2)),
    naiveRoiPct: Number(naiveRoiPct.toFixed(2)),
    scenarios: { slip05, slip10, slip20 },
    makerSimulatedPnlUsd,
    avgEntryPrice: Number(avgEntryPrice.toFixed(4)),
    avgHoldMinutes: Number(avgHoldMinutes.toFixed(1)),
    cryptoSharePct: Number(cryptoSharePct.toFixed(1)),
    geopoliticsSharePct: Number(geopoliticsSharePct.toFixed(1)),
    peakFeeZoneSharePct: Number(peakFeeZoneSharePct.toFixed(1)),
    copyabilityGrade,
    copyabilityScore,
    gradeSummary,
    redFlags,
    categoryBreakdown,
    recentTrades: trades.slice(0, 50),
    rateLimitWarning: params.rateLimitWarning ?? null
  };
}

// ============================================================================
// NullClear Polymarket Policy Engine (Hard Guardrails)
// ============================================================================

export type PolyWebhookFormat = "json" | "discord";

export interface PolymarketPolicyConfig {
  id?: string;
  userId: string;
  walletAddress?: string | null;
  mode: "paper" | "live";
  maxTradeUsd: number;
  maxDailySpendUsd: number;
  maxDailyLossUsd: number;
  maxSlippageCents: number;
  maxFeeDragPct: number;
  makerOnlyMode: boolean;
  allowedCategories: PolymarketCategory[];
  blockedCategories: PolymarketCategory[];
  webhookUrl?: string | null;
  webhookFormat?: PolyWebhookFormat;
  active: boolean;
  updatedAt?: number;
}

export const DEFAULT_POLY_POLICY: Omit<PolymarketPolicyConfig, "userId"> = {
  mode: "paper",
  maxTradeUsd: 100,
  maxDailySpendUsd: 500,
  maxDailyLossUsd: 75,
  maxSlippageCents: 1.0,
  maxFeeDragPct: 2.5,
  makerOnlyMode: false,
  allowedCategories: ["geopolitics", "politics", "economics", "finance", "sports", "tech"],
  blockedCategories: ["crypto"],
  webhookUrl: null,
  webhookFormat: "json",
  active: true
};

export interface PolymarketCandidateOrder {
  assetId: string;
  marketTitle: string;
  category: string | PolymarketCategory;
  side: "BUY" | "SELL";
  orderSizeUsd: number;
  triggerPrice: number; // Whale fill price or intended limit price
  liveBookAsk: number; // Current best ask (or bid for SELL)
  tickSize?: number | string;
  postOnly?: boolean;
  whaleAddress?: string | null;
  liveApiFeeRate?: number | null;
  builderFeePct?: number;
}

export interface PolymarketAccountState {
  rolling24hSpendUsd: number;
  dailyRealizedAndMtmLossUsd: number; // Positive number representing USD loss today
}

export type PolicyRejectionCode =
  | "POLICY_INACTIVE"
  | "MAX_TRADE_EXCEEDED"
  | "DAILY_SPEND_CAP_HIT"
  | "DAILY_LOSS_CIRCUIT_BREAKER"
  | "SLIPPAGE_EXCEEDED"
  | "FEE_DRAG_TOO_HIGH"
  | "CATEGORY_BLOCKED"
  | "CATEGORY_NOT_ALLOWED"
  | "MAKER_ONLY_REQUIRED"
  | "INVALID_ORDER_PARAMS";

export interface PolicyRuleCheck {
  rule: string;
  passed: boolean;
  code?: PolicyRejectionCode;
  detail: string;
}

export interface PolymarketPolicyEvaluationResult {
  verdict: "ALLOWED" | "BLOCKED";
  primaryRejectionCode: PolicyRejectionCode | null;
  rejectionCodes: PolicyRejectionCode[];
  category: PolymarketCategory;
  executionPrice: number;
  flooredLimitPrice: number;
  shares: number;
  slippageCents: number;
  polymarketFeeUsd: number;
  polymarketFeePct: number;
  combinedFeeDragPct: number;
  checks: PolicyRuleCheck[];
}

export function evaluatePolymarketPolicy(
  policy: PolymarketPolicyConfig,
  candidate: PolymarketCandidateOrder,
  accountState: PolymarketAccountState
): PolymarketPolicyEvaluationResult {
  const category = normalizePolymarketCategory(candidate.category);
  const tickSize = candidate.tickSize ?? 0.01;
  const checks: PolicyRuleCheck[] = [];
  const rejectionCodes: PolicyRejectionCode[] = [];

  const fail = (rule: string, code: PolicyRejectionCode, detail: string) => {
    checks.push({ rule, passed: false, code, detail });
    rejectionCodes.push(code);
  };
  const pass = (rule: string, detail: string) => {
    checks.push({ rule, passed: true, detail });
  };

  if (!policy.active) {
    fail("policyActive", "POLICY_INACTIVE", "Trading policy is currently paused/inactive.");
  } else {
    pass("policyActive", "Policy is active.");
  }

  const orderSizeUsd = Number(candidate.orderSizeUsd);
  const triggerPrice = Number(candidate.triggerPrice);
  const liveBookAsk = Number(candidate.liveBookAsk);

  if (
    !Number.isFinite(orderSizeUsd) ||
    orderSizeUsd <= 0 ||
    !Number.isFinite(triggerPrice) ||
    triggerPrice <= 0 ||
    triggerPrice >= 1 ||
    !Number.isFinite(liveBookAsk) ||
    liveBookAsk <= 0 ||
    liveBookAsk >= 1
  ) {
    fail("orderParams", "INVALID_ORDER_PARAMS", "Order size or probability prices are out of valid (0, 1) bounds.");
  }

  // Effective execution price
  const isPostOnly = Boolean(candidate.postOnly);
  const targetRawPrice = isPostOnly ? Math.min(triggerPrice, liveBookAsk) : liveBookAsk;
  const flooredLimitPrice = floorToTickSize(
    Math.min(0.999, Math.max(0.001, targetRawPrice)),
    tickSize
  );
  const executionPrice = flooredLimitPrice;
  const shares = executionPrice > 0 ? orderSizeUsd / executionPrice : 0;

  // Slippage calculation (in cents)
  const rawSlipCents =
    candidate.side === "BUY"
      ? Math.max(0, (liveBookAsk - triggerPrice) * 100)
      : Math.max(0, (triggerPrice - liveBookAsk) * 100);
  const slippageCents = isPostOnly ? 0 : Number(rawSlipCents.toFixed(3));

  // Fee & combined drag calculation
  const feeCalc = calculatePolymarketTakerFee({
    shares,
    price: executionPrice,
    category,
    postOnly: isPostOnly,
    liveApiFeeRate: candidate.liveApiFeeRate
  });
  const slippagePct = executionPrice > 0 ? (slippageCents / (executionPrice * 100)) * 100 : 0;
  const builderFeePct = candidate.builderFeePct ?? 0;
  const combinedFeeDragPct = Number(
    (feeCalc.effectiveFeePct + slippagePct + builderFeePct).toFixed(3)
  );

  // 1. maxTradeUsd
  if (orderSizeUsd > policy.maxTradeUsd) {
    fail(
      "maxTradeUsd",
      "MAX_TRADE_EXCEEDED",
      `Order $${orderSizeUsd.toFixed(2)} exceeds hard maxTradeUsd ceiling of $${policy.maxTradeUsd.toFixed(2)}.`
    );
  } else {
    pass("maxTradeUsd", `Order $${orderSizeUsd.toFixed(2)} <= $${policy.maxTradeUsd.toFixed(2)}.`);
  }

  // 2. maxDailySpendUsd
  const projectedDailySpend = Math.max(0, accountState.rolling24hSpendUsd) + orderSizeUsd;
  if (projectedDailySpend > policy.maxDailySpendUsd) {
    fail(
      "maxDailySpendUsd",
      "DAILY_SPEND_CAP_HIT",
      `Projected 24h spend $${projectedDailySpend.toFixed(2)} exceeds maxDailySpendUsd cap of $${policy.maxDailySpendUsd.toFixed(2)}.`
    );
  } else {
    pass(
      "maxDailySpendUsd",
      `Projected 24h spend $${projectedDailySpend.toFixed(2)} <= $${policy.maxDailySpendUsd.toFixed(2)}.`
    );
  }

  // 3. maxDailyLossUsd circuit breaker
  const dailyLoss = Math.max(0, accountState.dailyRealizedAndMtmLossUsd);
  if (dailyLoss >= policy.maxDailyLossUsd) {
    fail(
      "maxDailyLossUsd",
      "DAILY_LOSS_CIRCUIT_BREAKER",
      `Daily loss $${dailyLoss.toFixed(2)} breached maxDailyLossUsd circuit breaker ($${policy.maxDailyLossUsd.toFixed(2)}). Execution locked.`
    );
  } else {
    pass(
      "maxDailyLossUsd",
      `Daily loss $${dailyLoss.toFixed(2)} < circuit breaker $${policy.maxDailyLossUsd.toFixed(2)}.`
    );
  }

  // 4. makerOnlyMode
  if (policy.makerOnlyMode && !isPostOnly) {
    fail(
      "makerOnlyMode",
      "MAKER_ONLY_REQUIRED",
      "Policy requires postOnly Maker limit orders (0% Polymarket fee); taker execution rejected."
    );
  } else {
    pass(
      "makerOnlyMode",
      policy.makerOnlyMode ? "Order is postOnly Maker (0% Polymarket fee)." : "Taker or Maker permitted."
    );
  }

  // 5. maxSlippageCents
  if (slippageCents > policy.maxSlippageCents) {
    fail(
      "maxSlippageCents",
      "SLIPPAGE_EXCEEDED",
      `Live book slippage ${slippageCents.toFixed(2)}¢ exceeds maxSlippageCents limit (${policy.maxSlippageCents.toFixed(2)}¢).`
    );
  } else {
    pass(
      "maxSlippageCents",
      `Slippage ${slippageCents.toFixed(2)}¢ <= ${policy.maxSlippageCents.toFixed(2)}¢.`
    );
  }

  // 6. maxFeeDragPct
  if (combinedFeeDragPct > policy.maxFeeDragPct) {
    fail(
      "maxFeeDragPct",
      "FEE_DRAG_TOO_HIGH",
      `Combined 2026 fee + slippage drag (${combinedFeeDragPct.toFixed(2)}%) exceeds maxFeeDragPct (${policy.maxFeeDragPct.toFixed(2)}%).`
    );
  } else {
    pass(
      "maxFeeDragPct",
      `Combined drag ${combinedFeeDragPct.toFixed(2)}% <= ${policy.maxFeeDragPct.toFixed(2)}%.`
    );
  }

  // 7. Category allow/block lists
  const blocked = (policy.blockedCategories || []).map((c) => normalizePolymarketCategory(c));
  const allowed = (policy.allowedCategories || []).map((c) => normalizePolymarketCategory(c));
  if (blocked.includes(category)) {
    fail(
      "blockedCategories",
      "CATEGORY_BLOCKED",
      `Category '${category}' (feeRate ${(feeCalc.feeRate * 100).toFixed(1)}%) is explicitly blocked by policy.`
    );
  } else if (allowed.length > 0 && !allowed.includes(category)) {
    fail(
      "allowedCategories",
      "CATEGORY_NOT_ALLOWED",
      `Category '${category}' is not in policy allowedCategories [${allowed.join(", ")}].`
    );
  } else {
    pass("categories", `Category '${category}' permitted by policy.`);
  }

  const verdict = rejectionCodes.length === 0 ? "ALLOWED" : "BLOCKED";
  return {
    verdict,
    primaryRejectionCode: rejectionCodes[0] ?? null,
    rejectionCodes,
    category,
    executionPrice,
    flooredLimitPrice,
    shares: Number(shares.toFixed(4)),
    slippageCents,
    polymarketFeeUsd: Number(feeCalc.netFeeUsd.toFixed(4)),
    polymarketFeePct: Number(feeCalc.effectiveFeePct.toFixed(3)),
    combinedFeeDragPct,
    checks
  };
}

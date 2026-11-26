import {
  DEFAULT_POLY_POLICY,
  calculatePolymarketTakerFee,
  simulateWhaleCopyability,
  type CopyabilityGrade,
  type PolyWebhookFormat,
  type PolymarketCategory,
  type PolymarketPolicyConfig,
  type PolicyRuleCheck,
  type WhaleAuditReport,
  type WhaleTradeSample
} from "@nullclear/shared";
import type { Env } from "../env.js";

export interface AuditedWhaleRecord {
  address: string;
  displayName: string;
  copyabilityGrade: CopyabilityGrade;
  copyabilityScore: number;
  naivePnlUsd: number;
  netCopierPnlUsd: number;
  makerPnlUsd: number;
  totalVolumeUsd: number;
  dragPct: number;
  primaryCategory: PolymarketCategory;
  tradeCount: number;
  report: WhaleAuditReport;
  auditedAt: number;
  updatedAt: number;
}

export interface WatchedWhaleRecord {
  address: string;
  label: string;
  primaryCategory: PolymarketCategory;
  minAlertUsd: number;
  active: boolean;
  lastPolledAt: number;
  createdAt: number;
}

export interface LiveWhaleAlertRecord {
  id: string;
  tradeId: string;
  whaleAddress: string;
  whaleLabel: string;
  assetId: string;
  marketTitle: string;
  category: PolymarketCategory;
  side: "BUY" | "SELL";
  whalePrice: number;
  liveBestAsk: number;
  notionalUsd: number;
  slippageCents: number;
  takerFeePct: number;
  liveCopyTaxPct: number;
  verdict: "COPYABLE" | "PASS - SLIPPAGE TOO HIGH";
  webhooksDelivered: number;
  createdAt: number;
}

export interface PaperTradeRecord {
  id: string;
  userId: string;
  policyId: string | null;
  receiptId: string;
  whaleAddress: string | null;
  assetId: string;
  marketTitle: string;
  category: PolymarketCategory;
  side: "BUY" | "SELL";
  postOnly: boolean;
  triggerPrice: number;
  fillPrice: number;
  shares: number;
  notionalUsd: number;
  feeUsd: number;
  slippageCents: number;
  status: "FILLED" | "BLOCKED";
  rejectionReason: string | null;
  createdAt: number;
}

export interface PaperPositionRecord {
  id: string;
  userId: string;
  assetId: string;
  marketTitle: string;
  category: PolymarketCategory;
  side: "BUY" | "SELL";
  shares: number;
  avgEntryPrice: number;
  costBasisUsd: number;
  markPrice: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  updatedAt: number;
}

export interface PolicyReceiptRecord {
  id: string;
  userId: string;
  policyId: string | null;
  mode: "paper" | "live";
  walletAddress: string | null;
  whaleAddress: string | null;
  assetId: string;
  marketTitle: string;
  category: PolymarketCategory;
  side: "BUY" | "SELL";
  orderSizeUsd: number;
  triggerPrice: number;
  liveBookAsk: number;
  executionPrice: number;
  computedFeeUsd: number;
  computedFeeDragPct: number;
  slippageCents: number;
  verdict: "ALLOWED" | "BLOCKED";
  rejectionCode: string | null;
  rulesEvaluated: PolicyRuleCheck[];
  policySnapshot: PolymarketPolicyConfig;
  clobOrderId: string | null;
  polygonTxHash: string | null;
  builderCode: string | null;
  cosignerAddress: string | null;
  cosignerSignature: string | null;
  createdAt: number;
}

export interface UserLeadRecord {
  id: string;
  email: string;
  watchedWhales: string[];
  walletAddress: string | null;
  source: string;
  subscribed: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// 5 Pre-Seeded Leaderboard Whales & Initial Live Feed Benchmarks
// ============================================================================

export interface SeedWhalePreset {
  address: string;
  displayName: string;
  tagline: string;
  primaryCategory: PolymarketCategory;
  reportedPnlUsd: number;
  trades: WhaleTradeSample[];
}

const BASE_SEED_TS = 1795600000000;

export const CURATED_SEED_WHALES: SeedWhalePreset[] = [
  {
    address: "0x9d84ce0306f8551e02efef1680475fc0f1dc1344",
    displayName: "GeoMacro Alpha",
    tagline: "0% Fee Geopolitics Swing Whale",
    primaryCategory: "geopolitics",
    reportedPnlUsd: 48200,
    trades: [
      {
        id: "seed-geo-1",
        assetId: "71321045679252212594626385532706912750332728571942532289631379312455583992563",
        marketTitle: "Will a diplomatic ceasefire agreement be signed before Q2?",
        category: "geopolitics",
        side: "BUY",
        price: 0.34,
        sizeShares: 25000,
        notionalUsd: 8500,
        timestampMs: BASE_SEED_TS - 86_400_000 * 6,
        outcome: "Yes",
        bookDepthUsd: 92000,
        realizedPnlUsd: 16500
      },
      {
        id: "seed-geo-2",
        assetId: "21742633143463906290569050155826241533067272736897614950488156847949938836455",
        marketTitle: "UN Security Council passes new sanctions package in Q1?",
        category: "geopolitics",
        side: "BUY",
        price: 0.62,
        sizeShares: 20000,
        notionalUsd: 12400,
        timestampMs: BASE_SEED_TS - 86_400_000 * 4,
        outcome: "Yes",
        bookDepthUsd: 110000,
        realizedPnlUsd: 14200
      },
      {
        id: "seed-geo-3",
        assetId: "48331043336612883890938759509493159234755048973500640148014422747788308965732",
        marketTitle: "Will EU & US ratify joint energy security pact before June?",
        category: "geopolitics",
        side: "BUY",
        price: 0.28,
        sizeShares: 30000,
        notionalUsd: 8400,
        timestampMs: BASE_SEED_TS - 86_400_000 * 2,
        outcome: "Yes",
        bookDepthUsd: 85000,
        realizedPnlUsd: 17500
      }
    ]
  },
  {
    address: "0x56687bf447db6ffa42ffe2204a05edaa20f55839",
    displayName: "Capitol Desk",
    tagline: "High-Conviction Politics & Policy",
    primaryCategory: "politics",
    reportedPnlUsd: 36400,
    trades: [
      {
        id: "seed-pol-1",
        assetId: "104173557214744537570424345347209544585775842950109756851652855913015295701992",
        marketTitle: "Senate passes bipartisan digital asset market structure bill?",
        category: "politics",
        side: "BUY",
        price: 0.41,
        sizeShares: 32000,
        notionalUsd: 13120,
        timestampMs: BASE_SEED_TS - 86_400_000 * 5,
        outcome: "Yes",
        bookDepthUsd: 140000,
        realizedPnlUsd: 19400
      },
      {
        id: "seed-pol-2",
        assetId: "65818619657568813474341868652308942079804919287380422192892211131408793125422",
        marketTitle: "Federal budget continuing resolution signed before deadline?",
        category: "politics",
        side: "BUY",
        price: 0.74,
        sizeShares: 28000,
        notionalUsd: 20720,
        timestampMs: BASE_SEED_TS - 86_400_000 * 3,
        outcome: "Yes",
        bookDepthUsd: 185000,
        realizedPnlUsd: 17000
      }
    ]
  },
  {
    address: "0x44c1dfe43260c94ed4f1d00de2e1f80fb113ebc1",
    displayName: "MacroFed Quant",
    tagline: "FOMC / CPI Economics Specialist",
    primaryCategory: "economics",
    reportedPnlUsd: 24900,
    trades: [
      {
        id: "seed-econ-1",
        assetId: "52114319501245915516055106046884209969926127482827954674443846427813813222426",
        marketTitle: "Fed cuts interest rates by 25 bps at next FOMC meeting?",
        category: "economics",
        side: "BUY",
        price: 0.36,
        sizeShares: 24000,
        notionalUsd: 8640,
        timestampMs: BASE_SEED_TS - 86_400_000 * 7,
        outcome: "Yes",
        bookDepthUsd: 210000,
        realizedPnlUsd: 13200
      },
      {
        id: "seed-econ-2",
        assetId: "78991234501245915516055106046884209969926127482827954674443846427813813222901",
        marketTitle: "US Core CPI YoY prints below 2.5% next release?",
        category: "economics",
        side: "BUY",
        price: 0.58,
        sizeShares: 22000,
        notionalUsd: 12760,
        timestampMs: BASE_SEED_TS - 86_400_000 * 2,
        outcome: "Yes",
        bookDepthUsd: 130000,
        realizedPnlUsd: 11700
      }
    ]
  },
  {
    address: "0x16b29c50f2439faf627209b1ac0c7bbddaa8a881",
    displayName: "SharpLines Sports",
    tagline: "3% Fee Sports Closing-Line Whale",
    primaryCategory: "sports",
    reportedPnlUsd: 19800,
    trades: [
      {
        id: "seed-spr-1",
        assetId: "33445566778899001122334455667788990011223344556677889900112233445566778899001",
        marketTitle: "NBA Western Conference Finals Winner — Series Market",
        category: "sports",
        side: "BUY",
        price: 0.44,
        sizeShares: 20000,
        notionalUsd: 8800,
        timestampMs: BASE_SEED_TS - 86_400_000 * 4,
        outcome: "Yes",
        bookDepthUsd: 95000,
        realizedPnlUsd: 10500
      },
      {
        id: "seed-spr-2",
        assetId: "33445566778899001122334455667788990011223344556677889900112233445566778899002",
        marketTitle: "Champions League Semifinal Advance — Home Side",
        category: "sports",
        side: "BUY",
        price: 0.52,
        sizeShares: 18000,
        notionalUsd: 9360,
        timestampMs: BASE_SEED_TS - 86_400_000 * 1,
        outcome: "Yes",
        bookDepthUsd: 78000,
        realizedPnlUsd: 9300
      }
    ]
  },
  {
    address: "0xee00ba338c59557141789b127927a55f5cc5cea1",
    displayName: "5m BTC Taker Trap",
    tagline: "High-Fee 5m/15m Crypto Scalper (Copy-Tax Trap)",
    primaryCategory: "crypto",
    reportedPnlUsd: 2150,
    trades: Array.from({ length: 12 }, (_, idx) => ({
      id: `seed-cry-${idx + 1}`,
      assetId: `99001122334455667788990011223344556677889900112233445566778899001122334455${idx}`,
      marketTitle: idx % 2 === 0 ? "BTC Up or Down — 5m Interval" : "ETH Up or Down — 15m Interval",
      category: "crypto" as PolymarketCategory,
      side: "BUY" as const,
      price: 0.5,
      sizeShares: 12000,
      notionalUsd: 6000,
      timestampMs: BASE_SEED_TS - 60_000 * 3 * (12 - idx),
      outcome: "Up",
      bookDepthUsd: 3500,
      realizedPnlUsd: 179.16,
      isShortTermCrypto: true
    }))
  }
];

export function buildSeedAuditedWhales(): AuditedWhaleRecord[] {
  return CURATED_SEED_WHALES.map((preset) => {
    const report = simulateWhaleCopyability({
      address: preset.address,
      displayName: preset.displayName,
      trades: preset.trades,
      reportedPnlUsd: preset.reportedPnlUsd
    });
    return {
      address: report.address,
      displayName: preset.displayName,
      copyabilityGrade: report.copyabilityGrade,
      copyabilityScore: report.copyabilityScore,
      naivePnlUsd: report.naivePnlUsd,
      netCopierPnlUsd: report.scenarios.slip10.simulatedCopierPnlUsd,
      makerPnlUsd: report.makerSimulatedPnlUsd,
      totalVolumeUsd: report.totalVolumeUsd,
      dragPct: report.scenarios.slip10.dragPctOfVolume,
      primaryCategory: preset.primaryCategory,
      tradeCount: report.tradeCount,
      report,
      auditedAt: report.auditedAt,
      updatedAt: report.auditedAt
    };
  });
}

export function buildSeedLiveAlerts(): LiveWhaleAlertRecord[] {
  const now = Date.now();
  const samples: Array<{
    presetIdx: number;
    tradeIdx: number;
    askDelta: number;
    minsAgo: number;
  }> = [
    { presetIdx: 0, tradeIdx: 0, askDelta: 0.005, minsAgo: 4 },
    { presetIdx: 1, tradeIdx: 1, askDelta: 0.005, minsAgo: 11 },
    { presetIdx: 4, tradeIdx: 0, askDelta: 0.025, minsAgo: 17 },
    { presetIdx: 3, tradeIdx: 0, askDelta: 0.005, minsAgo: 26 },
    { presetIdx: 2, tradeIdx: 1, askDelta: 0.015, minsAgo: 38 }
  ];

  return samples.map((s, idx) => {
    const preset = CURATED_SEED_WHALES[s.presetIdx];
    const t = preset.trades[s.tradeIdx];
    const liveBestAsk = Number(Math.min(0.99, t.price + s.askDelta).toFixed(4));
    const slipCents = Number(((liveBestAsk - t.price) * 100).toFixed(2));
    const fee = calculatePolymarketTakerFee({
      shares: t.sizeShares,
      price: liveBestAsk,
      category: t.category,
      postOnly: false
    });
    const slipPct = liveBestAsk > 0 ? (slipCents / (liveBestAsk * 100)) * 100 : 0;
    const liveCopyTaxPct = Number((fee.effectiveFeePct + slipPct).toFixed(2));
    const verdict =
      slipCents <= 1.2 && liveCopyTaxPct <= 2.75
        ? "COPYABLE"
        : "PASS - SLIPPAGE TOO HIGH";
    return {
      id: `live_seed_${idx + 1}`,
      tradeId: `live_${t.id}`,
      whaleAddress: preset.address.toLowerCase(),
      whaleLabel: preset.displayName,
      assetId: t.assetId,
      marketTitle: t.marketTitle,
      category: t.category,
      side: t.side,
      whalePrice: t.price,
      liveBestAsk,
      notionalUsd: t.notionalUsd,
      slippageCents: slipCents,
      takerFeePct: Number(fee.effectiveFeePct.toFixed(2)),
      liveCopyTaxPct,
      verdict,
      webhooksDelivered: 0,
      createdAt: now - s.minsAgo * 60_000
    };
  });
}

export interface IPolyStore {
  upsertAuditedWhale(record: AuditedWhaleRecord): Promise<void>;
  getAuditedWhale(address: string): Promise<AuditedWhaleRecord | null>;
  listAuditedWhales(options?: {
    category?: string;
    limit?: number;
  }): Promise<AuditedWhaleRecord[]>;
  listWatchedWhales(): Promise<WatchedWhaleRecord[]>;
  upsertWatchedWhale(whale: WatchedWhaleRecord): Promise<void>;
  hasSeenWhaleTrade(tradeId: string): Promise<boolean>;
  markSeenWhaleTrade(entry: {
    tradeId: string;
    whaleAddress: string;
    assetId: string;
    marketTitle: string;
    notionalUsd: number;
    alertPosted: boolean;
  }): Promise<void>;
  saveLiveWhaleAlert(alert: LiveWhaleAlertRecord): Promise<void>;
  listLiveWhaleAlerts(options?: {
    category?: string;
    verdict?: string;
    limit?: number;
  }): Promise<LiveWhaleAlertRecord[]>;
  upsertPolicy(policy: PolymarketPolicyConfig): Promise<PolymarketPolicyConfig>;
  getPolicyByUser(userId: string): Promise<PolymarketPolicyConfig>;
  listActivePoliciesWithWebhooks(): Promise<PolymarketPolicyConfig[]>;
  savePolicyReceipt(receipt: PolicyReceiptRecord): Promise<void>;
  getPolicyReceipt(id: string): Promise<PolicyReceiptRecord | null>;
  listPolicyReceipts(userId?: string, limit?: number): Promise<PolicyReceiptRecord[]>;
  savePaperTrade(trade: PaperTradeRecord): Promise<void>;
  listPaperTrades(userId: string, limit?: number): Promise<PaperTradeRecord[]>;
  upsertPaperPosition(pos: PaperPositionRecord): Promise<void>;
  listPaperPositions(userId: string): Promise<PaperPositionRecord[]>;
  getPaperAccountMetrics(userId: string): Promise<{
    rolling24hSpendUsd: number;
    dailyRealizedAndMtmLossUsd: number;
    totalEquityPnlUsd: number;
    openExposureUsd: number;
  }>;
  upsertUserLead(lead: {
    email: string;
    watchedWhales?: string[];
    walletAddress?: string | null;
    source: string;
    subscribed?: boolean;
  }): Promise<UserLeadRecord>;
  listUserLeads(limit?: number): Promise<UserLeadRecord[]>;
  reset(): void;
}

class MemoryPolyStore implements IPolyStore {
  private auditedWhales = new Map<string, AuditedWhaleRecord>();
  private watchedWhales = new Map<string, WatchedWhaleRecord>();
  private seenTrades = new Set<string>();
  private liveAlerts = new Map<string, LiveWhaleAlertRecord>();
  private policies = new Map<string, PolymarketPolicyConfig>();
  private receipts = new Map<string, PolicyReceiptRecord>();
  private paperTrades: PaperTradeRecord[] = [];
  private paperPositions = new Map<string, PaperPositionRecord>();
  private leads = new Map<string, UserLeadRecord>();

  constructor() {
    this.seed();
  }

  private seed(): void {
    const seeded = buildSeedAuditedWhales();
    for (const w of seeded) {
      this.auditedWhales.set(w.address.toLowerCase(), w);
      this.watchedWhales.set(w.address.toLowerCase(), {
        address: w.address.toLowerCase(),
        label: w.displayName,
        primaryCategory: w.primaryCategory,
        minAlertUsd: 1500,
        active: true,
        lastPolledAt: 0,
        createdAt: Date.now()
      });
    }
    for (const alert of buildSeedLiveAlerts()) {
      this.liveAlerts.set(alert.tradeId, alert);
    }
  }

  reset(): void {
    this.auditedWhales.clear();
    this.watchedWhales.clear();
    this.seenTrades.clear();
    this.liveAlerts.clear();
    this.policies.clear();
    this.receipts.clear();
    this.paperTrades = [];
    this.paperPositions.clear();
    this.leads.clear();
    this.seed();
  }

  async upsertAuditedWhale(record: AuditedWhaleRecord): Promise<void> {
    this.auditedWhales.set(record.address.toLowerCase(), {
      ...record,
      address: record.address.toLowerCase()
    });
  }

  async getAuditedWhale(address: string): Promise<AuditedWhaleRecord | null> {
    return this.auditedWhales.get(address.toLowerCase()) ?? null;
  }

  async listAuditedWhales(options?: { category?: string; limit?: number }): Promise<AuditedWhaleRecord[]> {
    const cat = options?.category?.trim().toLowerCase();
    const limit = Math.min(250, Math.max(1, options?.limit ?? 50));
    return Array.from(this.auditedWhales.values())
      .filter((w) => (!cat || cat === "all" ? true : w.primaryCategory === cat))
      .sort((a, b) => b.netCopierPnlUsd - a.netCopierPnlUsd || b.copyabilityScore - a.copyabilityScore)
      .slice(0, limit);
  }

  async listWatchedWhales(): Promise<WatchedWhaleRecord[]> {
    return Array.from(this.watchedWhales.values()).filter((w) => w.active);
  }

  async upsertWatchedWhale(whale: WatchedWhaleRecord): Promise<void> {
    this.watchedWhales.set(whale.address.toLowerCase(), {
      ...whale,
      address: whale.address.toLowerCase()
    });
  }

  async hasSeenWhaleTrade(tradeId: string): Promise<boolean> {
    return this.seenTrades.has(tradeId);
  }

  async markSeenWhaleTrade(entry: { tradeId: string }): Promise<void> {
    this.seenTrades.add(entry.tradeId);
  }

  async saveLiveWhaleAlert(alert: LiveWhaleAlertRecord): Promise<void> {
    this.liveAlerts.set(alert.tradeId, { ...alert });
  }

  async listLiveWhaleAlerts(options?: {
    category?: string;
    verdict?: string;
    limit?: number;
  }): Promise<LiveWhaleAlertRecord[]> {
    const cat = options?.category?.trim().toLowerCase();
    const verdict = options?.verdict?.trim().toUpperCase();
    const limit = Math.min(100, Math.max(1, options?.limit ?? 40));
    return Array.from(this.liveAlerts.values())
      .filter((a) => (!cat || cat === "all" ? true : a.category === cat))
      .filter((a) => (!verdict || verdict === "ALL" ? true : a.verdict.startsWith(verdict)))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async upsertPolicy(policy: PolymarketPolicyConfig): Promise<PolymarketPolicyConfig> {
    const id = policy.id || `poly_pol_${policy.userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
    const saved: PolymarketPolicyConfig = {
      ...policy,
      id,
      webhookUrl: policy.webhookUrl || null,
      webhookFormat: policy.webhookFormat === "discord" ? "discord" : "json",
      updatedAt: Date.now()
    };
    this.policies.set(policy.userId, saved);
    return saved;
  }

  async getPolicyByUser(userId: string): Promise<PolymarketPolicyConfig> {
    const existing = this.policies.get(userId);
    if (existing) return { ...existing };
    return {
      ...DEFAULT_POLY_POLICY,
      id: `poly_pol_${userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`,
      userId,
      walletAddress: null,
      updatedAt: Date.now()
    };
  }

  async listActivePoliciesWithWebhooks(): Promise<PolymarketPolicyConfig[]> {
    return Array.from(this.policies.values()).filter(
      (p) => p.active && typeof p.webhookUrl === "string" && p.webhookUrl.trim().length > 0
    );
  }

  async savePolicyReceipt(receipt: PolicyReceiptRecord): Promise<void> {
    this.receipts.set(receipt.id, { ...receipt });
  }

  async getPolicyReceipt(id: string): Promise<PolicyReceiptRecord | null> {
    return this.receipts.get(id) ?? null;
  }

  async listPolicyReceipts(userId?: string, limit = 30): Promise<PolicyReceiptRecord[]> {
    return Array.from(this.receipts.values())
      .filter((r) => (!userId ? true : r.userId === userId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async savePaperTrade(trade: PaperTradeRecord): Promise<void> {
    this.paperTrades.push({ ...trade });
  }

  async listPaperTrades(userId: string, limit = 50): Promise<PaperTradeRecord[]> {
    return this.paperTrades
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async upsertPaperPosition(pos: PaperPositionRecord): Promise<void> {
    this.paperPositions.set(`${pos.userId}:${pos.assetId}`, { ...pos });
  }

  async listPaperPositions(userId: string): Promise<PaperPositionRecord[]> {
    return Array.from(this.paperPositions.values())
      .filter((p) => p.userId === userId && p.shares > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getPaperAccountMetrics(userId: string) {
    const cutoff = Date.now() - 86_400_000;
    const recentFilled = this.paperTrades.filter(
      (t) => t.userId === userId && t.status === "FILLED" && t.createdAt >= cutoff
    );
    const rolling24hSpendUsd = recentFilled.reduce((sum, t) => sum + t.notionalUsd, 0);
    const recentFees = recentFilled.reduce((sum, t) => sum + t.feeUsd, 0);
    const positions = await this.listPaperPositions(userId);
    const openExposureUsd = positions.reduce((sum, p) => sum + p.costBasisUsd, 0);
    const totalUnrealized = positions.reduce((sum, p) => sum + p.unrealizedPnlUsd, 0);
    const totalRealized = positions.reduce((sum, p) => sum + p.realizedPnlUsd, 0);
    const totalEquityPnlUsd = totalUnrealized + totalRealized - recentFees;
    const dailyRealizedAndMtmLossUsd = totalEquityPnlUsd < 0 ? Math.abs(totalEquityPnlUsd) : 0;

    return {
      rolling24hSpendUsd: Number(rolling24hSpendUsd.toFixed(2)),
      dailyRealizedAndMtmLossUsd: Number(dailyRealizedAndMtmLossUsd.toFixed(2)),
      totalEquityPnlUsd: Number(totalEquityPnlUsd.toFixed(2)),
      openExposureUsd: Number(openExposureUsd.toFixed(2))
    };
  }

  async upsertUserLead(lead: {
    email: string;
    watchedWhales?: string[];
    walletAddress?: string | null;
    source: string;
    subscribed?: boolean;
  }): Promise<UserLeadRecord> {
    const normalizedEmail = lead.email.trim().toLowerCase();
    const existing = this.leads.get(normalizedEmail);
    const now = Date.now();
    const incomingWhales = (lead.watchedWhales || [])
      .map((a) => a.trim().toLowerCase())
      .filter((a) => /^0x[a-f0-9]{40}$/.test(a));
    const mergedWhales = Array.from(new Set([...(existing?.watchedWhales || []), ...incomingWhales]));
    const record: UserLeadRecord = {
      id: existing?.id || `lead_${now}_${Math.random().toString(36).slice(2, 7)}`,
      email: normalizedEmail,
      watchedWhales: mergedWhales,
      walletAddress: lead.walletAddress ?? existing?.walletAddress ?? null,
      source: lead.source || existing?.source || "whale_page",
      subscribed: lead.subscribed !== undefined ? lead.subscribed : true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.leads.set(normalizedEmail, record);
    return record;
  }

  async listUserLeads(limit = 50): Promise<UserLeadRecord[]> {
    return Array.from(this.leads.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }
}

class D1PolyStore implements IPolyStore {
  private tablesEnsured = false;

  constructor(private db: D1Database) {}

  private async ensureTables(): Promise<void> {
    if (this.tablesEnsured) return;
    this.tablesEnsured = true;
    const stmts = [
      `CREATE TABLE IF NOT EXISTS audited_whales (
        address TEXT PRIMARY KEY, display_name TEXT, copyability_grade TEXT NOT NULL,
        copyability_score INTEGER NOT NULL, naive_pnl_usd REAL NOT NULL DEFAULT 0,
        net_copier_pnl_usd REAL NOT NULL DEFAULT 0, maker_pnl_usd REAL NOT NULL DEFAULT 0,
        total_volume_usd REAL NOT NULL DEFAULT 0, drag_pct REAL NOT NULL DEFAULT 0,
        primary_category TEXT NOT NULL DEFAULT 'other', trade_count INTEGER NOT NULL DEFAULT 0,
        report_json TEXT NOT NULL, audited_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS watched_whales (
        address TEXT PRIMARY KEY, label TEXT NOT NULL, primary_category TEXT NOT NULL DEFAULT 'other',
        min_alert_usd REAL NOT NULL DEFAULT 1500, active INTEGER NOT NULL DEFAULT 1,
        last_polled_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS seen_whale_trades (
        trade_id TEXT PRIMARY KEY, whale_address TEXT NOT NULL, asset_id TEXT NOT NULL,
        market_title TEXT, notional_usd REAL NOT NULL DEFAULT 0,
        alert_posted INTEGER NOT NULL DEFAULT 0, seen_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS live_whale_alerts (
        id TEXT PRIMARY KEY, trade_id TEXT UNIQUE NOT NULL, whale_address TEXT NOT NULL,
        whale_label TEXT NOT NULL, asset_id TEXT NOT NULL, market_title TEXT NOT NULL,
        category TEXT NOT NULL, side TEXT NOT NULL, whale_price REAL NOT NULL,
        live_best_ask REAL NOT NULL, notional_usd REAL NOT NULL,
        slippage_cents REAL NOT NULL DEFAULT 0, taker_fee_pct REAL NOT NULL DEFAULT 0,
        live_copy_tax_pct REAL NOT NULL DEFAULT 0, verdict TEXT NOT NULL,
        webhooks_delivered INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS poly_policies (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, wallet_address TEXT,
        mode TEXT NOT NULL DEFAULT 'paper', max_trade_usd REAL NOT NULL DEFAULT 100,
        max_daily_spend_usd REAL NOT NULL DEFAULT 500, max_daily_loss_usd REAL NOT NULL DEFAULT 75,
        max_slippage_cents REAL NOT NULL DEFAULT 1.0, max_fee_drag_pct REAL NOT NULL DEFAULT 2.5,
        maker_only_mode INTEGER NOT NULL DEFAULT 0,
        allowed_categories_json TEXT NOT NULL DEFAULT '["geopolitics","politics","economics","finance","sports","tech"]',
        blocked_categories_json TEXT NOT NULL DEFAULT '["crypto"]',
        webhook_url TEXT, webhook_format TEXT NOT NULL DEFAULT 'json',
        active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS paper_trades (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, policy_id TEXT, receipt_id TEXT NOT NULL,
        whale_address TEXT, asset_id TEXT NOT NULL, market_title TEXT NOT NULL,
        category TEXT NOT NULL, side TEXT NOT NULL, post_only INTEGER NOT NULL DEFAULT 0,
        trigger_price REAL NOT NULL, fill_price REAL NOT NULL, shares REAL NOT NULL,
        notional_usd REAL NOT NULL, fee_usd REAL NOT NULL DEFAULT 0,
        slippage_cents REAL NOT NULL DEFAULT 0, status TEXT NOT NULL,
        rejection_reason TEXT, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS paper_positions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, asset_id TEXT NOT NULL,
        market_title TEXT NOT NULL, category TEXT NOT NULL, side TEXT NOT NULL,
        shares REAL NOT NULL DEFAULT 0, avg_entry_price REAL NOT NULL DEFAULT 0,
        cost_basis_usd REAL NOT NULL DEFAULT 0, mark_price REAL NOT NULL DEFAULT 0,
        unrealized_pnl_usd REAL NOT NULL DEFAULT 0, realized_pnl_usd REAL NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS policy_receipts (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, policy_id TEXT,
        mode TEXT NOT NULL DEFAULT 'paper', wallet_address TEXT, whale_address TEXT,
        asset_id TEXT NOT NULL, market_title TEXT NOT NULL, category TEXT NOT NULL,
        side TEXT NOT NULL, order_size_usd REAL NOT NULL, trigger_price REAL NOT NULL,
        live_book_ask REAL NOT NULL, execution_price REAL NOT NULL,
        computed_fee_usd REAL NOT NULL DEFAULT 0, computed_fee_drag_pct REAL NOT NULL DEFAULT 0,
        slippage_cents REAL NOT NULL DEFAULT 0, verdict TEXT NOT NULL,
        rejection_code TEXT, rules_evaluated_json TEXT NOT NULL,
        policy_snapshot_json TEXT NOT NULL, clob_order_id TEXT, polygon_tx_hash TEXT,
        builder_code TEXT, cosigner_address TEXT, cosigner_signature TEXT, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS user_leads (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
        watched_whales_json TEXT NOT NULL DEFAULT '[]', wallet_address TEXT,
        source TEXT NOT NULL DEFAULT 'whale_page', subscribed INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`
    ];
    for (const sql of stmts) {
      try {
        await this.db.prepare(sql).run();
      } catch {}
    }
  }

  reset(): void {}

  async upsertAuditedWhale(record: AuditedWhaleRecord): Promise<void> {
    await this.ensureTables();
    await this.db
      .prepare(
        `INSERT INTO audited_whales (
          address, display_name, copyability_grade, copyability_score, naive_pnl_usd,
          net_copier_pnl_usd, maker_pnl_usd, total_volume_usd, drag_pct, primary_category,
          trade_count, report_json, audited_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(address) DO UPDATE SET
          display_name = excluded.display_name,
          copyability_grade = excluded.copyability_grade,
          copyability_score = excluded.copyability_score,
          naive_pnl_usd = excluded.naive_pnl_usd,
          net_copier_pnl_usd = excluded.net_copier_pnl_usd,
          maker_pnl_usd = excluded.maker_pnl_usd,
          total_volume_usd = excluded.total_volume_usd,
          drag_pct = excluded.drag_pct,
          primary_category = excluded.primary_category,
          trade_count = excluded.trade_count,
          report_json = excluded.report_json,
          audited_at = excluded.audited_at,
          updated_at = excluded.updated_at`
      )
      .bind(
        record.address.toLowerCase(),
        record.displayName,
        record.copyabilityGrade,
        record.copyabilityScore,
        record.naivePnlUsd,
        record.netCopierPnlUsd,
        record.makerPnlUsd,
        record.totalVolumeUsd,
        record.dragPct,
        record.primaryCategory,
        record.tradeCount,
        JSON.stringify(record.report),
        record.auditedAt,
        record.updatedAt
      )
      .run();
  }

  private mapAuditedRow(row: any): AuditedWhaleRecord {
    return {
      address: row.address,
      displayName: row.display_name || `${String(row.address).slice(0, 6)}...${String(row.address).slice(-4)}`,
      copyabilityGrade: row.copyability_grade as CopyabilityGrade,
      copyabilityScore: Number(row.copyability_score || 0),
      naivePnlUsd: Number(row.naive_pnl_usd || 0),
      netCopierPnlUsd: Number(row.net_copier_pnl_usd || 0),
      makerPnlUsd: Number(row.maker_pnl_usd || 0),
      totalVolumeUsd: Number(row.total_volume_usd || 0),
      dragPct: Number(row.drag_pct || 0),
      primaryCategory: (row.primary_category || "other") as PolymarketCategory,
      tradeCount: Number(row.trade_count || 0),
      report: JSON.parse(row.report_json),
      auditedAt: Number(row.audited_at || 0),
      updatedAt: Number(row.updated_at || 0)
    };
  }

  async getAuditedWhale(address: string): Promise<AuditedWhaleRecord | null> {
    await this.ensureTables();
    const row = await this.db
      .prepare("SELECT * FROM audited_whales WHERE address = ? LIMIT 1")
      .bind(address.toLowerCase())
      .first<any>();
    return row ? this.mapAuditedRow(row) : null;
  }

  async listAuditedWhales(options?: { category?: string; limit?: number }): Promise<AuditedWhaleRecord[]> {
    await this.ensureTables();
    const cat = options?.category?.trim().toLowerCase();
    const limit = Math.min(250, Math.max(1, options?.limit ?? 50));
    const res =
      cat && cat !== "all"
        ? await this.db
            .prepare(
              "SELECT * FROM audited_whales WHERE primary_category = ? ORDER BY net_copier_pnl_usd DESC, copyability_score DESC LIMIT ?"
            )
            .bind(cat, limit)
            .all<any>()
        : await this.db
            .prepare(
              "SELECT * FROM audited_whales ORDER BY net_copier_pnl_usd DESC, copyability_score DESC LIMIT ?"
            )
            .bind(limit)
            .all<any>();

    const rows = (res.results || []).map((r: any) => this.mapAuditedRow(r));
    if (rows.length === 0) {
      const seeds = buildSeedAuditedWhales();
      for (const s of seeds) {
        await this.upsertAuditedWhale(s);
      }
      return seeds.filter((s) => (!cat || cat === "all" ? true : s.primaryCategory === cat)).slice(0, limit);
    }
    return rows;
  }

  async listWatchedWhales(): Promise<WatchedWhaleRecord[]> {
    await this.ensureTables();
    const res = await this.db
      .prepare("SELECT * FROM watched_whales WHERE active = 1 ORDER BY last_polled_at ASC LIMIT 50")
      .all<any>();
    const rows = (res.results || []).map((r: any) => ({
      address: r.address,
      label: r.label,
      primaryCategory: r.primary_category as PolymarketCategory,
      minAlertUsd: Number(r.min_alert_usd || 1500),
      active: Boolean(r.active),
      lastPolledAt: Number(r.last_polled_at || 0),
      createdAt: Number(r.created_at || 0)
    }));
    if (rows.length === 0) {
      const seeds = buildSeedAuditedWhales();
      const created: WatchedWhaleRecord[] = [];
      for (const s of seeds) {
        const w: WatchedWhaleRecord = {
          address: s.address,
          label: s.displayName,
          primaryCategory: s.primaryCategory,
          minAlertUsd: 1500,
          active: true,
          lastPolledAt: 0,
          createdAt: Date.now()
        };
        await this.upsertWatchedWhale(w);
        created.push(w);
      }
      return created;
    }
    return rows;
  }

  async upsertWatchedWhale(whale: WatchedWhaleRecord): Promise<void> {
    await this.ensureTables();
    await this.db
      .prepare(
        `INSERT INTO watched_whales (address, label, primary_category, min_alert_usd, active, last_polled_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
           label = excluded.label,
           primary_category = excluded.primary_category,
           min_alert_usd = excluded.min_alert_usd,
           active = excluded.active,
           last_polled_at = excluded.last_polled_at`
      )
      .bind(
        whale.address.toLowerCase(),
        whale.label,
        whale.primaryCategory,
        whale.minAlertUsd,
        whale.active ? 1 : 0,
        whale.lastPolledAt,
        whale.createdAt
      )
      .run();
  }

  async hasSeenWhaleTrade(tradeId: string): Promise<boolean> {
    await this.ensureTables();
    const row = await this.db
      .prepare("SELECT trade_id FROM seen_whale_trades WHERE trade_id = ? LIMIT 1")
      .bind(tradeId)
      .first<any>();
    return Boolean(row);
  }

  async markSeenWhaleTrade(entry: {
    tradeId: string;
    whaleAddress: string;
    assetId: string;
    marketTitle: string;
    notionalUsd: number;
    alertPosted: boolean;
  }): Promise<void> {
    await this.ensureTables();
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO seen_whale_trades (trade_id, whale_address, asset_id, market_title, notional_usd, alert_posted, seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        entry.tradeId,
        entry.whaleAddress.toLowerCase(),
        entry.assetId,
        entry.marketTitle,
        entry.notionalUsd,
        entry.alertPosted ? 1 : 0,
        Date.now()
      )
      .run();
  }

  async saveLiveWhaleAlert(alert: LiveWhaleAlertRecord): Promise<void> {
    await this.ensureTables();
    await this.db
      .prepare(
        `INSERT INTO live_whale_alerts (
          id, trade_id, whale_address, whale_label, asset_id, market_title, category, side,
          whale_price, live_best_ask, notional_usd, slippage_cents, taker_fee_pct,
          live_copy_tax_pct, verdict, webhooks_delivered, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(trade_id) DO UPDATE SET
          live_best_ask = excluded.live_best_ask,
          slippage_cents = excluded.slippage_cents,
          live_copy_tax_pct = excluded.live_copy_tax_pct,
          verdict = excluded.verdict,
          webhooks_delivered = excluded.webhooks_delivered`
      )
      .bind(
        alert.id,
        alert.tradeId,
        alert.whaleAddress.toLowerCase(),
        alert.whaleLabel,
        alert.assetId,
        alert.marketTitle,
        alert.category,
        alert.side,
        alert.whalePrice,
        alert.liveBestAsk,
        alert.notionalUsd,
        alert.slippageCents,
        alert.takerFeePct,
        alert.liveCopyTaxPct,
        alert.verdict,
        alert.webhooksDelivered,
        alert.createdAt
      )
      .run();
  }

  private mapLiveAlertRow(row: any): LiveWhaleAlertRecord {
    return {
      id: row.id,
      tradeId: row.trade_id,
      whaleAddress: row.whale_address,
      whaleLabel: row.whale_label,
      assetId: row.asset_id,
      marketTitle: row.market_title,
      category: row.category as PolymarketCategory,
      side: row.side === "SELL" ? "SELL" : "BUY",
      whalePrice: Number(row.whale_price || 0),
      liveBestAsk: Number(row.live_best_ask || 0),
      notionalUsd: Number(row.notional_usd || 0),
      slippageCents: Number(row.slippage_cents || 0),
      takerFeePct: Number(row.taker_fee_pct || 0),
      liveCopyTaxPct: Number(row.live_copy_tax_pct || 0),
      verdict: row.verdict === "COPYABLE" ? "COPYABLE" : "PASS - SLIPPAGE TOO HIGH",
      webhooksDelivered: Number(row.webhooks_delivered || 0),
      createdAt: Number(row.created_at || 0)
    };
  }

  async listLiveWhaleAlerts(options?: {
    category?: string;
    verdict?: string;
    limit?: number;
  }): Promise<LiveWhaleAlertRecord[]> {
    await this.ensureTables();
    const cat = options?.category?.trim().toLowerCase();
    const verdict = options?.verdict?.trim().toUpperCase();
    const limit = Math.min(100, Math.max(1, options?.limit ?? 40));

    const res =
      cat && cat !== "all"
        ? await this.db
            .prepare(
              "SELECT * FROM live_whale_alerts WHERE category = ? ORDER BY created_at DESC LIMIT ?"
            )
            .bind(cat, limit)
            .all<any>()
        : await this.db
            .prepare("SELECT * FROM live_whale_alerts ORDER BY created_at DESC LIMIT ?")
            .bind(limit)
            .all<any>();

    let rows = (res.results || []).map((r: any) => this.mapLiveAlertRow(r));
    if (rows.length === 0 && (!cat || cat === "all")) {
      const seeds = buildSeedLiveAlerts();
      for (const s of seeds) {
        await this.saveLiveWhaleAlert(s);
      }
      rows = seeds;
    }
    return rows
      .filter((a) => (!verdict || verdict === "ALL" ? true : a.verdict.startsWith(verdict)))
      .slice(0, limit);
  }

  private mapPolicyRow(row: any): PolymarketPolicyConfig {
    return {
      id: row.id,
      userId: row.user_id,
      walletAddress: row.wallet_address || null,
      mode: row.mode === "live" ? "live" : "paper",
      maxTradeUsd: Number(row.max_trade_usd),
      maxDailySpendUsd: Number(row.max_daily_spend_usd),
      maxDailyLossUsd: Number(row.max_daily_loss_usd),
      maxSlippageCents: Number(row.max_slippage_cents),
      maxFeeDragPct: Number(row.max_fee_drag_pct),
      makerOnlyMode: Boolean(row.maker_only_mode),
      allowedCategories: JSON.parse(row.allowed_categories_json || "[]"),
      blockedCategories: JSON.parse(row.blocked_categories_json || "[]"),
      webhookUrl: row.webhook_url || null,
      webhookFormat: (row.webhook_format === "discord" ? "discord" : "json") as PolyWebhookFormat,
      active: Boolean(row.active),
      updatedAt: Number(row.updated_at || 0)
    };
  }

  async upsertPolicy(policy: PolymarketPolicyConfig): Promise<PolymarketPolicyConfig> {
    await this.ensureTables();
    const now = Date.now();
    const id = policy.id || `poly_pol_${policy.userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
    const webhookFormat: PolyWebhookFormat = policy.webhookFormat === "discord" ? "discord" : "json";
    await this.db
      .prepare(
        `INSERT INTO poly_policies (
          id, user_id, wallet_address, mode, max_trade_usd, max_daily_spend_usd,
          max_daily_loss_usd, max_slippage_cents, max_fee_drag_pct, maker_only_mode,
          allowed_categories_json, blocked_categories_json, webhook_url, webhook_format,
          active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          wallet_address = excluded.wallet_address,
          mode = excluded.mode,
          max_trade_usd = excluded.max_trade_usd,
          max_daily_spend_usd = excluded.max_daily_spend_usd,
          max_daily_loss_usd = excluded.max_daily_loss_usd,
          max_slippage_cents = excluded.max_slippage_cents,
          max_fee_drag_pct = excluded.max_fee_drag_pct,
          maker_only_mode = excluded.maker_only_mode,
          allowed_categories_json = excluded.allowed_categories_json,
          blocked_categories_json = excluded.blocked_categories_json,
          webhook_url = excluded.webhook_url,
          webhook_format = excluded.webhook_format,
          active = excluded.active,
          updated_at = excluded.updated_at`
      )
      .bind(
        id,
        policy.userId,
        policy.walletAddress || null,
        policy.mode,
        policy.maxTradeUsd,
        policy.maxDailySpendUsd,
        policy.maxDailyLossUsd,
        policy.maxSlippageCents,
        policy.maxFeeDragPct,
        policy.makerOnlyMode ? 1 : 0,
        JSON.stringify(policy.allowedCategories || []),
        JSON.stringify(policy.blockedCategories || []),
        policy.webhookUrl || null,
        webhookFormat,
        policy.active ? 1 : 0,
        now,
        now
      )
      .run();
    return { ...policy, id, webhookUrl: policy.webhookUrl || null, webhookFormat, updatedAt: now };
  }

  async getPolicyByUser(userId: string): Promise<PolymarketPolicyConfig> {
    await this.ensureTables();
    const row = await this.db
      .prepare("SELECT * FROM poly_policies WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1")
      .bind(userId)
      .first<any>();
    if (!row) {
      return {
        ...DEFAULT_POLY_POLICY,
        id: `poly_pol_${userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`,
        userId,
        walletAddress: null,
        updatedAt: Date.now()
      };
    }
    return this.mapPolicyRow(row);
  }

  async listActivePoliciesWithWebhooks(): Promise<PolymarketPolicyConfig[]> {
    await this.ensureTables();
    const res = await this.db
      .prepare(
        "SELECT * FROM poly_policies WHERE active = 1 AND webhook_url IS NOT NULL AND length(trim(webhook_url)) > 0 LIMIT 100"
      )
      .all<any>();
    return (res.results || []).map((r: any) => this.mapPolicyRow(r));
  }

  async savePolicyReceipt(receipt: PolicyReceiptRecord): Promise<void> {
    await this.ensureTables();
    await this.db
      .prepare(
        `INSERT INTO policy_receipts (
          id, user_id, policy_id, mode, wallet_address, whale_address, asset_id, market_title,
          category, side, order_size_usd, trigger_price, live_book_ask, execution_price,
          computed_fee_usd, computed_fee_drag_pct, slippage_cents, verdict, rejection_code,
          rules_evaluated_json, policy_snapshot_json, clob_order_id, polygon_tx_hash,
          builder_code, cosigner_address, cosigner_signature, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        receipt.id,
        receipt.userId,
        receipt.policyId,
        receipt.mode,
        receipt.walletAddress,
        receipt.whaleAddress,
        receipt.assetId,
        receipt.marketTitle,
        receipt.category,
        receipt.side,
        receipt.orderSizeUsd,
        receipt.triggerPrice,
        receipt.liveBookAsk,
        receipt.executionPrice,
        receipt.computedFeeUsd,
        receipt.computedFeeDragPct,
        receipt.slippageCents,
        receipt.verdict,
        receipt.rejectionCode,
        JSON.stringify(receipt.rulesEvaluated),
        JSON.stringify(receipt.policySnapshot),
        receipt.clobOrderId,
        receipt.polygonTxHash,
        receipt.builderCode,
        receipt.cosignerAddress,
        receipt.cosignerSignature,
        receipt.createdAt
      )
      .run();
  }

  private mapReceiptRow(row: any): PolicyReceiptRecord {
    return {
      id: row.id,
      userId: row.user_id,
      policyId: row.policy_id || null,
      mode: row.mode === "live" ? "live" : "paper",
      walletAddress: row.wallet_address || null,
      whaleAddress: row.whale_address || null,
      assetId: row.asset_id,
      marketTitle: row.market_title,
      category: row.category as PolymarketCategory,
      side: row.side === "SELL" ? "SELL" : "BUY",
      orderSizeUsd: Number(row.order_size_usd || 0),
      triggerPrice: Number(row.trigger_price || 0),
      liveBookAsk: Number(row.live_book_ask || 0),
      executionPrice: Number(row.execution_price || 0),
      computedFeeUsd: Number(row.computed_fee_usd || 0),
      computedFeeDragPct: Number(row.computed_fee_drag_pct || 0),
      slippageCents: Number(row.slippage_cents || 0),
      verdict: row.verdict === "ALLOWED" ? "ALLOWED" : "BLOCKED",
      rejectionCode: row.rejection_code || null,
      rulesEvaluated: JSON.parse(row.rules_evaluated_json || "[]"),
      policySnapshot: JSON.parse(row.policy_snapshot_json || "{}"),
      clobOrderId: row.clob_order_id || null,
      polygonTxHash: row.polygon_tx_hash || null,
      builderCode: row.builder_code || null,
      cosignerAddress: row.cosigner_address || null,
      cosignerSignature: row.cosigner_signature || null,
      createdAt: Number(row.created_at || 0)
    };
  }

  async getPolicyReceipt(id: string): Promise<PolicyReceiptRecord | null> {
    await this.ensureTables();
    const row = await this.db
      .prepare("SELECT * FROM policy_receipts WHERE id = ? LIMIT 1")
      .bind(id)
      .first<any>();
    return row ? this.mapReceiptRow(row) : null;
  }

  async listPolicyReceipts(userId?: string, limit = 30): Promise<PolicyReceiptRecord[]> {
    await this.ensureTables();
    const res = userId
      ? await this.db
          .prepare("SELECT * FROM policy_receipts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
          .bind(userId, limit)
          .all<any>()
      : await this.db
          .prepare("SELECT * FROM policy_receipts ORDER BY created_at DESC LIMIT ?")
          .bind(limit)
          .all<any>();
    return (res.results || []).map((r: any) => this.mapReceiptRow(r));
  }

  async savePaperTrade(trade: PaperTradeRecord): Promise<void> {
    await this.ensureTables();
    await this.db
      .prepare(
        `INSERT INTO paper_trades (
          id, user_id, policy_id, receipt_id, whale_address, asset_id, market_title,
          category, side, post_only, trigger_price, fill_price, shares, notional_usd,
          fee_usd, slippage_cents, status, rejection_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        trade.id,
        trade.userId,
        trade.policyId,
        trade.receiptId,
        trade.whaleAddress,
        trade.assetId,
        trade.marketTitle,
        trade.category,
        trade.side,
        trade.postOnly ? 1 : 0,
        trade.triggerPrice,
        trade.fillPrice,
        trade.shares,
        trade.notionalUsd,
        trade.feeUsd,
        trade.slippageCents,
        trade.status,
        trade.rejectionReason,
        trade.createdAt
      )
      .run();
  }

  async listPaperTrades(userId: string, limit = 50): Promise<PaperTradeRecord[]> {
    await this.ensureTables();
    const res = await this.db
      .prepare("SELECT * FROM paper_trades WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
      .bind(userId, limit)
      .all<any>();
    return (res.results || []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      policyId: r.policy_id || null,
      receiptId: r.receipt_id,
      whaleAddress: r.whale_address || null,
      assetId: r.asset_id,
      marketTitle: r.market_title,
      category: r.category as PolymarketCategory,
      side: r.side === "SELL" ? "SELL" : "BUY",
      postOnly: Boolean(r.post_only),
      triggerPrice: Number(r.trigger_price || 0),
      fillPrice: Number(r.fill_price || 0),
      shares: Number(r.shares || 0),
      notionalUsd: Number(r.notional_usd || 0),
      feeUsd: Number(r.fee_usd || 0),
      slippageCents: Number(r.slippage_cents || 0),
      status: r.status === "FILLED" ? "FILLED" : "BLOCKED",
      rejectionReason: r.rejection_reason || null,
      createdAt: Number(r.created_at || 0)
    }));
  }

  async upsertPaperPosition(pos: PaperPositionRecord): Promise<void> {
    await this.ensureTables();
    await this.db
      .prepare(
        `INSERT INTO paper_positions (
          id, user_id, asset_id, market_title, category, side, shares,
          avg_entry_price, cost_basis_usd, mark_price, unrealized_pnl_usd, realized_pnl_usd, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          shares = excluded.shares,
          avg_entry_price = excluded.avg_entry_price,
          cost_basis_usd = excluded.cost_basis_usd,
          mark_price = excluded.mark_price,
          unrealized_pnl_usd = excluded.unrealized_pnl_usd,
          realized_pnl_usd = excluded.realized_pnl_usd,
          updated_at = excluded.updated_at`
      )
      .bind(
        pos.id,
        pos.userId,
        pos.assetId,
        pos.marketTitle,
        pos.category,
        pos.side,
        pos.shares,
        pos.avgEntryPrice,
        pos.costBasisUsd,
        pos.markPrice,
        pos.unrealizedPnlUsd,
        pos.realizedPnlUsd,
        pos.updatedAt
      )
      .run();
  }

  async listPaperPositions(userId: string): Promise<PaperPositionRecord[]> {
    await this.ensureTables();
    const res = await this.db
      .prepare("SELECT * FROM paper_positions WHERE user_id = ? AND shares > 0 ORDER BY updated_at DESC LIMIT 100")
      .bind(userId)
      .all<any>();
    return (res.results || []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      assetId: r.asset_id,
      marketTitle: r.market_title,
      category: r.category as PolymarketCategory,
      side: r.side === "SELL" ? "SELL" : "BUY",
      shares: Number(r.shares || 0),
      avgEntryPrice: Number(r.avg_entry_price || 0),
      costBasisUsd: Number(r.cost_basis_usd || 0),
      markPrice: Number(r.mark_price || 0),
      unrealizedPnlUsd: Number(r.unrealized_pnl_usd || 0),
      realizedPnlUsd: Number(r.realized_pnl_usd || 0),
      updatedAt: Number(r.updated_at || 0)
    }));
  }

  async getPaperAccountMetrics(userId: string) {
    await this.ensureTables();
    const cutoff = Date.now() - 86_400_000;
    const spendRow = await this.db
      .prepare(
        "SELECT COALESCE(SUM(notional_usd), 0) AS spend, COALESCE(SUM(fee_usd), 0) AS fees FROM paper_trades WHERE user_id = ? AND status = 'FILLED' AND created_at >= ?"
      )
      .bind(userId, cutoff)
      .first<any>();
    const posRow = await this.db
      .prepare(
        "SELECT COALESCE(SUM(cost_basis_usd), 0) AS exposure, COALESCE(SUM(unrealized_pnl_usd), 0) AS unreal, COALESCE(SUM(realized_pnl_usd), 0) AS real FROM paper_positions WHERE user_id = ?"
      )
      .bind(userId)
      .first<any>();

    const rolling24hSpendUsd = Number(spendRow?.spend || 0);
    const recentFees = Number(spendRow?.fees || 0);
    const openExposureUsd = Number(posRow?.exposure || 0);
    const totalEquityPnlUsd = Number(posRow?.unreal || 0) + Number(posRow?.real || 0) - recentFees;
    const dailyRealizedAndMtmLossUsd = totalEquityPnlUsd < 0 ? Math.abs(totalEquityPnlUsd) : 0;

    return {
      rolling24hSpendUsd: Number(rolling24hSpendUsd.toFixed(2)),
      dailyRealizedAndMtmLossUsd: Number(dailyRealizedAndMtmLossUsd.toFixed(2)),
      totalEquityPnlUsd: Number(totalEquityPnlUsd.toFixed(2)),
      openExposureUsd: Number(openExposureUsd.toFixed(2))
    };
  }

  async upsertUserLead(lead: {
    email: string;
    watchedWhales?: string[];
    walletAddress?: string | null;
    source: string;
    subscribed?: boolean;
  }): Promise<UserLeadRecord> {
    await this.ensureTables();
    const normalizedEmail = lead.email.trim().toLowerCase();
    const existingRow = await this.db
      .prepare("SELECT * FROM user_leads WHERE email = ? LIMIT 1")
      .bind(normalizedEmail)
      .first<any>();
    const existingWhales: string[] = existingRow
      ? JSON.parse(existingRow.watched_whales_json || "[]")
      : [];
    const incomingWhales = (lead.watchedWhales || [])
      .map((a) => a.trim().toLowerCase())
      .filter((a) => /^0x[a-f0-9]{40}$/.test(a));
    const mergedWhales = Array.from(new Set([...existingWhales, ...incomingWhales]));
    const now = Date.now();
    const id = existingRow?.id || `lead_${now}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db
      .prepare(
        `INSERT INTO user_leads (id, email, watched_whales_json, wallet_address, source, subscribed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           watched_whales_json = excluded.watched_whales_json,
           wallet_address = COALESCE(excluded.wallet_address, user_leads.wallet_address),
           subscribed = excluded.subscribed,
           updated_at = excluded.updated_at`
      )
      .bind(
        id,
        normalizedEmail,
        JSON.stringify(mergedWhales),
        lead.walletAddress ?? existingRow?.wallet_address ?? null,
        lead.source || existingRow?.source || "whale_page",
        lead.subscribed !== false ? 1 : 0,
        existingRow ? Number(existingRow.created_at) : now,
        now
      )
      .run();

    return {
      id,
      email: normalizedEmail,
      watchedWhales: mergedWhales,
      walletAddress: lead.walletAddress ?? existingRow?.wallet_address ?? null,
      source: lead.source || existingRow?.source || "whale_page",
      subscribed: lead.subscribed !== false,
      createdAt: existingRow ? Number(existingRow.created_at) : now,
      updatedAt: now
    };
  }

  async listUserLeads(limit = 50): Promise<UserLeadRecord[]> {
    await this.ensureTables();
    const res = await this.db
      .prepare("SELECT * FROM user_leads ORDER BY updated_at DESC LIMIT ?")
      .bind(limit)
      .all<any>();
    return (res.results || []).map((r: any) => ({
      id: r.id,
      email: r.email,
      watchedWhales: JSON.parse(r.watched_whales_json || "[]"),
      walletAddress: r.wallet_address || null,
      source: r.source,
      subscribed: Boolean(r.subscribed),
      createdAt: Number(r.created_at || 0),
      updatedAt: Number(r.updated_at || 0)
    }));
  }
}

const globalMemoryPolyStore = new MemoryPolyStore();

export function getPolyStore(bindings?: Env["Bindings"]): IPolyStore {
  if (bindings?.DB) {
    return new D1PolyStore(bindings.DB);
  }
  return globalMemoryPolyStore;
}

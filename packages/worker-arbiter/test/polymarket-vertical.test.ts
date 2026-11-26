import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_POLY_POLICY,
  POLYMARKET_2026_FEE_RATES,
  POLYMARKET_CHAIN_ID,
  POLYMARKET_COLLATERAL,
  buildClobV2OrderStruct,
  calculateCopyTaxComparison,
  calculatePolymarketTakerFee,
  calculateWeightedVolume,
  evaluatePolymarketPolicy,
  floorToTickSize,
  getRetailTakerRebateRate,
  normalizeBuilderCodeBytes32,
  resolvePolymarketAssetIds,
  simulateWhaleCopyability,
  type PolymarketCategory,
  type PolymarketPolicyConfig,
  type WhaleTradeSample
} from "@nullclear/shared";
import app from "../src/index.js";
import { getPolyStore } from "../src/services/poly-store.js";
import {
  buildLiveWhaleAlertRecord,
  formatByoWebhookPayload
} from "../src/services/poly-alerts.js";
import { parseClobBookLevels } from "../src/services/poly-api.js";

describe("NullClear Polymarket Vertical — 2026 Fee Math, Tick Flooring, Copy-Tax & Policy Engine", () => {
  const testEnv = {
    ENVIRONMENT: "development",
    ARBITER_PRIVATE_KEY:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    NULLCLEAR_BUILDER_CODE:
      "0x4e554c4c434c4541525f56320000000000000000000000000000000000000000",
    LIVE_AUTOCOPY_ENABLED: "false"
  };

  beforeEach(() => {
    getPolyStore().reset();
  });

  // --------------------------------------------------------------------------
  // 1. Exact 2026 Polymarket Category Taker Fee Math across all categories & probs
  // --------------------------------------------------------------------------
  it("computes exact 2026 category taker fee math across all categories and probability points (0.05, 0.50, 0.95)", () => {
    const expectedRates: Record<PolymarketCategory, number> = {
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

    const categories = Object.keys(expectedRates) as PolymarketCategory[];
    const probabilities = [0.05, 0.5, 0.95];
    const shares = 1000;

    for (const category of categories) {
      expect(POLYMARKET_2026_FEE_RATES[category]).toBe(expectedRates[category]);

      for (const price of probabilities) {
        const res = calculatePolymarketTakerFee({
          shares,
          price,
          category,
          postOnly: false,
          thirtyDayWeightedVolumeUsd: 50_000 // retail < $200k => 0% rebate
        });

        const expectedFee = shares * expectedRates[category] * price * (1 - price);
        expect(res.netFeeUsd).toBeCloseTo(expectedFee, 8);
        expect(res.rebateRate).toBe(0);
        expect(res.isMakerFree).toBe(false);

        // Maker postOnly MUST always be $0.00
        const makerRes = calculatePolymarketTakerFee({
          shares,
          price,
          category,
          postOnly: true
        });
        expect(makerRes.netFeeUsd).toBe(0);
        expect(makerRes.effectiveFeePct).toBe(0);
        expect(makerRes.isMakerFree).toBe(true);
      }
    }

    // Verify peak fee curve at 0.50 vs tails 0.05 / 0.95 for Crypto
    const fee05 = calculatePolymarketTakerFee({ shares: 1000, price: 0.05, category: "crypto" });
    const fee50 = calculatePolymarketTakerFee({ shares: 1000, price: 0.5, category: "crypto" });
    const fee95 = calculatePolymarketTakerFee({ shares: 1000, price: 0.95, category: "crypto" });
    expect(fee50.netFeeUsd).toBeCloseTo(18.0, 6); // 1000 * 0.072 * 0.25 = $18.00
    expect(fee05.netFeeUsd).toBeCloseTo(3.42, 6); // 1000 * 0.072 * 0.0475 = $3.42
    expect(fee95.netFeeUsd).toBeCloseTo(3.42, 6);

    // Live API fee metadata override works
    const overridden = calculatePolymarketTakerFee({
      shares: 1000,
      price: 0.5,
      category: "geopolitics",
      liveApiFeeRate: 0.02
    });
    expect(overridden.netFeeUsd).toBeCloseTo(5.0, 6);

    // Weighted volume & retail rebate threshold (< $200k => 0%)
    expect(calculateWeightedVolume(1000, 0.5)).toBeCloseTo(250, 6);
    expect(getRetailTakerRebateRate(199_999)).toBe(0);
    expect(getRetailTakerRebateRate(250_000)).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // 2. Tick-Size Price Flooring (0.005, 0.0025, 0.01) & CLOB V2 Order Schema
  // --------------------------------------------------------------------------
  it("floors limit prices to exact market tick sizes (0.005, 0.0025, 0.01) and builds CLOB V2 orders without V1 fields", () => {
    expect(floorToTickSize(0.5149, 0.005)).toBe(0.51);
    expect(floorToTickSize(0.515, 0.005)).toBe(0.515);
    expect(floorToTickSize(0.5199, 0.005)).toBe(0.515);

    expect(floorToTickSize(0.3349, 0.0025)).toBe(0.3325);
    expect(floorToTickSize(0.335, 0.0025)).toBe(0.335);
    expect(floorToTickSize(0.3374, 0.0025)).toBe(0.335);
    expect(floorToTickSize(0.3375, 0.0025)).toBe(0.3375);

    expect(floorToTickSize(0.679, 0.01)).toBe(0.67);
    expect(floorToTickSize(0.68, 0.01)).toBe(0.68);

    // Support both Protocol V2 positionIds and legacy CTF clobTokenIds
    const v2Resolved = resolvePolymarketAssetIds({ positionIds: ["pos_v2_yes", "pos_v2_no"] });
    expect(v2Resolved.protocolVersion).toBe("v2_position_ids");
    expect(v2Resolved.assetIds).toEqual(["pos_v2_yes", "pos_v2_no"]);

    const legacyResolved = resolvePolymarketAssetIds({
      clobTokenIds: '["ctf_legacy_yes","ctf_legacy_no"]'
    });
    expect(legacyResolved.protocolVersion).toBe("legacy_ctf_clob_token_ids");
    expect(legacyResolved.assetIds).toEqual(["ctf_legacy_yes", "ctf_legacy_no"]);

    // CLOB V2 order struct: pUSD, chainId 137, bytes32 builder, millisecond timestamp, NO feeRateBps/nonce/taker
    const order = buildClobV2OrderStruct({
      maker: "0x1111111111111111111111111111111111111111",
      assetId: "pos_v2_yes",
      side: "BUY",
      rawPrice: 0.3374,
      tickSize: 0.0025,
      sizeUsd: 100,
      postOnly: true,
      builderCode: testEnv.NULLCLEAR_BUILDER_CODE
    });
    expect(order.chainId).toBe(POLYMARKET_CHAIN_ID);
    expect(order.collateral).toBe(POLYMARKET_COLLATERAL);
    expect(order.price).toBe(0.335);
    expect(order.builder).toBe(normalizeBuilderCodeBytes32(testEnv.NULLCLEAR_BUILDER_CODE));
    expect(order.timestamp).toBeGreaterThan(1_700_000_000_000);
    expect((order as any).feeRateBps).toBeUndefined();
    expect((order as any).nonce).toBeUndefined();
    expect((order as any).taker).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // 3. Copy-Tax Simulation & Copyability Grading (A-F)
  // --------------------------------------------------------------------------
  it("grades clean 0%-fee Geopolitics whales as A and flags high-fee 5m/15m Crypto scalpers as F", () => {
    const geoTrades: WhaleTradeSample[] = [
      {
        id: "g1",
        assetId: "a1",
        marketTitle: "Diplomatic treaty ratified before Q3?",
        category: "geopolitics",
        side: "BUY",
        price: 0.35,
        sizeShares: 20000,
        notionalUsd: 7000,
        timestampMs: 1795000000000,
        bookDepthUsd: 120000,
        realizedPnlUsd: 9000
      },
      {
        id: "g2",
        assetId: "a2",
        marketTitle: "NATO joint resolution passed?",
        category: "geopolitics",
        side: "BUY",
        price: 0.68,
        sizeShares: 15000,
        notionalUsd: 10200,
        timestampMs: 1795200000000,
        bookDepthUsd: 95000,
        realizedPnlUsd: 6500
      }
    ];

    const geoAudit = simulateWhaleCopyability({
      address: "0x9d84ce0306f8551e02efef1680475fc0f1dc1344",
      trades: geoTrades,
      reportedPnlUsd: 15500
    });
    expect(geoAudit.copyabilityGrade).toBe("A");
    expect(geoAudit.scenarios.slip10.totalTakerFeesUsd).toBe(0);
    expect(geoAudit.scenarios.slip10.simulatedCopierPnlUsd).toBeGreaterThan(14000);
    expect(geoAudit.redFlags.length).toBe(0);

    // 5m/15m Crypto Scalper Trap
    const trapTrades: WhaleTradeSample[] = Array.from({ length: 12 }, (_, i) => ({
      id: `c-${i}`,
      assetId: `ca-${i}`,
      marketTitle: "BTC Up or Down — 5m Interval",
      category: "crypto",
      side: "BUY",
      price: 0.5,
      sizeShares: 10000,
      notionalUsd: 5000,
      timestampMs: 1795000000000 + i * 120_000, // every 2 min
      bookDepthUsd: 2000,
      realizedPnlUsd: 120,
      isShortTermCrypto: true
    }));

    const trapAudit = simulateWhaleCopyability({
      address: "0xee00ba338c59557141789b127927a55f5cc5cea1",
      trades: trapTrades,
      reportedPnlUsd: 1440
    });
    expect(trapAudit.copyabilityGrade).toBe("F");
    expect(trapAudit.scenarios.slip10.simulatedCopierPnlUsd).toBeLessThan(0);
    const flagCodes = trapAudit.redFlags.map((f) => f.code);
    expect(flagCodes).toContain("SHORT_TERM_CRYPTO_SPAM");
    expect(flagCodes).toContain("HFT_SCALPING_UNCOPYABLE");
    expect(flagCodes).toContain("NEGATIVE_COPIER_EV");

    // Copy-Tax side-by-side comparison proves Maker Guard dramatically lowers drag vs Taker Copy
    const cmp = calculateCopyTaxComparison({
      category: "crypto",
      entryPrice: 0.5,
      orderSizeUsd: 250,
      orderType: "taker",
      slippageCents: 1.0,
      competitorBotFeePct: 1.0,
      nullclearBuilderFeePct: 0.4
    });
    expect(cmp.takerComparison.polymarketFeeUsd).toBeGreaterThan(8);
    expect(cmp.makerComparison.polymarketFeeUsd).toBe(0);
    expect(cmp.makerComparison.slippageCostUsd).toBe(0);
    expect(cmp.savingsUsdPerTrade).toBeGreaterThan(10);
  });

  // --------------------------------------------------------------------------
  // 4. Policy Engine Hard-Block Tests (maxTradeUsd, maxDailyLossUsd, slippage, feeDrag, blockedCategories)
  // --------------------------------------------------------------------------
  it("hard-blocks trades violating maxTradeUsd, maxDailySpendUsd, maxDailyLossUsd, maxSlippageCents, maxFeeDragPct, makerOnlyMode, or blockedCategories", () => {
    const policy: PolymarketPolicyConfig = {
      ...DEFAULT_POLY_POLICY,
      userId: "u1",
      maxTradeUsd: 100,
      maxDailySpendUsd: 300,
      maxDailyLossUsd: 50,
      maxSlippageCents: 1.0,
      maxFeeDragPct: 2.5,
      makerOnlyMode: false,
      allowedCategories: ["geopolitics", "politics", "economics"],
      blockedCategories: ["crypto"],
      active: true
    };

    const baseCandidate = {
      assetId: "asset_1",
      marketTitle: "Geopolitics Ceasefire?",
      category: "geopolitics",
      side: "BUY" as const,
      orderSizeUsd: 50,
      triggerPrice: 0.4,
      liveBookAsk: 0.405,
      tickSize: 0.005,
      postOnly: false
    };

    // Baseline passes
    const ok = evaluatePolymarketPolicy(policy, baseCandidate, {
      rolling24hSpendUsd: 0,
      dailyRealizedAndMtmLossUsd: 0
    });
    expect(ok.verdict).toBe("ALLOWED");
    expect(ok.rejectionCodes).toEqual([]);

    // 1. maxTradeUsd violation
    const overTrade = evaluatePolymarketPolicy(
      policy,
      { ...baseCandidate, orderSizeUsd: 150 },
      { rolling24hSpendUsd: 0, dailyRealizedAndMtmLossUsd: 0 }
    );
    expect(overTrade.verdict).toBe("BLOCKED");
    expect(overTrade.rejectionCodes).toContain("MAX_TRADE_EXCEEDED");

    // 2. maxDailySpendUsd violation
    const overDailySpend = evaluatePolymarketPolicy(
      policy,
      { ...baseCandidate, orderSizeUsd: 60 },
      { rolling24hSpendUsd: 260, dailyRealizedAndMtmLossUsd: 0 }
    );
    expect(overDailySpend.verdict).toBe("BLOCKED");
    expect(overDailySpend.rejectionCodes).toContain("DAILY_SPEND_CAP_HIT");

    // 3. maxDailyLossUsd circuit breaker
    const lossBreaker = evaluatePolymarketPolicy(policy, baseCandidate, {
      rolling24hSpendUsd: 50,
      dailyRealizedAndMtmLossUsd: 50
    });
    expect(lossBreaker.verdict).toBe("BLOCKED");
    expect(lossBreaker.rejectionCodes).toContain("DAILY_LOSS_CIRCUIT_BREAKER");

    // 4. maxSlippageCents violation (2.5¢ > 1.0¢)
    const highSlip = evaluatePolymarketPolicy(
      policy,
      { ...baseCandidate, triggerPrice: 0.4, liveBookAsk: 0.425 },
      { rolling24hSpendUsd: 0, dailyRealizedAndMtmLossUsd: 0 }
    );
    expect(highSlip.verdict).toBe("BLOCKED");
    expect(highSlip.rejectionCodes).toContain("SLIPPAGE_EXCEEDED");

    // 5. maxFeeDragPct violation (economics 5% feeRate at $0.20 => 4.0% taker fee > 2.5% cap)
    const highDrag = evaluatePolymarketPolicy(
      policy,
      { ...baseCandidate, category: "economics", triggerPrice: 0.2, liveBookAsk: 0.2 },
      { rolling24hSpendUsd: 0, dailyRealizedAndMtmLossUsd: 0 }
    );
    expect(highDrag.verdict).toBe("BLOCKED");
    expect(highDrag.rejectionCodes).toContain("FEE_DRAG_TOO_HIGH");

    // 6. blockedCategories violation
    const blockedCat = evaluatePolymarketPolicy(
      policy,
      { ...baseCandidate, category: "crypto" },
      { rolling24hSpendUsd: 0, dailyRealizedAndMtmLossUsd: 0 }
    );
    expect(blockedCat.verdict).toBe("BLOCKED");
    expect(blockedCat.rejectionCodes).toContain("CATEGORY_BLOCKED");

    // 7. makerOnlyMode violation
    const makerReq = evaluatePolymarketPolicy(
      { ...policy, makerOnlyMode: true },
      { ...baseCandidate, postOnly: false },
      { rolling24hSpendUsd: 0, dailyRealizedAndMtmLossUsd: 0 }
    );
    expect(makerReq.verdict).toBe("BLOCKED");
    expect(makerReq.rejectionCodes).toContain("MAKER_ONLY_REQUIRED");
  });

  // --------------------------------------------------------------------------
  // 5. End-to-End Worker Routes: nullclear.com Funnel, Paper Terminal, Policy Co-Signer & Public Receipts
  // --------------------------------------------------------------------------
  it("serves nullclear.com vertical pages, /live Whale Feed, BYO Webhooks, email watchlists, Paper Mode execution & verifiable receipts", async () => {
    // 1. Refreshed nullclear.com landing page
    const homeRes = await app.fetch(new Request("https://nullclear.com/"), testEnv);
    expect(homeRes.status).toBe(200);
    const homeHtml = await homeRes.text();
    expect(homeHtml).toContain("Stop Losing to Polymarket Copy-Tax &amp; Custodial Bot Hacks.");
    expect(homeHtml).toContain("Zero Custody / No Private Key Storage");
    expect(homeHtml).toContain("Copy-Tax Circuit Breaker");
    expect(homeHtml).toContain("Hard EIP-712 Spend &amp; Drawdown Locks");

    // 2. Calculator, Leaderboard, /live Feed, Whale SSR Page & Sitemap
    const [calcRes, lbRes, liveRes, whaleRes, sitemapRes] = await Promise.all([
      app.fetch(new Request("https://nullclear.com/calculator"), testEnv),
      app.fetch(new Request("https://nullclear.com/leaderboard?category=geopolitics"), testEnv),
      app.fetch(new Request("https://nullclear.com/live"), testEnv),
      app.fetch(
        new Request("https://nullclear.com/whale/0x9d84ce0306f8551e02efef1680475fc0f1dc1344"),
        testEnv
      ),
      app.fetch(new Request("https://nullclear.com/sitemap.xml"), testEnv)
    ]);
    expect(calcRes.status).toBe(200);
    expect(await calcRes.text()).toContain("Polymarket Real Fee &amp; Copy-Tax Calculator");

    expect(lbRes.status).toBe(200);
    const lbHtml = await lbRes.text();
    expect(lbHtml).toContain("GeoMacro Alpha");
    expect(lbHtml).toContain("Track Top Copyable Whales by Email");

    expect(liveRes.status).toBe(200);
    const liveHtml = await liveRes.text();
    expect(liveHtml).toContain("Live Polymarket Whale Feed");
    expect(liveHtml).toContain("COPYABLE");

    expect(whaleRes.status).toBe(200);
    const whaleHtml = await whaleRes.text();
    expect(whaleHtml).toContain("og:title");
    expect(whaleHtml).toContain("Launch Guarded Paper Copy (Free)");
    expect(whaleHtml).toContain("Enable Guarded Live Copy");
    expect(whaleHtml).toContain("Track this whale by email:");

    expect(sitemapRes.status).toBe(200);
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).toContain("https://nullclear.com/live");
    expect(sitemapXml).toContain("https://nullclear.com/calculator");
    expect(sitemapXml).toContain("https://nullclear.com/leaderboard");
    expect(sitemapXml).toContain(
      "https://nullclear.com/whale/0x9d84ce0306f8551e02efef1680475fc0f1dc1344"
    );

    // 3. Live Feed JSON API
    const liveApiRes = await app.fetch(
      new Request("https://nullclear.com/api/poly/live-feed?verdict=COPYABLE"),
      testEnv
    );
    expect(liveApiRes.status).toBe(200);
    const liveApiJson = (await liveApiRes.json()) as any;
    expect(liveApiJson.success).toBe(true);
    expect(liveApiJson.alerts.length).toBeGreaterThan(0);
    expect(liveApiJson.alerts.every((a: any) => a.verdict === "COPYABLE")).toBe(true);

    // 4. Zero-custody safeguard rejects any payload containing a privateKey
    const badKeyRes = await app.fetch(
      new Request("https://nullclear.com/api/poly/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u_bad", privateKey: "0x1234" })
      }),
      testEnv
    );
    expect(badKeyRes.status).toBe(400);

    // 5. BYO Webhook storage in poly_policies + SSRF guard + Discord/JSON payload formatting
    const unsafeHookRes = await app.fetch(
      new Request("https://nullclear.com/api/poly/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "u_hook",
          webhookUrl: "http://169.254.169.254/latest/meta-data"
        })
      }),
      { ...testEnv, ENVIRONMENT: "production" }
    );
    expect(unsafeHookRes.status).toBe(400);

    const saveHookRes = await app.fetch(
      new Request("https://nullclear.com/api/poly/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "u_hook",
          webhookUrl: "https://discord.com/api/webhooks/123456/abcdef",
          webhookFormat: "discord"
        })
      }),
      testEnv
    );
    expect(saveHookRes.status).toBe(200);
    const saveHookJson = (await saveHookRes.json()) as any;
    expect(saveHookJson.policy.webhookUrl).toBe("https://discord.com/api/webhooks/123456/abcdef");
    expect(saveHookJson.policy.webhookFormat).toBe("discord");

    const sampleAlert = buildLiveWhaleAlertRecord({
      tradeId: "t_byo_1",
      whaleAddress: "0x9d84ce0306f8551e02efef1680475fc0f1dc1344",
      whaleLabel: "GeoMacro Alpha",
      assetId: "pos_geo_1",
      marketTitle: "Ceasefire before Q2?",
      category: "geopolitics",
      side: "BUY",
      whalePrice: 0.34,
      currentBestAsk: 0.345,
      notionalUsd: 5000
    });
    expect(sampleAlert.verdict).toBe("COPYABLE");
    const discordPayload = formatByoWebhookPayload(sampleAlert, "discord") as any;
    expect(discordPayload.embeds[0].title).toBe("Ceasefire before Q2?");
    const jsonPayload = formatByoWebhookPayload(sampleAlert, "json") as any;
    expect(jsonPayload.event).toBe("nullclear.polymarket.whale_alert");
    expect(jsonPayload.links.liveFeedUrl).toBe("https://nullclear.com/live");

    // 6. Email lead capture with watched whale addresses (merges watchedWhales across signups)
    const lead1Res = await app.fetch(
      new Request("https://nullclear.com/api/poly/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "trader@example.com",
          watchedWhales: ["0x9d84ce0306f8551e02efef1680475fc0f1dc1344"],
          source: "whale_page"
        })
      }),
      testEnv
    );
    expect(lead1Res.status).toBe(200);

    const lead2Res = await app.fetch(
      new Request("https://nullclear.com/api/poly/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "trader@example.com",
          watchedWhales: ["0x56687bf447db6ffa42ffe2204a05edaa20f55839"],
          source: "leaderboard"
        })
      }),
      testEnv
    );
    expect(lead2Res.status).toBe(200);
    const lead2Json = (await lead2Res.json()) as any;
    expect(lead2Json.lead.watchedWhales).toHaveLength(2);

    // 7. Execute ALLOWED Paper trade -> persists paper_trades, paper_positions & verifiable public receipt on nullclear.dev
    const execAllowRes = await app.fetch(
      new Request("https://nullclear.com/api/poly/terminal/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "paper_tester_1",
          mode: "paper",
          assetId: "pos_geo_1",
          marketTitle: "Will ceasefire hold?",
          category: "geopolitics",
          side: "BUY",
          orderSizeUsd: 50,
          triggerPrice: 0.34,
          liveBookAsk: 0.345,
          tickSize: 0.005,
          skipLiveBookFetch: true
        })
      }),
      testEnv
    );
    expect(execAllowRes.status).toBe(200);
    const execAllowJson = (await execAllowRes.json()) as any;
    expect(execAllowJson.verdict).toBe("ALLOWED");
    expect(execAllowJson.eip712Approval?.signature).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(execAllowJson.receiptUrl).toContain("https://nullclear.dev/receipt/poly_rcpt_");

    // 8. Public receipt verification on nullclear.dev (/receipt/:id HTML & /v1/receipt/:id JSON)
    const rcptId = execAllowJson.receipt.id;
    const rcptHtmlRes = await app.fetch(
      new Request(`https://nullclear.dev/receipt/${rcptId}`),
      testEnv
    );
    expect(rcptHtmlRes.status).toBe(200);
    const rcptHtml = await rcptHtmlRes.text();
    expect(rcptHtml).toContain("POLYMARKET CLOB V2 POLICY VERDICT");
    expect(rcptHtml).toContain("ALLOWED");

    const rcptJsonRes = await app.fetch(
      new Request(`https://api.nullclear.dev/v1/receipt/${rcptId}`),
      testEnv
    );
    expect(rcptJsonRes.status).toBe(200);
    const rcptJson = (await rcptJsonRes.json()) as any;
    expect(rcptJson.receiptType).toBe("POLYMARKET_POLICY_RECEIPT");
    expect(rcptJson.verdict).toBe("ALLOWED");

    // 9. Execute BLOCKED trade via nullclear.dev Policy Co-Signer -> generates BLOCKED receipt
    const cosignBlockRes = await app.fetch(
      new Request("https://api.nullclear.dev/v1/policy/polymarket/cosign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "paper_tester_1",
          mode: "live",
          walletAddress: "0x1111111111111111111111111111111111111111",
          assetId: "pos_cry_5m",
          marketTitle: "BTC Up or Down — 5m",
          category: "crypto",
          side: "BUY",
          orderSizeUsd: 50,
          triggerPrice: 0.5,
          liveBookAsk: 0.53,
          skipLiveBookFetch: true
        })
      }),
      testEnv
    );
    expect(cosignBlockRes.status).toBe(200);
    const cosignBlockJson = (await cosignBlockRes.json()) as any;
    expect(cosignBlockJson.approved).toBe(false);
    expect(cosignBlockJson.verdict).toBe("BLOCKED");
    expect(cosignBlockJson.eip712Approval).toBeNull();
    expect(cosignBlockJson.receiptUrl).toContain("https://nullclear.dev/receipt/");
  });

  // --------------------------------------------------------------------------
  // 6. CLOB /book Ascending Bids & Descending Asks + Admin Seeder Guard
  // --------------------------------------------------------------------------
  it("extracts Math.max best bid and Math.min best ask from ascending bids / descending asks and guards admin seeder", async () => {
    // Polymarket CLOB returns bids ascending (worst->best) and asks descending (worst->best)
    const parsed = parseClobBookLevels(
      [
        { price: "0.01", size: "50000" },
        { price: "0.25", size: "1000" },
        { price: "0.485", size: "400" }
      ],
      [
        { price: "0.99", size: "50000" },
        { price: "0.75", size: "1000" },
        { price: "0.495", size: "600" }
      ]
    );
    expect(parsed.bestBid).toBe(0.485);
    expect(parsed.bestAsk).toBe(0.495);
    // Near-touch depth includes the best levels (not truncated away by slice(0,10))
    expect(parsed.bidDepthUsd).toBeGreaterThan(0);
    expect(parsed.askDepthUsd).toBeGreaterThan(0);

    // Admin seeder MUST reject unauthorized requests in production
    const unauthRes = await app.fetch(
      new Request("https://nullclear.com/api/poly/admin/seed-leaderboard", {
        method: "POST"
      }),
      { ...testEnv, ENVIRONMENT: "production", POLY_ADMIN_TOKEN: "secret-admin-token" }
    );
    expect(unauthRes.status).toBe(401);

    const noTokenProdRes = await app.fetch(
      new Request("https://nullclear.com/api/poly/admin/seed-leaderboard", {
        method: "POST"
      }),
      { ...testEnv, ENVIRONMENT: "production" }
    );
    expect(noTokenProdRes.status).toBe(403);
  });
});

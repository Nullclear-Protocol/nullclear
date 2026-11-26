import {
  calculatePolymarketTakerFee,
  type PolyWebhookFormat,
  type PolymarketCategory
} from "@nullclear/shared";
import type { Env } from "../env.js";
import { fetchClobOrderBook, fetchWhaleTradesV2 } from "./poly-api.js";
import { getPolyStore, type LiveWhaleAlertRecord } from "./poly-store.js";
import { validateTargetUrl } from "./ssrf-guard.js";

/**
 * Compute Live Copy-Tax and build a structured LiveWhaleAlertRecord for D1 `/live` feed & BYO Webhooks.
 */
export function buildLiveWhaleAlertRecord(params: {
  tradeId: string;
  whaleAddress: string;
  whaleLabel: string;
  assetId: string;
  marketTitle: string;
  category: PolymarketCategory;
  side: "BUY" | "SELL";
  whalePrice: number;
  currentBestAsk: number;
  notionalUsd: number;
  createdAt?: number;
}): LiveWhaleAlertRecord {
  const shares = params.whalePrice > 0 ? params.notionalUsd / params.whalePrice : 0;
  const slippageCents = Math.max(
    0,
    params.side === "BUY"
      ? (params.currentBestAsk - params.whalePrice) * 100
      : (params.whalePrice - params.currentBestAsk) * 100
  );
  const fee = calculatePolymarketTakerFee({
    shares,
    price: params.currentBestAsk,
    category: params.category,
    postOnly: false
  });
  const slippagePct =
    params.currentBestAsk > 0 ? (slippageCents / (params.currentBestAsk * 100)) * 100 : 0;
  const liveCopyTaxPct = Number((fee.effectiveFeePct + slippagePct).toFixed(2));
  const verdict =
    slippageCents <= 1.2 && liveCopyTaxPct <= 2.75
      ? "COPYABLE"
      : "PASS - SLIPPAGE TOO HIGH";

  const ts = params.createdAt ?? Date.now();
  return {
    id: `live_${ts}_${Math.random().toString(36).slice(2, 8)}`,
    tradeId: params.tradeId,
    whaleAddress: params.whaleAddress.toLowerCase(),
    whaleLabel: params.whaleLabel,
    assetId: params.assetId,
    marketTitle: params.marketTitle,
    category: params.category,
    side: params.side,
    whalePrice: Number(params.whalePrice.toFixed(4)),
    liveBestAsk: Number(params.currentBestAsk.toFixed(4)),
    notionalUsd: Number(params.notionalUsd.toFixed(2)),
    slippageCents: Number(slippageCents.toFixed(2)),
    takerFeePct: Number(fee.effectiveFeePct.toFixed(2)),
    liveCopyTaxPct,
    verdict,
    webhooksDelivered: 0,
    createdAt: ts
  };
}

/**
 * Format a LiveWhaleAlertRecord for Bring-Your-Own Webhook delivery (standard JSON or Discord Embed).
 */
export function formatByoWebhookPayload(
  alert: LiveWhaleAlertRecord,
  format: PolyWebhookFormat = "json"
): Record<string, unknown> {
  const whaleUrl = `https://nullclear.com/whale/${alert.whaleAddress}`;
  const terminalUrl = `https://nullclear.com/terminal?copy=${encodeURIComponent(
    alert.whaleAddress
  )}&asset=${encodeURIComponent(alert.assetId)}&title=${encodeURIComponent(
    alert.marketTitle
  )}&category=${encodeURIComponent(alert.category)}&price=${encodeURIComponent(
    String(alert.whalePrice)
  )}`;
  const liveFeedUrl = "https://nullclear.com/live";

  if (format === "discord") {
    const isCopyable = alert.verdict === "COPYABLE";
    return {
      username: "NullClear Polymarket Guard",
      content: `${isCopyable ? "✅ **COPYABLE**" : "🛑 **PASS - SLIPPAGE TOO HIGH**"} — **${alert.whaleLabel}** ${alert.side} $${alert.notionalUsd.toLocaleString()} on *${alert.marketTitle}*`,
      embeds: [
        {
          title: alert.marketTitle,
          url: terminalUrl,
          color: isCopyable ? 0x10b981 : 0xf43f5e,
          fields: [
            { name: "Whale", value: `[${alert.whaleLabel}](${whaleUrl})`, inline: true },
            { name: "Category", value: alert.category, inline: true },
            { name: "Verdict", value: alert.verdict, inline: true },
            {
              name: "Whale Fill -> Live Ask",
              value: `${(alert.whalePrice * 100).toFixed(2)}¢ -> ${(alert.liveBestAsk * 100).toFixed(2)}¢ (${alert.slippageCents.toFixed(2)}¢ slip)`,
              inline: true
            },
            {
              name: "Live Copy-Tax",
              value: `${alert.liveCopyTaxPct.toFixed(2)}% (2026 Fee ${alert.takerFeePct.toFixed(2)}%)`,
              inline: true
            },
            {
              name: "Actions",
              value: `[Audit Whale](${whaleUrl}) • [Guarded Copy](${terminalUrl}) • [Live Feed](${liveFeedUrl})`,
              inline: false
            }
          ],
          timestamp: new Date(alert.createdAt).toISOString(),
          footer: { text: "NullClear Non-Custodial Polymarket Policy Guard (CLOB V2)" }
        }
      ]
    };
  }

  return {
    event: "nullclear.polymarket.whale_alert",
    version: "2.0",
    alert: {
      id: alert.id,
      tradeId: alert.tradeId,
      whaleAddress: alert.whaleAddress,
      whaleLabel: alert.whaleLabel,
      assetId: alert.assetId,
      marketTitle: alert.marketTitle,
      category: alert.category,
      side: alert.side,
      whalePrice: alert.whalePrice,
      liveBestAsk: alert.liveBestAsk,
      notionalUsd: alert.notionalUsd,
      slippageCents: alert.slippageCents,
      takerFeePct: alert.takerFeePct,
      liveCopyTaxPct: alert.liveCopyTaxPct,
      verdict: alert.verdict,
      timestamp: alert.createdAt
    },
    links: {
      whaleAuditUrl: whaleUrl,
      guardedTerminalUrl: terminalUrl,
      liveFeedUrl
    }
  };
}

/**
 * Safely deliver a Bring-Your-Own Webhook POST (SSRF-guarded).
 */
export async function deliverByoWebhook(params: {
  webhookUrl: string;
  format: PolyWebhookFormat;
  alert: LiveWhaleAlertRecord;
  environment?: string;
}): Promise<{ delivered: boolean; status: number; error?: string }> {
  const ssrf = validateTargetUrl(params.webhookUrl, params.environment || "production");
  if (!ssrf.allowed) {
    return { delivered: false, status: 0, error: ssrf.reason || "Blocked webhook URL" };
  }

  const payload = formatByoWebhookPayload(params.alert, params.format);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(params.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "NullClear-Polymarket-Webhook/2.0",
        "X-NullClear-Event": "polymarket.whale_alert",
        "X-NullClear-Verdict": params.alert.verdict
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return {
      delivered: res.ok,
      status: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}`
    };
  } catch (err: any) {
    return {
      delivered: false,
      status: 0,
      error: err?.message || "Webhook fetch error"
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cloudflare Worker Scheduled Cron Job:
 * 1. Polls `data-api.polymarket.com/v2/trades` for watched whales in D1.
 * 2. Deduplicates seen trade IDs via D1 + KV.
 * 3. Checks live best ask on `clob.polymarket.com/book` and computes Live Copy-Tax verdict.
 * 4. Stores notable fills ($1,500+) in D1 `live_whale_alerts` powering `https://nullclear.com/live`.
 * 5. Fans out POST JSON/Discord alerts to user-configured BYO webhooks stored in `poly_policies`.
 */
export async function runPolymarketLiveFeedCron(
  env?: Env["Bindings"],
  options?: { dryRunWebhooks?: boolean }
): Promise<{
  polledWhales: number;
  newTradesSeen: number;
  alertsSaved: number;
  webhooksDelivered: number;
  alerts: LiveWhaleAlertRecord[];
}> {
  const store = getPolyStore(env);
  const kv = env?.NULLCLEAR_CACHE || env?.KV;
  const defaultMinUsd = Number(env?.POLY_ALERT_MIN_USD || 1500) || 1500;

  const [watched, webhookPolicies] = await Promise.all([
    store.listWatchedWhales(),
    store.listActivePoliciesWithWebhooks()
  ]);

  let newTradesSeen = 0;
  let alertsSaved = 0;
  let totalWebhooksDelivered = 0;
  const alerts: LiveWhaleAlertRecord[] = [];

  for (const whale of watched.slice(0, 12)) {
    const { trades } = await fetchWhaleTradesV2(whale.address, 10);
    const minUsd = whale.minAlertUsd || defaultMinUsd;

    for (const t of trades) {
      const dedupeKey = `poly:seen_trade:${t.id}`;
      if (kv) {
        try {
          const seenInKv = await kv.get(dedupeKey);
          if (seenInKv) continue;
        } catch {}
      }
      if (await store.hasSeenWhaleTrade(t.id)) continue;

      newTradesSeen += 1;
      let savedAlert = false;

      if (t.notionalUsd >= minUsd) {
        const book = await fetchClobOrderBook(t.assetId, env, t.price);
        const alert = buildLiveWhaleAlertRecord({
          tradeId: t.id,
          whaleAddress: whale.address,
          whaleLabel: whale.label,
          assetId: t.assetId,
          marketTitle: t.marketTitle,
          category: t.category,
          side: t.side,
          whalePrice: t.price,
          currentBestAsk: t.side === "SELL" ? book.bestBid : book.bestAsk,
          notionalUsd: t.notionalUsd
        });

        let deliveredCount = 0;
        if (!options?.dryRunWebhooks && webhookPolicies.length > 0) {
          const deliveries = await Promise.all(
            webhookPolicies
              .filter((p) => {
                if (!p.webhookUrl) return false;
                if (p.blockedCategories?.includes(alert.category)) return false;
                if (
                  Array.isArray(p.allowedCategories) &&
                  p.allowedCategories.length > 0 &&
                  !p.allowedCategories.includes(alert.category)
                ) {
                  return false;
                }
                return true;
              })
              .map((p) =>
                deliverByoWebhook({
                  webhookUrl: p.webhookUrl!,
                  format: p.webhookFormat || "json",
                  alert,
                  environment: env?.ENVIRONMENT
                })
              )
          );
          deliveredCount = deliveries.filter((d) => d.delivered).length;
        }

        alert.webhooksDelivered = deliveredCount;
        totalWebhooksDelivered += deliveredCount;
        await store.saveLiveWhaleAlert(alert);
        alerts.push(alert);
        alertsSaved += 1;
        savedAlert = true;
      }

      await store.markSeenWhaleTrade({
        tradeId: t.id,
        whaleAddress: whale.address,
        assetId: t.assetId,
        marketTitle: t.marketTitle,
        notionalUsd: t.notionalUsd,
        alertPosted: savedAlert
      });
      if (kv) {
        try {
          await kv.put(dedupeKey, "1", { expirationTtl: 86_400 * 7 });
        } catch {}
      }
    }

    await store.upsertWatchedWhale({
      ...whale,
      lastPolledAt: Date.now()
    });
  }

  return {
    polledWhales: watched.length,
    newTradesSeen,
    alertsSaved,
    webhooksDelivered: totalWebhooksDelivered,
    alerts
  };
}

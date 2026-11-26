import type { LiveWhaleAlertRecord } from "../services/poly-store.js";
import {
  POLY_FONTS_HEAD,
  POLY_SHELL_CSS,
  escapeHtml,
  renderPolyFooter,
  renderPolyHeader
} from "./poly-shell.js";

const LIVE_CATEGORIES = [
  { key: "all", label: "All Categories" },
  { key: "geopolitics", label: "Geopolitics (0%)" },
  { key: "politics", label: "Politics (4%)" },
  { key: "sports", label: "Sports (3%)" },
  { key: "economics", label: "Economics (5%)" },
  { key: "crypto", label: "Crypto (7.2%)" }
];

function formatAgo(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function renderPolyLiveHtml(
  alerts: LiveWhaleAlertRecord[],
  activeCategory = "all",
  activeVerdict = "ALL"
): string {
  const catPills = LIVE_CATEGORIES.map(
    (c) =>
      `<a href="/live?category=${c.key}&verdict=${encodeURIComponent(activeVerdict)}" class="btn btn-sm ${
        activeCategory === c.key ? "btn-primary" : "btn-secondary"
      }">${escapeHtml(c.label)}</a>`
  ).join("");

  const rows = alerts
    .map((a) => {
      const isCopyable = a.verdict === "COPYABLE";
      const copyHref = `/terminal?copy=${encodeURIComponent(a.whaleAddress)}&asset=${encodeURIComponent(
        a.assetId
      )}&title=${encodeURIComponent(a.marketTitle)}&category=${encodeURIComponent(
        a.category
      )}&price=${encodeURIComponent(String(a.whalePrice))}`;

      return `<tr>
        <td class="mono" style="font-size:11.5px;color:var(--muted);white-space:nowrap;">${escapeHtml(formatAgo(a.createdAt))}</td>
        <td>
          <a href="/whale/${escapeHtml(a.whaleAddress)}" style="font-weight:700;display:block;">${escapeHtml(a.whaleLabel)}</a>
          <span class="mono" style="font-size:11px;color:var(--dim);">${escapeHtml(a.whaleAddress.slice(0, 8))}...${escapeHtml(a.whaleAddress.slice(-4))}</span>
        </td>
        <td style="max-width:290px;">
          <div style="font-weight:600;">${escapeHtml(a.marketTitle)}</div>
          <span class="mono" style="font-size:11px;color:var(--dim);text-transform:capitalize;">${escapeHtml(a.category)} &middot; ${escapeHtml(a.side)} $${a.notionalUsd.toLocaleString()}</span>
        </td>
        <td class="mono">
          <div>${(a.whalePrice * 100).toFixed(2)}¢ &rarr; <strong>${(a.liveBestAsk * 100).toFixed(2)}¢</strong></div>
          <div style="font-size:11px;color:${a.slippageCents > 1.2 ? "var(--rose)" : "var(--muted)"};">+${a.slippageCents.toFixed(2)}¢ slip</div>
        </td>
        <td class="mono">
          <div style="font-weight:700;color:${a.liveCopyTaxPct > 2.75 ? "var(--rose)" : "var(--emerald)"};">${a.liveCopyTaxPct.toFixed(2)}%</div>
          <div style="font-size:11px;color:var(--dim);">Fee ${a.takerFeePct.toFixed(2)}%</div>
        </td>
        <td>
          <span class="pill ${isCopyable ? "pill-safe" : "pill-danger"}">
            ${isCopyable ? "✓ COPYABLE" : "✕ PASS - SLIPPAGE TOO HIGH"}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            <a href="/whale/${escapeHtml(a.whaleAddress)}" class="btn btn-secondary btn-sm">Audit</a>
            <a href="${escapeHtml(copyHref)}" class="btn btn-primary btn-sm">Copy</a>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const watchedAddrsJson = JSON.stringify(
    Array.from(new Set(alerts.map((a) => a.whaleAddress))).slice(0, 10)
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Live Polymarket Whale Feed &amp; Real-Time Copy-Tax Verdicts | NullClear</title>
  <meta name="description" content="Live Cloudflare Edge feed of $1,500+ Polymarket whale fills scored against live CLOB V2 books and 2026 category taker fees. Filter COPYABLE fills or connect your own Discord/JSON webhook." />
  <meta property="og:title" content="Live Polymarket Whale Feed &amp; Copy-Tax Verdicts | NullClear" />
  <meta property="og:description" content="Real-time Polymarket whale trades with live CLOB slippage, 2026 fee drag, and COPYABLE vs PASS verdicts. Zero Telegram required — BYO Webhook supported." />
  <meta property="og:url" content="https://nullclear.com/live" />
  ${POLY_FONTS_HEAD}
  <style>${POLY_SHELL_CSS}</style>
</head>
<body>
  ${renderPolyHeader("live")}

  <main class="container" style="padding-top:34px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:14px;">
      <div>
        <div class="eyebrow">LIVE EDGE CRON FEED &middot; DATA API V2 + CLOB V2 BOOKS &middot; BYO WEBHOOKS</div>
        <h1 style="font-size:clamp(26px,3.6vw,38px);font-weight:800;letter-spacing:-0.03em;margin-top:6px;">
          Live Polymarket Whale Feed
        </h1>
        <p style="color:var(--muted);max-width:700px;margin-top:6px;font-size:14px;">
          Notable whale fills ($1,500+) checked against live <span class="mono">clob.polymarket.com/book</span> asks and 2026 category taker fees. Stream these directly into your own Discord or custom JSON webhook via your <a href="/terminal" style="color:var(--emerald);text-decoration:underline;">Terminal Policy</a>.
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" id="refreshFeedBtn" class="btn btn-secondary btn-sm mono" onclick="refreshLiveFeed()">↻ Refresh Feed</button>
        <a href="/terminal#byo-webhook" class="btn btn-primary btn-sm">Configure BYO Webhook &rarr;</a>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin:20px 0 16px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${catPills}
      </div>
      <div style="display:flex;gap:6px;">
        <a href="/live?category=${encodeURIComponent(activeCategory)}&verdict=ALL" class="btn btn-sm ${activeVerdict === "ALL" ? "btn-primary" : "btn-secondary"}">All Verdicts</a>
        <a href="/live?category=${encodeURIComponent(activeCategory)}&verdict=COPYABLE" class="btn btn-sm ${activeVerdict === "COPYABLE" ? "btn-primary" : "btn-secondary"}">Copyable Only</a>
        <a href="/live?category=${encodeURIComponent(activeCategory)}&verdict=PASS" class="btn btn-sm ${activeVerdict === "PASS" ? "btn-primary" : "btn-secondary"}">Blocked / Pass</a>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrap">
        <table class="poly-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Whale</th>
              <th>Market &amp; Fill</th>
              <th>Whale &rarr; Live Ask</th>
              <th>Live Copy-Tax</th>
              <th>Verdict</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="liveFeedBody">
            ${rows || '<tr><td colspan="7" style="color:var(--muted);padding:24px;">No whale fills match this filter yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Email Digest + BYO Webhook Strip -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:22px;">
      <div class="card" style="border-color:var(--emerald-border);">
        <div class="eyebrow">EMAIL WHALE WATCHLIST</div>
        <h2 style="font-size:17px;font-weight:700;margin-top:4px;">Get Copyable Whale Digests by Email</h2>
        <p style="font-size:13px;color:var(--muted);margin:6px 0 12px;">
          Save your email + watched whales to receive daily Copy-Tax reality digests — zero Telegram bots or private keys required.
        </p>
        <form onsubmit="event.preventDefault(); submitLiveLead();" style="display:flex;gap:8px;flex-wrap:wrap;">
          <input id="liveLeadEmail" class="input" style="flex:1;min-width:200px;" type="email" placeholder="you@domain.com" required />
          <button type="submit" class="btn btn-primary btn-sm">Subscribe</button>
        </form>
        <div id="liveLeadMsg" class="mono" style="font-size:11.5px;color:var(--emerald);margin-top:8px;"></div>
      </div>

      <div class="card" style="border-color:var(--cyan-border);">
        <div class="eyebrow">BRING-YOUR-OWN WEBHOOK (JSON / DISCORD)</div>
        <h2 style="font-size:17px;font-weight:700;margin-top:4px;">Push Live Verdicts to Discord or Your Bot</h2>
        <p style="font-size:13px;color:var(--muted);margin:6px 0 12px;">
          Store any HTTPS webhook URL in your <span class="mono">poly_policies</span> guardrail config. NullClear POSTs clean JSON or Discord Embeds whenever watched whales trade inside your allowed categories.
        </p>
        <a href="/terminal#byo-webhook" class="btn btn-secondary btn-sm">Open Webhook Settings in Terminal &rarr;</a>
      </div>
    </div>
  </main>

  ${renderPolyFooter()}

  <script>
    const WATCHED_WHALES = ${watchedAddrsJson};
    async function refreshLiveFeed() {
      const btn = document.getElementById('refreshFeedBtn');
      btn.textContent = 'Refreshing...';
      try {
        const res = await fetch('/api/poly/live-feed?category=${encodeURIComponent(activeCategory)}&verdict=${encodeURIComponent(activeVerdict)}');
        const data = await res.json();
        if (data.success && Array.isArray(data.alerts)) {
          location.reload();
        }
      } catch {}
      btn.textContent = '↻ Refresh Feed';
    }
    async function submitLiveLead() {
      const email = document.getElementById('liveLeadEmail').value.trim();
      const msg = document.getElementById('liveLeadMsg');
      msg.textContent = 'Saving...';
      try {
        const res = await fetch('/api/poly/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, watchedWhales: WATCHED_WHALES, source: 'live_feed' })
        });
        const data = await res.json();
        msg.textContent = data.success
          ? '✓ Subscribed ' + data.lead.email + ' (' + data.lead.watchedWhales.length + ' watched whales saved).'
          : (data.error || 'Error');
      } catch (e) {
        msg.textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
}

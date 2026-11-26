import type { AuditedWhaleRecord } from "../services/poly-store.js";
import {
  POLY_FONTS_HEAD,
  POLY_SHELL_CSS,
  escapeHtml,
  formatSignedUsd,
  gradeClass,
  renderPolyFooter,
  renderPolyHeader
} from "./poly-shell.js";

const FILTER_TABS = [
  { key: "all", label: "All Categories" },
  { key: "geopolitics", label: "Geopolitics (0% Fee)" },
  { key: "politics", label: "Politics (4%)" },
  { key: "sports", label: "Sports (3%)" },
  { key: "economics", label: "Economics (5%)" },
  { key: "crypto", label: "Crypto (7.2%)" }
];

export function renderPolyLeaderboardHtml(
  whales: AuditedWhaleRecord[],
  activeCategory = "all"
): string {
  const pills = FILTER_TABS.map(
    (t) =>
      `<a href="/leaderboard${t.key === "all" ? "" : `?category=${t.key}`}" class="btn btn-sm ${
        activeCategory === t.key ? "btn-primary" : "btn-secondary"
      }">${escapeHtml(t.label)}</a>`
  ).join("");

  const rows = whales
    .map(
      (w, i) => `<tr>
        <td class="mono" style="color:var(--dim);font-weight:700;">#${i + 1}</td>
        <td>
          <a href="/whale/${escapeHtml(w.address)}" style="font-weight:700;color:var(--text);display:block;">${escapeHtml(w.displayName)}</a>
          <span class="mono" style="font-size:11px;color:var(--dim);">${escapeHtml(w.address.slice(0, 8))}...${escapeHtml(w.address.slice(-6))}</span>
        </td>
        <td><span class="${gradeClass(w.copyabilityGrade)}">${escapeHtml(w.copyabilityGrade)}</span></td>
        <td class="mono" style="text-transform:capitalize;">${escapeHtml(w.primaryCategory)}</td>
        <td class="mono" style="color:var(--muted);">${escapeHtml(formatSignedUsd(w.naivePnlUsd))}</td>
        <td class="mono" style="font-weight:800;color:${w.netCopierPnlUsd >= 0 ? "var(--emerald)" : "var(--rose)"};">
          ${escapeHtml(formatSignedUsd(w.netCopierPnlUsd))}
        </td>
        <td class="mono" style="color:var(--emerald);">${escapeHtml(formatSignedUsd(w.makerPnlUsd))}</td>
        <td class="mono" style="color:${w.dragPct > 3 ? "var(--rose)" : "var(--amber)"};">${w.dragPct.toFixed(2)}%</td>
        <td>
          <div style="display:flex;gap:6px;">
            <a href="/whale/${escapeHtml(w.address)}" class="btn btn-secondary btn-sm">Audit</a>
            <a href="/terminal?copy=${encodeURIComponent(w.address)}&mode=paper" class="btn btn-primary btn-sm">Paper Copy</a>
          </div>
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Copyable Polymarket Whale Leaderboard (Ranked by Net Copier PnL) | NullClear</title>
  <meta name="description" content="Polymarket whales ranked by real Net Copier PnL and Copyability Grade (A-F) after 2026 category taker fees and 1.0¢ fill delay — not deceptive raw PnL." />
  <meta property="og:title" content="Copyable Polymarket Whale Leaderboard | NullClear" />
  <meta property="og:description" content="Ranked by Net Copier PnL after 2026 taker fees & slippage. Filter by Geopolitics (0% fee), Politics, Sports, Economics, or Crypto." />
  <meta property="og:url" content="https://nullclear.com/leaderboard" />
  ${POLY_FONTS_HEAD}
  <style>${POLY_SHELL_CSS}</style>
</head>
<body>
  ${renderPolyHeader("leaderboard")}

  <main class="container" style="padding-top:36px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;">
      <div>
        <div class="eyebrow">FREE TOOL 03 &middot; SORTED BY NET COPIER PNL (NOT RAW DECEPTIVE PNL)</div>
        <h1 style="font-size:clamp(26px,3.6vw,38px);font-weight:800;letter-spacing:-0.03em;margin-top:6px;">
          Copyable Whale Leaderboard
        </h1>
        <p style="color:var(--muted);max-width:680px;margin-top:6px;font-size:14px;">
          Every wallet is audited through NullClear's 2026 Copy-Tax Simulation Engine (category taker fee + 1.0¢ fill delay). High-fee 5m/15m crypto scalpers sink to the bottom automatically.
        </p>
      </div>
      <form onsubmit="event.preventDefault(); const a=document.getElementById('lbAddr').value.trim(); if(/^0x[a-fA-F0-9]{40}$/.test(a)) location.href='/whale/'+a.toLowerCase();" style="display:flex;gap:8px;">
        <input id="lbAddr" class="input" style="width:270px;" placeholder="Audit any 0x... whale" />
        <button type="submit" class="btn btn-primary">Audit</button>
      </form>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 18px;">
      ${pills}
    </div>

    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrap">
        <table class="poly-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Whale Wallet</th>
              <th>Grade</th>
              <th>Category</th>
              <th>Reported PnL</th>
              <th>Net Copier PnL (1¢)</th>
              <th>Maker Guard PnL</th>
              <th>Copy-Tax Drag</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="9" style="color:var(--muted);padding:24px;">No audited whales in this category yet. Paste any 0x address above to audit live.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Email Lead Capture for Leaderboard Watchlist -->
    <section class="card" style="margin-top:22px;border-color:var(--emerald-border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div style="max-width:580px;">
        <div class="eyebrow">EMAIL WHALE WATCHLIST &amp; DIGEST</div>
        <h2 style="font-size:19px;font-weight:800;margin-top:4px;">Track Top Copyable Whales by Email</h2>
        <p style="font-size:13.5px;color:var(--muted);margin-top:4px;">
          Save your email to watch the top ${Math.min(5, whales.length)} copyable whales in this view and receive daily Net Copier PnL changes. Need instant push alerts? Configure a Bring-Your-Own Discord/JSON webhook in <a href="/terminal#byo-webhook" style="color:var(--cyan);text-decoration:underline;">Terminal</a>.
        </p>
      </div>
      <form onsubmit="event.preventDefault(); subscribeLeaderboardLead();" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input id="lbLeadEmail" class="input" style="width:240px;" type="email" placeholder="you@domain.com" required />
        <button type="submit" class="btn btn-primary">Watch Top Whales</button>
        <div id="lbLeadMsg" class="mono" style="width:100%;font-size:11.5px;color:var(--emerald);"></div>
      </form>
    </section>
  </main>

  ${renderPolyFooter()}

  <script>
    const TOP_WHALES = ${JSON.stringify(whales.slice(0, 5).map((w) => w.address))};
    async function subscribeLeaderboardLead() {
      const email = document.getElementById('lbLeadEmail').value.trim();
      const msg = document.getElementById('lbLeadMsg');
      msg.textContent = 'Saving watchlist...';
      try {
        const res = await fetch('/api/poly/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, watchedWhales: TOP_WHALES, source: 'leaderboard' })
        });
        const data = await res.json();
        msg.textContent = data.success
          ? '✓ Saved ' + data.lead.watchedWhales.length + ' watched whales for ' + data.lead.email + '.'
          : (data.error || 'Error saving email');
      } catch (e) {
        msg.textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
}

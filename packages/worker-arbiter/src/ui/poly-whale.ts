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

function renderPnlComparisonSvg(whale: AuditedWhaleRecord): string {
  const r = whale.report;
  const bars = [
    { label: "Reported / Naive", val: r.naivePnlUsd, color: "#94A3B8" },
    { label: "Maker Guard (0% Fee)", val: r.makerSimulatedPnlUsd, color: "#10B981" },
    { label: "Copier 0.5¢ Slip", val: r.scenarios.slip05.simulatedCopierPnlUsd, color: "#38BDF8" },
    { label: "Copier 1.0¢ Slip", val: r.scenarios.slip10.simulatedCopierPnlUsd, color: r.scenarios.slip10.simulatedCopierPnlUsd >= 0 ? "#22C55E" : "#F43F5E" },
    { label: "Copier 2.0¢ Slip", val: r.scenarios.slip20.simulatedCopierPnlUsd, color: r.scenarios.slip20.simulatedCopierPnlUsd >= 0 ? "#F59E0B" : "#E11D48" }
  ];

  const maxAbs = Math.max(100, ...bars.map((b) => Math.abs(b.val)));
  const W = 640;
  const H = 200;
  const zeroY = 115;
  const maxBarH = 78;
  const colW = W / bars.length;

  const rects = bars
    .map((b, i) => {
      const cx = i * colW + colW / 2;
      const bw = 64;
      const bh = Math.max(4, (Math.abs(b.val) / maxAbs) * maxBarH);
      const y = b.val >= 0 ? zeroY - bh : zeroY;
      const valY = b.val >= 0 ? y - 7 : y + bh + 13;
      return `
        <rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" rx="5" fill="${b.color}" opacity="0.9" />
        <text x="${cx.toFixed(1)}" y="${valY.toFixed(1)}" text-anchor="middle" fill="${b.color}" font-size="11" font-weight="700" font-family="JetBrains Mono">${escapeHtml(formatSignedUsd(b.val))}</text>
        <text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#94A3B8" font-size="10.5" font-family="Inter">${escapeHtml(b.label)}</text>
      `;
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:#05070B;border:1px solid rgba(255,255,255,0.08);border-radius:10px;">
    <line x1="16" y1="${zeroY}" x2="${W - 16}" y2="${zeroY}" stroke="rgba(255,255,255,0.18)" stroke-dasharray="4 4" />
    ${rects}
  </svg>`;
}

export function renderPolyWhaleHtml(whale: AuditedWhaleRecord): string {
  const r = whale.report;
  const shortAddr = `${whale.address.slice(0, 6)}...${whale.address.slice(-4)}`;
  const title = `${whale.displayName} (${shortAddr}) Polymarket Copyability Grade ${whale.copyabilityGrade} | NullClear`;
  const desc = `Reported PnL ${formatSignedUsd(r.naivePnlUsd)} vs Net Copier PnL ${formatSignedUsd(r.scenarios.slip10.simulatedCopierPnlUsd)} after 2026 taker fees & 1.0¢ fill delay (${r.scenarios.slip10.dragPctOfVolume}% Copy-Tax drag).`;
  const url = `https://nullclear.com/whale/${whale.address}`;

  const redFlagsHtml =
    r.redFlags.length === 0
      ? `<div class="card-muted" style="border-color:var(--emerald-border);color:#A7F3D0;font-size:13.5px;">
           ✓ No structural Copy-Tax red flags detected. Category mix and fill depth support disciplined non-custodial copying.
         </div>`
      : r.redFlags
          .map(
            (rf) => `<div class="card-muted" style="border-color:${rf.severity === "HIGH" ? "var(--rose-border)" : "var(--amber-border)"};margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
                <strong style="font-size:13.5px;color:${rf.severity === "HIGH" ? "var(--rose)" : "var(--amber)"};">⚠ ${escapeHtml(rf.title)}</strong>
                <span class="pill ${rf.severity === "HIGH" ? "pill-danger" : "pill-warn"}">${escapeHtml(rf.severity)}</span>
              </div>
              <div style="font-size:12.5px;color:var(--muted);">${escapeHtml(rf.detail)}</div>
            </div>`
          )
          .join("");

  const catRows = r.categoryBreakdown
    .map(
      (c) => `<tr>
        <td class="mono" style="font-weight:700;text-transform:capitalize;">${escapeHtml(c.category)}</td>
        <td class="mono" style="color:${c.feeRate === 0 ? "var(--emerald)" : c.feeRate >= 0.07 ? "var(--rose)" : "var(--muted)"};">${(c.feeRate * 100).toFixed(1)}%</td>
        <td class="mono">${c.tradeCount}</td>
        <td class="mono">$${c.volumeUsd.toLocaleString()}</td>
        <td class="mono">${c.shareOfVolumePct.toFixed(1)}%</td>
        <td class="mono" style="color:var(--amber);">$${c.estimatedFeeDragUsd.toLocaleString()}</td>
      </tr>`
    )
    .join("");

  const tradeRows = r.recentTrades
    .slice(0, 20)
    .map(
      (t) => `<tr>
        <td style="max-width:300px;font-weight:500;">${escapeHtml(t.marketTitle)}</td>
        <td class="mono" style="text-transform:capitalize;">${escapeHtml(t.category)}</td>
        <td class="mono" style="color:${t.side === "BUY" ? "var(--emerald)" : "var(--rose)"};font-weight:700;">${escapeHtml(t.side)}</td>
        <td class="mono">${(t.price * 100).toFixed(2)}¢</td>
        <td class="mono">$${t.notionalUsd.toLocaleString()}</td>
        <td>
          <a href="/terminal?copy=${encodeURIComponent(whale.address)}&asset=${encodeURIComponent(t.assetId)}&title=${encodeURIComponent(t.marketTitle)}&category=${encodeURIComponent(t.category)}&price=${encodeURIComponent(String(t.price))}" class="btn btn-secondary btn-sm">
            Paper Copy
          </a>
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(desc)}" />
  <link rel="canonical" href="${escapeHtml(url)}" />
  ${POLY_FONTS_HEAD}
  <style>
    ${POLY_SHELL_CSS}
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 20px; }
    .split-2 { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 20px; margin-top: 20px; }
    @media (max-width: 860px) {
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .split-2 { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${renderPolyHeader("whale")}

  <main class="container" style="padding-top:32px;">
    <!-- Top Grade Header -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div class="${gradeClass(whale.copyabilityGrade)}" style="width:58px;height:58px;font-size:28px;border-radius:12px;">
            ${escapeHtml(whale.copyabilityGrade)}
          </div>
          <div>
            <div class="eyebrow">WHALE REALITY &amp; COPYABILITY AUDIT &middot; SCORE ${whale.copyabilityScore}/100</div>
            <h1 style="font-size:24px;font-weight:800;margin-top:3px;">${escapeHtml(whale.displayName)}</h1>
            <div class="mono" style="font-size:12px;color:var(--muted);word-break:break-all;">${escapeHtml(whale.address)}</div>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a href="/terminal?copy=${encodeURIComponent(whale.address)}&mode=paper" class="btn btn-primary">
            Launch Guarded Paper Copy (Free)
          </a>
          <a href="/terminal?copy=${encodeURIComponent(whale.address)}&mode=live" class="btn btn-secondary">
            Enable Guarded Live Copy
          </a>
        </div>
      </div>

      <p style="margin-top:16px;font-size:14px;color:var(--text);background:var(--surface-2);padding:13px 16px;border-radius:8px;border:1px solid var(--border);">
        <strong>Verdict:</strong> ${escapeHtml(r.gradeSummary)}
      </p>

      <div class="kpi-grid">
        <div class="card-muted">
          <div class="mono" style="font-size:11px;color:var(--dim);">REPORTED / NAIVE PNL</div>
          <div class="mono" style="font-size:22px;font-weight:800;margin-top:4px;">${escapeHtml(formatSignedUsd(r.naivePnlUsd))}</div>
          <div class="mono" style="font-size:11.5px;color:var(--muted);">Before 2026 copy-tax</div>
        </div>
        <div class="card-muted">
          <div class="mono" style="font-size:11px;color:var(--dim);">NET COPIER PNL (1.0¢ SLIP)</div>
          <div class="mono" style="font-size:22px;font-weight:800;margin-top:4px;color:${r.scenarios.slip10.simulatedCopierPnlUsd >= 0 ? "var(--emerald)" : "var(--rose)"};">
            ${escapeHtml(formatSignedUsd(r.scenarios.slip10.simulatedCopierPnlUsd))}
          </div>
          <div class="mono" style="font-size:11.5px;color:var(--muted);">Drag: ${r.scenarios.slip10.dragPctOfVolume}% of vol</div>
        </div>
        <div class="card-muted">
          <div class="mono" style="font-size:11px;color:var(--dim);">MAKER GUARDED PNL (0% FEE)</div>
          <div class="mono" style="font-size:22px;font-weight:800;margin-top:4px;color:var(--emerald);">
            ${escapeHtml(formatSignedUsd(r.makerSimulatedPnlUsd))}
          </div>
          <div class="mono" style="font-size:11.5px;color:var(--muted);">postOnly limit strategy</div>
        </div>
        <div class="card-muted">
          <div class="mono" style="font-size:11px;color:var(--dim);">AUDITED VOLUME / AVG ENTRY</div>
          <div class="mono" style="font-size:22px;font-weight:800;margin-top:4px;">$${r.totalVolumeUsd.toLocaleString()}</div>
          <div class="mono" style="font-size:11.5px;color:var(--muted);">${r.tradeCount} fills &middot; avg ${(r.avgEntryPrice * 100).toFixed(1)}¢</div>
        </div>
      </div>

      <!-- Inline Email Watchlist Capture -->
      <form id="whaleLeadForm" onsubmit="event.preventDefault(); watchWhaleByEmail();" style="margin-top:16px;padding:14px 16px;border-radius:10px;background:var(--surface-2);border:1px solid var(--emerald-border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="font-size:13px;">
          <strong style="color:var(--emerald);">Track this whale by email:</strong>
          Get notified when <span class="mono">${escapeHtml(shortAddr)}</span> trades with live Copy-Tax verdicts (or route to your own Discord/JSON webhook in <a href="/terminal#byo-webhook" style="color:var(--cyan);text-decoration:underline;">Terminal</a>).
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input id="whaleLeadEmail" class="input" style="width:230px;padding:8px 11px;" type="email" placeholder="you@domain.com" required />
          <button type="submit" class="btn btn-primary btn-sm">Watch Whale</button>
        </div>
        <div id="whaleLeadMsg" class="mono" style="width:100%;font-size:11.5px;color:var(--emerald);"></div>
      </form>
    </div>

    <!-- Chart + Red Flags -->
    <div class="split-2">
      <div class="card">
        <div class="eyebrow">PNL REALITY CHECK (NAIVE VS. SIMULATED COPIER)</div>
        <h2 style="font-size:17px;font-weight:700;margin:6px 0 12px;">2026 Fee + Fill Delay Erosion</h2>
        ${renderPnlComparisonSvg(whale)}
        <div class="mono" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;font-size:11.5px;color:var(--muted);">
          <div>0.5¢ Slip Drag: <strong>$${r.scenarios.slip05.totalDragUsd.toLocaleString()}</strong></div>
          <div>1.0¢ Slip Drag: <strong>$${r.scenarios.slip10.totalDragUsd.toLocaleString()}</strong></div>
          <div>2.0¢ Slip Drag: <strong>$${r.scenarios.slip20.totalDragUsd.toLocaleString()}</strong></div>
        </div>
      </div>

      <div class="card">
        <div class="eyebrow">AUTOMATED RISK &amp; FEE-DRAG FLAGS</div>
        <h2 style="font-size:17px;font-weight:700;margin:6px 0 12px;">Copyability Diagnostics</h2>
        ${redFlagsHtml}
        <div class="mono" style="font-size:11.5px;color:var(--dim);margin-top:12px;">
          Crypto Share: ${r.cryptoSharePct}% &middot; Geopolitics (0% fee): ${r.geopoliticsSharePct}% &middot; Peak-Fee Zone: ${r.peakFeeZoneSharePct}%
        </div>
      </div>
    </div>

    <!-- Category Breakdown -->
    <div class="card" style="margin-top:20px;">
      <div class="eyebrow">CATEGORY FEE-DRAG BREAKDOWN</div>
      <h2 style="font-size:17px;font-weight:700;margin:6px 0 12px;">2026 Polymarket Fee Exposure by Category</h2>
      <div class="table-wrap">
        <table class="poly-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>2026 feeRate</th>
              <th>Trades</th>
              <th>Volume</th>
              <th>Share</th>
              <th>Est. Taker Fee Drag</th>
            </tr>
          </thead>
          <tbody>
            ${catRows || '<tr><td colspan="6" style="color:var(--muted);">No recent fills found on Polymarket Data API v2.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Recent Trades -->
    <div class="card" style="margin-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
        <div>
          <div class="eyebrow">DATA API V2 FILLS</div>
          <h2 style="font-size:17px;font-weight:700;margin-top:4px;">Recent Audited Trades</h2>
        </div>
        <a href="/whale/${escapeHtml(whale.address)}?refresh=true" class="btn btn-secondary btn-sm mono">↻ Refresh Live Data</a>
      </div>
      <div class="table-wrap">
        <table class="poly-table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Category</th>
              <th>Side</th>
              <th>Fill Price</th>
              <th>Notional</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${tradeRows || '<tr><td colspan="6" style="color:var(--muted);">No recent trades available.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </main>

  ${renderPolyFooter()}

  <script>
    async function watchWhaleByEmail() {
      const email = document.getElementById('whaleLeadEmail').value.trim();
      const msg = document.getElementById('whaleLeadMsg');
      msg.textContent = 'Saving whale watchlist...';
      try {
        const res = await fetch('/api/poly/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            watchedWhales: ['${escapeHtml(whale.address)}'],
            source: 'whale_page'
          })
        });
        const data = await res.json();
        msg.textContent = data.success
          ? '✓ Watching ' + data.lead.watchedWhales.length + ' whale(s) for ' + data.lead.email + '. Check /live anytime.'
          : (data.error || 'Could not save subscription');
      } catch (e) {
        msg.textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
}

import type { PaymentDiagnosticsReport } from "../env.js";
import { DEV_FONTS_HEAD, DEV_SHELL_CSS, escapeHtml, renderDevFooter, renderDevHeader } from "./dev-shell.js";

function formatRelativeTime(ts: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ${diffHr % 24}h ago`;
}

export function renderDevHistoryHtml(report: PaymentDiagnosticsReport): string {
  const now = report.generatedAt || Date.now();
  const c24 = report.counters24h;
  const c7d = report.counters7d;
  const qm = report.quotaMeters;
  const ls = report.ledgerSummary;
  const filter = report.filterApplied || "real_agents";

  const reasonCardsHtml = report.executiveDiagnosis.reasonsWhyNotPaying
    .map((r) => {
      const sevTag =
        r.severity === "PRIMARY"
          ? `<span class="status-tag tag-warn">PRIMARY ROOT CAUSE</span>`
          : r.severity === "SECONDARY"
            ? `<span class="status-tag tag-info">SECONDARY FRICTION</span>`
            : `<span class="status-tag tag-neutral">FUNNEL DIAGNOSTIC</span>`;
      return `<div class="diag-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
          ${sevTag}
          <span class="mono" style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(r.metricValue)}</span>
        </div>
        <div style="font-size:14.5px;font-weight:600;color:var(--text);margin-bottom:6px;">${escapeHtml(r.title)}</div>
        <p class="muted" style="font-size:13px;line-height:1.55;">${escapeHtml(r.explanation)}</p>
      </div>`;
    })
    .join("");

  const renderBadgeClass = (paymentTier: string, status: number) => {
    if (paymentTier === "x402-paid" || paymentTier === "prepaid-pass") return "tag-safe";
    if (status === 200) return "tag-info";
    if (paymentTier === "indexer-402-probe") return "tag-neutral";
    if (paymentTier === "free-tier-exhausted") return "tag-danger";
    if (status === 402) return "tag-warn";
    return "tag-neutral";
  };

  const eventRowsHtml =
    report.events.length > 0
      ? report.events
          .map((ev) => {
            const iso = new Date(ev.timestamp).toISOString().replace("T", " ").slice(0, 19);
            const rel = formatRelativeTime(ev.timestamp, now);
            const badgeCls = renderBadgeClass(ev.paymentTier, ev.status);
            const statusColor =
              ev.status === 200
                ? "var(--safe)"
                : ev.status === 402
                  ? "var(--warn)"
                  : "var(--danger)";
            const uaShort = ev.userAgent ? ev.userAgent.slice(0, 48) : "no-ua";
            return `<tr>
              <td class="mono" style="white-space:nowrap;">
                <div style="font-weight:600;color:var(--text);font-size:12px;">${escapeHtml(rel)}</div>
                <div style="font-size:11px;color:var(--dim);">${escapeHtml(iso)} UTC</div>
              </td>
              <td>
                <div class="mono" style="font-size:10.5px;color:var(--dim);text-transform:uppercase;">${escapeHtml(ev.productCategory)}</div>
                <div class="mono" style="font-weight:600;color:var(--text);font-size:12.5px;">${escapeHtml(ev.productName)}</div>
              </td>
              <td class="mono" style="font-size:12px;color:var(--muted);max-width:220px;word-break:break-all;">
                ${escapeHtml(ev.targetSubject)}
              </td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <span class="status-tag tag-neutral">${escapeHtml(ev.actorType)}</span>
                  ${ev.country && ev.country !== "XX" ? `<span class="mono" style="font-size:11px;color:var(--muted);">${escapeHtml(ev.country)}</span>` : ""}
                  ${ev.clientId ? `<span class="mono" style="font-size:11px;color:var(--text);">${escapeHtml(ev.clientId)}</span>` : ""}
                </div>
                <div class="mono" style="font-size:11px;color:var(--dim);margin-top:3px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(ev.userAgent || "")}">
                  ${escapeHtml(uaShort)}
                </div>
              </td>
              <td class="mono" style="white-space:nowrap;">
                <span style="color:${statusColor};font-weight:600;">HTTP ${ev.status}</span>
                ${ev.latencyMs ? `<div style="font-size:11px;color:var(--dim);">${ev.latencyMs}ms</div>` : ""}
              </td>
              <td>
                <span class="status-tag ${badgeCls}">${escapeHtml(ev.paymentBadge)}</span>
              </td>
              <td style="font-size:12.5px;color:var(--muted);min-width:240px;line-height:1.45;">
                ${escapeHtml(ev.diagnosticReason)}
              </td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--muted);">No events match the selected filter. Select &ldquo;All Product Hits&rdquo; or &ldquo;Raw Traffic Stream&rdquo; above.</td></tr>`;

  const quotaRowsHtml =
    qm.recentCallers.length > 0
      ? qm.recentCallers
          .slice(0, 15)
          .map((c) => {
            const pct = Math.min(100, Math.round((c.callCount / c.dailyLimit) * 100));
            const barColor = c.hitPaywall ? "var(--danger)" : c.callCount >= 7 ? "var(--warn)" : "var(--safe)";
            return `<tr>
              <td class="mono" style="color:var(--text);font-weight:600;font-size:12px;">${escapeHtml(c.clientKeyMasked)}</td>
              <td class="mono" style="font-size:11.5px;color:var(--muted);">${escapeHtml(c.bucketType)}</td>
              <td class="mono" style="font-size:12px;">${escapeHtml(c.usageDate)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden;min-width:70px;">
                    <div style="width:${pct}%;height:100%;background:${barColor};"></div>
                  </div>
                  <span class="mono" style="font-weight:600;font-size:12px;">${c.callCount}/${c.dailyLimit}</span>
                </div>
              </td>
              <td>
                ${
                  c.hitPaywall
                    ? `<span class="status-tag tag-danger">HIT 402 PAYWALL</span>`
                    : `<span class="status-tag tag-info">${c.remaining} FREE LEFT</span>`
                }
              </td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" style="color:var(--dim);">No free-tier caller meters recorded yet</td></tr>`;

  const productMatrixHtml =
    report.productBreakdown.length > 0
      ? report.productBreakdown
          .slice(0, 15)
          .map(
            (p) => `<tr>
              <td>
                <div class="mono" style="font-size:10.5px;color:var(--dim);text-transform:uppercase;">${escapeHtml(p.productCategory)}</div>
                <div class="mono" style="font-weight:600;font-size:12.5px;color:var(--text);">${escapeHtml(p.productName)}</div>
              </td>
              <td class="mono">${p.calls24h.toLocaleString()}</td>
              <td class="mono" style="font-weight:600;">${p.calls7d.toLocaleString()}</td>
              <td class="mono" style="color:var(--safe);">${p.ok200Count.toLocaleString()}</td>
              <td class="mono" style="color:var(--warn);">${p.paywall402RealAgentCount.toLocaleString()}</td>
              <td class="mono" style="color:var(--muted);">${p.paywall402IndexerCount.toLocaleString()}</td>
              <td class="mono" style="color:var(--danger);">${p.error400Count.toLocaleString()}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="7" style="color:var(--dim);">No product executions recorded yet</td></tr>`;

  const clearingsHtml =
    ls.recentClearings.length > 0
      ? ls.recentClearings
          .slice(0, 10)
          .map((cl) => {
            const usdc = (Number(cl.amount || "0") / 1_000_000).toFixed(4);
            const iso = new Date(cl.createdAt).toISOString().replace("T", " ").slice(0, 19);
            const ok = cl.status === "PASSED";
            return `<tr>
              <td class="mono" style="font-size:11.5px;color:var(--muted);">${escapeHtml(iso)}</td>
              <td><span class="status-tag ${ok ? "tag-safe" : "tag-neutral"}">${escapeHtml(cl.status)}</span></td>
              <td class="mono" style="color:var(--safe);font-weight:600;">$${usdc} USDC</td>
              <td class="mono" style="font-size:12px;color:var(--text);">${escapeHtml((cl.buyerAddress || "").slice(0, 10))}...${escapeHtml((cl.buyerAddress || "").slice(-6))}</td>
              <td class="mono" style="font-size:12px;color:var(--muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cl.targetAddress ? `${cl.targetChain || "base"}:${cl.targetAddress}` : cl.targetUrl)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" style="color:var(--dim);">No clearings recorded yet</td></tr>`;

  const dailySeries = Array.isArray(report.dailySeries) ? report.dailySeries.slice(-14) : [];
  const maxDailyUses = Math.max(10, ...dailySeries.map((d) => d.totalRealProductUses || 0));
  const todayPoint = dailySeries.length > 0 ? dailySeries[dailySeries.length - 1] : null;
  const yesterdayPoint = dailySeries.length > 1 ? dailySeries[dailySeries.length - 2] : null;
  const todayRealCount = todayPoint ? todayPoint.totalRealProductUses : c24.realProductUses;
  const yesterdayRealCount = yesterdayPoint ? yesterdayPoint.totalRealProductUses : 0;

  const dailyBarsHtml =
    dailySeries.length > 0
      ? dailySeries
          .map((d) => {
            const total = d.totalRealProductUses || 0;
            const totalHeightPct = Math.max(total > 0 ? 6 : 1, Math.round((total / maxDailyUses) * 100));
            const ffH = total > 0 ? Math.round((d.forensicsAndFirewall / total) * 100) : 0;
            const mcpH = total > 0 ? Math.round((d.mcpToolCalls / total) * 100) : 0;
            const bzH = total > 0 ? Math.round((d.bazaarAndEscrow / total) * 100) : 0;
            const scH = Math.max(0, 100 - ffH - mcpH - bzH);
            const shortDate = d.date.slice(5);
            const tooltip = `${d.date}: ${total} Real Product Uses (Forensics/Firewall: ${d.forensicsAndFirewall}, MCP tools/call: ${d.mcpToolCalls}, Bazaar/Escrow: ${d.bazaarAndEscrow}, Scorecards: ${d.webAndMarkdownScorecards}) · ${d.uniqueFreeTierCallers} Unique Free-Tier Agents · ${d.unpaid402Challenges} 402 Probes Excluded`;
            return `<div class="day-col" title="${escapeHtml(tooltip)}">
              <div class="day-val mono">${total.toLocaleString()}</div>
              <div class="day-bar-track">
                <div class="day-bar-stack" style="height:${totalHeightPct}%;">
                  ${d.webAndMarkdownScorecards > 0 ? `<div style="height:${scH}%;background:#F59E0B;" title="Web/MD Scorecards: ${d.webAndMarkdownScorecards}"></div>` : ""}
                  ${d.bazaarAndEscrow > 0 ? `<div style="height:${bzH}%;background:#A1A1AA;" title="Bazaar/Escrow/Reputation: ${d.bazaarAndEscrow}"></div>` : ""}
                  ${d.mcpToolCalls > 0 ? `<div style="height:${mcpH}%;background:#38BDF8;" title="MCP tools/call: ${d.mcpToolCalls}"></div>` : ""}
                  ${d.forensicsAndFirewall > 0 ? `<div style="height:${ffH}%;background:#10B981;" title="Forensics & Firewall API: ${d.forensicsAndFirewall}"></div>` : ""}
                </div>
              </div>
              <div class="day-label mono">${escapeHtml(shortDate)}</div>
              <div class="day-sub mono">${d.uniqueFreeTierCallers > 0 ? `${d.uniqueFreeTierCallers} ag` : "—"}</div>
            </div>`;
          })
          .join("")
      : `<div style="color:var(--dim);padding:24px;">No daily series data yet</div>`;

  const dailyTableRowsHtml =
    dailySeries.length > 0
      ? [...dailySeries]
          .reverse()
          .slice(0, 14)
          .map(
            (d) => `<tr>
              <td class="mono" style="font-weight:600;color:var(--text);">${escapeHtml(d.date)}</td>
              <td class="mono" style="font-weight:700;color:var(--safe);">${d.totalRealProductUses.toLocaleString()}</td>
              <td class="mono" style="color:var(--safe);">${d.forensicsAndFirewall.toLocaleString()}</td>
              <td class="mono" style="color:var(--info);">${d.mcpToolCalls.toLocaleString()}</td>
              <td class="mono" style="color:var(--muted);">${d.bazaarAndEscrow.toLocaleString()}</td>
              <td class="mono" style="color:var(--warn);">${d.webAndMarkdownScorecards.toLocaleString()}</td>
              <td class="mono">${d.uniqueFreeTierCallers}</td>
              <td class="mono" style="color:var(--dim);">${d.unpaid402Challenges.toLocaleString()} <span style="font-size:10.5px;">(excluded)</span></td>
            </tr>`
          )
          .join("")
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear Telemetry &amp; Clearing Explorer — Live Product History | nullclear.dev</title>
  <meta name="description" content="Real-time verification and clearing explorer for autonomous agent product invocations, free-tier quota meters, and x402 payment telemetry." />
  ${DEV_FONTS_HEAD}
  <style>
    ${DEV_SHELL_CSS}

    .page-head {
      padding: 40px 0 28px;
      border-bottom: 1px solid var(--border);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
      margin: 24px 0;
    }
    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .kpi-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--dim);
      font-weight: 500;
    }
    .kpi-val {
      font-size: 24px;
      font-weight: 700;
      margin-top: 6px;
      letter-spacing: -0.02em;
    }
    .kpi-sub {
      font-size: 11.5px;
      color: var(--muted);
      margin-top: 4px;
      line-height: 1.4;
    }
    .diag-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 14px;
      margin-top: 16px;
    }
    .diag-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
    }
    .filter-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 14px;
    }
    .filter-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
    }
    .pill-btn {
      cursor: pointer;
      padding: 6px 11px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      transition: all 0.15s;
    }
    .pill-btn:hover { color: var(--text); border-color: var(--border-hover); }
    .pill-btn.active {
      color: var(--bg);
      background: var(--text);
      border-color: var(--text);
      font-weight: 600;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 20px;
    }
    .daily-chart-wrap {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
      gap: 10px;
      align-items: end;
      padding: 18px 14px 12px;
      background: #060608;
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-top: 14px;
    }
    .day-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }
    .day-val { font-size: 11px; font-weight: 600; color: var(--text); }
    .day-bar-track {
      width: 100%;
      max-width: 34px;
      height: 140px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 4px;
      display: flex;
      align-items: flex-end;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .day-bar-stack {
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      transition: height 0.25s ease;
    }
    .day-label { font-size: 10.5px; font-weight: 600; color: var(--muted); }
    .day-sub { font-size: 10px; color: var(--dim); }
    .legend-row {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      font-size: 12px;
      color: var(--muted);
    }
    .legend-dot {
      width: 9px;
      height: 9px;
      border-radius: 2px;
      display: inline-block;
      margin-right: 5px;
      vertical-align: middle;
    }
    @media (max-width: 1120px) {
      .kpi-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 860px) {
      .grid-2 { grid-template-columns: 1fr; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 520px) {
      .kpi-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${renderDevHeader("history", true)}

  <main class="container-wide">
    <!-- Explorer Header -->
    <section class="page-head">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div>
          <div class="eyebrow">REAL-TIME VERIFICATION &amp; CLEARING EXPLORER &middot; D1 TELEMETRY</div>
          <h1 class="h2" style="margin-top:8px;">NullClear Attribution & Conversion Funnel &mdash; Live Product History</h1>
          <p id="execHeadline" class="muted" style="font-size:14px;margin-top:8px;max-width:880px;line-height:1.55;">
            ${escapeHtml(report.executiveDiagnosis.headline)}
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button type="button" id="toggleLiveBtn" class="btn btn-secondary btn-sm" onclick="toggleAutoPoll()">Pause Live (15s)</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="fetchLiveHistory()">Refresh</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="triggerLiveTestScan(this)">Run Test Scan</button>
          <a href="/v1/telemetry/history" target="_blank" class="btn btn-secondary btn-sm mono">JSON API &#8599;</a>
        </div>
      </div>
    </section>

    <!-- 6 High-Signal KPIs -->
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Real Product Uses (7d)</div>
        <div id="kpiProductUses" class="kpi-val mono" style="color:var(--safe);">${c7d.realProductUses.toLocaleString()}</div>
        <div id="kpiProductUsesSub" class="kpi-sub">${todayRealCount.toLocaleString()} today &middot; ${yesterdayRealCount.toLocaleString()} yesterday (${c24.realProductUses.toLocaleString()} in 24h)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">API/MCP vs Scorecards</div>
        <div id="kpiFree200" class="kpi-val mono">${c7d.executedFreeTier200.toLocaleString()} <span style="font-size:13px;color:var(--dim);">/ ${c7d.publicScorecardReads.toLocaleString()}</span></div>
        <div id="kpiFree200Sub" class="kpi-sub">${c7d.mcpToolCalls.toLocaleString()} MCP tools/call in 7d (${c24.mcpToolCalls.toLocaleString()} in 24h)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Active Free Agents Today</div>
        <div id="kpiActiveToday" class="kpi-val mono">${qm.activeCallersToday}</div>
        <div id="kpiActiveTodaySub" class="kpi-sub">Avg ${qm.avgCallsPerCallerToday}/10 calls &middot; Peak ${qm.maxCallsBySingleCallerToday}/10</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Hitting 10-Call Paywall</div>
        <div id="kpiHitLimit" class="kpi-val mono" style="color:${qm.callersHittingPaywallToday > 0 ? "var(--danger)" : "var(--text)"};">${qm.callersHittingPaywallToday} <span style="font-size:13px;color:var(--dim);">today</span></div>
        <div id="kpiHitLimitSub" class="kpi-sub">${qm.callersHittingPaywall7d} callers hit &ge;10/day in 7d</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Excluded 402 Probes</div>
        <div id="kpi402Split" class="kpi-val mono">${c7d.indexerBot402Probes.toLocaleString()} <span style="font-size:13px;color:var(--dim);">/ ${(c7d.realAgentUnpaid402 + c7d.freeTierExhausted402).toLocaleString()}</span></div>
        <div id="kpi402SplitSub" class="kpi-sub">Directory bots vs. unfunded agent 402s</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Settled x402 &amp; Passes</div>
        <div id="kpiSettled" class="kpi-val mono" style="color:var(--safe);">${ls.totalPassedClearings} <span style="font-size:13px;color:var(--dim);">txs</span></div>
        <div id="kpiSettledSub" class="kpi-sub">$${ls.totalClearedVolumeUsdc} USDC &middot; ${ls.activePrepaidPasses} Passes (${ls.totalPassCreditsRemaining.toLocaleString()} cr)</div>
      </div>
    </section>

    <!-- Day-by-Day Real Product Usage Chart (14 Days) -->
    <section class="card" style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 class="h3">Day-by-Day Real Executed Product Usage (14 Days, UTC)</h2>
          <p class="muted" style="font-size:13px;margin-top:2px;">
            Counts completed <code>HTTP 200</code> product executions, excluding automated 402 uptime probes and 400 bad-param probes.
          </p>
        </div>
        <div class="legend-row">
          <span><span class="legend-dot" style="background:#10B981;"></span>Forensics &amp; Firewall</span>
          <span><span class="legend-dot" style="background:#38BDF8;"></span>MCP Tool Calls</span>
          <span><span class="legend-dot" style="background:#A1A1AA;"></span>Bazaar &amp; Escrow</span>
          <span><span class="legend-dot" style="background:#F59E0B;"></span>Scorecards</span>
        </div>
      </div>

      <div id="dailyChartBars" class="daily-chart-wrap">
        ${dailyBarsHtml}
      </div>

      <details style="margin-top:14px;">
        <summary class="mono" style="cursor:pointer;font-size:12px;color:var(--muted);">
          View 14-day breakdown table
        </summary>
        <div class="table-wrap" style="margin-top:10px;">
          <table class="dev-table">
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>Real Uses (200)</th>
                <th>Forensics &amp; Firewall</th>
                <th>MCP tools/call</th>
                <th>Bazaar &amp; Escrow</th>
                <th>Scorecards</th>
                <th>Unique Agents</th>
                <th>402 Probes (Excl.)</th>
              </tr>
            </thead>
            <tbody id="dailyTableTbody">
              ${dailyTableRowsHtml}
            </tbody>
          </table>
        </div>
      </details>
    </section>

    <!-- Real-Time Product Usage History Feed -->
    <section class="card" style="margin-bottom:20px;">
      <div class="filter-bar">
        <div>
          <h2 class="h3">Real-Time Verification &amp; Product Stream</h2>
          <p class="muted" style="font-size:13px;margin-top:2px;">Live invocations with caller fingerprint, target parameters, latency, and billing tier.</p>
        </div>
        <input
          type="text"
          id="historySearchInput"
          class="input"
          style="min-width:260px;"
          placeholder="Filter by tool, 0x address, chain, UA..."
          oninput="debouncedFetchHistory()"
        />
      </div>

      <div class="filter-pills">
        <button type="button" class="pill-btn ${filter === "real_agents" ? "active" : ""}" data-filter="real_agents" onclick="setHistoryFilter('real_agents')">Real Agent Executions</button>
        <button type="button" class="pill-btn ${filter === "executed_200" ? "active" : ""}" data-filter="executed_200" onclick="setHistoryFilter('executed_200')">Executed 200 OK</button>
        <button type="button" class="pill-btn ${filter === "mcp_calls" ? "active" : ""}" data-filter="mcp_calls" onclick="setHistoryFilter('mcp_calls')">MCP Tool Calls</button>
        <button type="button" class="pill-btn ${filter === "paywall_402" ? "active" : ""}" data-filter="paywall_402" onclick="setHistoryFilter('paywall_402')">Real Agent 402 Paywalls</button>
        <button type="button" class="pill-btn ${filter === "product_all" ? "active" : ""}" data-filter="product_all" onclick="setHistoryFilter('product_all')">All Product Hits</button>
        <button type="button" class="pill-btn ${filter === "error_400" ? "active" : ""}" data-filter="error_400" onclick="setHistoryFilter('error_400')">400 Errors</button>
        <button type="button" class="pill-btn ${filter === "raw_all" ? "active" : ""}" data-filter="raw_all" onclick="setHistoryFilter('raw_all')">Raw Traffic Stream</button>
      </div>

      <div class="table-wrap">
        <table class="dev-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Product / Tool</th>
              <th>Target / Query</th>
              <th>Caller Identity</th>
              <th>Status</th>
              <th>Billing Tier</th>
              <th>Payment Diagnostic</th>
            </tr>
          </thead>
          <tbody id="historyEventsTbody">
            ${eventRowsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Per-Caller Daily Quota Meters & Product Matrix -->
    <div class="grid-2">
      <section class="card">
        <h3 class="h3">Per-Agent Daily Free-Tier Quota Meters</h3>
        <p class="muted" style="font-size:12.5px;margin:4px 0 14px;">Tracks each active agent&rsquo;s progress toward the 10-call/day free-tier limit.</p>
        <div class="table-wrap">
          <table class="dev-table">
            <thead>
              <tr>
                <th>Caller ID</th>
                <th>Bucket</th>
                <th>Date (UTC)</th>
                <th>Usage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="quotaMetersTbody">
              ${quotaRowsHtml}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h3 class="h3">Product Usage &amp; Outcome Matrix (7d)</h3>
        <p class="muted" style="font-size:12.5px;margin:4px 0 14px;">Separates 200 OK executions from real agent 402 challenges, indexer 402 probes, and 400 errors.</p>
        <div class="table-wrap">
          <table class="dev-table">
            <thead>
              <tr>
                <th>Product / Endpoint</th>
                <th>24h</th>
                <th>7d</th>
                <th>200</th>
                <th>Agent 402</th>
                <th>Bot 402</th>
                <th>400</th>
              </tr>
            </thead>
            <tbody id="productMatrixTbody">
              ${productMatrixHtml}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Conversion & Root-Cause Diagnostics -->
    <section class="card" style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 class="h3">Conversion Diagnostics: Why Callers Aren&rsquo;t Paying</h2>
          <p class="muted" style="font-size:13px;margin-top:2px;">Live attribution across D1 <code>traffic_events</code>, <code>free_tier_usage</code>, <code>clearings</code>, and <code>api_passes</code>.</p>
        </div>
        <span id="lastUpdatedLabel" class="mono dim" style="font-size:12px;">Updated just now</span>
      </div>
      <div id="reasonsContainer" class="diag-grid">
        ${reasonCardsHtml}
      </div>
    </section>

    <!-- Settled x402 Clearings Ledger -->
    <section class="card">
      <h3 class="h3">On-Chain x402 Clearing &amp; Escrow Ledger (<code>clearings</code>)</h3>
      <p class="muted" style="font-size:12.5px;margin:4px 0 14px;">Verified Base Mainnet EIP-3009 settlements and schema-escrow verifications.</p>
      <div class="table-wrap">
        <table class="dev-table">
          <thead>
            <tr>
              <th>Timestamp (UTC)</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Buyer Wallet</th>
              <th>Target Resource</th>
            </tr>
          </thead>
          <tbody id="clearingsTbody">
            ${clearingsHtml}
          </tbody>
        </table>
      </div>
    </section>
  </main>

  ${renderDevFooter(true)}

  <script>
    let currentFilter = ${JSON.stringify(filter)};
    let livePollTimer = null;
    let isLivePolling = true;
    let searchDebounceTimer = null;

    function esc(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function relTime(ts, now) {
      const d = Math.max(0, Math.floor((now - ts) / 1000));
      if (d < 60) return d + 's ago';
      const m = Math.floor(d / 60);
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ' + (m % 60) + 'm ago';
      return Math.floor(h / 24) + 'd ' + (h % 24) + 'h ago';
    }

    function badgeCls(tier, status) {
      if (tier === 'x402-paid' || tier === 'prepaid-pass') return 'tag-safe';
      if (status === 200) return 'tag-info';
      if (tier === 'indexer-402-probe') return 'tag-neutral';
      if (tier === 'free-tier-exhausted') return 'tag-danger';
      if (status === 402) return 'tag-warn';
      return 'tag-neutral';
    }

    function setHistoryFilter(f) {
      currentFilter = f;
      document.querySelectorAll('.filter-pills .pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === f);
      });
      fetchLiveHistory();
    }

    function debouncedFetchHistory() {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => fetchLiveHistory(), 280);
    }

    function toggleAutoPoll() {
      isLivePolling = !isLivePolling;
      const btn = document.getElementById('toggleLiveBtn');
      if (isLivePolling) {
        btn.textContent = 'Pause Live (15s)';
        fetchLiveHistory();
      } else {
        btn.textContent = 'Resume Live';
      }
    }

    async function triggerLiveTestScan(btn) {
      const orig = btn.textContent;
      btn.textContent = 'Running scan...';
      btn.disabled = true;
      try {
        await fetch('/v1/scan/base/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
        setTimeout(async () => {
          await fetchLiveHistory();
          btn.textContent = 'Logged';
          setTimeout(() => {
            btn.textContent = orig;
            btn.disabled = false;
          }, 1500);
        }, 350);
      } catch (e) {
        btn.textContent = orig;
        btn.disabled = false;
      }
    }

    async function fetchLiveHistory() {
      const search = (document.getElementById('historySearchInput')?.value || '').trim();
      const url = '/v1/telemetry/history?limit=120&filter=' + encodeURIComponent(currentFilter) +
        (search ? '&search=' + encodeURIComponent(search) : '');
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data || !data.success) return;

        const now = data.generatedAt || Date.now();
        const c24 = data.counters24h;
        const c7d = data.counters7d;
        const qm = data.quotaMeters;
        const ls = data.ledgerSummary;

        document.getElementById('execHeadline').textContent = data.executiveDiagnosis.headline;
        document.getElementById('lastUpdatedLabel').textContent = 'Live · Updated ' + new Date(now).toISOString().slice(11, 19) + ' UTC';

        const ds = Array.isArray(data.dailySeries) ? data.dailySeries.slice(-14) : [];
        const todayPt = ds.length > 0 ? ds[ds.length - 1] : null;
        const yestPt = ds.length > 1 ? ds[ds.length - 2] : null;
        const todayCnt = todayPt ? todayPt.totalRealProductUses : c24.realProductUses;
        const yestCnt = yestPt ? yestPt.totalRealProductUses : 0;

        document.getElementById('kpiProductUses').textContent = c7d.realProductUses.toLocaleString();
        document.getElementById('kpiProductUsesSub').textContent =
          todayCnt.toLocaleString() + ' today · ' + yestCnt.toLocaleString() + ' yesterday (' + c24.realProductUses.toLocaleString() + ' in 24h)';

        document.getElementById('kpiFree200').innerHTML =
          c7d.executedFreeTier200.toLocaleString() + ' <span style="font-size:13px;color:var(--dim);">/ ' +
          c7d.publicScorecardReads.toLocaleString() + '</span>';
        document.getElementById('kpiFree200Sub').textContent =
          c7d.mcpToolCalls.toLocaleString() + ' MCP tools/call in 7d (' + c24.mcpToolCalls.toLocaleString() + ' in 24h)';

        document.getElementById('kpiActiveToday').textContent = qm.activeCallersToday;
        document.getElementById('kpiActiveTodaySub').textContent = 'Avg ' + qm.avgCallsPerCallerToday + '/10 calls · Peak ' + qm.maxCallsBySingleCallerToday + '/10';

        document.getElementById('kpiHitLimit').innerHTML = qm.callersHittingPaywallToday + ' <span style="font-size:13px;color:var(--dim);">today</span>';
        document.getElementById('kpiHitLimitSub').textContent = qm.callersHittingPaywall7d + ' callers hit >=10/day in 7d';

        document.getElementById('kpi402Split').innerHTML =
          c7d.indexerBot402Probes.toLocaleString() + ' <span style="font-size:13px;color:var(--dim);">/ ' +
          (c7d.realAgentUnpaid402 + c7d.freeTierExhausted402).toLocaleString() + '</span>';

        document.getElementById('kpiSettled').innerHTML = ls.totalPassedClearings + ' <span style="font-size:13px;color:var(--dim);">txs</span>';
        document.getElementById('kpiSettledSub').textContent = '$' + ls.totalClearedVolumeUsdc + ' USDC · ' + ls.activePrepaidPasses + ' Passes (' + ls.totalPassCreditsRemaining.toLocaleString() + ' cr)';

        const tbody = document.getElementById('historyEventsTbody');
        if (Array.isArray(data.events) && data.events.length > 0) {
          tbody.innerHTML = data.events.map(ev => {
            const iso = new Date(ev.timestamp).toISOString().replace('T', ' ').slice(0, 19);
            const rel = relTime(ev.timestamp, now);
            const bCls = badgeCls(ev.paymentTier, ev.status);
            const sCol = ev.status === 200 ? 'var(--safe)' : ev.status === 402 ? 'var(--warn)' : 'var(--danger)';
            const uaShort = ev.userAgent ? ev.userAgent.slice(0, 48) : 'no-ua';
            return '<tr>' +
              '<td class="mono" style="white-space:nowrap;"><div style="font-weight:600;color:var(--text);font-size:12px;">' + esc(rel) + '</div><div style="font-size:11px;color:var(--dim);">' + esc(iso) + ' UTC</div></td>' +
              '<td><div class="mono" style="font-size:10.5px;color:var(--dim);text-transform:uppercase;">' + esc(ev.productCategory) + '</div><div class="mono" style="font-weight:600;color:var(--text);font-size:12.5px;">' + esc(ev.productName) + '</div></td>' +
              '<td class="mono" style="font-size:12px;color:var(--muted);max-width:220px;word-break:break-all;">' + esc(ev.targetSubject) + '</td>' +
              '<td><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span class="status-tag tag-neutral">' + esc(ev.actorType) + '</span>' +
              (ev.country && ev.country !== 'XX' ? '<span class="mono" style="font-size:11px;color:var(--muted);">' + esc(ev.country) + '</span>' : '') +
              (ev.clientId ? '<span class="mono" style="font-size:11px;color:var(--text);">' + esc(ev.clientId) + '</span>' : '') +
              '</div><div class="mono" style="font-size:11px;color:var(--dim);margin-top:3px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(ev.userAgent || '') + '">' + esc(uaShort) + '</div></td>' +
              '<td class="mono" style="white-space:nowrap;"><span style="color:' + sCol + ';font-weight:600;">HTTP ' + ev.status + '</span>' + (ev.latencyMs ? '<div style="font-size:11px;color:var(--dim);">' + ev.latencyMs + 'ms</div>' : '') + '</td>' +
              '<td><span class="status-tag ' + bCls + '">' + esc(ev.paymentBadge) + '</span></td>' +
              '<td style="font-size:12.5px;color:var(--muted);min-width:240px;line-height:1.45;">' + esc(ev.diagnosticReason) + '</td>' +
              '</tr>';
          }).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--muted);">No events match the selected filter.</td></tr>';
        }
      } catch {}
    }

    livePollTimer = setInterval(() => {
      if (isLivePolling && !document.hidden) fetchLiveHistory();
    }, 15000);
  </script>
</body>
</html>`;
}

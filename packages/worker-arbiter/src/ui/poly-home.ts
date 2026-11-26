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

export function renderPolyHomeHtml(seededWhales: AuditedWhaleRecord[]): string {
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FinancialProduct",
        name: "NullClear Policy-Guarded Polymarket Execution",
        url: "https://nullclear.com",
        description:
          "Audit any Polymarket whale's true PnL after 2026 taker fees and fill delay. Copy or automate trades with non-custodial EIP-712 spend caps, slippage locks, and zero withdrawal risk.",
        provider: {
          "@type": "Organization",
          name: "NullClear Organization",
          url: "https://nullclear.com",
          email: "ops@nullclear.dev",
          sameAs: ["https://nullclear.dev", "https://github.com/Nullclear-Protocol/nullclear"]
        }
      },
      {
        "@type": "SoftwareApplication",
        name: "NullClear Polymarket Copy-Tax Auditor & Guarded Terminal",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web, Polygon CLOB V2 (Chain 137, pUSD)"
      }
    ]
  });

  const whaleChips = seededWhales
    .slice(0, 5)
    .map(
      (w) => `
      <a href="/whale/${escapeHtml(w.address)}" class="whale-chip">
        <span class="${gradeClass(w.copyabilityGrade)}" style="width:28px;height:28px;font-size:13px;">${escapeHtml(w.copyabilityGrade)}</span>
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(w.displayName)}</div>
          <div class="mono" style="font-size:11px;color:${w.netCopierPnlUsd >= 0 ? "var(--emerald)" : "var(--rose)"};">
            Net Copier: ${escapeHtml(formatSignedUsd(w.netCopierPnlUsd))} &middot; ${escapeHtml(w.primaryCategory)}
          </div>
        </div>
      </a>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear — Stop Losing to Polymarket Copy-Tax &amp; Custodial Bot Hacks</title>
  <meta name="description" content="Audit any Polymarket whale's true PnL after 2026 taker fees and fill delay. Automate or copy trades with non-custodial EIP-712 spend caps, slippage locks, and zero withdrawal risk." />
  <meta property="og:title" content="Stop Losing to Polymarket Copy-Tax &amp; Custodial Bot Hacks | NullClear" />
  <meta property="og:description" content="Audit any whale's true PnL after 2026 taker fees and fill delay. Non-custodial EIP-712 spend caps, slippage locks, and zero withdrawal risk." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://nullclear.com/" />
  ${POLY_FONTS_HEAD}
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    ${POLY_SHELL_CSS}
    .hero { padding: 60px 0 46px; text-align: center; max-width: 880px; margin: 0 auto; }
    .hero h1 {
      font-size: clamp(32px, 5vw, 52px);
      font-weight: 800;
      letter-spacing: -0.035em;
      line-height: 1.08;
      margin-top: 14px;
    }
    .hero-sub {
      font-size: 16.5px;
      color: var(--muted);
      max-width: 700px;
      margin: 18px auto 0;
      line-height: 1.6;
    }
    .audit-bar {
      display: flex;
      gap: 10px;
      max-width: 680px;
      margin: 28px auto 0;
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      padding: 8px;
    }
    .audit-bar input {
      border: none;
      background: transparent;
      flex: 1;
      font-size: 14px;
    }
    .whale-chips {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
      gap: 10px;
      margin-top: 20px;
      text-align: left;
    }
    .whale-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      transition: border-color 0.15s, background 0.15s;
    }
    .whale-chip:hover { border-color: var(--emerald-border); background: var(--surface-2); }
    .value-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
      margin-top: 40px;
    }
    .tools-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
      margin-top: 22px;
    }
    @media (max-width: 860px) {
      .value-grid, .tools-grid { grid-template-columns: 1fr; }
      .audit-bar { flex-direction: column; }
    }
  </style>
</head>
<body>
  ${renderPolyHeader("home")}

  <main class="container">
    <section class="hero">
      <div class="eyebrow">NON-CUSTODIAL POLYMARKET CLOB V2 &middot; POLYGON pUSD &middot; ZERO PRIVATE KEY STORAGE</div>
      <h1>Stop Losing to Polymarket Copy-Tax &amp; Custodial Bot Hacks.</h1>
      <p class="hero-sub">
        Audit any whale's true PnL after 2026 taker fees and fill delay. Automate or copy trades with non-custodial EIP-712 spend caps, slippage locks, and zero withdrawal risk.
      </p>

      <form id="heroAuditForm" class="audit-bar" onsubmit="event.preventDefault(); goAuditWallet();">
        <input
          id="heroWalletInput"
          class="input"
          type="text"
          placeholder="Paste any Polymarket wallet address (0x...)"
          aria-label="Polymarket wallet address"
        />
        <button type="submit" class="btn btn-primary">Audit Whale Reality &rarr;</button>
      </form>
      <div id="heroErr" class="mono" style="color:var(--rose);font-size:12px;margin-top:8px;min-height:18px;"></div>

      <div style="margin-top:16px;">
        <div class="mono" style="font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:0.06em;">
          Or inspect 5 live pre-audited leaderboard whales:
        </div>
        <div class="whale-chips">
          ${whaleChips}
        </div>
      </div>

      <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:26px;">
        <a href="/terminal" class="btn btn-primary">Launch Paper Copy Terminal (Free)</a>
        <a href="/live" class="btn btn-secondary">Open Live Whale Feed</a>
        <a href="/calculator" class="btn btn-secondary">2026 Copy-Tax Calculator</a>
        <a href="/leaderboard" class="btn btn-secondary">Copyable Leaderboard</a>
      </div>
    </section>

    <!-- 3-Card Value Strip -->
    <section class="value-grid" aria-label="Core Security & Alpha Guarantees">
      <div class="card">
        <div class="pill pill-safe" style="margin-bottom:12px;">01 &middot; ZERO CUSTODY</div>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:8px;">Zero Custody / No Private Key Storage</h2>
        <p style="font-size:13.5px;color:var(--muted);">
          Never paste a seed phrase into a Telegram bot again. NullClear uses in-browser EIP-712 signing and Polymarket V2 Deposit Wallet (<span class="mono">POLY_1271</span>) scoped Session Keys &mdash; our servers can <strong>never withdraw your pUSD</strong>.
        </p>
      </div>
      <div class="card">
        <div class="pill pill-info" style="margin-bottom:12px;">02 &middot; 2026 FEE GUARD</div>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:8px;">Copy-Tax Circuit Breaker</h2>
        <p style="font-size:13.5px;color:var(--muted);">
          Computes live <span class="mono">shares &times; feeRate &times; p(1-p)</span> category taker drag + CLOB order book spread before every fill. Auto-aborts negative-EV chases or switches to 0%-fee <span class="mono">postOnly</span> Maker limits.
        </p>
      </div>
      <div class="card">
        <div class="pill pill-warn" style="margin-bottom:12px;">03 &middot; EIP-712 ENFORCED</div>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:8px;">Hard EIP-712 Spend &amp; Drawdown Locks</h2>
        <p style="font-size:13.5px;color:var(--muted);">
          Enforce per-trade caps, 24h spend ceilings, daily drawdown circuit breakers, and category allowlists at NullClear's Policy Co-Signer (<span class="mono">nullclear.dev</span>) &mdash; every allowed or blocked trade emits a verifiable public receipt.
        </p>
      </div>
    </section>

    <!-- Free High-Intent Funnel Strip -->
    <section style="margin-top:52px;">
      <div class="eyebrow">FREE POLYMARKET UTILITIES &middot; ZERO LOGIN</div>
      <h2 style="font-size:26px;font-weight:800;letter-spacing:-0.02em;margin-top:6px;">Start with Proof, Not Blind Trust</h2>
      <div class="tools-grid">
        <a href="/calculator" class="card" style="display:block;">
          <div class="mono" style="font-size:11px;color:var(--cyan);margin-bottom:8px;">TOOL 01 &middot; /calculator</div>
          <h3 style="font-size:17px;font-weight:700;margin-bottom:6px;">2026 Fee &amp; Copy-Tax Calculator</h3>
          <p style="font-size:13.5px;color:var(--muted);margin-bottom:12px;">
            Compare exact 2026 category taker fees (7.2% Crypto vs 0% Geopolitics), fill slippage, and Taker vs. Maker breakeven edge.
          </p>
          <span class="mono" style="font-size:12.5px;color:var(--emerald);font-weight:700;">Calculate Copy-Tax &rarr;</span>
        </a>
        <a href="/leaderboard" class="card" style="display:block;">
          <div class="mono" style="font-size:11px;color:var(--cyan);margin-bottom:8px;">TOOL 02 &middot; /leaderboard</div>
          <h3 style="font-size:17px;font-weight:700;margin-bottom:6px;">Copyable Whale Leaderboard</h3>
          <p style="font-size:13.5px;color:var(--muted);margin-bottom:12px;">
            Ranked by <strong>Net Copier PnL</strong> and Copyability Grade (A&ndash;F), exposing 5m/15m crypto scalpers whose headline PnL turns negative for copiers.
          </p>
          <span class="mono" style="font-size:12.5px;color:var(--emerald);font-weight:700;">View Ranked Whales &rarr;</span>
        </a>
        <a href="/terminal" class="card" style="display:block;">
          <div class="mono" style="font-size:11px;color:var(--cyan);margin-bottom:8px;">TOOL 03 &middot; /terminal</div>
          <h3 style="font-size:17px;font-weight:700;margin-bottom:6px;">Paper Mode &amp; Guarded Live Terminal</h3>
          <p style="font-size:13.5px;color:var(--muted);margin-bottom:12px;">
            Test your guardrails against live Polymarket CLOB V2 books with zero wallet setup. Upgrade to non-custodial live execution when ready.
          </p>
          <span class="mono" style="font-size:12.5px;color:var(--emerald);font-weight:700;">Launch Terminal &rarr;</span>
        </a>
      </div>
    </section>

    <!-- Live Feed & Email Alerts Strip -->
    <section class="card" style="margin-top:44px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px;border-color:var(--emerald-border);">
      <div style="max-width:620px;">
        <div class="eyebrow">LIVE WHALE FEED &amp; BYO WEBHOOKS</div>
        <h3 style="font-size:20px;font-weight:800;margin-top:4px;">Real-Time Polymarket Whale Feed &amp; Email Watchlist</h3>
        <p style="font-size:13.5px;color:var(--muted);margin-top:6px;">
          Our Cloudflare Edge cron checks live CLOB best asks on notable $1,500+ whale fills, posts <span class="mono" style="color:var(--emerald);">COPYABLE</span> vs. <span class="mono" style="color:var(--rose);">PASS</span> verdicts to <a href="/live" style="color:var(--cyan);text-decoration:underline;">/live</a>, and pushes JSON/Discord payloads to your own webhook.
        </p>
      </div>
      <form id="leadForm" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;" onsubmit="event.preventDefault(); submitLead();">
        <input id="leadEmail" class="input" style="width:240px;" type="email" placeholder="you@domain.com for whale digest" required />
        <button type="submit" class="btn btn-primary">Join Free Alerts</button>
        <div id="leadMsg" class="mono" style="width:100%;font-size:11.5px;color:var(--emerald);"></div>
      </form>
    </section>
  </main>

  ${renderPolyFooter()}

  <script>
    function goAuditWallet() {
      const val = (document.getElementById('heroWalletInput').value || '').trim();
      const err = document.getElementById('heroErr');
      if (!/^0x[a-fA-F0-9]{40}$/.test(val)) {
        err.textContent = 'Enter a valid 42-character Polygon/Polymarket 0x address.';
        return;
      }
      err.textContent = '';
      window.location.href = '/whale/' + val.toLowerCase();
    }
    async function submitLead() {
      const email = document.getElementById('leadEmail').value.trim();
      const msg = document.getElementById('leadMsg');
      msg.textContent = 'Saving...';
      try {
        const res = await fetch('/api/poly/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'home_alerts' })
        });
        const data = await res.json();
        msg.textContent = data.success ? '✓ Subscribed! Check /terminal to start Paper Mode.' : (data.error || 'Error');
      } catch (e) {
        msg.textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
}

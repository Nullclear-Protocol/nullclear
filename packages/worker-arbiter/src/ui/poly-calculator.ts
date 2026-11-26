import { POLYMARKET_2026_FEE_RATES } from "@nullclear/shared";
import {
  POLY_FONTS_HEAD,
  POLY_SHELL_CSS,
  renderPolyFooter,
  renderPolyHeader
} from "./poly-shell.js";

export function renderPolyCalculatorHtml(): string {
  const feeRatesJson = JSON.stringify(POLYMARKET_2026_FEE_RATES);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Polymarket 2026 Real Fee &amp; Copy-Tax Calculator | NullClear</title>
  <meta name="description" content="Calculate exact 2026 Polymarket category taker fees (shares * feeRate * p * (1-p)), fill-delay slippage, round-trip copy-tax, and Taker vs. postOnly Maker breakeven edge." />
  <meta property="og:title" content="Polymarket 2026 Real Fee &amp; Copy-Tax Calculator | NullClear" />
  <meta property="og:description" content="Interactive zero-login calculator comparing 2026 Polymarket Taker copy-tax vs. 0%-fee postOnly Maker guarded limits." />
  <meta property="og:url" content="https://nullclear.com/calculator" />
  ${POLY_FONTS_HEAD}
  <style>
    ${POLY_SHELL_CSS}
    .calc-grid { display: grid; grid-template-columns: 0.95fr 1.05fr; gap: 22px; margin-top: 24px; }
    .field { margin-bottom: 14px; }
    .field label { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
    .cmp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
    .metric-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
    .metric-row:last-child { border-bottom: none; }
    .big-num { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
    @media (max-width: 860px) {
      .calc-grid, .cmp-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${renderPolyHeader("calculator")}

  <main class="container" style="padding-top:36px;">
    <div class="eyebrow">FREE TOOL 01 &middot; 2026 CATEGORY FEE MATH &middot; ZERO LOGIN</div>
    <h1 style="font-size:clamp(26px,3.6vw,38px);font-weight:800;letter-spacing:-0.03em;margin-top:6px;">
      Polymarket Real Fee &amp; Copy-Tax Calculator
    </h1>
    <p style="color:var(--muted);max-width:760px;margin-top:8px;font-size:14.5px;">
      Exact late-2026 formula: <code class="mono" style="background:var(--surface-2);padding:2px 6px;border-radius:4px;">takerFeeUsd = shares &times; feeRate &times; price &times; (1 - price)</code>. Retail traders under $200,000 30-day weighted volume receive 0% taker rebates &mdash; maker <code class="mono" style="background:var(--surface-2);padding:2px 6px;border-radius:4px;">postOnly</code> limit orders pay <strong>$0.00</strong>.
    </p>

    <div class="calc-grid">
      <!-- Inputs -->
      <div class="card">
        <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;">Trade &amp; Copy Parameters</h2>

        <div class="field">
          <label for="catSelect"><span>Market Category (2026 feeRate)</span><span id="feeRateLabel" class="mono" style="color:var(--emerald);">7.2%</span></label>
          <select id="catSelect" class="select">
            <option value="crypto" selected>Crypto (7.2% feeRate — highest drag)</option>
            <option value="economics">Economics (5.0% feeRate)</option>
            <option value="culture">Culture (5.0% feeRate)</option>
            <option value="weather">Weather (5.0% feeRate)</option>
            <option value="other">Other (5.0% feeRate)</option>
            <option value="finance">Finance (4.0% feeRate)</option>
            <option value="politics">Politics (4.0% feeRate)</option>
            <option value="mentions">Mentions (4.0% feeRate)</option>
            <option value="tech">Tech (4.0% feeRate)</option>
            <option value="sports">Sports (3.0% feeRate)</option>
            <option value="geopolitics">Geopolitics (0.0% — FREE)</option>
          </select>
        </div>

        <div class="field">
          <label for="priceSlider"><span>Entry Probability ($0.01 &ndash; $0.99)</span><span id="priceLabel" class="mono" style="color:var(--cyan);">$0.50 (50.0¢)</span></label>
          <input id="priceSlider" type="range" min="0.01" max="0.99" step="0.01" value="0.50" style="width:100%;accent-color:#10B981;" />
          <input id="priceInput" class="input" type="number" min="0.01" max="0.99" step="0.005" value="0.50" style="margin-top:6px;" />
        </div>

        <div class="field">
          <label for="sizeInput"><span>Order Size (USD / pUSD)</span></label>
          <input id="sizeInput" class="input" type="number" min="5" max="250000" step="25" value="250" />
        </div>

        <div class="field">
          <label for="orderTypeSelect"><span>Execution Type</span></label>
          <select id="orderTypeSelect" class="select">
            <option value="taker" selected>Taker Copy (Market / Crossing Spread)</option>
            <option value="maker">Maker Guarded Limit (postOnly: true — 0% Polymarket Fee)</option>
          </select>
        </div>

        <div class="field">
          <label for="slipInput"><span>Simulated Copy Slippage (cents moved during fill delay)</span><span id="slipLabel" class="mono">1.0¢</span></label>
          <input id="slipInput" class="input" type="number" min="0" max="15" step="0.25" value="1.0" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="field">
            <label for="compFeeInput"><span>Competitor Bot Fee (%)</span></label>
            <input id="compFeeInput" class="input" type="number" min="0" max="5" step="0.1" value="1.00" />
          </div>
          <div class="field">
            <label for="ncFeeInput"><span>NullClear Builder Fee (%)</span></label>
            <input id="ncFeeInput" class="input" type="number" min="0" max="2" step="0.05" value="0.40" />
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
          <a id="simTerminalLink" href="/terminal" class="btn btn-primary" style="flex:1;">Simulate this strategy in Paper Mode &rarr;</a>
          <a href="/leaderboard" class="btn btn-secondary">Audit a Whale Wallet</a>
        </div>
      </div>

      <!-- Outputs -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div class="eyebrow">ACTIVE SCENARIO COPY-TAX</div>
            <span id="savingsPill" class="pill pill-safe">Save $0.00/trade with Maker Guard</span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px;">
            <div class="card-muted">
              <div class="mono" style="font-size:11px;color:var(--dim);">POLYMARKET TAKER FEE</div>
              <div id="outPolyFee" class="big-num mono" style="color:var(--amber);margin-top:4px;">$0.00</div>
              <div id="outPolyFeePct" class="mono" style="font-size:12px;color:var(--muted);">0.00%</div>
            </div>
            <div class="card-muted">
              <div class="mono" style="font-size:11px;color:var(--dim);">SLIPPAGE COST</div>
              <div id="outSlip" class="big-num mono" style="color:var(--rose);margin-top:4px;">$0.00</div>
              <div id="outSlipPct" class="mono" style="font-size:12px;color:var(--muted);">0.00%</div>
            </div>
            <div class="card-muted">
              <div class="mono" style="font-size:11px;color:var(--dim);">ROUND-TRIP COPY-TAX</div>
              <div id="outRtTax" class="big-num mono" style="color:var(--rose);margin-top:4px;">0.00%</div>
              <div id="outBreakeven" class="mono" style="font-size:12px;color:var(--muted);">Breakeven: 50.0%</div>
            </div>
          </div>

          <!-- Side-by-side comparison -->
          <div class="cmp-grid">
            <div class="card-muted" style="border-color:var(--rose-border);">
              <div class="mono" style="font-size:11px;color:var(--rose);font-weight:700;margin-bottom:8px;">TAKER COPY (COMPETITOR BOT)</div>
              <div class="metric-row"><span style="color:var(--muted)">Exec Price</span><span id="tkExec" class="mono">-</span></div>
              <div class="metric-row"><span style="color:var(--muted)">Polymarket Fee</span><span id="tkPolyFee" class="mono">-</span></div>
              <div class="metric-row"><span style="color:var(--muted)">Slippage Cost</span><span id="tkSlip" class="mono">-</span></div>
              <div class="metric-row"><span style="color:var(--muted)">Bot Fee</span><span id="tkBotFee" class="mono">-</span></div>
              <div class="metric-row"><span style="color:var(--muted)">Total Entry Drag</span><span id="tkTotal" class="mono" style="color:var(--rose);font-weight:700;">-</span></div>
              <div class="metric-row"><span style="color:var(--muted)">Breakeven Win Rate</span><span id="tkBe" class="mono" style="font-weight:700;">-</span></div>
            </div>

            <div class="card-muted" style="border-color:var(--emerald-border);">
              <div class="mono" style="font-size:11px;color:var(--emerald);font-weight:700;margin-bottom:8px;">MAKER GUARDED LIMIT (NULLCLEAR)</div>
              <div class="metric-row"><span style="color:var(--muted)">Limit Price (postOnly)</span><span id="mkExec" class="mono">-</span></div>
              <div class="metric-row"><span style="color:var(--muted)">Polymarket Fee</span><span id="mkPolyFee" class="mono" style="color:var(--emerald);">$0.00 (0.00%)</span></div>
              <div class="metric-row"><span style="color:var(--muted)">Slippage Cost</span><span id="mkSlip" class="mono" style="color:var(--emerald);">$0.00 (0.00%)</span></div>
              <div class="metric-row"><span style="color:var(--muted)">NullClear Builder Fee</span><span id="mkBotFee" class="mono">-</span></div>
              <div class="metric-row"><span style="color:var(--muted)">Total Entry Drag</span><span id="mkTotal" class="mono" style="color:var(--emerald);font-weight:700;">-</span></div>
              <div class="metric-row"><span style="color:var(--muted)">Breakeven Win Rate</span><span id="mkBe" class="mono" style="color:var(--emerald);font-weight:700;">-</span></div>
            </div>
          </div>
        </div>

        <!-- Peak-Fee Curve Reference -->
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="eyebrow">2026 TAKER FEE CURVE ACROSS PROBABILITY (p &times; (1 - p))</div>
            <span class="mono" style="font-size:11px;color:var(--dim);">Peak fee occurs at $0.50</span>
          </div>
          <div id="curveSvgWrap" style="margin-top:12px;"></div>
        </div>
      </div>
    </div>
  </main>

  ${renderPolyFooter()}

  <script>
    const FEE_RATES = ${feeRatesJson};

    function computeScenario(mode, category, entryPrice, orderSizeUsd, slipCents, platformFeePct) {
      const isMaker = mode === 'maker';
      const feeRate = FEE_RATES[category] ?? 0.05;
      const slipDollars = isMaker ? 0 : Math.max(0, slipCents) / 100;
      const execPrice = Math.min(0.99, Math.max(0.01, entryPrice + slipDollars));
      const shares = orderSizeUsd / execPrice;
      const polyFeeUsd = isMaker ? 0 : shares * feeRate * execPrice * (1 - execPrice);
      const polyFeePct = (polyFeeUsd / orderSizeUsd) * 100;
      const slipCostUsd = isMaker ? 0 : Math.max(0, (execPrice - entryPrice) * shares);
      const slipPct = (slipCostUsd / orderSizeUsd) * 100;
      const platFeeUsd = orderSizeUsd * (Math.max(0, platformFeePct) / 100);
      const entryTaxUsd = polyFeeUsd + slipCostUsd + platFeeUsd;
      const entryTaxPct = (entryTaxUsd / orderSizeUsd) * 100;
      const rtTaxPct = entryTaxPct * 2;
      const effCostPerShare = (orderSizeUsd + entryTaxUsd) / shares;
      const breakevenPct = Math.min(99.9, effCostPerShare * 100);
      const reqEdgePct = Math.max(0, breakevenPct - entryPrice * 100);
      return { execPrice, shares, polyFeeUsd, polyFeePct, slipCostUsd, slipPct, platFeeUsd, entryTaxUsd, entryTaxPct, rtTaxPct, breakevenPct, reqEdgePct };
    }

    function renderCurve(category, activePrice) {
      const feeRate = FEE_RATES[category] ?? 0.05;
      const pts = [];
      for (let p = 0.05; p <= 0.951; p += 0.05) {
        // Effective fee % of notional = feeRate * (1 - p) * 100
        const effPct = feeRate * (1 - p) * 100;
        const absPer100Shares = 100 * feeRate * p * (1 - p);
        pts.push({ p, effPct, absPer100Shares });
      }
      const maxAbs = Math.max(0.5, ...pts.map(x => x.absPer100Shares));
      const W = 520, H = 120, pad = 26;
      const coords = pts.map((pt, i) => {
        const x = pad + (i / (pts.length - 1)) * (W - pad * 2);
        const y = H - pad - (pt.absPer100Shares / maxAbs) * (H - pad * 2);
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      const activeX = pad + ((Math.min(0.95, Math.max(0.05, activePrice)) - 0.05) / 0.90) * (W - pad * 2);
      const activeAbs = 100 * feeRate * activePrice * (1 - activePrice);
      const activeY = H - pad - (activeAbs / maxAbs) * (H - pad * 2);
      document.getElementById('curveSvgWrap').innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;background:#05070B;border:1px solid rgba(255,255,255,0.08);border-radius:8px;">' +
        '<polyline fill="none" stroke="#10B981" stroke-width="2.5" points="' + coords + '" />' +
        '<circle cx="' + activeX.toFixed(1) + '" cy="' + activeY.toFixed(1) + '" r="5" fill="#38BDF8" />' +
        '<text x="' + pad + '" y="' + (H - 7) + '" fill="#64748B" font-size="10" font-family="JetBrains Mono">$0.05</text>' +
        '<text x="' + (W/2 - 14) + '" y="' + (H - 7) + '" fill="#94A3B8" font-size="10" font-family="JetBrains Mono">$0.50 (Peak)</text>' +
        '<text x="' + (W - pad - 28) + '" y="' + (H - 7) + '" fill="#64748B" font-size="10" font-family="JetBrains Mono">$0.95</text>' +
        '<text x="' + pad + '" y="15" fill="#94A3B8" font-size="10" font-family="JetBrains Mono">Fee per 100 shares: $' + activeAbs.toFixed(2) + ' @ $' + activePrice.toFixed(2) + '</text>' +
        '</svg>';
    }

    function recalc() {
      const cat = document.getElementById('catSelect').value;
      const price = Math.min(0.99, Math.max(0.01, Number(document.getElementById('priceInput').value) || 0.5));
      const sizeUsd = Math.max(1, Number(document.getElementById('sizeInput').value) || 250);
      const orderType = document.getElementById('orderTypeSelect').value;
      const slipCents = Math.max(0, Number(document.getElementById('slipInput').value) || 0);
      const compFee = Math.max(0, Number(document.getElementById('compFeeInput').value) || 0);
      const ncFee = Math.max(0, Number(document.getElementById('ncFeeInput').value) || 0);

      const feeRate = FEE_RATES[cat] ?? 0.05;
      document.getElementById('feeRateLabel').textContent = (feeRate * 100).toFixed(1) + '%';
      document.getElementById('priceLabel').textContent = '$' + price.toFixed(3) + ' (' + (price * 100).toFixed(1) + '¢)';
      document.getElementById('slipLabel').textContent = slipCents.toFixed(2) + '¢';

      const tk = computeScenario('taker', cat, price, sizeUsd, slipCents, compFee);
      const mk = computeScenario('maker', cat, price, sizeUsd, 0, ncFee);
      const sel = orderType === 'maker' ? mk : tk;
      const savings = Math.max(0, tk.entryTaxUsd - mk.entryTaxUsd);

      document.getElementById('outPolyFee').textContent = '$' + sel.polyFeeUsd.toFixed(2);
      document.getElementById('outPolyFeePct').textContent = sel.polyFeePct.toFixed(2) + '% of notional';
      document.getElementById('outSlip').textContent = '$' + sel.slipCostUsd.toFixed(2);
      document.getElementById('outSlipPct').textContent = sel.slipPct.toFixed(2) + '% adverse fill';
      document.getElementById('outRtTax').textContent = sel.rtTaxPct.toFixed(2) + '%';
      document.getElementById('outBreakeven').textContent = 'Breakeven: ' + sel.breakevenPct.toFixed(1) + '% (+' + sel.reqEdgePct.toFixed(1) + '% edge)';
      document.getElementById('savingsPill').textContent = 'Maker Guard saves $' + savings.toFixed(2) + ' (' + (tk.entryTaxPct - mk.entryTaxPct).toFixed(2) + '%) per entry';

      document.getElementById('tkExec').textContent = '$' + tk.execPrice.toFixed(3);
      document.getElementById('tkPolyFee').textContent = '$' + tk.polyFeeUsd.toFixed(2) + ' (' + tk.polyFeePct.toFixed(2) + '%)';
      document.getElementById('tkSlip').textContent = '$' + tk.slipCostUsd.toFixed(2) + ' (' + tk.slipPct.toFixed(2) + '%)';
      document.getElementById('tkBotFee').textContent = '$' + tk.platFeeUsd.toFixed(2) + ' (' + compFee.toFixed(2) + '%)';
      document.getElementById('tkTotal').textContent = '$' + tk.entryTaxUsd.toFixed(2) + ' (' + tk.entryTaxPct.toFixed(2) + '%)';
      document.getElementById('tkBe').textContent = tk.breakevenPct.toFixed(2) + '%';

      document.getElementById('mkExec').textContent = '$' + mk.execPrice.toFixed(3);
      document.getElementById('mkBotFee').textContent = '$' + mk.platFeeUsd.toFixed(2) + ' (' + ncFee.toFixed(2) + '%)';
      document.getElementById('mkTotal').textContent = '$' + mk.entryTaxUsd.toFixed(2) + ' (' + mk.entryTaxPct.toFixed(2) + '%)';
      document.getElementById('mkBe').textContent = mk.breakevenPct.toFixed(2) + '%';

      document.getElementById('simTerminalLink').href =
        '/terminal?category=' + encodeURIComponent(cat) +
        '&price=' + encodeURIComponent(price.toFixed(3)) +
        '&size=' + encodeURIComponent(String(sizeUsd)) +
        '&maker=' + (orderType === 'maker' ? '1' : '0');

      renderCurve(cat, price);
    }

    document.getElementById('priceSlider').addEventListener('input', (e) => {
      document.getElementById('priceInput').value = e.target.value;
      recalc();
    });
    document.getElementById('priceInput').addEventListener('input', (e) => {
      document.getElementById('priceSlider').value = e.target.value;
      recalc();
    });
    ['catSelect', 'sizeInput', 'orderTypeSelect', 'slipInput', 'compFeeInput', 'ncFeeInput'].forEach(id => {
      document.getElementById(id).addEventListener('input', recalc);
      document.getElementById(id).addEventListener('change', recalc);
    });
    recalc();
  </script>
</body>
</html>`;
}

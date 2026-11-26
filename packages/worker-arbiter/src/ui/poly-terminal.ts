import {
  DEFAULT_POLY_POLICY,
  POLYMARKET_CHAIN_ID,
  POLYMARKET_COLLATERAL,
  POLYMARKET_ENDPOINTS
} from "@nullclear/shared";
import {
  POLY_FONTS_HEAD,
  POLY_SHELL_CSS,
  escapeHtml,
  renderPolyFooter,
  renderPolyHeader
} from "./poly-shell.js";

export interface TerminalInitialParams {
  copyWhale?: string;
  assetId?: string;
  marketTitle?: string;
  category?: string;
  price?: string;
  size?: string;
  makerOnly?: boolean;
  mode?: "paper" | "live";
  liveAutocopyEnabled: boolean;
}

export function renderPolyTerminalHtml(init: TerminalInitialParams): string {
  const defaultAsset =
    init.assetId ||
    "71321045679252212594626385532706912750332728571942532289631379312455583992563";
  const defaultTitle =
    init.marketTitle || "Will a diplomatic ceasefire agreement be signed before Q2?";
  const defaultCategory = init.category || "geopolitics";
  const defaultPrice = init.price || "0.340";
  const defaultSize = init.size || "50";
  const defaultMode = init.mode === "live" ? "live" : "paper";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear Guarded Polymarket Terminal (Paper &amp; Non-Custodial Live) | NullClear</title>
  <meta name="description" content="Execute or simulate Polymarket CLOB V2 trades through NullClear's non-custodial EIP-712 Policy Co-Signer. Hard spend caps, slippage locks, 2026 fee guards, and verifiable public receipts." />
  ${POLY_FONTS_HEAD}
  <style>
    ${POLY_SHELL_CSS}
    .term-layout { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 20px; margin-top: 20px; }
    .kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 18px; }
    .field { margin-bottom: 12px; }
    .field label { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 5px; }
    .mode-switch { display: inline-flex; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; padding: 3px; gap: 4px; }
    .mode-btn { padding: 7px 14px; border-radius: 7px; border: none; background: transparent; color: var(--muted); font-size: 12.5px; font-weight: 700; cursor: pointer; }
    .mode-btn.active-paper { background: var(--emerald); color: #03150F; }
    .mode-btn.active-live { background: var(--cyan); color: #031420; }
    .cat-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .cat-pill { font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); background: #05070B; color: var(--muted); cursor: pointer; }
    .cat-pill.allowed { border-color: var(--emerald-border); color: var(--emerald); background: var(--emerald-bg); }
    .cat-pill.blocked { border-color: var(--rose-border); color: var(--rose); background: var(--rose-bg); }
    .console-box { background: #05070B; border: 1px solid var(--border); border-radius: 9px; padding: 14px; font-size: 12px; white-space: pre-wrap; max-height: 280px; overflow-y: auto; margin-top: 12px; }
    @media (max-width: 920px) {
      .term-layout { grid-template-columns: 1fr; }
      .kpi-strip { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  ${renderPolyHeader("terminal")}

  <main class="container" style="padding-top:28px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;">
      <div>
        <div class="eyebrow">ZERO CUSTODY &middot; CLOB V2 (${POLYMARKET_COLLATERAL} / POLYGON ${POLYMARKET_CHAIN_ID}) &middot; PUBLIC RECEIPTS</div>
        <h1 style="font-size:clamp(24px,3.2vw,34px);font-weight:800;letter-spacing:-0.03em;margin-top:4px;">
          Policy-Guarded Polymarket Execution Terminal
        </h1>
      </div>

      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div class="mode-switch" role="tablist">
          <button type="button" id="btnModePaper" class="mode-btn ${defaultMode === "paper" ? "active-paper" : ""}" onclick="setExecMode('paper')">
            Paper Mode (Default Free)
          </button>
          <button type="button" id="btnModeLive" class="mode-btn ${defaultMode === "live" ? "active-live" : ""}" onclick="setExecMode('live')">
            Live Non-Custodial
          </button>
        </div>
        <button type="button" id="connectWalletBtn" class="btn btn-secondary btn-sm" onclick="connectPolygonWallet()">
          Connect Polygon Wallet
        </button>
      </div>
    </div>

    <!-- Zero-Custody Invariant Banner -->
    <div class="card-muted" style="margin-top:14px;border-color:var(--emerald-border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div style="font-size:13px;">
        <strong style="color:var(--emerald);">Zero-Custody Security Invariant:</strong>
        NullClear <strong>NEVER</strong> asks for, stores, or logs your private key or seed phrase. Every order passes our EIP-712 Policy Co-Signer first; live CLOB V2 orders are signed in your wallet or via non-withdrawal <span class="mono">POLY_1271</span> Deposit Wallet session keys.
      </div>
      <span class="pill pill-info">Autocopy Flag: ${init.liveAutocopyEnabled ? "ENABLED" : "OFF (Safe Default)"}</span>
    </div>

    <!-- Live Paper / Guardrail Telemetry Strip -->
    <div class="kpi-strip">
      <div class="card-muted">
        <div class="mono" style="font-size:11px;color:var(--dim);">24H SPEND VS CAP</div>
        <div id="kpiSpend" class="mono" style="font-size:20px;font-weight:800;margin-top:4px;">$0 / $${DEFAULT_POLY_POLICY.maxDailySpendUsd}</div>
      </div>
      <div class="card-muted">
        <div class="mono" style="font-size:11px;color:var(--dim);">DAILY LOSS BREAKER</div>
        <div id="kpiLoss" class="mono" style="font-size:20px;font-weight:800;margin-top:4px;color:var(--emerald);">$0 / $${DEFAULT_POLY_POLICY.maxDailyLossUsd}</div>
      </div>
      <div class="card-muted">
        <div class="mono" style="font-size:11px;color:var(--dim);">OPEN PAPER EXPOSURE</div>
        <div id="kpiExposure" class="mono" style="font-size:20px;font-weight:800;margin-top:4px;">$0.00</div>
      </div>
      <div class="card-muted">
        <div class="mono" style="font-size:11px;color:var(--dim);">SIMULATED EQUITY PNL</div>
        <div id="kpiPnl" class="mono" style="font-size:20px;font-weight:800;margin-top:4px;color:var(--emerald);">+$0.00</div>
      </div>
    </div>

    <div class="term-layout">
      <!-- Left: Policy Guardrail Configuration (Stored in D1 poly_policies) -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <div class="eyebrow">HARD GUARDRAILS (D1 poly_policies)</div>
            <h2 style="font-size:17px;font-weight:700;margin-top:2px;">EIP-712 Policy Rules</h2>
          </div>
          <span id="policySaveBadge" class="pill pill-safe">ACTIVE</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="field">
            <label for="polMaxTrade"><span>Max Trade (USD)</span></label>
            <input id="polMaxTrade" class="input" type="number" value="${DEFAULT_POLY_POLICY.maxTradeUsd}" min="1" />
          </div>
          <div class="field">
            <label for="polMaxDailySpend"><span>Max 24h Spend (USD)</span></label>
            <input id="polMaxDailySpend" class="input" type="number" value="${DEFAULT_POLY_POLICY.maxDailySpendUsd}" min="1" />
          </div>
          <div class="field">
            <label for="polMaxDailyLoss"><span>Max Daily Loss Breaker</span></label>
            <input id="polMaxDailyLoss" class="input" type="number" value="${DEFAULT_POLY_POLICY.maxDailyLossUsd}" min="1" />
          </div>
          <div class="field">
            <label for="polMaxSlip"><span>Max Slippage (cents)</span></label>
            <input id="polMaxSlip" class="input" type="number" step="0.1" value="${DEFAULT_POLY_POLICY.maxSlippageCents}" min="0" />
          </div>
          <div class="field">
            <label for="polMaxFeeDrag"><span>Max Fee+Slip Drag (%)</span></label>
            <input id="polMaxFeeDrag" class="input" type="number" step="0.1" value="${DEFAULT_POLY_POLICY.maxFeeDragPct}" min="0" />
          </div>
          <div class="field" style="display:flex;flex-direction:column;justify-content:flex-end;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px;background:#05070B;border:1px solid var(--border-strong);border-radius:8px;margin-bottom:0;">
              <input id="polMakerOnly" type="checkbox" ${init.makerOnly ? "checked" : ""} style="width:16px;height:16px;accent-color:#10B981;" />
              <span style="color:var(--text);">Maker-Only (postOnly 0% Fee)</span>
            </label>
          </div>
        </div>

        <div class="field" style="margin-top:4px;">
          <label><span>Category Rules (click to toggle Allowed / Blocked)</span></label>
          <div id="catPillsWrap" class="cat-grid"></div>
        </div>

        <!-- Bring-Your-Own Webhook Delivery (stored in poly_policies) -->
        <div id="byo-webhook" class="card-muted" style="margin:12px 0;">
          <div class="mono" style="font-size:11px;color:var(--cyan);font-weight:700;margin-bottom:8px;">
            BRING-YOUR-OWN WEBHOOK ALERTS (JSON OR DISCORD)
          </div>
          <div class="field">
            <label for="polWebhookUrl"><span>HTTPS Webhook URL (Discord or custom server)</span></label>
            <input id="polWebhookUrl" class="input" type="url" placeholder="https://discord.com/api/webhooks/..." />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:end;">
            <div class="field" style="margin-bottom:0;">
              <label for="polWebhookFormat"><span>Payload Format</span></label>
              <select id="polWebhookFormat" class="select">
                <option value="json">Standard JSON</option>
                <option value="discord">Discord Embed</option>
              </select>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" style="height:40px;" onclick="testWebhook()">Send Test Alert</button>
          </div>
          <div id="webhookTestMsg" class="mono" style="font-size:11px;color:var(--muted);margin-top:6px;"></div>
        </div>

        <button type="button" class="btn btn-secondary" style="width:100%;margin-top:6px;" onclick="savePolicy()">
          Save Policy Guardrails &amp; Webhook to NullClear Engine
        </button>

        <!-- Live POLY_1271 Deposit Wallet / Session Key Scaffold -->
        <div id="live1271Box" class="card-muted" style="margin-top:16px;display:${defaultMode === "live" ? "block" : "none"};border-color:var(--cyan-border);">
          <div class="mono" style="font-size:11px;color:var(--cyan);font-weight:700;margin-bottom:6px;">
            LIVE NON-CUSTODIAL EXECUTION (CLOB V2 + @polymarket/client)
          </div>
          <p style="font-size:12.5px;color:var(--muted);margin-bottom:10px;">
            <strong>Path 1 (Manual Guarded):</strong> Sign V2 CLOB EIP-712 orders in your browser wallet after NullClear Policy Co-Signer approves.<br/>
            <strong>Path 2 (Automated Copy):</strong> Polymarket V2 Deposit Wallet (<span class="mono">POLY_1271</span>, signatureType 3) + non-withdrawal Session Key via <span class="mono">${POLYMARKET_ENDPOINTS.relayerV2}</span>.
          </p>
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;">
            <input id="use1271Check" type="checkbox" style="width:15px;height:15px;accent-color:#38BDF8;" />
            <span>Scaffold <span class="mono">POLY_1271</span> Deposit Wallet Session Key (signatureType: 3)</span>
          </label>
          <div id="walletStatusLine" class="mono" style="font-size:11.5px;color:var(--muted);margin-top:8px;">
            Wallet: Not connected (click "Connect Polygon Wallet" above for Live Mode)
          </div>
        </div>
      </div>

      <!-- Right: Guarded Order Execution Panel -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
          <div>
            <div class="eyebrow">PRE-SIGN POLICY EVALUATION &amp; RECEIPT ENGINE</div>
            <h2 style="font-size:17px;font-weight:700;margin-top:2px;">Candidate Trade / Copy Order</h2>
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="loadPreset('geo_safe')">Preset: 0% Fee Geo</button>
            <button type="button" class="btn btn-secondary btn-sm" style="color:var(--rose);" onclick="loadPreset('crypto_trap')">Test Block: Crypto Trap</button>
          </div>
        </div>

        <div class="field">
          <label for="ordTitle"><span>Market Title</span></label>
          <input id="ordTitle" class="input" value="${escapeHtml(defaultTitle)}" />
        </div>

        <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:10px;">
          <div class="field">
            <label for="ordAssetId"><span>Asset ID (V2 positionId or CTF clobTokenId)</span></label>
            <input id="ordAssetId" class="input" value="${escapeHtml(defaultAsset)}" />
          </div>
          <div class="field">
            <label for="ordCategory"><span>Category</span></label>
            <select id="ordCategory" class="select">
              <option value="geopolitics" ${defaultCategory === "geopolitics" ? "selected" : ""}>Geopolitics (0% Fee)</option>
              <option value="politics" ${defaultCategory === "politics" ? "selected" : ""}>Politics (4%)</option>
              <option value="sports" ${defaultCategory === "sports" ? "selected" : ""}>Sports (3%)</option>
              <option value="economics" ${defaultCategory === "economics" ? "selected" : ""}>Economics (5%)</option>
              <option value="finance" ${defaultCategory === "finance" ? "selected" : ""}>Finance (4%)</option>
              <option value="tech" ${defaultCategory === "tech" ? "selected" : ""}>Tech (4%)</option>
              <option value="crypto" ${defaultCategory === "crypto" ? "selected" : ""}>Crypto (7.2%)</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
          <div class="field">
            <label for="ordSide"><span>Side</span></label>
            <select id="ordSide" class="select">
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
          <div class="field">
            <label for="ordSize"><span>Size (USD)</span></label>
            <input id="ordSize" class="input" type="number" value="${escapeHtml(defaultSize)}" min="1" />
          </div>
          <div class="field">
            <label for="ordTrigger"><span>Whale Fill ($)</span></label>
            <input id="ordTrigger" class="input" type="number" step="0.005" value="${escapeHtml(defaultPrice)}" />
          </div>
          <div class="field">
            <label for="ordAsk"><span>Live Book Ask ($)</span></label>
            <input id="ordAsk" class="input" type="number" step="0.005" value="${escapeHtml(defaultPrice)}" />
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:end;margin-bottom:12px;">
          <div class="field" style="margin-bottom:0;">
            <label for="ordTick"><span>Exact Tick Size</span></label>
            <select id="ordTick" class="select">
              <option value="0.01">0.01 (1.0¢)</option>
              <option value="0.005" selected>0.005 (0.5¢)</option>
              <option value="0.0025">0.0025 (0.25¢)</option>
            </select>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px;background:#05070B;border:1px solid var(--border-strong);border-radius:8px;font-size:12.5px;">
            <input id="ordPostOnly" type="checkbox" ${init.makerOnly ? "checked" : ""} style="width:15px;height:15px;accent-color:#10B981;" />
            <span>postOnly Maker (0% Fee)</span>
          </label>
          <button type="button" class="btn btn-secondary" onclick="fetchLiveBook()">↻ Fetch CLOB Book</button>
        </div>

        <input id="ordWhale" type="hidden" value="${escapeHtml(init.copyWhale || "")}" />

        <button type="button" id="execBtn" class="btn btn-primary" style="width:100%;padding:12px;" onclick="executeOrder()">
          Run NullClear Policy Check &amp; Execute Paper Fill
        </button>

        <div id="execConsole" class="console-box mono">[NullClear Policy Engine Ready] Mode: ${defaultMode.toUpperCase()}. Every allowed or blocked order generates a verifiable receipt on nullclear.dev/receipt/[id].</div>
      </div>
    </div>

    <!-- Open Paper Positions & Verifiable Policy Receipts -->
    <div class="card" style="margin-top:20px;">
      <div class="eyebrow">SIMULATED PAPER PORTFOLIO</div>
      <h2 style="font-size:17px;font-weight:700;margin:4px 0 12px;">Open Paper Positions</h2>
      <div class="table-wrap">
        <table class="poly-table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Category</th>
              <th>Side</th>
              <th>Shares</th>
              <th>Avg Entry</th>
              <th>Cost Basis</th>
              <th>Unrealized PnL</th>
            </tr>
          </thead>
          <tbody id="positionsBody">
            <tr><td colspan="7" style="color:var(--muted);">No paper positions yet. Execute a policy-approved order above to simulate fills.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:20px;">
      <div class="eyebrow">PUBLIC CRYPTOGRAPHIC AUDIT TRAIL (nullclear.dev/receipt/[id])</div>
      <h2 style="font-size:17px;font-weight:700;margin:4px 0 12px;">Policy Evaluation Receipts (Allowed &amp; Blocked)</h2>
      <div class="table-wrap">
        <table class="poly-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Mode</th>
              <th>Market</th>
              <th>Size</th>
              <th>Slippage / Drag</th>
              <th>Verdict</th>
              <th>Public Proof</th>
            </tr>
          </thead>
          <tbody id="receiptsBody">
            <tr><td colspan="7" style="color:var(--muted);">No policy receipts recorded yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>

  ${renderPolyFooter()}

  <script>
    const ALL_CATS = ['geopolitics','politics','economics','finance','sports','tech','culture','weather','mentions','crypto'];
    let execMode = '${defaultMode}';
    let connectedWallet = null;
    let allowedCats = new Set(${JSON.stringify(DEFAULT_POLY_POLICY.allowedCategories)});
    let blockedCats = new Set(${JSON.stringify(DEFAULT_POLY_POLICY.blockedCategories)});

    function getUserId() {
      let id = localStorage.getItem('nc_poly_uid');
      if (!id) {
        id = 'paper_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('nc_poly_uid', id);
      }
      return connectedWallet ? connectedWallet.toLowerCase() : id;
    }

    function renderCatPills() {
      const wrap = document.getElementById('catPillsWrap');
      wrap.innerHTML = ALL_CATS.map(c => {
        const isBlocked = blockedCats.has(c);
        const cls = isBlocked ? 'cat-pill blocked' : 'cat-pill allowed';
        return '<button type="button" class="' + cls + '" onclick="toggleCat(\\'' + c + '\\')">' + (isBlocked ? '✕ ' : '✓ ') + c + '</button>';
      }).join('');
    }

    function toggleCat(c) {
      if (blockedCats.has(c)) {
        blockedCats.delete(c);
        allowedCats.add(c);
      } else {
        blockedCats.add(c);
        allowedCats.delete(c);
      }
      renderCatPills();
    }

    function setExecMode(mode) {
      execMode = mode === 'live' ? 'live' : 'paper';
      document.getElementById('btnModePaper').className = 'mode-btn' + (execMode === 'paper' ? ' active-paper' : '');
      document.getElementById('btnModeLive').className = 'mode-btn' + (execMode === 'live' ? ' active-live' : '');
      document.getElementById('live1271Box').style.display = execMode === 'live' ? 'block' : 'none';
      document.getElementById('execBtn').textContent = execMode === 'live'
        ? 'Pre-Flight Policy Co-Sign & Build Live CLOB V2 Order'
        : 'Run NullClear Policy Check & Execute Paper Fill';
    }

    async function connectPolygonWallet() {
      if (!window.ethereum) {
        alert('No injected Web3 wallet detected (MetaMask / Rabby / Coinbase). Paper Mode works with zero wallet setup.');
        return;
      }
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts[0]) {
          connectedWallet = accounts[0];
          document.getElementById('connectWalletBtn').textContent = connectedWallet.slice(0, 6) + '...' + connectedWallet.slice(-4);
          document.getElementById('walletStatusLine').textContent = '✓ Connected Polygon Wallet: ' + connectedWallet + ' (Zero Custody)';
          await refreshState();
        }
      } catch (e) {
        alert('Wallet connection cancelled: ' + e.message);
      }
    }

    function loadPreset(kind) {
      if (kind === 'geo_safe') {
        document.getElementById('ordTitle').value = 'Will a diplomatic ceasefire agreement be signed before Q2?';
        document.getElementById('ordCategory').value = 'geopolitics';
        document.getElementById('ordSize').value = '50';
        document.getElementById('ordTrigger').value = '0.340';
        document.getElementById('ordAsk').value = '0.345';
        document.getElementById('ordPostOnly').checked = false;
      } else {
        document.getElementById('ordTitle').value = 'BTC Up or Down — 5m Interval';
        document.getElementById('ordCategory').value = 'crypto';
        document.getElementById('ordSize').value = '250';
        document.getElementById('ordTrigger').value = '0.500';
        document.getElementById('ordAsk').value = '0.530';
        document.getElementById('ordPostOnly').checked = false;
      }
    }

    async function fetchLiveBook() {
      const assetId = document.getElementById('ordAssetId').value.trim();
      const out = document.getElementById('execConsole');
      out.textContent = 'Fetching live clob.polymarket.com/book for ' + assetId + '...';
      try {
        const res = await fetch('/api/poly/book/' + encodeURIComponent(assetId) + '?fallbackPrice=' + encodeURIComponent(document.getElementById('ordTrigger').value));
        const data = await res.json();
        if (data.success && data.book) {
          document.getElementById('ordAsk').value = data.book.bestAsk;
          out.textContent = '[CLOB V2 Book (' + data.book.source + ')] Best Bid: ' + data.book.bestBid + ' | Best Ask: ' + data.book.bestAsk + ' | Spread: ' + data.book.spreadCents + '¢ | Tick: ' + data.book.tickSize + ' | Ask Depth: $' + data.book.askDepthUsd;
        }
      } catch (e) {
        out.textContent = 'Book fetch error: ' + e.message;
      }
    }

    async function savePolicy() {
      const badge = document.getElementById('policySaveBadge');
      badge.textContent = 'SAVING...';
      const body = {
        userId: getUserId(),
        walletAddress: connectedWallet,
        mode: execMode,
        maxTradeUsd: Number(document.getElementById('polMaxTrade').value),
        maxDailySpendUsd: Number(document.getElementById('polMaxDailySpend').value),
        maxDailyLossUsd: Number(document.getElementById('polMaxDailyLoss').value),
        maxSlippageCents: Number(document.getElementById('polMaxSlip').value),
        maxFeeDragPct: Number(document.getElementById('polMaxFeeDrag').value),
        makerOnlyMode: document.getElementById('polMakerOnly').checked,
        allowedCategories: Array.from(allowedCats),
        blockedCategories: Array.from(blockedCats),
        webhookUrl: document.getElementById('polWebhookUrl').value.trim() || null,
        webhookFormat: document.getElementById('polWebhookFormat').value,
        active: true
      };
      const res = await fetch('/api/poly/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      badge.textContent = data.success ? '✓ SAVED' : 'ERROR';
      if (!data.success && data.error) {
        document.getElementById('webhookTestMsg').textContent = '✕ ' + data.error;
      }
      await refreshState();
    }

    async function testWebhook() {
      const url = document.getElementById('polWebhookUrl').value.trim();
      const format = document.getElementById('polWebhookFormat').value;
      const msg = document.getElementById('webhookTestMsg');
      if (!url) {
        msg.textContent = 'Enter an HTTPS webhook URL first.';
        return;
      }
      msg.textContent = 'Sending test ' + format.toUpperCase() + ' webhook...';
      try {
        const res = await fetch('/api/poly/webhook/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl: url, webhookFormat: format })
        });
        const data = await res.json();
        msg.textContent = data.delivered
          ? '✓ Delivered (HTTP ' + data.status + ')!'
          : '✕ ' + (data.error || ('HTTP ' + data.status));
      } catch (e) {
        msg.textContent = '✕ ' + e.message;
      }
    }

    async function executeOrder() {
      const out = document.getElementById('execConsole');
      out.textContent = '[1/2] Evaluating order against NullClear EIP-712 Policy Engine...';
      const payload = {
        userId: getUserId(),
        mode: execMode,
        walletAddress: connectedWallet,
        useDepositWallet1271: document.getElementById('use1271Check').checked,
        assetId: document.getElementById('ordAssetId').value.trim(),
        marketTitle: document.getElementById('ordTitle').value.trim(),
        category: document.getElementById('ordCategory').value,
        side: document.getElementById('ordSide').value,
        orderSizeUsd: Number(document.getElementById('ordSize').value),
        triggerPrice: Number(document.getElementById('ordTrigger').value),
        liveBookAsk: Number(document.getElementById('ordAsk').value),
        tickSize: Number(document.getElementById('ordTick').value),
        postOnly: document.getElementById('ordPostOnly').checked,
        whaleAddress: document.getElementById('ordWhale').value || null
      };

      const res = await fetch('/api/poly/terminal/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) {
        out.textContent = 'Error: ' + (data.error || 'Execution failed');
        return;
      }

      const lines = [
        'VERDICT: ' + data.verdict + (data.evaluation.primaryRejectionCode ? ' (' + data.evaluation.primaryRejectionCode + ')' : ''),
        'PUBLIC RECEIPT: ' + data.receiptUrl,
        'EXEC PRICE (floored to tick): $' + data.evaluation.executionPrice + ' | Shares: ' + data.evaluation.shares,
        '2026 FEE: $' + data.evaluation.polymarketFeeUsd + ' | Slippage: ' + data.evaluation.slippageCents + '¢ | Combined Drag: ' + data.evaluation.combinedFeeDragPct + '%'
      ];
      if (data.eip712Approval) {
        lines.push('EIP-712 CO-SIGNER: ' + data.eip712Approval.coSignerAddress);
        lines.push('SIGNATURE: ' + data.eip712Approval.signature.slice(0, 34) + '...');
      }
      if (data.liveOrderBundle) {
        lines.push('CLOB V2 STRUCT (builder bytes32 embedded): ' + JSON.stringify(data.liveOrderBundle.orderStruct));
        lines.push('FLOW: ' + data.liveOrderBundle.depositWalletFlow.note);
      }
      if (data.evaluation.rejectionCodes.length > 0) {
        lines.push('BLOCKED REASONS:');
        data.evaluation.checks.filter(c => !c.passed).forEach(c => lines.push('  ✕ ' + c.code + ': ' + c.detail));
      }
      out.textContent = lines.join('\\n');
      await refreshState();
    }

    async function refreshState() {
      try {
        const res = await fetch('/api/poly/terminal/state?userId=' + encodeURIComponent(getUserId()));
        const data = await res.json();
        if (!data.success) return;
        const p = data.policy;
        const m = data.metrics;
        if (p.webhookUrl && !document.getElementById('polWebhookUrl').value) {
          document.getElementById('polWebhookUrl').value = p.webhookUrl;
        }
        if (p.webhookFormat) {
          document.getElementById('polWebhookFormat').value = p.webhookFormat;
        }
        document.getElementById('kpiSpend').textContent = '$' + m.rolling24hSpendUsd.toFixed(0) + ' / $' + p.maxDailySpendUsd;
        document.getElementById('kpiLoss').textContent = '$' + m.dailyRealizedAndMtmLossUsd.toFixed(2) + ' / $' + p.maxDailyLossUsd;
        document.getElementById('kpiExposure').textContent = '$' + m.openExposureUsd.toFixed(2);
        document.getElementById('kpiPnl').textContent = (m.totalEquityPnlUsd >= 0 ? '+$' : '-$') + Math.abs(m.totalEquityPnlUsd).toFixed(2);

        const posBody = document.getElementById('positionsBody');
        if (data.positions && data.positions.length > 0) {
          posBody.innerHTML = data.positions.map(pos =>
            '<tr><td>' + pos.marketTitle + '</td><td class="mono">' + pos.category + '</td><td class="mono">' + pos.side + '</td><td class="mono">' + pos.shares.toFixed(2) + '</td><td class="mono">$' + pos.avgEntryPrice.toFixed(3) + '</td><td class="mono">$' + pos.costBasisUsd.toFixed(2) + '</td><td class="mono" style="color:' + (pos.unrealizedPnlUsd >= 0 ? '#10B981' : '#F43F5E') + ';">' + (pos.unrealizedPnlUsd >= 0 ? '+$' : '-$') + Math.abs(pos.unrealizedPnlUsd).toFixed(2) + '</td></tr>'
          ).join('');
        }

        const rBody = document.getElementById('receiptsBody');
        if (data.receipts && data.receipts.length > 0) {
          rBody.innerHTML = data.receipts.map(r => {
            const ok = r.verdict === 'ALLOWED';
            return '<tr>' +
              '<td class="mono" style="font-size:11.5px;color:var(--muted);">' + new Date(r.createdAt).toLocaleTimeString() + '</td>' +
              '<td class="mono">' + r.mode.toUpperCase() + '</td>' +
              '<td>' + r.marketTitle + '</td>' +
              '<td class="mono">$' + r.orderSizeUsd.toFixed(2) + '</td>' +
              '<td class="mono">' + r.slippageCents.toFixed(2) + '¢ / ' + r.computedFeeDragPct.toFixed(2) + '%</td>' +
              '<td><span class="pill ' + (ok ? 'pill-safe' : 'pill-danger') + '">' + (ok ? '✓ ALLOWED' : '✕ ' + (r.rejectionCode || 'BLOCKED')) + '</span></td>' +
              '<td><a class="mono" style="color:var(--cyan);" href="/receipt/' + encodeURIComponent(r.id) + '" target="_blank">Verify Proof &#8599;</a></td>' +
              '</tr>';
          }).join('');
        }
      } catch {}
    }

    renderCatPills();
    refreshState();
  </script>
</body>
</html>`;
}

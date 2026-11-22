import { DEV_FONTS_HEAD, DEV_SHELL_CSS, escapeHtml, renderDevFooter, renderDevHeader } from "./dev-shell.js";

export interface LeaderboardRenderParams {
  endpoints: Array<{
    endpoint_url: string;
    description?: string | null;
    category?: string | null;
    uptime_score: number;
    hallucination_rate: number;
    latency_ms?: number | null;
    price_atomic?: string | number | null;
    nullclear_proxy_url: string;
  }>;
  sellers: Array<{
    address: string;
    tx_count: number;
    total_volume_atomic?: string | null;
    unique_counterparties: number;
    wash_trade_flag: number;
    top_counterparty_share: number;
    shadow_gateway_slug: string;
  }>;
  claimSeller?: string;
}

export function renderDevLeaderboardHtml(params: LeaderboardRenderParams): string {
  const { endpoints, sellers, claimSeller = "" } = params;

  const initialEndpointsRows = endpoints
    .map((ep, idx) => {
      const priceUsdc = ep.price_atomic
        ? (Number(ep.price_atomic) / 1_000_000).toFixed(Number(ep.price_atomic) < 10000 ? 4 : 2)
        : "0.01";
      const statusBadge =
        ep.uptime_score >= 98
          ? `<span class="status-tag tag-safe">${ep.uptime_score.toFixed(1)}%</span>`
          : `<span class="status-tag tag-warn">${ep.uptime_score.toFixed(1)}%</span>`;
      return `<tr>
        <td class="mono dim">#${idx + 1}</td>
        <td>
          <div class="mono" style="font-weight:600;color:var(--text);font-size:12.5px;">${escapeHtml(ep.endpoint_url)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${escapeHtml(ep.description || "")}</div>
        </td>
        <td><span class="status-tag tag-neutral">${escapeHtml(ep.category || "data")}</span></td>
        <td>${statusBadge}</td>
        <td class="mono">${ep.hallucination_rate.toFixed(1)}%</td>
        <td class="mono">${ep.latency_ms ?? 40} ms</td>
        <td class="mono">$${priceUsdc} USDC</td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm mono" onclick="copyProxyUrl('${escapeHtml(ep.nullclear_proxy_url)}', this)">[Copy Zero-Loss Proxy URL]</button>
        </td>
      </tr>`;
    })
    .join("\n");

  const initialSellerRows =
    sellers.length > 0
      ? sellers
          .map((s, idx) => {
            const volUsdc = (Number(s.total_volume_atomic || "0") / 1_000_000).toFixed(2);
            const sybilBadge =
              s.wash_trade_flag === 1
                ? `<span class="status-tag tag-danger">WASH-TRADE FLAGGED (${(s.top_counterparty_share * 100).toFixed(0)}%)</span>`
                : `<span class="status-tag tag-safe">CLEAN ORGANIC</span>`;
            return `<tr>
              <td class="mono dim">#${idx + 1}</td>
              <td class="mono" style="font-size:12px;color:var(--text);">${escapeHtml(s.address)}</td>
              <td class="mono">${s.tx_count}</td>
              <td class="mono">$${volUsdc} USDC</td>
              <td class="mono">${s.unique_counterparties}</td>
              <td>${sybilBadge}</td>
              <td><code>/g/${escapeHtml(s.shadow_gateway_slug)}</code></td>
              <td>
                <button type="button" class="btn btn-secondary btn-sm" onclick="claimShadowGateway('${escapeHtml(s.address)}', '${escapeHtml(s.shadow_gateway_slug)}')">[Claim Verified NullClear Gateway]</button>
              </td>
            </tr>`;
          })
          .join("\n")
      : `<tr>
          <td class="mono dim">#1</td>
          <td class="mono" style="font-size:12px;color:var(--text);">0xb586efcca41df27ad3873beca54da0c30bf04d5c</td>
          <td class="mono">42</td>
          <td class="mono">$0.42 USDC</td>
          <td class="mono">12</td>
          <td><span class="status-tag tag-safe">CLEAN ORGANIC</span></td>
          <td><code>/g/base-seller-b586efcc</code></td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm" onclick="claimShadowGateway('0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c', 'base-seller-b586efcc')">[Claim Verified NullClear Gateway]</button>
          </td>
        </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear Leaderboard &amp; Base EIP-3009 Volume Radar — Live x402 Uptime Directory</title>
  <meta name="description" content="Live uptime, latency, hallucination rate, and Base Mainnet USDC EIP-3009 on-chain volume leaderboard for all x402 and ERC-8004 endpoints." />
  ${DEV_FONTS_HEAD}
  <style>
    ${DEV_SHELL_CSS}

    .page-head {
      padding: 48px 0 32px;
      border-bottom: 1px solid var(--border);
    }
    .input-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
    }
    .input-row .input { flex: 1; min-width: 200px; }
    .seg-tabs {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      background: var(--surface);
      margin-bottom: 16px;
    }
    .tab-btn {
      padding: 9px 16px;
      border: none;
      border-right: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s, color 0.15s;
    }
    .tab-btn:last-child { border-right: none; }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      background: var(--surface-2);
      color: var(--text);
      font-weight: 600;
    }
    .status-box {
      margin-top: 12px;
      display: none;
      max-height: 260px;
    }
    .sort-bar {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    @media (max-width: 640px) {
      .seg-tabs { display: flex; flex-direction: column; width: 100%; }
      .tab-btn { border-right: none; border-bottom: 1px solid var(--border); text-align: left; }
      .tab-btn:last-child { border-bottom: none; }
    }
  </style>
</head>
<body>
  ${renderDevHeader("leaderboard")}

  <main class="container">
    <section class="page-head">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;">
        <div>
          <div class="eyebrow">ECOSYSTEM RADAR &middot; CANARY AUDITOR v1.3</div>
          <h1 class="h1" style="margin-top:10px;">x402 &amp; ERC-8004 Live Uptime Leaderboard</h1>
          <p class="lead" style="margin-top:10px;max-width:720px;">
            Real-time Canary probes across x402 APIs and Base Mainnet USDC EIP-3009 settlements. Route any endpoint through <code>https://api.nullclear.dev/</code> for zero-loss schema escrow.
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <a href="/v1/bazaar/directory" class="btn btn-secondary btn-sm mono">/v1/bazaar/directory</a>
          <a href="/v1/radar/onchain-flows" class="btn btn-secondary btn-sm mono">/v1/radar/onchain-flows</a>
        </div>
      </div>
    </section>

    <!-- Instant Test & List Your x402 Endpoint -->
    <section class="section-tight" style="border-bottom:1px solid var(--border);">
      <div class="card">
        <div class="eyebrow">CANARY PROBE</div>
        <h2 class="h3" style="margin-top:6px;">Test &amp; List Your x402 Endpoint</h2>
        <p class="muted" style="font-size:13.5px;margin-top:4px;">
          Submit an x402 or REST URL to run a live 4,000ms Canary probe, verify the HTTP 402 payment challenge, and list your Zero-Loss Proxy URL.
        </p>
        <div class="input-row">
          <input id="canary-url" class="input" placeholder="https://api.your-domain.com/v1/query" value="https://api.nullclear.dev/v1/bazaar/market-oracle" />
          <input id="canary-category" class="input" style="max-width:160px;" placeholder="Category (oracle/data/ai)" value="oracle" />
          <button type="button" class="btn btn-primary" onclick="submitCanaryEndpoint()">Run Canary Audit</button>
        </div>
        <pre id="canary-result" class="code-block status-box"></pre>
      </div>
    </section>

    <!-- Leaderboard & Radar Tabs -->
    <section class="section-tight" style="border-bottom:1px solid var(--border);">
      <div class="seg-tabs" role="tablist">
        <button type="button" id="tab-btn-uptime" class="tab-btn active" onclick="switchTab('uptime')">Audited x402 &amp; ERC-8004 Endpoints</button>
        <button type="button" id="tab-btn-radar" class="tab-btn" onclick="switchTab('radar')">Live Base EIP-3009 On-Chain Volume Radar</button>
      </div>

      <!-- TAB 1: Uptime & Hallucination Leaderboard -->
      <div id="tab-uptime" class="card-flat">
        <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <h3 class="h3">Live Audited Endpoints</h3>
          <div class="sort-bar">
            <button type="button" class="btn btn-secondary btn-sm" onclick="sortLeaderboard('uptime')">Sort: Uptime %</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="sortLeaderboard('latency')">Sort: Latency ms</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="sortLeaderboard('price')">Sort: Price USDC</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="dev-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Endpoint &amp; Description</th>
                <th>Category</th>
                <th style="cursor:pointer;" onclick="sortLeaderboard('uptime')">Uptime %</th>
                <th>Hallucination</th>
                <th style="cursor:pointer;" onclick="sortLeaderboard('latency')">Latency</th>
                <th style="cursor:pointer;" onclick="sortLeaderboard('price')">Price</th>
                <th>Zero-Loss Proxy</th>
              </tr>
            </thead>
            <tbody id="leaderboard-tbody">
              ${initialEndpointsRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 2: Live Base EIP-3009 On-Chain Volume Radar -->
      <div id="tab-radar" class="card-flat" style="display:none;">
        <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <div>
            <h3 class="h3">Live Base EIP-3009 On-Chain Volume Radar</h3>
            <p class="muted" style="font-size:12.5px;margin-top:2px;">
              Base Mainnet USDC (<code>0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</code>) <code>AuthorizationUsed</code> flows with Sybil wash-trading detection.
            </p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="triggerRadarSync()">Sync Base Blocks</button>
        </div>
        <div class="table-wrap">
          <table class="dev-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Seller Wallet (Base)</th>
                <th>EIP-3009 Txs</th>
                <th>Volume (USDC)</th>
                <th>Unique Buyers</th>
                <th>Sybil Audit</th>
                <th>Shadow Gateway</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="radar-tbody">
              ${initialSellerRows}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Claim Verified NullClear Gateway -->
    <section class="section-tight">
      <div id="claim-gateway-card" class="card">
        <div class="eyebrow">SELLER ONBOARDING</div>
        <h3 class="h3" style="margin-top:6px;">Claim Verified NullClear Gateway</h3>
        <p class="muted" style="font-size:13.5px;margin-top:4px;">
          Bind your Base seller wallet and upstream REST API to a NullClear-protected x402 gateway (<code>/g/:slug</code>).
        </p>
        <div class="input-row">
          <input id="claim-seller-address" class="input" placeholder="Seller Base Address (0x...)" value="${escapeHtml(claimSeller)}" />
          <input id="claim-slug" class="input" placeholder="Gateway Slug (e.g. base-seller-1234)" value="" />
        </div>
        <div class="input-row">
          <input id="claim-upstream-url" class="input" placeholder="Upstream REST API URL (https://...)" value="https://api.coinbase.com/v2/prices/ETH-USD/spot" />
          <input id="claim-price-usdc" class="input" style="max-width:140px;" placeholder="Price USDC" value="0.01" />
          <button type="button" class="btn btn-primary" onclick="registerClaimedGateway()">Create Verified Gateway</button>
        </div>
        <pre id="claim-gateway-result" class="code-block status-box"></pre>
      </div>
    </section>
  </main>

  ${renderDevFooter()}

  <script>
    let cachedEndpoints = [];
    let currentSort = 'uptime';

    function switchTab(tab) {
      document.getElementById('tab-uptime').style.display = tab === 'uptime' ? 'block' : 'none';
      document.getElementById('tab-radar').style.display = tab === 'radar' ? 'block' : 'none';
      document.getElementById('tab-btn-uptime').classList.toggle('active', tab === 'uptime');
      document.getElementById('tab-btn-radar').classList.toggle('active', tab === 'radar');
      if (tab === 'radar') loadOnchainFlows();
    }

    function copyProxyUrl(url, btn) {
      navigator.clipboard.writeText(url).catch(() => {});
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = prev; }, 1600);
    }

    function claimShadowGateway(sellerAddress, slug) {
      const addrInput = document.getElementById('claim-seller-address');
      const slugInput = document.getElementById('claim-slug');
      if (addrInput) addrInput.value = sellerAddress;
      if (slugInput) slugInput.value = slug || '';
      document.getElementById('claim-gateway-card').scrollIntoView({ behavior: 'smooth' });
    }

    async function loadDirectory() {
      try {
        const res = await fetch('/v1/bazaar/directory');
        const data = await res.json();
        if (Array.isArray(data.endpoints)) {
          cachedEndpoints = data.endpoints;
          renderLeaderboard();
        }
      } catch {}
    }

    function sortLeaderboard(by) {
      currentSort = by;
      renderLeaderboard();
    }

    function renderLeaderboard() {
      if (!cachedEndpoints.length) return;
      const list = [...cachedEndpoints];
      if (currentSort === 'uptime') {
        list.sort((a, b) => (b.uptime_score - a.uptime_score) || ((a.latency_ms || 9999) - (b.latency_ms || 9999)));
      } else if (currentSort === 'latency') {
        list.sort((a, b) => ((a.latency_ms || 9999) - (b.latency_ms || 9999)) || (b.uptime_score - a.uptime_score));
      } else if (currentSort === 'price') {
        list.sort((a, b) => Number(a.price_atomic || 10000) - Number(b.price_atomic || 10000));
      }

      const tbody = document.getElementById('leaderboard-tbody');
      tbody.innerHTML = list.map((ep, idx) => {
        const priceUsdc = ep.priceUsdc || (Number(ep.price_atomic || 10000) / 1e6).toFixed(2);
        const badgeClass = ep.uptime_score >= 98 ? 'tag-safe' : 'tag-warn';
        return '<tr>' +
          '<td class="mono dim">#' + (idx + 1) + '</td>' +
          '<td><div class="mono" style="font-weight:600;color:var(--text);font-size:12.5px;">' + ep.endpoint_url + '</div>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (ep.description || '') + '</div></td>' +
          '<td><span class="status-tag tag-neutral">' + (ep.category || 'data') + '</span></td>' +
          '<td><span class="status-tag ' + badgeClass + '">' + Number(ep.uptime_score).toFixed(1) + '%</span></td>' +
          '<td class="mono">' + Number(ep.hallucination_rate || 0).toFixed(1) + '%</td>' +
          '<td class="mono">' + (ep.latency_ms ?? 40) + ' ms</td>' +
          '<td class="mono">$' + priceUsdc + ' USDC</td>' +
          '<td><button type="button" class="btn btn-secondary btn-sm mono" onclick="copyProxyUrl(\\'' + ep.nullclear_proxy_url + '\\', this)">[Copy Zero-Loss Proxy URL]</button></td>' +
        '</tr>';
      }).join('');
    }

    async function submitCanaryEndpoint() {
      const endpointUrl = document.getElementById('canary-url').value.trim();
      const category = document.getElementById('canary-category').value.trim() || 'data';
      const box = document.getElementById('canary-result');
      box.style.display = 'block';
      box.textContent = 'Running non-invasive Canary Probe (4000ms timeout)...';
      try {
        const res = await fetch('/v1/radar/submit-endpoint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpointUrl, category })
        });
        const data = await res.json();
        box.textContent = JSON.stringify(data, null, 2);
        await loadDirectory();
      } catch (e) {
        box.textContent = 'Error: ' + e.message;
      }
    }

    async function loadOnchainFlows() {
      try {
        const res = await fetch('/v1/radar/onchain-flows');
        const data = await res.json();
        if (Array.isArray(data.topSellers) && data.topSellers.length > 0) {
          const tbody = document.getElementById('radar-tbody');
          tbody.innerHTML = data.topSellers.map((s, idx) => {
            const badge = s.wash_trade_flag === 1
              ? '<span class="status-tag tag-danger">WASH-TRADE FLAGGED (' + Math.round(s.top_counterparty_share * 100) + '%)</span>'
              : '<span class="status-tag tag-safe">CLEAN ORGANIC</span>';
            return '<tr>' +
              '<td class="mono dim">#' + (idx + 1) + '</td>' +
              '<td class="mono" style="font-size:12px;color:var(--text);">' + s.address + '</td>' +
              '<td class="mono">' + s.tx_count + '</td>' +
              '<td class="mono">$' + (s.total_volume_usdc || '0.00') + ' USDC</td>' +
              '<td class="mono">' + s.unique_counterparties + '</td>' +
              '<td>' + badge + '</td>' +
              '<td><code>/g/' + s.shadow_gateway_slug + '</code></td>' +
              '<td><button type="button" class="btn btn-secondary btn-sm" onclick="claimShadowGateway(\\'' + s.address + '\\', \\'' + s.shadow_gateway_slug + '\\')">[Claim Verified NullClear Gateway]</button></td>' +
            '</tr>';
          }).join('');
        }
      } catch {}
    }

    async function triggerRadarSync() {
      try {
        await fetch('/v1/radar/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        await loadOnchainFlows();
      } catch {}
    }

    async function registerClaimedGateway() {
      const sellerAddress = document.getElementById('claim-seller-address').value.trim();
      const slug = document.getElementById('claim-slug').value.trim();
      const upstreamUrl = document.getElementById('claim-upstream-url').value.trim();
      const priceUsdc = document.getElementById('claim-price-usdc').value.trim() || '0.01';
      const box = document.getElementById('claim-gateway-result');
      box.style.display = 'block';
      box.textContent = 'Registering Seller Gateway...';
      try {
        const res = await fetch('/v1/gateways', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sellerAddress, slug: slug || undefined, upstreamUrl, priceUsdc })
        });
        const data = await res.json();
        box.textContent = JSON.stringify(data, null, 2);
        await loadDirectory();
      } catch (e) {
        box.textContent = 'Error: ' + e.message;
      }
    }

    loadDirectory();
  </script>
</body>
</html>`;
}

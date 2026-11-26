import { DEV_FONTS_HEAD, DEV_SHELL_CSS, renderDevFooter, renderDevHeader } from "./dev-shell.js";

export function renderDevHomeHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear — Pre-Sign Firewall &amp; EIP-712 Policy Co-Signer</title>
  <meta name="description" content="7-chain Pre-Sign Security Firewall, EIP-712 Policy Co-Signer, Guarded JSON-RPC, and verifiable execution receipts powering Policy-Guarded Polymarket Execution on nullclear.com." />
  <meta property="og:title" content="NullClear — Pre-Sign Firewall &amp; EIP-712 Policy Co-Signer" />
  <meta property="og:description" content="Pre-execution security firewall, EIP-712 Policy Co-Signer, and verifiable receipts powering Polymarket Guarded Execution (nullclear.com) alongside x402 schema clearing." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://nullclear.dev" />
  ${DEV_FONTS_HEAD}
  <style>
    ${DEV_SHELL_CSS}

    .hero-split {
      display: grid;
      grid-template-columns: 1.05fr 1fr;
      gap: 44px;
      align-items: center;
      padding: 64px 0 72px;
      border-bottom: 1px solid var(--border);
    }
    .hero-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 28px;
    }
    .hero-meta-strip {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--dim);
    }
    .hero-meta-strip strong { color: var(--text); font-weight: 600; }

    /* Quickstart Terminal Card */
    .term-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .term-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      padding: 0 12px;
      background: var(--surface-2);
      gap: 8px;
    }
    .term-tabs {
      display: flex;
      align-items: center;
      gap: 2px;
      overflow-x: auto;
    }
    .term-tab {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 500;
      padding: 11px 12px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.15s, border-color 0.15s;
    }
    .term-tab:hover { color: var(--text); }
    .term-tab.active {
      color: var(--text);
      border-bottom-color: var(--text);
    }
    .copy-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      padding: 4px 9px;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.15s, border-color 0.15s;
    }
    .copy-btn:hover { color: var(--text); border-color: var(--border-hover); }
    .term-body {
      padding: 18px 20px;
      background: #060608;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12.5px;
      line-height: 1.7;
      color: #E4E4E7;
      min-height: 172px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      overflow-x: auto;
    }
    .term-footer {
      border-top: 1px solid var(--border);
      padding: 10px 16px;
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11.5px;
      color: var(--dim);
      gap: 10px;
      flex-wrap: wrap;
    }

    /* Technical Workbench */
    .workbench-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 28px;
    }
    .inspector-form {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    .inspector-form .select { width: 132px; }
    .inspector-form .input { flex: 1; min-width: 200px; }
    .preset-links {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      margin-top: 12px;
      font-size: 12px;
      color: var(--dim);
    }
    .preset-link {
      background: none;
      border: none;
      padding: 0;
      color: var(--muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      cursor: pointer;
      text-decoration: underline;
      text-decoration-color: var(--border);
      text-underline-offset: 3px;
      transition: color 0.15s;
    }
    .preset-link:hover { color: var(--text); text-decoration-color: var(--muted); }

    /* Chaos Simulator Tabular Bench */
    .sim-list {
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      margin-top: 16px;
      background: var(--bg);
    }
    .sim-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 14px;
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--border);
      color: var(--text);
      text-align: left;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.12s;
    }
    .sim-row:last-child { border-bottom: none; }
    .sim-row:hover { background: var(--surface-2); }
    .sim-row-title { font-size: 13px; font-weight: 500; color: var(--text); }
    .sim-row-desc { font-size: 12px; color: var(--dim); margin-top: 2px; }
    .sim-row-right { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }

    /* Primitives 2x2 Hairline Grid */
    .primitives-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      margin-top: 28px;
      background: var(--border);
      gap: 1px;
    }
    .primitive-cell {
      background: var(--surface);
      padding: 28px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
      transition: background 0.15s;
    }
    .primitive-cell:hover { background: #141417; }
    .primitive-ep {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .primitive-link {
      font-size: 13px;
      font-weight: 500;
      color: var(--text);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .primitive-link:hover { text-decoration: underline; text-underline-offset: 3px; }

    /* Secondary utility tools strip */
    .utility-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 20px;
    }
    .input-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .input-row .input { flex: 1; min-width: 180px; }

    .method-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .m-get { color: var(--safe); background: var(--safe-bg); }
    .m-post { color: var(--text); background: var(--surface-2); border: 1px solid var(--border); }

    @media (max-width: 960px) {
      .hero-split, .workbench-grid, .primitives-grid, .utility-grid {
        grid-template-columns: 1fr;
      }
      .hero-split { padding: 40px 0 48px; gap: 32px; }
    }
    @media (max-width: 560px) {
      .term-tab { padding: 10px 7px; font-size: 11px; }
      .term-header { padding: 0 8px; }
      .term-body { padding: 14px 14px; font-size: 11.5px; }
    }
  </style>
</head>
<body>
  ${renderDevHeader("home")}

  <main class="container">
    <!-- Asymmetric Developer-First Hero -->
    <section class="hero-split">
      <div>
        <div class="eyebrow">PROTOCOL v1.8 &middot; PRE-SIGN FIREWALL &middot; EIP-712 POLICY CO-SIGNER</div>
        <h1 class="h1" style="margin-top:14px;">Pre-Sign Firewall &amp; Policy Co-Signer for On-Chain Execution.</h1>
        <p class="lead" style="margin-top:16px;max-width:540px;">
          Enforce hard non-custodial spend caps, slippage locks, fee-drag guards, and 7-chain bytecode/permit security before any signature lands on-chain. Every approved or blocked order emits a verifiable public receipt at <code>/receipt/:id</code>.
        </p>
        <div style="margin-top:16px;padding:12px 14px;border-radius:8px;background:var(--safe-bg);border:1px solid var(--safe-border);font-size:13px;">
          <strong style="color:var(--safe);">Flagship Live Consumer Implementation:</strong>
          <a href="https://nullclear.com" style="text-decoration:underline;text-underline-offset:3px;font-weight:600;">Policy-Guarded Polymarket Execution &amp; Whale Copy-Tax Terminal (nullclear.com) &#8599;</a>
        </div>
        <div class="hero-actions">
          <a href="https://nullclear.com/terminal" class="btn btn-primary">Launch Polymarket Terminal &#8599;</a>
          <a href="#workbench" class="btn btn-secondary">Inspect a Contract</a>
          <a href="/history" class="btn btn-secondary">Open Live Telemetry</a>
        </div>
        <div class="hero-meta-strip">
          <span><strong>EIP-712</strong> Policy Co-Signer</span>
          <span><strong>CLOB V2</strong> Polymarket Receipts</span>
          <span><strong>&lt;5ms</strong> KV pass auth</span>
        </div>
      </div>

      <!-- Interactive Quickstart Terminal Card -->
      <div class="term-card">
        <div class="term-header">
          <div class="term-tabs" role="tablist">
            <button type="button" class="term-tab active" data-qs="mcp" onclick="selectQuickstart('mcp', this)">MCP</button>
            <button type="button" class="term-tab" data-qs="rpc" onclick="selectQuickstart('rpc', this)">Guarded RPC</button>
            <button type="button" class="term-tab" data-qs="sdk" onclick="selectQuickstart('sdk', this)">SDK</button>
            <button type="button" class="term-tab" data-qs="curl" onclick="selectQuickstart('curl', this)">x402 cURL</button>
          </div>
          <button type="button" id="qsCopyBtn" class="copy-btn" onclick="copyQuickstart()">Copy</button>
        </div>
        <pre id="qsCode" class="term-body"># Claude Code / Cursor / Smithery (zero API key)
claude mcp add --transport http nullclear https://api.nullclear.dev/mcp

# Or run stdio MCP server via npx
npx -y @nullclear/mcp</pre>
        <div class="term-footer">
          <span>Base &middot; ETH &middot; Arb &middot; OP &middot; Polygon &middot; BSC &middot; Solana</span>
          <a href="/openapi.json" style="color:var(--muted);">OpenAPI 3.1 &#8599;</a>
        </div>
      </div>
    </section>

    <!-- Live Forensic Inspector & Firewall Sandbox -->
    <section id="workbench" class="section">
      <div class="eyebrow">INTERACTIVE WORKBENCH</div>
      <h2 class="h2" style="margin-top:8px;">Live Forensic Inspector &amp; Firewall Sandbox</h2>
      <p class="muted" style="font-size:14.5px;margin-top:6px;max-width:660px;">
        Execute live edge queries against <code>/v1/scan</code>, <code>/v1/decode</code>, and <code>/v1/clear</code> with your 10 daily zero-key trial calls.
      </p>

      <div class="workbench-grid">
        <!-- Left: 7-Chain Contract & Calldata Inspector -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <h3 class="h3">7-Chain Contract &amp; Calldata Inspector</h3>
            <span class="status-tag tag-safe">LIVE EDGE</span>
          </div>
          <p class="muted" style="font-size:13px;margin-top:6px;">
            Paste any EVM contract, Solana mint, 66-char tx hash, or raw revert/calldata hex.
          </p>
          <form id="universalOmniboxForm" class="inspector-form" onsubmit="event.preventDefault(); executeOmniboxInput();">
            <select id="omniboxChain" class="select" aria-label="Chain">
              <option value="base">Base</option>
              <option value="eth">Ethereum</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="optimism">Optimism</option>
              <option value="polygon">Polygon</option>
              <option value="bsc">BSC</option>
              <option value="solana">Solana</option>
            </select>
            <input
              id="omniboxInput"
              class="input"
              value="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
              placeholder="0x... address, Solana mint, or revert hex"
            />
            <button type="submit" class="btn btn-primary">Inspect</button>
          </form>
          <div class="preset-links">
            <span class="mono">Presets:</span>
            <button type="button" class="preset-link" onclick="runOmniboxDemo('usdc')">Base USDC</button>
            <button type="button" class="preset-link" onclick="runOmniboxDemo('decode')">Decode Revert</button>
            <button type="button" class="preset-link" onclick="runOmniboxDemo('feed')">Live Feed</button>
            <a href="/scan/base/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" class="preset-link">Full Scorecard &#8599;</a>
          </div>
          <pre id="omniboxOutput" class="code-block" style="margin-top:14px;min-height:190px;max-height:280px;">// Select a preset or submit any contract address to run a live edge scan.</pre>
        </div>

        <!-- Right: Zero-Wallet x402 Chaos Simulator -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <h3 class="h3">Zero-Wallet x402 Chaos Simulator</h3>
            <span class="status-tag tag-neutral">NO KEY REQUIRED</span>
          </div>
          <p class="muted" style="font-size:13px;margin-top:6px;">
            Verify how Deferred Non-Custodial Escrow settles valid responses and shreds payment on refusals or 5xx faults.
          </p>
          <div class="sim-list">
            <button type="button" class="sim-row" onclick="runChaosSim('honest')">
              <div>
                <div class="sim-row-title">Honest Market Oracle</div>
                <div class="sim-row-desc mono">/v1/sandbox/market-feed &middot; schema passes</div>
              </div>
              <span class="sim-row-right">
                <span class="status-tag tag-safe">200</span>
                <span class="mono dim" style="font-size:12px;">Run</span>
              </span>
            </button>
            <button type="button" class="sim-row" onclick="runChaosSim('hallucinate')">
              <div>
                <div class="sim-row-title">Hallucinating AI Seller</div>
                <div class="sim-row-desc mono">/v1/sandbox/hallucinating-seller &middot; refusal shredded ($0)</div>
              </div>
              <span class="sim-row-right">
                <span class="status-tag tag-danger">402</span>
                <span class="mono dim" style="font-size:12px;">Run</span>
              </span>
            </button>
            <button type="button" class="sim-row" onclick="runChaosSim('crash')">
              <div>
                <div class="sim-row-title">Crashing 500 Upstream</div>
                <div class="sim-row-desc mono">/v1/sandbox/crashing-seller &middot; escrow voided ($0)</div>
              </div>
              <span class="sim-row-right">
                <span class="status-tag tag-danger">500</span>
                <span class="mono dim" style="font-size:12px;">Run</span>
              </span>
            </button>
            <button type="button" class="sim-row" onclick="runChaosSim('token')">
              <div>
                <div class="sim-row-title">Base USDC Token Security Oracle</div>
                <div class="sim-row-desc mono">/v1/bazaar/token-security &middot; free-trial opt-in</div>
              </div>
              <span class="sim-row-right">
                <span class="status-tag tag-safe">200</span>
                <span class="mono dim" style="font-size:12px;">Run</span>
              </span>
            </button>
          </div>
          <pre id="chaos-output" class="code-block" style="margin-top:14px;min-height:130px;max-height:240px;">// Trigger any scenario above to inspect the live arbiter verdict.</pre>
        </div>
      </div>

      <!-- Utility Tools: URL-Prefix Proxy & Seller Gateway Builder -->
      <div class="utility-grid">
        <div class="card">
          <div class="eyebrow">AUTO-GUARD PROXY</div>
          <h3 class="h3" style="margin-top:6px;">URL-Prefix Verification Proxy</h3>
          <p class="muted" style="font-size:13px;margin-top:4px;">
            Prepend <code>https://api.nullclear.dev/</code> to any endpoint to block LLM refusals, 5xx crashes, and empty bodies.
          </p>
          <div class="input-row">
            <input id="proxy-url-input" class="input" value="https://api.nullclear.dev/v1/sandbox/market-feed" placeholder="https://api.example.com/v1/data" />
            <button type="button" class="btn btn-secondary" onclick="runPrefixProxy()">Verify URL</button>
          </div>
          <pre id="proxy-output" class="code-block" style="margin-top:12px;max-height:160px;">GET https://api.nullclear.dev/https://api.coinbase.com/v2/prices/ETH-USD/spot</pre>
        </div>

        <div class="card">
          <div class="eyebrow">SELLER GATEWAY</div>
          <h3 class="h3" style="margin-top:6px;">Register x402 Gateway (<code>/g/:slug</code>)</h3>
          <p class="muted" style="font-size:13px;margin-top:4px;">
            Wrap any REST endpoint with an automatic HTTP 402 challenge and refusal guard.
          </p>
          <div class="input-row">
            <input id="gw-upstream" class="input" placeholder="Upstream REST URL (https://...)" value="https://api.coinbase.com/v2/prices/ETH-USD/spot" />
          </div>
          <div class="input-row">
            <input id="gw-wallet" class="input" placeholder="Base 0x Wallet" value="0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c" />
            <input id="gw-slug" class="input" style="max-width:150px;" placeholder="slug" value="" />
            <button type="button" class="btn btn-secondary" onclick="createSellerGateway()">Create</button>
          </div>
          <pre id="gw-output" class="code-block" style="margin-top:12px;max-height:160px;">// POST /v1/gateways -> https://api.nullclear.dev/g/&lt;slug&gt;</pre>
        </div>
      </div>
    </section>

    <!-- Core Primitives 2x2 Hairline Grid -->
    <section class="section">
      <div class="eyebrow">ARCHITECTURE</div>
      <h2 class="h2" style="margin-top:8px;">Core Primitives</h2>
      <div class="primitives-grid">
        <div class="primitive-cell">
          <div>
            <div class="primitive-ep">POST /v1/guard &middot; GET /v1/bazaar/token-security</div>
            <h3 class="h3">Pre-Sign Firewall &amp; Token Security</h3>
            <p class="muted" style="font-size:13.5px;margin-top:8px;">
              Recursive Multicall3, Universal Router, and Safe unwrapping, EIP-712 Permit auditing, stateful <code>eth_simulateV1</code> / Solana simulation, and 7-chain honeypot &amp; tax consensus in one call.
            </p>
          </div>
          <a href="/firewall" class="primitive-link">Explore Firewall &amp; SDKs &rarr;</a>
        </div>

        <div class="primitive-cell">
          <div>
            <div class="primitive-ep">POST /rpc/:chain/:apiKey</div>
            <h3 class="h3">Drop-In Guarded JSON-RPC</h3>
            <p class="muted" style="font-size:13.5px;margin-top:8px;">
              Swap a single <code>RPC_URL</code> environment variable. Read methods execute at 0 credits with &lt;5ms KV auth; write broadcasts are pre-flighted and blocked on drainers, honeypots, or reverts.
            </p>
          </div>
          <a href="/firewall" class="primitive-link">Configure Guarded RPC &rarr;</a>
        </div>

        <div class="primitive-cell">
          <div>
            <div class="primitive-ep">POST /v1/pass/buy &middot; POST /v1/policy/cosign</div>
            <h3 class="h3">Prepaid Passes &amp; Policy Co-Signer</h3>
            <p class="muted" style="font-size:13.5px;margin-top:8px;">
              Self-serve $5–$100 Bearer keys (<code>nc_live_...</code>) for high-throughput agents without per-call x402 latency, paired with non-custodial EIP-712 spend and tax policy co-signing.
            </p>
          </div>
          <a href="/buy-pass" class="primitive-link">Mint a Prepaid Pass &rarr;</a>
        </div>

        <div class="primitive-cell">
          <div>
            <div class="primitive-ep">POST /v1/clear &middot; GET /receipt/:id</div>
            <h3 class="h3">x402 Schema Escrow &amp; Receipt Verifier</h3>
            <p class="muted" style="font-size:13.5px;margin-top:8px;">
              Deferred Non-Custodial Escrow via EIP-3009 authorizations. Upstream payloads are validated against JSON Schema, numeric invariants, and refusal traps before settlement, emitting verifiable receipts.
            </p>
          </div>
          <a href="/x402" class="primitive-link">Open x402 Clearinghouse &rarr;</a>
        </div>
      </div>
    </section>

    <!-- Protocol Endpoints Reference -->
    <section class="section">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
        <div>
          <div class="eyebrow">API REFERENCE</div>
          <h2 class="h2" style="margin-top:8px;">Protocol Endpoints</h2>
        </div>
        <div style="display:flex;gap:10px;">
          <a href="/openapi.json" class="btn btn-secondary btn-sm mono">/openapi.json</a>
          <a href="/llms.txt" class="btn btn-secondary btn-sm mono">/llms.txt</a>
        </div>
      </div>
      <div class="card-flat">
        <div class="table-wrap">
          <table class="dev-table">
            <thead>
              <tr>
                <th style="width:100px;">Method</th>
                <th style="width:280px;">Endpoint</th>
                <th>Capability</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span class="method-badge m-post">POST</span></td>
                <td class="mono">/v1/guard</td>
                <td class="muted">1-call pre-sign transaction firewall across 7 chains (10 free/day/IP)</td>
              </tr>
              <tr>
                <td><span class="method-badge m-post">POST</span></td>
                <td class="mono">/rpc/:chain/:apiKey</td>
                <td class="muted">Drop-in Guarded JSON-RPC with 0-credit reads and broadcast protection</td>
              </tr>
              <tr>
                <td><span class="method-badge m-get">GET</span></td>
                <td class="mono">/v1/scan/:chain/:address</td>
                <td class="muted">Multi-oracle token security, Token-2022, proxy resolution, and tax audit</td>
              </tr>
              <tr>
                <td><span class="method-badge m-get">GET</span></td>
                <td class="mono">/v1/inspect/:chain/:address</td>
                <td class="muted">Proxy slot reader (EIP-1967/1822/Beacon/Diamond/Safe), ABI, and CFG risk</td>
              </tr>
              <tr>
                <td><span class="method-badge m-post">POST</span></td>
                <td class="mono">/v1/decode</td>
                <td class="muted">Recursive calldata unwrap, EIP-712 Permit/Seaport audit, and Solana wire parse</td>
              </tr>
              <tr>
                <td><span class="method-badge m-post">POST</span></td>
                <td class="mono">/v1/clear</td>
                <td class="muted">Deferred Non-Custodial Escrow proxy with JSON Schema invariants and failover</td>
              </tr>
              <tr>
                <td><span class="method-badge m-post">POST</span></td>
                <td class="mono">/v1/pass/buy</td>
                <td class="muted">Self-serve Prepaid Pass minting ($5 / $25 / $100 USDC &rarr; <code>nc_live_...</code>)</td>
              </tr>
              <tr>
                <td><span class="method-badge m-post">POST</span></td>
                <td class="mono">/v1/policy/cosign</td>
                <td class="muted">EIP-712 PolicyApproval co-signer for Safe, ERC-4337, and agent treasuries</td>
              </tr>
              <tr>
                <td><span class="method-badge m-get">GET</span></td>
                <td class="mono">/v1/bazaar/token-security</td>
                <td class="muted">Strict HTTP 402 pay-per-call x402 Bazaar security oracle ($0.005 USDC)</td>
              </tr>
              <tr>
                <td><span class="method-badge m-get">GET</span></td>
                <td class="mono"><a href="/history" style="color:var(--text);">/history</a></td>
                <td class="muted">Real-time verification, quota telemetry, and clearing explorer</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </main>

  ${renderDevFooter()}

  <script>
    const QUICKSTART_SNIPPETS = {
      mcp: \`# Claude Code / Cursor / Smithery (zero API key)
claude mcp add --transport http nullclear https://api.nullclear.dev/mcp

# Or run stdio MCP server via npx
npx -y @nullclear/mcp\`,
      rpc: \`# 1. Mint a Prepaid Pass ($5 = 2,000 credits, <5ms KV auth)
curl -X POST https://api.nullclear.dev/v1/pass/buy

# 2. Swap your RPC_URL — 0-credit reads, auto-blocked drainers
BASE_RPC_URL="https://api.nullclear.dev/rpc/base/nc_live_..."\`,
      sdk: \`# Coinbase AgentKit or ElizaOS drop-in wallet guard
npm i @nullclear/agentkit

import { createNullClearWalletGuard } from "@nullclear/agentkit";
const guardedWallet = createNullClearWalletGuard(walletProvider);\`,
      curl: \`# 1-Call Pre-Sign Firewall (10 free/day, then $0.005 x402 USDC)
curl -s -X POST https://api.nullclear.dev/v1/guard \\
  -H "Content-Type: application/json" \\
  -d '{"chain":"base","to":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","data":"0x095ea7b3..."}'\`
    };
    let activeQsKey = 'mcp';

    function selectQuickstart(key, btn) {
      activeQsKey = key;
      document.querySelectorAll('.term-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('qsCode').textContent = QUICKSTART_SNIPPETS[key] || '';
    }

    function copyQuickstart() {
      const txt = QUICKSTART_SNIPPETS[activeQsKey] || '';
      navigator.clipboard.writeText(txt).catch(() => {});
      const btn = document.getElementById('qsCopyBtn');
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    }

    async function executeOmniboxInput() {
      const raw = document.getElementById('omniboxInput').value.trim();
      let chain = document.getElementById('omniboxChain').value;
      const out = document.getElementById('omniboxOutput');
      out.textContent = 'Running edge forensic analysis...';
      try {
        let cleaned = raw;
        if (/^https?:\\/\\//i.test(raw)) {
          if (/etherscan\\.io/i.test(raw)) chain = 'eth';
          if (/solscan\\.io|dexscreener\\.com\\/solana/i.test(raw)) chain = 'solana';
          const addrMatch = raw.match(/0x[a-fA-F0-9]{40,64}/);
          if (addrMatch) cleaned = addrMatch[0];
        }
        if (/^0x[a-fA-F0-9]+$/.test(cleaned) && cleaned.length !== 42) {
          const res = await fetch('/v1/decode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: cleaned, chain })
          });
          out.textContent = JSON.stringify(await res.json(), null, 2);
          return;
        }
        if (!cleaned.startsWith('0x') && cleaned.length >= 32 && cleaned.length <= 44) {
          chain = 'solana';
        }
        const res = await fetch('/v1/scan/' + encodeURIComponent(chain) + '/' + encodeURIComponent(cleaned));
        out.textContent = JSON.stringify(await res.json(), null, 2);
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    }

    async function runOmniboxDemo(type) {
      const input = document.getElementById('omniboxInput');
      const chainSel = document.getElementById('omniboxChain');
      const out = document.getElementById('omniboxOutput');
      if (type === 'usdc') {
        chainSel.value = 'base';
        input.value = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        await executeOmniboxInput();
      } else if (type === 'decode') {
        chainSel.value = 'base';
        input.value = '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001d45524332303a20696e73756666696369656e7420616c6c6f77616e6365000000';
        await executeOmniboxInput();
      } else if (type === 'feed') {
        out.textContent = 'Loading /v1/trending...';
        try {
          const res = await fetch('/v1/trending');
          out.textContent = JSON.stringify(await res.json(), null, 2);
        } catch (e) {
          out.textContent = 'Error: ' + e.message;
        }
      }
    }

    async function runChaosSim(mode) {
      const out = document.getElementById('chaos-output');
      out.textContent = 'Running live verification through NullClear Arbiter...';
      try {
        if (mode === 'token') {
          const res = await fetch('/v1/bazaar/token-security?tokenAddress=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&trial=true', {
            headers: { 'x-nullclear-free-trial': 'true' }
          });
          const data = await res.json();
          out.textContent = 'HTTP ' + res.status + ' | x-nullclear-tier: ' + (res.headers.get('x-nullclear-tier') || 'free-trial') +
            ' | remaining: ' + (res.headers.get('x-nullclear-remaining-free-calls') || '9') + '\\n\\n' + JSON.stringify(data, null, 2);
          return;
        }
        const targetMap = {
          honest: 'https://api.nullclear.dev/v1/sandbox/market-feed',
          hallucinate: 'https://api.nullclear.dev/v1/sandbox/hallucinating-seller',
          crash: 'https://api.nullclear.dev/v1/sandbox/crashing-seller'
        };
        const res = await fetch('/v1/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-nullclear-free-trial': 'true' },
          body: JSON.stringify({
            targetUrl: targetMap[mode],
            paymentSignatureHeader: 'free-trial',
            validation: {
              expectedStatus: [200],
              rejectRefusals: true,
              invariants: [{ path: 'price', gt: 0 }]
            }
          })
        });
        const data = await res.json();
        out.textContent = 'HTTP ' + res.status + (res.status === 200 ? ' (CLEARED & VERIFIED)' : ' (PAYMENT SHREDDED — $0.00 CHARGED)') +
          '\\n\\n' + JSON.stringify(data, null, 2);
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    }

    async function runPrefixProxy() {
      const url = document.getElementById('proxy-url-input').value.trim();
      const out = document.getElementById('proxy-output');
      out.textContent = 'Fetching via Auto-Guard URL-Prefix Proxy...';
      try {
        const res = await fetch('/v1/proxy?url=' + encodeURIComponent(url), {
          headers: { 'x-nullclear-free-trial': 'true' }
        });
        const text = await res.text();
        let formatted = text;
        try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch {}
        out.textContent = 'HTTP ' + res.status +
          ' | X-NullClear-Verified: ' + res.headers.get('X-NullClear-Verified') +
          ' | Receipt: ' + (res.headers.get('X-NullClear-Receipt-Id') || 'none') +
          '\\n\\n' + formatted;
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    }

    async function createSellerGateway() {
      const upstreamUrl = document.getElementById('gw-upstream').value.trim();
      const sellerAddress = document.getElementById('gw-wallet').value.trim();
      const slug = document.getElementById('gw-slug').value.trim() || ('api-' + Math.random().toString(36).slice(2, 7));
      const out = document.getElementById('gw-output');
      out.textContent = 'Registering Seller Gateway...';
      try {
        const res = await fetch('/v1/gateways', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            upstreamUrl,
            sellerAddress,
            priceUsdc: '0.01',
            slug,
            validationPreset: 'STRICT_NO_REFUSAL'
          })
        });
        const data = await res.json();
        out.textContent = 'HTTP ' + res.status + '\\n\\n' + JSON.stringify(data, null, 2);
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
}

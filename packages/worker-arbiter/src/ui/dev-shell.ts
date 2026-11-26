export type DevNavTab = "home" | "firewall" | "x402" | "history" | "leaderboard";

export function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const DEV_SHELL_CSS = `
  :root {
    --bg: #09090B;
    --surface: #111113;
    --surface-2: #18181B;
    --border: #27272A;
    --border-hover: #3F3F46;
    --text: #FAFAFA;
    --muted: #A1A1AA;
    --dim: #71717A;
    --safe: #10B981;
    --safe-bg: rgba(16, 185, 129, 0.1);
    --safe-border: rgba(16, 185, 129, 0.28);
    --danger: #EF4444;
    --danger-bg: rgba(239, 68, 68, 0.1);
    --danger-border: rgba(239, 68, 68, 0.28);
    --warn: #F59E0B;
    --warn-bg: rgba(245, 158, 11, 0.1);
    --warn-border: rgba(245, 158, 11, 0.28);
    --info: #38BDF8;
    --info-bg: rgba(56, 189, 248, 0.1);
    --info-border: rgba(56, 189, 248, 0.25);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background-color: var(--bg);
    color: var(--text);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  a { color: inherit; text-decoration: none; }
  code {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.86em;
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 0.12rem 0.38rem;
    border-radius: 4px;
    color: #E4E4E7;
  }

  .container { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
  .container-wide { max-width: 1280px; margin: 0 auto; padding: 0 24px; }

  /* Sticky 64px single-row header */
  .dev-header {
    position: sticky;
    top: 0;
    z-index: 50;
    height: 64px;
    background: rgba(9, 9, 11, 0.92);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
  }
  .dev-header-inner {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .dev-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .dev-brand-mark {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--text);
    color: var(--bg);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 14px;
    letter-spacing: -0.04em;
  }
  .dev-brand-name {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .dev-badge-mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1.2;
  }
  .dev-agent-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--dim);
    border-left: 1px solid var(--border);
    padding-left: 10px;
    white-space: nowrap;
  }
  .dev-nav {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .dev-nav a {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--muted);
    padding: 6px 12px;
    border-radius: 6px;
    white-space: nowrap;
    transition: color 0.15s, background 0.15s;
  }
  .dev-nav a:hover {
    color: var(--text);
    background: var(--surface-2);
  }
  .dev-nav a.active {
    color: var(--text);
    background: var(--surface-2);
  }
  .dev-nav-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .dev-menu-btn {
    display: none;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    width: 36px;
    height: 36px;
    border-radius: 6px;
    cursor: pointer;
    align-items: center;
    justify-content: center;
  }
  .dev-mobile-drawer {
    display: none;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 12px 24px 18px;
  }
  .dev-mobile-drawer.open { display: block; }
  .dev-mobile-drawer a {
    display: block;
    padding: 10px 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  .dev-mobile-drawer a:last-child { border-bottom: none; }
  .dev-mobile-drawer a.active, .dev-mobile-drawer a:hover { color: var(--text); }

  /* Disciplined 2-button hierarchy */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 14px;
    font-size: 13.5px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    font-family: inherit;
    text-decoration: none;
  }
  .btn-primary {
    background: var(--text);
    color: var(--bg);
    border: 1px solid var(--text);
    font-weight: 600;
  }
  .btn-primary:hover {
    background: #E4E4E7;
    border-color: #E4E4E7;
  }
  .btn-secondary {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover {
    border-color: var(--border-hover);
    background: var(--surface-2);
  }
  .btn-sm {
    padding: 6px 10px;
    font-size: 12.5px;
  }

  /* Surfaces & layout */
  .section { padding: 64px 0; border-bottom: 1px solid var(--border); }
  .section:last-of-type { border-bottom: none; }
  .section-tight { padding: 40px 0; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
  }
  .card-flat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .h1 {
    font-size: clamp(32px, 4.2vw, 48px);
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1.1;
    color: var(--text);
  }
  .h2 {
    font-size: clamp(22px, 2.4vw, 28px);
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.25;
    color: var(--text);
  }
  .h3 {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--text);
  }
  .lead {
    font-size: 16px;
    color: var(--muted);
    line-height: 1.65;
  }
  .muted { color: var(--muted); }
  .dim { color: var(--dim); }

  /* Inputs & code */
  .input, .select {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 9px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-family: 'JetBrains Mono', monospace;
    outline: none;
    transition: border-color 0.15s;
  }
  .input:focus, .select:focus { border-color: var(--border-hover); }
  .code-block {
    background: #060608;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12.5px;
    line-height: 1.6;
    color: #D4D4D8;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Badges */
  .status-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .tag-safe { color: var(--safe); background: var(--safe-bg); border: 1px solid var(--safe-border); }
  .tag-danger { color: var(--danger); background: var(--danger-bg); border: 1px solid var(--danger-border); }
  .tag-warn { color: var(--warn); background: var(--warn-bg); border: 1px solid var(--warn-border); }
  .tag-info { color: var(--info); background: var(--info-bg); border: 1px solid var(--info-border); }
  .tag-neutral { color: var(--muted); background: var(--surface-2); border: 1px solid var(--border); }

  /* Hairline tables */
  .table-wrap { overflow-x: auto; }
  table.dev-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  table.dev-table th, table.dev-table td {
    text-align: left;
    padding: 11px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  table.dev-table th {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--dim);
    background: var(--surface);
  }
  table.dev-table tr:last-child td { border-bottom: none; }
  table.dev-table tbody tr:hover td { background: rgba(255, 255, 255, 0.015); }

  /* Footer */
  .dev-footer {
    border-top: 1px solid var(--border);
    padding: 48px 0 56px;
    margin-top: 64px;
    color: var(--muted);
    font-size: 13px;
  }
  .dev-footer-grid {
    display: grid;
    grid-template-columns: 1.6fr 1fr 1fr 1fr;
    gap: 32px;
    margin-bottom: 36px;
  }
  .dev-footer-heading {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dim);
    margin-bottom: 12px;
  }
  .dev-footer-links {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dev-footer-links a {
    color: var(--muted);
    font-size: 13px;
    transition: color 0.15s;
  }
  .dev-footer-links a:hover { color: var(--text); }
  .dev-footer-bottom {
    border-top: 1px solid var(--border);
    padding-top: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 12px;
    color: var(--dim);
  }

  @media (max-width: 1024px) {
    .dev-agent-tag { display: none; }
  }
  @media (max-width: 860px) {
    .dev-nav { display: none; }
    .dev-menu-btn { display: inline-flex; }
    .dev-footer-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 560px) {
    .container, .container-wide { padding: 0 16px; }
    .dev-footer-grid { grid-template-columns: 1fr; }
    .dev-nav-right .btn { display: none; }
  }
`;

export const DEV_FONTS_HEAD = `
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
`;

export function renderDevHeader(active: DevNavTab, wide = false): string {
  const wrapClass = wide ? "container-wide" : "container";
  return `
  <header class="dev-header">
    <div class="${wrapClass} dev-header-inner">
      <a href="/" class="dev-brand">
        <span class="dev-brand-mark" aria-hidden="true">N</span>
        <span class="dev-brand-name">NullClear</span>
        <span class="dev-badge-mono">dev</span>
        <span class="dev-agent-tag">ERC-8004 #124595</span>
      </a>
      <nav class="dev-nav" aria-label="Primary">
        <a href="/firewall" class="${active === "firewall" ? "active" : ""}">Firewall &amp; RPC</a>
        <a href="/x402" class="${active === "x402" ? "active" : ""}">x402</a>
        <a href="/history" class="${active === "history" ? "active" : ""}">Telemetry</a>
        <a href="/leaderboard" class="${active === "leaderboard" ? "active" : ""}">Leaderboard</a>
        <a href="https://nullclear.com">Polymarket Terminal &#8599;</a>
      </nav>
      <div class="dev-nav-right">
        <a href="/buy-pass" class="btn btn-primary btn-sm">Get Pass</a>
        <button type="button" class="dev-menu-btn" aria-label="Toggle navigation" onclick="document.getElementById('devMobileNav').classList.toggle('open')">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="2" y1="4" x2="14" y2="4"></line>
            <line x1="2" y1="8" x2="14" y2="8"></line>
            <line x1="2" y1="12" x2="14" y2="12"></line>
          </svg>
        </button>
      </div>
    </div>
    <div id="devMobileNav" class="dev-mobile-drawer">
      <a href="/" class="${active === "home" ? "active" : ""}">Developer Portal</a>
      <a href="/firewall" class="${active === "firewall" ? "active" : ""}">Firewall &amp; RPC</a>
      <a href="/x402" class="${active === "x402" ? "active" : ""}">x402 Clearinghouse</a>
      <a href="/history" class="${active === "history" ? "active" : ""}">Telemetry</a>
      <a href="/leaderboard" class="${active === "leaderboard" ? "active" : ""}">Leaderboard</a>
      <a href="https://nullclear.com">Polymarket Guard (nullclear.com) &#8599;</a>
      <a href="/buy-pass">Get Prepaid Pass</a>
    </div>
  </header>`;
}

export function renderDevFooter(wide = false): string {
  const wrapClass = wide ? "container-wide" : "container";
  return `
  <footer class="dev-footer">
    <div class="${wrapClass}">
      <div class="dev-footer-grid">
        <div>
          <div class="dev-brand" style="margin-bottom:10px;">
            <span class="dev-brand-mark" aria-hidden="true">N</span>
            <span class="dev-brand-name">NullClear Arbiter</span>
          </div>
          <p style="font-size:13px;color:var(--muted);max-width:300px;line-height:1.6;">
            Pre-execution security firewall, Guarded JSON-RPC, and non-custodial x402 clearinghouse for autonomous agents across 7 chains.
          </p>
          <p class="mono" style="font-size:12px;color:var(--dim);margin-top:12px;">
            <a href="mailto:ops@nullclear.dev" style="color:var(--muted);">ops@nullclear.dev</a>
          </p>
        </div>
        <div>
          <div class="dev-footer-heading">Protocol</div>
          <ul class="dev-footer-links">
            <li><a href="/firewall">Firewall &amp; Guarded RPC</a></li>
            <li><a href="/x402">x402 Clearinghouse</a></li>
            <li><a href="/history">Live History &amp; Diagnostics</a></li>
            <li><a href="/leaderboard">Uptime Leaderboard</a></li>
            <li><a href="/buy-pass">Prepaid Passes</a></li>
          </ul>
        </div>
        <div>
          <div class="dev-footer-heading">Discovery</div>
          <ul class="dev-footer-links mono" style="font-size:12px;">
            <li><a href="/.well-known/x402">/.well-known/x402</a></li>
            <li><a href="/openapi.json">/openapi.json</a></li>
            <li><a href="/llms.txt">/llms.txt</a></li>
            <li><a href="/.well-known/mcp.json">/.well-known/mcp.json</a></li>
            <li><a href="/v1/telemetry/history">/v1/telemetry/history</a></li>
          </ul>
        </div>
        <div>
          <div class="dev-footer-heading">Packages &amp; Commercial</div>
          <ul class="dev-footer-links">
            <li><a href="https://www.npmjs.com/package/@nullclear/mcp" target="_blank" rel="noopener" class="mono" style="font-size:12px;">@nullclear/mcp</a></li>
            <li><a href="https://www.npmjs.com/package/@nullclear/agentkit" target="_blank" rel="noopener" class="mono" style="font-size:12px;">@nullclear/agentkit</a></li>
            <li><a href="https://www.npmjs.com/package/@nullclear/plugin-eliza" target="_blank" rel="noopener" class="mono" style="font-size:12px;">@nullclear/plugin-eliza</a></li>
            <li><a href="https://nullclear.com">Polymarket Guarded Terminal (nullclear.com) &#8599;</a></li>
            <li><a href="https://nullclear.com/safepay">NullClear SafePay Escrow &#8599;</a></li>
            <li><a href="https://github.com/Nullclear-Protocol/nullclear" target="_blank" rel="noopener">GitHub Repository &#8599;</a></li>
          </ul>
        </div>
      </div>
      <div class="dev-footer-bottom">
        <span>NullClear Organization &middot; Base Mainnet (8453) &middot; ERC-8004 Agent #124595</span>
        <span class="mono">api.nullclear.dev &middot; nullclear.dev</span>
      </div>
    </div>
  </footer>`;
}

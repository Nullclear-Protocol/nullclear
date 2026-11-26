import type { CopyabilityGrade } from "@nullclear/shared";
import { escapeHtml } from "./dev-shell.js";

export type PolyNavTab = "home" | "calculator" | "leaderboard" | "live" | "whale" | "terminal";

export const POLY_FONTS_HEAD = `
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
`;

export const POLY_SHELL_CSS = `
  :root {
    --bg: #07090D;
    --surface: #0D1117;
    --surface-2: #141A23;
    --border: rgba(255, 255, 255, 0.085);
    --border-strong: rgba(255, 255, 255, 0.16);
    --text: #F8FAFC;
    --muted: #94A3B8;
    --dim: #64748B;
    --emerald: #10B981;
    --emerald-bg: rgba(16, 185, 129, 0.12);
    --emerald-border: rgba(16, 185, 129, 0.35);
    --cyan: #38BDF8;
    --cyan-bg: rgba(56, 189, 248, 0.12);
    --cyan-border: rgba(56, 189, 248, 0.35);
    --amber: #F59E0B;
    --amber-bg: rgba(245, 158, 11, 0.12);
    --amber-border: rgba(245, 158, 11, 0.35);
    --rose: #F43F5E;
    --rose-bg: rgba(244, 63, 94, 0.12);
    --rose-border: rgba(244, 63, 94, 0.35);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: radial-gradient(circle at 50% -15%, rgba(16, 185, 129, 0.09), transparent 52%), var(--bg);
    color: var(--text);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
  a { color: inherit; text-decoration: none; }
  .container { max-width: 1180px; margin: 0 auto; padding: 0 22px; }
  .poly-header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(7, 9, 13, 0.9);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .poly-header-inner {
    min-height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 8px 0;
  }
  .poly-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-weight: 800;
    font-size: 15.5px;
    letter-spacing: -0.02em;
  }
  .poly-mark {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: linear-gradient(135deg, #10B981, #38BDF8);
    color: #03150F;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 15px;
  }
  .poly-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    background: var(--emerald-bg);
    border: 1px solid var(--emerald-border);
    color: var(--emerald);
  }
  .poly-nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .poly-nav a {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--muted);
    padding: 7px 12px;
    border-radius: 7px;
    transition: background 0.15s, color 0.15s;
  }
  .poly-nav a:hover, .poly-nav a.active {
    color: var(--text);
    background: var(--surface-2);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: transform 0.1s, background 0.15s, border-color 0.15s;
    font-family: inherit;
    white-space: nowrap;
  }
  .btn-primary {
    background: var(--emerald);
    color: #04150F;
    font-weight: 700;
  }
  .btn-primary:hover { background: #34D399; }
  .btn-secondary {
    background: var(--surface-2);
    color: var(--text);
    border-color: var(--border-strong);
  }
  .btn-secondary:hover { border-color: var(--cyan-border); background: #192230; }
  .btn-sm { padding: 7px 12px; font-size: 12.5px; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 22px;
  }
  .card-muted {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
  }
  .eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--emerald);
  }
  .input, .select {
    background: #05070B;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    color: var(--text);
    padding: 10px 13px;
    font-size: 13.5px;
    font-family: 'JetBrains Mono', monospace;
    outline: none;
    width: 100%;
  }
  .input:focus, .select:focus { border-color: var(--emerald); }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pill-safe { color: var(--emerald); background: var(--emerald-bg); border: 1px solid var(--emerald-border); }
  .pill-warn { color: var(--amber); background: var(--amber-bg); border: 1px solid var(--amber-border); }
  .pill-danger { color: var(--rose); background: var(--rose-bg); border: 1px solid var(--rose-border); }
  .pill-info { color: var(--cyan); background: var(--cyan-bg); border: 1px solid var(--cyan-border); }
  .grade-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 800;
    font-size: 15px;
  }
  .grade-A { background: rgba(16,185,129,0.16); color: #10B981; border: 1px solid rgba(16,185,129,0.45); }
  .grade-B { background: rgba(56,189,248,0.16); color: #38BDF8; border: 1px solid rgba(56,189,248,0.45); }
  .grade-C { background: rgba(245,158,11,0.16); color: #F59E0B; border: 1px solid rgba(245,158,11,0.45); }
  .grade-D { background: rgba(249,115,22,0.16); color: #FB923C; border: 1px solid rgba(249,115,22,0.45); }
  .grade-F { background: rgba(244,63,94,0.16); color: #F43F5E; border: 1px solid rgba(244,63,94,0.45); }
  .table-wrap { overflow-x: auto; }
  table.poly-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.poly-table th, table.poly-table td {
    text-align: left;
    padding: 12px 12px;
    border-bottom: 1px solid var(--border);
  }
  table.poly-table th {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--dim);
    background: rgba(255,255,255,0.015);
  }
  table.poly-table tbody tr:hover td { background: rgba(255,255,255,0.02); }
  .poly-footer {
    border-top: 1px solid var(--border);
    margin-top: 64px;
    padding: 40px 0 48px;
    color: var(--muted);
    font-size: 13px;
  }
  .footer-grid {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1fr 1fr;
    gap: 28px;
    margin-bottom: 28px;
  }
  .footer-h {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dim);
    margin-bottom: 10px;
  }
  .footer-links { list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .footer-links a:hover { color: var(--text); }
  @media (max-width: 860px) {
    .footer-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 560px) {
    .footer-grid { grid-template-columns: 1fr; }
  }
`;

export function gradeClass(grade: CopyabilityGrade): string {
  return `grade-badge grade-${grade}`;
}

export function formatSignedUsd(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}

export function renderPolyHeader(active: PolyNavTab): string {
  return `
  <header class="poly-header">
    <div class="container poly-header-inner">
      <a href="/" class="poly-brand">
        <span class="poly-mark">N</span>
        <span>NullClear</span>
        <span class="poly-badge">POLYMARKET V2</span>
      </a>
      <nav class="poly-nav" aria-label="Main">
        <a href="/live" class="${active === "live" ? "active" : ""}">Live Feed</a>
        <a href="/calculator" class="${active === "calculator" ? "active" : ""}">Copy-Tax Calculator</a>
        <a href="/leaderboard" class="${active === "leaderboard" ? "active" : ""}">Whale Leaderboard</a>
        <a href="/terminal" class="${active === "terminal" ? "active" : ""}">Guarded Terminal</a>
        <a href="https://nullclear.dev">Protocol Engine &#8599;</a>
      </nav>
      <div style="display:flex;align-items:center;gap:8px;">
        <a href="/terminal" class="btn btn-primary btn-sm">Launch Paper Mode</a>
      </div>
    </div>
  </header>`;
}

export function renderPolyFooter(): string {
  return `
  <footer class="poly-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="poly-brand" style="margin-bottom:10px;">
            <span class="poly-mark">N</span>
            <span>NullClear</span>
          </div>
          <p style="font-size:13px;color:var(--muted);max-width:320px;">
            Non-custodial Policy-Guarded Polymarket Execution &amp; 2026 Copy-Tax Reality Terminal. Powered by NullClear's EIP-712 Policy Co-Signer.
          </p>
          <p class="mono" style="font-size:12px;color:var(--dim);margin-top:10px;">
            <a href="mailto:ops@nullclear.dev" style="color:var(--muted);">ops@nullclear.dev</a>
          </p>
        </div>
        <div>
          <div class="footer-h">Polymarket Tools</div>
          <ul class="footer-links">
            <li><a href="/">Whale Reality Auditor</a></li>
            <li><a href="/live">Live Whale Feed &amp; Verdicts</a></li>
            <li><a href="/calculator">2026 Fee &amp; Copy-Tax Calculator</a></li>
            <li><a href="/leaderboard">Copyable Whale Leaderboard</a></li>
            <li><a href="/terminal">Guarded Paper &amp; Live Terminal</a></li>
          </ul>
        </div>
        <div>
          <div class="footer-h">Protocol Engine (nullclear.dev)</div>
          <ul class="footer-links">
            <li><a href="https://nullclear.dev">Pre-Sign Firewall &amp; Co-Signer</a></li>
            <li><a href="https://nullclear.dev/firewall">7-Chain Guarded RPC</a></li>
            <li><a href="https://nullclear.dev/history">Live Telemetry &amp; Receipts</a></li>
            <li><a href="https://nullclear.dev/x402">x402 Clearinghouse</a></li>
          </ul>
        </div>
        <div>
          <div class="footer-h">Other NullClear Products</div>
          <ul class="footer-links">
            <li><a href="/safepay">NullClear SafePay Escrow</a></li>
            <li><a href="/deal/demo-ai-audit-101">SafePay Interactive Demo</a></li>
            <li><a href="/sitemap.xml">Sitemap</a></li>
            <li><a href="https://github.com/Nullclear-Protocol/nullclear" target="_blank" rel="noopener">GitHub &#8599;</a></li>
          </ul>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:18px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--dim);">
        <span>NullClear Organization &middot; Zero Custody (Never Stores Private Keys) &middot; Polygon CLOB V2 (pUSD)</span>
        <span class="mono">nullclear.com &middot; nullclear.dev</span>
      </div>
    </div>
  </footer>`;
}

export { escapeHtml };

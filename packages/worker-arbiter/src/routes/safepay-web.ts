import { Hono } from "hono";
import { SAFEPAY_TREASURY_ADDRESS } from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";

export const safepayWebRouter = new Hono<Env>();

interface VerticalConfig {
  slug: string;
  badge: string;
  headline: string;
  subheadline: string;
  defaultTitle: string;
  defaultAmountUsd: string;
  defaultMode: "DATASET_SCHEMA" | "FILE_ARCHIVE" | "LIVE_API" | "OPTIMISTIC_PREVIEW";
  defaultPreset: string;
  bullets: string[];
}

export const SAFEPAY_VERTICALS: Record<string, VerticalConfig> = {
  freelancers: {
    slug: "freelancers",
    badge: "FOR DEVELOPERS, AGENCIES & FREELANCERS",
    headline: "Zero-Custody Crypto Escrow for Developers & Agencies.",
    subheadline:
      "Stop losing 20% to Upwork or waiting 14 days for wire clears. Lock client USDC in their own Base wallet and get paid in 2 seconds the moment your code archive passes deterministic verification.",
    defaultTitle: "Full-Stack Next.js + Smart Contract Milestone Delivery",
    defaultAmountUsd: "2500",
    defaultMode: "FILE_ARCHIVE",
    defaultPreset: "archive",
    bullets: [
      "Verify required repository files (package.json, src/, Dockerfile, README.md) at the edge",
      "Client sees verified file tree + SHA-256 manifest before funds move—zero source code theft risk",
      "1.0% flat fee vs Upwork's 10–20% commission"
    ]
  },
  "data-brokers": {
    slug: "data-brokers",
    badge: "FOR DATASET SELLERS, SCRAPERS & LEAD BROKERS",
    headline: "Automated Schema Escrow for Datasets, Leads & Web Scrapers.",
    subheadline:
      "Solve the dataset trust paradox. NullClear SafePay verifies your CSV/JSON row count, required columns, zero-null integrity, and generates a 5-row redacted sample preview before executing atomic USDC payout.",
    defaultTitle: "Verified B2B SaaS Decision-Makers Dataset (5,000 Rows)",
    defaultAmountUsd: "1200",
    defaultMode: "DATASET_SCHEMA",
    defaultPreset: "dataset",
    bullets: [
      "Deterministic CSV, JSON, and NDJSON row counter & column validator",
      "Automatic 5-row Redacted Sample Preview (e.g. al***@stripe.com) proves quality without leaking data",
      "Instant atomic Base USDC settlement upon 100% schema match"
    ]
  },
  "ai-bounties": {
    slug: "ai-bounties",
    badge: "FOR AI BUILDERS, FINE-TUNING & AGENT BOUNTIES",
    headline: "Human & Agent Deliverable Escrow with Instant USDC Payouts.",
    subheadline:
      "Post verifiable bounties for fine-tuned weights, structured evaluations, or live API endpoints. Built-in LLM Refusal Guard automatically rejects hallucinated or boilerplate deliverables at $0 cost.",
    defaultTitle: "Production RAG Inference API & Evaluation Benchmark Suite",
    defaultAmountUsd: "800",
    defaultMode: "LIVE_API",
    defaultPreset: "live_api",
    bullets: [
      "Canonical LLM Refusal Guard blocks 'As an AI language model' and error boilerplate",
      "Live API SLA checker verifies HTTP 200 status, JSON schema, and < 1000ms latency",
      "Signed EIP-712 Cryptographic Settlement Receipt for every completed bounty"
    ]
  },
  "otc-digital": {
    slug: "otc-digital",
    badge: "FOR OTC DIGITAL ASSETS, CODEBASES & ARCHIVES",
    headline: "Trustless Escrow for Domains, Codebases & Digital Assets.",
    subheadline:
      "Replace risky Telegram middlemen charging 5% with deterministic cryptographic seals. Match exact SHA-256 digests or use Optimistic Inspection with watermarked previews and 1-click USDC release.",
    defaultTitle: "Encrypted Production SaaS Codebase & Domain Transfer Bundle",
    defaultAmountUsd: "5000",
    defaultMode: "FILE_ARCHIVE",
    defaultPreset: "sha256",
    bullets: [
      "Zero smart contract custody risk—USDC stays in buyer's wallet until verified",
      "Dual EIP-3009 atomic settlement on Base Mainnet (8453)",
      "0.75% institutional whale rate on OTC deals over $10,000 USDC"
    ]
  }
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderSafePayLandingHtml(options: {
  vertical?: VerticalConfig;
  utmTerm?: string;
}): string {
  const v = options.vertical;
  const utmHeadline = options.utmTerm
    ? `Escrow That Never Holds Your Money — Built for ${escapeHtml(options.utmTerm)}.`
    : v
    ? v.headline
    : "Escrow That Never Holds Your Money.";

  const subheadline = v
    ? v.subheadline
    : "Create a cryptographic payment link in 30 seconds. USDC stays in your wallet on Base until the deliverable passes deterministic edge verification. 0% KYC. Instant settlement. 1% flat fee.";

  const badgeText = v
    ? v.badge
    : "NULLCLEAR SAFEPAY · ZERO-CUSTODY CRYPTOGRAPHIC DELIVERABLE ESCROW";

  const defaultTitle = v ? v.defaultTitle : "Verified B2B Lead Dataset (1,000+ Records)";
  const defaultAmount = v ? v.defaultAmountUsd : "500";
  const defaultPreset = v ? v.defaultPreset : "dataset";

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FinancialProduct",
        name: "NullClear SafePay",
        url: "https://nullclear.com",
        description:
          "Zero-Custody Cryptographic Deliverable Escrow on Base Mainnet. Funds remain in the buyer's wallet via EIP-3009 TransferWithAuthorization until deliverables pass deterministic edge verification.",
        feesAndCommissionsSpecification:
          "1.0% flat protocol fee ($0.50 USDC minimum, 0.75% for deals over $10,000 USDC)",
        provider: {
          "@type": "Organization",
          name: "NullClear Protocol",
          url: "https://nullclear.com"
        }
      },
      {
        "@type": "SoftwareApplication",
        name: "NullClear SafePay Escrow Engine",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web, Base Mainnet (EIP-155:8453)",
        offers: {
          "@type": "Offer",
          price: "0.50",
          priceCurrency: "USD"
        }
      }
    ]
  });

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(utmHeadline)} | NullClear SafePay (nullclear.com)</title>
  <meta name="description" content="${escapeHtml(subheadline)}" />
  <meta property="og:title" content="${escapeHtml(utmHeadline)} | NullClear SafePay" />
  <meta property="og:description" content="${escapeHtml(subheadline)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://nullclear.com${v ? `/for/${v.slug}` : ""}" />
  <meta property="og:image" content="https://nullclear.com/opengraph-image.png" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root {
      --bg: #07090E;
      --surface: #0C1018;
      --surface-2: #111724;
      --border: rgba(255, 255, 255, 0.08);
      --border-bright: rgba(16, 185, 129, 0.35);
      --emerald: #10B981;
      --emerald-dim: rgba(16, 185, 129, 0.12);
      --base-blue: #0052FF;
      --text: #F8FAFC;
      --muted: #94A3B8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .container { max-width: 1220px; margin: 0 auto; padding: 0 24px; }
    header {
      border-bottom: 1px solid var(--border);
      background: rgba(7, 9, 14, 0.88);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .nav-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 68px;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--text);
      font-weight: 800;
      font-size: 18px;
      letter-spacing: -0.02em;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #04130D;
      font-weight: 900;
      font-size: 16px;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .nav-links a {
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: color 0.15s;
    }
    .nav-links a:hover { color: var(--text); }
    .pill-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--emerald-dim);
      border: 1px solid var(--border-bright);
      color: var(--emerald);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .base-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(0, 82, 255, 0.14);
      border: 1px solid rgba(0, 82, 255, 0.35);
      color: #60A5FA;
      font-size: 12px;
      font-weight: 600;
    }
    .stats-bar {
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      padding: 12px 0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    .stat-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 12px;
      border-right: 1px solid var(--border);
    }
    .stat-item:last-child { border-right: none; }
    .hero-grid {
      display: grid;
      grid-template-columns: 1.05fr 1fr;
      gap: 40px;
      padding: 56px 0 64px;
      align-items: start;
    }
    @media (max-width: 960px) {
      .hero-grid { grid-template-columns: 1fr; }
    }
    h1 {
      font-size: clamp(36px, 4.5vw, 54px);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.08;
      margin: 18px 0 18px;
    }
    .subheadline {
      color: var(--muted);
      font-size: 17px;
      line-height: 1.65;
      margin-bottom: 28px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 28px;
    }
    .card-emerald {
      border-color: var(--border-bright);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(16, 185, 129, 0.06);
    }
    .preset-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 18px;
    }
    .preset-btn {
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 7px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .preset-btn.active, .preset-btn:hover {
      background: var(--emerald-dim);
      border-color: var(--emerald);
      color: var(--emerald);
    }
    .field-group { margin-bottom: 14px; }
    .field-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #CBD5E1;
      margin-bottom: 6px;
    }
    input, select, textarea {
      width: 100%;
      background: #06080D;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--text);
      font-size: 13px;
      font-family: inherit;
      outline: none;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--emerald);
    }
    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .btn-primary {
      width: 100%;
      background: var(--emerald);
      color: #04130D;
      border: none;
      border-radius: 10px;
      padding: 14px 20px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      transition: transform 0.1s, opacity 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn-primary:hover { opacity: 0.94; }
    .btn-secondary {
      background: var(--surface-2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 11px 16px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-secondary:hover { border-color: var(--emerald); }
    .fee-box {
      background: #06080D;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
      margin: 14px 0;
      font-size: 12px;
    }
    .fee-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      color: var(--muted);
    }
    .fee-row.total {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--border);
      color: var(--text);
      font-weight: 700;
      margin-bottom: 0;
    }
    .matrix-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      font-size: 13px;
    }
    .matrix-table th, .matrix-table td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }
    .matrix-table th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
    .highlight-col {
      background: rgba(16, 185, 129, 0.06);
      color: var(--emerald);
      font-weight: 700;
    }
    .terminal {
      background: #04060A;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      font-size: 12px;
      color: #A7F3D0;
      min-height: 150px;
      margin-top: 14px;
    }
    .terminal-line { margin-bottom: 6px; }
    footer {
      border-top: 1px solid var(--border);
      padding: 40px 0;
      margin-top: 64px;
      color: var(--muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header>
    <div class="container nav-row">
      <a href="/" class="brand">
        <span class="brand-mark">N</span>
        <span>NullClear <span style="color:var(--emerald)">SafePay</span></span>
        <span class="base-badge mono">Base Mainnet · 8453</span>
      </a>
      <nav class="nav-links">
        <a href="/for/freelancers">Freelancers</a>
        <a href="/for/data-brokers">Data Brokers</a>
        <a href="/for/ai-bounties">AI Bounties</a>
        <a href="/for/otc-digital">OTC Digital</a>
        <a href="#calculator">Fee Calculator</a>
        <a href="https://nullclear.dev" target="_blank" rel="noopener">A2A Protocol (nullclear.dev) ↗</a>
      </nav>
    </div>
  </header>

  <div class="stats-bar">
    <div class="container stats-grid mono" style="font-size:12px;">
      <div class="stat-item">
        <span style="color:var(--muted)">CUSTODIAL SMART CONTRACT RISK</span>
        <span style="color:var(--emerald);font-weight:700;">$0.00 (EIP-3009 Wallet Hold)</span>
      </div>
      <div class="stat-item">
        <span style="color:var(--muted)">AVG EDGE VERIFICATION</span>
        <span style="color:var(--text);font-weight:700;">&lt; 140ms</span>
      </div>
      <div class="stat-item">
        <span style="color:var(--muted)">PROTOCOL FEE</span>
        <span style="color:var(--emerald);font-weight:700;">1.0% Flat (0.75% &gt;$10k)</span>
      </div>
      <div class="stat-item">
        <span style="color:var(--muted)">TREASURY</span>
        <span style="color:#60A5FA;">0xB586...d5c</span>
      </div>
    </div>
  </div>

  <main class="container">
    <section class="hero-grid">
      <div>
        <div class="pill-badge mono">
          <span>●</span>
          <span>${escapeHtml(badgeText)}</span>
        </div>
        <h1>${escapeHtml(utmHeadline)}</h1>
        <p class="subheadline">${escapeHtml(subheadline)}</p>

        <div style="display:grid;gap:12px;margin-bottom:28px;">
          ${(
            v?.bullets || [
              "Zero-Custody Deferred Hold: Buyer signs off-chain EIP-3009 USDC authorizations; $0 moves until verified.",
              "Deterministic Redacted Preview: Proves CSV/JSON row counts, ZIP file trees, or Live API SLAs before payout.",
              "Atomic Dual Settlement: Arbiter relays Seller Net Payout + 1.0% Protocol Fee in < 2 seconds on Base."
            ]
          )
            .map(
              (b) => `
            <div style="display:flex;align-items:flex-start;gap:10px;font-size:14px;color:#E2E8F0;">
              <span style="color:var(--emerald);font-weight:800;">✓</span>
              <span>${escapeHtml(b)}</span>
            </div>`
            )
            .join("")}
        </div>

        <!-- 10-Second Interactive Demo Simulator -->
        <div class="card" style="background:var(--surface-2);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;font-size:15px;">⚡ Live 10-Second Escrow Sandbox</div>
              <div style="color:var(--muted);font-size:12px;">Watch a real Dual EIP-3009 Lock + Edge Dataset Verification + Atomic Base Payout</div>
            </div>
            <button type="button" id="runDemoBtn" class="btn-secondary" style="border-color:var(--emerald);color:var(--emerald);">
              ▶ Simulate $500 Escrow in 10s
            </button>
          </div>
          <div id="demoTerminal" class="terminal mono" style="display:none;"></div>
        </div>
      </div>

      <!-- Instant Deal Link Builder with Visual No-Code Verification Rule Builder -->
      <div class="card card-emerald">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <div style="font-size:17px;font-weight:800;">Create an Instant Escrow Link</div>
            <div style="font-size:12px;color:var(--muted);">No account or KYC required · Shareable link generated in 1 click</div>
          </div>
          <span class="base-badge mono">USDC · Base</span>
        </div>

        <label class="field-label">1. Select No-Code Verification Preset</label>
        <div class="preset-tabs" id="presetTabs">
          <button type="button" class="preset-btn ${defaultPreset === "dataset" ? "active" : ""}" data-preset="dataset">📊 CSV / JSON Dataset</button>
          <button type="button" class="preset-btn ${defaultPreset === "archive" ? "active" : ""}" data-preset="archive">📦 Code / ZIP Archive</button>
          <button type="button" class="preset-btn ${defaultPreset === "sha256" ? "active" : ""}" data-preset="sha256">🔐 Exact SHA-256 Seal</button>
          <button type="button" class="preset-btn ${defaultPreset === "live_api" ? "active" : ""}" data-preset="live_api">🌐 Live API / Webhook</button>
          <button type="button" class="preset-btn ${defaultPreset === "infer" ? "active" : ""}" data-preset="infer">✨ Auto-Infer from Sample JSON</button>
        </div>

        <form id="createDealForm">
          <div class="field-group">
            <label class="field-label">Deal Title / Deliverable Name</label>
            <input type="text" id="dealTitle" required value="${escapeHtml(defaultTitle)}" />
          </div>

          <div class="row-2">
            <div class="field-group">
              <label class="field-label">Deal Amount (USDC)</label>
              <input type="number" id="dealAmountUsd" min="1" step="0.01" required value="${escapeHtml(defaultAmount)}" />
            </div>
            <div class="field-group">
              <label class="field-label">Protocol Fee Mode (1.0%)</label>
              <select id="feePayer">
                <option value="seller">Seller absorbs 1% fee</option>
                <option value="buyer">Buyer adds 1% fee</option>
                <option value="split">50/50 Split fee</option>
              </select>
            </div>
          </div>

          <div class="row-2">
            <div class="field-group">
              <label class="field-label">Seller Base Wallet (0x...)</label>
              <input type="text" id="sellerAddress" class="mono" placeholder="0x... (optional at draft)" value="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" />
            </div>
            <div class="field-group">
              <label class="field-label">Network</label>
              <select id="chainId">
                <option value="8453">Base Mainnet (eip155:8453)</option>
                <option value="84532">Base Sepolia Testnet (84532)</option>
              </select>
            </div>
          </div>

          <!-- Dynamic Preset Rule Inputs -->
          <div id="presetConfigBox" style="background:#06080D;border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">
            <div id="presetDatasetFields">
              <div class="row-2">
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label">Required Columns (comma-separated)</label>
                  <input type="text" id="reqColumns" class="mono" value="email, company, domain, revenueUsd" />
                </div>
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label">Minimum Row Count</label>
                  <input type="number" id="minRows" value="3" min="1" />
                </div>
              </div>
            </div>

            <div id="presetArchiveFields" style="display:none;">
              <div class="row-2">
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label">Required Archive Files / Paths</label>
                  <input type="text" id="reqFiles" class="mono" value="README.md, package.json, src/index.ts" />
                </div>
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label">Minimum Size (Bytes)</label>
                  <input type="number" id="minBytes" value="64" min="1" />
                </div>
              </div>
            </div>

            <div id="presetSha256Fields" style="display:none;">
              <div class="field-group" style="margin-bottom:0;">
                <label class="field-label">Expected Deliverable SHA-256 Hex Digest</label>
                <input type="text" id="expectedSha256" class="mono" placeholder="e.g. a3f5c8... (64-char hex)" />
              </div>
            </div>

            <div id="presetLiveApiFields" style="display:none;">
              <div class="row-2">
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label">Required Response JSON Keys</label>
                  <input type="text" id="apiReqKeys" class="mono" value="status, data, timestamp" />
                </div>
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label">Max Latency SLA (ms)</label>
                  <input type="number" id="maxLatencyMs" value="1000" min="50" />
                </div>
              </div>
            </div>

            <div id="presetInferFields" style="display:none;">
              <label class="field-label">Paste Sample JSON Record to Auto-Infer Schema & Invariants</label>
              <textarea id="sampleJsonInput" class="mono" rows="3">{"email":"cto@acme.io","company":"Acme Corp","employees":250,"verified":true}</textarea>
              <button type="button" id="inferSchemaBtn" class="btn-secondary" style="margin-top:8px;width:100%;padding:7px;">
                ✨ Auto-Infer Strict JSON Schema via Edge Arbiter
              </button>
              <pre id="inferredSchemaPreview" class="mono" style="font-size:11px;color:var(--emerald);margin-top:8px;display:none;white-space:pre-wrap;"></pre>
            </div>
          </div>

          <div class="fee-box mono">
            <div class="fee-row">
              <span>Seller Net Payout</span>
              <span id="calcSellerNet">$495.00 USDC</span>
            </div>
            <div class="fee-row">
              <span>NullClear SafePay Fee (1.0% → 0xB586...d5c)</span>
              <span id="calcProtocolFee" style="color:var(--emerald);">$5.00 USDC</span>
            </div>
            <div class="fee-row total">
              <span>Total Buyer Wallet Authorization</span>
              <span id="calcBuyerTotal">$500.00 USDC</span>
            </div>
          </div>

          <button type="submit" class="btn-primary" id="submitDealBtn">
            <span>🔐 Generate Shareable Zero-Custody Deal Link</span>
          </button>
        </form>
      </div>
    </section>

    <!-- Interactive Fee & Speed Comparison Calculator -->
    <section id="calculator" style="padding:36px 0;">
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
          <div>
            <div class="pill-badge mono" style="margin-bottom:8px;">INSTITUTIONAL COST & CUSTODY COMPARISON</div>
            <h2 style="font-size:26px;font-weight:800;">Why Counterparties Switch to NullClear SafePay</h2>
          </div>
          <div style="min-width:280px;">
            <label class="field-label">Interactive Deal Value: <span id="sliderValLabel" class="mono" style="color:var(--emerald);font-size:15px;">$5,000 USDC</span></label>
            <input type="range" id="calcSlider" min="100" max="50000" step="100" value="5000" />
          </div>
        </div>

        <table class="matrix-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th class="highlight-col">NullClear SafePay (nullclear.com)</th>
              <th>Escrow.com</th>
              <th>Upwork Escrow</th>
              <th>Telegram OTC Middlemen</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Fee on <span id="tableDealAmt" class="mono">$5,000</span> Deal</strong></td>
              <td class="highlight-col mono" id="tableSafePayFee">$50.00 (1.0%)</td>
              <td class="mono" id="tableEscrowComFee">$162.50 (3.25%+)</td>
              <td class="mono" id="tableUpworkFee">$500.00 (10%–20%)</td>
              <td class="mono" id="tableTgFee">$250.00 (5% + Scam Risk)</td>
            </tr>
            <tr>
              <td><strong>Capital Lockup / Custody</strong></td>
              <td class="highlight-col">0 Seconds (Stays in Buyer's Base Wallet)</td>
              <td>5–10 Business Days Wire Hold</td>
              <td>14-Day Clearing Hold</td>
              <td>100% Custodial Middleman EOA</td>
            </tr>
            <tr>
              <td><strong>Deliverable Verification</strong></td>
              <td class="highlight-col">Deterministic Edge Schema / SHA-256 (&lt;140ms)</td>
              <td>Manual Dispute Arbitration (Weeks)</td>
              <td>Subjective Ticket Review</td>
              <td>Manual Chat Screenshots</td>
            </tr>
            <tr>
              <td><strong>KYC / Onboarding</strong></td>
              <td class="highlight-col">0% KYC · Instant EIP-3009 Signature</td>
              <td>Full Passport + Bank Statements</td>
              <td>Tax ID + Account Freeze Risk</td>
              <td>Anonymous / Zero Recourse</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>

  <footer>
    <div class="container" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div>
        <strong>NullClear SafePay</strong> · Zero-Custody Cryptographic Deliverable Escrow on Base Mainnet (<code class="mono">eip155:8453</code>).<br/>
        Protocol Fee Treasury: <span class="mono">${SAFEPAY_TREASURY_ADDRESS}</span> · ERC-8004 Arbiter Agent #124595
      </div>
      <div style="display:flex;gap:16px;">
        <a href="/for/freelancers" style="color:var(--muted);">Freelancers</a>
        <a href="/for/data-brokers" style="color:var(--muted);">Data Brokers</a>
        <a href="/for/ai-bounties" style="color:var(--muted);">AI Bounties</a>
        <a href="/for/otc-digital" style="color:var(--muted);">OTC Digital</a>
        <a href="/sitemap.xml" style="color:var(--muted);">Sitemap</a>
      </div>
    </div>
  </footer>

  <script>
    (function() {
      let currentPreset = "${defaultPreset}";
      let inferredSpec = null;

      const presetBtns = document.querySelectorAll("#presetTabs .preset-btn");
      const updatePresetUi = (preset) => {
        currentPreset = preset;
        presetBtns.forEach(b => b.classList.toggle("active", b.dataset.preset === preset));
        document.getElementById("presetDatasetFields").style.display = preset === "dataset" ? "block" : "none";
        document.getElementById("presetArchiveFields").style.display = preset === "archive" ? "block" : "none";
        document.getElementById("presetSha256Fields").style.display = preset === "sha256" ? "block" : "none";
        document.getElementById("presetLiveApiFields").style.display = preset === "live_api" ? "block" : "none";
        document.getElementById("presetInferFields").style.display = preset === "infer" ? "block" : "none";
      };
      presetBtns.forEach(btn => btn.addEventListener("click", () => updatePresetUi(btn.dataset.preset)));
      updatePresetUi(currentPreset);

      const amountInput = document.getElementById("dealAmountUsd");
      const feePayerSelect = document.getElementById("feePayer");
      const recalcFee = () => {
        const usd = Math.max(1, parseFloat(amountInput.value || "0"));
        const payer = feePayerSelect.value;
        const bps = usd > 10000 ? 0.0075 : 0.01;
        const fee = Math.max(0.50, usd * bps);
        let sellerNet = usd - fee;
        let buyerTotal = usd;
        if (payer === "buyer") {
          sellerNet = usd;
          buyerTotal = usd + fee;
        } else if (payer === "split") {
          sellerNet = usd - fee / 2;
          buyerTotal = usd + fee / 2;
        }
        document.getElementById("calcSellerNet").textContent = "$" + sellerNet.toFixed(2) + " USDC";
        document.getElementById("calcProtocolFee").textContent = "$" + fee.toFixed(2) + " USDC";
        document.getElementById("calcBuyerTotal").textContent = "$" + buyerTotal.toFixed(2) + " USDC";
      };
      amountInput.addEventListener("input", recalcFee);
      feePayerSelect.addEventListener("change", recalcFee);
      recalcFee();

      // Auto-infer schema button
      document.getElementById("inferSchemaBtn").addEventListener("click", async () => {
        const raw = document.getElementById("sampleJsonInput").value;
        const pre = document.getElementById("inferredSchemaPreview");
        pre.style.display = "block";
        pre.textContent = "Inferring strict Draft-07 schema...";
        try {
          const res = await fetch("/api/safepay/infer-schema", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sample: raw })
          });
          const data = await res.json();
          if (data.success) {
            inferredSpec = data;
            pre.textContent = "✓ Inferred Required Keys: [" + data.requiredColumns.join(", ") + "] + " + data.invariants.length + " Invariants";
          } else {
            pre.textContent = "Error: " + data.error;
          }
        } catch (err) {
          pre.textContent = "Error: " + err.message;
        }
      });

      // Create Deal Form Submit
      document.getElementById("createDealForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("submitDealBtn");
        btn.disabled = true;
        btn.textContent = "Creating Cryptographic Deal Room...";

        const usd = Math.max(1, parseFloat(amountInput.value || "500"));
        const amountAtomic = String(Math.round(usd * 1000000));
        let verificationMode = "DATASET_SCHEMA";
        let verificationSpec = { rejectRefusals: true };

        if (currentPreset === "dataset") {
          verificationMode = "DATASET_SCHEMA";
          const cols = document.getElementById("reqColumns").value.split(",").map(s => s.trim()).filter(Boolean);
          const minRows = parseInt(document.getElementById("minRows").value || "1", 10);
          verificationSpec = { requiredColumns: cols, minRows, disallowNulls: true, rejectRefusals: true };
        } else if (currentPreset === "archive") {
          verificationMode = "FILE_ARCHIVE";
          const files = document.getElementById("reqFiles").value.split(",").map(s => s.trim()).filter(Boolean);
          const minBytes = parseInt(document.getElementById("minBytes").value || "64", 10);
          verificationSpec = { requiredFiles: files, minBytes, rejectRefusals: true };
        } else if (currentPreset === "sha256") {
          verificationMode = "FILE_ARCHIVE";
          const expectedSha256 = document.getElementById("expectedSha256").value.trim();
          verificationSpec = { expectedSha256: expectedSha256 || undefined, minBytes: 1, rejectRefusals: true };
        } else if (currentPreset === "live_api") {
          verificationMode = "LIVE_API";
          const cols = document.getElementById("apiReqKeys").value.split(",").map(s => s.trim()).filter(Boolean);
          const maxLatencyMs = parseInt(document.getElementById("maxLatencyMs").value || "1000", 10);
          verificationSpec = { requiredColumns: cols, maxLatencyMs, rejectRefusals: true };
        } else if (currentPreset === "infer") {
          verificationMode = "DATASET_SCHEMA";
          if (inferredSpec) {
            verificationSpec = {
              jsonSchema: inferredSpec.jsonSchema,
              requiredColumns: inferredSpec.requiredColumns,
              invariants: inferredSpec.invariants,
              rejectRefusals: true
            };
          }
        }

        try {
          const sellerAddr = document.getElementById("sellerAddress").value.trim();
          const res = await fetch("/api/safepay/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: document.getElementById("dealTitle").value.trim(),
              creatorRole: "seller",
              sellerAddress: /^0x[a-fA-F0-9]{40}$/.test(sellerAddr) ? sellerAddr : undefined,
              chainId: parseInt(document.getElementById("chainId").value, 10),
              amountAtomic,
              feePayer: feePayerSelect.value,
              verificationMode,
              verificationSpec
            })
          });
          const data = await res.json();
          if (data.success && data.dealId) {
            window.location.href = "/deal/" + data.dealId;
          } else {
            alert("Failed to create deal: " + (data.message || data.error));
            btn.disabled = false;
            btn.textContent = "🔐 Generate Shareable Zero-Custody Deal Link";
          }
        } catch (err) {
          alert("Request error: " + err.message);
          btn.disabled = false;
          btn.textContent = "🔐 Generate Shareable Zero-Custody Deal Link";
        }
      });

      // Interactive Calculator Slider
      const slider = document.getElementById("calcSlider");
      const updateSlider = () => {
        const val = parseFloat(slider.value);
        const fmt = "$" + val.toLocaleString();
        document.getElementById("sliderValLabel").textContent = fmt + " USDC";
        document.getElementById("tableDealAmt").textContent = fmt;
        const spRate = val > 10000 ? 0.0075 : 0.01;
        const spFee = Math.max(0.5, val * spRate);
        document.getElementById("tableSafePayFee").textContent = "$" + spFee.toFixed(2) + " (" + (spRate * 100).toFixed(2) + "%)";
        document.getElementById("tableEscrowComFee").textContent = "$" + (val * 0.0325).toFixed(2) + " (3.25%+)";
        document.getElementById("tableUpworkFee").textContent = "$" + (val * 0.10).toFixed(2) + " (10%–20%)";
        document.getElementById("tableTgFee").textContent = "$" + (val * 0.05).toFixed(2) + " (5% + Scam Risk)";
      };
      slider.addEventListener("input", updateSlider);

      // 10-Second Interactive Demo Simulator
      document.getElementById("runDemoBtn").addEventListener("click", async () => {
        const term = document.getElementById("demoTerminal");
        term.style.display = "block";
        term.innerHTML = "";
        const append = (msg, color) => {
          const div = document.createElement("div");
          div.className = "terminal-line";
          if (color) div.style.color = color;
          div.textContent = msg;
          term.appendChild(div);
        };

        append("[0.1s] Creating $500.00 USDC Zero-Custody Dataset Deal on Base Mainnet (8453)...");
        const createRes = await fetch("/api/safepay/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Demo: 3 Verified Enterprise AI Leads (CSV/JSON)",
            creatorRole: "seller",
            sellerAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            chainId: 8453,
            amountAtomic: "500000000",
            feePayer: "seller",
            verificationMode: "DATASET_SCHEMA",
            verificationSpec: {
              requiredColumns: ["email", "company", "domain", "arrUsd"],
              minRows: 3,
              disallowNulls: true,
              rejectRefusals: true
            }
          })
        });
        const created = await createRes.json();
        append("[0.4s] ✓ Deal created: " + created.dealId + " (Seller Net: $495.00 USDC | Fee: $5.00 USDC -> 0xB586...d5c)");
        append("[0.8s] ✓ Ready! Opening live interactive Deal Room for " + created.dealId + "...", "#10B981");
        setTimeout(() => {
          window.location.href = "/deal/" + created.dealId + "?demo=1";
        }, 900);
      });
    })();
  </script>
</body>
</html>`;
}

export function renderSafePayDealRoomHtml(dealId: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Deal Room ${escapeHtml(dealId)} | NullClear SafePay Zero-Custody Escrow</title>
  <meta name="description" content="Zero-Custody Cryptographic Deliverable Escrow on Base Mainnet. Funds remain in the buyer's wallet until deterministic edge verification passes." />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #07090E;
      --surface: #0C1018;
      --surface-2: #111724;
      --border: rgba(255, 255, 255, 0.08);
      --border-bright: rgba(16, 185, 129, 0.38);
      --emerald: #10B981;
      --emerald-dim: rgba(16, 185, 129, 0.12);
      --base-blue: #0052FF;
      --text: #F8FAFC;
      --muted: #94A3B8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      line-height: 1.5;
    }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 24px; }
    header {
      border-bottom: 1px solid var(--border);
      background: rgba(7, 9, 14, 0.9);
      padding: 16px 0;
    }
    .nav-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); font-weight: 800; }
    .brand-mark {
      width: 30px; height: 30px; border-radius: 8px;
      background: var(--emerald); color: #04130D;
      display: flex; align-items: center; justify-content: center; font-weight: 900;
    }
    .status-pill {
      padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 700;
      background: var(--emerald-dim); border: 1px solid var(--border-bright); color: var(--emerald);
    }
    .grid-2 { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 24px; margin-top: 28px; }
    @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 24px; margin-bottom: 20px;
    }
    .step-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border);
    }
    .step-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
    .step-num {
      width: 24px; height: 24px; border-radius: 6px; background: var(--emerald-dim);
      color: var(--emerald); display: inline-flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 800;
    }
    .kv-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
    .btn-primary {
      width: 100%; background: var(--emerald); color: #04130D; border: none;
      border-radius: 10px; padding: 13px 18px; font-weight: 700; font-size: 14px; cursor: pointer;
    }
    .btn-secondary {
      background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
      border-radius: 8px; padding: 9px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    input, textarea, select {
      width: 100%; background: #05070B; border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 12px; color: var(--text); font-size: 13px; margin-bottom: 10px;
    }
    .terminal {
      background: #04060A; border: 1px solid var(--border); border-radius: 10px;
      padding: 14px; font-size: 12px; color: #A7F3D0; min-height: 110px; margin-top: 12px;
      white-space: pre-wrap;
    }
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.75);
      display: none; align-items: center; justify-content: center; z-index: 100; padding: 20px;
    }
    .modal {
      background: var(--surface); border: 1px solid var(--border-bright);
      border-radius: 16px; max-width: 520px; width: 100%; padding: 24px;
    }
  </style>
</head>
<body>
  <header>
    <div class="container nav-row">
      <a href="/" class="brand">
        <span class="brand-mark">N</span>
        <span>NullClear <span style="color:var(--emerald)">SafePay</span></span>
        <span class="mono" style="font-size:12px;color:var(--muted);">/deal/${escapeHtml(dealId)}</span>
      </a>
      <div style="display:flex;align-items:center;gap:10px;">
        <button type="button" id="openCashierBtn" class="btn-secondary" style="border-color:#0052FF;color:#60A5FA;">
          💳 Need Base USDC? Cross-Chain Cashier
        </button>
        <span id="dealStatusBadge" class="status-pill mono">LOADING...</span>
      </div>
    </div>
  </header>

  <main class="container">
    <div class="grid-2">
      <!-- Left Column: Step 1 Contract Terms & Step 2 Non-Custodial Wallet Lock -->
      <div>
        <div class="card">
          <div class="step-header">
            <div class="step-title"><span class="step-num">1</span> Deal Contract & Cryptographic Terms</div>
            <button type="button" id="copyLinkBtn" class="btn-secondary mono">📋 Copy Share Link</button>
          </div>
          <h2 id="titleText" style="font-size:20px;font-weight:800;margin-bottom:8px;">Loading Deal...</h2>
          <p id="descText" style="font-size:13px;color:var(--muted);margin-bottom:14px;"></p>

          <div class="kv-row">
            <span style="color:var(--muted)">Verification Mode</span>
            <span id="modeText" class="mono" style="color:var(--emerald);font-weight:700;">-</span>
          </div>
          <div class="kv-row">
            <span style="color:var(--muted)">Seller Net Payout</span>
            <span id="sellerNetText" class="mono" style="font-weight:700;">-</span>
          </div>
          <div class="kv-row">
            <span style="color:var(--muted)">Protocol Fee (1.0% → Treasury)</span>
            <span id="protocolFeeText" class="mono" style="color:var(--emerald);">-</span>
          </div>
          <div class="kv-row">
            <span style="color:var(--muted)">Total Buyer Wallet Hold</span>
            <span id="buyerTotalText" class="mono" style="font-weight:800;">-</span>
          </div>
          <div class="kv-row">
            <span style="color:var(--muted)">Seller Address & Reputation</span>
            <span id="sellerAddrText" class="mono" style="font-size:12px;">-</span>
          </div>
          <div class="kv-row">
            <span style="color:var(--muted)">Buyer Address & Reputation</span>
            <span id="buyerAddrText" class="mono" style="font-size:12px;">-</span>
          </div>

          <details style="margin-top:12px;">
            <summary style="cursor:pointer;font-size:12px;color:var(--muted);">View Raw Deterministic Verification Specification (JSON)</summary>
            <pre id="specJsonPre" class="mono" style="background:#05070B;padding:12px;border-radius:8px;margin-top:8px;font-size:11px;overflow-x:auto;"></pre>
          </details>
        </div>

        <!-- Step 2: Buyer Dual EIP-3009 Wallet Lock -->
        <div class="card">
          <div class="step-header">
            <div class="step-title"><span class="step-num">2</span> Non-Custodial Buyer Wallet Lock (EIP-3009)</div>
            <span class="mono" style="font-size:11px;color:var(--emerald);">0% Smart Contract Custody</span>
          </div>
          <p style="font-size:13px;color:var(--muted);margin-bottom:12px;">
            USDC stays in your Base wallet until the Seller's deliverable passes deterministic edge verification. You sign two EIP-3009 authorizations: Seller Net Payout + 1.0% Protocol Fee to <span class="mono">0xB586...d5c</span>.
          </p>

          <div style="display:flex;gap:10px;margin-bottom:10px;">
            <button type="button" id="connectWalletBtn" class="btn-secondary" style="flex:1;">
              🦊 Connect Base Wallet (MetaMask / Coinbase)
            </button>
            <button type="button" id="instantSandboxLockBtn" class="btn-secondary" style="flex:1;border-color:var(--emerald);color:var(--emerald);">
              ⚡ Instant Demo / Sandbox EIP-3009 Lock
            </button>
          </div>

          <input type="text" id="lockBuyerInput" class="mono" placeholder="Buyer Wallet Address (0x...)" />
          <input type="text" id="lockSellerInput" class="mono" placeholder="Seller Wallet Address (0x...)" />

          <button type="button" id="signDualLockBtn" class="btn-primary">
            🔐 Sign Dual EIP-3009 Authorizations & Lock Deal
          </button>
          <div id="lockStatusMsg" class="mono" style="font-size:12px;margin-top:10px;color:var(--emerald);"></div>
        </div>
      </div>

      <!-- Right Column: Step 3 Seller Upload & Arbiter Console + Step 4 Redacted Preview & Receipt -->
      <div>
        <div class="card">
          <div class="step-header">
            <div class="step-title"><span class="step-num">3</span> Seller Deliverable Upload & Edge Arbiter Console</div>
            <button type="button" id="loadSampleDeliverableBtn" class="btn-secondary" style="color:var(--emerald);">
              ✨ Load Matching Sample Deliverable
            </button>
          </div>

          <textarea id="deliverableContent" class="mono" rows="6" placeholder="Paste CSV / JSON dataset, archive manifest, or Live API URL here..."></textarea>

          <div style="display:flex;gap:10px;">
            <button type="button" id="submitDeliverableBtn" class="btn-primary">
              🚀 Run Edge Verification & Settle Atomic Payout
            </button>
            <button type="button" id="voidDealBtn" class="btn-secondary" style="color:#F87171;">
              Void / Cancel
            </button>
          </div>

          <div id="arbiterConsole" class="terminal mono">[Edge Arbiter Ready] Waiting for locked EIP-3009 authorizations & seller deliverable...</div>
        </div>

        <!-- Step 4: Redacted Preview & Cryptographic Settlement Receipt -->
        <div class="card">
          <div class="step-header">
            <div class="step-title"><span class="step-num">4</span> Redacted Preview & EIP-712 Settlement Receipt</div>
            <span id="verifyBadge" class="mono" style="font-size:11px;color:var(--muted);">AWAITING DELIVERY</span>
          </div>

          <div id="redactedPreviewBox" style="font-size:12px;color:var(--muted);margin-bottom:14px;">
            No deliverable inspected yet. When uploaded, the Edge Arbiter generates a redacted sample preview and SHA-256 digest here.
          </div>

          <div id="settlementReceiptBox" style="display:none;background:#05070B;border:1px solid var(--border-bright);border-radius:10px;padding:14px;margin-bottom:14px;">
            <div style="font-weight:700;color:var(--emerald);margin-bottom:8px;">🎉 Atomic Dual Settlement Confirmed on Base!</div>
            <div class="kv-row"><span>Seller Payout Tx</span><a id="sellerTxLink" href="#" target="_blank" class="mono" style="color:#60A5FA;">-</a></div>
            <div class="kv-row"><span>Protocol Fee Tx (0xB586...d5c)</span><a id="feeTxLink" href="#" target="_blank" class="mono" style="color:#60A5FA;">-</a></div>
            <div class="kv-row"><span>Deliverable SHA-256</span><span id="receiptSha256" class="mono" style="font-size:11px;">-</span></div>
            <div style="display:flex;gap:10px;margin-top:12px;">
              <a id="downloadDeliverableBtn" href="#" class="btn-primary" style="text-decoration:none;text-align:center;">
                ⬇ Download Unredacted Deliverable
              </a>
              <button type="button" id="downloadReceiptBtn" class="btn-secondary mono">
                📜 EIP-712 Receipt JSON
              </button>
            </div>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">
            <span style="color:var(--muted);">Protected by <strong>NullClear SafePay</strong></span>
            <a href="/" style="color:var(--emerald);font-weight:700;text-decoration:none;">Create Your Own 0%-Custody Escrow Link →</a>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Built-in Non-Custodial Base USDC Cashier Modal -->
  <div id="cashierModal" class="modal-backdrop">
    <div class="modal">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:17px;font-weight:800;">💳 Non-Custodial Base USDC Cashier</div>
        <button type="button" id="closeCashierBtn" class="btn-secondary">✕</button>
      </div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">
        Top up Base Mainnet USDC (<span class="mono">0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</span>) directly to your connected wallet from ETH, Arbitrum, Optimism, Solana, or Card with zero custody:
      </p>
      <div style="display:grid;gap:10px;">
        <a href="https://jumper.exchange/?toChain=8453&toToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;display:flex;justify-content:space-between;">
          <span>⚡ Jumper / LI.FI Cross-Chain to Base USDC</span><span>Open ↗</span>
        </a>
        <a href="https://relay.link/bridge/base?currency=usdc" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;display:flex;justify-content:space-between;">
          <span>🌉 Relay.link Instant 2-Second Base USDC Bridge</span><span>Open ↗</span>
        </a>
        <a href="https://app.uniswap.org/swap?chain=base&outputCurrency=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;display:flex;justify-content:space-between;">
          <span>🦄 Uniswap Base ETH → Base USDC Swap</span><span>Open ↗</span>
        </a>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const dealId = "${escapeHtml(dealId)}";
      let currentDeal = null;

      document.getElementById("openCashierBtn").addEventListener("click", () => {
        document.getElementById("cashierModal").style.display = "flex";
      });
      document.getElementById("closeCashierBtn").addEventListener("click", () => {
        document.getElementById("cashierModal").style.display = "none";
      });
      document.getElementById("copyLinkBtn").addEventListener("click", () => {
        navigator.clipboard.writeText(window.location.origin + "/deal/" + dealId);
        document.getElementById("copyLinkBtn").textContent = "✓ Copied!";
      });

      const formatUsdc = (atomicStr) => {
        const n = Number(atomicStr || "0") / 1e6;
        return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDC";
      };

      const renderPreview = (preview) => {
        const box = document.getElementById("redactedPreviewBox");
        if (!preview) return;
        document.getElementById("verifyBadge").textContent = preview.verified ? "✓ VERIFIED AT EDGE" : "✕ FAILED CHECKS";
        document.getElementById("verifyBadge").style.color = preview.verified ? "#10B981" : "#F87171";

        let html = '<div class="mono" style="margin-bottom:8px;color:#E2E8F0;">SHA-256: ' + preview.deliverableSha256.slice(0, 24) + '... (' + preview.byteSize + ' bytes)</div>';
        if (preview.checks) {
          preview.checks.forEach(c => {
            html += '<div style="margin-bottom:4px;color:' + (c.passed ? '#10B981' : '#F87171') + ';">' + (c.passed ? '[✓] ' : '[✕] ') + c.label + ': <span style="color:#94A3B8">' + c.detail + '</span></div>';
          });
        }
        if (preview.datasetSummary) {
          html += '<div class="mono" style="margin-top:8px;padding:8px;background:#05070B;border-radius:8px;color:#CBD5E1;"><strong>Redacted Sample Rows (' + preview.datasetSummary.totalRows + ' total):</strong><pre style="margin-top:6px;overflow-x:auto;">' + JSON.stringify(preview.datasetSummary.redactedSampleRows, null, 2) + '</pre></div>';
        }
        if (preview.archiveSummary) {
          html += '<div class="mono" style="margin-top:8px;padding:8px;background:#05070B;border-radius:8px;color:#CBD5E1;"><strong>Verified File Tree (' + preview.archiveSummary.totalFiles + ' files):</strong><pre style="margin-top:6px;overflow-x:auto;">' + JSON.stringify(preview.archiveSummary.fileTree, null, 2) + '</pre></div>';
        }
        box.innerHTML = html;
      };

      const loadDeal = async () => {
        const res = await fetch("/api/safepay/deals/" + dealId);
        const data = await res.json();
        if (!data.success) {
          document.getElementById("titleText").textContent = "Deal Not Found";
          return;
        }
        const d = data.deal;
        currentDeal = d;
        document.getElementById("dealStatusBadge").textContent = d.status;
        document.getElementById("titleText").textContent = d.title;
        document.getElementById("descText").textContent = d.description || "Zero-Custody Base USDC Deliverable Escrow";
        document.getElementById("modeText").textContent = d.verificationMode;
        document.getElementById("sellerNetText").textContent = formatUsdc(d.sellerNetAtomic);
        document.getElementById("protocolFeeText").textContent = formatUsdc(d.protocolFeeAtomic);
        document.getElementById("buyerTotalText").textContent = formatUsdc(d.totalBuyerSignAtomic);
        document.getElementById("sellerAddrText").textContent = (d.sellerAddress || "Unassigned") + (data.reputation?.seller ? " (Score: " + data.reputation.seller.score + "/100 " + data.reputation.seller.grade + ")" : "");
        document.getElementById("buyerAddrText").textContent = (d.buyerAddress || "Awaiting Lock") + (data.reputation?.buyer ? " (Score: " + data.reputation.buyer.score + "/100 " + data.reputation.buyer.grade + ")" : "");
        document.getElementById("specJsonPre").textContent = JSON.stringify(d.verificationSpec, null, 2);

        if (d.buyerAddress) document.getElementById("lockBuyerInput").value = d.buyerAddress;
        if (d.sellerAddress) document.getElementById("lockSellerInput").value = d.sellerAddress;

        if (d.redactedPreview) renderPreview(d.redactedPreview);

        if (d.status === "SETTLED") {
          const rBox = document.getElementById("settlementReceiptBox");
          rBox.style.display = "block";
          const explorer = data.network?.blockExplorer || "https://basescan.org";
          const sLink = document.getElementById("sellerTxLink");
          sLink.href = explorer + "/tx/" + d.sellerTxHash;
          sLink.textContent = (d.sellerTxHash || "").slice(0, 18) + "... ↗";
          const fLink = document.getElementById("feeTxLink");
          fLink.href = explorer + "/tx/" + d.feeTxHash;
          fLink.textContent = (d.feeTxHash || "").slice(0, 18) + "... ↗";
          document.getElementById("receiptSha256").textContent = (d.deliverableSha256 || "").slice(0, 24) + "...";
          document.getElementById("downloadDeliverableBtn").href = "/api/safepay/deals/" + dealId + "/download?buyer=" + encodeURIComponent(d.buyerAddress || "");
        }
      };

      // Connect real injected Base Wallet (EIP-1193)
      document.getElementById("connectWalletBtn").addEventListener("click", async () => {
        if (!window.ethereum) {
          alert("No injected Web3 wallet detected. Use 'Instant Demo / Sandbox EIP-3009 Lock' or install MetaMask / Coinbase Wallet.");
          return;
        }
        try {
          const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
          if (accounts && accounts[0]) {
            document.getElementById("lockBuyerInput").value = accounts[0];
            document.getElementById("lockStatusMsg").textContent = "✓ Connected Base Wallet: " + accounts[0];
          }
        } catch (err) {
          alert("Wallet connection error: " + err.message);
        }
      });

      // Instant Sandbox EIP-3009 Dual Lock
      document.getElementById("instantSandboxLockBtn").addEventListener("click", async () => {
        const msgEl = document.getElementById("lockStatusMsg");
        msgEl.textContent = "Signing Dual EIP-3009 Authorizations (Seller Net + 1.0% Treasury Fee)...";
        const res = await fetch("/api/safepay/deals/" + dealId + "/demo-lock", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          msgEl.textContent = "✓ Dual EIP-3009 Signatures Verified & Locked in Non-Custodial Edge Hold!";
          await loadDeal();
        } else {
          msgEl.textContent = "Error: " + (data.message || data.error);
        }
      });

      // Real Injected Wallet (MetaMask / Coinbase) Dual EIP-3009 Signing
      document.getElementById("signDualLockBtn").addEventListener("click", async () => {
        const msgEl = document.getElementById("lockStatusMsg");
        if (!window.ethereum) {
          msgEl.textContent = "No injected wallet found — executing Sandbox EIP-3009 Dual Lock...";
          document.getElementById("instantSandboxLockBtn").click();
          return;
        }
        try {
          const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
          const buyerAddress = accounts[0];
          const sellerAddress = document.getElementById("lockSellerInput").value.trim() || currentDeal?.sellerAddress;
          if (!sellerAddress) {
            alert("Please enter a valid Seller Wallet Address (0x...)");
            return;
          }
          const chainId = currentDeal?.chainId || 8453;
          const usdcAddress = chainId === 84532
            ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
            : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
          const domain = {
            name: chainId === 84532 ? "USDC" : "USD Coin",
            version: "2",
            chainId,
            verifyingContract: usdcAddress
          };
          const types = {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" }
            ],
            TransferWithAuthorization: [
              { name: "from", type: "address" },
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
              { name: "validAfter", type: "uint256" },
              { name: "validBefore", type: "uint256" },
              { name: "nonce", type: "bytes32" }
            ]
          };
          const randHex32 = () => {
            const arr = new Uint8Array(32);
            crypto.getRandomValues(arr);
            return "0x" + Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
          };
          const nowSec = Math.floor(Date.now() / 1000);
          const validAfter = String(nowSec - 60);
          const validBefore = String(nowSec + 86400);
          const sellerNonce = randHex32();
          const feeNonce = randHex32();
          const treasury = "${SAFEPAY_TREASURY_ADDRESS}";

          msgEl.textContent = "Step 1/2: Sign Seller Net Payout Authorization in Wallet...";
          const sellerMsg = {
            from: buyerAddress,
            to: sellerAddress,
            value: currentDeal.sellerNetAtomic,
            validAfter,
            validBefore,
            nonce: sellerNonce
          };
          const sellerSig = await window.ethereum.request({
            method: "eth_signTypedData_v4",
            params: [buyerAddress, JSON.stringify({ domain, types, primaryType: "TransferWithAuthorization", message: sellerMsg })]
          });

          msgEl.textContent = "Step 2/2: Sign 1.0% Protocol Fee Authorization to 0xB586...d5c...";
          const feeMsg = {
            from: buyerAddress,
            to: treasury,
            value: currentDeal.protocolFeeAtomic,
            validAfter,
            validBefore,
            nonce: feeNonce
          };
          const feeSig = await window.ethereum.request({
            method: "eth_signTypedData_v4",
            params: [buyerAddress, JSON.stringify({ domain, types, primaryType: "TransferWithAuthorization", message: feeMsg })]
          });

          const caip2 = "eip155:" + chainId;
          const lockRes = await fetch("/api/safepay/deals/" + dealId + "/lock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              buyerAddress,
              sellerAddress,
              sellerSignaturePayload: {
                x402Version: 2,
                accepted: { scheme: "exact", network: caip2, amount: currentDeal.sellerNetAtomic, asset: usdcAddress, payTo: sellerAddress, maxTimeoutSeconds: 86400 },
                payload: { signature: sellerSig, authorization: sellerMsg }
              },
              feeSignaturePayload: {
                x402Version: 2,
                accepted: { scheme: "exact", network: caip2, amount: currentDeal.protocolFeeAtomic, asset: usdcAddress, payTo: treasury, maxTimeoutSeconds: 86400 },
                payload: { signature: feeSig, authorization: feeMsg }
              }
            })
          });
          const lockData = await lockRes.json();
          if (lockData.success) {
            msgEl.textContent = "✓ Dual EIP-3009 Authorizations Verified & Locked!";
            await loadDeal();
          } else {
            msgEl.textContent = "Lock Error: " + (lockData.message || lockData.error);
          }
        } catch (err) {
          msgEl.textContent = "Signing cancelled or failed: " + err.message;
        }
      });

      // Load Matching Sample Deliverable button
      document.getElementById("loadSampleDeliverableBtn").addEventListener("click", () => {
        if (!currentDeal) return;
        if (currentDeal.verificationMode === "FILE_ARCHIVE") {
          const reqFiles = currentDeal.verificationSpec?.requiredFiles || ["README.md", "package.json", "src/index.ts"];
          const bundle = {};
          reqFiles.forEach(f => { bundle[f] = "// Verified deliverable content for " + f + "\\nexport const ready = true;\\n"; });
          document.getElementById("deliverableContent").value = JSON.stringify(bundle, null, 2);
        } else {
          const cols = currentDeal.verificationSpec?.requiredColumns || ["email", "company", "domain", "revenueUsd"];
          const rows = [1, 2, 3, 4, 5].map(i => {
            const obj = {};
            cols.forEach(c => {
              obj[c] = c.toLowerCase().includes("email") ? "founder" + i + "@enterprise" + i + ".io"
                : c.toLowerCase().includes("usd") || c.toLowerCase().includes("price") ? i * 125000
                : "Verified_" + c + "_" + i;
            });
            return obj;
          });
          document.getElementById("deliverableContent").value = JSON.stringify(rows, null, 2);
        }
      });

      // Submit Deliverable
      document.getElementById("submitDeliverableBtn").addEventListener("click", async () => {
        const content = document.getElementById("deliverableContent").value;
        const consoleEl = document.getElementById("arbiterConsole");
        consoleEl.textContent = "[1/4] Computing SHA-256 digest & scanning for LLM refusal boilerplate...\\n[2/4] Evaluating deterministic verification rules at the Cloudflare Edge...";

        const res = await fetch("/api/safepay/deals/" + dealId + "/deliver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sellerAddress: currentDeal?.sellerAddress,
            content
          })
        });
        const data = await res.json();
        if (data.redactedPreview) renderPreview(data.redactedPreview);

        if (data.settled) {
          consoleEl.textContent += "\\n[3/4] ✓ 100% Verification Match! Generated Redacted Preview.\\n[4/4] ✓ Broadcasted Dual EIP-3009 Settlement (Seller Payout + 1.0% Fee to 0xB586...d5c)!";
        } else if (!data.verified) {
          consoleEl.textContent += "\\n[✕] Verification Failed ($0.00 charged to Buyer):\\n - " + (data.validationErrors || []).join("\\n - ");
        } else {
          consoleEl.textContent += "\\n[✓] Verification Passed! Status: " + data.status;
        }
        await loadDeal();
      });

      // Void Deal
      document.getElementById("voidDealBtn").addEventListener("click", async () => {
        const res = await fetch("/api/safepay/deals/" + dealId + "/void", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mutualCancel: true })
        });
        const data = await res.json();
        if (data.success) {
          document.getElementById("arbiterConsole").textContent = "[VOIDED] EIP-3009 signatures cryptographically shredded in edge memory. $0.00 charged.";
          await loadDeal();
        }
      });

      // Download EIP-712 Receipt JSON
      document.getElementById("downloadReceiptBtn").addEventListener("click", () => {
        if (!currentDeal?.receipt) return;
        const blob = new Blob([JSON.stringify(currentDeal.receipt, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "safepay-receipt-" + dealId + ".json";
        a.click();
      });

      loadDeal();
    })();
  </script>
</body>
</html>`;
}

// Landing page route
safepayWebRouter.get("/", (c) => {
  const utmTerm = c.req.query("utm_term");
  return c.html(renderSafePayLandingHtml({ utmTerm }));
});

safepayWebRouter.get("/safepay", (c) => {
  const utmTerm = c.req.query("utm_term");
  return c.html(renderSafePayLandingHtml({ utmTerm }));
});

// Programmatic Google Ads & SEO Vertical Routes (/for/:vertical)
safepayWebRouter.get("/for/:vertical", (c) => {
  const slug = c.req.param("vertical").toLowerCase();
  const vertical = SAFEPAY_VERTICALS[slug];
  if (!vertical) {
    return c.redirect("/", 302);
  }
  const utmTerm = c.req.query("utm_term");
  return c.html(renderSafePayLandingHtml({ vertical, utmTerm }));
});

// Viral Deal Room Route (/deal/:dealId)
safepayWebRouter.get("/deal/:dealId", async (c) => {
  const dealId = c.req.param("dealId");
  const store = getArbiterStore(c.env);
  // Pre-warm deal lookup if exists
  await store.getSafePayDeal(dealId);
  return c.html(renderSafePayDealRoomHtml(dealId));
});

// SEO Sitemap & Robots for nullclear.com
safepayWebRouter.get("/sitemap.xml", (c) => {
  const urls = [
    "https://nullclear.com/",
    "https://nullclear.com/for/freelancers",
    "https://nullclear.com/for/data-brokers",
    "https://nullclear.com/for/ai-bounties",
    "https://nullclear.com/for/otc-digital"
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u}</loc>
    <changefreq>daily</changefreq>
    <priority>${u === "https://nullclear.com/" ? "1.0" : "0.9"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});

safepayWebRouter.get("/robots.txt", (c) => {
  const txt = `User-agent: *
Allow: /
Allow: /for/freelancers
Allow: /for/data-brokers
Allow: /for/ai-bounties
Allow: /for/otc-digital
Sitemap: https://nullclear.com/sitemap.xml
`;
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(txt);
});

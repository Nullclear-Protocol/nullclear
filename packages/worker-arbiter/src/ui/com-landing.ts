import { SAFEPAY_TREASURY_ADDRESS } from "@nullclear/shared";
import { escapeHtml } from "./dev-shell.js";

export interface SafePayVerticalConfig {
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

export function renderComLandingHtml(options: {
  vertical?: SafePayVerticalConfig;
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
    : "Create a cryptographic payment link in 30 seconds. Buyer USDC stays in their own Base wallet via EIP-3009 until the deliverable passes deterministic edge verification.";

  const eyebrowText = v ? v.badge : "NON-CUSTODIAL ESCROW · BASE MAINNET";
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
          name: "NullClear Organization",
          url: "https://nullclear.com",
          email: "ops@nullclear.dev",
          sameAs: ["https://nullclear.dev", "https://github.com/Nullclear-Protocol/nullclear"],
          contactPoint: {
            "@type": "ContactPoint",
            email: "ops@nullclear.dev",
            contactType: "operations and enterprise support"
          }
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
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(utmHeadline)} | NullClear SafePay</title>
  <meta name="description" content="${escapeHtml(subheadline)}" />
  <meta property="og:title" content="${escapeHtml(utmHeadline)} | NullClear SafePay" />
  <meta property="og:description" content="${escapeHtml(subheadline)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://nullclear.com${v ? `/for/${v.slug}` : ""}" />
  <meta property="og:image" content="https://nullclear.com/opengraph-image.png" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap" rel="stylesheet" />
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root {
      --bg: #FAF9F7;
      --surface: #FFFFFF;
      --surface-2: #F4F4F5;
      --border: #E4E4E7;
      --border-strong: #D4D4D8;
      --ink: #0F172A;
      --muted: #475569;
      --dim: #64748B;
      --accent: #0D6E52;
      --accent-hover: #0A5841;
      --accent-soft: #ECFDF5;
      --accent-border: #A7F3D0;
      --dark-bg: #09090B;
      --dark-surface: #111113;
      --dark-border: #27272A;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background-color: var(--bg);
      color: var(--ink);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .serif { font-family: 'Newsreader', Georgia, serif; }
    .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
    a { color: inherit; text-decoration: none; }

    .container { max-width: 1160px; margin: 0 auto; padding: 0 24px; }

    /* Clean 64px Header */
    .com-header {
      position: sticky;
      top: 0;
      z-index: 50;
      height: 64px;
      background: rgba(250, 249, 247, 0.92);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border);
    }
    .com-header-inner {
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .com-brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .com-brand-mark {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: var(--ink);
      color: #FFFFFF;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: -0.04em;
    }
    .com-brand-name {
      font-weight: 700;
      font-size: 16px;
      letter-spacing: -0.025em;
      color: var(--ink);
    }
    .com-nav {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .com-nav a {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--muted);
      padding: 6px 12px;
      border-radius: 6px;
      white-space: nowrap;
      transition: color 0.15s, background 0.15s;
    }
    .com-nav a:hover {
      color: var(--ink);
      background: var(--surface-2);
    }
    .com-header-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .com-menu-btn {
      display: none;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--ink);
      width: 36px;
      height: 36px;
      border-radius: 6px;
      cursor: pointer;
      align-items: center;
      justify-content: center;
    }
    .com-mobile-drawer {
      display: none;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px 18px;
    }
    .com-mobile-drawer.open { display: block; }
    .com-mobile-drawer a {
      display: block;
      padding: 10px 0;
      font-size: 14px;
      font-weight: 500;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
    }
    .com-mobile-drawer a:last-child { border-bottom: none; }

    /* Disciplined 2-button hierarchy */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 9px 16px;
      font-size: 13.5px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
      font-family: inherit;
    }
    .btn-primary {
      background: var(--accent);
      color: #FFFFFF;
      border: 1px solid var(--accent);
    }
    .btn-primary:hover {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }
    .btn-secondary {
      background: var(--surface);
      color: var(--ink);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      border-color: var(--border-strong);
      background: var(--surface-2);
    }
    .btn-sm { padding: 7px 13px; font-size: 13px; }
    .btn-block { width: 100%; padding: 12px 18px; font-size: 14px; }

    /* Split Hero (55 / 45) */
    .hero-split {
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      gap: 48px;
      align-items: start;
      padding: 44px 0 68px;
      border-bottom: 1px solid var(--border);
    }
    .eyebrow {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .hero-h1 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: clamp(38px, 4.8vw, 56px);
      font-weight: 500;
      letter-spacing: -0.025em;
      line-height: 1.06;
      color: var(--ink);
      margin-top: 16px;
    }
    .hero-lead {
      font-size: 17px;
      color: var(--muted);
      line-height: 1.65;
      margin-top: 20px;
      max-width: 520px;
    }
    .trust-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      margin-top: 32px;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .trust-cell {
      padding: 18px 16px 18px 0;
      border-right: 1px solid var(--border);
    }
    .trust-cell:not(:first-child) { padding-left: 16px; }
    .trust-cell:last-child { border-right: none; padding-right: 0; }
    .trust-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 17px;
      font-weight: 600;
      color: var(--ink);
    }
    .trust-lbl {
      font-size: 12.5px;
      color: var(--dim);
      margin-top: 2px;
    }

    .demo-strip {
      margin-top: 28px;
      padding: 18px 20px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .demo-terminal {
      background: #0F172A;
      color: #E2E8F0;
      border-radius: 6px;
      padding: 14px;
      font-size: 12px;
      line-height: 1.6;
      margin-top: 12px;
      display: none;
    }
    .terminal-line { margin-bottom: 4px; }

    /* Escrow Builder Card */
    .escrow-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 28px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }
    .preset-tabs {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 3px;
      margin: 8px 0 18px;
    }
    .preset-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted);
      padding: 7px 6px;
      border-radius: 5px;
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .preset-btn:hover { color: var(--ink); }
    .preset-btn.active {
      background: var(--surface);
      color: var(--ink);
      border-color: var(--border);
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }

    .field-group { margin-bottom: 14px; }
    .field-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 5px;
    }
    input[type="text"], input[type="number"], select, textarea {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 9px 11px;
      color: var(--ink);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--accent); }
    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .preset-config-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .fee-box {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 12px 14px;
      margin: 14px 0 16px;
      font-size: 12px;
    }
    .fee-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
      color: var(--muted);
    }
    .fee-row.total {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
      color: var(--ink);
      font-weight: 600;
      margin-bottom: 0;
    }

    /* Sections */
    .section {
      padding: 80px 0;
      border-bottom: 1px solid var(--border);
    }
    .section-h2 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: clamp(28px, 3.2vw, 38px);
      font-weight: 500;
      letter-spacing: -0.02em;
      line-height: 1.18;
      color: var(--ink);
      margin-top: 10px;
    }

    /* 3-Step Architectural Strip */
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin-top: 40px;
      border-top: 1px solid var(--border);
    }
    .step-item {
      padding: 28px 28px 12px 0;
      border-right: 1px solid var(--border);
    }
    .step-item:not(:first-child) { padding-left: 28px; }
    .step-item:last-child { border-right: none; padding-right: 0; }
    .step-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 12px;
    }
    .step-title {
      font-size: 17px;
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 8px;
      letter-spacing: -0.015em;
    }
    .step-desc {
      font-size: 14px;
      color: var(--muted);
      line-height: 1.6;
    }

    /* 3-Column Commercial Use Cases */
    .cases-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-top: 36px;
    }
    .case-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 28px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 18px;
      transition: border-color 0.15s;
    }
    .case-card:hover { border-color: var(--border-strong); }
    .case-kicker {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--dim);
    }
    .case-title {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 24px;
      font-weight: 500;
      color: var(--ink);
      margin-top: 6px;
    }
    .case-link {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--accent);
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .case-link:hover { text-decoration: underline; text-underline-offset: 3px; }

    /* Cost Comparison Table */
    .card-white {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 32px;
    }
    .table-wrap { overflow-x: auto; margin-top: 24px; }
    .matrix-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
    }
    .matrix-table th, .matrix-table td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }
    .matrix-table th {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--dim);
    }
    .matrix-table tr:last-child td { border-bottom: none; }
    .highlight-col {
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
    }
    input[type="range"] {
      width: 100%;
      accent-color: var(--accent);
      cursor: pointer;
    }

    /* Client-Side Redaction Studio */
    .redact-output {
      background: #0F172A;
      color: #E2E8F0;
      border-radius: 6px;
      padding: 14px;
      font-size: 12px;
      line-height: 1.55;
      min-height: 114px;
      white-space: pre-wrap;
      overflow-x: auto;
    }

    /* Dark Developer Bridge Callout */
    .dev-bridge {
      background: var(--dark-bg);
      color: #FAFAFA;
      border: 1px solid var(--dark-border);
      border-radius: 10px;
      padding: 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 28px;
    }
    .dev-bridge-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 10px 18px;
      border-radius: 6px;
      font-size: 13.5px;
      font-weight: 600;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .dev-bridge-btn-solid {
      background: #FAFAFA;
      color: #09090B;
    }
    .dev-bridge-btn-solid:hover { background: #E4E4E7; }
    .dev-bridge-btn-outline {
      background: transparent;
      color: #FAFAFA;
      border: 1px solid #3F3F46;
    }
    .dev-bridge-btn-outline:hover { background: #18181B; }

    /* Footer */
    .com-footer {
      padding: 56px 0 64px;
      color: var(--muted);
      font-size: 13px;
    }
    .com-footer-grid {
      display: grid;
      grid-template-columns: 1.6fr 1fr 1fr 1fr;
      gap: 32px;
      margin-bottom: 36px;
    }
    .footer-heading {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--dim);
      margin-bottom: 12px;
    }
    .footer-links {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .footer-links a { color: var(--muted); transition: color 0.15s; }
    .footer-links a:hover { color: var(--ink); }
    .footer-bottom {
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

    @media (max-width: 980px) {
      .hero-split { grid-template-columns: 1fr; padding: 40px 0 56px; gap: 36px; }
      .steps-grid, .cases-grid { grid-template-columns: 1fr; }
      .step-item { border-right: none; border-bottom: 1px solid var(--border); padding: 20px 0 !important; }
      .step-item:last-child { border-bottom: none; }
      .com-footer-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 860px) {
      .com-nav { display: none; }
      .com-menu-btn { display: inline-flex; }
    }
    @media (max-width: 580px) {
      .container { padding: 0 16px; }
      .preset-tabs { grid-template-columns: repeat(2, 1fr); }
      .row-2, .trust-grid, .com-footer-grid { grid-template-columns: 1fr; }
      .trust-cell { border-right: none; border-bottom: 1px solid var(--border); padding: 12px 0 !important; }
      .trust-cell:last-child { border-bottom: none; }
      .com-header-right .btn { display: none; }
      .dev-bridge { padding: 28px 22px; }
    }
  </style>
</head>
<body>
  <header class="com-header">
    <div class="container com-header-inner">
      <a href="/" class="com-brand">
        <span class="com-brand-mark" aria-hidden="true">N</span>
        <span class="com-brand-name">NullClear</span>
      </a>
      <nav class="com-nav" aria-label="Primary">
        <a href="#create-escrow">SafePay</a>
        <a href="#use-cases">Use Cases</a>
        <a href="#calculator">Pricing</a>
        <a href="#how-it-works">Security</a>
        <a href="https://nullclear.dev">Developers (nullclear.dev) &#8599;</a>
      </nav>
      <div class="com-header-right">
        <a href="#create-escrow" class="btn btn-primary btn-sm">Create Escrow</a>
        <button type="button" class="com-menu-btn" aria-label="Toggle navigation" onclick="document.getElementById('comMobileNav').classList.toggle('open')">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="2" y1="4" x2="14" y2="4"></line>
            <line x1="2" y1="8" x2="14" y2="8"></line>
            <line x1="2" y1="12" x2="14" y2="12"></line>
          </svg>
        </button>
      </div>
    </div>
    <div id="comMobileNav" class="com-mobile-drawer">
      <a href="#create-escrow" onclick="document.getElementById('comMobileNav').classList.remove('open')">SafePay</a>
      <a href="#use-cases" onclick="document.getElementById('comMobileNav').classList.remove('open')">Use Cases</a>
      <a href="#calculator" onclick="document.getElementById('comMobileNav').classList.remove('open')">Pricing</a>
      <a href="#how-it-works" onclick="document.getElementById('comMobileNav').classList.remove('open')">Security</a>
      <a href="https://nullclear.dev">Developers (nullclear.dev) &#8599;</a>
    </div>
  </header>

  <main class="container">
    <!-- Above-the-Fold Split Hero (55 / 45) -->
    <section class="hero-split">
      <div>
        <div class="eyebrow">${escapeHtml(eyebrowText)}</div>
        <h1 class="hero-h1">${escapeHtml(utmHeadline)}</h1>
        <p class="hero-lead">${escapeHtml(subheadline)}</p>

        <div class="trust-grid">
          <div class="trust-cell">
            <div class="trust-val">$0</div>
            <div class="trust-lbl">Custodial risk</div>
          </div>
          <div class="trust-cell">
            <div class="trust-val">1.0%</div>
            <div class="trust-lbl">Flat protocol fee</div>
          </div>
          <div class="trust-cell">
            <div class="trust-val">0.75%</div>
            <div class="trust-lbl">Deals over $10k</div>
          </div>
        </div>

        <div class="demo-strip">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;font-size:14px;color:var(--ink);">Interactive 10-Second Escrow Sandbox</div>
              <div style="font-size:12.5px;color:var(--muted);margin-top:2px;">Walk through an EIP-3009 lock, edge dataset check, and Base settlement.</div>
            </div>
            <button type="button" id="runDemoBtn" class="btn btn-secondary btn-sm">
              Launch Instant Demo Deal (No Wallet Needed)
            </button>
          </div>
          <div id="demoTerminal" class="demo-terminal mono"></div>
        </div>
      </div>

      <!-- Interactive Create an Instant Escrow Link Card -->
      <div id="create-escrow" class="escrow-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;">
          <div>
            <h2 style="font-size:17px;font-weight:700;letter-spacing:-0.015em;color:var(--ink);">Create an Instant Escrow Link</h2>
            <p style="font-size:12.5px;color:var(--dim);margin-top:2px;">No account or KYC required &middot; Shareable Base USDC deal room</p>
          </div>
          <span class="mono" style="font-size:11px;font-weight:600;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-border);padding:3px 8px;border-radius:4px;white-space:nowrap;">USDC &middot; Base</span>
        </div>

        <label class="field-label">Verification Preset</label>
        <div class="preset-tabs" id="presetTabs">
          <button type="button" class="preset-btn ${defaultPreset === "dataset" ? "active" : ""}" data-preset="dataset">CSV / JSON</button>
          <button type="button" class="preset-btn ${defaultPreset === "archive" ? "active" : ""}" data-preset="archive">Code / ZIP</button>
          <button type="button" class="preset-btn ${defaultPreset === "sha256" ? "active" : ""}" data-preset="sha256">SHA-256 Seal</button>
          <button type="button" class="preset-btn ${defaultPreset === "live_api" ? "active" : ""}" data-preset="live_api">API / Webhook</button>
          <button type="button" class="preset-btn ${defaultPreset === "infer" ? "active" : ""}" data-preset="infer">Auto-Infer</button>
        </div>

        <form id="createDealForm">
          <div class="field-group">
            <label class="field-label" for="dealTitle">Deliverable Name</label>
            <input type="text" id="dealTitle" required value="${escapeHtml(defaultTitle)}" />
          </div>

          <div class="row-2">
            <div class="field-group">
              <label class="field-label" for="dealAmountUsd">Deal Amount (USDC)</label>
              <input type="number" id="dealAmountUsd" class="mono" min="1" step="0.01" required value="${escapeHtml(defaultAmount)}" />
            </div>
            <div class="field-group">
              <label class="field-label" for="feePayer">Protocol Fee (1.0%)</label>
              <select id="feePayer">
                <option value="seller">Seller absorbs 1% fee</option>
                <option value="buyer">Buyer adds 1% fee</option>
                <option value="split">50/50 Split fee</option>
              </select>
            </div>
          </div>

          <div class="row-2">
            <div class="field-group">
              <label class="field-label" for="sellerAddress">Seller Base Wallet (0x...)</label>
              <input type="text" id="sellerAddress" class="mono" placeholder="0x... (optional at draft)" value="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" />
            </div>
            <div class="field-group">
              <label class="field-label" for="chainId">Network</label>
              <select id="chainId">
                <option value="8453">Base Mainnet (8453)</option>
                <option value="84532">Base Sepolia (84532)</option>
              </select>
            </div>
          </div>

          <!-- Dynamic Preset Rule Inputs -->
          <div id="presetConfigBox" class="preset-config-box">
            <div id="presetDatasetFields">
              <div class="row-2">
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label" for="reqColumns">Required Columns</label>
                  <input type="text" id="reqColumns" class="mono" value="email, company, domain, revenueUsd" />
                </div>
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label" for="minRows">Minimum Rows</label>
                  <input type="number" id="minRows" class="mono" value="3" min="1" />
                </div>
              </div>
            </div>

            <div id="presetArchiveFields" style="display:none;">
              <div class="row-2">
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label" for="reqFiles">Required Archive Files</label>
                  <input type="text" id="reqFiles" class="mono" value="README.md, package.json, src/index.ts" />
                </div>
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label" for="minBytes">Minimum Size (Bytes)</label>
                  <input type="number" id="minBytes" class="mono" value="64" min="1" />
                </div>
              </div>
            </div>

            <div id="presetSha256Fields" style="display:none;">
              <div class="field-group" style="margin-bottom:0;">
                <label class="field-label" for="expectedSha256">Expected SHA-256 Hex Digest</label>
                <input type="text" id="expectedSha256" class="mono" placeholder="64-char hex digest" />
              </div>
            </div>

            <div id="presetLiveApiFields" style="display:none;">
              <div class="row-2">
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label" for="apiReqKeys">Required JSON Keys</label>
                  <input type="text" id="apiReqKeys" class="mono" value="status, data, timestamp" />
                </div>
                <div class="field-group" style="margin-bottom:0;">
                  <label class="field-label" for="maxLatencyMs">Max Latency SLA (ms)</label>
                  <input type="number" id="maxLatencyMs" class="mono" value="1000" min="50" />
                </div>
              </div>
            </div>

            <div id="presetInferFields" style="display:none;">
              <label class="field-label" for="sampleJsonInput">Sample JSON Record</label>
              <textarea id="sampleJsonInput" class="mono" rows="3">{"email":"cto@acme.io","company":"Acme Corp","employees":250,"verified":true}</textarea>
              <button type="button" id="inferSchemaBtn" class="btn btn-secondary btn-sm" style="margin-top:8px;width:100%;">
                Auto-Infer Strict JSON Schema
              </button>
              <pre id="inferredSchemaPreview" class="mono" style="font-size:11px;color:var(--accent);margin-top:8px;display:none;white-space:pre-wrap;"></pre>
            </div>
          </div>

          <div class="fee-box mono">
            <div class="fee-row">
              <span>Seller Net Payout</span>
              <span id="calcSellerNet" style="color:var(--ink);">$495.00 USDC</span>
            </div>
            <div class="fee-row">
              <span>SafePay Fee (1.0% &rarr; 0xB586...d5c)</span>
              <span id="calcProtocolFee" style="color:var(--accent);">$5.00 USDC</span>
            </div>
            <div class="fee-row total">
              <span>Total Buyer Authorization</span>
              <span id="calcBuyerTotal">$500.00 USDC</span>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="submitDealBtn">
            Generate Shareable Escrow Link
          </button>
        </form>
      </div>
    </section>

    <!-- How Non-Custodial Settlement Works -->
    <section id="how-it-works" class="section">
      <div class="eyebrow">SETTLEMENT ARCHITECTURE</div>
      <h2 class="section-h2">How non-custodial settlement works</h2>
      <div class="steps-grid">
        <div class="step-item">
          <div class="step-num">01</div>
          <h3 class="step-title">Lock Authorization</h3>
          <p class="step-desc">
            The buyer signs an off-chain EIP-3009 USDC authorization on Base Mainnet. Zero funds leave the buyer&rsquo;s wallet and zero smart-contract escrow holds your balance.
          </p>
        </div>
        <div class="step-item">
          <div class="step-num">02</div>
          <h3 class="step-title">Cryptographic Delivery Check</h3>
          <p class="step-desc">
            The seller submits the CSV/JSON dataset, code archive, SHA-256 artifact, or live API endpoint. NullClear verifies schema integrity, row counts, file trees, or digests at the edge in under 140ms.
          </p>
        </div>
        <div class="step-item">
          <div class="step-num">03</div>
          <h3 class="step-title">Atomic Release or Shred</h3>
          <p class="step-desc">
            If the deliverable passes 100% of rules, the arbiter settles net USDC to the seller in 2 seconds and unlocks the download. If it fails, the authorization is shredded with $0 charged.
          </p>
        </div>
      </div>
    </section>

    <!-- Commercial Use Cases -->
    <section id="use-cases" class="section">
      <div class="eyebrow">COMMERCIAL USE CASES</div>
      <h2 class="section-h2">Built for high-trust digital transactions</h2>
      <div class="cases-grid">
        <article class="case-card">
          <div>
            <div class="case-kicker">01 &middot; SOFTWARE &amp; AGENCIES</div>
            <h3 class="case-title">Freelancers</h3>
            <p style="font-size:14px;color:var(--muted);margin-top:10px;">
              Verify repository structure, required source files, and SHA-256 manifests before releasing code. Settle in 2 seconds at 1.0% instead of waiting 14 days at 10&ndash;20% platform commissions.
            </p>
          </div>
          <a href="/for/freelancers" class="case-link">Explore Freelancer Escrow &rarr;</a>
        </article>

        <article class="case-card">
          <div>
            <div class="case-kicker">02 &middot; DATASETS &amp; RESEARCH</div>
            <h3 class="case-title">Data Brokers</h3>
            <p style="font-size:14px;color:var(--muted);margin-top:10px;">
              Solve the dataset trust paradox. Prove CSV/JSON row counts, non-null columns, and a 5-row redacted sample preview without leaking proprietary records prior to USDC settlement.
            </p>
          </div>
          <a href="/for/data-brokers" class="case-link">Explore Dataset Escrow &rarr;</a>
        </article>

        <article class="case-card">
          <div>
            <div class="case-kicker">03 &middot; CODEBASES &amp; ASSETS</div>
            <h3 class="case-title">OTC Digital</h3>
            <p style="font-size:14px;color:var(--muted);margin-top:10px;">
              Replace custodial Telegram middlemen with deterministic SHA-256 deliverable seals and institutional 0.75% pricing on Base USDC settlements over $10,000.
            </p>
          </div>
          <a href="/for/otc-digital" class="case-link">Explore OTC Escrow &rarr;</a>
        </article>
      </div>
    </section>

    <!-- Pricing & Comparison Calculator -->
    <section id="calculator" class="section">
      <div class="card-white">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:20px;">
          <div>
            <div class="eyebrow">TRANSPARENT PRICING</div>
            <h2 class="section-h2" style="margin-top:6px;">Compare settlement cost and custody</h2>
          </div>
          <div style="min-width:260px;flex:0 1 320px;">
            <label class="field-label" for="calcSlider">Deal Value: <span id="sliderValLabel" class="mono" style="color:var(--accent);">$5,000 USDC</span></label>
            <input type="range" id="calcSlider" min="100" max="50000" step="100" value="5000" />
          </div>
        </div>

        <div class="table-wrap">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th class="highlight-col">NullClear SafePay</th>
                <th>Escrow.com</th>
                <th>Upwork Escrow</th>
                <th>OTC Middlemen</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Fee on <span id="tableDealAmt" class="mono">$5,000</span> Deal</strong></td>
                <td class="highlight-col mono" id="tableSafePayFee">$50.00 (1.00%)</td>
                <td class="mono" id="tableEscrowComFee">$162.50 (3.25%+)</td>
                <td class="mono" id="tableUpworkFee">$500.00 (10%&ndash;20%)</td>
                <td class="mono" id="tableTgFee">$250.00 (5%+)</td>
              </tr>
              <tr>
                <td><strong>Capital Custody</strong></td>
                <td class="highlight-col">0s (Remains in Buyer Wallet)</td>
                <td>5&ndash;10 Business Days Wire Hold</td>
                <td>14-Day Clearing Hold</td>
                <td>100% Custodial Middleman</td>
              </tr>
              <tr>
                <td><strong>Deliverable Verification</strong></td>
                <td class="highlight-col">Deterministic Edge Check (&lt;140ms)</td>
                <td>Manual Dispute Arbitration</td>
                <td>Subjective Ticket Review</td>
                <td>Manual Screenshots</td>
              </tr>
              <tr>
                <td><strong>Onboarding</strong></td>
                <td class="highlight-col">Zero KYC &middot; EIP-3009 Signature</td>
                <td>Passport &amp; Bank Statements</td>
                <td>Tax ID &amp; Account Hold</td>
                <td>Unverified Counterparty</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Client-Side Redaction & SHA-256 Seal Studio -->
      <div id="redaction-studio" class="card-white" style="margin-top:24px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:18px;">
          <div>
            <div class="eyebrow">BROWSER-LOCAL WEBCRYPTO STUDIO</div>
            <h3 style="font-size:19px;font-weight:600;color:var(--ink);margin-top:4px;">Client-Side Dataset Redaction &amp; SHA-256 Proof Seal</h3>
            <p style="font-size:13.5px;color:var(--muted);margin-top:4px;">Generate a redacted buyer preview and SHA-256 commitment hash without uploading raw PII.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" id="redactRunBtn" class="btn btn-secondary btn-sm">Compute SHA-256 Proof</button>
            <button type="button" id="useProofInDealBtn" class="btn btn-primary btn-sm">Bind Seal to Escrow Form</button>
          </div>
        </div>
        <div class="row-2">
          <div>
            <label class="field-label" for="rawRedactInput">Raw CSV / JSON Input (stays in browser)</label>
            <textarea id="rawRedactInput" class="mono" rows="5">email,company,apiKey,revenueUsd
alice.founder@stripe.com,Stripe Inc,sk_live_987654321abcdef,1450000
bob.vp@coinbase.com,Coinbase Global,sk_live_123456789fedcba,3200000
carol.cto@base.org,Base Ecosystem,sk_live_555666777aaaa,890000</textarea>
          </div>
          <div>
            <label class="field-label">Buyer-Safe Redacted Preview &amp; SHA-256 Digest</label>
            <pre id="redactedOutputBox" class="redact-output mono">Click "Compute SHA-256 Proof" to generate a redacted preview and seal...</pre>
          </div>
        </div>
      </div>
    </section>

    <!-- Bridge to Developer Infrastructure (Compact Dark-Card Callout) -->
    <section style="padding: 64px 0 16px;">
      <div class="dev-bridge">
        <div style="max-width:620px;">
          <div class="mono" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#10B981;font-weight:600;">
            DEVELOPER INFRASTRUCTURE &middot; NULLCLEAR.DEV
          </div>
          <h2 class="serif" style="font-size:30px;font-weight:500;color:#FAFAFA;margin-top:8px;line-height:1.18;">
            Building autonomous AI agents? Meet NullClear Arbiter.
          </h2>
          <p style="font-size:14.5px;color:#A1A1AA;margin-top:10px;line-height:1.6;">
            7-chain pre-sign transaction firewall, drop-in Guarded JSON-RPC, MCP server, Prepaid Passes, and non-custodial x402 clearinghouse with live verification telemetry.
          </p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a href="https://nullclear.dev" class="dev-bridge-btn dev-bridge-btn-solid">Open nullclear.dev &#8599;</a>
          <a href="https://nullclear.dev/firewall" class="dev-bridge-btn dev-bridge-btn-outline">Pre-Sign Firewall</a>
          <a href="https://nullclear.dev/history" class="dev-bridge-btn dev-bridge-btn-outline">Live Telemetry</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="com-footer">
    <div class="container">
      <div class="com-footer-grid">
        <div>
          <div class="com-brand" style="margin-bottom:10px;">
            <span class="com-brand-mark" aria-hidden="true">N</span>
            <span class="com-brand-name">NullClear Organization</span>
          </div>
          <p style="font-size:13px;color:var(--muted);max-width:300px;line-height:1.6;">
            Non-custodial cryptographic deliverable escrow on Base Mainnet and 7-chain pre-execution security infrastructure.
          </p>
          <p class="mono" style="font-size:12px;color:var(--dim);margin-top:12px;">
            <a href="mailto:ops@nullclear.dev">ops@nullclear.dev</a>
          </p>
        </div>
        <div>
          <div class="footer-heading">SafePay</div>
          <ul class="footer-links">
            <li><a href="/for/freelancers">Freelancers</a></li>
            <li><a href="/for/data-brokers">Data Brokers</a></li>
            <li><a href="/for/ai-bounties">AI Bounties</a></li>
            <li><a href="/for/otc-digital">OTC Digital</a></li>
          </ul>
        </div>
        <div>
          <div class="footer-heading">Developer Portal</div>
          <ul class="footer-links">
            <li><a href="https://nullclear.dev">nullclear.dev &#8599;</a></li>
            <li><a href="https://nullclear.dev/firewall">Pre-Sign Firewall</a></li>
            <li><a href="https://nullclear.dev/x402">x402 Clearinghouse</a></li>
            <li><a href="https://nullclear.dev/history">Live Telemetry</a></li>
          </ul>
        </div>
        <div>
          <div class="footer-heading">Network &amp; Protocol</div>
          <ul class="footer-links mono" style="font-size:12px;color:var(--dim);">
            <li>Base Mainnet (eip155:8453)</li>
            <li>ERC-8004 Agent #124595</li>
            <li style="word-break:break-all;">Treasury: ${SAFEPAY_TREASURY_ADDRESS}</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>NullClear Organization &middot; Non-Custodial EIP-3009 Settlement</span>
        <span class="mono">nullclear.com &middot; ops@nullclear.dev</span>
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
            pre.textContent = "Inferred Required Keys: [" + data.requiredColumns.join(", ") + "] + " + data.invariants.length + " Invariants";
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
        btn.textContent = "Creating Deal Room...";

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
            btn.textContent = "Generate Shareable Escrow Link";
          }
        } catch (err) {
          alert("Request error: " + err.message);
          btn.disabled = false;
          btn.textContent = "Generate Shareable Escrow Link";
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
        document.getElementById("tableTgFee").textContent = "$" + (val * 0.05).toFixed(2) + " (5%+)";
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
        const targetDealId = created.dealId || "demo-ai-audit-101";
        append("[0.4s] Deal created: " + targetDealId + " (Seller Net: $495.00 USDC | Fee: $5.00 USDC -> 0xB586...d5c)");
        append("[0.8s] Opening live interactive Deal Room for " + targetDealId + " (/deal/demo-ai-audit-101)...", "#34D399");
        setTimeout(() => {
          window.location.href = "/deal/" + targetDealId + "?demo=1";
        }, 900);
      });

      // Client-Side Data Redaction & SHA-256 Proof Seal Studio
      let lastComputedSha256 = "";
      const redactToken = (val) => {
        const s = String(val || "").trim();
        if (s.includes("@")) {
          const [u, d] = s.split("@");
          return (u.slice(0, 2) || "x") + "***@" + d;
        }
        if (/^(sk_|pk_|0x)[a-zA-Z0-9_]{8,}$/.test(s)) {
          return s.slice(0, 6) + "••••••••" + s.slice(-4);
        }
        return s;
      };

      const computeClientProof = async () => {
        const raw = document.getElementById("rawRedactInput").value.trim();
        const outBox = document.getElementById("redactedOutputBox");
        if (!raw) return;
        const enc = new TextEncoder().encode(raw);
        const hashBuf = await crypto.subtle.digest("SHA-256", enc);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
        lastComputedSha256 = hashHex;

        const lines = raw.split(/\\r?\\n/).filter(Boolean);
        const headers = (lines[0] || "").split(",").map(h => h.trim());
        const previewRows = lines.slice(1, 6).map(line =>
          line.split(",").map(cell => redactToken(cell)).join(", ")
        );

        outBox.textContent =
          "SHA-256 Deliverable Seal: " + hashHex + "\\n" +
          "Verified Row Count: " + Math.max(0, lines.length - 1) + " rows | Columns: [" + headers.join(", ") + "]\\n" +
          "--- Redacted Buyer Preview ---\\n" +
          headers.join(", ") + "\\n" +
          previewRows.join("\\n");
      };

      document.getElementById("redactRunBtn").addEventListener("click", computeClientProof);
      document.getElementById("useProofInDealBtn").addEventListener("click", async () => {
        if (!lastComputedSha256) await computeClientProof();
        updatePresetUi("sha256");
        document.getElementById("expectedSha256").value = lastComputedSha256;
        document.getElementById("expectedSha256").focus();
        document.getElementById("create-escrow").scrollIntoView({ behavior: "smooth" });
      });
    })();
  </script>
</body>
</html>`;
}

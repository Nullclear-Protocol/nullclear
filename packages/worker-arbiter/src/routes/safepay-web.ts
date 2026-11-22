import { Hono } from "hono";
import { SAFEPAY_TREASURY_ADDRESS } from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";
import { getTrendingScans } from "../services/forensics-engine.js";
import { CLAUDE_AGENTS_MD_RULE_SNIPPET } from "./forensics.js";
import { renderComLandingHtml } from "../ui/com-landing.js";

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
      "Client sees verified file tree + SHA-256 manifest before funds moveâ€”zero source code theft risk",
      "1.0% flat fee vs Upwork's 10â€“20% commission"
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
      "Zero smart contract custody riskâ€”USDC stays in buyer's wallet until verified",
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
  return renderComLandingHtml(options);
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
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <a href="mailto:ops@nullclear.dev" class="btn-secondary mono" style="text-decoration:none;color:var(--muted);">âœ‰ï¸ ops@nullclear.dev</a>
        <button type="button" id="openCashierBtn" class="btn-secondary" style="border-color:#0052FF;color:#60A5FA;">
          ðŸ’³ Need Base USDC? Cross-Chain Cashier
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
            <button type="button" id="copyLinkBtn" class="btn-secondary mono">ðŸ“‹ Copy Share Link</button>
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
            <span style="color:var(--muted)">Protocol Fee (1.0% â†’ Treasury)</span>
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
              ðŸ¦Š Connect Base Wallet (MetaMask / Coinbase)
            </button>
            <button type="button" id="instantSandboxLockBtn" class="btn-secondary" style="flex:1;border-color:var(--emerald);color:var(--emerald);">
              âš¡ Instant Demo / Sandbox EIP-3009 Lock
            </button>
          </div>

          <input type="text" id="lockBuyerInput" class="mono" placeholder="Buyer Wallet Address (0x...)" />
          <input type="text" id="lockSellerInput" class="mono" placeholder="Seller Wallet Address (0x...)" />

          <button type="button" id="signDualLockBtn" class="btn-primary">
            ðŸ” Sign Dual EIP-3009 Authorizations & Lock Deal
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
              âœ¨ Load Matching Sample Deliverable
            </button>
          </div>

          <textarea id="deliverableContent" class="mono" rows="6" placeholder="Paste CSV / JSON dataset, archive manifest, or Live API URL here..."></textarea>

          <div style="display:flex;gap:10px;">
            <button type="button" id="submitDeliverableBtn" class="btn-primary">
              ðŸš€ Run Edge Verification & Settle Atomic Payout
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
            <div style="font-weight:700;color:var(--emerald);margin-bottom:8px;">ðŸŽ‰ Atomic Dual Settlement Confirmed on Base!</div>
            <div class="kv-row"><span>Seller Payout Tx</span><a id="sellerTxLink" href="#" target="_blank" class="mono" style="color:#60A5FA;">-</a></div>
            <div class="kv-row"><span>Protocol Fee Tx (0xB586...d5c)</span><a id="feeTxLink" href="#" target="_blank" class="mono" style="color:#60A5FA;">-</a></div>
            <div class="kv-row"><span>Deliverable SHA-256</span><span id="receiptSha256" class="mono" style="font-size:11px;">-</span></div>
            <div style="display:flex;gap:10px;margin-top:12px;">
              <a id="downloadDeliverableBtn" href="#" class="btn-primary" style="text-decoration:none;text-align:center;">
                â¬‡ Download Unredacted Deliverable
              </a>
              <button type="button" id="downloadReceiptBtn" class="btn-secondary mono">
                ðŸ“œ EIP-712 Receipt JSON
              </button>
            </div>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">
            <span style="color:var(--muted);">Protected by <strong>NullClear SafePay</strong></span>
            <a href="/" style="color:var(--emerald);font-weight:700;text-decoration:none;">Create Your Own 0%-Custody Escrow Link â†’</a>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Built-in Non-Custodial Base USDC Cashier Modal -->
  <div id="cashierModal" class="modal-backdrop">
    <div class="modal">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:17px;font-weight:800;">ðŸ’³ Non-Custodial Base USDC Cashier</div>
        <button type="button" id="closeCashierBtn" class="btn-secondary">âœ•</button>
      </div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">
        Top up Base Mainnet USDC (<span class="mono">0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</span>) directly to your connected wallet from ETH, Arbitrum, Optimism, Solana, or Card with zero custody:
      </p>
      <div style="display:grid;gap:10px;">
        <a href="https://jumper.exchange/?toChain=8453&toToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;display:flex;justify-content:space-between;">
          <span>âš¡ Jumper / LI.FI Cross-Chain to Base USDC</span><span>Open â†—</span>
        </a>
        <a href="https://relay.link/bridge/base?currency=usdc" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;display:flex;justify-content:space-between;">
          <span>ðŸŒ‰ Relay.link Instant 2-Second Base USDC Bridge</span><span>Open â†—</span>
        </a>
        <a href="https://app.uniswap.org/swap?chain=base&outputCurrency=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;display:flex;justify-content:space-between;">
          <span>ðŸ¦„ Uniswap Base ETH â†’ Base USDC Swap</span><span>Open â†—</span>
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
        document.getElementById("copyLinkBtn").textContent = "âœ“ Copied!";
      });

      const formatUsdc = (atomicStr) => {
        const n = Number(atomicStr || "0") / 1e6;
        return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDC";
      };

      const renderPreview = (preview) => {
        const box = document.getElementById("redactedPreviewBox");
        if (!preview) return;
        document.getElementById("verifyBadge").textContent = preview.verified ? "âœ“ VERIFIED AT EDGE" : "âœ• FAILED CHECKS";
        document.getElementById("verifyBadge").style.color = preview.verified ? "#10B981" : "#F87171";

        let html = '<div class="mono" style="margin-bottom:8px;color:#E2E8F0;">SHA-256: ' + preview.deliverableSha256.slice(0, 24) + '... (' + preview.byteSize + ' bytes)</div>';
        if (preview.checks) {
          preview.checks.forEach(c => {
            html += '<div style="margin-bottom:4px;color:' + (c.passed ? '#10B981' : '#F87171') + ';">' + (c.passed ? '[âœ“] ' : '[âœ•] ') + c.label + ': <span style="color:#94A3B8">' + c.detail + '</span></div>';
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
          sLink.textContent = (d.sellerTxHash || "").slice(0, 18) + "... â†—";
          const fLink = document.getElementById("feeTxLink");
          fLink.href = explorer + "/tx/" + d.feeTxHash;
          fLink.textContent = (d.feeTxHash || "").slice(0, 18) + "... â†—";
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
            document.getElementById("lockStatusMsg").textContent = "âœ“ Connected Base Wallet: " + accounts[0];
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
          msgEl.textContent = "âœ“ Dual EIP-3009 Signatures Verified & Locked in Non-Custodial Edge Hold!";
          await loadDeal();
        } else {
          msgEl.textContent = "Error: " + (data.message || data.error);
        }
      });

      // Real Injected Wallet (MetaMask / Coinbase) Dual EIP-3009 Signing
      document.getElementById("signDualLockBtn").addEventListener("click", async () => {
        const msgEl = document.getElementById("lockStatusMsg");
        if (!window.ethereum) {
          msgEl.textContent = "No injected wallet found â€” executing Sandbox EIP-3009 Dual Lock...";
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
            msgEl.textContent = "âœ“ Dual EIP-3009 Authorizations Verified & Locked!";
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
          consoleEl.textContent += "\\n[3/4] âœ“ 100% Verification Match! Generated Redacted Preview.\\n[4/4] âœ“ Broadcasted Dual EIP-3009 Settlement (Seller Payout + 1.0% Fee to 0xB586...d5c)!";
        } else if (!data.verified) {
          consoleEl.textContent += "\\n[âœ•] Verification Failed ($0.00 charged to Buyer):\\n - " + (data.validationErrors || []).join("\\n - ");
        } else {
          consoleEl.textContent += "\\n[âœ“] Verification Passed! Status: " + data.status;
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
  let existing = await store.getSafePayDeal(dealId);
  if (!existing && dealId === "demo-ai-audit-101") {
    const now = Date.now();
    await store.saveSafePayDeal({
      id: "demo-ai-audit-101",
      title: "Demo: AI Smart Contract Audit & Dataset Bundle",
      description: "Zero-wallet interactive SafePay escrow sandbox deal",
      creatorRole: "seller",
      sellerAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      chainId: 8453,
      amountAtomic: "500000000",
      feePayer: "seller",
      sellerNetAtomic: "495000000",
      protocolFeeAtomic: "5000000",
      totalBuyerSignAtomic: "500000000",
      status: "CREATED",
      expiresAt: Math.floor(now / 1000) + 7 * 86400,
      verificationMode: "DATASET_SCHEMA",
      verificationSpec: {
        requiredColumns: ["email", "company", "domain", "revenueUsd"],
        minRows: 3,
        disallowNulls: true,
        rejectRefusals: true,
        inspectionWindowSeconds: 0,
        autoSettleOnPass: true,
        strictSingleShot: false
      },
      createdAt: now,
      updatedAt: now
    });
  }
  return c.html(renderSafePayDealRoomHtml(dealId));
});

// SEO Sitemap & Robots for nullclear.com
safepayWebRouter.get("/sitemap.xml", async (c) => {
  const trending = await getTrendingScans(c.env, undefined, 25);
  const urls = [
    "https://nullclear.com/",
    "https://nullclear.com/x402",
    "https://nullclear.com/for/freelancers",
    "https://nullclear.com/for/data-brokers",
    "https://nullclear.com/for/ai-bounties",
    "https://nullclear.com/for/otc-digital",
    ...trending.map((t) => `https://nullclear.com/scan/${t.chain}/${t.address}`)
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

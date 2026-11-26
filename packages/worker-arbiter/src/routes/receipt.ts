import { Hono, type Context } from "hono";
import { getArbiterStore, type ClearingRecord, type Env } from "../env.js";
import { getPolyStore, type PolicyReceiptRecord } from "../services/poly-store.js";

export const receiptRouter = new Hono<Env>();

export function buildReceiptUrl(clearingId: string): string {
  return `https://nullclear.dev/receipt/${encodeURIComponent(clearingId)}`;
}

export function attachReceiptHeader(c: Context<Env>, clearingId: string): string {
  const url = buildReceiptUrl(clearingId);
  c.header("X-NullClear-Receipt-Url", url);
  c.set("receiptUrl", url);
  return url;
}

function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUsdcFromAtomic(atomic: string | undefined): string {
  const n = Number(atomic || "0");
  if (!Number.isFinite(n)) return "0.000000";
  return (n / 1_000_000).toFixed(n % 100 === 0 ? 4 : 6);
}

function formatNetworkLabel(network: string | undefined): string {
  const lower = (network || "eip155:8453").toLowerCase();
  if (lower.includes("84532") || lower.includes("sepolia")) {
    return "Base Sepolia eip155:84532";
  }
  return "Base Mainnet eip155:8453";
}

function getBaseScanBase(network: string | undefined): string {
  const lower = (network || "eip155:8453").toLowerCase();
  if (lower.includes("84532") || lower.includes("sepolia")) {
    return "https://sepolia.basescan.org";
  }
  return "https://basescan.org";
}

function buildReceiptJson(record: ClearingRecord) {
  const isPassed = record.status === "PASSED";
  const isSepolia = (record.network || "").includes("84532");
  const baseScan = getBaseScanBase(record.network);
  const receiptUrl = buildReceiptUrl(record.id);
  const amountUsdc = formatUsdcFromAtomic(record.amount);
  const feeUsdc = formatUsdcFromAtomic(record.fee);
  const timestampUtc = new Date(record.createdAt || 0).toISOString();
  const isValidBuyerAddr = /^0x[a-fA-F0-9]{40}$/.test(record.buyerAddress || "");
  const isTxHash = /^0x[a-fA-F0-9]{64}$/.test(record.responseHash || "");
  const subject = record.targetAddress
    ? `${record.targetChain || "base"}:${record.targetAddress}`
    : record.targetUrl;

  const verificationSummary = isPassed
    ? `Cryptographically cleared and settled on ${formatNetworkLabel(record.network)}. EIP-3009 authorization (${record.eip3009Nonce || "recorded"}) passed NullClear schema & integrity verification before USDC transfer ($${amountUsdc} USDC).`
    : `Voided by NullClear Arbiter (${record.status}). Buyer EIP-3009 authorization was never settled on-chain ($0.00 USDC charged)${record.errorReason ? ` — Reason: ${record.errorReason}` : ""}.`;

  return {
    id: record.id,
    clearingId: record.id,
    receiptUrl,
    status: record.status,
    statusBadge: isPassed ? "PASSED" : "VOIDED — $0 Charged",
    cleared: isPassed,
    network: record.network || "eip155:8453",
    networkLabel: formatNetworkLabel(record.network),
    timestampUtc,
    createdAt: record.createdAt,
    buyerAddress: record.buyerAddress,
    buyerExplorerUrl: isValidBuyerAddr ? `${baseScan}/address/${record.buyerAddress}` : null,
    sellerAgentId: record.sellerAgentId || "124595",
    erc8004Label: `ERC-8004 #${record.sellerAgentId || "124595"}`,
    amountAtomic: record.amount || "0",
    amountUsdc: isPassed ? amountUsdc : "0.0000",
    feeAtomic: record.fee || "0",
    feeUsdc: isPassed ? feeUsdc : "0.0000",
    targetUrl: record.targetUrl,
    subject,
    targetAddress: record.targetAddress || null,
    targetChain: record.targetChain || null,
    queryType: record.queryType || null,
    responseHash: record.responseHash || null,
    txExplorerUrl: isPassed && isTxHash ? `${baseScan}/tx/${record.responseHash}` : null,
    attestationSignature: record.attestationSignature || null,
    eip3009Nonce: record.eip3009Nonce || null,
    errorReason: record.errorReason || null,
    integrity: {
      verified: true,
      hasResponseHash: Boolean(record.responseHash),
      hasAttestationSignature: Boolean(record.attestationSignature),
      hasEip3009Nonce: Boolean(record.eip3009Nonce),
      chainExplorer: baseScan,
      isTestnet: isSepolia,
      summary: verificationSummary
    }
  };
}

function renderReceiptHtml(record: ClearingRecord): string {
  const data = buildReceiptJson(record);
  const isPassed = data.cleared;
  const badgeBg = isPassed ? "rgba(16, 185, 129, 0.14)" : "rgba(244, 63, 94, 0.14)";
  const badgeBorder = isPassed ? "rgba(16, 185, 129, 0.45)" : "rgba(244, 63, 94, 0.45)";
  const badgeColor = isPassed ? "#10B981" : "#F43F5E";

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear Clearing Receipt ${escapeHtml(data.id)} — ${escapeHtml(data.statusBadge)}</title>
  <meta name="description" content="Public cryptographic clearing receipt ${escapeHtml(data.id)} on ${escapeHtml(data.networkLabel)} — ${escapeHtml(data.statusBadge)}." />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    :root {
      --bg: #07090E;
      --surface: #0C1018;
      --surface-2: #111827;
      --border: rgba(255, 255, 255, 0.09);
      --emerald: #10B981;
      --cyan: #38BDF8;
      --rose: #F43F5E;
      --amber: #F59E0B;
      --text: #F8FAFC;
      --muted: #94A3B8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      line-height: 1.55;
      padding: 28px 16px 64px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 22px;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      text-decoration: none;
      font-weight: 800;
      font-size: 18px;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #10B981, #38BDF8);
      color: #04130D;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
    }
    .nav-links { display: flex; gap: 8px; flex-wrap: wrap; }
    .nav-btn {
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 7px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
    }
    .nav-btn:hover { color: var(--text); border-color: rgba(56, 189, 248, 0.45); }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 18px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 13px;
      background: ${badgeBg};
      border: 1px solid ${badgeBorder};
      color: ${badgeColor};
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
      margin-top: 18px;
    }
    .kv {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 13px 15px;
    }
    .kv-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 700;
      margin-bottom: 4px;
    }
    .kv-val {
      font-size: 13.5px;
      color: var(--text);
      word-break: break-all;
    }
    a.ext { color: var(--cyan); text-decoration: none; }
    a.ext:hover { text-decoration: underline; }
    .proof-row {
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    .proof-row:last-child { border-bottom: none; }
    .summary-box {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 10px;
      padding: 15px 18px;
      font-size: 13.5px;
      color: #D1FAE5;
      margin-top: 16px;
    }
    .summary-box.voided {
      background: rgba(244, 63, 94, 0.08);
      border-color: rgba(244, 63, 94, 0.35);
      color: #FFE4E6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="topbar">
      <a href="/" class="brand">
        <span class="brand-mark">N</span>
        <span>NullClear Receipt Verifier</span>
      </a>
      <div class="nav-links">
        <a href="/v1/receipt/${escapeHtml(encodeURIComponent(data.id))}" class="nav-btn mono">JSON Proof</a>
        <a href="/history" class="nav-btn">Live History</a>
        <a href="/x402" class="nav-btn">x402 Gateway</a>
        <a href="/firewall" class="nav-btn">Firewall</a>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <div class="mono" style="font-size:11.5px;color:var(--cyan);font-weight:700;">CRYPTOGRAPHIC CLEARING PROOF</div>
          <h1 class="mono" style="font-size:21px;font-weight:800;margin-top:4px;word-break:break-all;">${escapeHtml(data.id)}</h1>
        </div>
        <span class="status-pill mono">${isPassed ? "✓ " : "✕ "}${escapeHtml(data.statusBadge)}</span>
      </div>

      <div class="summary-box${isPassed ? "" : " voided"}">
        <strong>Integrity Verification Summary:</strong> ${escapeHtml(data.integrity.summary)}
      </div>

      <div class="grid">
        <div class="kv">
          <div class="kv-label">Network</div>
          <div class="kv-val mono">${escapeHtml(data.networkLabel)}</div>
        </div>
        <div class="kv">
          <div class="kv-label">Timestamp (UTC)</div>
          <div class="kv-val mono">${escapeHtml(data.timestampUtc)}</div>
        </div>
        <div class="kv">
          <div class="kv-label">USDC Amount &amp; Protocol Fee</div>
          <div class="kv-val mono" style="color:${isPassed ? "#10B981" : "#94A3B8"};font-weight:700;">
            $${escapeHtml(data.amountUsdc)} USDC <span style="color:var(--muted);font-weight:400;">(Fee: $${escapeHtml(data.feeUsdc)} USDC)</span>
          </div>
        </div>
        <div class="kv">
          <div class="kv-label">Seller Agent ID</div>
          <div class="kv-val mono">${escapeHtml(data.erc8004Label)}</div>
        </div>
        <div class="kv">
          <div class="kv-label">Buyer Address</div>
          <div class="kv-val mono">
            ${
              data.buyerExplorerUrl
                ? `<a class="ext" href="${escapeHtml(data.buyerExplorerUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.buyerAddress)} ↗</a>`
                : escapeHtml(data.buyerAddress)
            }
          </div>
        </div>
        <div class="kv">
          <div class="kv-label">Target URL / Subject</div>
          <div class="kv-val mono">${escapeHtml(data.subject)}</div>
          ${data.targetAddress ? `<div class="mono" style="font-size:11px;color:var(--muted);margin-top:4px;">${escapeHtml(data.targetUrl)}</div>` : ""}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="mono" style="font-size:12px;color:var(--emerald);font-weight:700;margin-bottom:8px;">CRYPTOGRAPHIC ARTIFACTS</div>
      <div class="proof-row">
        <div class="kv-label">Response Hash / Settlement Tx</div>
        <div class="kv-val mono">
          ${
            data.txExplorerUrl
              ? `<a class="ext" href="${escapeHtml(data.txExplorerUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.responseHash)} ↗</a>`
              : escapeHtml(data.responseHash || "—")
          }
        </div>
      </div>
      <div class="proof-row">
        <div class="kv-label">Attestation Signature</div>
        <div class="kv-val mono">${escapeHtml(data.attestationSignature || "—")}</div>
      </div>
      <div class="proof-row">
        <div class="kv-label">EIP-3009 Nonce</div>
        <div class="kv-val mono">${escapeHtml(data.eip3009Nonce || "—")}</div>
      </div>
      ${
        data.errorReason
          ? `<div class="proof-row">
              <div class="kv-label">Void / Rejection Reason</div>
              <div class="kv-val mono" style="color:var(--rose);">${escapeHtml(data.errorReason)}</div>
            </div>`
          : ""
      }
    </div>
  </div>
</body>
</html>`;
}

function renderNotFoundHtml(clearingId: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Receipt Not Found — NullClear</title>
  <style>
    body { background: #07090E; color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .box { max-width: 560px; background: #0C1018; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 28px; text-align: center; }
    .mono { font-family: "JetBrains Mono", ui-monospace, monospace; }
    a { color: #38BDF8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="box">
    <div class="mono" style="color:#F43F5E;font-weight:800;font-size:13px;">HTTP 404 &bull; RECEIPT NOT FOUND</div>
    <h1 style="font-size:22px;margin:10px 0;">Clearing Receipt Not Found</h1>
    <p style="color:#94A3B8;font-size:14px;margin-bottom:18px;">
      No clearing record was found for ID <code class="mono">${escapeHtml(clearingId)}</code>.
    </p>
    <a href="/history">View Live Agent History &rarr;</a>
  </div>
</body>
</html>`;
}

function buildPolyReceiptJson(record: PolicyReceiptRecord) {
  const isAllowed = record.verdict === "ALLOWED";
  const verdictLabel = isAllowed
    ? "ALLOWED"
    : `BLOCKED: ${record.rejectionCode || "POLICY_VIOLATION"}`;
  return {
    id: record.id,
    receiptType: "POLYMARKET_POLICY_RECEIPT",
    receiptUrl: buildReceiptUrl(record.id),
    verdict: record.verdict,
    verdictLabel,
    mode: record.mode,
    timestampUtc: new Date(record.createdAt).toISOString(),
    createdAt: record.createdAt,
    userId: record.userId,
    policyId: record.policyId,
    walletAddress: record.walletAddress,
    whaleAddress: record.whaleAddress,
    market: {
      assetId: record.assetId,
      title: record.marketTitle,
      category: record.category,
      side: record.side
    },
    execution: {
      orderSizeUsd: record.orderSizeUsd,
      triggerPrice: record.triggerPrice,
      liveBookAsk: record.liveBookAsk,
      executionPrice: record.executionPrice,
      slippageCents: record.slippageCents,
      computedFeeUsd: record.computedFeeUsd,
      computedFeeDragPct: record.computedFeeDragPct
    },
    rulesEvaluated: record.rulesEvaluated,
    policySnapshot: record.policySnapshot,
    settlement: {
      chainId: 137,
      collateral: "pUSD",
      clobOrderId: record.clobOrderId,
      polygonTxHash: record.polygonTxHash,
      polygonExplorerUrl: record.polygonTxHash
        ? `https://polygonscan.com/tx/${record.polygonTxHash}`
        : null,
      builderCode: record.builderCode
    },
    attestation: {
      coSignerAddress: record.cosignerAddress,
      coSignerSignature: record.cosignerSignature
    }
  };
}

function renderPolyReceiptHtml(record: PolicyReceiptRecord): string {
  const data = buildPolyReceiptJson(record);
  const isAllowed = record.verdict === "ALLOWED";
  const badgeBg = isAllowed ? "rgba(16, 185, 129, 0.14)" : "rgba(244, 63, 94, 0.14)";
  const badgeBorder = isAllowed ? "rgba(16, 185, 129, 0.45)" : "rgba(244, 63, 94, 0.45)";
  const badgeColor = isAllowed ? "#10B981" : "#F43F5E";

  const rulesRows = record.rulesEvaluated
    .map(
      (r) => `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
        <div>
          <span class="mono" style="font-size:12px;font-weight:700;color:${r.passed ? "#10B981" : "#F43F5E"};">${r.passed ? "✓ PASS" : "✕ BLOCK"}</span>
          <span class="mono" style="font-size:12px;color:#E2E8F0;margin-left:8px;">${escapeHtml(r.rule)}</span>
          <div style="font-size:12.5px;color:#94A3B8;margin-top:3px;">${escapeHtml(r.detail)}</div>
        </div>
        ${r.code ? `<span class="mono" style="font-size:11px;color:#F43F5E;background:rgba(244,63,94,0.12);padding:2px 8px;border-radius:4px;">${escapeHtml(r.code)}</span>` : ""}
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear Policy Receipt ${escapeHtml(data.id)} — ${escapeHtml(data.verdictLabel)}</title>
  <meta name="description" content="Verifiable NullClear Polymarket Policy Receipt (${escapeHtml(data.verdictLabel)}) for ${escapeHtml(record.marketTitle)}." />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    :root { --bg:#07090E; --surface:#0C1018; --surface-2:#111827; --border:rgba(255,255,255,0.09); --emerald:#10B981; --cyan:#38BDF8; --rose:#F43F5E; --text:#F8FAFC; --muted:#94A3B8; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,sans-serif; line-height:1.55; padding:28px 16px 64px; }
    .container { max-width:920px; margin:0 auto; }
    .mono { font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace; }
    .topbar { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:22px; }
    .brand { display:inline-flex; align-items:center; gap:10px; color:var(--text); text-decoration:none; font-weight:800; font-size:18px; }
    .brand-mark { width:32px; height:32px; border-radius:8px; background:linear-gradient(135deg,#10B981,#38BDF8); color:#04130D; display:inline-flex; align-items:center; justify-content:center; font-weight:900; }
    .nav-btn { color:var(--muted); text-decoration:none; font-size:13px; font-weight:600; padding:7px 12px; border-radius:8px; border:1px solid var(--border); background:var(--surface); }
    .nav-btn:hover { color:var(--text); border-color:rgba(56,189,248,0.45); }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:24px; margin-bottom:18px; }
    .status-pill { display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border-radius:999px; font-weight:800; font-size:13px; background:${badgeBg}; border:1px solid ${badgeBorder}; color:${badgeColor}; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-top:18px; }
    .kv { background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 14px; }
    .kv-label { font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); font-weight:700; margin-bottom:4px; }
    .kv-val { font-size:13.5px; color:var(--text); word-break:break-all; }
    a.ext { color:var(--cyan); text-decoration:none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="topbar">
      <a href="/" class="brand"><span class="brand-mark">N</span><span>NullClear Policy Receipt</span></a>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a href="/v1/receipt/${escapeHtml(encodeURIComponent(data.id))}" class="nav-btn mono">JSON Proof</a>
        <a href="https://nullclear.com/terminal" class="nav-btn">Polymarket Terminal &rarr;</a>
        ${record.whaleAddress ? `<a href="https://nullclear.com/whale/${escapeHtml(record.whaleAddress)}" class="nav-btn">Audit Whale</a>` : ""}
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <div class="mono" style="font-size:11.5px;color:var(--cyan);font-weight:700;">POLYMARKET CLOB V2 POLICY VERDICT &bull; ${escapeHtml(record.mode.toUpperCase())} MODE</div>
          <h1 style="font-size:20px;font-weight:800;margin-top:6px;">${escapeHtml(record.marketTitle)}</h1>
          <div class="mono" style="font-size:12px;color:var(--muted);margin-top:4px;">Receipt ID: ${escapeHtml(record.id)}</div>
        </div>
        <span class="status-pill mono">${isAllowed ? "✓ " : "✕ "}${escapeHtml(data.verdictLabel)}</span>
      </div>

      <div class="grid">
        <div class="kv">
          <div class="kv-label">Timestamp (UTC)</div>
          <div class="kv-val mono">${escapeHtml(data.timestampUtc)}</div>
        </div>
        <div class="kv">
          <div class="kv-label">Side &amp; Category</div>
          <div class="kv-val mono">${escapeHtml(record.side)} &middot; ${escapeHtml(record.category)}</div>
        </div>
        <div class="kv">
          <div class="kv-label">Order Notional</div>
          <div class="kv-val mono">$${record.orderSizeUsd.toFixed(2)} pUSD</div>
        </div>
        <div class="kv">
          <div class="kv-label">Trigger / Live Book Ask</div>
          <div class="kv-val mono">${(record.triggerPrice * 100).toFixed(2)}¢ / ${(record.liveBookAsk * 100).toFixed(2)}¢ (${record.slippageCents.toFixed(2)}¢ slip)</div>
        </div>
        <div class="kv">
          <div class="kv-label">2026 Fee &amp; Total Drag</div>
          <div class="kv-val mono">$${record.computedFeeUsd.toFixed(4)} (${record.computedFeeDragPct.toFixed(2)}% drag)</div>
        </div>
        <div class="kv">
          <div class="kv-label">Asset ID (V2 / CTF)</div>
          <div class="kv-val mono" style="font-size:11.5px;">${escapeHtml(record.assetId)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="mono" style="font-size:12px;color:var(--emerald);font-weight:700;margin-bottom:8px;">POLICY GUARDRAILS EVALUATED (${record.rulesEvaluated.length})</div>
      ${rulesRows}
    </div>

    <div class="card">
      <div class="mono" style="font-size:12px;color:var(--cyan);font-weight:700;margin-bottom:10px;">CRYPTOGRAPHIC CO-SIGNER &amp; ATTRIBUTION</div>
      <div class="kv" style="margin-bottom:10px;">
        <div class="kv-label">EIP-712 Co-Signer Address (Polygon 137)</div>
        <div class="kv-val mono">${escapeHtml(record.cosignerAddress || "—")}</div>
      </div>
      <div class="kv" style="margin-bottom:10px;">
        <div class="kv-label">PolymarketPolicyApproval Signature</div>
        <div class="kv-val mono" style="font-size:11.5px;">${escapeHtml(record.cosignerSignature || "NONE (Trade Blocked Before Signing)")}</div>
      </div>
      <div class="kv" style="margin-bottom:10px;">
        <div class="kv-label">V2 Order Builder Attribution (bytes32)</div>
        <div class="kv-val mono" style="font-size:11.5px;">${escapeHtml(record.builderCode || "—")}</div>
      </div>
      ${
        record.clobOrderId || record.polygonTxHash
          ? `<div class="kv">
              <div class="kv-label">CLOB V2 Order / Polygon Settlement</div>
              <div class="kv-val mono">${escapeHtml(record.clobOrderId || "—")} ${
                record.polygonTxHash
                  ? `(<a class="ext" href="https://polygonscan.com/tx/${escapeHtml(record.polygonTxHash)}" target="_blank" rel="noopener">PolygonScan &#8599;</a>)`
                  : ""
              }</div>
            </div>`
          : ""
      }
    </div>
  </div>
</body>
</html>`;
}

// GET /v1/receipt/:id — Structured JSON clearing proof OR Polymarket Policy Receipt
receiptRouter.get("/v1/receipt/:id", async (c) => {
  const id = (c.req.param("id") || "").trim();
  if (!id) {
    return c.json({ error: "Missing receipt ID" }, 400);
  }
  const store = getArbiterStore(c.env);
  const record = await store.getClearingById(id);
  if (record) {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(buildReceiptJson(record), 200);
  }
  const polyReceipt = await getPolyStore(c.env).getPolicyReceipt(id);
  if (polyReceipt) {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(buildPolyReceiptJson(polyReceipt), 200);
  }
  return c.json({ error: "Receipt not found", clearingId: id }, 404);
});

// GET /receipt/:id — Public HTML verification page (or JSON if Accept prefers application/json)
receiptRouter.get("/receipt/:id", async (c) => {
  const id = (c.req.param("id") || "").trim();
  if (!id) {
    return c.json({ error: "Missing receipt ID" }, 400);
  }
  const accept = (c.req.header("accept") || "").toLowerCase();
  const wantsJson =
    accept.includes("application/json") &&
    (!accept.includes("text/html") || accept.indexOf("application/json") < accept.indexOf("text/html"));

  const store = getArbiterStore(c.env);
  const record = await store.getClearingById(id);
  if (record) {
    c.header("Cache-Control", "public, max-age=300");
    if (wantsJson) {
      return c.json(buildReceiptJson(record), 200);
    }
    return c.html(renderReceiptHtml(record), 200);
  }

  const polyReceipt = await getPolyStore(c.env).getPolicyReceipt(id);
  if (polyReceipt) {
    c.header("Cache-Control", "public, max-age=300");
    if (wantsJson) {
      return c.json(buildPolyReceiptJson(polyReceipt), 200);
    }
    return c.html(renderPolyReceiptHtml(polyReceipt), 200);
  }

  if (wantsJson) {
    return c.json({ error: "Receipt not found", clearingId: id }, 404);
  }
  return c.html(renderNotFoundHtml(id), 404);
});

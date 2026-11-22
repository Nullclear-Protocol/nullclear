import type { ForensicScanPayload } from "./forensics-engine.js";

export type TokenVerdictGrade = "A" | "B" | "C" | "D" | "F";
export type TokenVerdictAction = "EXECUTE_SAFE" | "CAUTION_HIGH_TAX" | "BLOCK_HONEYPOT";

export interface TokenVerdictPayload {
  tokenAddress: string;
  chain: string;
  symbol: string;
  name: string;
  grade: TokenVerdictGrade;
  securityScore: number;
  oneLineVerdict: string;
  recommendedAgentAction: TokenVerdictAction;
  evidence: {
    isHoneypot: boolean;
    buyTaxBps: number;
    sellTaxBps: number;
    isProxy: boolean;
    proxyType: string | null;
    implementationAddress: string | null;
    hasDelegateCall: boolean;
    hasSelfDestruct: boolean;
    liquidityUsd: number;
    ownerStatus: string;
    dangerousSelectorsFound: string[];
  };
  scorecardUrl: string;
  shareCardImageUrl: string;
  attestation: string;
  cached: boolean;
}

function escapeXml(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatUsdCompact(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

function shortAddress(addr: string): string {
  if (!addr || addr.length <= 16) return addr || "";
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function buildTokenVerdictPayload(scan: ForensicScanPayload): TokenVerdictPayload {
  const buyTaxBps = Math.max(0, Math.round((scan.evidence.buyTaxPercent || 0) * 100));
  const sellTaxBps = Math.max(0, Math.round((scan.evidence.sellTaxPercent || 0) * 100));
  const liquidityUsd = Number((scan.evidence.liquidityUsd || 0).toFixed(2));
  const isHoneypot = Boolean(scan.evidence.isHoneypot);
  const isProxy = Boolean(scan.evidence.isProxy);
  const hasSelfDestruct = Boolean(scan.evidence.hasSelfDestruct);
  const hasDelegateCall = Boolean(scan.evidence.hasDelegateCall);
  const securityScore = Math.max(0, Math.min(100, Math.round(scan.score)));

  const hardTrap =
    isHoneypot ||
    sellTaxBps >= 5000 ||
    hasSelfDestruct ||
    scan.recommendedAgentAction === "ABORT_CRITICAL_TRAP";

  const highTaxOrCaution =
    buyTaxBps >= 500 ||
    sellTaxBps >= 500 ||
    scan.recommendedAgentAction === "CAUTION_HIGH_RISK" ||
    securityScore < 70;

  let grade: TokenVerdictGrade;
  if (hardTrap || securityScore < 30) {
    grade = "F";
  } else if (securityScore >= 85 && !highTaxOrCaution) {
    grade = "A";
  } else if (securityScore >= 70) {
    grade = "B";
  } else if (securityScore >= 50) {
    grade = "C";
  } else {
    grade = "D";
  }

  let recommendedAgentAction: TokenVerdictAction;
  if (hardTrap) {
    recommendedAgentAction = "BLOCK_HONEYPOT";
  } else if (highTaxOrCaution || grade === "C" || grade === "D") {
    recommendedAgentAction = "CAUTION_HIGH_TAX";
  } else {
    recommendedAgentAction = "EXECUTE_SAFE";
  }

  const symbolLabel = scan.symbol && scan.symbol !== "UNKNOWN" ? scan.symbol : shortAddress(scan.address);
  const chainUpper = scan.chain.toUpperCase();
  const taxText = `${(buyTaxBps / 100).toFixed(buyTaxBps % 100 === 0 ? 0 : 1)}%/${(sellTaxBps / 100).toFixed(sellTaxBps % 100 === 0 ? 0 : 1)}% buy/sell tax`;
  const proxyText = isProxy
    ? `${scan.evidence.proxyType || "upgradeable"} proxy`
    : "non-proxy bytecode";
  const liqText = liquidityUsd > 0 ? `${formatUsdCompact(liquidityUsd)} DEX liquidity` : "thin/unindexed DEX liquidity";

  let oneLineVerdict: string;
  if (recommendedAgentAction === "BLOCK_HONEYPOT") {
    const trapReasons: string[] = [];
    if (isHoneypot) trapReasons.push("honeypot sell-trap");
    if (sellTaxBps >= 5000) trapReasons.push(`${(sellTaxBps / 100).toFixed(0)}% sell tax`);
    if (hasSelfDestruct) trapReasons.push("SELFDESTRUCT opcode");
    if (scan.evidence.dangerousSelectorsFound.length > 0) {
      trapReasons.push(`admin trap selectors (${scan.evidence.dangerousSelectorsFound.slice(0, 2).join(", ")})`);
    }
    const reasonStr = trapReasons.length > 0 ? trapReasons.join(" + ") : "critical bytecode trap";
    oneLineVerdict = `BLOCK (${grade} · ${securityScore}/100): ${symbolLabel} on ${chainUpper} — ${reasonStr} detected; hard abort before signing.`;
  } else if (recommendedAgentAction === "CAUTION_HIGH_TAX") {
    const notes: string[] = [taxText, proxyText, liqText];
    if (scan.evidence.solanaAuthorities?.mintAuthority) notes.push("active SPL mint authority");
    if (scan.evidence.solanaAuthorities?.freezeAuthority) notes.push("active SPL freeze authority");
    oneLineVerdict = `CAUTION (${grade} · ${securityScore}/100): ${symbolLabel} on ${chainUpper} — ${notes.slice(0, 3).join(", ")}; verify slippage and admin controls.`;
  } else {
    oneLineVerdict = `SAFE (${grade} · ${securityScore}/100): ${symbolLabel} on ${chainUpper} — ${taxText}, no honeypot, ${proxyText}, ${liqText}.`;
  }

  return {
    tokenAddress: scan.address,
    chain: scan.chain,
    symbol: scan.symbol,
    name: scan.name,
    grade,
    securityScore,
    oneLineVerdict,
    recommendedAgentAction,
    evidence: {
      isHoneypot,
      buyTaxBps,
      sellTaxBps,
      isProxy,
      proxyType: scan.evidence.proxyType,
      implementationAddress: scan.evidence.implementationAddress,
      hasDelegateCall,
      hasSelfDestruct,
      liquidityUsd,
      ownerStatus: scan.evidence.ownerStatus,
      dangerousSelectorsFound: scan.evidence.dangerousSelectorsFound || []
    },
    scorecardUrl: `https://nullclear.dev/verdict/${scan.chain}/${scan.address}`,
    shareCardImageUrl: `https://api.nullclear.dev/v1/verdict-card/${scan.chain}/${scan.address}.svg`,
    attestation: scan.provenance.attestationSha256,
    cached: Boolean(scan.cached)
  };
}

function wrapLine(text: string, maxChars = 64): [string, string] {
  if (text.length <= maxChars) return [text, ""];
  const cut = text.lastIndexOf(" ", maxChars);
  const idx = cut > 20 ? cut : maxChars;
  const first = text.slice(0, idx).trim();
  const rest = text.slice(idx).trim();
  const second = rest.length > maxChars ? `${rest.slice(0, maxChars - 1)}…` : rest;
  return [first, second];
}

export function renderTokenVerdictSvg(v: TokenVerdictPayload): string {
  const palette =
    v.recommendedAgentAction === "EXECUTE_SAFE"
      ? { accent: "#10B981", glow: "rgba(16,185,129,0.22)", badgeBg: "#064E3B", label: "EXECUTE_SAFE" }
      : v.recommendedAgentAction === "CAUTION_HIGH_TAX"
        ? { accent: "#F59E0B", glow: "rgba(245,158,11,0.22)", badgeBg: "#78350F", label: "CAUTION_HIGH_TAX" }
        : { accent: "#EF4444", glow: "rgba(239,68,68,0.25)", badgeBg: "#7F1D1D", label: "BLOCK_HONEYPOT" };

  const symbol = escapeXml((v.symbol || "TOKEN").slice(0, 16));
  const name = escapeXml((v.name || v.symbol || "Unknown Token").slice(0, 34));
  const chain = escapeXml(v.chain.toUpperCase());
  const addrShort = escapeXml(shortAddress(v.tokenAddress));
  const attShort = escapeXml((v.attestation || "").slice(0, 18));
  const [line1, line2] = wrapLine(v.oneLineVerdict, 68);

  const buyPct = (v.evidence.buyTaxBps / 100).toFixed(v.evidence.buyTaxBps % 100 === 0 ? 0 : 1);
  const sellPct = (v.evidence.sellTaxBps / 100).toFixed(v.evidence.sellTaxBps % 100 === 0 ? 0 : 1);
  const taxTile = `${buyPct}% / ${sellPct}%`;
  const trapTile = v.evidence.isHoneypot
    ? "HONEYPOT"
    : v.evidence.hasSelfDestruct
      ? "SELFDESTRUCT"
      : "CLEAN";
  const proxyTile = v.evidence.isProxy ? (v.evidence.proxyType || "PROXY").slice(0, 14) : "IMMUTABLE";
  const liqTile = formatUsdCompact(v.evidence.liquidityUsd);
  const barWidth = Math.max(12, Math.round((v.securityScore / 100) * 680));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="NullClear Token Verdict ${symbol} Grade ${v.grade}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#060911"/>
      <stop offset="100%" stop-color="#0D1424"/>
    </linearGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${palette.accent}"/>
      <stop offset="100%" stop-color="#38BDF8"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="28" y="28" width="1144" height="574" rx="24" fill="#0B111E" stroke="${palette.accent}" stroke-opacity="0.35" stroke-width="2"/>

  <!-- Header -->
  <text x="70" y="88" fill="#38BDF8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" font-weight="700" letter-spacing="2">NULLCLEAR BYTECODE VERDICT</text>
  <rect x="920" y="58" width="212" height="40" rx="20" fill="${palette.badgeBg}" stroke="${palette.accent}" stroke-width="1.5"/>
  <text x="1026" y="84" text-anchor="middle" fill="${palette.accent}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" font-weight="800">${palette.label}</text>

  <!-- Grade Emblem -->
  <rect x="70" y="130" width="184" height="184" rx="24" fill="${palette.glow}" stroke="${palette.accent}" stroke-width="3"/>
  <text x="162" y="246" text-anchor="middle" fill="${palette.accent}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="112" font-weight="900">${escapeXml(v.grade)}</text>
  <text x="162" y="290" text-anchor="middle" fill="#E2E8F0" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22" font-weight="700">${v.securityScore} / 100</text>

  <!-- Token Identity -->
  <text x="290" y="182" fill="#F8FAFC" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="48" font-weight="800">${symbol}</text>
  <rect x="${Math.min(820, 315 + Math.max(symbol.length, 3) * 28)}" y="146" width="108" height="36" rx="10" fill="#1E293B" stroke="#334155"/>
  <text x="${Math.min(820, 315 + Math.max(symbol.length, 3) * 28) + 54}" y="170" text-anchor="middle" fill="#94A3B8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" font-weight="700">${chain}</text>
  <text x="290" y="220" fill="#94A3B8" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="22" font-weight="500">${name}  •  ${addrShort}</text>

  <!-- Score bar -->
  <rect x="290" y="248" width="680" height="14" rx="7" fill="#1E293B"/>
  <rect x="290" y="248" width="${barWidth}" height="14" rx="7" fill="url(#barGrad)"/>

  <!-- One-line Verdict -->
  <text x="290" y="302" fill="#E2E8F0" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="22" font-weight="600">${escapeXml(line1)}</text>
  ${line2 ? `<text x="290" y="334" fill="#CBD5E1" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="22" font-weight="500">${escapeXml(line2)}</text>` : ""}

  <!-- 4 Evidence Tiles -->
  <g transform="translate(70, 382)">
    <rect x="0" y="0" width="250" height="122" rx="16" fill="#11192C" stroke="#1E293B" stroke-width="1.5"/>
    <text x="22" y="38" fill="#64748B" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700">BUY / SELL TAX</text>
    <text x="22" y="88" fill="#F8FAFC" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="800">${escapeXml(taxTile)}</text>

    <rect x="270" y="0" width="250" height="122" rx="16" fill="#11192C" stroke="#1E293B" stroke-width="1.5"/>
    <text x="292" y="38" fill="#64748B" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700">HONEYPOT / CFG</text>
    <text x="292" y="88" fill="${v.evidence.isHoneypot || v.evidence.hasSelfDestruct ? "#EF4444" : "#10B981"}" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="800">${escapeXml(trapTile)}</text>

    <rect x="540" y="0" width="250" height="122" rx="16" fill="#11192C" stroke="#1E293B" stroke-width="1.5"/>
    <text x="562" y="38" fill="#64748B" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700">PROXY / UPGRADE</text>
    <text x="562" y="88" fill="#F8FAFC" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="800">${escapeXml(proxyTile)}</text>

    <rect x="810" y="0" width="250" height="122" rx="16" fill="#11192C" stroke="#1E293B" stroke-width="1.5"/>
    <text x="832" y="38" fill="#64748B" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700">DEX LIQUIDITY</text>
    <text x="832" y="88" fill="#38BDF8" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="800">${escapeXml(liqTile)}</text>
  </g>

  <!-- Footer -->
  <text x="70" y="564" fill="#64748B" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15">ATTESTATION SHA-256: ${attShort}…  •  7-CHAIN BYTECODE &amp; SIMULATION ORACLE</text>
  <text x="1130" y="564" text-anchor="end" fill="#10B981" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" font-weight="700">nullclear.dev  •  $0.005 x402</text>
</svg>`;
}

export function renderTokenVerdictHtmlPage(v: TokenVerdictPayload): string {
  const title = `${v.symbol} (${v.chain.toUpperCase()}) Grade ${v.grade} — NullClear Token Verdict`;
  const desc = v.oneLineVerdict;
  const fullScanUrl = `https://nullclear.com/scan/${v.chain}/${v.tokenAddress}`;
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(title)}</title>
  <meta name="description" content="${escapeXml(desc)}" />
  <meta property="og:title" content="${escapeXml(title)}" />
  <meta property="og:description" content="${escapeXml(desc)}" />
  <meta property="og:image" content="${escapeXml(v.shareCardImageUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeXml(title)}" />
  <meta name="twitter:description" content="${escapeXml(desc)}" />
  <meta name="twitter:image" content="${escapeXml(v.shareCardImageUrl)}" />
  <style>
    :root { --bg:#060911; --surface:#0B111E; --border:rgba(255,255,255,0.1); --text:#F8FAFC; --muted:#94A3B8; --emerald:#10B981; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif; padding:28px 16px 64px; }
    .wrap { max-width:980px; margin:0 auto; }
    .card-img { width:100%; height:auto; border-radius:16px; border:1px solid var(--border); display:block; margin-bottom:20px; }
    .bar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px; }
    .btn { padding:10px 16px; border-radius:8px; border:1px solid var(--border); background:#11192C; color:var(--text); text-decoration:none; font-weight:700; font-size:14px; }
    .btn-primary { background:var(--emerald); color:#04130D; border-color:var(--emerald); }
    pre { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px; overflow-x:auto; font-family:"JetBrains Mono",ui-monospace,monospace; font-size:12.5px; color:#7DD3FC; }
  </style>
</head>
<body>
  <div class="wrap">
    <img class="card-img" src="${escapeXml(v.shareCardImageUrl)}" alt="${escapeXml(title)}" />
    <div class="bar">
      <a class="btn btn-primary" href="${escapeXml(v.shareCardImageUrl)}" target="_blank" rel="noopener">Download SVG Card</a>
      <a class="btn" href="${escapeXml(fullScanUrl)}">Full Forensic Report</a>
      <a class="btn" href="https://nullclear.dev/buy-pass">Get Prepaid Pass (USDC or Card)</a>
      <a class="btn" href="https://nullclear.dev/x402">x402 API Docs</a>
    </div>
    <pre>${escapeXml(JSON.stringify(v, null, 2))}</pre>
  </div>
</body>
</html>`;
}

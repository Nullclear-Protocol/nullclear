import { DEV_FONTS_HEAD, DEV_SHELL_CSS, renderDevFooter, renderDevHeader } from "./dev-shell.js";

export function renderDevX402Html(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear x402 — Non-Custodial EIP-3009 Schema Escrow &amp; Seller Gateways</title>
  <meta name="description" content="High-frequency x402 payment rail, EIP-3009 USDC settlement clearinghouse, and 1-Click Seller Gateways (/g/:slug) on Base Mainnet." />
  ${DEV_FONTS_HEAD}
  <style>
    ${DEV_SHELL_CSS}

    .page-head {
      padding: 48px 0 36px;
      border-bottom: 1px solid var(--border);
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 18px;
    }
    .field-label {
      display: block;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .field-input { width: 100%; }
    @media (max-width: 820px) {
      .form-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${renderDevHeader("x402")}

  <main class="container">
    <section class="page-head">
      <div class="eyebrow">X402 CLEARINGHOUSE &middot; EIP-3009 BASE MAINNET</div>
      <h1 class="h1" style="margin-top:12px;max-width:760px;">x402 Schema-Escrow &amp; Seller Gateways</h1>
      <p class="lead" style="margin-top:12px;max-width:680px;">
        Monetize any REST endpoint with automatic HTTP 402 payment challenges, or settle agent-to-agent calls only when upstream payloads pass deterministic schema and refusal checks.
      </p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:22px;">
        <a href="/buy-pass" class="btn btn-primary">Mint Prepaid Pass</a>
        <a href="/.well-known/x402" class="btn btn-secondary mono">/.well-known/x402</a>
      </div>
    </section>

    <section class="section">
      <div class="card">
        <div class="eyebrow">SELLER GATEWAY BUILDER</div>
        <h2 class="h2" style="margin-top:6px;">Register an x402 Seller Gateway (<code>/g/:slug</code>)</h2>
        <p class="muted" style="font-size:14px;margin-top:6px;max-width:700px;">
          Wrap any upstream REST endpoint with Base Mainnet USDC EIP-3009 <code>TransferWithAuthorization</code> ($0.005 USDC/call) and automatic refusal protection.
        </p>
        <div class="form-grid">
          <div>
            <label class="field-label" for="gwUrl">Upstream REST Endpoint</label>
            <input id="gwUrl" class="input field-input" value="https://api.coinbase.com/v2/prices/ETH-USD/spot" />
          </div>
          <div>
            <label class="field-label" for="gwWallet">Base USDC Wallet (0x...)</label>
            <input id="gwWallet" class="input field-input" value="0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c" />
          </div>
          <div>
            <label class="field-label" for="gwSlug">Gateway Slug</label>
            <input id="gwSlug" class="input field-input" placeholder="eth-spot-oracle" />
          </div>
        </div>
        <div style="margin-top:16px;">
          <button type="button" class="btn btn-primary" onclick="createGw()">Create x402 Gateway</button>
        </div>
        <pre id="gwResult" class="code-block" style="margin-top:16px;">// POST /v1/gateways -> https://api.nullclear.dev/g/:slug</pre>
      </div>
    </section>

    <section class="section">
      <div class="card">
        <div class="eyebrow">DEFERRED NON-CUSTODIAL ESCROW</div>
        <h2 class="h2" style="margin-top:6px;">Schema-Verified Settlement (<code>POST /v1/clear</code>)</h2>
        <p class="muted" style="font-size:14px;margin-top:8px;max-width:740px;">
          Buyers attach an EIP-3009 signature in <code>PAYMENT-SIGNATURE</code> or <code>X-Payment</code>. NullClear validates the upstream response against your Draft-07 JSON Schema, numeric invariants, and Canonical LLM Refusal Guard before settling on Base. Refusals or 5xx faults shred the authorization with $0.00 charged.
        </p>
        <pre class="code-block" style="margin-top:16px;">curl -X POST https://api.nullclear.dev/v1/clear \\
  -H "Content-Type: application/json" \\
  -H "x-nullclear-free-trial: true" \\
  -d '{"targetUrl":"https://api.nullclear.dev/v1/sandbox/market-feed","paymentSignatureHeader":"free-trial","validation":{"expectedStatus":[200],"rejectRefusals":true}}'</pre>
      </div>
    </section>
  </main>

  ${renderDevFooter()}

  <script>
    async function createGw() {
      const upstreamUrl = document.getElementById('gwUrl').value.trim();
      const sellerAddress = document.getElementById('gwWallet').value.trim();
      const slug = document.getElementById('gwSlug').value.trim() || ('gw-' + Math.random().toString(36).slice(2, 7));
      const out = document.getElementById('gwResult');
      out.textContent = 'Registering gateway...';
      try {
        const res = await fetch('/v1/gateways', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upstreamUrl, sellerAddress, slug, priceUsdc: '0.005', validationPreset: 'STRICT_NO_REFUSAL' })
        });
        out.textContent = JSON.stringify(await res.json(), null, 2);
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
}

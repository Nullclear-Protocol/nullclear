import { DEV_FONTS_HEAD, DEV_SHELL_CSS, renderDevFooter, renderDevHeader } from "./dev-shell.js";

export function renderDevFirewallHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NullClear Pre-Sign Firewall &amp; Guarded RPC — 7-Chain Transaction Security</title>
  <meta name="description" content="Stop AI trading bots and DeFi agents from buying honeypots or signing unlimited approval drainers. Drop-in pre-flight security for Coinbase AgentKit, ElizaOS, Base, Ethereum, and Solana." />
  ${DEV_FONTS_HEAD}
  <style>
    ${DEV_SHELL_CSS}

    .page-head {
      padding: 48px 0 36px;
      border-bottom: 1px solid var(--border);
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
    .sandbox-controls {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 14px;
    }
    .preset-strip {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 14px;
    }
    @media (max-width: 900px) {
      .grid-3, .grid-2 { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${renderDevHeader("firewall")}

  <main class="container">
    <section class="page-head">
      <div class="eyebrow">PRE-EXECUTION FIREWALL &middot; 7 CHAINS &middot; EVM + SOLANA</div>
      <h1 class="h1" style="margin-top:12px;max-width:780px;">Stop autonomous agents from signing drain and honeypot transactions in one call.</h1>
      <p class="lead" style="margin-top:14px;max-width:720px;">
        <code>POST /v1/guard</code> unwraps nested Universal Router, Multicall3, and Safe calldata, audits EIP-712 permits, simulates stateful asset diffs, and screens every touched token across 7 chains.
      </p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px;">
        <a href="#sandbox" class="btn btn-primary">Open Pre-Swap Sandbox</a>
        <a href="/buy-pass" class="btn btn-secondary">Mint Prepaid Pass</a>
      </div>
    </section>

    <section class="section">
      <div class="grid-3">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
            <span class="mono" style="font-size:13px;font-weight:600;">Base USDC</span>
            <span class="status-tag tag-safe">EXECUTE_SAFE</span>
          </div>
          <p class="muted" style="font-size:13.5px;">Resolves EIP-1967 proxy slot, verifies 0% buy/sell tax, confirms deep DEX liquidity, and returns SHA-256 provenance.</p>
        </div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
            <span class="mono" style="font-size:13px;font-weight:600;">Honeypot Catch</span>
            <span class="status-tag tag-danger">ABORT_CRITICAL_TRAP</span>
          </div>
          <p class="muted" style="font-size:13.5px;">Instruction-boundary bytecode disassembly and multi-oracle consensus flag sell-block and hidden tax traps before signature.</p>
        </div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
            <span class="mono" style="font-size:13px;font-weight:600;">Approval Drainer</span>
            <span class="status-tag tag-danger">ABORT_DRAINER_APPROVAL</span>
          </div>
          <p class="muted" style="font-size:13.5px;">Decodes raw <code>approve</code>, <code>setApprovalForAll</code>, and EIP-712 Permit signatures via <code>POST /v1/guard</code> before broadcast.</p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="eyebrow">DROP-IN INTEGRATIONS</div>
      <h2 class="h2" style="margin-top:8px;margin-bottom:20px;">SDKs &amp; Guarded JSON-RPC</h2>

      <div class="grid-2" style="margin-bottom:20px;">
        <div class="card">
          <div class="eyebrow">COINBASE AGENTKIT</div>
          <h3 class="h3" style="margin-top:6px;">@nullclear/agentkit</h3>
          <p class="muted" style="font-size:13px;margin-top:4px;">Drop-in <code>ActionProvider</code> and wallet transaction guard for Base and Solana.</p>
          <pre class="code-block" style="margin-top:12px;">import { AgentKit } from "@coinbase/agentkit";
import { nullclearActionProvider, createNullClearWalletGuard } from "@nullclear/agentkit";

const wallet = createNullClearWalletGuard(walletProvider);
const agentKit = await AgentKit.from({
  walletProvider: wallet,
  actionProviders: [nullclearActionProvider()]
});</pre>
        </div>
        <div class="card">
          <div class="eyebrow">ELIZAOS</div>
          <h3 class="h3" style="margin-top:6px;">@nullclear/plugin-eliza</h3>
          <p class="muted" style="font-size:13px;margin-top:4px;">Screens tokens mentioned in chat and hard-blocks rugs inside custom swap handlers.</p>
          <pre class="code-block" style="margin-top:12px;">import { nullclearPlugin, assertSafeElizaSwap } from "@nullclear/plugin-eliza";

const character = { name: "SafeTrader", plugins: [nullclearPlugin] };
// Or hard-block rugs inside swap code:
await assertSafeElizaSwap(mintAddress, { chain: "solana", strict: true });</pre>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
          <div>
            <div class="eyebrow">GUARDED JSON-RPC &middot; PREPAID PASSES</div>
            <h3 class="h3" style="margin-top:6px;">Drop-In Guarded JSON-RPC Safety Rail ($5 / $25 / $100 USDC)</h3>
            <p class="muted" style="font-size:13.5px;margin-top:4px;max-width:740px;">
              Swap a single <code>RPC_URL</code> environment variable. Read methods cost 0 credits with &lt;5ms KV auth; write broadcasts are simulated and blocked on drainers, honeypots, or reverts.
            </p>
          </div>
          <a href="/buy-pass" class="btn btn-secondary btn-sm">Mint Pass &rarr;</a>
        </div>
        <pre class="code-block" style="margin-top:14px;"># 1. Self-serve Prepaid Pass ($5 Starter = 2k credits, $25 Pro = 15k, $100 Scale = 100k)
POST https://api.nullclear.dev/v1/pass/buy

# 2. Replace your RPC URL once across any of 7 supported chains
BASE_RPC_URL="https://api.nullclear.dev/rpc/base/nc_live_..."</pre>
      </div>
    </section>

    <section class="section">
      <div class="eyebrow">COMPARISON</div>
      <h2 class="h2" style="margin-top:8px;margin-bottom:20px;">1-Call Pre-Sign Guard vs. Multi-Tool Stacks</h2>
      <div class="card-flat">
        <div class="table-wrap">
          <table class="dev-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th style="color:var(--text);">NullClear (/v1/guard)</th>
                <th>txlens / Foundry</th>
                <th>GoPlus MCP</th>
                <th>Tenderly MCP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Zero Setup / Zero API Key</td>
                <td style="color:var(--safe);font-weight:600;">Yes (1 URL / MCP)</td>
                <td class="muted">Local CLI / RPC</td>
                <td class="muted">API Key + Secret</td>
                <td class="muted">OAuth / Paid Tier</td>
              </tr>
              <tr>
                <td>Chains (EVM + Solana)</td>
                <td style="color:var(--safe);font-weight:600;">Base, ETH, Arb, OP, Poly, BSC + Solana</td>
                <td class="muted">EVM only</td>
                <td class="muted">EVM + Solana + Sui</td>
                <td class="muted">EVM only</td>
              </tr>
              <tr>
                <td>Nested Universal Router / Multicall + EIP-712</td>
                <td style="color:var(--safe);font-weight:600;">Yes (Recursive + Permit2/Seaport)</td>
                <td class="muted">Partial (no EIP-712)</td>
                <td class="muted">No</td>
                <td class="muted">Raw Trace</td>
              </tr>
              <tr>
                <td>Token-2022 + Solana Simulate + Tax Audit</td>
                <td style="color:var(--safe);font-weight:600;">Yes (1 Call)</td>
                <td class="muted">No</td>
                <td class="muted">Token Audit Only</td>
                <td class="muted">Sim Only</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section id="sandbox" class="section">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <div class="eyebrow">ZERO API KEY &middot; 10 FREE / DAY</div>
            <h2 class="h2" style="margin-top:6px;">Live Pre-Swap Sandbox</h2>
          </div>
          <span class="status-tag tag-safe">7 CHAINS LIVE</span>
        </div>
        <div class="preset-strip">
          <button type="button" class="btn btn-secondary btn-sm" onclick="runPreset('base','0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')">Base USDC</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="runPreset('arbitrum','0xaf88d065e77c8cc2239327c5edb3a432268e5831')">Arbitrum USDC</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="runPreset('solana','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')">Solana USDC</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="runCalldataTest()">Test Infinite Approve Drainer</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="runGuardEip712Test()">Test EIP-712 Permit Phishing</button>
        </div>
        <div class="sandbox-controls">
          <select id="fwChain" class="select" style="width:136px;">
            <option value="base">base</option>
            <option value="eth">eth</option>
            <option value="arbitrum">arbitrum</option>
            <option value="optimism">optimism</option>
            <option value="polygon">polygon</option>
            <option value="bsc">bsc</option>
            <option value="solana">solana</option>
          </select>
          <input id="fwAddr" class="input" style="flex:1;min-width:240px;" value="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" placeholder="0x... or Solana mint address" />
          <button type="button" class="btn btn-primary" onclick="runCustomScan()">Scan Token</button>
        </div>
        <pre id="fwOut" class="code-block" style="margin-top:14px;min-height:160px;max-height:360px;">// Select a preset or enter any 7-chain token address above.</pre>
      </div>
    </section>
  </main>

  ${renderDevFooter()}

  <script>
    async function runPreset(chain, addr) {
      document.getElementById('fwChain').value = chain;
      document.getElementById('fwAddr').value = addr;
      return runCustomScan();
    }
    async function runCustomScan() {
      const chain = document.getElementById('fwChain').value;
      const addr = document.getElementById('fwAddr').value.trim();
      const out = document.getElementById('fwOut');
      out.textContent = 'Scanning ' + chain + ':' + addr + '...';
      try {
        const res = await fetch('/v1/scan/' + encodeURIComponent(chain) + '/' + encodeURIComponent(addr));
        out.textContent = JSON.stringify(await res.json(), null, 2);
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    }
    async function runCalldataTest() {
      const out = document.getElementById('fwOut');
      out.textContent = 'Running 1-call /v1/guard on infinite approve() drainer...';
      try {
        const calldata = '0x095ea7b3000000000000000000000000b586efcca41df27ad3873beca54da0c30bf04d5cffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
        const res = await fetch('/v1/guard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain: 'base',
            from: '0xfd74fF802EA0E735514C070AF04E0D6528deD145',
            to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            data: calldata
          })
        });
        out.textContent = JSON.stringify(await res.json(), null, 2);
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    }
    async function runGuardEip712Test() {
      const out = document.getElementById('fwOut');
      out.textContent = 'Auditing EIP-712 gasless Permit phishing signature via /v1/guard...';
      try {
        const res = await fetch('/v1/guard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain: 'base',
            typedData: {
              primaryType: 'Permit',
              domain: { name: 'USD Coin', chainId: 8453, verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
              message: {
                owner: '0xfd74fF802EA0E735514C070AF04E0D6528deD145',
                spender: '0xdead00000000000000000000000000000000beef',
                value: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
                nonce: 0,
                deadline: 1893456000
              }
            }
          })
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

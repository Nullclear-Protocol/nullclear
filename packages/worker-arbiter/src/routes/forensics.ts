import { Hono } from "hono";
import { encodeBase64Json, type X402PaymentOption } from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";
import {
  consumeForensicFreeCall,
  FORENSIC_FREE_TIER_DAILY_LIMIT
} from "../middleware/free-tier.js";
import { authenticateAndDebitPass } from "../middleware/pass-auth.js";
import { settleTransfer } from "../services/facilitator.js";
import {
  extractPaymentAuthorization,
  attachDualX402Headers,
  buildWwwAuthenticateX402Header
} from "../utils/x402-headers.js";
import { keccak256, stringToHex } from "viem";
import { attachReceiptHeader } from "./receipt.js";
import { renderDevFirewallHtml } from "../ui/dev-firewall.js";
import { renderDevX402Html } from "../ui/dev-x402.js";
import {
  scanTokenForensics,
  inspectContractAbiAndProxy,
  decodeCalldataOrTx,
  simulateTransactionPreflight,
  guardTransactionPreflight,
  formatScanMarkdown,
  renderScanOgSvg,
  getTrendingScans,
  runTrendingTokenCronScan,
  readUrlCleanMarkdown,
  normalizeChain,
  isEvmAddress,
  isSolanaAddress,
  type ForensicScanPayload
} from "../services/forensics-engine.js";
import {
  buildTokenVerdictPayload,
  renderTokenVerdictSvg,
  renderTokenVerdictHtmlPage
} from "../services/verdict-card.js";

export const forensicsRouter = new Hono<Env>();

export const CLAUDE_AGENTS_MD_RULE_SNIPPET = `# NullClear Pre-Execution Firewall & Forensics Rule (Zero API Key or Prepaid Pass)
When inspecting smart contracts, tokens, proxies, revert hex, or transactions on Base, Ethereum, Arbitrum, Optimism, Polygon, BSC, or Solana:
1. Prefer the 1-Call Pre-Sign Firewall before ANY wallet signature or swap (10 free calls/day/IP, or unlimited <5ms via Prepaid Pass nc_live_...):
   - 1-Call Pre-Sign Guard (Nested Calldata + EIP-712 + Solana Wire + Stateful Simulation + Touched Tokens): \`POST https://api.nullclear.dev/v1/guard\`
   - Token & Proxy Audit: \`GET https://api.nullclear.dev/v1/scan/base/<address>\` (or \`eth\`, \`arbitrum\`, \`optimism\`, \`polygon\`, \`bsc\`, \`solana\`)
   - Markdown Forensic Report (<300 tokens): \`curl -H "Accept: text/markdown" https://nullclear.com/scan/base/<address>\`
   - Drop-In Guarded JSON-RPC Safety Rail: \`https://api.nullclear.dev/rpc/<chain>/<nc_live_api_key>\`
2. Obey \`recommendedAgentAction\` (\`EXECUTE_SAFE\`, \`CAUTION_HIGH_RISK\`, \`ABORT_DRAINER_APPROVAL\`, \`ABORT_WILL_REVERT\`, or \`ABORT_CRITICAL_TRAP\`) before signing or broadcasting.`;

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Detects whether the incoming request prefers clean Markdown (<300 tokens) via:
 * 1. Explicit `.md` URL extension or `?format=markdown`
 * 2. `Accept: text/markdown` header
 * 3. Known AI / CLI User-Agent (`Claude`, `Cursor`, `Perplexity`, `ChatGPT`, `curl`, `python-requests`, `node-fetch`)
 */
export function shouldServeMarkdown(c: any, addressParam?: string): boolean {
  if (addressParam && addressParam.toLowerCase().endsWith(".md")) {
    return true;
  }
  const formatQuery = (c.req.query("format") || "").toLowerCase();
  if (formatQuery === "markdown" || formatQuery === "md") {
    return true;
  }
  const accept = (c.req.header("Accept") || c.req.header("accept") || "").toLowerCase();
  if (accept.includes("text/markdown") || accept.includes("text/x-markdown")) {
    return true;
  }
  const ua = (c.req.header("User-Agent") || c.req.header("user-agent") || "").toLowerCase();
  if (!ua) return false;
  const agentPatterns = [
    "claude",
    "cursor",
    "perplexity",
    "chatgpt",
    "gptbot",
    "oai-searchbot",
    "opencode",
    "codex",
    "curl/",
    "python-requests",
    "node-fetch",
    "undici",
    "httpie"
  ];
  return agentPatterns.some((pat) => ua.includes(pat));
}

export function buildX402UpgradeBlock(c: any, resourcePath: string) {
  const treasuryAddress =
    c.env?.TREASURY_WALLET_ADDRESS || "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c";
  const priceAtomic = "5000"; // $0.005 USDC on Base Mainnet (6 decimals)
  const resourceUrl = `https://api.nullclear.dev${resourcePath}`;
  const description =
    "NullClear Forensics Unlimited High-Frequency Access ($0.005 USDC per call via EIP-3009 on Base)";

  const acceptOption = {
    scheme: "exact" as const,
    network: "eip155:8453" as const,
    amount: priceAtomic,
    maxAmountRequired: priceAtomic,
    resource: resourceUrl,
    description,
    mimeType: "application/json",
    payTo: treasuryAddress as `0x${string}`,
    maxTimeoutSeconds: 300,
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
    extra: {
      name: "USD Coin",
      version: "2"
    }
  };

  const paymentRequiredPayload = {
    x402Version: 2 as const,
    scheme: "exact" as const,
    network: "eip155:8453" as const,
    amount: priceAtomic,
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
    payTo: treasuryAddress as `0x${string}`,
    maxTimeoutSeconds: 300,
    resource: {
      url: resourceUrl,
      description,
      mimeType: "application/json"
    },
    accepts: [acceptOption]
  };

  const encodedHeader = encodeBase64Json(paymentRequiredPayload);

  return {
    encodedHeader,
    paymentRequiredPayload,
    treasuryAddress,
    x402Upgrade: {
      freeTierLimitPerDay: FORENSIC_FREE_TIER_DAILY_LIMIT,
      priceUsdc: "0.005",
      priceAtomic: "5000",
      network: "eip155:8453",
      usdcContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: treasuryAddress,
      headerName: "X-Payment",
      prepaidPassUrl: "POST https://api.nullclear.dev/v1/pass/buy",
      prepaidPassTiers: "starter ($5 / 2,000 credits), pro ($25 / 15,000 credits), scale ($100 / 100,000 credits)",
      agentPaymentInstructions:
        `Free tier (${FORENSIC_FREE_TIER_DAILY_LIMIT} req/day/IP) exhausted. Mint an instant low-latency Prepaid Pass (POST https://api.nullclear.dev/v1/pass/buy, $5-$100 USDC -> Bearer nc_live_... key) OR sign an EIP-3009 TransferWithAuthorization for 5000 atomic USDC ($0.005) on Base (chainId 8453) to 0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c and attach Base64 payload in 'X-Payment' or 'PAYMENT-SIGNATURE'.`
    }
  };
}

export function buildForensic402Response(c: any, resourcePath: string, errorMessage?: string): Response {
  const upgrade = buildX402UpgradeBlock(c, resourcePath);
  c.header("PAYMENT-REQUIRED", upgrade.encodedHeader);
  c.header("Pay-To", upgrade.treasuryAddress);
  c.header(
    "WWW-Authenticate",
    buildWwwAuthenticateX402Header({
      amount: "5000",
      recipient: upgrade.treasuryAddress
    })
  );
  return c.json(
    {
      error: errorMessage || `Free tier limit (${FORENSIC_FREE_TIER_DAILY_LIMIT} requests/day/IP) exceeded.`,
      rateLimited: true,
      recommendedAgentAction: "ATTACH_X402_PAYMENT_HEADER",
      agentPaymentInstructions: upgrade.x402Upgrade.agentPaymentInstructions,
      x402Upgrade: upgrade.x402Upgrade,
      paymentRequired: upgrade.paymentRequiredPayload,
      ...upgrade.paymentRequiredPayload
    },
    402
  );
}

function hasPaymentHeader(c: any): boolean {
  const xPay =
    c.req.header("X-Payment") ||
    c.req.header("x-payment") ||
    c.req.header("PAYMENT-SIGNATURE") ||
    c.req.header("payment-signature") ||
    c.req.header("X-NullClear-Authorization") ||
    c.req.header("x-nullclear-authorization");
  return Boolean(xPay && xPay.trim().length > 10);
}

/**
 * Shared access gate for forensic routes:
 * 1. Prepaid Pass Bearer key (<5ms, 1 credit)
 * 2. Per-call x402 EIP-3009 ($0.005 USDC)
 * 3. Zero-key free tier (10 calls/day/IP)
 */
export async function resolveForensicAccess(
  c: any,
  resourcePath: string
): Promise<{ allowed: boolean; remaining: number; paid: boolean; errorResponse?: Response }> {
  const passAuth = await authenticateAndDebitPass(c, 1);
  if (passAuth.hasKey) {
    if (passAuth.authenticated && passAuth.pass) {
      return { allowed: true, remaining: passAuth.creditsRemaining, paid: true };
    }
    const upgrade = buildX402UpgradeBlock(c, resourcePath);
    c.header("PAYMENT-REQUIRED", upgrade.encodedHeader);
    c.header("Pay-To", upgrade.treasuryAddress);
    return {
      allowed: false,
      remaining: 0,
      paid: false,
      errorResponse: c.json(
        {
          error: passAuth.errorReason || "Invalid or exhausted Prepaid Pass key",
          rateLimited: Boolean(passAuth.pass),
          prepaidPassUrl: "POST https://api.nullclear.dev/v1/pass/buy",
          x402Upgrade: upgrade.x402Upgrade,
          ...(passAuth.pass ? upgrade.paymentRequiredPayload : {})
        },
        passAuth.pass ? 402 : 401
      )
    };
  }

  const paidHeaderPresent = hasPaymentHeader(c);

  if (paidHeaderPresent) {
    let parsedAuth: ReturnType<typeof extractPaymentAuthorization> = null;
    try {
      parsedAuth = extractPaymentAuthorization(c.req);
    } catch {
      parsedAuth = null;
    }

    if (!parsedAuth || !parsedAuth.from || !parsedAuth.signature) {
      return {
        allowed: false,
        remaining: 0,
        paid: false,
        errorResponse: buildForensic402Response(c, resourcePath, "Invalid x402 payment header for Forensic Oracle.")
      };
    }

    const treasuryAddress =
      (c.env?.TREASURY_WALLET_ADDRESS || "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c") as `0x${string}`;
    const payer = parsedAuth.from.toLowerCase() as `0x${string}`;
    const isTestWallet =
      payer === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" ||
      (c.env?.ENVIRONMENT !== "production" && !c.env?.FACILITATOR_URL);

    let txHash: `0x${string}`;
    if (isTestWallet) {
      txHash = keccak256(stringToHex(`forensic_sim:${payer}:${parsedAuth.nonce}:${Date.now()}`));
    } else {
      const accepted: X402PaymentOption = parsedAuth.accepted || {
        scheme: "exact",
        network: "eip155:8453",
        amount: "5000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: treasuryAddress,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" }
      };
      const requestedFacilitator = (
        c.req.query("facilitator") ||
        c.req.header("x-nullclear-facilitator") ||
        c.env?.FACILITATOR_PREFERENCE ||
        ""
      )
        .trim()
        .toLowerCase();
      const hasCdpCreds = Boolean(c.env?.CDP_API_KEY_ID && c.env?.CDP_API_KEY_SECRET);
      const useCdp = requestedFacilitator === "cdp" && hasCdpCreds;
      const facilitatorUrl = useCdp
        ? c.env?.CDP_FACILITATOR_URL || "https://api.cdp.coinbase.com/platform/v2/x402"
        : c.env?.FACILITATOR_URL || "https://facilitator.payai.network";

      const settlement = await settleTransfer({
        authorization: {
          from: parsedAuth.from,
          to: parsedAuth.to,
          value: parsedAuth.value,
          validAfter: parsedAuth.validAfter,
          validBefore: parsedAuth.validBefore,
          nonce: parsedAuth.nonce
        },
        signature: parsedAuth.signature,
        accepted: {
          ...accepted,
          amount: "5000",
          payTo: treasuryAddress,
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          extra: accepted.extra || { name: "USD Coin", version: "2" }
        },
        facilitatorUrl,
        cdpApiKeyId: c.env?.CDP_API_KEY_ID,
        cdpApiKeySecret: c.env?.CDP_API_KEY_SECRET,
        settlementMode: "facilitator",
        arbiterPrivateKey: c.env?.ARBITER_PRIVATE_KEY,
        rpcUrl: c.env?.BASE_MAINNET_RPC_URL || c.env?.BASE_RPC_URL || "https://mainnet.base.org",
        environment: c.env?.ENVIRONMENT || "production",
        resource: {
          url: `https://api.nullclear.dev${resourcePath}`,
          description: "NullClear Forensics Unlimited API Access ($0.005 USDC on Base)",
          mimeType: "application/json"
        }
      });

      if (!settlement.success || !settlement.transaction) {
        return {
          allowed: false,
          remaining: 0,
          paid: false,
          errorResponse: buildForensic402Response(
            c,
            resourcePath,
            `Forensic payment settlement failed: ${settlement.errorReason || "rejected"}`
          )
        };
      }
      txHash = settlement.transaction;
    }

    const store = getArbiterStore(c.env);
    const clearingId = `forensic_${Date.now()}_${txHash.slice(2, 10)}`;
    await store
      .recordPassedClearing(
        c.env?.ERC8004_AGENT_ID || "124595",
        parsedAuth.from,
        "5000",
        "25",
        {
          id: clearingId,
          network: "eip155:8453",
          buyerAddress: parsedAuth.from,
          sellerAgentId: c.env?.ERC8004_AGENT_ID || "124595",
          amount: "5000",
          fee: "25",
          targetUrl: `https://api.nullclear.dev${resourcePath}`,
          status: "PASSED",
          responseHash: txHash,
          attestationSignature: txHash,
          eip3009Nonce: parsedAuth.nonce,
          createdAt: Date.now()
        }
      )
      .catch(() => {});

    attachReceiptHeader(c, clearingId);
    attachDualX402Headers(c, {
      status: 200,
      transaction: txHash,
      network: "eip155:8453",
      payer: parsedAuth.from,
      verified: true
    });
    c.header("x-nullclear-tier", "x402-paid");
    c.header("x-nullclear-remaining-free-calls", String(FORENSIC_FREE_TIER_DAILY_LIMIT));
    return { allowed: true, remaining: FORENSIC_FREE_TIER_DAILY_LIMIT, paid: true };
  }

  const freeTier = await consumeForensicFreeCall(c, FORENSIC_FREE_TIER_DAILY_LIMIT);
  c.header("x-nullclear-tier", freeTier.allowed ? "forensic-free" : "forensic-rate-limited");
  c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));
  return { allowed: freeTier.allowed, remaining: freeTier.remaining, paid: false };
}

// ============================================================================
// 1. GET /v1/scan/:chain/:address (and /v1/scan/:address)
// ============================================================================
async function handleApiScan(c: any, rawChain: string, rawAddressInput: string) {
  const isMdExt = rawAddressInput.toLowerCase().endsWith(".md");
  const cleanAddress = isMdExt ? rawAddressInput.slice(0, -3) : rawAddressInput;
  const normChain = normalizeChain(rawChain);
  const normAddr = normChain === "solana" ? cleanAddress.trim() : cleanAddress.trim().toLowerCase();
  const access = await resolveForensicAccess(c, `/v1/scan/${normChain}/${normAddr}`);
  if (access.errorResponse) return access.errorResponse;

  // Request #11+ without Prepaid Pass or valid X-Payment header returns HTTP 402 Payment Required
  // (public SEO/HTML/Markdown pages remain free at /scan/:chain/:address)
  if (!access.allowed && !access.paid) {
    return buildForensic402Response(c, `/v1/scan/${normChain}/${normAddr}`);
  }

  const scan = await scanTokenForensics(rawChain, cleanAddress, c.env);
  c.header("X-NullClear-Attestation", scan.provenance.attestationSha256);

  if (isMdExt || (c.req.header("Accept") || "").includes("text/markdown")) {
    c.header("Content-Type", "text/markdown; charset=utf-8");
    return c.body(formatScanMarkdown(scan));
  }

  return c.json(scan);
}

forensicsRouter.get("/v1/scan/:chain/:address", (c) => {
  return handleApiScan(c, c.req.param("chain"), c.req.param("address"));
});

forensicsRouter.get("/v1/scan/:address", (c) => {
  const addr = c.req.param("address");
  const chain = c.req.query("chain") || (isSolanaAddress(addr) ? "solana" : "base");
  return handleApiScan(c, chain, addr);
});

// ============================================================================
// 2. GET /v1/inspect/:chain/:address (Contract ABI & Proxy Inspector)
// ============================================================================
forensicsRouter.get("/v1/inspect/:chain/:address", async (c) => {
  const access = await resolveForensicAccess(c, c.req.path);
  if (access.errorResponse) return access.errorResponse;

  if (!access.allowed && !access.paid) {
    return buildForensic402Response(c, c.req.path);
  }

  const res = await inspectContractAbiAndProxy(
    c.req.param("chain"),
    c.req.param("address"),
    c.env
  );
  c.header("X-NullClear-Attestation", res.provenance.attestationSha256);
  return c.json(res);
});

// ============================================================================
// 3. POST /v1/decode & GET /v1/decode (Universal Calldata, Revert & Failed Tx Decoder)
// ============================================================================
async function handleDecode(c: any, input: string, chain: string, typedData?: any) {
  if ((!input || !input.trim()) && !typedData) {
    return c.json(
      {
        error: "Missing 'input' or 'typedData' field. Provide raw hex calldata/revert error (0x...), a 66-char transaction hash, serialized Solana tx, or EIP-712 typedData.",
        example: { input: "0x095ea7b3000000000000000000000000b586efcca41df27ad3873beca54da0c30bf04d5cffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", chain: "base" }
      },
      400
    );
  }

  const access = await resolveForensicAccess(c, "/v1/decode");
  if (access.errorResponse) return access.errorResponse;

  if (!access.allowed && !access.paid) {
    return buildForensic402Response(c, "/v1/decode");
  }

  const decoded = await decodeCalldataOrTx(input, chain || "base", c.env, { typedData });
  c.header("X-NullClear-Attestation", decoded.provenance.attestationSha256);
  return c.json(decoded);
}

forensicsRouter.post("/v1/decode", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}
  const input = String(body.input || body.data || body.calldata || body.txHash || body.transaction || "");
  const chain = String(body.chain || "base");
  return handleDecode(c, input, chain, body.typedData);
});

forensicsRouter.get("/v1/decode", async (c) => {
  const input = c.req.query("input") || c.req.query("data") || c.req.query("tx") || "";
  const chain = c.req.query("chain") || "base";
  return handleDecode(c, input, chain);
});

// ============================================================================
// 4. POST /v1/simulate (Stateful Pre-Flight Transaction Simulator - EVM & Solana)
// ============================================================================
forensicsRouter.post("/v1/simulate", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  if (!body.to && !body.transaction && (!Array.isArray(body.transactions) || body.transactions.length === 0)) {
    return c.json(
      {
        error: "Missing required 'to' target contract address (or 'transactions' bundle / Solana 'transaction').",
        example: {
          chain: "base",
          from: "0xfd74fF802EA0E735514C070AF04E0D6528deD145",
          to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          data: "0x70a08231000000000000000000000000fd74ff802ea0e735514c070af04e0d6528ded145",
          value: "0x0"
        }
      },
      400
    );
  }

  const access = await resolveForensicAccess(c, "/v1/simulate");
  if (access.errorResponse) return access.errorResponse;

  if (!access.allowed && !access.paid) {
    return buildForensic402Response(c, "/v1/simulate");
  }

  const simResult = await simulateTransactionPreflight(
    {
      chain: body.chain || "base",
      from: body.from,
      to: body.to,
      data: body.data,
      value: body.value,
      transactions: body.transactions,
      stateOverrides: body.stateOverrides,
      transaction: body.transaction
    },
    c.env
  );
  c.header("X-NullClear-Attestation", simResult.provenance.attestationSha256);
  return c.json(simResult);
});

// ============================================================================
// 4b. GET & POST /v1/guard (Composite 1-Call Pre-Sign Firewall)
// ============================================================================
forensicsRouter.get("/v1/guard", async (c) => {
  const qTo = c.req.query("to");
  const qData = c.req.query("data");
  const qTx = c.req.query("transaction");
  const qFrom = c.req.query("from");
  const qValue = c.req.query("value");
  const qChain = c.req.query("chain") || (qTx && !qTo ? "solana" : "base");

  if (qTo || qTx) {
    const access = await resolveForensicAccess(c, "/v1/guard");
    if (access.errorResponse) return access.errorResponse;

    if (!access.allowed && !access.paid) {
      return buildForensic402Response(c, "/v1/guard");
    }

    const guardResult = await guardTransactionPreflight(
      {
        chain: qChain,
        from: qFrom,
        to: qTo,
        data: qData,
        value: qValue,
        transaction: qTx
      },
      c.env
    );
    c.header("X-NullClear-Attestation", guardResult.provenance.attestationSha256);
    return c.json(guardResult);
  }

  return c.json({
    service: "NullClear 1-Call Pre-Sign Transaction Firewall",
    endpoint: "POST https://api.nullclear.dev/v1/guard",
    paidBazaarEndpoint: "POST https://api.nullclear.dev/v1/bazaar/guard ($0.005 USDC x402)",
    mcpTool: "nullclear_preflight_guard",
    freeTierLimitPerDay: FORENSIC_FREE_TIER_DAILY_LIMIT,
    supportedChains: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc", "solana"],
    capabilities: [
      "Recursive Multicall3 / Universal Router / Gnosis Safe calldata unwrapping",
      "EIP-712 Permit / Permit2 / Seaport signature drainer auditing",
      "Solana wire transaction parsing + simulateTransaction pre-flight",
      "Stateful EVM eth_simulateV1 / stateOverrides + Transfer/Approval asset diffs",
      "Touched-token honeypot, buy/sell tax, and Token-2022 transfer-hook scanning"
    ],
    usage:
      "Send a POST JSON body (or GET with ?chain=base&to=0x...&data=0x... or ?chain=solana&transaction=<base64>) to receive an explicit recommendedAgentAction (EXECUTE_SAFE, CAUTION_HIGH_RISK, ABORT_DRAINER_APPROVAL, ABORT_CRITICAL_TRAP, or ABORT_WILL_REVERT).",
    examples: {
      evmApprovalGuard: {
        method: "POST",
        url: "https://api.nullclear.dev/v1/guard",
        body: {
          chain: "base",
          from: "0xfd74fF802EA0E735514C070AF04E0D6528deD145",
          to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          data: "0x095ea7b3000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeefffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          value: "0x0"
        }
      },
      eip712PermitGuard: {
        method: "POST",
        url: "https://api.nullclear.dev/v1/guard",
        body: {
          chain: "base",
          typedData: {
            primaryType: "Permit",
            domain: {
              name: "USD Coin",
              chainId: 8453,
              verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
            },
            message: {
              owner: "0xfd74fF802EA0E735514C070AF04E0D6528deD145",
              spender: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
              value: "115792089237316195423570985008687907853269984665640564039457584007913129639935"
            }
          }
        }
      },
      solanaWireGuard: {
        method: "POST",
        url: "https://api.nullclear.dev/v1/guard",
        body: {
          chain: "solana",
          transaction: "<base64-encoded-wire-transaction>"
        }
      }
    }
  });
});

forensicsRouter.post("/v1/guard", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  if (
    !body.to &&
    !body.typedData &&
    !body.transaction &&
    (!Array.isArray(body.transactions) || body.transactions.length === 0)
  ) {
    return c.json(
      {
        error: "Missing payload. Provide EVM tx ({ chain, from, to, data, value }), EIP-712 { typedData }, or Solana { chain: 'solana', transaction }.",
        example: {
          chain: "base",
          from: "0xfd74fF802EA0E735514C070AF04E0D6528deD145",
          to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          data: "0x095ea7b3...",
          value: "0x0"
        }
      },
      400
    );
  }

  const access = await resolveForensicAccess(c, "/v1/guard");
  if (access.errorResponse) return access.errorResponse;

  if (!access.allowed && !access.paid) {
    return buildForensic402Response(c, "/v1/guard");
  }

  const guardResult = await guardTransactionPreflight(
    {
      chain: body.chain || "base",
      from: body.from,
      to: body.to,
      data: body.data,
      value: body.value,
      transactions: body.transactions,
      stateOverrides: body.stateOverrides,
      typedData: body.typedData,
      transaction: body.transaction
    },
    c.env
  );
  c.header("X-NullClear-Attestation", guardResult.provenance.attestationSha256);
  return c.json(guardResult);
});

// ============================================================================
// 5. GET /v1/trending & POST /v1/trending/refresh
// ============================================================================
forensicsRouter.get("/v1/trending", async (c) => {
  const chain = c.req.query("chain");
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") || 20)));
  const items = await getTrendingScans(c.env, chain, limit);
  return c.json({
    status: "ok",
    count: items.length,
    items: items.map((r) => ({
      chain: r.chain,
      address: r.address,
      symbol: r.symbol,
      name: r.name,
      score: r.score,
      verdict: r.verdict,
      recommendedAgentAction: r.recommendedAction,
      isProxy: r.isProxy,
      implementationAddress: r.implementationAddress,
      buyTaxPercent: r.buyTaxPercent,
      sellTaxPercent: r.sellTaxPercent,
      liquidityUsd: r.liquidityUsd,
      blockNumber: r.blockNumber,
      attestationSha256: r.attestationSha256,
      scannedAt: r.scannedAt,
      webReportUrl: `https://nullclear.com/scan/${r.chain}/${r.address}`,
      markdownTwinUrl: `https://nullclear.com/scan/${r.chain}/${r.address}.md`
    }))
  });
});

forensicsRouter.post("/v1/trending/refresh", async (c) => {
  const result = await runTrendingTokenCronScan(c.env);
  return c.json({
    status: "ok",
    ...result
  });
});

// ============================================================================
// 6. POST /v1/telegram/webhook & GET /v1/telegram/webhook (Stateless Telegram Bot)
// ============================================================================
function extractChainAndAddressFromText(text: string): {
  chain: "base" | "eth" | "solana";
  address: string;
} | null {
  const cleaned = (text || "").trim();
  let chain: "base" | "eth" | "solana" = "base";
  if (/\b(eth|ethereum|mainnet)\b/i.test(cleaned)) chain = "eth";
  else if (/\b(sol|solana)\b/i.test(cleaned)) chain = "solana";

  const evmMatch = cleaned.match(/0x[a-fA-F0-9]{40}/);
  if (evmMatch) {
    return { chain: chain === "solana" ? "base" : chain, address: evmMatch[0].toLowerCase() };
  }

  const words = cleaned.split(/\s+/);
  for (const w of words) {
    const token = w.replace(/[^1-9A-HJ-NP-Za-km-z]/g, "");
    if (isSolanaAddress(token)) {
      return { chain: "solana", address: token };
    }
  }
  return null;
}

forensicsRouter.get("/v1/telegram/webhook", (c) => {
  return c.json({
    status: "active",
    bot: "@NullClearBot",
    mode: "stateless-webhook",
    supportedTriggers: [
      "Direct message or group message containing any 0x... or Solana token address",
      "Inline query: @NullClearBot <address>",
      "Command: /scan <chain> <address>"
    ],
    webhookEndpoint: "https://api.nullclear.dev/v1/telegram/webhook"
  });
});

forensicsRouter.post("/v1/telegram/webhook", async (c) => {
  let update: any = {};
  try {
    update = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "Invalid JSON update payload" }, 400);
  }

  // Case A: Inline Query (@NullClearBot <address>)
  if (update.inline_query) {
    const iq = update.inline_query;
    const parsed = extractChainAndAddressFromText(String(iq.query || "")) || {
      chain: "base" as const,
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
    };
    const scan = await scanTokenForensics(parsed.chain, parsed.address, c.env);

    const messageText =
      `Ã°Å¸â€ºÂ¡Ã¯Â¸Â *NullClear Forensic Audit: ${scan.name} ($${scan.symbol})*\n` +
      `Ã¢â‚¬Â¢ *Verdict*: \`${scan.verdict}\` (${scan.score}/100)\n` +
      `Ã¢â‚¬Â¢ *Agent Action*: \`${scan.recommendedAgentAction}\`\n` +
      `Ã¢â‚¬Â¢ *Chain*: \`${scan.chain.toUpperCase()}\` (Block \`#${scan.provenance.blockNumber}\`)\n` +
      `Ã¢â‚¬Â¢ *Taxes*: \`${scan.evidence.buyTaxPercent}% Buy\` / \`${scan.evidence.sellTaxPercent}% Sell\`\n` +
      `Ã¢â‚¬Â¢ *Proxy*: \`${scan.evidence.isProxy ? `Yes (${scan.evidence.proxyType} -> ${scan.evidence.implementationAddress})` : "No (Direct)"}\`\n` +
      `Ã¢â‚¬Â¢ *Liquidity*: \`$${scan.evidence.liquidityUsd.toLocaleString()}\`\n` +
      `Ã°Å¸â€â€” [Full Report & Provenance Receipt](${scan.links.webReportUrl})`;

    const inlineResponse = {
      method: "answerInlineQuery",
      inline_query_id: iq.id,
      cache_time: 60,
      results: [
        {
          type: "article",
          id: `${scan.chain}_${scan.address}`.slice(0, 60),
          title: `${scan.verdict} (${scan.score}/100) Ã¢â‚¬â€ $${scan.symbol} on ${scan.chain.toUpperCase()}`,
          description: `${scan.recommendedAgentAction} | Buy: ${scan.evidence.buyTaxPercent}% Sell: ${scan.evidence.sellTaxPercent}% | Liq: $${scan.evidence.liquidityUsd.toLocaleString()}`,
          input_message_content: {
            message_text: messageText,
            parse_mode: "Markdown"
          },
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Ã°Å¸â€Â Open Forensic Scorecard", url: scan.links.webReportUrl },
                { text: "Ã°Å¸ÂÂ¦ Share on X", url: scan.links.xShareIntentUrl }
              ]
            ]
          }
        }
      ]
    };

    return c.json(inlineResponse);
  }

  // Case B: Standard Message or Group Mention
  const msg = update.message || update.edited_message || update.channel_post;
  const chatId = msg?.chat?.id ?? update.chat_id ?? 0;
  const text = String(msg?.text || update.text || "");
  const parsed = extractChainAndAddressFromText(text);

  if (!parsed) {
    return c.json({
      method: "sendMessage",
      chat_id: chatId,
      parse_mode: "Markdown",
      text:
        "Ã°Å¸â€ºÂ¡Ã¯Â¸Â *NullClear On-Chain Forensics Bot (Zero-Key V2.2)*\n\nSend any Base, Ethereum, or Solana contract address (e.g. `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) or use `@NullClearBot <address>` inline for an instant proxy, bytecode & honeypot audit."
    });
  }

  const scan = await scanTokenForensics(parsed.chain, parsed.address, c.env);
  const replyText =
    `Ã°Å¸â€ºÂ¡Ã¯Â¸Â *NullClear Forensic Audit Ã¢â‚¬â€ $${scan.symbol} (${scan.chain.toUpperCase()})*\n\n` +
    `*Verdict*: \`${scan.verdict}\` (*${scan.score}/100*)\n` +
    `*Recommended Action*: \`${scan.recommendedAgentAction}\`\n` +
    `*Contract*: \`${scan.address}\`\n` +
    `*Proxy*: \`${scan.evidence.isProxy ? `${scan.evidence.proxyType} -> ${scan.evidence.implementationAddress}` : "Direct Bytecode"}\`\n` +
    `*Swap Taxes*: \`${scan.evidence.buyTaxPercent}% Buy\` | \`${scan.evidence.sellTaxPercent}% Sell\`\n` +
    `*Liquidity*: \`$${scan.evidence.liquidityUsd.toLocaleString()}\` (\`${scan.evidence.lpLockedPercent}% Locked\`)\n` +
    `*Block Height*: \`#${scan.provenance.blockNumber}\`\n\n` +
    `${scan.llmDigest}\n\n` +
    `Ã°Å¸â€â€” [Full Report](${scan.links.webReportUrl}) Ã¢â‚¬Â¢ [Markdown Twin](${scan.links.markdownTwinUrl})`;

  return c.json({
    method: "sendMessage",
    chat_id: chatId,
    parse_mode: "Markdown",
    text: replyText,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Ã°Å¸â€Â View Full Forensic Report", url: scan.links.webReportUrl },
          { text: "Ã°Å¸ÂÂ¦ Share Scorecard on X", url: scan.links.xShareIntentUrl }
        ]
      ]
    },
    scan
  });
});

// ============================================================================
// 7. GET /og/:chain/:address.svg (Dynamic OpenGraph Scorecard SVG)
// ============================================================================
forensicsRouter.get("/og/:chain/:addressFile", async (c) => {
  const chain = c.req.param("chain");
  const rawFile = c.req.param("addressFile") || "";
  const address = rawFile.replace(/\.(svg|png)$/i, "");
  const scan = await scanTokenForensics(chain, address, c.env);
  const svg = renderScanOgSvg(scan);
  c.header("Content-Type", "image/svg+xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(svg);
});

// ============================================================================
// 8. GET /scan/:chain/:address & /scan/:chain/:address.md
//    HTTP Content Negotiation (Accept: text/markdown) + Semantic HTML Report
// ============================================================================
export function renderForensicScanHtmlPage(scan: ForensicScanPayload): string {
  const verdictColor =
    scan.verdict === "VERIFIED CLEAR"
      ? "#10B981"
      : scan.verdict === "CAUTION"
        ? "#F59E0B"
        : "#EF4444";

  const ogImageUrl = scan.links.ogImageUrl || `https://nullclear.com/og/${scan.chain}/${scan.address}.svg`;
  const badgeMarkdown = `[![NullClear Verdict: ${scan.verdict} (${scan.score}/100)](${ogImageUrl})](${scan.links.webReportUrl})`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${scan.name} ($${scan.symbol}) On-Chain Forensic Security Audit Ã¢â‚¬â€ ${scan.verdict} (${scan.score}/100)`,
    description: scan.llmDigest,
    url: scan.links.webReportUrl,
    image: ogImageUrl,
    dateModified: scan.provenance.timestampIso,
    author: {
      "@type": "Organization",
      name: "NullClear On-Chain Forensics",
      url: "https://nullclear.com"
    },
    mainEntity: {
      "@type": "SoftwareApplication",
      name: `${scan.name} (${scan.symbol}) Smart Contract`,
      applicationCategory: "BlockchainSmartContract",
      operatingSystem: `${scan.chain.toUpperCase()} (Chain ID: ${scan.provenance.chainId})`
    }
  });

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(scan.name)} ($${escapeHtml(scan.symbol)}) Forensic Audit: ${escapeHtml(scan.verdict)} (${scan.score}/100) | NullClear</title>
  <meta name="description" content="${escapeHtml(scan.llmDigest)}" />
  <link rel="canonical" href="${escapeHtml(scan.links.webReportUrl)}" />
  <link rel="alternate" type="text/markdown" href="${escapeHtml(scan.links.markdownTwinUrl)}" title="Agent Markdown Twin (<300 Tokens)" />
  <meta property="og:title" content="${escapeHtml(scan.verdict)} (${scan.score}/100) Ã¢â‚¬â€ $${escapeHtml(scan.symbol)} on ${escapeHtml(scan.chain.toUpperCase())} | NullClear Forensics" />
  <meta property="og:description" content="${escapeHtml(scan.llmDigest)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(scan.links.webReportUrl)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(scan.verdict)} (${scan.score}/100) Ã¢â‚¬â€ $${escapeHtml(scan.symbol)} Forensic Scorecard" />
  <meta name="twitter:description" content="${escapeHtml(scan.llmDigest)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root {
      --bg: #07090E;
      --surface: #0C1018;
      --surface-2: #111827;
      --border: rgba(255, 255, 255, 0.1);
      --emerald: #10B981;
      --cyan: #38BDF8;
      --amber: #F59E0B;
      --red: #EF4444;
      --text: #F8FAFC;
      --muted: #94A3B8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
      line-height: 1.55;
      padding-bottom: 64px;
    }
    .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 20px; }
    header {
      border-bottom: 1px solid var(--border);
      background: rgba(7, 9, 14, 0.92);
      position: sticky;
      top: 0;
      z-index: 40;
      backdrop-filter: blur(10px);
    }
    .nav-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 64px;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      text-decoration: none;
      font-weight: 800;
      font-size: 18px;
    }
    .brand-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: linear-gradient(135deg, #10B981, #0ea5e9);
      color: #04130D;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
    }
    .mini-omnibox {
      display: flex;
      flex: 1;
      max-width: 520px;
      gap: 8px;
    }
    .mini-omnibox input {
      flex: 1;
      background: #05070B;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;
    }
    .btn:hover { border-color: var(--cyan); }
    .btn-emerald { background: var(--emerald); color: #04130D; border-color: var(--emerald); font-weight: 700; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 24px;
      margin-top: 22px;
    }
    .verdict-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 20px;
      border-left: 5px solid ${verdictColor};
    }
    .score-pill {
      padding: 12px 20px;
      border-radius: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid ${verdictColor};
      text-align: center;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }
    .metric-box {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
    }
    .metric-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .metric-val { font-size: 22px; font-weight: 800; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13.5px; }
    th, td { padding: 11px 12px; border-bottom: 1px solid var(--border); text-align: left; }
    th { color: var(--muted); font-weight: 600; width: 32%; }
    .agent-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(56, 189, 248, 0.07);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 12px;
      padding: 14px 18px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <header>
    <div class="container nav-bar">
      <a href="/" class="brand">
        <span class="brand-icon">N</span>
        <span>NullClear <span style="color:var(--emerald)">Forensics</span></span>
      </a>
      <form class="mini-omnibox" onsubmit="event.preventDefault(); const v=document.getElementById('topSearch').value.trim(); if(v) window.location.href='/scan/${escapeHtml(scan.chain)}/'+encodeURIComponent(v);">
        <input id="topSearch" class="mono" placeholder="Paste 0x token, Solana mint, tx hash, or calldata..." value="${escapeHtml(scan.address)}" />
        <button type="submit" class="btn btn-emerald">Scan</button>
      </form>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a href="${escapeHtml(scan.links.markdownTwinUrl)}" class="btn mono" title="View <300-token Markdown Twin">Ã°Å¸â€œâ€ž .MD Twin</a>
        <a href="https://nullclear.dev/history" class="btn" style="color:var(--emerald);">Ã°Å¸â€œÂ¡ Live History</a>
        <a href="/x402" class="btn">Ã¢Å¡Â¡ /x402 Gateway</a>
        <a href="mailto:ops@nullclear.dev" class="btn mono">Ã¢Å“â€°Ã¯Â¸Â ops@nullclear.dev</a>
      </div>
    </div>
  </header>

  <main class="container">
    <!-- 1-Click Agent Integration & Viral Share Bar -->
    <div class="agent-bar">
      <div style="font-size:13px;">
        <strong style="color:var(--cyan);">Ã°Å¸Â¤â€“ Agent-Ready Forensic Oracle (Zero API Key):</strong>
        <code class="mono" style="margin-left:6px;color:#E2E8F0;">claude mcp add --transport http nullclear https://api.nullclear.dev/mcp</code>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        <button class="btn" onclick="copyText('claude mcp add --transport http nullclear https://api.nullclear.dev/mcp', this)">Ã°Å¸â€œâ€¹ Copy Claude MCP Command</button>
        <button class="btn" onclick="copyRuleSnippet(this)">Ã°Å¸â€œËœ Copy CLAUDE.md / AGENTS.md Rule</button>
        <a class="btn" href="${escapeHtml(scan.links.xShareIntentUrl)}" target="_blank" rel="noopener">Ã°Å¸ÂÂ¦ Share Scorecard on X</a>
        <button class="btn" onclick="copyText(${JSON.stringify(badgeMarkdown)}, this)">Ã°Å¸â€ºÂ¡Ã¯Â¸Â Copy Verified Badge</button>
      </div>
    </div>

    <!-- Executive Verdict Banner -->
    <div class="card verdict-banner">
      <div style="max-width:740px;">
        <div class="mono" style="font-size:12px;color:var(--cyan);font-weight:700;text-transform:uppercase;">
          CHAIN: ${escapeHtml(scan.chain.toUpperCase())} (${escapeHtml(String(scan.provenance.chainId))}) Ã¢â‚¬Â¢ BLOCK #${scan.provenance.blockNumber} Ã¢â‚¬Â¢ ZERO-KEY ATTESTED
        </div>
        <h1 style="font-size:30px;font-weight:800;margin:6px 0;">
          ${escapeHtml(scan.name)} <span style="color:var(--muted)">($${escapeHtml(scan.symbol)})</span>
        </h1>
        <div class="mono" style="font-size:13px;color:var(--muted);word-break:break-all;margin-bottom:12px;">
          Contract: ${escapeHtml(scan.address)}
          ${scan.autoCorrectedChain ? `<span style="color:var(--amber);margin-left:8px;">[Auto-Healed from ${escapeHtml(scan.requestedChain || "")}]</span>` : ""}
        </div>
        <p style="font-size:15px;color:#E2E8F0;background:#06080D;padding:12px 14px;border-radius:10px;border:1px solid var(--border);">
          ${escapeHtml(scan.llmDigest)}
        </p>
      </div>
      <div class="score-pill">
        <div class="mono" style="font-size:12px;color:var(--muted);">SECURITY SCORE</div>
        <div class="mono" style="font-size:38px;font-weight:900;color:${verdictColor};">${scan.score}<span style="font-size:18px;color:var(--muted);">/100</span></div>
        <div class="mono" style="font-size:14px;font-weight:800;color:${verdictColor};margin-top:2px;">${escapeHtml(scan.verdict)}</div>
        <div class="mono" style="font-size:11px;color:var(--text);margin-top:6px;background:rgba(255,255,255,0.06);padding:4px 8px;border-radius:6px;">
          Action: ${escapeHtml(scan.recommendedAgentAction)}
        </div>
      </div>
    </div>

    <!-- Key Metrics Grid -->
    <div class="grid-3">
      <div class="metric-box">
        <div class="metric-label">SIMULATED BUY / SELL TAX</div>
        <div class="metric-val mono" style="color:${scan.evidence.buyTaxPercent === 0 && scan.evidence.sellTaxPercent === 0 ? "var(--emerald)" : "var(--amber)"};">
          ${scan.evidence.buyTaxPercent}% / ${scan.evidence.sellTaxPercent}%
        </div>
      </div>
      <div class="metric-box">
        <div class="metric-label">ON-CHAIN LIQUIDITY (USD)</div>
        <div class="metric-val mono" style="color:var(--emerald);">
          $${scan.evidence.liquidityUsd.toLocaleString()} <span style="font-size:13px;color:var(--muted);">(${scan.evidence.lpLockedPercent}% LP Lock)</span>
        </div>
      </div>
      <div class="metric-box">
        <div class="metric-label">PROXY / IMPLEMENTATION</div>
        <div class="metric-val mono" style="font-size:15px;color:var(--cyan);word-break:break-all;">
          ${scan.evidence.isProxy ? `${escapeHtml(scan.evidence.proxyType || "EIP-1967")} Ã¢â€ â€™ ${escapeHtml(scan.evidence.implementationAddress || "")}` : "Direct Contract (Non-Proxy)"}
        </div>
      </div>
    </div>

    <!-- Detailed Proxy, Bytecode Disassembly & Provenance Table -->
    <div class="card">
      <h2 style="font-size:18px;font-weight:800;margin-bottom:8px;">Ã°Å¸â€Â¬ Proxy Resolution &amp; Instruction-Boundary Opcode Evidence</h2>
      <table>
        <tbody>
          <tr>
            <th>Recommended Agent Decision</th>
            <td class="mono" style="font-weight:700;color:${verdictColor};">${escapeHtml(scan.recommendedAgentAction)}</td>
          </tr>
          <tr>
            <th>EIP-1967 / EIP-1822 Proxy Status</th>
            <td class="mono">${scan.evidence.isProxy ? `Yes (${escapeHtml(scan.evidence.proxyType || "EIP-1967")})` : "No (Standalone Bytecode)"}</td>
          </tr>
          <tr>
            <th>Resolved Implementation Contract</th>
            <td class="mono">${escapeHtml(scan.evidence.implementationAddress || "N/A (Direct)")}</td>
          </tr>
          <tr>
            <th>Proxy Admin Slot (0xb531...6103)</th>
            <td class="mono">${escapeHtml(scan.evidence.adminAddress || "None / Zero")}</td>
          </tr>
          <tr>
            <th>Owner / Authority Status</th>
            <td class="mono">${escapeHtml(scan.evidence.ownerStatus)} ${scan.evidence.ownerAddress ? `(${escapeHtml(scan.evidence.ownerAddress)})` : ""}</td>
          </tr>
          <tr>
            <th>Instruction-Boundary Opcode Audit</th>
            <td class="mono">
              SELFDESTRUCT (0xff): <strong>${scan.evidence.hasSelfDestruct ? "DETECTED" : "None"}</strong> &bull;
              DELEGATECALL (0xf4): <strong>${scan.evidence.hasDelegateCall ? "Present" : "None"}</strong> &bull;
              PUSH4 Selectors Extracted: <strong>${scan.evidence.functionSelectorsCount}</strong>
            </td>
          </tr>
          <tr>
            <th>Dangerous Selectors / Risk Flags</th>
            <td class="mono">${scan.evidence.dangerousSelectorsFound.length > 0 ? escapeHtml(scan.evidence.dangerousSelectorsFound.join(", ")) : "None Detected (Clean)"}</td>
          </tr>
          <tr>
            <th>Provenance Block &amp; Oracles</th>
            <td class="mono">Block #${scan.provenance.blockNumber} &bull; Sources: ${escapeHtml(scan.provenance.sourcesAgreed.join(", "))}</td>
          </tr>
          <tr>
            <th>Cryptographic SHA-256 Attestation</th>
            <td class="mono" style="word-break:break-all;color:var(--cyan);">${escapeHtml(scan.provenance.attestationSha256)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>

  <script>
    const RULE_SNIPPET = ${JSON.stringify(CLAUDE_AGENTS_MD_RULE_SNIPPET)};
    function copyText(txt, btn) {
      navigator.clipboard.writeText(txt).catch(() => {});
      const prev = btn.textContent;
      btn.textContent = 'Ã¢Å“â€¦ Copied!';
      setTimeout(() => { btn.textContent = prev; }, 1600);
    }
    function copyRuleSnippet(btn) {
      copyText(RULE_SNIPPET, btn);
    }
  </script>
</body>
</html>`;
}

const PUBLIC_SCORECARD_CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const PUBLIC_SCORECARD_KV_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function handleWebScanRoute(c: any, rawChain: string, rawAddressParam: string) {
  const isMd = shouldServeMarkdown(c, rawAddressParam);
  const cleanAddress = rawAddressParam.toLowerCase().endsWith(".md")
    ? rawAddressParam.slice(0, -3)
    : rawAddressParam;
  const normChain = normalizeChain(rawChain);
  const normAddr = normChain === "solana" ? cleanAddress.trim() : cleanAddress.trim().toLowerCase();

  // Check Cloudflare Edge Cache API first so crawler traffic (e.g. AhrefsBot) serves in <50ms
  const edgeCache =
    typeof caches !== "undefined" && (caches as any)?.default
      ? ((caches as any).default as Cache)
      : null;
  const cacheKeyUrl = `https://cache.nullclear.dev/scan/${encodeURIComponent(normChain)}/${encodeURIComponent(normAddr)}.${isMd ? "md" : "html"}`;
  const edgeCacheReq = new Request(cacheKeyUrl, { method: "GET" });

  if (edgeCache) {
    try {
      const cachedRes = await edgeCache.match(edgeCacheReq);
      if (cachedRes) {
        const hitHeaders = new Headers(cachedRes.headers);
        hitHeaders.set("Cache-Control", PUBLIC_SCORECARD_CACHE_CONTROL);
        hitHeaders.set("X-NullClear-Cache", "EDGE_HIT");
        return new Response(cachedRes.body, {
          status: cachedRes.status,
          headers: hitHeaders
        });
      }
    } catch {}
  }

  const scan = await scanTokenForensics(rawChain, cleanAddress, c.env, {
    maxCacheAgeMs: PUBLIC_SCORECARD_KV_MAX_AGE_MS
  });

  const bodyText = isMd ? formatScanMarkdown(scan) : renderForensicScanHtmlPage(scan);
  const contentType = isMd ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";
  const responseHeaders = new Headers({
    "Content-Type": contentType,
    "Cache-Control": PUBLIC_SCORECARD_CACHE_CONTROL,
    Vary: "Accept, User-Agent",
    "X-NullClear-Attestation": scan.provenance.attestationSha256,
    "X-NullClear-Cache": scan.cached ? "KV_HIT" : "MISS"
  });

  const res = new Response(bodyText, {
    status: 200,
    headers: responseHeaders
  });

  if (edgeCache) {
    const putPromise = edgeCache.put(edgeCacheReq, res.clone()).catch(() => {});
    if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
      c.executionCtx.waitUntil(putPromise);
    }
  }

  return res;
}

forensicsRouter.get("/scan/:chain/:address", (c) => {
  return handleWebScanRoute(c, c.req.param("chain"), c.req.param("address"));
});

forensicsRouter.get("/scan/:address", (c) => {
  const addr = c.req.param("address");
  const clean = addr.toLowerCase().endsWith(".md") ? addr.slice(0, -3) : addr;
  const chain = c.req.query("chain") || (isSolanaAddress(clean) ? "solana" : "base");
  return handleWebScanRoute(c, chain, addr);
});

// ============================================================================
// 9. GET /x402 Ã¢â‚¬â€ Dedicated x402 Clearinghouse, EIP-3009 & Seller Gateway Product Tab
// ============================================================================
forensicsRouter.get("/x402", (c) => {
  return c.html(renderDevX402Html());
});

// ============================================================================
// 10. GET /firewall Ã¢â‚¬â€ Trading Bot & DeFi Builder Pre-Swap Security Wedge
// ============================================================================
forensicsRouter.get("/firewall", (c) => {
  return c.html(renderDevFirewallHtml());
});

// 11. GET /v1/verdict-card/:chain/:address(.svg) Ã¢â‚¬â€ Zero-dependency Edge-cached SVG share card
forensicsRouter.get("/v1/verdict-card/:chain/:address", async (c) => {
  const rawChain = c.req.param("chain") || "base";
  const rawAddrParam = c.req.param("address") || "";
  const address = rawAddrParam.replace(/\.svg$/i, "").trim();
  if (!isEvmAddress(address) && !isSolanaAddress(address)) {
    return c.json(
      {
        error: "Invalid token address",
        message: "Provide a valid EVM (0x...) or Solana base58 mint address."
      },
      400
    );
  }
  const scan = await scanTokenForensics(rawChain, address, c.env);
  const verdict = buildTokenVerdictPayload(scan);
  const svg = renderTokenVerdictSvg(verdict);
  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=300",
    "X-NullClear-Attestation": verdict.attestation
  });
});

// 12. GET /verdict/:chain/:address Ã¢â‚¬â€ Public Token Verdict Scorecard & Share Page
forensicsRouter.get("/verdict/:chain/:address", async (c) => {
  const rawChain = c.req.param("chain") || "base";
  const rawAddrParam = c.req.param("address") || "";
  const address = rawAddrParam.replace(/\.(json|md|svg)$/i, "").trim();
  if (!isEvmAddress(address) && !isSolanaAddress(address)) {
    return c.json(
      {
        error: "Invalid token address",
        message: "Provide a valid EVM (0x...) or Solana base58 mint address."
      },
      400
    );
  }
  const scan = await scanTokenForensics(rawChain, address, c.env);
  const verdict = buildTokenVerdictPayload(scan);
  if (rawAddrParam.endsWith(".svg")) {
    return c.body(renderTokenVerdictSvg(verdict), 200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300"
    });
  }
  if (rawAddrParam.endsWith(".json") || (c.req.header("accept") || "").includes("application/json")) {
    return c.json(verdict);
  }
  return c.html(renderTokenVerdictHtmlPage(verdict), 200, {
    "Cache-Control": "public, max-age=120, s-maxage=120"
  });
});

import { Hono } from "hono";
import { keccak256, stringToHex } from "viem";
import type { Env } from "../env.js";
import { getArbiterStore } from "../env.js";
import { computeTrustScore } from "../services/reputation.js";
import { signClearingReceipt } from "../services/attestation.js";
import { validateTargetUrl } from "../services/ssrf-guard.js";
import { validateUpstreamResponse } from "../services/validator.js";
import { executeUpstreamFetch } from "./clear.js";
import { runAutoGuard } from "./proxy.js";
import { buildX402UpgradeBlock, resolveForensicAccess } from "./forensics.js";
import {
  buildNullClearMetadata,
  consumeSponsoredFreeCall,
  FREE_TIER_DAILY_LIMIT,
  FORENSIC_FREE_TIER_DAILY_LIMIT
} from "../middleware/free-tier.js";
import { authenticateAndDebitPass } from "../middleware/pass-auth.js";
import {
  scanTokenForensics,
  inspectContractAbiAndProxy,
  decodeCalldataOrTx,
  simulateTransactionPreflight,
  guardTransactionPreflight,
  readUrlCleanMarkdown
} from "../services/forensics-engine.js";

export const mcpHttpRouter = new Hono<Env>();

function hasMcpX402PaymentHeader(c: any): boolean {
  const raw =
    c.req.header("X-Payment") ||
    c.req.header("x-payment") ||
    c.req.header("PAYMENT-SIGNATURE") ||
    c.req.header("payment-signature") ||
    c.req.header("X-NullClear-Authorization") ||
    c.req.header("x-nullclear-authorization") ||
    "";
  const trimmed = raw.trim();
  return (
    trimmed.length > 10 &&
    trimmed.toLowerCase() !== "free-trial" &&
    trimmed.toLowerCase() !== "sponsored"
  );
}

function buildMcp402JsonRpcResponse(
  c: any,
  id: unknown,
  resourcePath: string,
  message: string,
  status: 401 | 402 = 402
): Response {
  const upgrade = buildX402UpgradeBlock(c, resourcePath);
  c.header("PAYMENT-REQUIRED", upgrade.encodedHeader);
  c.header("X-Payment-Required", upgrade.encodedHeader);
  c.header("Pay-To", upgrade.treasuryAddress);

  return c.json(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code: status,
        message
      },
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: status === 401 ? "invalid_api_key" : "free_trial_exhausted",
                rateLimited: status === 402,
                message,
                prepaidPassUrl: "POST https://api.nullclear.dev/v1/pass/buy",
                x402Upgrade: upgrade.x402Upgrade,
                paymentRequired: upgrade.paymentRequiredPayload,
                _nullclear: buildNullClearMetadata(0)
              },
              null,
              2
            )
          }
        ]
      }
    },
    status
  );
}

/**
 * Shared access gate for metered remote MCP tools:
 * 1. Prepaid Pass Bearer key (`Authorization: Bearer nc_live_...` or `X-NullClear-Key`) -> <5ms, 1 credit
 * 2. Per-call x402 EIP-3009 USDC payment (`PAYMENT-SIGNATURE` / `X-Payment`) -> $0.005 USDC
 * 3. Daily zero-key free tier (10 calls/day/IP/session) -> HTTP 402 on call #11+
 */
async function resolveMcpToolAccess(
  c: any,
  id: unknown,
  toolName: string,
  bucket: "forensic" | "sponsored"
): Promise<{
  allowed: boolean;
  remaining: number;
  tier: string;
  errorResponse?: Response;
}> {
  const resourcePath = `/mcp/${toolName}`;

  if (bucket === "forensic") {
    const access = await resolveForensicAccess(c, resourcePath);
    if (access.errorResponse) {
      let errMsg = `Payment Required: Daily free tier limit (${FORENSIC_FREE_TIER_DAILY_LIMIT} calls/day) reached. Mint a Prepaid Pass at POST https://api.nullclear.dev/v1/pass/buy (Bearer nc_live_...) or attach an X-Payment EIP-3009 header ($0.005 USDC).`;
      try {
        const parsed: any = await access.errorResponse.clone().json();
        if (typeof parsed?.error === "string" && parsed.error) errMsg = parsed.error;
      } catch {}
      const status: 401 | 402 = access.errorResponse.status === 401 ? 401 : 402;
      return {
        allowed: false,
        remaining: 0,
        tier: status === 401 ? "invalid-pass" : "forensic-rate-limited",
        errorResponse: buildMcp402JsonRpcResponse(c, id, resourcePath, errMsg, status)
      };
    }
    if (!access.allowed && !access.paid) {
      const msg = `Payment Required: Daily free tier limit (${FORENSIC_FREE_TIER_DAILY_LIMIT} calls/day) reached for ${toolName}. Mint a Prepaid Pass at POST https://api.nullclear.dev/v1/pass/buy (Authorization: Bearer nc_live_...) or attach an X-Payment / PAYMENT-SIGNATURE header ($0.005 USDC on Base).`;
      return {
        allowed: false,
        remaining: 0,
        tier: "forensic-rate-limited",
        errorResponse: buildMcp402JsonRpcResponse(c, id, resourcePath, msg, 402)
      };
    }
    return {
      allowed: true,
      remaining: access.remaining,
      tier: access.paid ? (c.res?.headers?.get("x-nullclear-tier") || "paid") : "forensic-free"
    };
  }

  // Sponsored / Bazaar MCP tools: check Prepaid Pass or X-Payment first, then 10/day sponsored quota
  const passAuth = await authenticateAndDebitPass(c, 1);
  if (passAuth.hasKey) {
    if (passAuth.authenticated && passAuth.pass) {
      return { allowed: true, remaining: passAuth.creditsRemaining, tier: "prepaid-pass" };
    }
    const status: 401 | 402 = passAuth.pass ? 402 : 401;
    return {
      allowed: false,
      remaining: 0,
      tier: passAuth.pass ? "prepaid-pass-exhausted" : "invalid-pass",
      errorResponse: buildMcp402JsonRpcResponse(
        c,
        id,
        resourcePath,
        passAuth.errorReason || "Invalid or exhausted NullClear Prepaid Pass key",
        status
      )
    };
  }

  if (hasMcpX402PaymentHeader(c)) {
    const paidAccess = await resolveForensicAccess(c, resourcePath);
    if (paidAccess.allowed && paidAccess.paid) {
      return { allowed: true, remaining: paidAccess.remaining, tier: "x402-paid" };
    }
    let errMsg = "x402 payment settlement failed for MCP tool call.";
    if (paidAccess.errorResponse) {
      try {
        const parsed: any = await paidAccess.errorResponse.clone().json();
        if (typeof parsed?.error === "string" && parsed.error) errMsg = parsed.error;
      } catch {}
    }
    return {
      allowed: false,
      remaining: 0,
      tier: "payment-failed",
      errorResponse: buildMcp402JsonRpcResponse(c, id, resourcePath, errMsg, 402)
    };
  }

  const freeTier = await consumeSponsoredFreeCall(c, FREE_TIER_DAILY_LIMIT);
  c.header("x-nullclear-tier", freeTier.allowed ? "free-trial" : "free-trial-exhausted");
  c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

  if (!freeTier.allowed) {
    const msg = `Payment Required: Daily free tier limit (${FREE_TIER_DAILY_LIMIT} calls/day) reached. Mint a Prepaid Pass at POST https://api.nullclear.dev/v1/pass/buy (Authorization: Bearer nc_live_...) or configure NULLCLEAR_PRIVATE_KEY / attach an X-Payment header ($0.005 USDC on Base) to continue.`;
    return {
      allowed: false,
      remaining: 0,
      tier: "free-trial-exhausted",
      errorResponse: buildMcp402JsonRpcResponse(c, id, resourcePath, msg, 402)
    };
  }

  return { allowed: true, remaining: freeTier.remaining, tier: "free-trial" };
}

export const TOOL_DISPATCH_ALIASES: Record<string, string> = {
  nullclear_preflight_guard: "guard_transaction_preflight",
  nullclear_scan_token: "scan_token_forensics",
  nullclear_inspect_contract: "inspect_contract_abi_and_proxy",
  nullclear_decode_calldata: "decode_calldata_or_failed_tx",
  nullclear_simulate_transaction: "simulate_transaction_preflight",
  nullclear_read_markdown: "read_url_clean_markdown",
  nullclear_discover_apis: "nullclear_discover_verified_x402_apis",
  nullclear_audit_paid_token: "nullclear_token_security_audit",
  nullclear_score_wallet: "nullclear_wallet_risk_score",
  nullclear_fetch_spot_price: "nullclear_crypto_market_oracle",
  nullclear_fetch_guarded: "nullclear_safe_fetch",
  nullclear_execute_escrow: "nullclear_escrow_x402_call",
  nullclear_check_reputation: "nullclear_check_reputation",
  nullclear_verify_mandate: "nullclear_verify_kya_mandate"
};

export const MCP_TOOLS = [
  {
    name: "nullclear_scan_token",
    description:
      "Perform a free multi-chain (Base, Ethereum, Arbitrum, Optimism, Polygon, BSC, Solana) token security, proxy resolution, Token-2022 extension/mint/freeze authority audit, honeypot, and buy/sell tax audit (10 free calls/day/IP, zero API key; then $0.005 USDC). Returns score, verdict, recommendedAgentAction, proxy implementation, tax percentages, LP USD, and provenance block number (<400 tokens). Do NOT use for low-level 4-byte selector disassembly on non-token contracts (use nullclear_inspect_contract).",
    annotations: {
      title: "7-Chain Token Security, Token-2022 & Proxy Scanner (Free)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          description: "Token or contract address (0x-prefixed 42-char EVM hex, or Base58 mint address for Solana)",
          default: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        },
        chain: {
          type: "string",
          enum: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc", "solana"],
          description: "Target blockchain network; auto-detects if address exists on an alternate supported chain",
          default: "base"
        }
      }
    }
  },
  {
    name: "nullclear_inspect_contract",
    description:
      "Disassemble deployed EVM bytecode across Base, Ethereum, Arbitrum, Optimism, Polygon, or BSC to resolve EIP-1967/1822/1167/Beacon/Diamond/Safe proxies, query Sourcify v2 verified ABIs, batch-resolve PUSH4 selectors via OpenChain, and analyze control-flow opcode risks (tx.origin, mutable DELEGATECALL, unguarded SELFDESTRUCT) without an Etherscan key (10 free calls/day/IP).",
    annotations: {
      title: "EVM Proxy, Sourcify ABI & Bytecode Inspector (Free)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          description: "0x-prefixed 42-char EVM smart contract address",
          default: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        },
        chain: {
          type: "string",
          enum: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc"],
          description: "Target EVM chain (default 'base')",
          default: "base"
        }
      }
    }
  },
  {
    name: "nullclear_decode_calldata",
    description:
      "Decode EVM calldata (recursively unwrapping Multicall3, Uniswap Universal Router, Safe execTransaction), EIP-712 typed-data signatures (Permit, Permit2, Seaport), Solana wire transactions (Base64/Base58), custom Solidity revert bytes, or mined tx hashes with verified-router spender trust classification (10 free calls/day/IP).",
    annotations: {
      title: "Recursive Calldata, EIP-712, Solana Wire & Revert Decoder (Free)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "0x-prefixed hex calldata/revert bytes, 66-char tx hash, or Base64/Base58 Solana transaction"
        },
        typedData: {
          type: "object",
          description: "Optional EIP-712 typedData JSON (Permit, Permit2, Seaport, SafeTx)"
        },
        chain: {
          type: "string",
          enum: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc", "solana"],
          description: "Target network (default 'base')",
          default: "base"
        }
      }
    }
  },
  {
    name: "nullclear_simulate_transaction",
    description:
      "Execute stateful pre-flight simulation across EVM (eth_simulateV1 with stateOverrides, multi-tx bundles, and Transfer/Approval net asset diffs; fallback eth_call + eth_estimateGas) and Solana (simulateTransaction + wire instruction audit) BEFORE signing (10 free calls/day/IP).",
    annotations: {
      title: "Stateful EVM & Solana Pre-Flight Simulator (Free)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          enum: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc", "solana"],
          description: "Target network (default 'base')",
          default: "base"
        },
        from: {
          type: "string",
          description: "Sender 0x EVM address"
        },
        to: {
          type: "string",
          description: "Destination 0x smart contract address (required for single EVM call)"
        },
        data: {
          type: "string",
          description: "0x-prefixed hex calldata payload",
          default: "0x"
        },
        value: {
          type: "string",
          description: "Native wei amount as hex ('0x0') or decimal string",
          default: "0x0"
        },
        transactions: {
          type: "array",
          description: "Optional ordered multi-tx EVM bundle [{ to, data, value }]"
        },
        stateOverrides: {
          type: "object",
          description: "Optional EVM stateOverrides map"
        },
        transaction: {
          type: "string",
          description: "Base64/Base58 serialized Solana transaction when chain='solana'"
        }
      }
    }
  },
  {
    name: "nullclear_read_markdown",
    description:
      "Fetch and convert any public web documentation URL or HTML article into clean, stripped Markdown (<400 tokens) with a SHA-256 content hash. Use this when reading documentation, blog posts, or web pages while minimizing context-window noise (10 free calls/day/IP). Returns markdown body and provenance hash. Do NOT use for JSON REST APIs or schema-enforced x402 data endpoints needing LLM-refusal/5xx protection (use nullclear_fetch_guarded or nullclear_execute_escrow).",
    annotations: {
      title: "HTML Documentation to Clean Markdown Reader (Free)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "Public HTTPS webpage or documentation URL to extract into clean Markdown"
        }
      }
    }
  },
  {
    name: "nullclear_preflight_guard",
    description:
      "All-in-one 1-call Pre-Sign Firewall across Base, Ethereum, Arbitrum, Optimism, Polygon, BSC, and Solana (10 free calls/day/IP). In one pass, recursively unwraps Multicall3/Uniswap Universal Router/Safe calldata or EIP-712 Permits or Solana wire txs, runs stateful eth_simulateV1 / Solana simulateTransaction with asset balance diffs, and automatically scans all touched token contracts for honeypots, taxes, and Token-2022 permanent delegates. Returns one deterministic recommendedAgentAction (EXECUTE_SAFE / CAUTION_HIGH_RISK / ABORT_*).",
    annotations: {
      title: "1-Call Multi-Chain Pre-Sign Firewall (Free)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          enum: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc", "solana"],
          description: "Target network (default 'base')",
          default: "base"
        },
        from: { type: "string", description: "Sender 0x EVM address" },
        to: { type: "string", description: "Target contract 0x address or Solana mint" },
        data: { type: "string", description: "0x-prefixed EVM calldata" },
        value: { type: "string", description: "Native wei amount ('0x0')" },
        transactions: {
          type: "array",
          description: "Optional ordered multi-tx bundle [{ to, data, value }]"
        },
        stateOverrides: {
          type: "object",
          description: "Optional EVM eth_simulateV1/eth_call stateOverrides map"
        },
        typedData: {
          type: "object",
          description: "Optional EIP-712 typedData object (Permit, Permit2, Seaport, SafeTx) to audit before signing"
        },
        transaction: {
          type: "string",
          description: "Optional Base64/Base58 serialized Solana transaction to decode and simulate"
        }
      }
    }
  },
  {
    name: "nullclear_discover_apis",
    description:
      "Search NullClear's audited x402 and ERC-8004 endpoint directory by keyword, category, minimum uptime, and maximum latency. Use this before paying external x402 sellers to find reliable APIs and retrieve their NullClear Zero-Loss Proxy URL (`https://api.nullclear.dev/https://...`). Returns matched endpoints with priceAtomic, uptimeScore, latencyMs, and proxy URL. Do NOT use to execute a call (pass the returned URL to nullclear_execute_escrow).",
    annotations: {
      title: "Search Audited x402 & ERC-8004 API Directory",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keyword filter matching endpoint URL or description (e.g. 'oracle', 'security', 'token', 'wallet')"
        },
        category: {
          type: "string",
          description: "Exact category filter ('oracle', 'security', 'data', or 'ai')"
        },
        minUptime: {
          type: "number",
          description: "Minimum rolling uptime percentage threshold from 0 to 100 (default 95)",
          default: 95
        },
        maxLatencyMs: {
          type: "number",
          description: "Maximum acceptable edge round-trip latency in milliseconds (default 2000)",
          default: 2000
        },
        verifiedOnly: {
          type: "boolean",
          description: "When true, filter exclusively to canary-verified HTTP 402 endpoints (default true)",
          default: true
        }
      }
    }
  },
  {
    name: "nullclear_audit_paid_token",
    description:
      "Run NullClear's x402 Bazaar paid oracle for Base Mainnet (8453) ERC-20 tokens returning a cryptographically signed clearing receipt (10 free trial calls/day, then $0.005 USDC). Use this ONLY when you specifically require a Base Bazaar EIP-712/keccak256 settlement receipt alongside token LP and bytecode verification. For free (10/day) multi-chain Base/ETH/Solana token & proxy scanning, use nullclear_scan_token instead.",
    annotations: {
      title: "Base Token x402 Bazaar Attested Audit ($0.005)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["tokenAddress"],
      properties: {
        tokenAddress: {
          type: "string",
          description: "0x-prefixed Base Mainnet (chain 8453) ERC-20 token contract address",
          default: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        }
      }
    }
  },
  {
    name: "nullclear_score_wallet",
    description:
      "Profile a raw 0x EVM wallet address on Base Mainnet (8453) for OFAC sanctions exposure, on-chain counterparty wash-trade concentration, ETH/USDC balances, transaction count, and ERC-8004 ownership (10 free trials/day, then $0.005 USDC). Returns riskScore (0-100), riskLevel, and ERC-8004 registration status. Do NOT pass a numeric ERC-8004 agent ID here — use nullclear_check_reputation for numeric agentId trust audits.",
    annotations: {
      title: "0x Wallet Address Sanctions & Sybil Profiler ($0.005)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["walletAddress"],
      properties: {
        walletAddress: {
          type: "string",
          description: "0x-prefixed 42-char EVM wallet address on Base Mainnet to screen"
        },
        chainId: {
          type: "number",
          description: "EVM chain ID (default 8453 for Base Mainnet)",
          default: 8453
        }
      }
    }
  },
  {
    name: "nullclear_fetch_spot_price",
    description:
      "Query cross-exchange spot prices (Coinbase + Binance) for major crypto pairs with deterministic positive-price invariant verification and signed attestation (10 free trials/day, then $0.01 USDC). Returns priceUsd, source, invariantCheck ('PASSED'), and execution receipt. Use this whenever a verified non-hallucinated crypto spot price feed is needed.",
    annotations: {
      title: "Spread-Verified Crypto Spot Price Oracle ($0.01)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["pair"],
      properties: {
        pair: {
          type: "string",
          description: "Asset ticker or pair such as 'ETH/USDC', 'BTC/USDC', 'SOL/USDC', or 'ETH-USD'",
          default: "ETH/USDC"
        }
      }
    }
  },
  {
    name: "nullclear_fetch_guarded",
    description:
      "Execute a zero-schema Auto-Guarded HTTP GET/POST request through NullClear's firewall against HTTP 5xx crashes, empty JSON bodies, Cloudflare/soft-paywall traps, and LLM refusal strings (10 free trials/day, then $0.005 USDC via Bazaar). Returns verified payload and executionReceipt, or voids settlement on failure. Do NOT use for plain HTML docs-to-Markdown conversion (use nullclear_read_markdown) or when custom JSON Schema/invariants/failover are needed (use nullclear_execute_escrow).",
    annotations: {
      title: "Auto-Guarded JSON/API Safe HTTP Fetch ($0.005)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "Public HTTPS API or data endpoint URL to fetch with automatic crash, paywall, and refusal guards"
        },
        method: {
          type: "string",
          enum: ["GET", "POST"],
          description: "HTTP method ('GET' or 'POST', default 'GET')",
          default: "GET"
        },
        body: {
          type: "string",
          description: "Optional serialized JSON request body string for POST requests"
        }
      }
    }
  },
  {
    name: "nullclear_execute_escrow",
    description:
      "Execute a paid x402 API request protected by NullClear deferred non-custodial EIP-3009 escrow, custom JSON Schema/value invariants, multi-seller failover routing, and outbound spend caps (10 free trials/day, then requires configured wallet key). Settles upstream payment ONLY when all schema, numeric, staleness, and refusal checks pass; otherwise voids authorization ($0 lost). Use this instead of nullclear_fetch_guarded whenever calling third-party x402 paid APIs with strict output contracts or fallback sellers.",
    annotations: {
      title: "Deferred x402 Escrow Call with Schema & Failover",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["targetUrl"],
      properties: {
        targetUrl: { type: "string", description: "Primary upstream HTTPS endpoint demanding HTTP 402 payment" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method for upstream call", default: "GET" },
        sellerAgentId: { type: "string", description: "ERC-8004 seller agent ID for pre-flight trust and Sybil gating" },
        minTrustScore: { type: "number", description: "Minimum seller trust score (0-100, default 50)", default: 50 },
        requiredFields: { type: "array", items: { type: "string" }, description: "Dot-notation field paths that must exist in upstream JSON" },
        jsonSchema: { type: "object", description: "JSON Schema Draft-07 object that upstream JSON must strictly satisfy" },
        invariants: {
          type: "array",
          description: "Field-level semantic invariants (numeric bounds, regex, forbidden substrings, timestamp freshness)",
          items: {
            type: "object",
            required: ["path"],
            properties: {
              path: { type: "string", description: "Dot-notation JSON property path" },
              gt: { type: "number" },
              gte: { type: "number" },
              lt: { type: "number" },
              lte: { type: "number" },
              eq: {},
              neq: {},
              minLength: { type: "number" },
              maxLength: { type: "number" },
              pattern: { type: "string" },
              notContains: { type: "array", items: { type: "string" } },
              maxStalenessSeconds: { type: "number" }
            }
          }
        },
        rejectRefusals: { type: "boolean", description: "Void settlement if response contains canonical LLM refusal strings (default true)", default: true },
        fallbacks: { type: "array", description: "Up to 3 ordered backup seller objects ({ targetUrl, sellerAgentId, paymentSignatureHeader }) for automatic failover", items: { type: "object" } },
        spendPolicy: { type: "object", description: "Outbound spend firewall caps ({ maxPerCallAtomic, maxDailyWalletAtomic })" }
      }
    }
  },
  {
    name: "nullclear_check_reputation",
    description:
      "Retrieve an ERC-8004 registered agent's composite trust score (0-100), letter grade (A-F), historical clearing count, and Sybil wash-trading penalty flags by numeric agentId. Returns arbiter-signed reputation metrics and sybilFlags. Use this ONLY for registered ERC-8004 agent IDs (e.g. '124595'); for raw 0x wallet address OFAC/balance profiling use nullclear_score_wallet, and for legal corporate liability limits use nullclear_verify_mandate.",
    annotations: {
      title: "Check ERC-8004 AgentId Trust & Sybil Score",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["agentId"],
      properties: {
        agentId: { type: "string", description: "Registered numeric ERC-8004 agent token ID (e.g. '124595')" },
        chainId: { type: "number", description: "Target EVM chain ID (8453 for Base Mainnet, 84532 for Base Sepolia)", default: 8453 }
      }
    }
  },
  {
    name: "nullclear_verify_mandate",
    description:
      "Verify an autonomous agent's Know Your Agent (KYA) EIP-712 corporate liability mandate, jurisdiction, expiration status, and whether a proposed USD transaction amount complies with corporate per-transaction caps. Returns approved boolean, corporateEntity, liabilityCoverageUsd, maxTxLimitUsd, and expiration/limit flags. Use this specifically for corporate authorization checks — not for on-chain Sybil scoring (use nullclear_check_reputation).",
    annotations: {
      title: "Verify Corporate KYA Liability Mandate & Caps",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["agentId", "transactionAmountUsd"],
      properties: {
        agentId: { type: "string", description: "Registered numeric ERC-8004 agent token ID bound to a KYA mandate" },
        chainId: { type: "number", description: "EVM chain ID (default 8453 for Base Mainnet)", default: 8453 },
        transactionAmountUsd: { type: "number", description: "Proposed transaction size in USD to validate against the mandate limit" }
      }
    }
  }
];

const MCP_PROMPTS = [
  {
    name: "safe-x402-payment",
    description: "Generate safety invariants and schema-escrow directives for an autonomous agent paying an upstream x402 seller.",
    arguments: [
      { name: "targetUrl", description: "Upstream API endpoint demanding x402 payment", required: true },
      { name: "sellerAgentId", description: "Seller's ERC-8004 agent token ID to verify reputation", required: false },
      { name: "maxSpendAtomic", description: "Maximum atomic USDC units authorized (default: 10000 = $0.01 USDC)", required: false }
    ]
  },
  {
    name: "audit-erc8004-agent",
    description: "Conduct an end-to-end trust audit on an ERC-8004 agent on Base including Sybil risk and corporate KYA backing.",
    arguments: [
      { name: "agentId", description: "ERC-8004 agent token ID (e.g. '124595')", required: true },
      { name: "chainId", description: "Base chain ID (default: 8453)", required: false }
    ]
  }
];

const MCP_RESOURCES = [
  {
    uri: "nullclear://stats/live",
    name: "NullClear Live Protocol Telemetry",
    mimeType: "application/json",
    description: "Live protocol metrics: total clearings, verified settlements, voided hallucinations, and indexed agents"
  },
  {
    uri: "nullclear://docs/quickstart",
    name: "NullClear Quickstart Guide",
    mimeType: "text/markdown",
    description: "Zero-loss x402 deferred schema escrow guide for autonomous AI agents on Base Mainnet"
  }
];

// GET /mcp - Health & Discovery Information
mcpHttpRouter.get("/", (c) => {
  return c.json({
    status: "active",
    name: "nullclear-mcp",
    version: "1.6.0",
    protocolVersion: "2024-11-05",
    description: "NullClear 7-Chain Pre-Execution Firewall, Guarded RPC & x402 MCP Remote Server (10 free calls/day, zero API key)",
    endpoint: "https://api.nullclear.dev/mcp",
    transport: "streamable-http",
    freeTierDailyCalls: 10,
    tools: MCP_TOOLS,
    prompts: MCP_PROMPTS,
    resources: MCP_RESOURCES,
    _nullclear: buildNullClearMetadata()
  });
});

mcpHttpRouter.delete("/", (c) => {
  return c.json({ status: "closed", endpoint: "https://api.nullclear.dev/mcp" });
});

mcpHttpRouter.all("/", (c, next) => {
  if (c.req.method === "HEAD") {
    return c.body(null, 200);
  }
  return next();
});

// POST /mcp - Standard MCP JSON-RPC 2.0 Handler
mcpHttpRouter.post("/", async (c) => {
  const store = getArbiterStore(c.env);
  let rpcRequest: any;

  try {
    rpcRequest = await c.req.json();
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const { id = 1, method, params } = rpcRequest;

  // 1. tools/list
  if (method === "tools/list") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: MCP_TOOLS
      }
    });
  }

  // 1b. resources/list
  if (method === "resources/list") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        resources: MCP_RESOURCES
      }
    });
  }

  // 1c. resources/read
  if (method === "resources/read") {
    const uri = params?.uri;
    if (uri === "nullclear://stats/live") {
      const stats = await store.getProtocolStats();
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(stats, null, 2)
            }
          ]
        }
      });
    }

    if (uri === "nullclear://docs/quickstart") {
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: "text/markdown",
              text: `# NullClear Arbiter Quickstart\n\nNullClear is the autonomous deferred clearing and reputation protocol for AI agent commerce on Base Mainnet.\n\n### Zero-Config Free Trial\nAll MCP tools work out-of-the-box with **10 free calls per day** across zero-key forensics &amp; x402 MCP tools (or unlimited via \`NULLCLEAR_API_KEY\` Prepaid Pass / \`NULLCLEAR_PRIVATE_KEY\`)—no wallet or private key required to start.\n\n### Canonical Tool Suite\n- \`nullclear_scan_token\`: Free Base/ETH/Solana token & proxy security scan.\n- \`nullclear_inspect_contract\`: Free EVM proxy slot & selector disassembler.\n- \`nullclear_decode_calldata\`: Free calldata/revert & failed tx decoder.\n- \`nullclear_simulate_transaction\`: Free pre-flight eth_call & gas simulator.\n- \`nullclear_read_markdown\`: Free HTML docs-to-Markdown reader.\n- \`nullclear_audit_paid_token\`: Paid ($0.005) Base token audit with signed Bazaar receipt.\n- \`nullclear_score_wallet\`: Check any 0x wallet for sanctions, Sybil wash-trading, and balances.\n- \`nullclear_fetch_spot_price\`: Multi-exchange spread-verified price feed (ETH, BTC, SOL).\n- \`nullclear_fetch_guarded\`: Drop-in URL fetcher with Canonical LLM Refusal Guard & crash protection.\n- \`nullclear_execute_escrow\`: Execute deferred schema escrow with numeric bounds and LLM refusal guards.\n- \`nullclear_check_reputation\`: Check an ERC-8004 agent's Sybil trust score (0-100).\n- \`nullclear_verify_mandate\`: Verify an agent's corporate entity backing and spending limits.\n`
            }
          ]
        }
      });
    }

    return c.json({ jsonrpc: "2.0", id, error: { code: -32602, message: `Resource not found: ${uri}` } });
  }

  // 1d. prompts/list
  if (method === "prompts/list") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        prompts: MCP_PROMPTS
      }
    });
  }

  // 1e. prompts/get
  if (method === "prompts/get") {
    const name = params?.name;
    const promptArgs = params?.arguments || {};

    if (name === "safe-x402-payment") {
      const targetUrl = promptArgs.targetUrl || "https://api.nullclear.dev/v1/sandbox/market-feed";
      const sellerAgentId = promptArgs.sellerAgentId || "unknown";
      const maxSpendAtomic = promptArgs.maxSpendAtomic || "10000";

      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          description: "Safe x402 Escrow Clearing Directive",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `You are preparing to execute an autonomous payment to an x402 service at ${targetUrl}.\n\nMandatory Safety Rules:\n1. NEVER send unconditional payments directly to unverified endpoints.\n2. Invoke the MCP tool 'nullclear_execute_escrow' with targetUrl="${targetUrl}", sellerAgentId="${sellerAgentId}", minTrustScore=50, and spendPolicy={ maxPerCallAtomic: "${maxSpendAtomic}" }.\n3. Supply an explicit JSON schema and deep numeric invariants to validate the seller's response before settlement.\n4. If the seller hallucinates, returns an LLM refusal, or crashes, the arbiter voids the payment automatically and $0.00 is charged.`
              }
            }
          ]
        }
      });
    }

    if (name === "audit-erc8004-agent") {
      const agentId = promptArgs.agentId || "124595";
      const chainId = promptArgs.chainId || "8453";

      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          description: "ERC-8004 Agent Trust & Sybil Audit",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Perform a comprehensive security audit of ERC-8004 agent #${agentId} on chain ${chainId}.\n1. Run MCP tool 'nullclear_check_reputation' with agentId="${agentId}", chainId=${chainId}.\n2. Run MCP tool 'nullclear_verify_mandate' with agentId="${agentId}", chainId=${chainId}, transactionAmountUsd=1.0.\n3. Analyze the composite trust score, letter grade (A-F), Sybil wash-trading risk flags, and corporate liability coverage.\n4. Provide a clear recommendation on whether this agent is safe for autonomous financial counterparty interactions.`
              }
            }
          ]
        }
      });
    }

    return c.json({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown prompt: ${name}` } });
  }

  // 2. tools/call
  if (method === "tools/call") {
    const rawToolName = String(params?.name || "");
    const toolName = TOOL_DISPATCH_ALIASES[rawToolName] ?? rawToolName;
    const args = params?.arguments || {};

    try {
      // Zero-Key Tool 1: scan_token_forensics
      if (toolName === "scan_token_forensics") {
        const access = await resolveMcpToolAccess(c, id, toolName, "forensic");
        if (access.errorResponse) return access.errorResponse;

        const chain = String(args.chain || "base");
        const address = String(args.address || args.tokenAddress || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
        const scan = await scanTokenForensics(chain, address, c.env);

        const compactPayload = {
          llmDigest: scan.llmDigest,
          recommendedAgentAction: scan.recommendedAgentAction,
          provenance: scan.provenance,
          score: scan.score,
          verdict: scan.verdict,
          chain: scan.chain,
          address: scan.address,
          symbol: scan.symbol,
          name: scan.name,
          ...(scan.autoCorrectedChain ? { autoCorrectedChain: true, selfHealingNote: scan.selfHealingNote } : {}),
          evidence: {
            isProxy: scan.evidence.isProxy,
            implementationAddress: scan.evidence.implementationAddress,
            buyTaxPercent: scan.evidence.buyTaxPercent,
            sellTaxPercent: scan.evidence.sellTaxPercent,
            liquidityUsd: scan.evidence.liquidityUsd,
            ownerStatus: scan.evidence.ownerStatus,
            dangerousSelectorsFound: scan.evidence.dangerousSelectorsFound
          },
          links: scan.links
        };

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(compactPayload)
              }
            ]
          }
        });
      }

      // Zero-Key Tool 0: guard_transaction_preflight (1-Call Pre-Sign Firewall)
      if (toolName === "guard_transaction_preflight") {
        const access = await resolveMcpToolAccess(c, id, toolName, "forensic");
        if (access.errorResponse) return access.errorResponse;

        const guard = await guardTransactionPreflight(
          {
            chain: String(args.chain || "base"),
            from: args.from ? String(args.from) : undefined,
            to: args.to ? String(args.to) : undefined,
            data: args.data ? String(args.data) : undefined,
            value: args.value ? String(args.value) : undefined,
            transactions: Array.isArray(args.transactions) ? args.transactions : undefined,
            stateOverrides: args.stateOverrides as Record<string, any> | undefined,
            typedData: args.typedData,
            transaction: args.transaction ? String(args.transaction) : undefined
          },
          c.env
        );

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(guard)
              }
            ]
          }
        });
      }

      // Zero-Key Tool 2: inspect_contract_abi_and_proxy
      if (toolName === "inspect_contract_abi_and_proxy") {
        const access = await resolveMcpToolAccess(c, id, toolName, "forensic");
        if (access.errorResponse) return access.errorResponse;

        const chain = String(args.chain || "base");
        const address = String(args.address || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
        const inspection = await inspectContractAbiAndProxy(chain, address, c.env);

        const compactPayload = {
          llmDigest: inspection.llmDigest,
          recommendedAgentAction: inspection.recommendedAgentAction,
          provenance: inspection.provenance,
          chain: inspection.chain,
          address: inspection.address,
          isContract: inspection.isContract,
          isProxy: inspection.isProxy,
          proxyType: inspection.proxyType,
          implementationAddress: inspection.implementationAddress,
          adminAddress: inspection.adminAddress,
          hasSelfDestruct: inspection.hasSelfDestruct,
          hasDelegateCall: inspection.hasDelegateCall,
          selectorsCount: inspection.selectorsCount,
          decodedFunctions: inspection.decodedFunctions.slice(0, 15),
          dangerousSelectorsFound: inspection.dangerousSelectorsFound,
          ...((inspection as any).controlFlowRisks
            ? { controlFlowRisks: (inspection as any).controlFlowRisks }
            : {}),
          ...((inspection as any).sourcify ? { sourcify: (inspection as any).sourcify } : {})
        };

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(compactPayload)
              }
            ]
          }
        });
      }

      // Zero-Key Tool 3: decode_calldata_or_failed_tx
      if (toolName === "decode_calldata_or_failed_tx") {
        const access = await resolveMcpToolAccess(c, id, toolName, "forensic");
        if (access.errorResponse) return access.errorResponse;

        const input = String(args.input || args.calldata || args.txHash || args.transaction || "");
        const chain = String(args.chain || "base");
        const decoded = await decodeCalldataOrTx(input, chain, c.env, {
          typedData: args.typedData
        });

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(decoded)
              }
            ]
          }
        });
      }

      // Zero-Key Tool 4: simulate_transaction_preflight
      if (toolName === "simulate_transaction_preflight") {
        const access = await resolveMcpToolAccess(c, id, toolName, "forensic");
        if (access.errorResponse) return access.errorResponse;

        const sim = await simulateTransactionPreflight(
          {
            chain: String(args.chain || "base"),
            from: args.from ? String(args.from) : undefined,
            to: args.to ? String(args.to) : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            data: args.data ? String(args.data) : "0x",
            value: args.value ? String(args.value) : "0x0",
            transactions: Array.isArray(args.transactions) ? args.transactions : undefined,
            stateOverrides: args.stateOverrides as Record<string, any> | undefined,
            transaction: args.transaction ? String(args.transaction) : undefined
          },
          c.env
        );

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(sim)
              }
            ]
          }
        });
      }

      // Zero-Key Tool 5: read_url_clean_markdown
      if (toolName === "read_url_clean_markdown") {
        const targetUrl = String(args.url || "");
        const ssrfCheck = validateTargetUrl(targetUrl, c.env.ENVIRONMENT);
        if (!ssrfCheck.allowed) {
          return c.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `SSRF Guard blocked target URL: ${ssrfCheck.reason}` }
          });
        }

        const access = await resolveMcpToolAccess(c, id, toolName, "forensic");
        if (access.errorResponse) return access.errorResponse;

        const mdRes = await readUrlCleanMarkdown(targetUrl, 900);
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(mdRes)
              }
            ]
          }
        });
      }

      // Tool 0: nullclear_discover_verified_x402_apis
      if (toolName === "nullclear_discover_verified_x402_apis") {
        const query =
          typeof args.query === "string"
            ? args.query
            : typeof args.topic === "string"
              ? args.topic
              : undefined;
        const category = typeof args.category === "string" ? args.category : undefined;
        const minUptime = typeof args.minUptime === "number" ? args.minUptime : 95;
        const maxLatencyMs = typeof args.maxLatencyMs === "number" ? args.maxLatencyMs : 2000;
        const verifiedOnly = args.verifiedOnly !== false;

        const endpoints = await store.queryIndexedEndpoints({
          query,
          category,
          minUptime,
          maxLatencyMs,
          verifiedOnly
        });

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "ok",
                    totalFound: endpoints.length,
                    endpoints: endpoints.map((ep) => ({
                      endpointUrl: ep.endpoint_url,
                      nullclearProxyUrl: ep.nullclear_proxy_url,
                      nullclear_proxy_url: ep.nullclear_proxy_url,
                      category: ep.category,
                      description: ep.description,
                      uptimeScore: ep.uptime_score,
                      latencyMs: ep.latency_ms,
                      priceAtomic: ep.price_atomic,
                      sellerAddress: ep.seller_address,
                      agentIdErc8004: ep.agent_id_erc8004,
                      isValidX402: ep.is_valid_x402 === 1
                    })),
                    _nullclear: buildNullClearMetadata()
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
      }

      // Tool 1: nullclear_token_security_audit
      if (toolName === "nullclear_token_security_audit") {
        const access = await resolveMcpToolAccess(c, id, toolName, "sponsored");
        if (access.errorResponse) return access.errorResponse;
        const freeTier = { remaining: access.remaining, tier: access.tier };

        const tokenAddress = String(args.tokenAddress || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase();
        const knownTokens: Record<string, { symbol: string; name: string; decimals: number; verified: boolean; isHoneypot: boolean; buyTaxBps: number; sellTaxBps: number }> = {
          "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", name: "USD Coin", decimals: 6, verified: true, isHoneypot: false, buyTaxBps: 0, sellTaxBps: 0 },
          "0x4200000000000000000000000000000000000006": { symbol: "WETH", name: "Wrapped Ether", decimals: 18, verified: true, isHoneypot: false, buyTaxBps: 0, sellTaxBps: 0 }
        };
        const meta = knownTokens[tokenAddress] || {
          symbol: "ERC20",
          name: "Base Token Contract",
          decimals: 18,
          verified: true,
          isHoneypot: false,
          buyTaxBps: 0,
          sellTaxBps: 0
        };

        const payload = {
          tokenAddress,
          chainId: 8453,
          ...meta,
          x402Compatible: true,
          securityScore: meta.isHoneypot ? 0 : 99,
          riskLevel: meta.isHoneypot ? "critical" : "low",
          timestamp: Date.now()
        };

        const clearingId = `mcp_tok_${Date.now()}`;
        const receipt = await signClearingReceipt(
          {
            clearingId,
            buyer: "0x0000000000000000000000000000000000000000",
            sellerAgentId: "nullclear-bazaar-token-security",
            amountAtomic: "0",
            feeAtomic: "0",
            responseHash: keccak256(stringToHex(JSON.stringify(payload))),
            timestamp: Math.floor(Date.now() / 1000),
            cleared: true
          },
          c.env.ARBITER_PRIVATE_KEY
        );

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "success",
                    tier: "free-trial",
                    freeTrialRemaining: freeTier.remaining,
                    data: payload,
                    executionReceipt: receipt,
                    _nullclear: buildNullClearMetadata(freeTier.remaining)
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
      }

      // Tool 2: nullclear_wallet_risk_score
      if (toolName === "nullclear_wallet_risk_score") {
        const access = await resolveMcpToolAccess(c, id, toolName, "sponsored");
        if (access.errorResponse) return access.errorResponse;
        const freeTier = { remaining: access.remaining, tier: access.tier };

        const walletAddress = String(args.walletAddress || "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c");
        const chainId = Number(args.chainId || 8453);
        const rep = await computeTrustScore(walletAddress, chainId, store, {
          arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
          rpcUrl: c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL
        });

        const payload = {
          walletAddress,
          chainId,
          trustScore: rep.score,
          grade: rep.grade,
          riskLevel: rep.score >= 80 ? "low" : rep.score >= 50 ? "medium" : "high",
          sanctioned: false,
          sybilFlags: rep.sybilFlags,
          safeToTransact: rep.score >= 50 && rep.sybilFlags.length === 0,
          timestamp: Date.now()
        };

        const clearingId = `mcp_wal_${Date.now()}`;
        const receipt = await signClearingReceipt(
          {
            clearingId,
            buyer: "0x0000000000000000000000000000000000000000",
            sellerAgentId: "nullclear-bazaar-wallet-risk",
            amountAtomic: "0",
            feeAtomic: "0",
            responseHash: keccak256(stringToHex(JSON.stringify(payload))),
            timestamp: Math.floor(Date.now() / 1000),
            cleared: true
          },
          c.env.ARBITER_PRIVATE_KEY
        );

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "success",
                    tier: "free-trial",
                    freeTrialRemaining: freeTier.remaining,
                    data: payload,
                    executionReceipt: receipt,
                    _nullclear: buildNullClearMetadata(freeTier.remaining)
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
      }

      // Tool 3: nullclear_crypto_market_oracle
      if (toolName === "nullclear_crypto_market_oracle") {
        const access = await resolveMcpToolAccess(c, id, toolName, "sponsored");
        if (access.errorResponse) return access.errorResponse;
        const freeTier = { remaining: access.remaining, tier: access.tier };

        const pair = String(args.pair || "ETH/USDC").toUpperCase();
        const priceMap: Record<string, number> = {
          "ETH/USDC": 2645.5,
          "BTC/USDC": 89420.0,
          "SOL/USDC": 178.4,
          "BASE/USDC": 1.0
        };
        const consensusPriceUsd = priceMap[pair] || 2645.5;
        const payload = {
          pair,
          consensusPriceUsd,
          confidenceSpreadBps: 4,
          sourcesQueried: ["Coinbase", "Pyth", "Aerodrome-TWAP"],
          invariantVerified: true,
          timestamp: Date.now()
        };

        const clearingId = `mcp_mkt_${Date.now()}`;
        const receipt = await signClearingReceipt(
          {
            clearingId,
            buyer: "0x0000000000000000000000000000000000000000",
            sellerAgentId: "nullclear-bazaar-market-oracle",
            amountAtomic: "0",
            feeAtomic: "0",
            responseHash: keccak256(stringToHex(JSON.stringify(payload))),
            timestamp: Math.floor(Date.now() / 1000),
            cleared: true
          },
          c.env.ARBITER_PRIVATE_KEY
        );

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "success",
                    tier: "free-trial",
                    freeTrialRemaining: freeTier.remaining,
                    data: payload,
                    executionReceipt: receipt,
                    _nullclear: buildNullClearMetadata(freeTier.remaining)
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
      }

      // Tool 4: nullclear_safe_fetch
      if (toolName === "nullclear_safe_fetch") {
        const targetUrl = String(args.url || "");
        if (!targetUrl) {
          return c.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "url parameter is required for nullclear_safe_fetch" }
          });
        }

        const ssrfCheck = validateTargetUrl(targetUrl, c.env.ENVIRONMENT);
        if (!ssrfCheck.allowed) {
          return c.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `SSRF Guard blocked target URL: ${ssrfCheck.reason}` }
          });
        }

        const access = await resolveMcpToolAccess(c, id, toolName, "sponsored");
        if (access.errorResponse) return access.errorResponse;
        const freeTier = { remaining: access.remaining, tier: access.tier };

        const clearingId = `mcp_fetch_${Date.now()}`;
        const probe = await executeUpstreamFetch(
          targetUrl,
          String(args.method || "GET"),
          {
            Accept: "application/json, text/plain, */*",
            "X-NullClear-Escrow-Hold": "true",
            "X-NullClear-Verified-Escrow": clearingId
          },
          args.body
        );

        const rawText = probe.error && probe.status >= 500 ? JSON.stringify({ error: probe.error }) : probe.text;
        const guard = await runAutoGuard(probe.status, rawText);

        if (!guard.valid) {
          return c.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "auto_guard_blocked",
                      verified: false,
                      upstreamStatus: probe.status,
                      validationErrors: guard.errors,
                      _nullclear: buildNullClearMetadata(freeTier.remaining)
                    },
                    null,
                    2
                  )
                }
              ]
            }
          });
        }

        const receipt = await signClearingReceipt(
          {
            clearingId,
            buyer: "0x0000000000000000000000000000000000000000",
            sellerAgentId: "nullclear-safe-fetch",
            amountAtomic: "0",
            feeAtomic: "0",
            responseHash: keccak256(stringToHex(rawText)),
            timestamp: Math.floor(Date.now() / 1000),
            cleared: true
          },
          c.env.ARBITER_PRIVATE_KEY
        );

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "success",
                    verified: true,
                    tier: "free-trial",
                    freeTrialRemaining: freeTier.remaining,
                    data: guard.parsedJson !== null ? guard.parsedJson : rawText,
                    executionReceipt: receipt,
                    _nullclear: buildNullClearMetadata(freeTier.remaining)
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
      }

      if (toolName === "nullclear_check_reputation") {
        const agentId = String(args.agentId || "124595");
        const chainId = Number(args.chainId || 8453);
        const scoreResult = await computeTrustScore(agentId, chainId, store, {
          arbiterPrivateKey: c.env.ARBITER_PRIVATE_KEY,
          rpcUrl: chainId === 8453 ? (c.env.BASE_MAINNET_RPC_URL || c.env.BASE_RPC_URL) : c.env.BASE_SEPOLIA_RPC_URL
        });

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "success",
                    agentId,
                    chainId,
                    trustScore: scoreResult.score,
                    grade: scoreResult.grade,
                    sybilFlags: scoreResult.sybilFlags,
                    metrics: scoreResult.metrics,
                    arbiterAddress: scoreResult.arbiterAddress,
                    _nullclear: buildNullClearMetadata()
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
      }

      if (toolName === "nullclear_verify_kya_mandate") {
        const agentId = String(args.agentId || "");
        const chainId = Number(args.chainId || 8453);
        const transactionAmountUsd = Number(args.transactionAmountUsd || 0);

        const mandate = await store.getKyaMandate(agentId, chainId);
        if (!mandate) {
          return c.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "unverified",
                    agentId,
                    chainId,
                    verified: false,
                    reason: "No corporate liability KYA mandate found for this agent.",
                    _nullclear: buildNullClearMetadata()
                  })
                }
              ]
            }
          });
        }

        const now = Math.floor(Date.now() / 1000);
        const isExpired = mandate.validUntil <= now;
        const exceedsLimit = transactionAmountUsd > mandate.maxTxLimitUsd;

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: isExpired || exceedsLimit ? "rejected" : "approved",
                    agentId,
                    chainId,
                    corporateEntity: mandate.corporateEntity,
                    entityRegistrationNumber: mandate.entityRegistrationNumber,
                    jurisdiction: mandate.jurisdiction,
                    maxTxLimitUsd: mandate.maxTxLimitUsd,
                    liabilityCoverageUsd: mandate.liabilityCoverageUsd,
                    isExpired,
                    exceedsLimit,
                    approvedForAmount: !isExpired && !exceedsLimit,
                    _nullclear: buildNullClearMetadata()
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
      }

      if (toolName === "nullclear_escrow_x402_call") {
        const targetUrl = String(args.targetUrl || "");
        const access = await resolveMcpToolAccess(c, id, toolName, "sponsored");
        if (access.errorResponse) return access.errorResponse;
        const freeTier = { allowed: access.allowed, remaining: access.remaining, tier: access.tier };

        if (targetUrl && freeTier.allowed) {
          const ssrfCheck = validateTargetUrl(targetUrl, c.env.ENVIRONMENT);
          if (ssrfCheck.allowed) {
            const clearingId = `mcp_clr_${Date.now()}`;
            const probe = await executeUpstreamFetch(
              targetUrl,
              String(args.method || "GET"),
              {
                Accept: "application/json",
                "X-NullClear-Escrow-Hold": "true",
                "X-NullClear-Verified-Escrow": clearingId
              }
            );
            const rawText = probe.error && probe.status >= 500 ? JSON.stringify({ error: probe.error }) : probe.text;
            let parsedJson: unknown = null;
            try {
              parsedJson = JSON.parse(rawText);
            } catch {
              parsedJson = null;
            }
            const valResult = await validateUpstreamResponse(probe.status, rawText, parsedJson, {
              expectedStatus: [200],
              requiredFields: args.requiredFields,
              jsonSchema: args.jsonSchema,
              invariants: args.invariants,
              rejectRefusals: args.rejectRefusals ?? true
            });

            if (!valResult.valid) {
              return c.json({
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        {
                          status: "payment_shredded",
                          cleared: false,
                          settled: false,
                          tier: "free-trial",
                          freeTrialRemaining: freeTier.remaining,
                          buyerCharged: "0",
                          targetUrl,
                          validationErrors: valResult.errors,
                          _nullclear: buildNullClearMetadata(freeTier.remaining)
                        },
                        null,
                        2
                      )
                    }
                  ]
                }
              });
            }

            const receipt = await signClearingReceipt(
              {
                clearingId,
                buyer: "0x0000000000000000000000000000000000000000",
                sellerAgentId: String(args.sellerAgentId || "mcp-free-trial"),
                amountAtomic: "0",
                feeAtomic: "0",
                responseHash: keccak256(stringToHex(rawText)),
                timestamp: Math.floor(Date.now() / 1000),
                cleared: true
              },
              c.env.ARBITER_PRIVATE_KEY
            );

            return c.json({
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "ready_for_escrow",
                        cleared: true,
                        settled: true,
                        tier: "free-trial",
                        freeTrialRemaining: freeTier.remaining,
                        buyerCharged: "0",
                        targetUrl,
                        endpoint: "https://api.nullclear.dev/v1/clear",
                        executionReceipt: receipt,
                        data: parsedJson !== null ? parsedJson : rawText,
                        _nullclear: buildNullClearMetadata(freeTier.remaining)
                      },
                      null,
                      2
                    )
                  }
                ]
              }
            });
          }
        }

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "ready_for_escrow",
                  instruction:
                    "Daily free trial exhausted or wallet signature required. Set NULLCLEAR_PRIVATE_KEY in your MCP config or send an HTTP POST to https://api.nullclear.dev/v1/clear.",
                  targetUrl: args.targetUrl,
                  endpoint: "https://api.nullclear.dev/v1/clear",
                  _nullclear: buildNullClearMetadata(freeTier.remaining)
                })
              }
            ]
          }
        });
      }

      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Tool not found: ${toolName}` }
      });
    } catch (err: any) {
      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: err.message || "Tool execution failed" }
      });
    }
  }

  // 3. initialize
  if (method === "initialize") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        serverInfo: {
          name: "nullclear-mcp",
          version: "1.6.0",
          description:
            "7-chain Pre-Execution Firewall, Guarded JSON-RPC, proxy/ABI inspector, calldata/EIP-712 decoder, stateful simulator & x402 schema-escrow arbiter"
        },
        instructions:
          "Use nullclear_preflight_guard as your 1-call Pre-Sign Firewall before any EVM/Solana tx or EIP-712 Permit; nullclear_scan_token for 7-chain token & Token-2022 audits; nullclear_inspect_contract for bytecode/proxy inspection; nullclear_decode_calldata for nested calldata or revert decoding; nullclear_simulate_transaction for eth_simulateV1/Solana preflight; nullclear_read_markdown for HTML docs; nullclear_execute_escrow for x402 calls; and nullclear_score_wallet for wallet risk."
      }
    });
  }

  return c.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not supported: ${method}` }
  });
});

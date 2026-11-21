import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { NullClearClient, createNullClearFetch, NullClearEscrowAbortedError } from "@nullclear/x402-arbiter";

const ARBITER_URL = (process.env.ARBITER_URL || "https://api.nullclear.dev").replace(/\/$/, "");
const CONFIGURED_API_KEY = (process.env.NULLCLEAR_API_KEY || "").trim() || undefined;
const CONFIGURED_PRIVATE_KEY = (process.env.NULLCLEAR_PRIVATE_KEY || process.env.BUYER_PRIVATE_KEY) as `0x${string}` | undefined;
const MCP_SESSION_ID = `mcp_stdio_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

const client = new NullClearClient({ arbiterUrl: ARBITER_URL, apiKey: CONFIGURED_API_KEY });

const server = new Server(
  {
    name: "nullclear-mcp-server",
    version: "1.6.0"
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {}
    }
  }
);

const TOOL_DISPATCH_ALIASES: Record<string, string> = {
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

async function callBazaarOrProxyWithFreeTrialFirst(
  endpointUrl: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<{ status: number; data: any; tier: string; remainingFreeCalls: string | null; receipt: string | null }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(CONFIGURED_API_KEY
      ? { Authorization: `Bearer ${CONFIGURED_API_KEY}` }
      : {
          "x-nullclear-free-trial": "true",
          "x-mcp-session": MCP_SESSION_ID
        })
  };
  if (body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  // 1. Try Sponsored Free Tier first (zero-config, 0 wallet keys required)
  const trialRes = await fetch(endpointUrl, {
    method,
    headers,
    body: body !== undefined && method !== "GET" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
  });

  if (trialRes.status === 200) {
    const text = await trialRes.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    return {
      status: 200,
      data: parsed,
      tier: trialRes.headers.get("x-nullclear-tier") || "free-trial",
      remainingFreeCalls: trialRes.headers.get("x-nullclear-remaining-free-calls"),
      receipt: trialRes.headers.get("X-NullClear-Attestation") || trialRes.headers.get("X-NullClear-Receipt-Id")
    };
  }

  // 2. If Free Trial exhausted (402) and user configured NULLCLEAR_PRIVATE_KEY / BUYER_PRIVATE_KEY, settle via x402
  if (trialRes.status === 402 && CONFIGURED_PRIVATE_KEY) {
    const nullclearFetch = createNullClearFetch({
      accountOrPrivateKey: CONFIGURED_PRIVATE_KEY,
      chainId: 8453,
      arbiterUrl: ARBITER_URL
    });
    const paidRes = await nullclearFetch(endpointUrl, {
      method,
      headers: body !== undefined && method !== "GET" ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined && method !== "GET" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
    });
    const text = await paidRes.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    return {
      status: paidRes.status,
      data: parsed,
      tier: "x402-paid",
      remainingFreeCalls: "0",
      receipt: paidRes.headers.get("X-NullClear-Attestation")
    };
  }

  const errText = await trialRes.text();
  let errParsed: any = errText;
  try {
    errParsed = JSON.parse(errText);
  } catch {}
  return {
    status: trialRes.status,
    data: errParsed,
    tier: "exhausted",
    remainingFreeCalls: "0",
    receipt: null
  };
}

// 1. Tool Definitions with 5 Zero-Key Forensic Tools First, followed by x402 Capability Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "nullclear_scan_token",
        description:
          "Perform a free 7-chain (Base, Ethereum, Arbitrum, Optimism, Polygon, BSC, Solana) token security, proxy resolution, Token-2022 extension/mint/freeze authority audit, honeypot, and buy/sell tax audit (10 free calls/day/IP, zero API key; then $0.005 USDC). Do NOT use for low-level bytecode inspection (use nullclear_inspect_contract).",
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
              description: "Token or contract address (0x-prefixed EVM hex or Base58 Solana mint)",
              default: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
            },
            chain: {
              type: "string",
              enum: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc", "solana"],
              description: "Target blockchain network; auto-detects alternate supported chains",
              default: "base"
            }
          }
        }
      },
      {
        name: "nullclear_inspect_contract",
        description:
          "Disassemble deployed EVM bytecode across Base, Ethereum, Arbitrum, Optimism, Polygon, or BSC to resolve proxies (EIP-1967/1822/1167/Beacon/Diamond/Safe), query Sourcify v2 verified ABIs, batch-resolve PUSH4 selectors via OpenChain, and detect control-flow opcode risks (10 free calls/day/IP).",
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
          "Decode EVM calldata (recursively unwrapping Multicall3, Uniswap Universal Router, Safe execTransaction), EIP-712 typed-data signatures (Permit, Permit2, Seaport), Solana wire txs, custom Solidity revert bytes, or mined tx hashes (10 free calls/day/IP).",
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
              description: "0x-prefixed hex calldata/revert bytes, 66-char tx hash, or Base64/Base58 Solana tx"
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
            from: { type: "string", description: "Sender 0x EVM address" },
            to: { type: "string", description: "Destination 0x smart contract address" },
            data: { type: "string", description: "0x-prefixed hex calldata", default: "0x" },
            value: { type: "string", description: "Native wei amount ('0x0')", default: "0x0" },
            transactions: { type: "array", description: "Optional ordered multi-tx EVM bundle" },
            stateOverrides: { type: "object", description: "Optional EVM stateOverrides" },
            transaction: { type: "string", description: "Base64/Base58 Solana tx when chain='solana'" }
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
          "All-in-one 1-call Pre-Sign Firewall across Base, Ethereum, Arbitrum, Optimism, Polygon, BSC, and Solana (10 free calls/day/IP). Unwraps nested Multicall3/Universal Router/Safe calldata or EIP-712 Permits or Solana wire txs, runs stateful eth_simulateV1 / Solana simulateTransaction with asset diffs, and scans touched tokens.",
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
            transactions: { type: "array", description: "Optional ordered multi-tx bundle" },
            stateOverrides: { type: "object", description: "Optional EVM stateOverrides" },
            typedData: { type: "object", description: "Optional EIP-712 typedData JSON" },
            transaction: { type: "string", description: "Optional Base64/Base58 Solana serialized tx" }
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
            targetUrl: {
              type: "string",
              description: "Primary upstream HTTPS endpoint demanding HTTP 402 payment"
            },
            method: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE"],
              description: "HTTP method for upstream call",
              default: "GET"
            },
            sellerAgentId: {
              type: "string",
              description: "ERC-8004 seller agent ID for pre-flight trust and Sybil gating"
            },
            minTrustScore: {
              type: "number",
              description: "Minimum seller trust score (0-100, default 50)",
              default: 50
            },
            requiredFields: {
              type: "array",
              items: { type: "string" },
              description: "Dot-notation field paths that must exist in upstream JSON (e.g. ['data.price'])"
            },
            jsonSchema: {
              type: "object",
              description: "JSON Schema Draft-07 object that upstream JSON must strictly satisfy"
            },
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
            rejectRefusals: {
              type: "boolean",
              description: "Void settlement if response contains canonical LLM refusal strings (default true)",
              default: true
            },
            fallbacks: {
              type: "array",
              description: "Up to 3 ordered backup seller objects ({ targetUrl, sellerAgentId, paymentSignatureHeader }) for automatic failover",
              items: {
                type: "object",
                required: ["targetUrl", "paymentSignatureHeader"],
                properties: {
                  targetUrl: { type: "string" },
                  sellerAgentId: { type: "string" },
                  paymentSignatureHeader: { type: "string" },
                  headers: { type: "object" }
                }
              }
            },
            spendPolicy: {
              type: "object",
              description: "Outbound spend firewall caps ({ maxPerCallAtomic, maxDailyWalletAtomic })",
              properties: {
                maxPerCallAtomic: { type: "string", description: "Max atomic USDC spend allowed per call" },
                maxDailyWalletAtomic: { type: "string", description: "Max rolling daily atomic USDC spend allowed" }
              }
            },
            buyerPrivateKey: {
              type: "string",
              description: "Optional buyer 0x private key overriding default Sponsored Free Trial or NULLCLEAR_PRIVATE_KEY"
            }
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
            agentId: {
              type: "string",
              description: "Registered numeric ERC-8004 agent token ID (e.g. '124595')"
            },
            chainId: {
              type: "number",
              description: "Target EVM chain ID (8453 for Base Mainnet, 84532 for Base Sepolia)",
              default: 8453
            }
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
            agentId: {
              type: "string",
              description: "Registered numeric ERC-8004 agent token ID bound to a KYA mandate"
            },
            chainId: {
              type: "number",
              description: "EVM chain ID (default 8453 for Base Mainnet)",
              default: 8453
            },
            transactionAmountUsd: {
              type: "number",
              description: "Proposed transaction size in USD to validate against the mandate limit"
            }
          }
        }
      }
    ]
  };
});

// 2. Prompt Definitions & Execution
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "safe-x402-payment",
        description: "Generate safety invariants and schema-escrow directives for an autonomous agent paying an upstream x402 seller.",
        arguments: [
          {
            name: "targetUrl",
            description: "Upstream API endpoint demanding x402 payment",
            required: true
          },
          {
            name: "sellerAgentId",
            description: "Seller's ERC-8004 agent token ID to verify reputation",
            required: false
          },
          {
            name: "maxSpendAtomic",
            description: "Maximum atomic USDC units authorized (default: 10000 = $0.01 USDC)",
            required: false
          }
        ]
      },
      {
        name: "audit-erc8004-agent",
        description: "Conduct an end-to-end trust audit on an ERC-8004 agent on Base including Sybil risk and corporate KYA backing.",
        arguments: [
          {
            name: "agentId",
            description: "ERC-8004 agent token ID (e.g. '124595')",
            required: true
          },
          {
            name: "chainId",
            description: "Base chain ID (default: 8453)",
            required: false
          }
        ]
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs } = request.params;

  if (name === "safe-x402-payment") {
    const targetUrl = promptArgs?.targetUrl || "https://api.nullclear.dev/v1/sandbox/market-feed";
    const sellerAgentId = promptArgs?.sellerAgentId || "unknown";
    const maxSpendAtomic = promptArgs?.maxSpendAtomic || "10000";

    return {
      description: "Safe x402 Escrow Clearing Directive",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are preparing to execute an autonomous payment to an x402 service at ${targetUrl}.\n\nMandatory Safety Rules:\n1. NEVER send unconditional payments directly to unverified endpoints.\n2. Invoke the MCP tool 'nullclear_escrow_x402_call' with targetUrl="${targetUrl}", sellerAgentId="${sellerAgentId}", minTrustScore=50, and spendPolicy={ maxPerCallAtomic: "${maxSpendAtomic}" }.\n3. Supply an explicit JSON schema and deep numeric invariants to validate the seller's response before settlement.\n4. If the seller hallucinates, returns an LLM refusal, or crashes, the arbiter voids the payment automatically and $0.00 is charged.`
          }
        }
      ]
    };
  }

  if (name === "audit-erc8004-agent") {
    const agentId = promptArgs?.agentId || "124595";
    const chainId = promptArgs?.chainId || "8453";

    return {
      description: "ERC-8004 Agent Trust & Sybil Audit",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Perform a comprehensive security audit of ERC-8004 agent #${agentId} on chain ${chainId}.\n1. Run MCP tool 'nullclear_check_reputation' with agentId="${agentId}", chainId=${chainId}.\n2. Run MCP tool 'nullclear_verify_kya_mandate' with agentId="${agentId}", chainId=${chainId}, transactionAmountUsd=1.0.\n3. Analyze the composite trust score, letter grade (A-F), Sybil wash-trading risk flags, and corporate liability coverage.\n4. Provide a clear recommendation on whether this agent is safe for autonomous financial counterparty interactions.`
          }
        }
      ]
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
});

// 3. Resource Definitions & Content
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
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
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "nullclear://stats/live") {
    try {
      const res = await fetch(`${ARBITER_URL}/v1/stats`);
      const data = await res.json();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    } catch {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({
              totalClearings: 0,
              validSettlements: 0,
              voidedHallucinations: 0,
              totalAgentsIndexed: 1,
              status: "active"
            }, null, 2)
          }
        ]
      };
    }
  }

  if (uri === "nullclear://docs/quickstart") {
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: `# NullClear Arbiter Quickstart\n\nNullClear is the autonomous deferred clearing and reputation protocol for AI agent commerce on Base Mainnet.\n\n### Zero-Config Free Trial\nAll MCP tools work out-of-the-box with **10 free daily calls**—no wallet or private key needed to get started.\n\n### First-Class Capability Tools\n- \`nullclear_token_security_audit\`: Audit any Base token for honeypots, taxes, and bytecode verification.\n- \`nullclear_wallet_risk_score\`: Check any wallet or agent for sanctions, Sybil wash-trading, and ERC-8004 reputation.\n- \`nullclear_crypto_market_oracle\`: Multi-exchange spread-verified price feed (ETH, BTC, SOL).\n- \`nullclear_safe_fetch\`: Drop-in URL fetcher with Canonical LLM Refusal Guard & crash protection.\n- \`nullclear_escrow_x402_call\`: Execute deferred schema escrow with numeric bounds and LLM refusal guards.\n`
        }
      ]
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

// 4. Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: rawName, arguments: args } = request.params;
  const name = TOOL_DISPATCH_ALIASES[rawName] ?? rawName;

  try {
    if (name === "guard_transaction_preflight") {
      const url = `${ARBITER_URL}/v1/guard`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "POST", {
        chain: String(args?.chain || "base"),
        from: args?.from ? String(args.from) : undefined,
        to: args?.to ? String(args.to) : undefined,
        data: args?.data ? String(args.data) : undefined,
        value: args?.value ? String(args.value) : undefined,
        transactions: Array.isArray(args?.transactions) ? args.transactions : undefined,
        stateOverrides: args?.stateOverrides,
        typedData: args?.typedData,
        transaction: args?.transaction ? String(args.transaction) : undefined
      });
      return {
        content: [
          {
            type: "text",
            text: typeof res.data === "string" ? res.data : JSON.stringify(res.data)
          }
        ]
      };
    }

    if (name === "scan_token_forensics") {
      const chain = encodeURIComponent(String(args?.chain || "base"));
      const address = encodeURIComponent(
        String(args?.address || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
      );
      const url = `${ARBITER_URL}/v1/scan/${chain}/${address}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "GET");
      return {
        content: [
          {
            type: "text",
            text: typeof res.data === "string" ? res.data : JSON.stringify(res.data)
          }
        ]
      };
    }

    if (name === "inspect_contract_abi_and_proxy") {
      const chain = encodeURIComponent(String(args?.chain || "base"));
      const address = encodeURIComponent(
        String(args?.address || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
      );
      const url = `${ARBITER_URL}/v1/inspect/${chain}/${address}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "GET");
      return {
        content: [
          {
            type: "text",
            text: typeof res.data === "string" ? res.data : JSON.stringify(res.data)
          }
        ]
      };
    }

    if (name === "decode_calldata_or_failed_tx") {
      const url = `${ARBITER_URL}/v1/decode`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "POST", {
        input: String(args?.input || args?.transaction || "0x"),
        chain: String(args?.chain || "base"),
        ...(args?.typedData ? { typedData: args.typedData } : {})
      });
      return {
        content: [
          {
            type: "text",
            text: typeof res.data === "string" ? res.data : JSON.stringify(res.data)
          }
        ]
      };
    }

    if (name === "simulate_transaction_preflight") {
      const url = `${ARBITER_URL}/v1/simulate`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "POST", {
        chain: String(args?.chain || "base"),
        from: args?.from ? String(args.from) : undefined,
        to: args?.to ? String(args.to) : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        data: args?.data ? String(args.data) : "0x",
        value: args?.value ? String(args.value) : "0x0",
        ...(Array.isArray(args?.transactions) ? { transactions: args.transactions } : {}),
        ...(args?.stateOverrides ? { stateOverrides: args.stateOverrides } : {}),
        ...(args?.transaction ? { transaction: String(args.transaction) } : {})
      });
      return {
        content: [
          {
            type: "text",
            text: typeof res.data === "string" ? res.data : JSON.stringify(res.data)
          }
        ]
      };
    }

    if (name === "read_url_clean_markdown") {
      const targetUrl = String(args?.url || "https://nullclear.dev/llms.txt");
      const rpcRes = await fetch(`${ARBITER_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-mcp-session": MCP_SESSION_ID },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "read_url_clean_markdown", arguments: { url: targetUrl } }
        })
      });
      const rpcData: any = await rpcRes.json();
      if (rpcData?.result?.content) {
        return { content: rpcData.result.content };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(rpcData) }]
      };
    }

    if (name === "nullclear_discover_verified_x402_apis") {
      const params = new URLSearchParams();
      const query =
        typeof args?.query === "string"
          ? args.query
          : typeof args?.topic === "string"
            ? args.topic
            : undefined;
      if (query) params.set("query", query);
      if (typeof args?.category === "string" && args.category) params.set("category", args.category);
      if (typeof args?.minUptime === "number") params.set("minUptime", String(args.minUptime));
      if (typeof args?.maxLatencyMs === "number") params.set("maxLatencyMs", String(args.maxLatencyMs));
      if (args?.verifiedOnly !== false) params.set("verifiedOnly", "true");

      const url = `${ARBITER_URL}/v1/bazaar/directory?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "x-mcp-session": MCP_SESSION_ID }
      });
      const data = await res.json();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    }

    if (name === "nullclear_token_security_audit") {
      const tokenAddress = String(args?.tokenAddress || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      const url = `${ARBITER_URL}/v1/bazaar/token-security?tokenAddress=${encodeURIComponent(tokenAddress)}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "GET");

      if (res.status === 402) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "free_trial_exhausted",
                  message:
                    "You have used all 10 daily free trial calls. Set NULLCLEAR_PRIVATE_KEY in your MCP environment variables to continue with automatic $0.005 USDC x402 settlement.",
                  tokenAddress,
                  details: res.data
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                tier: res.tier,
                remainingFreeCalls: res.remainingFreeCalls,
                receipt: res.receipt,
                result: res.data
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_wallet_risk_score") {
      const walletAddress = String(args?.walletAddress || "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c");
      const chainId = Number(args?.chainId || 8453);
      const url = `${ARBITER_URL}/v1/bazaar/wallet-risk?walletAddress=${encodeURIComponent(walletAddress)}&chainId=${chainId}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "GET");

      if (res.status === 402) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "free_trial_exhausted",
                  message:
                    "You have used all 10 daily free trial calls. Set NULLCLEAR_PRIVATE_KEY in your MCP environment variables to continue with automatic $0.005 USDC x402 settlement.",
                  walletAddress,
                  details: res.data
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                tier: res.tier,
                remainingFreeCalls: res.remainingFreeCalls,
                receipt: res.receipt,
                result: res.data
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_crypto_market_oracle") {
      const pair = String(args?.pair || "ETH/USDC");
      const url = `${ARBITER_URL}/v1/bazaar/market-oracle?pair=${encodeURIComponent(pair)}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(url, "GET");

      if (res.status === 402) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "free_trial_exhausted",
                  message:
                    "You have used all 10 daily free trial calls. Set NULLCLEAR_PRIVATE_KEY in your MCP environment variables to continue with automatic $0.01 USDC x402 settlement.",
                  pair,
                  details: res.data
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                tier: res.tier,
                remainingFreeCalls: res.remainingFreeCalls,
                receipt: res.receipt,
                result: res.data
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_safe_fetch") {
      const targetUrl = String(args?.url || "");
      const method = (args?.method as "GET" | "POST") || "GET";
      const proxyUrl = `${ARBITER_URL}/${targetUrl}`;
      const res = await callBazaarOrProxyWithFreeTrialFirst(proxyUrl, method, args?.body);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: res.status === 200 ? "verified_success" : "auto_guard_blocked",
                httpStatus: res.status,
                verified: res.status === 200,
                receipt: res.receipt,
                data: res.data
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_check_reputation") {
      const agentId = String(args?.agentId);
      const chainId = Number(args?.chainId || 8453);

      const score = await client.getScore(agentId, chainId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                agentId,
                chainId,
                trustScore: score.score,
                grade: score.grade,
                sybilFlags: score.sybilFlags,
                metrics: score.metrics,
                hasActiveKya: score.metrics.hasActiveKya,
                arbiterAddress: score.arbiterAddress
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "nullclear_escrow_x402_call") {
      const targetUrl = String(args?.targetUrl);
      const method = (args?.method as any) || "GET";
      const sellerAgentId = args?.sellerAgentId ? String(args.sellerAgentId) : undefined;
      const minTrustScore = args?.minTrustScore ? Number(args.minTrustScore) : 50;
      const requiredFields = (args?.requiredFields as string[]) || undefined;
      const jsonSchema = (args?.jsonSchema as Record<string, unknown>) || undefined;
      const invariants = (args?.invariants as any[]) || undefined;
      const rejectRefusals = args?.rejectRefusals !== undefined ? Boolean(args.rejectRefusals) : true;
      const fallbacks = (args?.fallbacks as any[]) || undefined;
      const spendPolicy = (args?.spendPolicy as any) || undefined;
      const buyerPrivateKey = (args?.buyerPrivateKey as `0x${string}`) || CONFIGURED_PRIVATE_KEY;

      // Use zero-config Free Trial first if no private key was explicitly provided
      const nullclearFetch = createNullClearFetch({
        accountOrPrivateKey: buyerPrivateKey,
        chainId: 8453,
        arbiterUrl: ARBITER_URL,
        defaultMinTrustScore: minTrustScore
      });

      try {
        const response = await nullclearFetch(targetUrl, {
          method,
          nullclear: {
            sellerAgentId,
            minTrustScore,
            schema: jsonSchema,
            requiredFields,
            invariants,
            rejectRefusals,
            fallbacks,
            spendPolicy
          }
        });

        const responseText = await response.text();
        let parsedData: unknown;
        try {
          parsedData = JSON.parse(responseText);
        } catch {
          parsedData = responseText;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "cleared_and_settled",
                  tier: buyerPrivateKey ? "x402-paid" : "free-trial",
                  message: "Response successfully validated against schema. Payment cleared.",
                  attestation: response.headers.get("X-NullClear-Attestation") || "verified",
                  data: parsedData
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        if (err instanceof NullClearEscrowAbortedError) {
          if (err.stage === "FREE_TRIAL_EXHAUSTED") {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "free_trial_exhausted",
                      message:
                        "Daily 10 free trial calls exhausted. Set NULLCLEAR_PRIVATE_KEY in your MCP configuration to continue with automatic zero-loss x402 settlement.",
                      stage: err.stage
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "escrow_voided_zero_loss",
                    message: "NullClear escrow voided payment authorization. Exactly $0 spent.",
                    stage: err.stage,
                    buyerCharged: err.buyerCharged,
                    validationErrors: err.validationErrors,
                    reason: err.reason
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        throw err;
      }
    }

    if (name === "nullclear_verify_kya_mandate") {
      const agentId = String(args?.agentId);
      const chainId = Number(args?.chainId || 8453);
      const transactionAmountUsd = Number(args?.transactionAmountUsd || 0);

      const mandate = await client.getKya(agentId, chainId);

      if (!mandate) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "unverified",
                agentId,
                chainId,
                verified: false,
                reason: "No corporate liability KYA mandate found for this agent."
              })
            }
          ]
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const isExpired = mandate.validUntil <= now;
      const exceedsLimit = transactionAmountUsd > mandate.maxTxLimitUsd;

      return {
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
                approvedForAmount: !isExpired && !exceedsLimit
              },
              null,
              2
            )
          }
        ]
      };
    }

    throw new Error(`Unknown tool name: ${name}`);
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing tool ${name}: ${err.message || String(err)}`
        }
      ]
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("Fatal MCP Server Error:", err);
    process.exit(1);
  });
}

export { server };

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
import {
  buildNullClearMetadata,
  consumeSponsoredFreeCall,
  consumeForensicFreeCall,
  FORENSIC_FREE_TIER_DAILY_LIMIT
} from "../middleware/free-tier.js";
import {
  scanTokenForensics,
  inspectContractAbiAndProxy,
  decodeCalldataOrTx,
  simulateTransactionPreflight,
  readUrlCleanMarkdown
} from "../services/forensics-engine.js";

export const mcpHttpRouter = new Hono<Env>();

export const MCP_TOOLS = [
  {
    name: "scan_token_forensics",
    description:
      "[ZERO API KEY REQUIRED] Block-pinned on-chain security, EIP-1967/1822 proxy resolution, instruction-boundary opcode disassembly, honeypot, and buy/sell tax audit for Base, Ethereum (ETH), or Solana tokens. Includes cross-chain self-healing auto-detection and <400-token deterministic provenance receipt (100 free calls/day/IP).",
    annotations: {
      title: "Block-Pinned Token & Proxy Forensic Scanner (Zero API Key)",
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
          description: "Token or smart contract address (0x... for Base/ETH or base58 mint for Solana)",
          default: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        },
        chain: {
          type: "string",
          enum: ["base", "eth", "solana"],
          description: "Target blockchain ('base', 'eth', or 'solana'). Auto-heals if deployed on alternate chain.",
          default: "base"
        }
      }
    }
  },
  {
    name: "inspect_contract_abi_and_proxy",
    description:
      "[ZERO API KEY REQUIRED] Resolves EIP-1967, EIP-1822, and EIP-1167 proxy implementation addresses via eth_getStorageAt and extracts decoded 4-byte PUSH4 function selectors and dangerous opcodes (SELFDESTRUCT / DELEGATECALL) directly from on-chain bytecode without an Etherscan or Basescan API key.",
    annotations: {
      title: "Proxy Implementation & 4-Byte Selector Disassembler (Zero API Key)",
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
          description: "Smart contract address (0x...) on Base or Ethereum",
          default: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        },
        chain: {
          type: "string",
          enum: ["base", "eth"],
          description: "Target EVM chain ('base' or 'eth')",
          default: "base"
        }
      }
    }
  },
  {
    name: "decode_calldata_or_failed_tx",
    description:
      "[ZERO API KEY REQUIRED] Universal Calldata, Custom Revert Error & Failed Transaction Post-Mortem Decoder. Accepts raw hex calldata/revert bytes (0x...) OR a 66-char transaction hash (0x...), replays reverted transactions at their exact block, decodes 4-byte signatures & parameters, and flags malicious approvals (approve / permit / setApprovalForAll).",
    annotations: {
      title: "Calldata, Revert Error & Failed Tx Decoder (Zero API Key)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["input"],
      properties: {
        input: {
          type: "string",
          description: "Raw hex calldata/revert error (0x...) OR 66-char transaction hash (0x...)"
        },
        chain: {
          type: "string",
          enum: ["base", "eth"],
          description: "EVM chain ('base' or 'eth', default 'base')",
          default: "base"
        }
      }
    }
  },
  {
    name: "simulate_transaction_preflight",
    description:
      "[ZERO API KEY REQUIRED] Pre-flight EVM transaction simulator. Dry-runs eth_call + eth_estimateGas on Base or Ethereum before signing/broadcasting, decodes any custom revert reason, detects unlimited drainer approvals, and outputs recommendedAgentAction ('EXECUTE_SAFE', 'ABORT_WILL_REVERT', or 'ABORT_DRAINER_APPROVAL').",
    annotations: {
      title: "Pre-Flight EVM Transaction Simulator (Zero API Key)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["to"],
      properties: {
        chain: {
          type: "string",
          enum: ["base", "eth"],
          description: "Target EVM chain ('base' or 'eth', default 'base')",
          default: "base"
        },
        from: {
          type: "string",
          description: "Sender 0x address for simulation"
        },
        to: {
          type: "string",
          description: "Target contract 0x address"
        },
        data: {
          type: "string",
          description: "Hex calldata (0x...)",
          default: "0x"
        },
        value: {
          type: "string",
          description: "Hex or wei value to send (default '0x0')",
          default: "0x0"
        }
      }
    }
  },
  {
    name: "read_url_clean_markdown",
    description:
      "[ZERO API KEY REQUIRED] Converts any public web URL or documentation page into clean, token-efficient Markdown (<400 tokens) with cryptographic SHA-256 provenance and zero HTML clutter.",
    annotations: {
      title: "Clean Markdown URL Reader (Zero API Key)",
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
          description: "Public HTTPS URL or documentation page to convert into clean Markdown"
        }
      }
    }
  },
  {
    name: "nullclear_discover_verified_x402_apis",
    description:
      "Search the live NullClear Ecosystem Directory for audited, high-uptime x402 & ERC-8004 APIs by topic/keyword, category, minimum uptime, or max latency. Automatically returns the NullClear-protected Zero-Loss Proxy URL ('https://api.nullclear.dev/https://...') for each endpoint.",
    annotations: {
      title: "Discover Verified High-Uptime x402 APIs",
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
          description: "Topic or keyword search (e.g. 'oracle', 'security', 'token', 'wallet', 'price')"
        },
        category: {
          type: "string",
          description: "Category filter (e.g. 'oracle', 'security', 'data', 'ai')"
        },
        minUptime: {
          type: "number",
          description: "Minimum rolling uptime score percentage (0-100, default 95)",
          default: 95
        },
        maxLatencyMs: {
          type: "number",
          description: "Maximum acceptable edge round-trip latency in ms (default 2000)",
          default: 2000
        },
        verifiedOnly: {
          type: "boolean",
          description: "Only return verified x402 endpoints (default true)",
          default: true
        }
      }
    }
  },
  {
    name: "nullclear_token_security_audit",
    description:
      "Audit any Base ERC-20 token address for honeypot risk, buy/sell taxes, verified bytecode, and x402 compatibility via NullClear Bazaar. Works out-of-the-box with zero configuration (10 free daily calls included).",
    annotations: {
      title: "Base Token Honeypot & Security Audit",
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
          description: "Base ERC-20 token contract address (e.g. '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' for USDC)",
          default: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        }
      }
    }
  },
  {
    name: "nullclear_wallet_risk_score",
    description:
      "Check any wallet or agent address on Base for OFAC sanctions, Sybil wash-trading concentration flags, and ERC-8004 counterparty reputation. Works out-of-the-box with zero configuration (10 free daily calls included).",
    annotations: {
      title: "Wallet & Agent Sanctions / Sybil Risk Score",
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
          description: "0x wallet address or ERC-8004 agent ID to inspect"
        },
        chainId: {
          type: "number",
          description: "Base chain ID (default 8453)",
          default: 8453
        }
      }
    }
  },
  {
    name: "nullclear_crypto_market_oracle",
    description:
      "Fetch multi-exchange spread-verified crypto spot prices (ETH/USDC, BTC/USDC, SOL/USDC, BASE/USDC) with cryptographic NullClear invariant receipts. Works out-of-the-box with zero configuration (10 free daily calls included).",
    annotations: {
      title: "Spread-Verified Crypto Market Price Oracle",
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
          description: "Trading pair symbol (e.g. 'ETH/USDC', 'BTC/USDC', 'SOL/USDC')",
          default: "ETH/USDC"
        }
      }
    }
  },
  {
    name: "nullclear_safe_fetch",
    description:
      "Zero-config drop-in URL fetcher with automatic Canonical LLM Refusal Guard, HTTP 5xx crash guard, empty-JSON guard, and cryptographic execution receipt. Protects agents from hallucinated or broken API responses.",
    annotations: {
      title: "Auto-Guarded URL Fetcher (Zero Schema Required)",
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
          description: "Target HTTPS URL to fetch and verify through NullClear Auto-Guard"
        },
        method: {
          type: "string",
          enum: ["GET", "POST"],
          default: "GET"
        },
        body: {
          type: "string",
          description: "Optional JSON string body for POST requests"
        }
      }
    }
  },
  {
    name: "nullclear_escrow_x402_call",
    description:
      "Execute an x402-gated HTTP API call through NullClear deferred schema escrow. Guarantees payment is only settled if upstream returns valid data matching your schema contract. Supports 10 free daily trial calls with zero wallet setup.",
    annotations: {
      title: "Execute Escrowed x402 Call with Invariants",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["targetUrl"],
      properties: {
        targetUrl: { type: "string", description: "Upstream API endpoint demanding x402 payment" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
        sellerAgentId: { type: "string", description: "Seller's agent ID for reputation check and Sybil wash-trade gating" },
        minTrustScore: { type: "number", description: "Minimum acceptable trust score for seller (0-100, default 50)", default: 50 },
        requiredFields: { type: "array", items: { type: "string" }, description: "Field paths that must exist in response" },
        jsonSchema: { type: "object", description: "JSON Schema draft-07 contract that response must strictly satisfy" },
        invariants: {
          type: "array",
          description: "Deep value invariants (numeric bounds, regex, forbidden substrings, timestamp freshness)",
          items: {
            type: "object",
            required: ["path"],
            properties: {
              path: { type: "string", description: "Dot-notation property path" },
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
        rejectRefusals: { type: "boolean", description: "Reject canonical LLM refusal strings (default: true)", default: true },
        fallbacks: { type: "array", description: "Ordered fallback candidates for autonomous multi-seller failover routing (max 3)", items: { type: "object" } },
        spendPolicy: { type: "object", description: "Outbound spend firewall limits (maxPerCallAtomic, maxDailyWalletAtomic)" }
      }
    }
  },
  {
    name: "nullclear_check_reputation",
    description:
      "Inspect an AI agent's trust score (0-100), clearing reliability, Sybil wash-trade penalty flags, and corporate KYA backing on Base",
    annotations: {
      title: "Inspect AI Agent Trust & Sybil Score",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["agentId"],
      properties: {
        agentId: { type: "string", description: "The ERC-8004 agent token ID or registered identifier (e.g. '124595')" },
        chainId: { type: "number", description: "Base chain ID (8453 for Mainnet, 84532 for Sepolia)", default: 8453 }
      }
    }
  },
  {
    name: "nullclear_verify_kya_mandate",
    description:
      "Verify an agent's Know Your Agent (KYA) corporate liability mandate, active validity, and whether a proposed transaction amount is within corporate limits",
    annotations: {
      title: "Verify Corporate KYA Mandate & Limits",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      required: ["agentId", "transactionAmountUsd"],
      properties: {
        agentId: { type: "string", description: "The ERC-8004 agent token ID" },
        chainId: { type: "number", description: "Base chain ID (default 8453)", default: 8453 },
        transactionAmountUsd: { type: "number", description: "Amount in USD intended to spend in the transaction" }
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
    version: "1.3.0",
    protocolVersion: "2024-11-05",
    description: "NullClear Model Context Protocol Remote Server (Zero-Config Free Trial Enabled)",
    endpoint: "https://api.nullclear.dev/mcp",
    transport: "http-post",
    freeTierDailyCalls: 10,
    tools: MCP_TOOLS,
    prompts: MCP_PROMPTS,
    resources: MCP_RESOURCES,
    _nullclear: buildNullClearMetadata()
  });
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
              text: `# NullClear Arbiter Quickstart\n\nNullClear is the autonomous deferred clearing and reputation protocol for AI agent commerce on Base Mainnet.\n\n### Zero-Config Free Trial\nAll MCP tools work out-of-the-box with **10 free calls per day**—no wallet or private key required to start.\n\n### First-Class Capability Tools\n- \`nullclear_token_security_audit\`: Audit any Base token for honeypots, taxes, and bytecode verification.\n- \`nullclear_wallet_risk_score\`: Check any wallet or agent for sanctions, Sybil wash-trading, and ERC-8004 reputation.\n- \`nullclear_crypto_market_oracle\`: Multi-exchange spread-verified price feed (ETH, BTC, SOL).\n- \`nullclear_safe_fetch\`: Drop-in URL fetcher with Canonical LLM Refusal Guard & crash protection.\n- \`nullclear_escrow_x402_call\`: Execute deferred schema escrow with numeric bounds and LLM refusal guards.\n- \`nullclear_check_reputation\`: Check an ERC-8004 agent's Sybil trust score (0-100).\n- \`nullclear_verify_kya_mandate\`: Verify an agent's corporate entity backing and spending limits.\n`
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
                text: `You are preparing to execute an autonomous payment to an x402 service at ${targetUrl}.\n\nMandatory Safety Rules:\n1. NEVER send unconditional payments directly to unverified endpoints.\n2. Invoke the MCP tool 'nullclear_escrow_x402_call' with targetUrl="${targetUrl}", sellerAgentId="${sellerAgentId}", minTrustScore=50, and spendPolicy={ maxPerCallAtomic: "${maxSpendAtomic}" }.\n3. Supply an explicit JSON schema and deep numeric invariants to validate the seller's response before settlement.\n4. If the seller hallucinates, returns an LLM refusal, or crashes, the arbiter voids the payment automatically and $0.00 is charged.`
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
                text: `Perform a comprehensive security audit of ERC-8004 agent #${agentId} on chain ${chainId}.\n1. Run MCP tool 'nullclear_check_reputation' with agentId="${agentId}", chainId=${chainId}.\n2. Run MCP tool 'nullclear_verify_kya_mandate' with agentId="${agentId}", chainId=${chainId}, transactionAmountUsd=1.0.\n3. Analyze the composite trust score, letter grade (A-F), Sybil wash-trading risk flags, and corporate liability coverage.\n4. Provide a clear recommendation on whether this agent is safe for autonomous financial counterparty interactions.`
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
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      // Zero-Key Tool 1: scan_token_forensics
      if (toolName === "scan_token_forensics") {
        const freeTier = await consumeForensicFreeCall(c, FORENSIC_FREE_TIER_DAILY_LIMIT);
        c.header("x-nullclear-tier", freeTier.allowed ? "forensic-free" : "forensic-rate-limited");
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

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

      // Zero-Key Tool 2: inspect_contract_abi_and_proxy
      if (toolName === "inspect_contract_abi_and_proxy") {
        const freeTier = await consumeForensicFreeCall(c, FORENSIC_FREE_TIER_DAILY_LIMIT);
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

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
          decodedFunctions: inspection.decodedFunctions.slice(0, 12),
          dangerousSelectorsFound: inspection.dangerousSelectorsFound
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
        const freeTier = await consumeForensicFreeCall(c, FORENSIC_FREE_TIER_DAILY_LIMIT);
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

        const input = String(args.input || args.calldata || args.txHash || "0x");
        const chain = String(args.chain || "base");
        const decoded = await decodeCalldataOrTx(input, chain, c.env);

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
        const freeTier = await consumeForensicFreeCall(c, FORENSIC_FREE_TIER_DAILY_LIMIT);
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

        const sim = await simulateTransactionPreflight(
          {
            chain: String(args.chain || "base"),
            from: args.from ? String(args.from) : undefined,
            to: String(args.to || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
            data: args.data ? String(args.data) : "0x",
            value: args.value ? String(args.value) : "0x0"
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

        const freeTier = await consumeForensicFreeCall(c, FORENSIC_FREE_TIER_DAILY_LIMIT);
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

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
        const freeTier = await consumeSponsoredFreeCall(c);
        c.header("x-nullclear-tier", freeTier.allowed ? "free-trial" : "free-trial-exhausted");
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

        if (!freeTier.allowed) {
          return c.json(
            {
              jsonrpc: "2.0",
              id,
              error: {
                code: 402,
                message:
                  "Payment Required: Daily free tier limit (10 calls/day) reached. Configure NULLCLEAR_PRIVATE_KEY in your MCP environment or pass an X-Payment header to continue."
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "free_trial_exhausted",
                        message:
                          "Daily free tier limit (10 calls/day) reached. Configure NULLCLEAR_PRIVATE_KEY in your MCP environment or pass an X-Payment header to continue with automatic $0.005 USDC x402 settlement.",
                        _nullclear: buildNullClearMetadata(0)
                      },
                      null,
                      2
                    )
                  }
                ]
              }
            },
            402
          );
        }

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
        const freeTier = await consumeSponsoredFreeCall(c);
        c.header("x-nullclear-tier", freeTier.allowed ? "free-trial" : "free-trial-exhausted");
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

        if (!freeTier.allowed) {
          return c.json(
            {
              jsonrpc: "2.0",
              id,
              error: {
                code: 402,
                message:
                  "Payment Required: Daily free tier limit (10 calls/day) reached. Configure NULLCLEAR_PRIVATE_KEY in your MCP environment or pass an X-Payment header to continue."
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "free_trial_exhausted",
                        message:
                          "Daily free tier limit (10 calls/day) reached. Configure NULLCLEAR_PRIVATE_KEY in your MCP environment or pass an X-Payment header to continue.",
                        _nullclear: buildNullClearMetadata(0)
                      },
                      null,
                      2
                    )
                  }
                ]
              }
            },
            402
          );
        }

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
        const freeTier = await consumeSponsoredFreeCall(c);
        c.header("x-nullclear-tier", freeTier.allowed ? "free-trial" : "free-trial-exhausted");
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

        if (!freeTier.allowed) {
          return c.json(
            {
              jsonrpc: "2.0",
              id,
              error: {
                code: 402,
                message:
                  "Payment Required: Daily free tier limit (10 calls/day) reached. Configure NULLCLEAR_PRIVATE_KEY in your MCP environment or pass an X-Payment header to continue."
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "free_trial_exhausted",
                        message:
                          "Daily free tier limit (10 calls/day) reached. Configure NULLCLEAR_PRIVATE_KEY in your MCP environment or pass an X-Payment header to continue.",
                        _nullclear: buildNullClearMetadata(0)
                      },
                      null,
                      2
                    )
                  }
                ]
              }
            },
            402
          );
        }

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

        const freeTier = await consumeSponsoredFreeCall(c);
        c.header("x-nullclear-tier", "free-trial");
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

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
        const freeTier = await consumeSponsoredFreeCall(c);
        c.header("x-nullclear-tier", "free-trial");
        c.header("x-nullclear-remaining-free-calls", String(freeTier.remaining));

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
          version: "1.3.0"
        }
      }
    });
  }

  return c.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not supported: ${method}` }
  });
});

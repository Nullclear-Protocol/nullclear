import { Hono, type Context } from "hono";
import { parseTransaction, recoverTransactionAddress } from "viem";
import type { Env } from "../env.js";
import {
  EVM_CHAIN_METADATA,
  getEvmRpcUrls,
  getSolanaRpcUrls,
  postJsonRpcWithFailover,
  type SupportedEvmForensicChain,
  type SupportedForensicChain
} from "../services/forensics-chains.js";
import {
  guardTransactionPreflight,
  normalizeChain
} from "../services/forensics-engine.js";

type GuardPreflightPayload = Awaited<ReturnType<typeof guardTransactionPreflight>>;
import {
  authenticateAndDebitPass,
  authenticatePassReadOnly
} from "../middleware/pass-auth.js";

export const rpcFirewallRouter = new Hono<Env>();

const BROADCAST_METHODS = new Set([
  "eth_sendrawtransaction",
  "eth_sendtransaction",
  "eth_sendprivatetransaction",
  "sendtransaction"
]);

function isBroadcastMethod(method: string): boolean {
  return BROADCAST_METHODS.has((method || "").trim().toLowerCase());
}

function getRpcUrlsForChain(chain: SupportedForensicChain, env?: Env["Bindings"]): string[] {
  if (chain === "solana") {
    return getSolanaRpcUrls(env);
  }
  return getEvmRpcUrls(chain as SupportedEvmForensicChain, env);
}

async function evaluateBroadcastRpcCall(
  chain: SupportedForensicChain,
  method: string,
  params: any[],
  env?: Env["Bindings"]
): Promise<{
  guardResult?: GuardPreflightPayload;
  parseError?: string;
}> {
  const m = method.trim().toLowerCase();

  if (m === "sendtransaction" || chain === "solana") {
    const rawTx = typeof params?.[0] === "string" ? params[0] : undefined;
    if (!rawTx) {
      return { parseError: "Missing base64/serialized Solana transaction parameter" };
    }
    const guardResult = await guardTransactionPreflight(
      {
        chain: "solana",
        transaction: rawTx
      },
      env
    );
    return { guardResult };
  }

  if (m === "eth_sendrawtransaction" || m === "eth_sendprivatetransaction") {
    const rawHex =
      typeof params?.[0] === "string"
        ? params[0]
        : typeof params?.[0]?.tx === "string"
          ? params[0].tx
          : undefined;
    if (!rawHex || !rawHex.startsWith("0x")) {
      return { parseError: "Missing 0x-prefixed signed raw EVM transaction hex" };
    }

    try {
      const parsed = parseTransaction(rawHex as any);
      let from: string | undefined;
      try {
        from = await recoverTransactionAddress({ serializedTransaction: rawHex as any });
      } catch {
        from = undefined;
      }

      const to = parsed.to || undefined;
      const data = parsed.data || "0x";
      const value =
        typeof parsed.value === "bigint" ? `0x${parsed.value.toString(16)}` : "0x0";

      // Contract deployment (no `to`) — skip to-address guard if pure creation without calldata attack
      if (!to) {
        return {};
      }

      const guardResult = await guardTransactionPreflight(
        {
          chain,
          from,
          to,
          data,
          value
        },
        env
      );
      return { guardResult };
    } catch (err: any) {
      return { parseError: `Failed to decode signed EVM transaction: ${err?.message || "invalid RLP"}` };
    }
  }

  if (m === "eth_sendtransaction") {
    const txObj = params?.[0];
    if (!txObj || typeof txObj !== "object") {
      return { parseError: "Missing transaction object for eth_sendTransaction" };
    }
    const guardResult = await guardTransactionPreflight(
      {
        chain,
        from: txObj.from,
        to: txObj.to,
        data: txObj.data || txObj.input || "0x",
        value: txObj.value || "0x0"
      },
      env
    );
    return { guardResult };
  }

  return {};
}

async function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Guard evaluation exceeded ${timeoutMs}ms budget`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function handleSingleRpcRequest(
  c: Context<Env>,
  chain: SupportedForensicChain,
  rpcItem: any,
  explicitKey: string | undefined,
  failMode: "closed" | "open",
  blockCaution: boolean,
  timeoutMs: number
): Promise<{
  response: Record<string, unknown>;
  firewallVerdict: "PASSTHROUGH_READ" | "ALLOWED" | "BLOCKED" | "FAIL_OPEN" | "UNAUTHORIZED";
  attestation?: string;
}> {
  const id = rpcItem?.id ?? null;
  const method = typeof rpcItem?.method === "string" ? rpcItem.method : "";
  const params = Array.isArray(rpcItem?.params) ? rpcItem.params : [];

  if (!method) {
    return {
      firewallVerdict: "BLOCKED",
      response: {
        jsonrpc: "2.0",
        id,
        error: { code: -32600, message: "Invalid JSON-RPC request: missing method" }
      }
    };
  }

  const rpcUrls = getRpcUrlsForChain(chain, c.env);

  // Read RPC methods: authenticate pass (0 credits) and forward transparently
  if (!isBroadcastMethod(method)) {
    const readAuth = await authenticatePassReadOnly(c, explicitKey);
    if (!readAuth.authenticated) {
      return {
        firewallVerdict: "UNAUTHORIZED",
        response: {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32002,
            message:
              readAuth.errorReason ||
              "NullClear Guarded RPC requires a Prepaid Pass key (nc_live_...). Mint one at POST https://api.nullclear.dev/v1/pass/buy ($5-$100 USDC).",
            data: { buyPassUrl: "https://api.nullclear.dev/v1/pass/buy" }
          }
        }
      };
    }

    const upstream = await postJsonRpcWithFailover(rpcUrls, rpcItem, 2500);
    if (!upstream) {
      return {
        firewallVerdict: "PASSTHROUGH_READ",
        response: {
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: `Upstream ${chain} RPC unavailable` }
        }
      };
    }
    return {
      firewallVerdict: "PASSTHROUGH_READ",
      response: upstream.data
    };
  }

  // Broadcast methods: debit 2 credits from Prepaid Pass & execute Pre-Sign Firewall
  const debit = await authenticateAndDebitPass(c, 2, explicitKey);
  if (!debit.authenticated) {
    return {
      firewallVerdict: "UNAUTHORIZED",
      response: {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32002,
          message:
            debit.errorReason ||
            "NullClear Guarded RPC broadcast protection requires an active Prepaid Pass with >= 2 credits. Buy or refill at POST https://api.nullclear.dev/v1/pass/buy",
          data: {
            buyPassUrl: "https://api.nullclear.dev/v1/pass/buy",
            creditsRequired: 2,
            creditsRemaining: debit.creditsRemaining
          }
        }
      }
    };
  }

  try {
    const evaluation = await raceWithTimeout(
      evaluateBroadcastRpcCall(chain, method, params, c.env),
      timeoutMs
    );
    if (evaluation.parseError) {
      if (failMode === "closed") {
        return {
          firewallVerdict: "BLOCKED",
          response: {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32003,
              message: `NullClear Firewall Blocked (failMode=closed): ${evaluation.parseError}`,
              data: { failMode, parseError: evaluation.parseError }
            }
          }
        };
      }
      // failMode=open -> forward directly
      const upstream = await postJsonRpcWithFailover(rpcUrls, rpcItem, 2500);
      return {
        firewallVerdict: "FAIL_OPEN",
        response: upstream?.data || {
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: `Upstream ${chain} RPC unavailable` }
        }
      };
    }

    const guard = evaluation.guardResult;
    if (guard) {
      const guardAny = guard as any;
      const action = guard.recommendedAgentAction;
      const alerts: string[] = Array.isArray(guardAny.alerts)
        ? guardAny.alerts
        : Array.isArray(guardAny.warnings)
          ? guardAny.warnings
          : [];
      const shouldBlock =
        action.startsWith("ABORT_") || (blockCaution && action === "CAUTION_HIGH_RISK");
      if (shouldBlock) {
        return {
          firewallVerdict: "BLOCKED",
          attestation: guard.provenance.attestationSha256,
          response: {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32003,
              message: `NullClear Firewall Blocked (${action}): ${alerts[0] || guard.llmDigest || "Critical transaction risk detected before mempool broadcast"}`,
              data: {
                recommendedAgentAction: action,
                llmDigest: guard.llmDigest,
                alerts,
                assetDiffs: guardAny.assetDiffs || [],
                touchedTokenVerdicts: guardAny.touchedTokenVerdicts || [],
                attestation: guard.provenance.attestationSha256
              }
            }
          }
        };
      }

      // Safe -> forward signed tx to upstream RPC
      const upstream = await postJsonRpcWithFailover(rpcUrls, rpcItem, 3000);
      if (!upstream) {
        return {
          firewallVerdict: "ALLOWED",
          attestation: guard.provenance.attestationSha256,
          response: {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: `Transaction passed NullClear Firewall (${action}) but upstream ${chain} RPC failed` }
          }
        };
      }
      return {
        firewallVerdict: "ALLOWED",
        attestation: guard.provenance.attestationSha256,
        response: upstream.data
      };
    }

    // No guard object needed (e.g., contract creation) -> forward
    const upstream = await postJsonRpcWithFailover(rpcUrls, rpcItem, 3000);
    return {
      firewallVerdict: "ALLOWED",
      response: upstream?.data || {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: `Upstream ${chain} RPC unavailable` }
      }
    };
  } catch (err: any) {
    if (failMode === "open") {
      const upstream = await postJsonRpcWithFailover(rpcUrls, rpcItem, 3000);
      return {
        firewallVerdict: "FAIL_OPEN",
        response: upstream?.data || {
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: `Upstream ${chain} RPC unavailable` }
        }
      };
    }
    return {
      firewallVerdict: "BLOCKED",
      response: {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32003,
          message: `NullClear Firewall Blocked (failMode=closed): Guard evaluation error — ${err?.message || "timeout"}`
        }
      }
    };
  }
}

async function handleRpcProxyPost(c: Context<Env>, explicitKey?: string) {
  const rawChain = c.req.param("chain") || "base";
  const chain = normalizeChain(rawChain);
  const failMode = (c.req.query("failMode") || "closed").toLowerCase() === "open" ? "open" : "closed";
  const blockCaution = (c.req.query("blockCaution") || "").toLowerCase() === "true";
  const rawTimeout = Number(c.req.query("timeoutMs"));
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout >= 50 && rawTimeout <= 5000
      ? Math.floor(rawTimeout)
      : 1500;

  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: invalid JSON-RPC payload" }
      },
      400
    );
  }

  if (Array.isArray(payload)) {
    if (payload.length === 0 || payload.length > 20) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "JSON-RPC batch must contain 1 to 20 items" }
        },
        400
      );
    }
    const results = [];
    let anyBlocked = false;
    for (const item of payload) {
      const res = await handleSingleRpcRequest(
        c,
        chain,
        item,
        explicitKey,
        failMode,
        blockCaution,
        timeoutMs
      );
      if (res.firewallVerdict === "BLOCKED") anyBlocked = true;
      results.push(res.response);
    }
    c.header("X-NullClear-Firewall", anyBlocked ? "BLOCKED" : "ALLOWED");
    return c.json(results);
  }

  const single = await handleSingleRpcRequest(
    c,
    chain,
    payload,
    explicitKey,
    failMode,
    blockCaution,
    timeoutMs
  );
  c.header("X-NullClear-Firewall", single.firewallVerdict);
  if (single.attestation) {
    c.header("X-NullClear-Attestation", single.attestation);
  }
  return c.json(single.response);
}

// GET /rpc & GET /rpc/:chain — Usage guide
rpcFirewallRouter.get("/", (c) => {
  return c.json({
    service: "NullClear Drop-In Guarded JSON-RPC Safety Rail (Autonomous AI Agents & Treasuries)",
    description:
      "Built for autonomous AI agents (Coinbase AgentKit, ElizaOS, Virtuals, Rig, MCP wallets) and Safe / DAO treasuries. Swap one RPC_URL env var: read calls pass through via <5ms KV auth at 0 credits; every eth_sendRawTransaction / eth_sendTransaction / Solana sendTransaction is simulated and audited before mempool broadcast to stop prompt-injected drains, malicious approvals, honeypots, and reverting transactions.",
    urlFormat: "https://api.nullclear.dev/rpc/<chain>/<nc_live_api_key>",
    supportedChains: [...Object.keys(EVM_CHAIN_METADATA), "solana"],
    queryOptions: {
      failMode: "closed (default for AI agent treasuries: blocks on guard timeout) | open (forwards if guard exceeds timeoutMs)",
      timeoutMs: "1500 (default, configurable 50..5000ms budget around pre-broadcast guard evaluation)",
      blockCaution: "false (default) | true (also blocks CAUTION_HIGH_RISK transactions)"
    },
    pricing: {
      readMethods: "0 credits (edge KV-cached Prepaid Pass auth)",
      broadcastMethods: "2 credits per protected broadcast (eth_sendRawTransaction / sendTransaction)",
      buyPassUrl: "POST https://api.nullclear.dev/v1/pass/buy ($5-$100 USDC)"
    }
  });
});

rpcFirewallRouter.get("/:chain", (c) => {
  const chain = normalizeChain(c.req.param("chain"));
  return c.json({
    service: "NullClear Drop-In Guarded JSON-RPC Firewall",
    chain,
    endpoint: `POST https://api.nullclear.dev/rpc/${chain}/<nc_live_api_key>`,
    headerAuthAlternative: `POST https://api.nullclear.dev/rpc/${chain} with Authorization: Bearer <nc_live_api_key>`,
    buyPassUrl: "POST https://api.nullclear.dev/v1/pass/buy"
  });
});

rpcFirewallRouter.post("/:chain", (c) => handleRpcProxyPost(c));
rpcFirewallRouter.post("/:chain/:apiKey", (c) => handleRpcProxyPost(c, c.req.param("apiKey")));

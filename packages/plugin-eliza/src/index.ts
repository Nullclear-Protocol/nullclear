import {
  NullClearClient,
  NullClearSecurityBlockError,
  assertSafeSecurityVerdict,
  formatBatchVerdictText,
  formatSecurityVerdictText,
  isEvmAddressFormat,
  isSolanaAddressFormat,
  normalizeForensicTarget,
  type ForensicChain,
  type SignerInput
} from "@nullclear/x402-arbiter";

export { NullClearSecurityBlockError };

export interface ElizaMemoryLike {
  content: {
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ElizaRuntimeLike {
  getSetting?: (key: string) => string | undefined | null;
  [key: string]: unknown;
}

export interface ElizaStateLike {
  [key: string]: unknown;
}

export type ElizaHandlerCallback = (response: {
  text: string;
  content?: Record<string, unknown>;
  [key: string]: unknown;
}) => Promise<unknown>;

export interface ElizaActionResult {
  success: boolean;
  text: string;
  values?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: string;
}

export interface ElizaActionLike {
  name: string;
  similes?: string[];
  description: string;
  examples?: Array<Array<{ name?: string; user?: string; content: Record<string, unknown> }>>;
  validate: (runtime: ElizaRuntimeLike, message: ElizaMemoryLike, state?: ElizaStateLike) => Promise<boolean>;
  handler: (
    runtime: ElizaRuntimeLike,
    message: ElizaMemoryLike,
    state?: ElizaStateLike,
    options?: Record<string, unknown>,
    callback?: ElizaHandlerCallback
  ) => Promise<ElizaActionResult>;
}

export interface ElizaProviderLike {
  name: string;
  description?: string;
  get: (runtime: ElizaRuntimeLike, message: ElizaMemoryLike, state?: ElizaStateLike) => Promise<{ text: string; values?: Record<string, unknown> }>;
}

export interface ElizaPluginLike {
  name: string;
  description: string;
  actions: ElizaActionLike[];
  providers: ElizaProviderLike[];
}

export interface NullClearElizaPluginConfig {
  arbiterUrl?: string;
  defaultChain?: ForensicChain;
  strict?: boolean;
  signer?: SignerInput;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const SECURITY_KEYWORDS_RE =
  /\b(scan|audit|check|verify|safe|safety|honeypot|rug|tax|firewall|inspect|token|mint|swap|buy)\b/i;
const CALLDATA_KEYWORDS_RE = /\b(decode|calldata|approve|drainer|simulate|tx|revert)\b/i;

export function extractChainHint(text: string, fallback: ForensicChain = "base"): ForensicChain {
  if (/\b(solana|sol|pump\.?fun|raydium|jupiter)\b/i.test(text)) return "solana";
  if (/\b(ethereum|eth\b|mainnet|uniswap v2)\b/i.test(text)) return "eth";
  return fallback;
}

export function extractTokenTargets(
  text: string,
  defaultChain: ForensicChain = "base"
): Array<{ chain: ForensicChain; address: string }> {
  const seen = new Set<string>();
  const targets: Array<{ chain: ForensicChain; address: string }> = [];
  const chainHint = extractChainHint(text, defaultChain);

  const evmMatches = text.match(/\b0x[a-fA-F0-9]{40}\b/g) || [];
  for (const addr of evmMatches) {
    const normalized = normalizeForensicTarget(addr, chainHint === "solana" ? "base" : chainHint);
    const key = `${normalized.chain}:${normalized.address}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push(normalized);
    }
  }

  const solCandidates = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || [];
  for (const token of solCandidates) {
    const hasDigitOrMixedCase = /\d/.test(token) && /[a-z]/.test(token) && /[A-Z]/.test(token);
    if ((chainHint === "solana" || hasDigitOrMixedCase) && isSolanaAddressFormat(token) && !isEvmAddressFormat(token)) {
      const normalized = normalizeForensicTarget(token, "solana");
      const key = `${normalized.chain}:${normalized.address}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push(normalized);
      }
    }
  }

  return targets;
}

export function extractHexCalldata(text: string): string | undefined {
  const matches = text.match(/\b0x[a-fA-F0-9]{10,}\b/g) || [];
  return matches.find((hex) => hex.length !== 42 && hex.length >= 10);
}

function buildRuntimeClient(
  runtime: ElizaRuntimeLike | undefined,
  config: NullClearElizaPluginConfig
): NullClearClient {
  const settingUrl = runtime?.getSetting?.("NULLCLEAR_API_URL") || undefined;
  const settingKey = runtime?.getSetting?.("NULLCLEAR_PRIVATE_KEY") || undefined;
  const signer =
    config.signer ||
    (settingKey && settingKey.startsWith("0x") ? (settingKey as `0x${string}`) : undefined);
  return new NullClearClient({
    arbiterUrl: config.arbiterUrl || settingUrl || "https://api.nullclear.dev",
    fetch: config.fetch,
    timeoutMs: config.timeoutMs,
    signer
  });
}

/**
 * Creates a configured NullClear security firewall plugin for ElizaOS (`@elizaos/core` v0.x/v1.x/v2.x).
 */
export function createNullClearPlugin(config: NullClearElizaPluginConfig = {}): ElizaPluginLike {
  const defaultChain = config.defaultChain || "base";

  const scanTokenAction: ElizaActionLike = {
    name: "NULLCLEAR_SCAN_TOKEN",
    similes: ["CHECK_TOKEN_SAFETY", "CHECK_HONEYPOT", "RUG_CHECK", "SCAN_CONTRACT"],
    description:
      "Scans a Base, Ethereum, or Solana token contract for honeypots, hidden buy/sell taxes, proxies, SELFDESTRUCT, and rug risks using NullClear.",
    examples: [
      [
        {
          name: "{{user1}}",
          content: { text: "Check if Base token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 is safe to swap" }
        },
        {
          name: "{{agent}}",
          content: {
            text: "Running NullClear pre-flight security check on 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913...",
            action: "NULLCLEAR_SCAN_TOKEN"
          }
        }
      ]
    ],
    validate: async (_runtime, message) => {
      const text = String(message?.content?.text || "");
      const explicitAddr = typeof message?.content?.address === "string" ? message.content.address : "";
      const targets = extractTokenTargets(explicitAddr || text, defaultChain);
      return targets.length === 1 && (Boolean(explicitAddr) || SECURITY_KEYWORDS_RE.test(text));
    },
    handler: async (runtime, message, _state, _options, callback) => {
      const text = String(message?.content?.text || "");
      const explicitAddr = typeof message?.content?.address === "string" ? message.content.address : "";
      const explicitChain = typeof message?.content?.chain === "string" ? (message.content.chain as ForensicChain) : undefined;
      const targets = extractTokenTargets(explicitAddr || text, explicitChain || defaultChain);
      const target = targets[0];
      if (!target) {
        const msg = "No valid Base, Ethereum, or Solana token address found to scan.";
        if (callback) await callback({ text: msg });
        return { success: false, text: msg, error: msg };
      }

      const client = buildRuntimeClient(runtime, config);
      const scan = await client.scanToken(explicitChain || target.chain, target.address);
      const summary = formatSecurityVerdictText(scan, target.address);

      if (callback) {
        await callback({
          text: summary,
          content: { scan }
        });
      }

      return {
        success: true,
        text: summary,
        values: {
          recommendedAgentAction: scan.recommendedAgentAction,
          score: scan.score,
          verdict: scan.verdict,
          chain: scan.chain,
          address: scan.address
        },
        data: { scan }
      };
    }
  };

  const scanBatchAction: ElizaActionLike = {
    name: "NULLCLEAR_SCAN_BATCH",
    similes: ["SCAN_MULTIPLE_TOKENS", "BATCH_RUG_CHECK"],
    description:
      "Batch-scans 2 to 15 tokens across Base, Ethereum, and Solana and returns an aggregated EXECUTE_SAFE or ABORT_CRITICAL_TRAP verdict.",
    validate: async (_runtime, message) => {
      const text = String(message?.content?.text || "");
      const targets = extractTokenTargets(text, defaultChain);
      return targets.length >= 2 && targets.length <= 15 && SECURITY_KEYWORDS_RE.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
      const text = String(message?.content?.text || "");
      const targets = extractTokenTargets(text, defaultChain).slice(0, 15);
      if (targets.length === 0) {
        const msg = "Provide 2 to 15 EVM or Solana token addresses to run a batch scan.";
        if (callback) await callback({ text: msg });
        return { success: false, text: msg, error: msg };
      }

      const client = buildRuntimeClient(runtime, config);
      const batch = await client.scanBatch(targets, {
        defaultChain,
        fallbackToFreeSingleScans: true
      });
      const summary = formatBatchVerdictText(batch);

      if (callback) {
        await callback({
          text: summary,
          content: { batch }
        });
      }

      return {
        success: true,
        text: summary,
        values: {
          recommendedAgentAction: batch.recommendedAgentAction,
          batchVerdict: batch.batchVerdict
        },
        data: { batch }
      };
    }
  };

  const guardCalldataAction: ElizaActionLike = {
    name: "NULLCLEAR_GUARD_CALLDATA",
    similes: ["DECODE_CALLDATA", "CHECK_DRAINER_APPROVAL"],
    description:
      "Decodes hex calldata before signing to catch unlimited approve() or setApprovalForAll() drainer traps (ABORT_DRAINER_APPROVAL).",
    validate: async (_runtime, message) => {
      const text = String(message?.content?.text || "");
      const hex = extractHexCalldata(text);
      return Boolean(hex && CALLDATA_KEYWORDS_RE.test(text));
    },
    handler: async (runtime, message, _state, _options, callback) => {
      const text = String(message?.content?.text || "");
      const calldata =
        (typeof message?.content?.data === "string" ? message.content.data : undefined) ||
        extractHexCalldata(text);
      if (!calldata) {
        const msg = "No hex calldata payload found to decode.";
        if (callback) await callback({ text: msg });
        return { success: false, text: msg, error: msg };
      }

      const client = buildRuntimeClient(runtime, config);
      const chainHint = extractChainHint(text, defaultChain);
      const decoded = await client.decodeCalldata(calldata, chainHint === "eth" ? "eth" : "base");
      const summary = `[NullClear Calldata] ${decoded.recommendedAgentAction || "UNKNOWN"} | Selector: ${decoded.selector || "?"} (${decoded.functionName || "unknown"})${decoded.riskReason ? ` | Risk: ${decoded.riskReason}` : ""}`;

      if (callback) {
        await callback({ text: summary, content: { decoded } });
      }

      return {
        success: true,
        text: summary,
        values: {
          recommendedAgentAction: decoded.recommendedAgentAction,
          selector: decoded.selector
        },
        data: { decoded }
      };
    }
  };

  const firewallProvider: ElizaProviderLike = {
    name: "nullclear-firewall-context",
    description:
      "Automatically screens token addresses mentioned in conversation via NullClear and injects pre-swap safety verdicts before trading decisions.",
    get: async (runtime, message) => {
      const text = String(message?.content?.text || "");
      const targets = extractTokenTargets(text, defaultChain);
      if (targets.length === 0) {
        return { text: "" };
      }

      try {
        const client = buildRuntimeClient(runtime, config);
        const first = targets[0];
        const scan = await client.scanToken(first.chain, first.address);
        const verdictText = formatSecurityVerdictText(scan, first.address);
        return {
          text: `NullClear Pre-Flight Firewall Advisory (enforce EXECUTE_SAFE before any swap): ${verdictText}`,
          values: {
            recommendedAgentAction: scan.recommendedAgentAction,
            score: scan.score,
            chain: scan.chain,
            address: scan.address
          }
        };
      } catch {
        return { text: "" };
      }
    }
  };

  return {
    name: "@nullclear/plugin-eliza",
    description:
      "NullClear pre-flight security oracle & rug/honeypot firewall for ElizaOS agents on Base, Ethereum, and Solana.",
    actions: [scanTokenAction, scanBatchAction, guardCalldataAction],
    providers: [firewallProvider]
  };
}

/**
 * Programmatic swap firewall helper for custom ElizaOS trading actions:
 * throws NullClearSecurityBlockError on honeypots / ABORT_CRITICAL_TRAP.
 */
export async function assertSafeElizaSwap(
  address: string,
  options: NullClearElizaPluginConfig & { chain?: ForensicChain; runtime?: ElizaRuntimeLike } = {}
): Promise<any> {
  const client = buildRuntimeClient(options.runtime, options);
  const strictSetting = options.runtime?.getSetting?.("NULLCLEAR_STRICT_MODE");
  const strict = options.strict ?? strictSetting === "true";
  const scan = await client.scanToken(options.chain || options.defaultChain || "base", address);
  assertSafeSecurityVerdict(scan, { strict, targetLabel: address });
  return scan;
}

export const nullclearPlugin: ElizaPluginLike = createNullClearPlugin();
export default nullclearPlugin;

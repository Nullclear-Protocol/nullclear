import { z } from "zod";
import {
  NullClearClient,
  NullClearSecurityBlockError,
  assertSafeSecurityVerdict,
  formatBatchVerdictText,
  formatSecurityVerdictText,
  type ForensicChain,
  type SignerInput
} from "@nullclear/x402-arbiter";

export { NullClearSecurityBlockError };

/**
 * Structural subset matching Coinbase AgentKit Network metadata (`@coinbase/agentkit`).
 */
export interface AgentKitNetworkLike {
  protocolFamily?: string;
  networkId?: string;
  chainId?: string | number;
}

/**
 * Structural subset matching Coinbase AgentKit WalletProvider (`@coinbase/agentkit`).
 */
export interface AgentKitWalletProviderLike {
  getAddress?: () => string;
  getNetwork?: () => AgentKitNetworkLike;
  signTypedData?: (typedData: any) => Promise<`0x${string}`>;
  sendTransaction?: (tx: { to: `0x${string}`; data?: `0x${string}`; value?: bigint | string }) => Promise<string>;
}

/**
 * Structural subset matching Coinbase AgentKit `Action` returned by `ActionProvider.getActions()`.
 */
export interface AgentKitActionLike<TActionSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: TActionSchema;
  invoke: (args: z.infer<TActionSchema>) => Promise<string>;
}

export interface NullClearActionProviderConfig {
  /** NullClear API endpoint (defaults to https://api.nullclear.dev) */
  arbiterUrl?: string;
  /** Default EVM chain for 0x addresses when omitted by caller/wallet */
  defaultChain?: ForensicChain;
  /** Treat CAUTION_HIGH_RISK verdicts as fatal in swap guard helpers */
  strict?: boolean;
  /** Optional x402 EIP-3009 signer (falls back to walletProvider.signTypedData if available) */
  signer?: SignerInput;
  /** Optional custom fetch implementation (useful for testing) */
  fetch?: typeof fetch;
  /** HTTP request timeout in ms (defaults to 15000) */
  timeoutMs?: number;
}

const ScanTokenSchema = z.object({
  address: z.string().min(20).describe("Token or contract address (0x... for Base/Ethereum, base58 mint for Solana)"),
  chain: z
    .enum(["base", "eth", "solana"])
    .optional()
    .describe("Optional chain override ('base', 'eth', or 'solana'). Auto-detected if omitted.")
});

const ScanBatchSchema = z.object({
  tokens: z
    .array(
      z.union([
        z.string().min(20),
        z.object({
          address: z.string().min(20),
          chain: z.enum(["base", "eth", "solana"]).optional()
        })
      ])
    )
    .min(1)
    .max(15)
    .describe("1 to 15 token addresses or { chain, address } entries across Base, Ethereum, or Solana"),
  chain: z
    .enum(["base", "eth", "solana"])
    .optional()
    .describe("Default chain for string entries ('base', 'eth', or 'solana')")
});

const DecodeCalldataSchema = z.object({
  input: z
    .string()
    .min(10)
    .describe("Hex calldata payload (0x...) or custom revert data to inspect for infinite approvals or drainer selectors"),
  chain: z.enum(["base", "eth"]).default("base").describe("EVM network ('base' or 'eth')")
});

const SimulateTxSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Target contract address"),
  data: z.string().optional().describe("Hex calldata to simulate"),
  from: z.string().optional().describe("Sender wallet address (defaults to connected wallet)"),
  value: z.string().optional().describe("Wei value in decimal or hex"),
  chain: z.enum(["base", "eth"]).default("base").describe("EVM network ('base' or 'eth')")
});

function inferChainFromNetwork(
  network?: AgentKitNetworkLike,
  fallback: ForensicChain = "base"
): ForensicChain {
  const family = String(network?.protocolFamily || "").toLowerCase();
  const netId = String(network?.networkId || "").toLowerCase();
  const chainId = String(network?.chainId || "").toLowerCase();

  if (family === "svm" || family === "solana" || netId.includes("solana")) {
    return "solana";
  }
  if (chainId === "1" || netId === "ethereum-mainnet" || netId === "eip155:1") {
    return "eth";
  }
  return fallback;
}

function resolveWalletSigner(
  walletProvider?: AgentKitWalletProviderLike,
  explicitSigner?: SignerInput
): SignerInput | undefined {
  if (explicitSigner) return explicitSigner;
  if (
    walletProvider &&
    typeof walletProvider.signTypedData === "function" &&
    typeof walletProvider.getAddress === "function"
  ) {
    const addr = walletProvider.getAddress();
    if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return {
        account: { address: addr as `0x${string}` },
        signTypedData: (params: any) => walletProvider.signTypedData!(params)
      };
    }
  }
  return undefined;
}

/**
 * Coinbase AgentKit-compatible ActionProvider equipping autonomous wallets with NullClear's
 * pre-flight token honeypot firewall, 15-token batch scanner, drainer calldata decoder, and tx simulator.
 */
export class NullClearActionProvider<
  TWalletProvider extends AgentKitWalletProviderLike = AgentKitWalletProviderLike
> {
  public readonly name = "nullclear";
  public readonly actionProviders: NullClearActionProvider<TWalletProvider>[] = [];
  private readonly config: NullClearActionProviderConfig;

  constructor(config: NullClearActionProviderConfig = {}) {
    this.config = config;
  }

  supportsNetwork = (network: AgentKitNetworkLike): boolean => {
    const family = String(network?.protocolFamily || "").toLowerCase();
    if (!family) return true;
    return family === "evm" || family === "svm" || family === "solana";
  };

  private createClient(walletProvider?: TWalletProvider): NullClearClient {
    return new NullClearClient({
      arbiterUrl: this.config.arbiterUrl,
      fetch: this.config.fetch,
      timeoutMs: this.config.timeoutMs,
      signer: resolveWalletSigner(walletProvider, this.config.signer)
    });
  }

  getActions(walletProvider?: TWalletProvider): AgentKitActionLike[] {
    const client = this.createClient(walletProvider);
    const walletChain = inferChainFromNetwork(
      walletProvider?.getNetwork?.(),
      this.config.defaultChain || "base"
    );
    const walletAddr = walletProvider?.getAddress?.();

    const scanTokenAction: AgentKitActionLike = {
      name: "nullclear_scan_token",
      description:
        "MANDATORY pre-swap security firewall: checks any Base, Ethereum, or Solana token for honeypots, hidden taxes, malicious proxies, SELF-DESTRUCT, and liquidity traps. Never swap unless recommendedAgentAction is EXECUTE_SAFE.",
      schema: ScanTokenSchema,
      invoke: async (rawArgs) => {
        const args = ScanTokenSchema.parse(rawArgs);
        const chain = args.chain || walletChain;
        const result = await client.scanToken(chain, args.address);
        return JSON.stringify(
          {
            summary: formatSecurityVerdictText(result, args.address),
            recommendedAgentAction: result.recommendedAgentAction,
            score: result.score,
            verdict: result.verdict,
            chain: result.chain,
            address: result.address,
            evidence: result.evidence,
            links: result.links
          },
          null,
          2
        );
      }
    };

    const scanBatchAction: AgentKitActionLike = {
      name: "nullclear_scan_batch",
      description:
        "Batch security scan for 1 to 15 tokens across Base, Ethereum, and Solana in one call ($0.025 USDC via x402 on-chain settlement or free single-scan fallback up to 5 tokens). Returns aggregated ABORT_CRITICAL_TRAP if any token is unsafe.",
      schema: ScanBatchSchema,
      invoke: async (rawArgs) => {
        const args = ScanBatchSchema.parse(rawArgs);
        const defaultChain = args.chain || walletChain;
        const result = await client.scanBatch(args.tokens, {
          defaultChain,
          fallbackToFreeSingleScans: true
        });
        return JSON.stringify(
          {
            summaryText: formatBatchVerdictText(result),
            ...result
          },
          null,
          2
        );
      }
    };

    const decodeCalldataAction: AgentKitActionLike = {
      name: "nullclear_decode_calldata",
      description:
        "Inspect hex calldata or custom revert bytes before signing to catch unlimited approve() or setApprovalForAll() drainer traps (ABORT_DRAINER_APPROVAL).",
      schema: DecodeCalldataSchema,
      invoke: async (rawArgs) => {
        const args = DecodeCalldataSchema.parse(rawArgs);
        const chain = args.chain || (walletChain === "eth" ? "eth" : "base");
        const result = await client.decodeCalldata(args.input, chain);
        return JSON.stringify(result, null, 2);
      }
    };

    const simulateTxAction: AgentKitActionLike = {
      name: "nullclear_simulate_tx",
      description:
        "Simulate an EVM transaction via eth_call before broadcasting to detect reverts and estimate gas (ABORT_WILL_REVERT vs EXECUTE_SAFE).",
      schema: SimulateTxSchema,
      invoke: async (rawArgs) => {
        const args = SimulateTxSchema.parse(rawArgs);
        const chain = args.chain || (walletChain === "eth" ? "eth" : "base");
        const from =
          args.from ||
          (walletAddr && /^0x[a-fA-F0-9]{40}$/.test(walletAddr) ? walletAddr : undefined);
        const result = await client.simulateTx({
          to: args.to,
          data: args.data,
          from,
          value: args.value,
          chain
        });
        return JSON.stringify(result, null, 2);
      }
    };

    return [scanTokenAction, scanBatchAction, decodeCalldataAction, simulateTxAction];
  }
}

/**
 * Factory creating a NullClear ActionProvider for Coinbase AgentKit.
 */
export function nullclearActionProvider<
  TWalletProvider extends AgentKitWalletProviderLike = AgentKitWalletProviderLike
>(config: NullClearActionProviderConfig = {}): NullClearActionProvider<TWalletProvider> {
  return new NullClearActionProvider<TWalletProvider>(config);
}

/**
 * Programmatic pre-swap guard: throws NullClearSecurityBlockError on ABORT_CRITICAL_TRAP
 * (or CAUTION_HIGH_RISK when `strict: true`).
 */
export async function assertSafeSwap(
  address: string,
  options: NullClearActionProviderConfig & { chain?: ForensicChain } = {}
): Promise<any> {
  const client = new NullClearClient({
    arbiterUrl: options.arbiterUrl,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    signer: options.signer
  });
  return client.assertSafeTokenSwap(address, options.chain || options.defaultChain || "base", {
    strict: options.strict
  });
}

/**
 * Wraps an AgentKit WalletProvider's `sendTransaction` so every outgoing EVM transaction runs
 * pre-flight NullClear calldata drainer decoding + eth_call simulation BEFORE signing or sending.
 */
export function createNullClearWalletGuard<TWallet extends AgentKitWalletProviderLike>(
  walletProvider: TWallet,
  config: NullClearActionProviderConfig & { simulateBeforeSend?: boolean } = {}
): TWallet {
  const sendTransaction = walletProvider.sendTransaction;
  if (typeof sendTransaction !== "function") {
    return walletProvider;
  }

  const client = new NullClearClient({
    arbiterUrl: config.arbiterUrl,
    fetch: config.fetch,
    timeoutMs: config.timeoutMs,
    signer: resolveWalletSigner(walletProvider, config.signer)
  });

  return new Proxy(walletProvider, {
    get(target, prop, receiver) {
      if (prop === "sendTransaction") {
        return async (tx: { to: `0x${string}`; data?: `0x${string}`; value?: bigint | string }) => {
          const walletChain = inferChainFromNetwork(target.getNetwork?.(), config.defaultChain || "base");
          const evmChain: "base" | "eth" = walletChain === "eth" ? "eth" : "base";

          if (tx.data && tx.data.length >= 10) {
            const decoded = await client.decodeCalldata(tx.data, evmChain);
            assertSafeSecurityVerdict(decoded, {
              strict: config.strict,
              targetLabel: tx.to
            });
          }

          if (config.simulateBeforeSend !== false) {
            const from = target.getAddress?.();
            const sim = await client.simulateTx({
              to: tx.to,
              data: tx.data,
              from: from && /^0x[a-fA-F0-9]{40}$/.test(from) ? from : undefined,
              value: tx.value !== undefined ? String(tx.value) : undefined,
              chain: evmChain
            });
            assertSafeSecurityVerdict(sim, {
              strict: config.strict,
              targetLabel: tx.to
            });
          }

          return sendTransaction.call(target, tx);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

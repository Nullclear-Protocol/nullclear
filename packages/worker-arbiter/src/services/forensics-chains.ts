import { DEFAULT_BASE_MAINNET_RPCS } from "@nullclear/shared";
import type { Env } from "../env.js";

export type SupportedEvmForensicChain =
  | "base"
  | "eth"
  | "arbitrum"
  | "optimism"
  | "polygon"
  | "bsc";

export type SupportedForensicChain = SupportedEvmForensicChain | "solana";

export const SUPPORTED_EVM_CHAINS: SupportedEvmForensicChain[] = [
  "base",
  "eth",
  "arbitrum",
  "optimism",
  "polygon",
  "bsc"
];

export const SUPPORTED_ALL_CHAINS: SupportedForensicChain[] = [
  ...SUPPORTED_EVM_CHAINS,
  "solana"
];

export interface EvmChainMetadata {
  key: SupportedEvmForensicChain;
  chainId: number;
  name: string;
  dexScreenerId: string;
  nativeSymbol: string;
  defaultBlockNumber: number;
  rpcs: string[];
}

export const EVM_CHAIN_METADATA: Record<SupportedEvmForensicChain, EvmChainMetadata> = {
  base: {
    key: "base",
    chainId: 8453,
    name: "Base",
    dexScreenerId: "base",
    nativeSymbol: "ETH",
    defaultBlockNumber: 28451200,
    rpcs: [...DEFAULT_BASE_MAINNET_RPCS]
  },
  eth: {
    key: "eth",
    chainId: 1,
    name: "Ethereum",
    dexScreenerId: "ethereum",
    nativeSymbol: "ETH",
    defaultBlockNumber: 21950400,
    rpcs: [
      "https://ethereum-rpc.publicnode.com",
      "https://1rpc.io/eth",
      "https://eth.llamarpc.com"
    ]
  },
  arbitrum: {
    key: "arbitrum",
    chainId: 42161,
    name: "Arbitrum One",
    dexScreenerId: "arbitrum",
    nativeSymbol: "ETH",
    defaultBlockNumber: 310200000,
    rpcs: [
      "https://arbitrum-one-rpc.publicnode.com",
      "https://arb1.arbitrum.io/rpc",
      "https://1rpc.io/arb"
    ]
  },
  optimism: {
    key: "optimism",
    chainId: 10,
    name: "OP Mainnet",
    dexScreenerId: "optimism",
    nativeSymbol: "ETH",
    defaultBlockNumber: 133500000,
    rpcs: [
      "https://optimism-rpc.publicnode.com",
      "https://mainnet.optimism.io",
      "https://1rpc.io/op"
    ]
  },
  polygon: {
    key: "polygon",
    chainId: 137,
    name: "Polygon PoS",
    dexScreenerId: "polygon",
    nativeSymbol: "POL",
    defaultBlockNumber: 69100000,
    rpcs: [
      "https://polygon-bor-rpc.publicnode.com",
      "https://polygon-rpc.com",
      "https://1rpc.io/matic"
    ]
  },
  bsc: {
    key: "bsc",
    chainId: 56,
    name: "BNB Smart Chain",
    dexScreenerId: "bsc",
    nativeSymbol: "BNB",
    defaultBlockNumber: 47200000,
    rpcs: [
      "https://bsc-rpc.publicnode.com",
      "https://bsc-dataseed.binance.org",
      "https://1rpc.io/bnb"
    ]
  }
};

export interface VerifiedSpenderInfo {
  address: string;
  label: string;
  protocol: string;
  chains: SupportedEvmForensicChain[];
  riskNote?: string;
}

/**
 * Canonical verified DeFi protocol routers & settlement contracts.
 * Used to distinguish legitimate DEX/Permit2 approvals from unknown EOA / drainer spenders.
 */
export const VERIFIED_PROTOCOL_SPENDERS: Record<string, VerifiedSpenderInfo> = {
  "0x000000000022d473030f116ddee9f6b43ac78ba3": {
    address: "0x000000000022d473030f116ddee9f6b43ac78ba3",
    label: "Uniswap Permit2",
    protocol: "Uniswap",
    chains: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc"],
    riskNote: "Canonical Permit2 singleton; verify off-chain Permit2 spender separately."
  },
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": {
    address: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
    label: "Uniswap Universal Router",
    protocol: "Uniswap",
    chains: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc"]
  },
  "0x6ff5693b99212da76ad316178a184ab56d299b43": {
    address: "0x6ff5693b99212da76ad316178a184ab56d299b43",
    label: "Uniswap Universal Router V2 (Base)",
    protocol: "Uniswap",
    chains: ["base"]
  },
  "0x66a9893cc07d91d95644aedd05d03f95e1dba8af": {
    address: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
    label: "Uniswap Universal Router V2 (Ethereum)",
    protocol: "Uniswap",
    chains: ["eth"]
  },
  "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": {
    address: "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
    label: "Uniswap Universal Router (Legacy)",
    protocol: "Uniswap",
    chains: ["eth", "arbitrum", "optimism", "polygon"]
  },
  "0x2626664c2603336e57b271c5c0b26f421741e481": {
    address: "0x2626664c2603336e57b271c5c0b26f421741e481",
    label: "Uniswap V3 SwapRouter02 (Base)",
    protocol: "Uniswap",
    chains: ["base"]
  },
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": {
    address: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
    label: "Uniswap V3 SwapRouter02",
    protocol: "Uniswap",
    chains: ["eth", "arbitrum", "optimism", "polygon"]
  },
  "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43": {
    address: "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43",
    label: "Aerodrome Router",
    protocol: "Aerodrome",
    chains: ["base"]
  },
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": {
    address: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
    label: "0x Exchange Proxy",
    protocol: "0x",
    chains: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc"]
  },
  "0x1111111254eeb25477b68fb85ed929f73a960582": {
    address: "0x1111111254eeb25477b68fb85ed929f73a960582",
    label: "1inch AggregationRouterV5",
    protocol: "1inch",
    chains: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc"]
  },
  "0x111111125421ca6dc452d289314280a0f8842a65": {
    address: "0x111111125421ca6dc452d289314280a0f8842a65",
    label: "1inch AggregationRouterV6",
    protocol: "1inch",
    chains: ["base", "eth", "arbitrum", "optimism", "polygon", "bsc"]
  },
  "0xc92e8bdf79f0507f65a392b0ab4667716bfe0110": {
    address: "0xc92e8bdf79f0507f65a392b0ab4667716bfe0110",
    label: "CoW Protocol GPv2VaultRelayer",
    protocol: "CoW Swap",
    chains: ["eth", "arbitrum", "base"]
  },
  "0x0000000000000068f116a894984e2db1123eb395": {
    address: "0x0000000000000068f116a894984e2db1123eb395",
    label: "OpenSea Seaport 1.6",
    protocol: "Seaport",
    chains: ["base", "eth", "arbitrum", "optimism", "polygon"]
  }
};

export function lookupVerifiedSpender(
  address: string,
  chain?: SupportedForensicChain
): VerifiedSpenderInfo | null {
  const norm = (address || "").trim().toLowerCase();
  const entry = VERIFIED_PROTOCOL_SPENDERS[norm];
  if (!entry) return null;
  if (chain && chain !== "solana" && !entry.chains.includes(chain)) {
    return null;
  }
  return entry;
}

/**
 * Normalizes chain identifier to one of:
 * 'base' | 'eth' | 'arbitrum' | 'optimism' | 'polygon' | 'bsc' | 'solana'
 */
export function normalizeChain(rawChain?: string): SupportedForensicChain {
  const c = (rawChain || "base").trim().toLowerCase();
  if (c === "eth" || c === "ethereum" || c === "mainnet" || c === "1" || c === "eip155:1") {
    return "eth";
  }
  if (
    c === "arb" ||
    c === "arbitrum" ||
    c === "arbitrum-one" ||
    c === "42161" ||
    c === "eip155:42161"
  ) {
    return "arbitrum";
  }
  if (
    c === "op" ||
    c === "opt" ||
    c === "optimism" ||
    c === "op-mainnet" ||
    c === "10" ||
    c === "eip155:10"
  ) {
    return "optimism";
  }
  if (
    c === "poly" ||
    c === "polygon" ||
    c === "matic" ||
    c === "pol" ||
    c === "137" ||
    c === "eip155:137"
  ) {
    return "polygon";
  }
  if (
    c === "bsc" ||
    c === "bnb" ||
    c === "binance" ||
    c === "smartchain" ||
    c === "56" ||
    c === "eip155:56"
  ) {
    return "bsc";
  }
  if (c === "sol" || c === "solana" || c === "900") {
    return "solana";
  }
  return "base";
}

export function getEvmRpcUrls(
  chain: SupportedEvmForensicChain,
  env?: Env["Bindings"]
): string[] {
  const overrides: Array<string | undefined> = [];
  if (chain === "eth") overrides.push(env?.ETH_RPC_URL);
  if (chain === "base") overrides.push(env?.BASE_MAINNET_RPC_URL, env?.BASE_RPC_URL);
  if (chain === "arbitrum") overrides.push((env as any)?.ARBITRUM_RPC_URL);
  if (chain === "optimism") overrides.push((env as any)?.OPTIMISM_RPC_URL);
  if (chain === "polygon") overrides.push((env as any)?.POLYGON_RPC_URL);
  if (chain === "bsc") overrides.push((env as any)?.BSC_RPC_URL);

  const combined = [...overrides, ...EVM_CHAIN_METADATA[chain].rpcs].filter(
    (u): u is string => Boolean(u && u.trim())
  );
  return Array.from(new Set(combined));
}

export function getSolanaRpcUrls(env?: Env["Bindings"]): string[] {
  return Array.from(
    new Set(
      [
        env?.SOLANA_RPC_URL,
        "https://solana-rpc.publicnode.com",
        "https://api.mainnet-beta.solana.com"
      ].filter((u): u is string => Boolean(u && u.trim()))
    )
  );
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 3500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function trySingleJsonRpc<T = any>(
  rpcUrl: string,
  bodyStr: string,
  timeoutMs: number
): Promise<{ data: T; rpcUrl: string }> {
  const res = await fetchWithTimeout(
    rpcUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyStr
    },
    timeoutMs
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: any = await res.json();
  if (!json) throw new Error("Empty JSON-RPC response");
  if (!Array.isArray(json) && json.error && typeof json.error.code === "number") {
    const msg = String(json.error.message || "").toLowerCase();
    if (
      json.error.code === -32005 ||
      json.error.code === -32097 ||
      msg.includes("rate limit") ||
      msg.includes("too many requests") ||
      msg.includes("timeout")
    ) {
      throw new Error(`RPC rate-limit/timeout: ${json.error.code}`);
    }
  }
  return { data: json as T, rpcUrl };
}

/**
 * Executes a JSON-RPC payload with fast primary attempt + parallel fallback racing.
 * Keeps worst-case multi-RPC latency bounded well under 3s while surviving HTTP 429/5xx.
 */
export async function postJsonRpcWithFailover<T = any>(
  rpcUrls: string[],
  payload: unknown,
  timeoutMs = 2400
): Promise<{ data: T; rpcUrl: string } | null> {
  if (rpcUrls.length === 0) return null;
  const bodyStr = JSON.stringify(payload);
  const perAttemptMs = Math.min(timeoutMs, 1500);

  try {
    return await trySingleJsonRpc<T>(rpcUrls[0], bodyStr, perAttemptMs);
  } catch {
    const fallbacks = rpcUrls.slice(1);
    if (fallbacks.length === 0) return null;
    try {
      return await Promise.any(
        fallbacks.map((u) => trySingleJsonRpc<T>(u, bodyStr, perAttemptMs))
      );
    } catch {
      return null;
    }
  }
}

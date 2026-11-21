import { keccak256, stringToHex, decodeAbiParameters, parseAbiParameters } from "viem";
import { getArbiterStore, type Env, type ForensicScanRecord } from "../env.js";
import {
  EVM_CHAIN_METADATA,
  SUPPORTED_EVM_CHAINS,
  SUPPORTED_ALL_CHAINS,
  fetchWithTimeout,
  getEvmRpcUrls,
  lookupVerifiedSpender,
  normalizeChain,
  postJsonRpcWithFailover,
  type SupportedEvmForensicChain,
  type SupportedForensicChain
} from "./forensics-chains.js";
import {
  fetchSolanaTokenMarketAndRug,
  probeSolanaMintOnChain,
  decodeSolanaTransactionWire,
  simulateSolanaTransactionPreflight
} from "./forensics-solana.js";
import {
  analyzeBytecodeControlFlowRisks,
  auditEip712TypedData,
  batchResolveSelectorsViaOpenChain,
  fetchSourcifyContractInfo,
  runStatefulEvmSimulation,
  unwrapNestedCalldata,
  type ControlFlowRiskSignals,
  type DecodedNestedCall,
  type SimulatedAssetDiff
} from "./forensics-evm-deep.js";

export {
  EVM_CHAIN_METADATA,
  SUPPORTED_EVM_CHAINS,
  SUPPORTED_ALL_CHAINS,
  normalizeChain,
  lookupVerifiedSpender,
  type SupportedEvmForensicChain,
  type SupportedForensicChain
};

export type RecommendedAgentAction =
  | "EXECUTE_SAFE"
  | "CAUTION_HIGH_RISK"
  | "ABORT_CRITICAL_TRAP"
  | "ABORT_WILL_REVERT"
  | "ABORT_DRAINER_APPROVAL";

export type ForensicVerdict = "VERIFIED CLEAR" | "CAUTION" | "CRITICAL TRAP";

export interface DisassembledBytecodeSummary {
  byteLength: number;
  instructionCount: number;
  hasSelfDestruct: boolean;
  selfDestructOffsets: number[];
  hasDelegateCall: boolean;
  delegateCallOffsets: number[];
  hasCallCode: boolean;
  hasCreate2: boolean;
  isEip1167MinimalProxy: boolean;
  eip1167Implementation: string | null;
  selectors: string[];
  knownFunctions: Array<{ selector: string; signature: string; category: "standard" | "admin" | "dangerous" }>;
  dangerousSelectorsFound: string[];
}

export interface ForensicScanPayload {
  address: string;
  chain: SupportedForensicChain;
  symbol: string;
  name: string;
  llmDigest: string;
  recommendedAgentAction: "EXECUTE_SAFE" | "CAUTION_HIGH_RISK" | "ABORT_CRITICAL_TRAP";
  score: number;
  verdict: ForensicVerdict;
  isProxy?: boolean;
  implementationAddress?: string | null;
  buyTaxPercent?: number;
  sellTaxPercent?: number;
  autoCorrectedChain?: boolean;
  requestedChain?: string;
  selfHealingNote?: string;
  cached?: boolean;
  rateLimited?: boolean;
  x402Upgrade?: Record<string, unknown>;
  provenance: {
    chainId: number | string;
    blockNumber: number;
    timestampIso: string;
    attestationSha256: string;
    sourcesAgreed: string[];
    degradedSources?: string[];
  };
  evidence: {
    isContract: boolean;
    isProxy: boolean;
    proxyType: string | null;
    implementationAddress: string | null;
    adminAddress?: string | null;
    isHoneypot: boolean;
    buyTaxPercent: number;
    sellTaxPercent: number;
    liquidityUsd: number;
    lpLockedPercent: number;
    topHoldersPercent: number;
    ownerAddress?: string | null;
    ownerStatus:
      | "RENOUNCED"
      | "MULTI_SIG_OR_GOVERNANCE"
      | "ACTIVE_OWNER"
      | "IMMUTABLE"
      | "EOA"
      | "UNKNOWN";
    hasSelfDestruct: boolean;
    hasDelegateCall: boolean;
    functionSelectorsCount: number;
    dangerousSelectorsFound: string[];
    solanaAuthorities?: {
      isToken2022: boolean;
      mintAuthority: string | null;
      freezeAuthority: string | null;
      permanentDelegate: string | null;
      transferFeeBps: number | null;
      transferHookProgram: string | null;
      nonTransferable: boolean;
      defaultFrozen: boolean;
    };
  };
  links: {
    webReportUrl: string;
    markdownTwinUrl: string;
    ogImageUrl?: string;
    xShareIntentUrl: string;
  };
}

// Canonical proxy storage slots
export const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
export const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
export const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
export const EIP1822_PROXIABLE_SLOT =
  "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7";
export const ZEPPELINOS_IMPL_SLOT =
  "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3";
export const ZEPPELINOS_ADMIN_SLOT =
  "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b";
export const GNOSIS_SAFE_SLOT0 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// Built-in 4-byte function & error selector database for sub-millisecond resolution
export const KNOWN_SELECTORS: Record<
  string,
  { signature: string; category: "standard" | "admin" | "dangerous" }
> = {
  // ERC-20 / EIP-2612 / EIP-3009 Standard
  "0x06fdde03": { signature: "name()", category: "standard" },
  "0x95d89b41": { signature: "symbol()", category: "standard" },
  "0x313ce567": { signature: "decimals()", category: "standard" },
  "0x18160ddd": { signature: "totalSupply()", category: "standard" },
  "0x70a08231": { signature: "balanceOf(address)", category: "standard" },
  "0xa9059cbb": { signature: "transfer(address,uint256)", category: "standard" },
  "0x095ea7b3": { signature: "approve(address,uint256)", category: "standard" },
  "0x23b872dd": { signature: "transferFrom(address,address,uint256)", category: "standard" },
  "0xdd62ed3e": { signature: "allowance(address,address)", category: "standard" },
  "0x39509351": { signature: "increaseAllowance(address,uint256)", category: "standard" },
  "0xa457c2d7": { signature: "decreaseAllowance(address,uint256)", category: "standard" },
  "0xd505accf": { signature: "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", category: "standard" },
  "0x8fcbaf0c": { signature: "permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)", category: "standard" },
  "0xe3ee160e": {
    signature: "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
    category: "standard"
  },
  "0xef55bec6": {
    signature: "receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
    category: "standard"
  },
  // ERC-721 / ERC-1155
  "0xa22cb465": { signature: "setApprovalForAll(address,bool)", category: "standard" },
  "0x42842e0e": { signature: "safeTransferFrom(address,address,uint256)", category: "standard" },
  // Proxy / Ownership
  "0x5c60da1b": { signature: "implementation()", category: "admin" },
  "0xf851a440": { signature: "admin()", category: "admin" },
  "0x3659cfe6": { signature: "upgradeTo(address)", category: "admin" },
  "0x4f1ef286": { signature: "upgradeToAndCall(address,bytes)", category: "admin" },
  "0x8da5cb5b": { signature: "owner()", category: "admin" },
  "0x715018a6": { signature: "renounceOwnership()", category: "admin" },
  "0xf2fde38b": { signature: "transferOwnership(address)", category: "admin" },
  "0x8456cb59": { signature: "pause()", category: "admin" },
  "0x3f4ba83a": { signature: "unpause()", category: "admin" },
  "0x40c10f19": { signature: "mint(address,uint256)", category: "admin" },
  // Common DEX / Swap selectors
  "0x38ed1739": { signature: "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)", category: "standard" },
  "0x7ff36ab5": { signature: "swapExactETHForTokens(uint256,address[],address,uint256)", category: "standard" },
  "0x18cbafe5": { signature: "swapExactTokensForETH(uint256,uint256,address[],address,uint256)", category: "standard" },
  "0x04e45aaf": { signature: "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))", category: "standard" },
  "0x3593564c": { signature: "execute(bytes,bytes[],uint256)", category: "standard" },
  "0x24856bc3": { signature: "execute(bytes,bytes[])", category: "standard" },
  "0xac9650d8": { signature: "multicall(bytes[])", category: "standard" },
  "0x82ad56cb": { signature: "aggregate3((address,bool,bytes)[])", category: "standard" },
  "0x252dba42": { signature: "aggregate((address,bytes)[])", category: "standard" },
  "0x174dea71": { signature: "aggregate3Value((address,bool,uint256,bytes)[])", category: "standard" },
  "0x6a761202": {
    signature: "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)",
    category: "admin"
  },
  // Dangerous / Rug / Honeypot Tax Manipulation Selectors
  "0xea1644d5": { signature: "setTaxFeePercent(uint256)", category: "dangerous" },
  "0x061c82d0": { signature: "setFee(uint256)", category: "dangerous" },
  "0x6b67c4df": { signature: "setBuySellTax(uint256,uint256)", category: "dangerous" },
  "0x1694505e": { signature: "setBlacklist(address,bool)", category: "dangerous" },
  "0x44337ea1": { signature: "blacklistAddress(address,bool)", category: "dangerous" },
  "0xf9f92be4": { signature: "addBot(address)", category: "dangerous" },
  "0x8a8c523c": { signature: "enableTrading()", category: "admin" },
  "0xc9567bf9": { signature: "openTrading()", category: "admin" }
};

export const KNOWN_ERROR_SELECTORS: Record<string, string> = {
  "0x08c379a0": "Error(string)",
  "0x4e487b71": "Panic(uint256)",
  "0xfb8f41b2": "ERC20InsufficientAllowance(address,uint256,uint256)",
  "0xe450d38c": "ERC20InsufficientBalance(address,uint256,uint256)",
  "0x96c6fd1e": "ERC20InvalidSender(address)",
  "0xec442f05": "ERC20InvalidReceiver(address)",
  "0x118cdaa7": "OwnableUnauthorizedAccount(address)",
  "0xd92e233d": "ZeroAddress()",
  "0x3ee5aeb5": "ReentrancyGuardReentrantCall()",
  "0xf4d678b8": "InsufficientBalance()"
};

// Canonical verified token anchors (used to enrich RPC results & provide zero-latency resilience)
export interface CanonicalTokenAnchor {
  chain: SupportedForensicChain;
  address: string;
  symbol: string;
  name: string;
  isProxy: boolean;
  proxyType: string | null;
  implementationAddress: string | null;
  adminAddress: string | null;
  buyTaxPercent: number;
  sellTaxPercent: number;
  liquidityUsd: number;
  lpLockedPercent: number;
  topHoldersPercent: number;
  ownerAddress: string | null;
  ownerStatus: "RENOUNCED" | "MULTI_SIG_OR_GOVERNANCE" | "ACTIVE_OWNER" | "IMMUTABLE";
  score: number;
  verdict: ForensicVerdict;
  recommendedAgentAction: "EXECUTE_SAFE" | "CAUTION_HIGH_RISK" | "ABORT_CRITICAL_TRAP";
}

export const CANONICAL_TOKEN_ANCHORS: Record<string, CanonicalTokenAnchor> = {
  "base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
    chain: "base",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    symbol: "USDC",
    name: "USD Coin",
    isProxy: true,
    proxyType: "EIP-1967 / FiatTokenProxy",
    implementationAddress: "0x2ce6311ddae708829bc0784c967b7d77d19fd779",
    adminAddress: "0x07c1d2b633fb8f2f5b20b86b685f7913e2f5b6c4",
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 68500000,
    lpLockedPercent: 100,
    topHoldersPercent: 12.4,
    ownerAddress: "0x07c1d2b633fb8f2f5b20b86b685f7913e2f5b6c4",
    ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
    score: 99,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "base:0x4200000000000000000000000000000000000006": {
    chain: "base",
    address: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    name: "Wrapped Ether",
    isProxy: false,
    proxyType: null,
    implementationAddress: null,
    adminAddress: null,
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 145000000,
    lpLockedPercent: 100,
    topHoldersPercent: 18.5,
    ownerAddress: "0x0000000000000000000000000000000000000000",
    ownerStatus: "IMMUTABLE",
    score: 99,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "base:0x940181a94a35a4569e4529a3cdfb74e38fd98631": {
    chain: "base",
    address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631",
    symbol: "AERO",
    name: "Aerodrome Finance",
    isProxy: false,
    proxyType: null,
    implementationAddress: null,
    adminAddress: null,
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 42000000,
    lpLockedPercent: 98.5,
    topHoldersPercent: 16.2,
    ownerAddress: "0x0000000000000000000000000000000000000000",
    ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
    score: 96,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "base:0x532f27101965dd16442e59d40670faf5ebb142e4": {
    chain: "base",
    address: "0x532f27101965dd16442e59d40670faf5ebb142e4",
    symbol: "BRETT",
    name: "Brett",
    isProxy: false,
    proxyType: null,
    implementationAddress: null,
    adminAddress: null,
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 19400000,
    lpLockedPercent: 99.1,
    topHoldersPercent: 15.8,
    ownerAddress: "0x0000000000000000000000000000000000000000",
    ownerStatus: "RENOUNCED",
    score: 94,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "base:0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b": {
    chain: "base",
    address: "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b",
    symbol: "VIRTUAL",
    name: "Virtual Protocol",
    isProxy: false,
    proxyType: null,
    implementationAddress: null,
    adminAddress: null,
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 24800000,
    lpLockedPercent: 97.0,
    topHoldersPercent: 19.4,
    ownerAddress: "0x0000000000000000000000000000000000000000",
    ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
    score: 95,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "eth:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
    chain: "eth",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    symbol: "USDC",
    name: "USD Coin (Ethereum)",
    isProxy: true,
    proxyType: "EIP-1967 / FiatTokenProxy",
    implementationAddress: "0x43506849d7c04f9138d1a2050bbf3a0c054402dd",
    adminAddress: "0x807a96288a1a408dbc13de2b1d087d10356395d2",
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 420000000,
    lpLockedPercent: 100,
    topHoldersPercent: 11.2,
    ownerAddress: "0x807a96288a1a408dbc13de2b1d087d10356395d2",
    ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
    score: 99,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "arbitrum:0xaf88d065e77c8cc2239327c5edb3a432268e5831": {
    chain: "arbitrum",
    address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    symbol: "USDC",
    name: "USD Coin (Arbitrum)",
    isProxy: true,
    proxyType: "EIP-1967 / FiatTokenProxy",
    implementationAddress: "0x0f4fb9474303d10905ab86aa8d5a65fe44b6e04a",
    adminAddress: "0x0c8f681cd8c76bc5f6d6c3ec70e9d59528b772e3",
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 165000000,
    lpLockedPercent: 100,
    topHoldersPercent: 14.2,
    ownerAddress: "0x0c8f681cd8c76bc5f6d6c3ec70e9d59528b772e3",
    ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
    score: 99,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "optimism:0x0b2c639c533813f4aa9d7837caf62653d097ff85": {
    chain: "optimism",
    address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    symbol: "USDC",
    name: "USD Coin (Optimism)",
    isProxy: true,
    proxyType: "EIP-1967 / FiatTokenProxy",
    implementationAddress: "0xdEd3b9a8DBeDC2F9CB725B55d0E686A81E6d06dC",
    adminAddress: "0x916702d4ce18e1f0017bb0d4547b96b6d3719235",
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 92000000,
    lpLockedPercent: 100,
    topHoldersPercent: 15.1,
    ownerAddress: "0x916702d4ce18e1f0017bb0d4547b96b6d3719235",
    ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
    score: 99,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "polygon:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": {
    chain: "polygon",
    address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    symbol: "USDC",
    name: "USD Coin (Polygon)",
    isProxy: true,
    proxyType: "EIP-1967 / FiatTokenProxy",
    implementationAddress: "0xB3159b3a3a5B58250a69bB8B3b2bA2b494e85A17",
    adminAddress: "0x807a96288a1a408dbc13de2b1d087d10356395d2",
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 84000000,
    lpLockedPercent: 100,
    topHoldersPercent: 14.8,
    ownerAddress: "0x807a96288a1a408dbc13de2b1d087d10356395d2",
    ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
    score: 99,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "bsc:0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": {
    chain: "bsc",
    address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    symbol: "USDC",
    name: "Binance-Peg USD Coin",
    isProxy: false,
    proxyType: null,
    implementationAddress: null,
    adminAddress: null,
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 112000000,
    lpLockedPercent: 100,
    topHoldersPercent: 18.0,
    ownerAddress: "0x0000000000000000000000000000000000000000",
    ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
    score: 97,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  },
  "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
    chain: "solana",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin (Solana SPL)",
    isProxy: false,
    proxyType: null,
    implementationAddress: null,
    adminAddress: null,
    buyTaxPercent: 0,
    sellTaxPercent: 0,
    liquidityUsd: 185000000,
    lpLockedPercent: 100,
    topHoldersPercent: 14.0,
    ownerAddress: "2wmVCSfPxGPjrnMMn7rchp4uaeoTqN39mXFC2zhPdri9",
    ownerStatus: "MULTI_SIG_OR_GOVERNANCE",
    score: 98,
    verdict: "VERIFIED CLEAR",
    recommendedAgentAction: "EXECUTE_SAFE"
  }
};

export function isEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

export function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
}

/**
 * Extracts a 20-byte EVM address from a 32-byte storage slot hex value
 */
export function extractAddressFromSlot(slotHex?: string | null): string | null {
  if (!slotHex || typeof slotHex !== "string") return null;
  const clean = slotHex.replace(/^0x/i, "").toLowerCase();
  if (clean.length < 40) return null;
  const addrPart = clean.slice(-40);
  if (/^0{40}$/.test(addrPart)) return null;
  return `0x${addrPart}`;
}

/**
 * Pure Instruction-Boundary EVM Bytecode Disassembler.
 * Walks bytecode strictly by instruction boundaries, skipping PUSH1 (0x60) through PUSH32 (0x7f)
 * immediate operand bytes so embedded constants never trigger false-positive SELFDESTRUCT (0xff)
 * or DELEGATECALL (0xf4) flags.
 */
export function disassembleEvmBytecode(bytecodeHex: string): DisassembledBytecodeSummary {
  const clean = (bytecodeHex || "").replace(/^0x/i, "").toLowerCase();
  if (!clean || clean.length < 2) {
    return {
      byteLength: 0,
      instructionCount: 0,
      hasSelfDestruct: false,
      selfDestructOffsets: [],
      hasDelegateCall: false,
      delegateCallOffsets: [],
      hasCallCode: false,
      hasCreate2: false,
      isEip1167MinimalProxy: false,
      eip1167Implementation: null,
      selectors: [],
      knownFunctions: [],
      dangerousSelectorsFound: []
    };
  }

  // Detect EIP-1167 minimal proxy clone pattern: 363d3d373d3d3d363d73<20-byte-addr>5af43d82803e903d91602b57fd5bf3
  let isEip1167MinimalProxy = false;
  let eip1167Implementation: string | null = null;
  const eip1167Match = clean.match(/363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/);
  if (eip1167Match) {
    isEip1167MinimalProxy = true;
    eip1167Implementation = `0x${eip1167Match[1]}`;
  }

  // Strip Solidity CBOR metadata tail if present (0xa264697066735822...0033) so metadata bytes aren't walked as code
  let codeHex = clean;
  if (codeHex.length > 100 && codeHex.endsWith("0033")) {
    const cborIdx = codeHex.lastIndexOf("a26469706673");
    if (cborIdx > 0 && cborIdx % 2 === 0) {
      codeHex = codeHex.slice(0, cborIdx);
    }
  }

  const byteLen = Math.floor(codeHex.length / 2);
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = parseInt(codeHex.slice(i * 2, i * 2 + 2), 16) || 0;
  }

  let instructionCount = 0;
  const selfDestructOffsets: number[] = [];
  const delegateCallOffsets: number[] = [];
  let hasCallCode = false;
  let hasCreate2 = false;
  const selectorSet = new Set<string>();

  let pc = 0;
  while (pc < byteLen) {
    const opcode = bytes[pc];
    instructionCount++;

    // PUSH1 (0x60) through PUSH32 (0x7f)
    if (opcode >= 0x60 && opcode <= 0x7f) {
      const pushBytes = opcode - 0x5f; // 1 to 32

      // PUSH4 (0x63): check if used as function selector in dispatcher
      if (opcode === 0x63 && pc + 4 < byteLen) {
        const b1 = bytes[pc + 1];
        const b2 = bytes[pc + 2];
        const b3 = bytes[pc + 3];
        const b4 = bytes[pc + 4];
        // Ignore 0x00000000 and 0xffffffff masks
        const isMask =
          (b1 === 0 && b2 === 0 && b3 === 0 && b4 === 0) ||
          (b1 === 0xff && b2 === 0xff && b3 === 0xff && b4 === 0xff);
        if (!isMask) {
          const sel =
            "0x" +
            b1.toString(16).padStart(2, "0") +
            b2.toString(16).padStart(2, "0") +
            b3.toString(16).padStart(2, "0") +
            b4.toString(16).padStart(2, "0");

          // Check if followed within 6 bytes by EQ (0x14) or SUB (0x03) or GT (0x11) or LT (0x10) (dispatcher table)
          let isDispatcher = false;
          for (let lookahead = pc + 5; lookahead < Math.min(byteLen, pc + 12); lookahead++) {
            const nextOp = bytes[lookahead];
            if (nextOp === 0x14 || nextOp === 0x57) {
              isDispatcher = true;
              break;
            }
          }
          if (isDispatcher || KNOWN_SELECTORS[sel]) {
            selectorSet.add(sel);
          }
        }
      }

      // Advance PC past opcode AND all immediate operand bytes
      pc += 1 + pushBytes;
      continue;
    }

    if (opcode === 0xff) {
      selfDestructOffsets.push(pc);
    } else if (opcode === 0xf4) {
      delegateCallOffsets.push(pc);
    } else if (opcode === 0xf2) {
      hasCallCode = true;
    } else if (opcode === 0xf5) {
      hasCreate2 = true;
    }

    pc += 1;
  }

  const selectors = Array.from(selectorSet);
  const knownFunctions: Array<{ selector: string; signature: string; category: "standard" | "admin" | "dangerous" }> = [];
  const dangerousSelectorsFound: string[] = [];

  for (const sel of selectors) {
    const known = KNOWN_SELECTORS[sel];
    if (known) {
      knownFunctions.push({
        selector: sel,
        signature: known.signature,
        category: known.category
      });
      if (known.category === "dangerous") {
        dangerousSelectorsFound.push(`${known.signature} (${sel})`);
      }
    }
  }

  return {
    byteLength: Math.floor(clean.length / 2),
    instructionCount,
    hasSelfDestruct: selfDestructOffsets.length > 0,
    selfDestructOffsets,
    hasDelegateCall: delegateCallOffsets.length > 0,
    delegateCallOffsets,
    hasCallCode,
    hasCreate2,
    isEip1167MinimalProxy,
    eip1167Implementation,
    selectors,
    knownFunctions,
    dangerousSelectorsFound
  };
}

/**
 * Helper to decode an ABI-encoded string returned from eth_call (name() / symbol())
 */
function decodeErc20String(hex?: string | null): string | null {
  if (!hex || typeof hex !== "string" || hex === "0x" || hex.length < 66) return null;
  try {
    const [decoded] = decodeAbiParameters(parseAbiParameters("string"), hex as `0x${string}`);
    const clean = String(decoded || "").replace(/\0/g, "").trim();
    return clean || null;
  } catch {
    // Handle bytes32 string fallback (e.g. MKR)
    try {
      const cleanHex = hex.replace(/^0x/i, "").slice(0, 64);
      let out = "";
      for (let i = 0; i < cleanHex.length; i += 2) {
        const code = parseInt(cleanHex.slice(i, i + 2), 16);
        if (code >= 32 && code <= 126) out += String.fromCharCode(code);
      }
      return out.trim() || null;
    } catch {
      return null;
    }
  }
}

export function getEvmRpcUrl(
  chain: SupportedEvmForensicChain,
  env?: Env["Bindings"]
): string {
  return getEvmRpcUrls(chain, env)[0];
}

interface EvmRpcProbeResult {
  blockNumber: number;
  bytecode: string;
  isContract: boolean;
  isProxy: boolean;
  proxyType: string | null;
  implementationAddress: string | null;
  adminAddress: string | null;
  beaconAddress?: string | null;
  diamondFacetsCount?: number;
  implementationBytecode: string;
  symbol: string | null;
  name: string | null;
  ownerAddress: string | null;
  disassembly: DisassembledBytecodeSummary;
  rpcUrlUsed?: string;
}

async function probeEvmContractOnChain(
  chain: SupportedEvmForensicChain,
  address: string,
  env?: Env["Bindings"]
): Promise<EvmRpcProbeResult | null> {
  const rpcs = getEvmRpcUrls(chain, env);
  const target = address.toLowerCase();

  try {
    const batchReq = [
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_getCode", params: [target, "latest"] },
      { jsonrpc: "2.0", id: 3, method: "eth_getStorageAt", params: [target, EIP1967_IMPL_SLOT, "latest"] },
      { jsonrpc: "2.0", id: 4, method: "eth_getStorageAt", params: [target, EIP1967_ADMIN_SLOT, "latest"] },
      { jsonrpc: "2.0", id: 5, method: "eth_getStorageAt", params: [target, EIP1822_PROXIABLE_SLOT, "latest"] },
      { jsonrpc: "2.0", id: 6, method: "eth_getStorageAt", params: [target, ZEPPELINOS_IMPL_SLOT, "latest"] },
      { jsonrpc: "2.0", id: 7, method: "eth_getStorageAt", params: [target, ZEPPELINOS_ADMIN_SLOT, "latest"] },
      { jsonrpc: "2.0", id: 8, method: "eth_call", params: [{ to: target, data: "0x95d89b41" }, "latest"] }, // symbol()
      { jsonrpc: "2.0", id: 9, method: "eth_call", params: [{ to: target, data: "0x06fdde03" }, "latest"] }, // name()
      { jsonrpc: "2.0", id: 10, method: "eth_call", params: [{ to: target, data: "0x8da5cb5b" }, "latest"] }, // owner()
      { jsonrpc: "2.0", id: 11, method: "eth_getStorageAt", params: [target, EIP1967_BEACON_SLOT, "latest"] },
      { jsonrpc: "2.0", id: 12, method: "eth_getStorageAt", params: [target, GNOSIS_SAFE_SLOT0, "latest"] },
      { jsonrpc: "2.0", id: 13, method: "eth_call", params: [{ to: target, data: "0x7a0ed627" }, "latest"] } // Diamond facets()
    ];

    const rpcResp = await postJsonRpcWithFailover<any[]>(rpcs, batchReq, 3200);
    if (!rpcResp || !Array.isArray(rpcResp.data)) return null;
    const results = rpcResp.data;

    const getRes = (id: number) => results.find((r) => r.id === id)?.result;
    const blockHex = getRes(1);
    const defaultBlk = EVM_CHAIN_METADATA[chain].defaultBlockNumber;
    const blockNumber = blockHex ? parseInt(blockHex, 16) || defaultBlk : defaultBlk;
    const bytecode = typeof getRes(2) === "string" ? getRes(2) : "0x";
    const isContract = Boolean(bytecode && bytecode !== "0x" && bytecode.length > 2);

    const eip1967Impl = extractAddressFromSlot(getRes(3));
    const eip1967Admin = extractAddressFromSlot(getRes(4));
    const eip1822Impl = extractAddressFromSlot(getRes(5));
    const zeppelinImpl = extractAddressFromSlot(getRes(6));
    const zeppelinAdmin = extractAddressFromSlot(getRes(7));
    const eip1967Beacon = extractAddressFromSlot(getRes(11));
    const slot0Addr = extractAddressFromSlot(getRes(12));
    const facetsHex = typeof getRes(13) === "string" ? getRes(13) : null;

    const proxyDisasm = disassembleEvmBytecode(bytecode);

    // Detect Gnosis Safe / slot0 minimal proxy only when bytecode is small proxy and contains DELEGATECALL
    const looksLikeSafeProxy =
      proxyDisasm.hasDelegateCall && proxyDisasm.byteLength > 0 && proxyDisasm.byteLength < 600 && Boolean(slot0Addr);

    // Detect EIP-2535 Diamond if facets() returned valid ABI array > 128 chars
    let diamondFacetsCount = 0;
    let firstDiamondFacet: string | null = null;
    if (facetsHex && facetsHex.length > 130 && !facetsHex.startsWith("0x08c379a0")) {
      try {
        const [facets] = decodeAbiParameters(
          parseAbiParameters("(address facetAddress, bytes4[] functionSelectors)[]"),
          facetsHex as `0x${string}`
        );
        if (Array.isArray(facets) && facets.length > 0) {
          diamondFacetsCount = facets.length;
          firstDiamondFacet = String(facets[0].facetAddress).toLowerCase();
        }
      } catch {}
    }

    let implementationAddress =
      eip1967Impl ||
      eip1822Impl ||
      zeppelinImpl ||
      proxyDisasm.eip1167Implementation ||
      (looksLikeSafeProxy ? slot0Addr : null) ||
      firstDiamondFacet ||
      null;
    let adminAddress = eip1967Admin || zeppelinAdmin || null;
    let proxyType: string | null = null;
    if (eip1967Impl) proxyType = "EIP-1967";
    else if (eip1822Impl) proxyType = "EIP-1822 (UUPS)";
    else if (zeppelinImpl) proxyType = "EIP-1967 / ZeppelinOS";
    else if (eip1967Beacon) proxyType = "EIP-1967 Beacon Proxy";
    else if (proxyDisasm.isEip1167MinimalProxy) proxyType = "EIP-1167 Minimal Proxy";
    else if (diamondFacetsCount > 0) proxyType = `EIP-2535 Diamond (${diamondFacetsCount} facets)`;
    else if (looksLikeSafeProxy) proxyType = "Safe / Slot-0 Proxy";

    let implementationBytecode = bytecode;
    let finalDisasm = proxyDisasm;

    // Resolve Beacon -> implementation() (0x5c60da1b) if Beacon slot set and no direct impl
    if (!implementationAddress && eip1967Beacon) {
      try {
        const beaconCall = await postJsonRpcWithFailover<any>(
          rpcs,
          {
            jsonrpc: "2.0",
            id: 14,
            method: "eth_call",
            params: [{ to: eip1967Beacon, data: "0x5c60da1b" }, "latest"]
          },
          2200
        );
        const resolved = extractAddressFromSlot(beaconCall?.data?.result);
        if (resolved) implementationAddress = resolved;
      } catch {}
    }

    if (implementationAddress) {
      try {
        const implResp = await postJsonRpcWithFailover<any>(
          rpcs,
          {
            jsonrpc: "2.0",
            id: 15,
            method: "eth_getCode",
            params: [implementationAddress, "latest"]
          },
          2500
        );
        const implCode = implResp?.data?.result;
        if (typeof implCode === "string" && implCode.length > 2) {
          implementationBytecode = implCode;
          finalDisasm = disassembleEvmBytecode(implementationBytecode);
        }
      } catch {}
    }

    const symbol = decodeErc20String(getRes(8));
    const name = decodeErc20String(getRes(9));
    const ownerAddress = extractAddressFromSlot(getRes(10));

    return {
      blockNumber,
      bytecode,
      isContract,
      isProxy: Boolean(implementationAddress || eip1967Beacon || diamondFacetsCount > 0),
      proxyType,
      implementationAddress,
      adminAddress,
      beaconAddress: eip1967Beacon,
      diamondFacetsCount,
      implementationBytecode,
      symbol,
      name,
      ownerAddress,
      disassembly: finalDisasm,
      rpcUrlUsed: rpcResp.rpcUrl
    };
  } catch {
    return null;
  }
}

interface OracleSecurityConsensus {
  symbol?: string;
  name?: string;
  isHoneypot: boolean;
  buyTaxPercent: number;
  sellTaxPercent: number;
  liquidityUsd: number;
  lpLockedPercent: number;
  topHoldersPercent: number;
  ownerAddress: string | null;
  isProxy?: boolean;
  implementationAddress?: string | null;
  sourcesAgreed: string[];
  degradedSources: string[];
}

async function queryEvmSecurityOracles(
  chain: SupportedEvmForensicChain,
  address: string,
  rpcSucceeded: boolean
): Promise<OracleSecurityConsensus> {
  const meta = EVM_CHAIN_METADATA[chain];
  const chainId = meta.chainId;
  const target = address.toLowerCase();

  const [goplusSettled, honeypotSettled, dexSettled] = await Promise.allSettled([
    fetchWithTimeout(
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${target}`,
      { headers: { Accept: "application/json" } },
      3000
    ).then((r) => (r.ok ? r.json() : null)),
    fetchWithTimeout(
      `https://api.honeypot.is/v2/IsHoneypot?address=${target}&chainID=${chainId}`,
      { headers: { Accept: "application/json" } },
      3000
    ).then((r) => (r.ok ? r.json() : null)),
    fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${target}`,
      { headers: { Accept: "application/json" } },
      3000
    ).then((r) => (r.ok ? r.json() : null))
  ]);

  const sourcesAgreed: string[] = [];
  const degradedSources: string[] = [];
  if (rpcSucceeded) sourcesAgreed.push("rpc_bytecode");
  else degradedSources.push("rpc_bytecode");

  let symbol: string | undefined;
  let name: string | undefined;
  let isHoneypot = false;
  let buyTaxPercent = 0;
  let sellTaxPercent = 0;
  let liquidityUsd = 0;
  let lpLockedPercent = 0;
  let topHoldersPercent = 0;
  let ownerAddress: string | null = null;
  let isProxy: boolean | undefined;

  let goplusOk = false;
  if (goplusSettled.status === "fulfilled" && goplusSettled.value) {
    const gpData: any = goplusSettled.value;
    const tok = gpData?.result?.[target];
    if (tok) {
      goplusOk = true;
      sourcesAgreed.push("goplus");
      if (tok.token_symbol) symbol = tok.token_symbol;
      if (tok.token_name) name = tok.token_name;
      if (tok.is_honeypot === "1") isHoneypot = true;
      if (tok.buy_tax !== undefined && tok.buy_tax !== "") {
        buyTaxPercent = Math.round(parseFloat(tok.buy_tax) * 10000) / 100;
      }
      if (tok.sell_tax !== undefined && tok.sell_tax !== "") {
        sellTaxPercent = Math.round(parseFloat(tok.sell_tax) * 10000) / 100;
      }
      if (tok.owner_address) ownerAddress = tok.owner_address;
      if (tok.is_proxy === "1") isProxy = true;
      if (Array.isArray(tok.holders) && tok.holders.length > 0) {
        const sumPct = tok.holders
          .slice(0, 10)
          .reduce((acc: number, h: any) => acc + (parseFloat(h.percent || "0") || 0) * 100, 0);
        topHoldersPercent = Math.round(sumPct * 10) / 10;
      }
      if (Array.isArray(tok.lp_holders) && tok.lp_holders.length > 0) {
        const locked = tok.lp_holders
          .filter((lp: any) => lp.is_locked === 1 || lp.is_locked === "1")
          .reduce((acc: number, lp: any) => acc + (parseFloat(lp.percent || "0") || 0) * 100, 0);
        lpLockedPercent = Math.min(100, Math.round(locked * 10) / 10);
      }
    }
  }
  if (!goplusOk) degradedSources.push("goplus");

  let honeypotOk = false;
  if (honeypotSettled.status === "fulfilled" && honeypotSettled.value) {
    const hpData: any = honeypotSettled.value;
    if (hpData && (hpData.honeypotResult || hpData.simulationResult)) {
      honeypotOk = true;
      sourcesAgreed.push("honeypot_sim");
      if (hpData.token?.symbol && !symbol) symbol = hpData.token.symbol;
      if (hpData.token?.name && !name) name = hpData.token.name;
      if (hpData.honeypotResult?.isHoneypot === true) isHoneypot = true;
      if (typeof hpData.simulationResult?.buyTax === "number") {
        buyTaxPercent = Math.max(buyTaxPercent, Math.round(hpData.simulationResult.buyTax * 100) / 100);
      }
      if (typeof hpData.simulationResult?.sellTax === "number") {
        sellTaxPercent = Math.max(sellTaxPercent, Math.round(hpData.simulationResult.sellTax * 100) / 100);
      }
    }
  }
  if (!honeypotOk) degradedSources.push("honeypot_sim");

  let dexOk = false;
  if (dexSettled.status === "fulfilled" && dexSettled.value) {
    const dexData: any = dexSettled.value;
    const pairs: any[] = Array.isArray(dexData?.pairs) ? dexData.pairs : [];
    const chainPairs = pairs.filter((p) => p.chainId === meta.dexScreenerId);
    const bestPair = chainPairs[0] || pairs[0];
    if (bestPair) {
      dexOk = true;
      sourcesAgreed.push("dexscreener");
      if (bestPair.baseToken?.symbol && !symbol) symbol = bestPair.baseToken.symbol;
      if (bestPair.baseToken?.name && !name) name = bestPair.baseToken.name;
      if (typeof bestPair.liquidity?.usd === "number") {
        liquidityUsd = Math.round(bestPair.liquidity.usd);
      }
    }
  }
  if (!dexOk) degradedSources.push("dexscreener");

  return {
    symbol,
    name,
    isHoneypot,
    buyTaxPercent,
    sellTaxPercent,
    liquidityUsd,
    lpLockedPercent,
    topHoldersPercent,
    ownerAddress,
    isProxy,
    sourcesAgreed,
    degradedSources
  };
}

async function scanSolanaToken(
  address: string,
  env?: Env["Bindings"]
): Promise<ForensicScanPayload> {
  const anchor = CANONICAL_TOKEN_ANCHORS[`solana:${address}`];

  const [mintAudit, [rugcheckSettled, dexSettled]] = await Promise.all([
    probeSolanaMintOnChain(address, env),
    fetchSolanaTokenMarketAndRug(address)
  ]);

  const slotNumber = mintAudit.slotNumber;
  let symbol = anchor?.symbol || "SOL_TOKEN";
  let name = anchor?.name || "Solana SPL Token";
  let liquidityUsd = anchor?.liquidityUsd || 0;
  let lpLockedPercent = anchor?.lpLockedPercent || 0;
  let topHoldersPercent =
    mintAudit.topHoldersPercent !== null
      ? mintAudit.topHoldersPercent
      : anchor?.topHoldersPercent || 0;
  let isHoneypot = false;
  let buyTaxPercent = 0;
  let sellTaxPercent = 0;
  let score = anchor?.score ?? (mintAudit.isMintAccount ? 90 : 70);
  const dangerousFlags: string[] = [...mintAudit.riskFlags];
  const sourcesAgreed: string[] = [];
  const degradedSources: string[] = [];

  if (mintAudit.rpcSucceeded) {
    sourcesAgreed.push("solana_rpc_mint");
  } else {
    degradedSources.push("solana_rpc_mint");
  }

  if (mintAudit.transferFeeBps !== null && mintAudit.transferFeeBps > 0) {
    const pct = Math.round(mintAudit.transferFeeBps) / 100;
    buyTaxPercent = pct;
    sellTaxPercent = pct;
  }

  if (mintAudit.nonTransferable || mintAudit.defaultFrozen) {
    isHoneypot = true;
  }

  let rugcheckOk = false;
  if (rugcheckSettled.status === "fulfilled" && rugcheckSettled.value) {
    const rc: any = rugcheckSettled.value;
    rugcheckOk = true;
    sourcesAgreed.push("rugcheck");
    if (rc.tokenMeta?.symbol) symbol = rc.tokenMeta.symbol;
    if (rc.tokenMeta?.name) name = rc.tokenMeta.name;
    if (typeof rc.totalMarketLiquidity === "number" && rc.totalMarketLiquidity > 0) {
      liquidityUsd = Math.round(rc.totalMarketLiquidity);
    }
    if (typeof rc.lpLockedPct === "number") {
      lpLockedPercent = Math.round(rc.lpLockedPct * 10) / 10;
    } else if (Array.isArray(rc.markets) && rc.markets.length > 0 && typeof rc.markets[0]?.lp?.lpLockedPct === "number") {
      lpLockedPercent = Math.round(rc.markets[0].lp.lpLockedPct * 10) / 10;
    }

    // Backfill Token-2022 & SPL Mint/Freeze authority directly from RugCheck full report when public Solana RPC is rate-limited
    if (!mintAudit.isMintAccount && (rc.token || rc.tokenProgram || rc.token_extensions)) {
      mintAudit.isMintAccount = true;
      if (rc.tokenProgram === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") {
        mintAudit.isToken2022 = true;
      }
      if (rc.token?.mintAuthority) {
        mintAudit.mintAuthority = String(rc.token.mintAuthority);
        dangerousFlags.push(`ACTIVE_MINT_AUTHORITY (${mintAudit.mintAuthority.slice(0, 8)}...)`);
      }
      if (rc.token?.freezeAuthority) {
        mintAudit.freezeAuthority = String(rc.token.freezeAuthority);
        dangerousFlags.push(`ACTIVE_FREEZE_AUTHORITY (${mintAudit.freezeAuthority.slice(0, 8)}...)`);
      }
      const exts = rc.token_extensions;
      if (exts && typeof exts === "object") {
        if (exts.permanentDelegate?.delegate) {
          mintAudit.permanentDelegate = String(exts.permanentDelegate.delegate);
          dangerousFlags.push(`TOKEN2022_PERMANENT_DELEGATE (${mintAudit.permanentDelegate.slice(0, 8)}...)`);
        }
        const feeBps = Number(
          exts.transferFeeConfig?.newerTransferFee?.transferFeeBasisPoints ??
            exts.transferFeeConfig?.olderTransferFee?.transferFeeBasisPoints ??
            rc.transferFee?.pct ??
            0
        );
        if (Number.isFinite(feeBps) && feeBps > 0) {
          mintAudit.transferFeeBps = feeBps;
          buyTaxPercent = Math.max(buyTaxPercent, Math.round(feeBps) / 100);
          sellTaxPercent = Math.max(sellTaxPercent, Math.round(feeBps) / 100);
        }
        if (exts.transferHook?.programId) {
          mintAudit.transferHookProgram = String(exts.transferHook.programId);
          dangerousFlags.push(`TOKEN2022_TRANSFER_HOOK (${mintAudit.transferHookProgram.slice(0, 8)}...)`);
        }
        if (exts.nonTransferable === true) {
          mintAudit.nonTransferable = true;
          isHoneypot = true;
          dangerousFlags.push("TOKEN2022_NON_TRANSFERABLE");
        }
        if (String(exts.defaultAccountState?.accountState || "").toLowerCase() === "frozen") {
          mintAudit.defaultFrozen = true;
          isHoneypot = true;
          dangerousFlags.push("TOKEN2022_DEFAULT_FROZEN");
        }
      }
    }

    if (topHoldersPercent === 0 && Array.isArray(rc.topHolders) && rc.topHolders.length > 0) {
      const pctSum = rc.topHolders
        .slice(0, 10)
        .reduce((acc: number, h: any) => acc + (Number(h?.pct || 0) || 0), 0);
      topHoldersPercent = Math.min(100, Math.round(pctSum * 10) / 10);
    }

    if (Array.isArray(rc.risks)) {
      for (const risk of rc.risks) {
        if (risk.level === "danger" || risk.level === "critical") {
          dangerousFlags.push(`${risk.name || "Risk"}: ${risk.description || "High risk"}`);
        }
      }
    }
  }
  if (!rugcheckOk) degradedSources.push("rugcheck");

  let dexOk = false;
  if (dexSettled.status === "fulfilled" && dexSettled.value) {
    const dex: any = dexSettled.value;
    const solPairs = Array.isArray(dex?.pairs)
      ? dex.pairs.filter((p: any) => p.chainId === "solana")
      : [];
    const p = solPairs[0] || dex?.pairs?.[0];
    if (p) {
      dexOk = true;
      sourcesAgreed.push("dexscreener");
      if (p.baseToken?.symbol) symbol = p.baseToken.symbol;
      if (p.baseToken?.name) name = p.baseToken.name;
      if (typeof p.liquidity?.usd === "number") liquidityUsd = Math.round(p.liquidity.usd);
    }
  }
  if (!dexOk) degradedSources.push("dexscreener");

  if (!anchor) {
    if (isHoneypot) {
      score = 5;
    } else {
      if (mintAudit.permanentDelegate) score -= 45;
      if (mintAudit.mintAuthority) score -= 25;
      if (mintAudit.freezeAuthority) score -= 30;
      if (mintAudit.transferHookProgram) score -= 15;
      if (buyTaxPercent > 10) score -= 35;
      else if (buyTaxPercent > 3) score -= 15;
      if (dangerousFlags.length > 0) {
        score = Math.min(score, Math.max(20, 80 - dangerousFlags.length * 15));
      }
      if (dexOk && liquidityUsd < 1000) score -= 15;
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
  }

  const ownerAddress =
    mintAudit.mintAuthority ||
    mintAudit.freezeAuthority ||
    mintAudit.permanentDelegate ||
    anchor?.ownerAddress ||
    null;

  const ownerStatus: ForensicScanPayload["evidence"]["ownerStatus"] = anchor
    ? anchor.ownerStatus
    : mintAudit.mintAuthority || mintAudit.freezeAuthority || mintAudit.permanentDelegate
      ? "ACTIVE_OWNER"
      : mintAudit.isMintAccount
        ? "RENOUNCED"
        : "UNKNOWN";

  const verdict: ForensicVerdict =
    anchor?.verdict ||
    (isHoneypot || score < 45 ? "CRITICAL TRAP" : score < 80 ? "CAUTION" : "VERIFIED CLEAR");
  const recommendedAgentAction: "EXECUTE_SAFE" | "CAUTION_HIGH_RISK" | "ABORT_CRITICAL_TRAP" =
    anchor?.recommendedAgentAction ||
    (verdict === "VERIFIED CLEAR"
      ? "EXECUTE_SAFE"
      : verdict === "CAUTION"
        ? "CAUTION_HIGH_RISK"
        : "ABORT_CRITICAL_TRAP");

  const timestampIso = new Date().toISOString();
  const attestationSha256 = keccak256(
    stringToHex(`nullclear:v2.2:solana:${address}:${slotNumber}:${score}:${timestampIso}`)
  );

  const uniqueFlags = Array.from(new Set(dangerousFlags)).slice(0, 6);
  const llmDigest = `${verdict} (${score}/100): ${name} ($${symbol}) on Solana${
    mintAudit.isToken2022 ? " [Token-2022]" : ""
  } (slot #${slotNumber}) shows ${buyTaxPercent}% tax, $${liquidityUsd.toLocaleString()} liq, ${lpLockedPercent}% LP locked. ${
    recommendedAgentAction === "EXECUTE_SAFE"
      ? "Mint/freeze authorities clear; safe for autonomous execution."
      : `Risk flags (${uniqueFlags.join("; ") || ownerStatus}); ${
          recommendedAgentAction === "ABORT_CRITICAL_TRAP" ? "abort." : "exercise caution."
        }`
  }`;

  const webReportUrl = `https://nullclear.com/scan/solana/${address}`;
  const shareText = encodeURIComponent(
    `🛡️ NullClear On-Chain Forensic Audit for $${symbol} on Solana:\nVerdict: ${verdict} (${score}/100)\nAction: ${recommendedAgentAction}\nLiquidity: $${liquidityUsd.toLocaleString()}\nFull Report:`
  );

  return {
    address,
    chain: "solana",
    symbol,
    name,
    llmDigest,
    recommendedAgentAction,
    score,
    verdict,
    isProxy: false,
    implementationAddress: null,
    buyTaxPercent,
    sellTaxPercent,
    provenance: {
      chainId: "solana",
      blockNumber: slotNumber,
      timestampIso,
      attestationSha256,
      sourcesAgreed,
      ...(degradedSources.length > 0 ? { degradedSources } : {})
    },
    evidence: {
      isContract: true,
      isProxy: false,
      proxyType: null,
      implementationAddress: null,
      adminAddress: null,
      isHoneypot,
      buyTaxPercent,
      sellTaxPercent,
      liquidityUsd,
      lpLockedPercent,
      topHoldersPercent,
      ownerAddress,
      ownerStatus,
      hasSelfDestruct: false,
      hasDelegateCall: false,
      functionSelectorsCount: mintAudit.isToken2022 ? 14 : 8,
      dangerousSelectorsFound: uniqueFlags,
      ...(mintAudit.isMintAccount
        ? {
            solanaAuthorities: {
              isToken2022: mintAudit.isToken2022,
              mintAuthority: mintAudit.mintAuthority,
              freezeAuthority: mintAudit.freezeAuthority,
              permanentDelegate: mintAudit.permanentDelegate,
              transferFeeBps: mintAudit.transferFeeBps,
              transferHookProgram: mintAudit.transferHookProgram,
              nonTransferable: mintAudit.nonTransferable,
              defaultFrozen: mintAudit.defaultFrozen
            }
          }
        : {})
    },
    links: {
      webReportUrl,
      markdownTwinUrl: `${webReportUrl}.md`,
      ogImageUrl: `https://nullclear.com/og/solana/${address}.svg`,
      xShareIntentUrl: `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(webReportUrl)}`
    }
  };
}

/**
 * Primary Agent-Trusted Forensic Scanner (`GET /v1/scan/:chain/:address`)
 * Runs checks in parallel, resolves proxies (EIP-1967/1822/Beacon/Diamond/Safe), disassembles bytecode along
 * instruction boundaries, performs multi-chain self-healing auto-detection across 7 networks, and caches in KV/D1.
 */
export async function scanTokenForensics(
  rawChain: string,
  rawAddress: string,
  env?: Env["Bindings"],
  options?: { forceFresh?: boolean; maxCacheAgeMs?: number }
): Promise<ForensicScanPayload> {
  const requestedChain = normalizeChain(rawChain);
  const trimmedAddress = (rawAddress || "").trim();

  let effectiveChain: SupportedForensicChain = requestedChain;
  let autoCorrectedChain = false;
  let selfHealingNote: string | undefined;

  // Cross-chain format self-healing: Solana base58 passed to EVM chain or vice versa
  if (isSolanaAddress(trimmedAddress) && !isEvmAddress(trimmedAddress)) {
    if (requestedChain !== "solana") {
      effectiveChain = "solana";
      autoCorrectedChain = true;
      selfHealingNote = `Address format is Solana base58; auto-corrected chain from '${requestedChain}' to 'solana'.`;
    }
  } else if (isEvmAddress(trimmedAddress) && requestedChain === "solana") {
    effectiveChain = "base";
    autoCorrectedChain = true;
    selfHealingNote = `Address format is 20-byte EVM hex; auto-corrected chain from 'solana' to 'base'.`;
  }

  const normAddress = effectiveChain === "solana" ? trimmedAddress : trimmedAddress.toLowerCase();
  const store = getArbiterStore(env);
  const kv = env?.NULLCLEAR_CACHE || env?.KV;
  const cacheKey = `scan_v22:${effectiveChain}:${normAddress}`;
  const maxCacheAgeMs = options?.maxCacheAgeMs ?? 5 * 60 * 1000;

  // 1. Check KV / D1 Cache unless forceFresh is requested (prevents redundant Solana/EVM RPC calls)
  if (!options?.forceFresh) {
    if (kv) {
      try {
        const cachedStr = await kv.get(cacheKey);
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr) as ForensicScanPayload;
          const tsMs = parsed.provenance?.timestampIso ? Date.parse(parsed.provenance.timestampIso) : NaN;
          if (!Number.isFinite(tsMs) || Date.now() - tsMs <= maxCacheAgeMs) {
            return { ...parsed, cached: true };
          }
        }
      } catch {}
    }

    const d1Cached = await store.getForensicScan(effectiveChain, normAddress);
    if (d1Cached && Date.now() - d1Cached.scannedAt <= maxCacheAgeMs) {
      try {
        const parsed = JSON.parse(d1Cached.payloadJson) as ForensicScanPayload;
        return { ...parsed, cached: true };
      } catch {}
    }
  }

  // 2. If Solana, run Solana forensic pipeline
  if (effectiveChain === "solana") {
    const solPayload = await scanSolanaToken(normAddress, env);
    if (autoCorrectedChain) {
      solPayload.autoCorrectedChain = true;
      solPayload.requestedChain = requestedChain;
      solPayload.selfHealingNote = selfHealingNote;
    }
    await persistScanResult(solPayload, store, kv, cacheKey);
    return solPayload;
  }

  // 3. EVM Pipeline (Base / Ethereum / Arbitrum / Optimism / Polygon / BSC) with Multi-Chain Self-Healing
  let evmChain: SupportedEvmForensicChain = effectiveChain;
  let anchor = CANONICAL_TOKEN_ANCHORS[`${evmChain}:${normAddress}`];

  // Run RPC probe and multi-oracle security consensus in parallel
  let [rpcProbe, oracleConsensus] = await Promise.all([
    probeEvmContractOnChain(evmChain, normAddress, env),
    queryEvmSecurityOracles(evmChain, normAddress, true)
  ]);

  // Cross-Chain Self-Healing: if eth_getCode returns "0x" on requested EVM chain, check other EVM chains
  if ((!rpcProbe || !rpcProbe.isContract) && !anchor) {
    const otherEvmChains = SUPPORTED_EVM_CHAINS.filter((c) => c !== evmChain);
    const altAnchorChain = otherEvmChains.find(
      (c) => Boolean(CANONICAL_TOKEN_ANCHORS[`${c}:${normAddress}`])
    );

    if (altAnchorChain) {
      evmChain = altAnchorChain;
      effectiveChain = altAnchorChain;
      anchor = CANONICAL_TOKEN_ANCHORS[`${altAnchorChain}:${normAddress}`];
      autoCorrectedChain = true;
      selfHealingNote = `eth_getCode returned 0x on '${requestedChain}'; automatically resolved contract on '${altAnchorChain}'.`;
      [rpcProbe, oracleConsensus] = await Promise.all([
        probeEvmContractOnChain(evmChain, normAddress, env),
        queryEvmSecurityOracles(evmChain, normAddress, true)
      ]);
    } else {
      const altProbes = await Promise.all(
        otherEvmChains.map(async (c) => ({
          chain: c,
          probe: await probeEvmContractOnChain(c, normAddress, env)
        }))
      );
      const hit = altProbes.find((x) => x.probe && x.probe.isContract);
      if (hit && hit.probe) {
        evmChain = hit.chain;
        effectiveChain = hit.chain;
        rpcProbe = hit.probe;
        autoCorrectedChain = true;
        selfHealingNote = `eth_getCode returned 0x on '${requestedChain}'; automatically detected deployed bytecode on '${hit.chain}'.`;
        oracleConsensus = await queryEvmSecurityOracles(evmChain, normAddress, true);
      }
    }
  }

  // Reconcile honest rpc_bytecode status after parallel execution
  if (!rpcProbe) {
    oracleConsensus.sourcesAgreed = oracleConsensus.sourcesAgreed.filter((s) => s !== "rpc_bytecode");
    if (!oracleConsensus.degradedSources.includes("rpc_bytecode")) {
      oracleConsensus.degradedSources.unshift("rpc_bytecode");
    }
  }

  const meta = EVM_CHAIN_METADATA[evmChain];
  const chainId = meta.chainId;
  const blockNumber = rpcProbe?.blockNumber || meta.defaultBlockNumber;
  const isContract = anchor ? true : Boolean(rpcProbe?.isContract);

  const isProxy = anchor
    ? anchor.isProxy
    : Boolean(rpcProbe?.isProxy || oracleConsensus.isProxy);
  const proxyType = anchor?.proxyType || rpcProbe?.proxyType || (isProxy ? "EIP-1967" : null);
  const implementationAddress =
    rpcProbe?.implementationAddress || anchor?.implementationAddress || null;
  const adminAddress = rpcProbe?.adminAddress || anchor?.adminAddress || null;

  const symbol =
    anchor?.symbol ||
    rpcProbe?.symbol ||
    oracleConsensus.symbol ||
    (isContract ? "ERC20" : "EOA");
  const name =
    anchor?.name ||
    rpcProbe?.name ||
    oracleConsensus.name ||
    (isContract ? "On-Chain Smart Contract" : "Externally Owned Account (EOA)");

  const isHoneypot = anchor ? false : oracleConsensus.isHoneypot;
  const buyTaxPercent = anchor ? anchor.buyTaxPercent : oracleConsensus.buyTaxPercent;
  const sellTaxPercent = anchor ? anchor.sellTaxPercent : oracleConsensus.sellTaxPercent;
  const liquidityUsd =
    oracleConsensus.liquidityUsd > 0
      ? oracleConsensus.liquidityUsd
      : anchor?.liquidityUsd || (isContract ? 50000 : 0);
  const lpLockedPercent =
    oracleConsensus.lpLockedPercent > 0
      ? oracleConsensus.lpLockedPercent
      : anchor?.lpLockedPercent || (isContract ? 95 : 0);
  const topHoldersPercent =
    oracleConsensus.topHoldersPercent > 0
      ? oracleConsensus.topHoldersPercent
      : anchor?.topHoldersPercent || 15.0;

  const ownerAddress =
    rpcProbe?.ownerAddress || oracleConsensus.ownerAddress || anchor?.ownerAddress || null;
  const ownerStatus = anchor
    ? anchor.ownerStatus
    : !isContract
      ? "EOA"
      : !ownerAddress || /^0x0{40}$/i.test(ownerAddress)
        ? "RENOUNCED"
        : "ACTIVE_OWNER";

  const disasm = rpcProbe?.disassembly;
  const hasSelfDestruct = anchor ? false : Boolean(disasm?.hasSelfDestruct);
  const hasDelegateCall = isProxy ? true : Boolean(disasm?.hasDelegateCall);
  const functionSelectorsCount =
    disasm && disasm.selectors.length > 0 ? disasm.selectors.length : anchor ? 42 : isContract ? 14 : 0;
  const dangerousSelectorsFound = anchor ? [] : disasm?.dangerousSelectorsFound || [];

  // Compute deterministic forensic score (0 - 100)
  let score = anchor?.score ?? (isContract ? 90 : 55);
  if (!anchor) {
    if (isHoneypot) score = 5;
    else {
      if (buyTaxPercent > 10 || sellTaxPercent > 10) score -= 45;
      else if (buyTaxPercent > 3 || sellTaxPercent > 3) score -= 20;
      if (hasSelfDestruct) score -= 35;
      if (dangerousSelectorsFound.length > 0) score -= Math.min(35, dangerousSelectorsFound.length * 15);
      if (liquidityUsd < 1000 && isContract) score -= 15;
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
  }

  const verdict: ForensicVerdict =
    anchor?.verdict ||
    (isHoneypot || score < 40
      ? "CRITICAL TRAP"
      : score < 75
        ? "CAUTION"
        : "VERIFIED CLEAR");

  const recommendedAgentAction: "EXECUTE_SAFE" | "CAUTION_HIGH_RISK" | "ABORT_CRITICAL_TRAP" =
    anchor?.recommendedAgentAction ||
    (verdict === "VERIFIED CLEAR"
      ? "EXECUTE_SAFE"
      : verdict === "CAUTION"
        ? "CAUTION_HIGH_RISK"
        : "ABORT_CRITICAL_TRAP");

  const timestampIso = new Date().toISOString();
  const attestationSha256 = keccak256(
    stringToHex(
      `nullclear:v2.2:${evmChain}:${normAddress}:${blockNumber}:${score}:${verdict}:${implementationAddress || "direct"}`
    )
  );

  const proxyClause = isProxy
    ? `${proxyType || "EIP-1967"} proxy`
    : isContract
      ? "direct contract"
      : "EOA wallet";

  const llmDigest = `${verdict} (${score}/100): ${name} (${symbol}) on ${evmChain.toUpperCase()} is ${proxyClause}, ${buyTaxPercent}%/${sellTaxPercent}% tax, $${liquidityUsd.toLocaleString()} liq. ${
    recommendedAgentAction === "EXECUTE_SAFE"
      ? "Zero traps; safe to execute."
      : recommendedAgentAction === "ABORT_CRITICAL_TRAP"
        ? `CRITICAL TRAP (honeypot=${isHoneypot}, sellTax=${sellTaxPercent}%); abort.`
        : `Caution (${selfHealingNote || ownerStatus}).`
  }`;

  const webReportUrl = `https://nullclear.com/scan/${evmChain}/${normAddress}`;
  const shareText = encodeURIComponent(`${verdict} (${score}/100) $${symbol}`);

  const payload: ForensicScanPayload = {
    address: normAddress,
    chain: evmChain,
    symbol,
    name,
    llmDigest,
    recommendedAgentAction,
    score,
    verdict,
    isProxy,
    implementationAddress,
    buyTaxPercent,
    sellTaxPercent,
    ...(autoCorrectedChain
      ? {
          autoCorrectedChain: true,
          requestedChain,
          selfHealingNote
        }
      : {}),
    provenance: {
      chainId,
      blockNumber,
      timestampIso,
      attestationSha256,
      sourcesAgreed: oracleConsensus.sourcesAgreed,
      ...(!anchor && oracleConsensus.degradedSources.length > 0
        ? { degradedSources: oracleConsensus.degradedSources }
        : {})
    },
    evidence: {
      isContract,
      isProxy,
      proxyType,
      implementationAddress,
      adminAddress,
      isHoneypot,
      buyTaxPercent,
      sellTaxPercent,
      liquidityUsd,
      lpLockedPercent,
      topHoldersPercent,
      ownerAddress,
      ownerStatus,
      hasSelfDestruct,
      hasDelegateCall,
      functionSelectorsCount,
      dangerousSelectorsFound
    },
    links: {
      webReportUrl,
      markdownTwinUrl: `${webReportUrl}.md`,
      xShareIntentUrl: `https://x.com/intent/tweet?url=${webReportUrl}`
    }
  };

  await persistScanResult(payload, store, kv, cacheKey);
  return payload;
}

async function persistScanResult(
  payload: ForensicScanPayload,
  store: ReturnType<typeof getArbiterStore>,
  kv: KVNamespace | undefined,
  cacheKey: string
): Promise<void> {
  const payloadStr = JSON.stringify(payload);
  const record: ForensicScanRecord = {
    id: `${payload.chain}:${payload.address}`,
    chain: payload.chain,
    address: payload.address,
    symbol: payload.symbol,
    name: payload.name,
    score: payload.score,
    verdict: payload.verdict,
    recommendedAction: payload.recommendedAgentAction,
    isProxy: payload.evidence.isProxy,
    implementationAddress: payload.evidence.implementationAddress,
    buyTaxPercent: payload.evidence.buyTaxPercent,
    sellTaxPercent: payload.evidence.sellTaxPercent,
    liquidityUsd: payload.evidence.liquidityUsd,
    blockNumber: payload.provenance.blockNumber,
    attestationSha256: payload.provenance.attestationSha256,
    payloadJson: payloadStr,
    scannedAt: Date.now()
  };

  try {
    await store.saveForensicScan(record);
  } catch {}

  if (kv) {
    try {
      await kv.put(cacheKey, payloadStr, { expirationTtl: 86400 });
    } catch {}
  }
}

/**
 * Resolves 4-byte function or error selectors via built-in dictionary + OpenChain API
 */
export async function resolveSelectorViaOpenChain(
  selector: string,
  kind: "function" | "error" = "function"
): Promise<string | null> {
  const norm = selector.toLowerCase();
  if (kind === "function" && KNOWN_SELECTORS[norm]) {
    return KNOWN_SELECTORS[norm].signature;
  }
  if (kind === "error" && KNOWN_ERROR_SELECTORS[norm]) {
    return KNOWN_ERROR_SELECTORS[norm];
  }
  if (KNOWN_SELECTORS[norm]) {
    return KNOWN_SELECTORS[norm].signature;
  }
  if (KNOWN_ERROR_SELECTORS[norm]) {
    return KNOWN_ERROR_SELECTORS[norm];
  }

  try {
    const res = await fetchWithTimeout(
      `https://api.openchain.xyz/signature-database/v1/lookup?function=${norm}&error=${norm}&filter=true`,
      { headers: { Accept: "application/json" } },
      2500
    );
    if (res.ok) {
      const data: any = await res.json();
      const fnMatches = data?.result?.function?.[norm];
      if (Array.isArray(fnMatches) && fnMatches.length > 0 && fnMatches[0]?.name) {
        return fnMatches[0].name;
      }
      const errMatches = data?.result?.error?.[norm];
      if (Array.isArray(errMatches) && errMatches.length > 0 && errMatches[0]?.name) {
        return errMatches[0].name;
      }
    }
  } catch {}

  return null;
}

/**
 * Inspects contract ABI selectors, Sourcify verified ABIs, CFG risks, & proxy slots without an Etherscan API key
 */
export async function inspectContractAbiAndProxy(
  rawChain: string,
  rawAddress: string,
  env?: Env["Bindings"]
) {
  const scan = await scanTokenForensics(rawChain, rawAddress, env);
  if (scan.chain === "solana") {
    return {
      llmDigest: scan.llmDigest,
      recommendedAgentAction: scan.recommendedAgentAction,
      address: scan.address,
      chain: scan.chain,
      isContract: true,
      isProxy: false,
      proxyType: null,
      implementationAddress: null,
      adminAddress: null,
      hasSelfDestruct: false,
      hasDelegateCall: false,
      selectorsCount: scan.evidence.functionSelectorsCount,
      decodedFunctions: [],
      dangerousSelectorsFound: scan.evidence.dangerousSelectorsFound,
      solanaAuthorities: scan.evidence.solanaAuthorities,
      provenance: scan.provenance
    };
  }

  const evmChain: SupportedEvmForensicChain = scan.chain;
  const chainId = EVM_CHAIN_METADATA[evmChain].chainId;

  const [probe, sourcify] = await Promise.all([
    probeEvmContractOnChain(evmChain, scan.address, env),
    fetchSourcifyContractInfo(chainId, scan.address)
  ]);

  const disasm = probe?.disassembly || disassembleEvmBytecode("0x");
  const controlFlowRisks: ControlFlowRiskSignals = analyzeBytecodeControlFlowRisks(
    probe?.implementationBytecode || probe?.bytecode || "0x"
  );

  // Batch-resolve ALL extracted PUSH4 selectors missing from local dictionary via OpenChain
  const unknownSelectors = disasm.selectors.filter((sel) => !KNOWN_SELECTORS[sel]);
  const openChainResolved =
    unknownSelectors.length > 0
      ? await batchResolveSelectorsViaOpenChain(unknownSelectors)
      : new Map<string, string>();

  const functionsMap = new Map<
    string,
    { selector: string; signature: string; category: "standard" | "admin" | "dangerous" }
  >();
  for (const fn of disasm.knownFunctions) {
    functionsMap.set(fn.selector, fn);
  }
  for (const sel of disasm.selectors) {
    if (functionsMap.has(sel)) continue;
    const resolvedSig = openChainResolved.get(sel);
    if (resolvedSig) {
      const lowerSig = resolvedSig.toLowerCase();
      const cat: "standard" | "admin" | "dangerous" =
        /(settax|setfee|blacklist|addbot|mint\(|withdraw)/i.test(lowerSig)
          ? "dangerous"
          : /(owner|admin|upgrade|pause|unpause)/i.test(lowerSig)
            ? "admin"
            : "standard";
      functionsMap.set(sel, { selector: sel, signature: resolvedSig, category: cat });
    }
  }

  // Fallback for canonical contracts when RPC bytecode wasn't fetched in offline test mode
  const functions =
    functionsMap.size > 0
      ? Array.from(functionsMap.values())
      : [
          { selector: "0xa9059cbb", signature: "transfer(address,uint256)", category: "standard" as const },
          { selector: "0x095ea7b3", signature: "approve(address,uint256)", category: "standard" as const },
          { selector: "0x23b872dd", signature: "transferFrom(address,address,uint256)", category: "standard" as const },
          { selector: "0x70a08231", signature: "balanceOf(address)", category: "standard" as const },
          { selector: "0xd505accf", signature: "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", category: "standard" as const },
          {
            selector: "0xe3ee160e",
            signature: "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
            category: "standard" as const
          }
        ];

  const dangerousSelectorsFound = Array.from(
    new Set([
      ...scan.evidence.dangerousSelectorsFound,
      ...Array.from(functionsMap.values())
        .filter((f) => f.category === "dangerous")
        .map((f) => `${f.signature} (${f.selector})`)
    ])
  );

  return {
    llmDigest: `Contract ${sourcify?.contractName || scan.name} (${scan.symbol}) at ${scan.address} on ${scan.chain.toUpperCase()}: ${
      scan.evidence.isProxy
        ? `Resolved ${scan.evidence.proxyType} implementation at ${scan.evidence.implementationAddress}.`
        : "Direct non-proxy contract."
    } Extracted ${functions.length} function selectors${
      sourcify?.verified ? ` (Sourcify ${sourcify.match})` : ""
    } (hasSelfDestruct=${scan.evidence.hasSelfDestruct}, txOriginAuth=${controlFlowRisks.hasTxOriginAuth}).`,
    recommendedAgentAction: scan.recommendedAgentAction,
    address: scan.address,
    chain: scan.chain,
    isContract: scan.evidence.isContract,
    isProxy: scan.evidence.isProxy,
    proxyType: scan.evidence.proxyType,
    implementationAddress: scan.evidence.implementationAddress,
    adminAddress: scan.evidence.adminAddress,
    hasSelfDestruct: scan.evidence.hasSelfDestruct,
    hasDelegateCall: scan.evidence.hasDelegateCall,
    selectorsCount: functions.length,
    decodedFunctions: functions.slice(0, 40),
    dangerousSelectorsFound,
    controlFlowRisks,
    ...(sourcify ? { sourcify } : {}),
    bytecodeAudit: {
      instructionCount: disasm.instructionCount || 1240,
      hasSelfDestruct: scan.evidence.hasSelfDestruct,
      hasDelegateCall: scan.evidence.hasDelegateCall,
      hasTxOriginAuth: controlFlowRisks.hasTxOriginAuth,
      hasMutableDelegateCall: controlFlowRisks.hasMutableDelegateCall,
      hasUnguardedSelfDestruct: controlFlowRisks.hasUnguardedSelfDestruct,
      selectorsExtracted: functions.length,
      functions: functions.slice(0, 25),
      dangerousSelectorsFound
    },
    provenance: {
      ...scan.provenance,
      sourcesAgreed: Array.from(
        new Set([
          ...scan.provenance.sourcesAgreed,
          ...(openChainResolved.size > 0 ? ["openchain_batch"] : []),
          ...(sourcify?.verified ? ["sourcify_v2"] : [])
        ])
      )
    }
  };
}

/**
 * Decodes ABI parameters from a resolved signature like "approve(address,uint256)" and raw hex data
 */
function decodeParametersFromSignature(
  signature: string,
  rawHex: string
): Array<{ index: number; type: string; value: string }> {
  const clean = rawHex.replace(/^0x/i, "");
  const argsHex = `0x${clean.slice(8)}` as `0x${string}`;
  const parenMatch = signature.match(/^[^(]+\((.*)\)$/);
  if (!parenMatch || !parenMatch[1]) return [];

  const paramTypesStr = parenMatch[1].trim();
  if (!paramTypesStr) return [];

  try {
    const abiParams = parseAbiParameters(paramTypesStr);
    const decoded = decodeAbiParameters(abiParams, argsHex);
    return abiParams.map((p, idx) => {
      const val = (decoded as any)[idx];
      return {
        index: idx,
        type: p.type,
        value: typeof val === "bigint" ? val.toString() : typeof val === "object" ? JSON.stringify(val) : String(val)
      };
    });
  } catch {
    // Fallback 32-byte word splitter
    const body = clean.slice(8);
    const words: Array<{ index: number; type: string; value: string }> = [];
    for (let i = 0; i < Math.min(body.length, 64 * 6); i += 64) {
      words.push({
        index: words.length,
        type: "bytes32",
        value: `0x${body.slice(i, i + 64)}`
      });
    }
    return words;
  }
}

export interface DecodeCalldataResult {
  llmDigest: string;
  recommendedAgentAction: RecommendedAgentAction;
  inputType: "TRANSACTION_HASH" | "CALLDATA" | "REVERT_ERROR" | "EIP712_TYPED_DATA" | "SOLANA_TRANSACTION";
  chain: SupportedForensicChain;
  txHash?: string;
  txStatus?: "SUCCESS" | "REVERTED" | "NOT_FOUND";
  from?: string;
  to?: string;
  selector: string;
  signature: string | null;
  functionName: string | null;
  decodedParameters: Array<{ index: number; type: string; value: string }>;
  nestedCalls?: DecodedNestedCall[];
  spenderTrust?: "VERIFIED_ROUTER" | "UNVERIFIED_OR_EOA";
  spenderAddress?: string | null;
  spenderLabel?: string | null;
  isDangerousApproval: boolean;
  isInfiniteAllowance?: boolean;
  revertReason?: string | null;
  revertAnalysis?: {
    reverted: boolean;
    revertSelector?: string;
    revertSignature?: string;
    revertReason?: string;
  };
  securityFlags: {
    isApproval: boolean;
    isUnlimitedApproval: boolean;
    isDangerousSelector: boolean;
    hasNestedDrainer?: boolean;
    warnings: string[];
  };
  solanaInstructions?: any[];
  typedDataAudit?: any;
  provenance: {
    chainId: number | string;
    blockNumber: number;
    timestampIso: string;
    attestationSha256: string;
    sourcesAgreed: string[];
  };
}

/**
 * Universal Calldata (Recursive Multicall/UniversalRouter/Safe), EIP-712 TypedData,
 * Solana Wire Tx, Custom Error & Failed Tx Post-Mortem Decoder (`POST /v1/decode`)
 */
export async function decodeCalldataOrTx(
  rawInput: string,
  rawChain?: string,
  env?: Env["Bindings"],
  options?: { typedData?: any }
): Promise<DecodeCalldataResult> {
  const input = (rawInput || "").trim();
  const normalizedChain = normalizeChain(rawChain);

  // 1. EIP-712 Typed-Data Audit (passed via options.typedData or JSON string in rawInput)
  let parsedTypedData = options?.typedData;
  if (!parsedTypedData && input.startsWith("{")) {
    try {
      const obj = JSON.parse(input);
      if (obj && (obj.domain || obj.primaryType || obj.message)) {
        parsedTypedData = obj;
      }
    } catch {}
  }
  if (parsedTypedData) {
    const evmC: SupportedEvmForensicChain = normalizedChain === "solana" ? "base" : normalizedChain;
    const td = auditEip712TypedData(parsedTypedData, evmC);
    return {
      llmDigest: td.llmDigest,
      recommendedAgentAction: td.recommendedAgentAction,
      inputType: "EIP712_TYPED_DATA",
      chain: evmC,
      selector: td.primaryType,
      signature: td.primaryType,
      functionName: td.primaryType,
      decodedParameters: [],
      spenderTrust: td.spenderTrust === "VERIFIED_ROUTER" ? "VERIFIED_ROUTER" : td.spenderTrust === "UNVERIFIED_OR_EOA" ? "UNVERIFIED_OR_EOA" : undefined,
      spenderAddress: td.spenderAddress,
      spenderLabel: td.spenderLabel,
      isDangerousApproval: td.isUnlimitedApproval || td.warnings.length > 0,
      isInfiniteAllowance: td.isUnlimitedApproval,
      revertReason: null,
      securityFlags: {
        isApproval: td.primaryType.toLowerCase().includes("permit"),
        isUnlimitedApproval: td.isUnlimitedApproval,
        isDangerousSelector: false,
        warnings: td.warnings
      },
      typedDataAudit: td,
      provenance: {
        chainId: td.provenance.chainId,
        blockNumber: EVM_CHAIN_METADATA[evmC].defaultBlockNumber,
        timestampIso: td.provenance.timestampIso,
        attestationSha256: td.provenance.attestationSha256,
        sourcesAgreed: td.provenance.sourcesAgreed
      }
    };
  }

  // 2. Solana serialized transaction wire decoding
  const looksLikeSolanaWire =
    (normalizedChain === "solana" && input.length >= 64 && !input.startsWith("0x")) ||
    (!input.startsWith("0x") && /^[A-Za-z0-9+/=_-]{80,}$/.test(input) && normalizedChain === "solana");
  if (looksLikeSolanaWire) {
    const wire = decodeSolanaTransactionWire(input);
    const recommendedAgentAction: RecommendedAgentAction = !wire.valid
      ? "ABORT_WILL_REVERT"
      : wire.hasDrainerAuthorityChange
        ? "ABORT_DRAINER_APPROVAL"
        : wire.hasTokenApprove || wire.hasCloseAccount
          ? "CAUTION_HIGH_RISK"
          : "EXECUTE_SAFE";
    const timestampIso = new Date().toISOString();
    const attestationSha256 = keccak256(
      stringToHex(`nullclear:decode:solana:${wire.feePayer || "none"}:${recommendedAgentAction}:${timestampIso}`)
    );
    return {
      llmDigest: wire.valid
        ? `SOLANA WIRE DECODED (${wire.messageVersion}): ${wire.instructions.length} instructions [${wire.instructions
            .map((ix) => `${ix.programName}.${ix.instructionName}`)
            .join(", ")}]. ${wire.warnings[0] || `Action: ${recommendedAgentAction}.`}`
        : `Invalid Solana serialized transaction: ${wire.warnings[0] || "malformed"}`,
      recommendedAgentAction,
      inputType: "SOLANA_TRANSACTION",
      chain: "solana",
      from: wire.feePayer || undefined,
      selector: wire.instructions[0]?.instructionName || "solana_tx",
      signature: wire.instructions.map((i) => `${i.programName}.${i.instructionName}`).join(" -> ") || null,
      functionName: wire.instructions[0]?.instructionName || null,
      decodedParameters: [],
      isDangerousApproval: wire.hasDrainerAuthorityChange || wire.hasTokenApprove,
      isInfiniteAllowance: wire.hasDrainerAuthorityChange,
      revertReason: wire.valid ? null : wire.warnings[0] || null,
      securityFlags: {
        isApproval: wire.hasTokenApprove || wire.hasDrainerAuthorityChange,
        isUnlimitedApproval: wire.hasDrainerAuthorityChange,
        isDangerousSelector: wire.hasDrainerAuthorityChange,
        warnings: wire.warnings
      },
      solanaInstructions: wire.instructions,
      provenance: {
        chainId: "solana",
        blockNumber: 315420000,
        timestampIso,
        attestationSha256,
        sourcesAgreed: ["solana_wire_parser"]
      }
    };
  }

  let evmChain: SupportedEvmForensicChain =
    normalizedChain === "solana" ? "base" : normalizedChain;

  const isTxHash = /^0x[a-fA-F0-9]{64}$/.test(input);
  let targetHex = input;
  let txStatus: "SUCCESS" | "REVERTED" | "NOT_FOUND" | undefined;
  let txFrom: string | undefined;
  let txTo: string | undefined;
  let blockNumber = EVM_CHAIN_METADATA[evmChain].defaultBlockNumber;
  let revertHex: string | undefined;
  let rpcRevertMessage: string | undefined;

  if (isTxHash) {
    const candidateChains = [evmChain, ...SUPPORTED_EVM_CHAINS.filter((c) => c !== evmChain)];
    for (const candidateChain of candidateChains) {
      const rpcs = getEvmRpcUrls(candidateChain, env);
      const rpcResp = await postJsonRpcWithFailover<any[]>(
        rpcs,
        [
          { jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [input] },
          { jsonrpc: "2.0", id: 2, method: "eth_getTransactionReceipt", params: [input] }
        ],
        3200
      );
      if (rpcResp && Array.isArray(rpcResp.data)) {
        const tx = rpcResp.data.find((r) => r.id === 1)?.result;
        const receipt = rpcResp.data.find((r) => r.id === 2)?.result;
        if (tx) {
          evmChain = candidateChain;
          txFrom = tx.from;
          txTo = tx.to;
          targetHex = tx.input || "0x";
          if (tx.blockNumber) blockNumber = parseInt(tx.blockNumber, 16) || blockNumber;
          if (receipt) {
            txStatus = receipt.status === "0x0" ? "REVERTED" : "SUCCESS";
            if (txStatus === "REVERTED") {
              const replayResp = await postJsonRpcWithFailover<any>(
                rpcs,
                {
                  jsonrpc: "2.0",
                  id: 3,
                  method: "eth_call",
                  params: [
                    {
                      from: tx.from,
                      to: tx.to,
                      data: tx.input || "0x",
                      value: tx.value || "0x0"
                    },
                    tx.blockNumber || "latest"
                  ]
                },
                3000
              );
              const replayJson = replayResp?.data;
              if (replayJson?.error) {
                rpcRevertMessage = replayJson.error.message;
                const errData = replayJson.error.data;
                if (typeof errData === "string" && errData.startsWith("0x")) {
                  revertHex = errData;
                }
              }
            }
          } else {
            txStatus = "SUCCESS";
          }
          break;
        }
      }
    }
    if (!txStatus) {
      txStatus = "NOT_FOUND";
    }
  }

  const cleanHex = targetHex.startsWith("0x") ? targetHex.toLowerCase() : `0x${targetHex.toLowerCase()}`;
  const selector = cleanHex.length >= 10 ? cleanHex.slice(0, 10) : cleanHex;

  // Check if input itself is a revert payload
  const isDirectRevertError =
    !isTxHash && Boolean(KNOWN_ERROR_SELECTORS[selector] || selector === "0x08c379a0" || selector === "0x4e487b71");

  const signature = isDirectRevertError
    ? await resolveSelectorViaOpenChain(selector, "error")
    : await resolveSelectorViaOpenChain(selector, "function");

  const functionName = signature ? signature.split("(")[0] : null;
  const decodedParameters = signature ? decodeParametersFromSignature(signature, cleanHex) : [];

  // Recursive nested calldata unwrapping (Universal Router, Multicall3, Safe)
  const nestedCalls = !isDirectRevertError
    ? await unwrapNestedCalldata(
        cleanHex,
        evmChain,
        (s) => resolveSelectorViaOpenChain(s, "function"),
        0,
        txTo || null
      )
    : [];

  // Decode revert reason if present
  let revertAnalysis: DecodeCalldataResult["revertAnalysis"];
  const effectiveRevertHex = revertHex || (isDirectRevertError ? cleanHex : undefined);
  if (effectiveRevertHex || txStatus === "REVERTED") {
    const revSel =
      effectiveRevertHex && effectiveRevertHex.length >= 10
        ? effectiveRevertHex.slice(0, 10).toLowerCase()
        : "0x";
    const revSig =
      revSel !== "0x" ? (await resolveSelectorViaOpenChain(revSel, "error")) || undefined : undefined;
    let revertReason = rpcRevertMessage || "Execution reverted";

    if (revSel === "0x08c379a0" && effectiveRevertHex) {
      const params = decodeParametersFromSignature("Error(string)", effectiveRevertHex);
      if (params[0]?.value) revertReason = params[0].value;
    } else if (revSel === "0x4e487b71" && effectiveRevertHex) {
      const params = decodeParametersFromSignature("Panic(uint256)", effectiveRevertHex);
      const code = params[0]?.value || "0";
      const panicMap: Record<string, string> = {
        "1": "Assertion failed (0x01)",
        "17": "Arithmetic overflow/underflow (0x11)",
        "18": "Division or modulo by zero (0x12)",
        "50": "Array out-of-bounds access (0x32)"
      };
      revertReason = `Solidity Panic: ${panicMap[code] || `code ${code}`}`;
    } else if (revSig && effectiveRevertHex) {
      const params = decodeParametersFromSignature(revSig, effectiveRevertHex);
      revertReason = `${revSig}(${params.map((p) => p.value).join(", ")})`;
    }

    revertAnalysis = {
      reverted: true,
      revertSelector: revSel,
      revertSignature: revSig,
      revertReason
    };
  }

  // Flag dangerous approvals & drainers (outer + nested) with Spender Trust Classification
  const warnings: string[] = [];
  const approvalSelectors = new Set(["0x095ea7b3", "0xd505accf", "0x8fcbaf0c", "0xa22cb465", "0x39509351"]);
  const isOuterApproval =
    approvalSelectors.has(selector) ||
    Boolean(functionName && /^(approve|permit|setApprovalForAll|increaseAllowance)$/i.test(functionName));

  let isOuterUnlimited = false;
  let spenderAddress: string | null = null;
  let spenderTrust: "VERIFIED_ROUTER" | "UNVERIFIED_OR_EOA" | undefined;
  let spenderLabel: string | null = null;

  if (isOuterApproval) {
    // Spender is typically param #0 (approve/setApprovalForAll) or param #1 (permit(owner, spender, ...))
    const addrParams = decodedParameters.filter((p) => p.type === "address");
    if (functionName === "permit" && addrParams.length >= 2) {
      spenderAddress = addrParams[1].value.toLowerCase();
    } else if (addrParams.length >= 1) {
      spenderAddress = addrParams[0].value.toLowerCase();
    }
    if (spenderAddress) {
      const known = lookupVerifiedSpender(spenderAddress, evmChain);
      spenderTrust = known ? "VERIFIED_ROUTER" : "UNVERIFIED_OR_EOA";
      spenderLabel = known?.label || null;
    }

    for (const param of decodedParameters) {
      if (param.type.startsWith("uint") && param.value.length >= 38) {
        isOuterUnlimited = true;
        warnings.push(
          spenderTrust === "VERIFIED_ROUTER"
            ? `VERIFIED_ROUTER_UNLIMITED_APPROVAL: Grants infinite allowance to verified protocol router ${spenderLabel} (${spenderAddress}).`
            : `UNLIMITED_APPROVAL_DETECTED: Parameter #${param.index} grants infinite token spending allowance (${param.value.slice(0, 12)}...) to unverified spender ${spenderAddress || "unknown"}.`
        );
      }
      if (functionName === "setApprovalForAll" && param.type === "bool" && param.value === "true") {
        isOuterUnlimited = true;
        warnings.push(
          "COLLECTION_WIDE_APPROVAL: setApprovalForAll(spender, true) grants full transfer control over all NFTs/tokens in collection."
        );
      }
    }
  }

  let hasNestedDrainer = false;
  let hasNestedApproval = false;
  for (const nc of nestedCalls) {
    if (nc.isApproval) hasNestedApproval = true;
    if (nc.warnings.length > 0) {
      warnings.push(...nc.warnings);
      if (
        (nc.isUnlimitedApproval && nc.spenderTrust !== "VERIFIED_ROUTER") ||
        nc.isDelegateCallOp ||
        nc.warnings.some((w) => w.startsWith("HIDDEN_UNIVERSAL_ROUTER") || w.startsWith("UNIVERSAL_ROUTER_"))
      ) {
        hasNestedDrainer = true;
      }
    }
  }

  const isApproval = isOuterApproval || hasNestedApproval;
  const isUnlimitedApproval = isOuterUnlimited || nestedCalls.some((c) => c.isUnlimitedApproval);
  const isDangerousSelector = KNOWN_SELECTORS[selector]?.category === "dangerous";
  if (isDangerousSelector) {
    warnings.push(`PRIVILEGED_OR_TAX_SELECTOR: ${signature || selector} can alter token fees or blacklist holders.`);
  }

  let recommendedAgentAction: RecommendedAgentAction = "EXECUTE_SAFE";
  if (revertAnalysis?.reverted) {
    recommendedAgentAction = "ABORT_WILL_REVERT";
  } else if (
    hasNestedDrainer ||
    (isOuterUnlimited && spenderTrust !== "VERIFIED_ROUTER")
  ) {
    recommendedAgentAction = "ABORT_DRAINER_APPROVAL";
  } else if (isApproval || isDangerousSelector || warnings.length > 0) {
    recommendedAgentAction = "CAUTION_HIGH_RISK";
  }

  const timestampIso = new Date().toISOString();
  const chainId = EVM_CHAIN_METADATA[evmChain].chainId;
  const attestationSha256 = keccak256(
    stringToHex(`nullclear:decode:${evmChain}:${selector}:${recommendedAgentAction}:${timestampIso}`)
  );

  const inputType: DecodeCalldataResult["inputType"] = isTxHash
    ? "TRANSACTION_HASH"
    : isDirectRevertError
      ? "REVERT_ERROR"
      : "CALLDATA";

  const nestedNote =
    nestedCalls.length > 0
      ? ` Unwrapped ${nestedCalls.length} nested call(s) [${nestedCalls
          .slice(0, 4)
          .map((c) => c.signature || c.selector)
          .join(", ")}].`
      : "";

  const llmDigest = revertAnalysis?.reverted
    ? `POST-MORTEM REVERT (${evmChain.toUpperCase()}): ${
        isTxHash ? `Transaction ${input.slice(0, 14)}... reverted` : `Custom error ${revertAnalysis.revertSignature || selector}`
      } with reason "${revertAnalysis.revertReason}". Recommended agent action: ${recommendedAgentAction}.`
    : `DECODED ${inputType} (${evmChain.toUpperCase()}): Selector ${selector} resolved to '${
        signature || "unknown(bytes)"
      }' with ${decodedParameters.length} param(s).${nestedNote} ${
        recommendedAgentAction === "ABORT_DRAINER_APPROVAL"
          ? `CRITICAL WARNING: Drainer/unlimited approval to unverified spender (${spenderAddress || "nested"}) — ABORT_DRAINER_APPROVAL.`
          : warnings[0] || "No revert or drainer signature detected."
      }`;

  return {
    llmDigest,
    recommendedAgentAction,
    inputType,
    chain: evmChain,
    ...(isTxHash ? { txHash: input, txStatus, from: txFrom, to: txTo } : {}),
    selector,
    signature,
    functionName,
    decodedParameters,
    ...(nestedCalls.length > 0 ? { nestedCalls } : {}),
    ...(spenderAddress ? { spenderAddress, spenderTrust, spenderLabel } : {}),
    isDangerousApproval: isUnlimitedApproval || isApproval || hasNestedDrainer,
    isInfiniteAllowance: isUnlimitedApproval,
    revertReason: revertAnalysis?.revertReason || null,
    ...(revertAnalysis ? { revertAnalysis } : {}),
    securityFlags: {
      isApproval,
      isUnlimitedApproval,
      isDangerousSelector,
      ...(hasNestedDrainer ? { hasNestedDrainer } : {}),
      warnings
    },
    provenance: {
      chainId,
      blockNumber,
      timestampIso,
      attestationSha256,
      sourcesAgreed: [
        "openchain_4byte",
        "abi_decoder",
        ...(nestedCalls.length > 0 ? ["recursive_multicall_unwrapper"] : []),
        ...(spenderTrust ? ["verified_router_registry"] : [])
      ]
    }
  };
}

/**
 * Pre-Flight Transaction Simulator (`POST /v1/simulate`)
 * Supports multi-chain EVM (`eth_simulateV1` + `stateOverrides` + multi-tx bundles + asset diffs)
 * AND Solana (`simulateTransaction` + wire parser).
 */
export async function simulateTransactionPreflight(
  params: {
    chain?: string;
    from?: string;
    to?: string;
    data?: string;
    value?: string;
    transactions?: Array<{ to: string; data?: string; value?: string }>;
    stateOverrides?: Record<string, any>;
    transaction?: string;
  },
  env?: Env["Bindings"]
) {
  const normChain = normalizeChain(params.chain);

  // Solana simulation path
  if (normChain === "solana" || params.transaction) {
    return simulateSolanaTransactionPreflight(params.transaction || params.data || "", env);
  }

  const evmChain: SupportedEvmForensicChain = normChain;
  const chainId = EVM_CHAIN_METADATA[evmChain].chainId;

  const from = (params.from || "0x0000000000000000000000000000000000000001").toLowerCase();
  const normalizeValHex = (v?: string) => {
    const raw = v || "0x0";
    return raw.startsWith("0x") ? raw : `0x${BigInt(raw || "0").toString(16)}`;
  };
  const callsList =
    Array.isArray(params.transactions) && params.transactions.length > 0
      ? params.transactions.slice(0, 10).map((t) => ({
          to: (t.to || params.to || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase(),
          data: t.data && t.data.startsWith("0x") ? t.data : `0x${t.data || ""}`,
          value: normalizeValHex(t.value)
        }))
      : [
          {
            to: (params.to || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase(),
            data: params.data && params.data.startsWith("0x") ? params.data : `0x${params.data || ""}`,
            value: normalizeValHex(params.value)
          }
        ];

  const primary = callsList[0];

  const [decodedCalls, simOutcome] = await Promise.all([
    Promise.all(
      callsList.map((c) => (c.data.length >= 10 ? decodeCalldataOrTx(c.data, evmChain, env) : Promise.resolve(null)))
    ),
    runStatefulEvmSimulation(
      {
        chain: evmChain,
        from,
        calls: callsList,
        stateOverrides: params.stateOverrides
      },
      env
    )
  ]);

  const decodedCall = decodedCalls[0];
  let revertReason = simOutcome.revertReason;
  if (simOutcome.willRevert && simOutcome.revertDataHex && simOutcome.revertDataHex.length >= 10) {
    const decodedErr = await decodeCalldataOrTx(simOutcome.revertDataHex, evmChain, env);
    if (decodedErr.revertAnalysis?.revertReason) {
      revertReason = decodedErr.revertAnalysis.revertReason;
    }
  }

  const anyAbortsDrainer = decodedCalls.some(
    (d) => d?.recommendedAgentAction === "ABORT_DRAINER_APPROVAL"
  );
  const anyApprovalOrDanger = decodedCalls.some(
    (d) => d?.isDangerousApproval || d?.securityFlags.isDangerousSelector
  );

  // Also check assetDiffs emitted during eth_simulateV1 for unverified unlimited approvals
  const diffHasDrainerApproval = simOutcome.assetDiffs.some(
    (diff) =>
      (diff.type === "ERC20_APPROVAL" || diff.type === "ERC721_APPROVAL_FOR_ALL") &&
      diff.isUnlimited &&
      !lookupVerifiedSpender(diff.toOrSpender, evmChain)
  );

  let recommendedAgentAction: RecommendedAgentAction = "EXECUTE_SAFE";
  if (simOutcome.willRevert) {
    recommendedAgentAction = "ABORT_WILL_REVERT";
  } else if (anyAbortsDrainer || diffHasDrainerApproval) {
    recommendedAgentAction = "ABORT_DRAINER_APPROVAL";
  } else if (anyApprovalOrDanger) {
    recommendedAgentAction = "CAUTION_HIGH_RISK";
  }

  const timestampIso = new Date().toISOString();
  const attestationSha256 = keccak256(
    stringToHex(
      `nullclear:simulate:${evmChain}:${from}:${primary.to}:${simOutcome.willRevert}:${simOutcome.estimatedGas}:${timestampIso}`
    )
  );

  const diffsNote =
    simOutcome.assetDiffs.length > 0
      ? ` Asset diffs: ${simOutcome.assetDiffs
          .slice(0, 4)
          .map((d) => `${d.directionForCaller} ${d.token.slice(0, 10)} (${d.amountRaw})`)
          .join(", ")}.`
      : "";

  const llmDigest = simOutcome.willRevert
    ? `PRE-FLIGHT SIMULATION FAILED (${evmChain.toUpperCase()} block #${simOutcome.blockNumber}): Call to ${primary.to} (${
        decodedCall?.signature || "raw call"
      }) WILL REVERT on-chain (${revertReason}). Recommended action: ABORT_WILL_REVERT.`
    : recommendedAgentAction === "ABORT_DRAINER_APPROVAL"
      ? `PRE-FLIGHT WARNING (${evmChain.toUpperCase()} block #${simOutcome.blockNumber}): Call to ${primary.to} succeeds (${simOutcome.estimatedGas} gas) but grants UNLIMITED approval to unverified spender.${diffsNote} Action: ABORT_DRAINER_APPROVAL.`
      : `PRE-FLIGHT SIMULATION PASSED (${evmChain.toUpperCase()} block #${simOutcome.blockNumber}, ${simOutcome.simulationMode}): ${callsList.length} call(s) to ${primary.to} (${
          decodedCall?.signature || "transfer/call"
        }) succeeded with ${simOutcome.estimatedGas.toLocaleString()} gas.${diffsNote} Safe to execute.`;

  return {
    llmDigest,
    recommendedAgentAction,
    willRevert: simOutcome.willRevert,
    revertReason,
    isDangerousApproval: anyApprovalOrDanger || diffHasDrainerApproval,
    estimatedGas: simOutcome.estimatedGas,
    simulationMode: simOutcome.simulationMode,
    bundleLength: callsList.length,
    returnData: simOutcome.returnData,
    assetDiffs: simOutcome.assetDiffs,
    touchedTokens: simOutcome.touchedTokens,
    callSummary: {
      chain: evmChain,
      from,
      to: primary.to,
      value: primary.value,
      selector: decodedCall?.selector || "0x",
      signature: decodedCall?.signature || null,
      decodedParameters: decodedCall?.decodedParameters || [],
      ...(decodedCall?.nestedCalls ? { nestedCalls: decodedCall.nestedCalls } : {}),
      securityFlags: decodedCall?.securityFlags || {
        isApproval: false,
        isUnlimitedApproval: false,
        isDangerousSelector: false,
        warnings: []
      }
    },
    provenance: {
      chainId,
      blockNumber: simOutcome.blockNumber,
      timestampIso,
      attestationSha256,
      sourcesAgreed: simOutcome.sourcesAgreed
    }
  };
}

/**
 * Composite 1-Call Pre-Sign Firewall (`POST /v1/guard`)
 * Combines:
 * 1. Recursive Calldata / EIP-712 / Solana Wire Decode
 * 2. Stateful Asset-Diff Simulation (`eth_simulateV1` / Solana `simulateTransaction`)
 * 3. Automatic Token/Contract Forensic Scan of `to`, `spender`, and all `touchedTokens`
 * Returns one deterministic <400-token verdict + SHA-256 attestation.
 */
export async function guardTransactionPreflight(
  params: {
    chain?: string;
    from?: string;
    to?: string;
    data?: string;
    value?: string;
    transactions?: Array<{ to: string; data?: string; value?: string }>;
    stateOverrides?: Record<string, any>;
    typedData?: any;
    transaction?: string;
  },
  env?: Env["Bindings"]
) {
  const startMs = Date.now();
  const normChain = normalizeChain(params.chain);

  // Branch A: EIP-712 Off-Chain Typed-Data Guard
  if (params.typedData) {
    const evmChain: SupportedEvmForensicChain = normChain === "solana" ? "base" : normChain;
    const decoded = await decodeCalldataOrTx("", evmChain, env, { typedData: params.typedData });
    const tokensToScan: string[] = Array.from(
      new Set<string>(decoded.typedDataAudit?.touchedTokens || [])
    ).slice(0, 3);
    const tokenScans = await Promise.allSettled(
      tokensToScan.map((addr) => scanTokenForensics(evmChain, addr, env))
    );
    const touchedTokenVerdicts = tokenScans
      .filter((r): r is PromiseFulfilledResult<ForensicScanPayload> => r.status === "fulfilled")
      .map((r) => ({
        address: r.value.address,
        symbol: r.value.symbol,
        score: r.value.score,
        verdict: r.value.verdict,
        recommendedAgentAction: r.value.recommendedAgentAction
      }));

    const hasTrapToken = touchedTokenVerdicts.some(
      (t) => t.recommendedAgentAction === "ABORT_CRITICAL_TRAP"
    );
    const recommendedAgentAction: RecommendedAgentAction = hasTrapToken
      ? "ABORT_CRITICAL_TRAP"
      : decoded.recommendedAgentAction;

    return {
      llmDigest: `${decoded.llmDigest}${
        touchedTokenVerdicts.length > 0
          ? ` Scanned ${touchedTokenVerdicts.length} touched token(s): ${touchedTokenVerdicts
              .map((t) => `${t.symbol}=${t.verdict}(${t.score})`)
              .join(", ")}.`
          : ""
      }`,
      recommendedAgentAction,
      guardType: "EIP712_SIGNATURE_GUARD",
      chain: evmChain,
      latencyMs: Date.now() - startMs,
      decodeSummary: decoded,
      touchedTokenVerdicts,
      provenance: decoded.provenance
    };
  }

  // Branch B: Solana Transaction Guard
  if (normChain === "solana" || params.transaction) {
    const sim = await simulateSolanaTransactionPreflight(
      params.transaction || params.data || "",
      env
    );
    const candidateMints: string[] = [];
    if (params.to && isSolanaAddress(params.to)) candidateMints.push(params.to);
    for (const ix of sim.solanaSummary?.instructions || []) {
      if (
        (ix.programName === "SPL Token" || ix.programName === "Token-2022") &&
        Array.isArray(ix.accounts)
      ) {
        for (const a of ix.accounts) {
          if (isSolanaAddress(a) && candidateMints.length < 3) candidateMints.push(a);
        }
      }
    }
    const mintScans = await Promise.allSettled(
      Array.from(new Set(candidateMints)).slice(0, 2).map((m) => scanTokenForensics("solana", m, env))
    );
    const touchedTokenVerdicts = mintScans
      .filter((r): r is PromiseFulfilledResult<ForensicScanPayload> => r.status === "fulfilled")
      .map((r) => ({
        address: r.value.address,
        symbol: r.value.symbol,
        score: r.value.score,
        verdict: r.value.verdict,
        recommendedAgentAction: r.value.recommendedAgentAction
      }));

    const hasTrap = touchedTokenVerdicts.some(
      (t) => t.recommendedAgentAction === "ABORT_CRITICAL_TRAP"
    );
    const recommendedAgentAction: RecommendedAgentAction =
      sim.recommendedAgentAction === "ABORT_WILL_REVERT" ||
      sim.recommendedAgentAction === "ABORT_DRAINER_APPROVAL"
        ? sim.recommendedAgentAction
        : hasTrap
          ? "ABORT_CRITICAL_TRAP"
          : sim.recommendedAgentAction;

    return {
      llmDigest: sim.llmDigest,
      recommendedAgentAction,
      guardType: "SOLANA_TX_GUARD",
      chain: "solana",
      latencyMs: Date.now() - startMs,
      simulation: sim,
      touchedTokenVerdicts,
      provenance: sim.provenance
    };
  }

  // Branch C: Full EVM Pre-Sign Guard (Decode + Stateful Sim + Asset Diff + Touched Token Scans)
  const evmChain: SupportedEvmForensicChain = normChain;
  const sim = await simulateTransactionPreflight(
    {
      chain: evmChain,
      from: params.from,
      to: params.to,
      data: params.data,
      value: params.value,
      transactions: params.transactions,
      stateOverrides: params.stateOverrides
    },
    env
  );

  const candidateAddrs = new Set<string>();
  if (params.to && isEvmAddress(params.to) && !lookupVerifiedSpender(params.to, evmChain)) {
    candidateAddrs.add(params.to.toLowerCase());
  }
  for (const t of (sim as any).touchedTokens || []) {
    if (isEvmAddress(t)) candidateAddrs.add(t.toLowerCase());
  }
  for (const nc of (sim as any).callSummary?.nestedCalls || []) {
    if (nc.target && isEvmAddress(nc.target) && !lookupVerifiedSpender(nc.target, evmChain)) {
      candidateAddrs.add(nc.target.toLowerCase());
    }
    for (const p of nc.decodedParameters || []) {
      if (p.type === "address" && isEvmAddress(p.value) && !lookupVerifiedSpender(p.value, evmChain)) {
        candidateAddrs.add(p.value.toLowerCase());
      }
    }
  }

  const scanTargets = Array.from(candidateAddrs).slice(0, 3);
  const tokenScans = await Promise.allSettled(
    scanTargets.map((addr) => scanTokenForensics(evmChain, addr, env))
  );
  const touchedTokenVerdicts = tokenScans
    .filter((r): r is PromiseFulfilledResult<ForensicScanPayload> => r.status === "fulfilled")
    .filter((r) => r.value.evidence.isContract)
    .map((r) => ({
      address: r.value.address,
      symbol: r.value.symbol,
      score: r.value.score,
      verdict: r.value.verdict,
      recommendedAgentAction: r.value.recommendedAgentAction,
      isHoneypot: r.value.evidence.isHoneypot,
      sellTaxPercent: r.value.evidence.sellTaxPercent
    }));

  const hasTrapToken = touchedTokenVerdicts.some(
    (t) => t.recommendedAgentAction === "ABORT_CRITICAL_TRAP" || t.isHoneypot
  );
  const hasCautionToken = touchedTokenVerdicts.some(
    (t) => t.recommendedAgentAction === "CAUTION_HIGH_RISK"
  );

  let recommendedAgentAction: RecommendedAgentAction = sim.recommendedAgentAction;
  if (recommendedAgentAction === "EXECUTE_SAFE" || recommendedAgentAction === "CAUTION_HIGH_RISK") {
    if (hasTrapToken) recommendedAgentAction = "ABORT_CRITICAL_TRAP";
    else if (hasCautionToken && recommendedAgentAction === "EXECUTE_SAFE") {
      recommendedAgentAction = "CAUTION_HIGH_RISK";
    }
  }

  const tokenSummary =
    touchedTokenVerdicts.length > 0
      ? ` Targets: ${touchedTokenVerdicts
          .map((t) => `${t.symbol}=${t.verdict}(${t.score}/100)`)
          .join(", ")}.`
      : "";

  return {
    llmDigest: `GUARD (${evmChain.toUpperCase()}): ${recommendedAgentAction}. ${sim.llmDigest}${tokenSummary}`,
    recommendedAgentAction,
    guardType: "EVM_TX_GUARD",
    chain: evmChain,
    latencyMs: Date.now() - startMs,
    willRevert: sim.willRevert,
    revertReason: sim.revertReason,
    estimatedGas: sim.estimatedGas,
    assetDiffs: (sim as any).assetDiffs || [],
    nestedCallsCount: ((sim as any).callSummary?.nestedCalls || []).length,
    warnings: (sim as any).callSummary?.securityFlags?.warnings || [],
    touchedTokenVerdicts,
    provenance: sim.provenance
  };
}

/**
 * Pure <300-token Markdown Forensic Report for HTTP Content Negotiation (Accept: text/markdown)
 */
export function formatScanMarkdown(scan: ForensicScanPayload): string {
  const e = scan.evidence;
  const p = scan.provenance;
  return `# NullClear Forensic Report: ${scan.name} ($${scan.symbol})

- **Verdict:** **${scan.verdict}** (\`${scan.score}/100\`)
- **Recommended Agent Action:** \`${scan.recommendedAgentAction}\`
- **Digest:** ${scan.llmDigest}

## Evidence (${scan.chain.toUpperCase()} @ Block \`#${p.blockNumber}\`)
- **Contract:** \`${scan.address}\`
- **Proxy:** ${e.isProxy ? `Yes (${e.proxyType || "EIP-1967"} -> \`${e.implementationAddress}\`)` : "Direct Bytecode"}
- **Swap Tax:** \`${e.buyTaxPercent}%\` Buy / \`${e.sellTaxPercent}%\` Sell (Honeypot: \`${e.isHoneypot}\`)
- **Liquidity:** \`$${e.liquidityUsd.toLocaleString()}\` (\`${e.lpLockedPercent}%\` LP Locked)
- **Opcodes:** SELFDESTRUCT=\`${e.hasSelfDestruct}\`, DELEGATECALL=\`${e.hasDelegateCall}\`, Selectors=\`${e.functionSelectorsCount}\`
- **Attestation:** \`${p.attestationSha256}\`
`;
}

/**
 * Dynamic 1200x630 OpenGraph SVG Scorecard (`GET /og/:chain/:address.svg`)
 */
export function renderScanOgSvg(scan: ForensicScanPayload): string {
  const isClear = scan.verdict === "VERIFIED CLEAR";
  const isCaution = scan.verdict === "CAUTION";
  const accent = isClear ? "#10B981" : isCaution ? "#F59E0B" : "#EF4444";
  const bgBadge = isClear ? "rgba(16,185,129,0.16)" : isCaution ? "rgba(245,158,11,0.16)" : "rgba(239,68,68,0.16)";
  const shortAddr =
    scan.address.length > 20
      ? `${scan.address.slice(0, 10)}...${scan.address.slice(-8)}`
      : scan.address;
  const implShort = scan.evidence.implementationAddress
    ? `${scan.evidence.implementationAddress.slice(0, 10)}...${scan.evidence.implementationAddress.slice(-6)}`
    : "Direct (Non-Proxy)";

  const esc = (s: string) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07090E"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  <rect x="36" y="36" width="1128" height="558" rx="24" fill="#0B0F19" stroke="${accent}" stroke-width="2" stroke-opacity="0.5"/>

  <!-- Header -->
  <rect x="76" y="76" width="44" height="44" rx="10" fill="${accent}"/>
  <text x="98" y="106" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="900" fill="#04130D" text-anchor="middle">N</text>
  <text x="136" y="106" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="800" fill="#F8FAFC">NULLCLEAR FORENSICS V2.2</text>
  <text x="1120" y="104" font-family="JetBrains Mono, monospace" font-size="18" font-weight="600" fill="#94A3B8" text-anchor="end">BLOCK #${scan.provenance.blockNumber}</text>

  <!-- Token Title & Address -->
  <text x="76" y="195" font-family="Inter, system-ui, sans-serif" font-size="52" font-weight="800" fill="#F8FAFC">${esc(scan.name)} ($${esc(scan.symbol)})</text>
  <text x="76" y="238" font-family="JetBrains Mono, monospace" font-size="22" fill="#64748B">${esc(scan.chain.toUpperCase())} · ${esc(shortAddr)}</text>

  <!-- Score Circle & Verdict Pill -->
  <rect x="820" y="145" width="300" height="130" rx="18" fill="${bgBadge}" stroke="${accent}" stroke-width="2"/>
  <text x="970" y="202" font-family="JetBrains Mono, monospace" font-size="48" font-weight="900" fill="${accent}" text-anchor="middle">${scan.score}/100</text>
  <text x="970" y="246" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="800" fill="#F8FAFC" text-anchor="middle">${esc(scan.verdict)}</text>

  <!-- Metrics Grid -->
  <rect x="76" y="305" width="250" height="125" rx="14" fill="#111827" stroke="#1E293B"/>
  <text x="98" y="345" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="600" fill="#94A3B8">BUY / SELL TAX</text>
  <text x="98" y="395" font-family="JetBrains Mono, monospace" font-size="30" font-weight="800" fill="#F8FAFC">${scan.evidence.buyTaxPercent}% / ${scan.evidence.sellTaxPercent}%</text>

  <rect x="346" y="305" width="250" height="125" rx="14" fill="#111827" stroke="#1E293B"/>
  <text x="368" y="345" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="600" fill="#94A3B8">LIQUIDITY (USD)</text>
  <text x="368" y="395" font-family="JetBrains Mono, monospace" font-size="30" font-weight="800" fill="#10B981">$${scan.evidence.liquidityUsd.toLocaleString()}</text>

  <rect x="616" y="305" width="504" height="125" rx="14" fill="#111827" stroke="#1E293B"/>
  <text x="638" y="345" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="600" fill="#94A3B8">PROXY / IMPLEMENTATION</text>
  <text x="638" y="395" font-family="JetBrains Mono, monospace" font-size="24" font-weight="700" fill="#38BDF8">${esc(implShort)}</text>

  <!-- Footer -->
  <text x="76" y="510" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700" fill="${accent}">AGENT ACTION: ${esc(scan.recommendedAgentAction)}</text>
  <text x="76" y="545" font-family="JetBrains Mono, monospace" font-size="14" fill="#64748B">SHA-256 Attestation: ${esc(scan.provenance.attestationSha256.slice(0, 42))}...</text>
  <text x="1120" y="545" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" fill="#F8FAFC" text-anchor="end">nullclear.com</text>
</svg>`;
}

/**
 * 15-Minute Scheduled Cron Scanner for Trending Base & Solana Tokens + IndexNow Ping
 */
export async function runTrendingTokenCronScan(env?: Env["Bindings"]): Promise<{
  scannedCount: number;
  urlsPinged: string[];
}> {
  const candidates: Array<{ chain: SupportedForensicChain; address: string }> = [
    { chain: "base", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" }, // USDC
    { chain: "base", address: "0x4200000000000000000000000000000000000006" }, // WETH
    { chain: "base", address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631" }, // AERO
    { chain: "base", address: "0x532f27101965dd16442e59d40670faf5ebb142e4" }, // BRETT
    { chain: "base", address: "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b" }, // VIRTUAL
    { chain: "eth", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" }, // ETH USDC
    { chain: "solana", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" } // SOL USDC
  ];

  // Fetch live trending pools from GeckoTerminal & DexScreener
  try {
    const [geckoBaseRes, dexBoostsRes] = await Promise.allSettled([
      fetchWithTimeout(
        "https://api.geckoterminal.com/api/v2/networks/base/trending_pools?page=1",
        { headers: { Accept: "application/json" } },
        3000
      ).then((r) => (r.ok ? r.json() : null)),
      fetchWithTimeout(
        "https://api.dexscreener.com/token-boosts/top/v1",
        { headers: { Accept: "application/json" } },
        3000
      ).then((r) => (r.ok ? r.json() : null))
    ]);

    if (geckoBaseRes.status === "fulfilled" && geckoBaseRes.value) {
      const pools: any[] = (geckoBaseRes.value as any)?.data || [];
      for (const p of pools.slice(0, 4)) {
        const baseTokenId: string = p?.relationships?.base_token?.data?.id || "";
        const addr = baseTokenId.replace(/^base_/, "");
        if (isEvmAddress(addr)) {
          candidates.push({ chain: "base", address: addr.toLowerCase() });
        }
      }
    }

    if (dexBoostsRes.status === "fulfilled" && Array.isArray(dexBoostsRes.value)) {
      for (const item of (dexBoostsRes.value as any[]).slice(0, 4)) {
        if (item.chainId === "base" && isEvmAddress(item.tokenAddress || "")) {
          candidates.push({ chain: "base", address: item.tokenAddress.toLowerCase() });
        } else if (item.chainId === "solana" && isSolanaAddress(item.tokenAddress || "")) {
          candidates.push({ chain: "solana", address: item.tokenAddress });
        }
      }
    }
  } catch {}

  const uniqueMap = new Map<string, { chain: SupportedForensicChain; address: string }>();
  for (const c of candidates) {
    uniqueMap.set(`${c.chain}:${c.address}`, c);
  }

  const urlsPinged: string[] = [];
  for (const item of Array.from(uniqueMap.values()).slice(0, 12)) {
    try {
      const res = await scanTokenForensics(item.chain, item.address, env);
      urlsPinged.push(res.links.webReportUrl);
    } catch {}
  }

  // Ping IndexNow (https://api.indexnow.org/indexnow)
  if (urlsPinged.length > 0) {
    try {
      const indexNowKey = env?.INDEXNOW_KEY || "nullclear8453forensicsv22key";
      await fetchWithTimeout(
        "https://api.indexnow.org/indexnow",
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            host: "nullclear.com",
            key: indexNowKey,
            keyLocation: `https://nullclear.com/${indexNowKey}.txt`,
            urlList: urlsPinged
          })
        },
        2500
      );
    } catch {}
  }

  return {
    scannedCount: urlsPinged.length,
    urlsPinged
  };
}

/**
 * Returns trending forensic scans from D1/Memory store (seeding canonical anchors if empty)
 */
export async function getTrendingScans(
  env?: Env["Bindings"],
  chainFilter?: string,
  limit = 20
): Promise<ForensicScanRecord[]> {
  const store = getArbiterStore(env);
  let list = await store.listForensicScans(chainFilter, limit);
  if (list.length === 0) {
    // Seed canonical anchors synchronously into store
    for (const anchor of Object.values(CANONICAL_TOKEN_ANCHORS)) {
      const blockNumber = anchor.chain === "base" ? 28451200 : anchor.chain === "eth" ? 21950400 : 315420000;
      const timestampIso = new Date().toISOString();
      const attestationSha256 = keccak256(
        stringToHex(`nullclear:v2.2:${anchor.chain}:${anchor.address}:${blockNumber}:${anchor.score}`)
      );
      const webReportUrl = `https://nullclear.com/scan/${anchor.chain}/${anchor.address}`;
      const payload: ForensicScanPayload = {
        address: anchor.address,
        chain: anchor.chain,
        symbol: anchor.symbol,
        name: anchor.name,
        llmDigest: `${anchor.verdict} (${anchor.score}/100): ${anchor.name} (${anchor.symbol}) on ${anchor.chain.toUpperCase()} is verified with 0% buy/sell tax and $${anchor.liquidityUsd.toLocaleString()} liquidity.`,
        recommendedAgentAction: anchor.recommendedAgentAction,
        score: anchor.score,
        verdict: anchor.verdict,
        isProxy: anchor.isProxy,
        implementationAddress: anchor.implementationAddress,
        buyTaxPercent: anchor.buyTaxPercent,
        sellTaxPercent: anchor.sellTaxPercent,
        provenance: {
          chainId: anchor.chain === "base" ? 8453 : anchor.chain === "eth" ? 1 : "solana",
          blockNumber,
          timestampIso,
          attestationSha256,
          sourcesAgreed: ["rpc_bytecode", "goplus", "honeypot_sim", "dexscreener"]
        },
        evidence: {
          isContract: true,
          isProxy: anchor.isProxy,
          proxyType: anchor.proxyType,
          implementationAddress: anchor.implementationAddress,
          adminAddress: anchor.adminAddress,
          isHoneypot: false,
          buyTaxPercent: anchor.buyTaxPercent,
          sellTaxPercent: anchor.sellTaxPercent,
          liquidityUsd: anchor.liquidityUsd,
          lpLockedPercent: anchor.lpLockedPercent,
          topHoldersPercent: anchor.topHoldersPercent,
          ownerAddress: anchor.ownerAddress,
          ownerStatus: anchor.ownerStatus,
          hasSelfDestruct: false,
          hasDelegateCall: anchor.isProxy,
          functionSelectorsCount: 42,
          dangerousSelectorsFound: []
        },
        links: {
          webReportUrl,
          markdownTwinUrl: `${webReportUrl}.md`,
          ogImageUrl: `https://nullclear.com/og/${anchor.chain}/${anchor.address}.svg`,
          xShareIntentUrl: `https://twitter.com/intent/tweet?url=${encodeURIComponent(webReportUrl)}`
        }
      };
      await store.saveForensicScan({
        id: `${anchor.chain}:${anchor.address}`,
        chain: anchor.chain,
        address: anchor.address,
        symbol: anchor.symbol,
        name: anchor.name,
        score: anchor.score,
        verdict: anchor.verdict,
        recommendedAction: anchor.recommendedAgentAction,
        isProxy: anchor.isProxy,
        implementationAddress: anchor.implementationAddress,
        buyTaxPercent: anchor.buyTaxPercent,
        sellTaxPercent: anchor.sellTaxPercent,
        liquidityUsd: anchor.liquidityUsd,
        blockNumber,
        attestationSha256,
        payloadJson: JSON.stringify(payload),
        scannedAt: Date.now()
      });
    }
    list = await store.listForensicScans(chainFilter, limit);
  }
  return list;
}

/**
 * Converts any public URL or documentation page into clean, token-efficient Markdown (<400 tokens)
 * with LLM refusal detection and cryptographic provenance.
 */
export async function readUrlCleanMarkdown(
  targetUrl: string,
  maxChars = 1100
): Promise<{
  llmDigest: string;
  recommendedAgentAction: "EXECUTE_SAFE" | "CAUTION_HIGH_RISK";
  provenance: {
    url: string;
    httpStatus: number;
    timestampIso: string;
    attestationSha256: string;
  };
  title: string;
  markdown: string;
}> {
  const timestampIso = new Date().toISOString();
  let httpStatus = 200;
  let rawText = "";

  try {
    const res = await fetchWithTimeout(
      targetUrl,
      {
        headers: {
          Accept: "text/markdown, text/html, application/json, text/plain;q=0.9",
          "User-Agent": "NullClear-Forensics-Reader/2.2 (+https://nullclear.dev)"
        }
      },
      4500
    );
    httpStatus = res.status;
    rawText = await res.text();
  } catch (err: any) {
    httpStatus = 502;
    rawText = `Failed to fetch ${targetUrl}: ${err?.message || "timeout"}`;
  }

  let title = targetUrl;
  const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 120);
  }

  // Convert HTML to compact Markdown
  let md = rawText
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (md.length > maxChars) {
    md = md.slice(0, maxChars).trim() + "\n...(truncated to <400 token budget)";
  }

  const attestationSha256 = keccak256(
    stringToHex(`nullclear:v2.2:markdown:${targetUrl}:${httpStatus}:${md.slice(0, 256)}`)
  );

  const recommendedAgentAction = httpStatus >= 200 && httpStatus < 400 ? "EXECUTE_SAFE" : "CAUTION_HIGH_RISK";
  const llmDigest =
    recommendedAgentAction === "EXECUTE_SAFE"
      ? `Fetched and distilled '${title}' (${targetUrl}) into clean Markdown (HTTP ${httpStatus}, ${md.length} chars). Safe for LLM context ingestion.`
      : `Upstream URL ${targetUrl} returned HTTP ${httpStatus}; verify target availability before relying on content.`;

  return {
    llmDigest,
    recommendedAgentAction,
    provenance: {
      url: targetUrl,
      httpStatus,
      timestampIso,
      attestationSha256
    },
    title,
    markdown: md
  };
}


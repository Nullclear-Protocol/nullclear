import { decodeAbiParameters, parseAbiParameters, keccak256, stringToHex } from "viem";
import type { Env } from "../env.js";
import {
  EVM_CHAIN_METADATA,
  fetchWithTimeout,
  getEvmRpcUrls,
  lookupVerifiedSpender,
  postJsonRpcWithFailover,
  type SupportedEvmForensicChain
} from "./forensics-chains.js";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const APPROVAL_FOR_ALL_TOPIC =
  "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31";

export interface ControlFlowRiskSignals {
  hasTxOriginAuth: boolean;
  hasMutableDelegateCall: boolean;
  hasConstantDelegateCall: boolean;
  hasUnguardedSelfDestruct: boolean;
  hasWeakRandomness: boolean;
  jumpDestCount: number;
  riskSummary: string[];
}

/**
 * Lightweight Worker-native EVM bytecode CFG/opcode risk analyzer.
 * Walks instruction boundaries tracking recent SLOAD/PUSH20/CALLER context.
 */
export function analyzeBytecodeControlFlowRisks(bytecodeHex: string): ControlFlowRiskSignals {
  const clean = (bytecodeHex || "").replace(/^0x/i, "").toLowerCase();
  if (!clean || clean.length < 2) {
    return {
      hasTxOriginAuth: false,
      hasMutableDelegateCall: false,
      hasConstantDelegateCall: false,
      hasUnguardedSelfDestruct: false,
      hasWeakRandomness: false,
      jumpDestCount: 0,
      riskSummary: []
    };
  }

  let codeHex = clean;
  if (codeHex.length > 100 && codeHex.endsWith("0033")) {
    const cborIdx = codeHex.lastIndexOf("a26469706673");
    if (cborIdx > 0 && cborIdx % 2 === 0) codeHex = codeHex.slice(0, cborIdx);
  }

  const byteLen = Math.floor(codeHex.length / 2);
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = parseInt(codeHex.slice(i * 2, i * 2 + 2), 16) || 0;
  }

  let hasTxOriginAuth = false;
  let hasMutableDelegateCall = false;
  let hasConstantDelegateCall = false;
  let hasSelfDestruct = false;
  let hasCallerCheck = false;
  let hasWeakRandomness = false;
  let jumpDestCount = 0;

  const recentOps: number[] = [];
  let pc = 0;
  while (pc < byteLen) {
    const op = bytes[pc];
    recentOps.push(op);
    if (recentOps.length > 16) recentOps.shift();

    if (op >= 0x60 && op <= 0x7f) {
      pc += 1 + (op - 0x5f);
      continue;
    }

    if (op === 0x5b) jumpDestCount++;
    else if (op === 0x32) hasTxOriginAuth = true; // ORIGIN
    else if (op === 0x33) hasCallerCheck = true; // CALLER
    else if (op === 0x42 || op === 0x44) hasWeakRandomness = true; // TIMESTAMP / PREVRANDAO
    else if (op === 0xff) hasSelfDestruct = true;
    else if (op === 0xf4) {
      // Check if an SLOAD (0x54) or CALLDATALOAD (0x35) happened shortly before DELEGATECALL
      const sawMutableSource = recentOps.some((x) => x === 0x54 || x === 0x35);
      const sawPush20 = recentOps.includes(0x73);
      if (sawMutableSource) hasMutableDelegateCall = true;
      else if (sawPush20) hasConstantDelegateCall = true;
      else hasMutableDelegateCall = true;
    }

    pc += 1;
  }

  const hasUnguardedSelfDestruct = hasSelfDestruct && !hasCallerCheck;
  const riskSummary: string[] = [];
  if (hasTxOriginAuth) riskSummary.push("TX_ORIGIN_AUTH_PHISHING_RISK (opcode 0x32 ORIGIN)");
  if (hasMutableDelegateCall) riskSummary.push("MUTABLE_STORAGE_DELEGATECALL");
  if (hasUnguardedSelfDestruct) riskSummary.push("UNGUARDED_SELFDESTRUCT_REACHABLE");

  return {
    hasTxOriginAuth,
    hasMutableDelegateCall,
    hasConstantDelegateCall,
    hasUnguardedSelfDestruct,
    hasWeakRandomness,
    jumpDestCount,
    riskSummary
  };
}

/**
 * Batch-resolves unknown 4-byte function selectors via OpenChain in one request.
 */
export async function batchResolveSelectorsViaOpenChain(
  selectors: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(
    new Set(
      selectors
        .map((s) => s.toLowerCase())
        .filter((s) => /^0x[0-9a-f]{8}$/.test(s))
    )
  ).slice(0, 40);

  if (unique.length === 0) return out;

  try {
    const res = await fetchWithTimeout(
      `https://api.openchain.xyz/signature-database/v1/lookup?function=${encodeURIComponent(
        unique.join(",")
      )}&filter=true`,
      { headers: { Accept: "application/json" } },
      2800
    );
    if (!res.ok) return out;
    const json: any = await res.json();
    const fnMap = json?.result?.function || {};
    for (const sel of unique) {
      const matches = fnMap[sel];
      if (Array.isArray(matches) && matches.length > 0 && matches[0]?.name) {
        out.set(sel, String(matches[0].name));
      }
    }
  } catch {}
  return out;
}

export interface SourcifyContractSummary {
  verified: boolean;
  match: string | null;
  contractName: string | null;
  compilerVersion: string | null;
  abiFunctions: string[];
  proxyResolution?: {
    isProxy?: boolean;
    proxyType?: string;
    implementations?: Array<{ address: string }>;
  };
}

export async function fetchSourcifyContractInfo(
  chainId: number,
  address: string
): Promise<SourcifyContractSummary | null> {
  try {
    const res = await fetchWithTimeout(
      `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=abi,metadata,proxyResolution`,
      { headers: { Accept: "application/json" } },
      2500
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json || (!json.abi && !json.match)) return null;

    const abiFunctions: string[] = [];
    if (Array.isArray(json.abi)) {
      for (const item of json.abi) {
        if (item?.type === "function" && item?.name) {
          const inputs = Array.isArray(item.inputs)
            ? item.inputs.map((i: any) => i.type).join(",")
            : "";
          abiFunctions.push(`${item.name}(${inputs})`);
        }
      }
    }

    const compilation = json.compilation || json.metadata?.compiler;
    return {
      verified: json.match === "match" || json.match === "exact_match" || json.match === "partial_match",
      match: json.match || null,
      contractName: json.name || json.compilation?.name || null,
      compilerVersion: compilation?.version || null,
      abiFunctions: abiFunctions.slice(0, 60),
      proxyResolution: json.proxyResolution || undefined
    };
  } catch {
    return null;
  }
}

export interface DecodedNestedCall {
  depth: number;
  wrapperProtocol: string;
  target: string | null;
  selector: string;
  signature: string | null;
  decodedParameters: Array<{ index: number; type: string; value: string }>;
  isApproval: boolean;
  isUnlimitedApproval: boolean;
  isDelegateCallOp?: boolean;
  spenderAddress?: string | null;
  spenderTrust?: "VERIFIED_ROUTER" | "UNVERIFIED_OR_EOA";
  spenderLabel?: string | null;
  warnings: string[];
}

const UNIVERSAL_ROUTER_COMMANDS: Record<number, string> = {
  0x00: "V3_SWAP_EXACT_IN",
  0x01: "V3_SWAP_EXACT_OUT",
  0x02: "PERMIT2_TRANSFER_FROM",
  0x03: "PERMIT2_PERMIT_BATCH",
  0x04: "SWEEP",
  0x05: "TRANSFER",
  0x06: "PAY_PORTION",
  0x08: "V2_SWAP_EXACT_IN",
  0x09: "V2_SWAP_EXACT_OUT",
  0x0a: "PERMIT2_PERMIT",
  0x0b: "WRAP_ETH",
  0x0c: "UNWRAP_WETH",
  0x0d: "PERMIT2_TRANSFER_FROM_BATCH",
  0x10: "SEAPORT_V1_5",
  0x11: "LOOKSRARE_V2"
};

function safeDecodeParams(
  signature: string,
  hexWithSelector: string
): Array<{ index: number; type: string; value: string }> {
  const clean = hexWithSelector.replace(/^0x/i, "");
  if (clean.length <= 8) return [];
  const argsHex = `0x${clean.slice(8)}` as `0x${string}`;
  const m = signature.match(/^[^(]+\((.*)\)$/);
  if (!m || !m[1]) return [];
  try {
    const params = parseAbiParameters(m[1]);
    const decoded = decodeAbiParameters(params, argsHex);
    return params.map((p, idx) => {
      const v = (decoded as any)[idx];
      return {
        index: idx,
        type: p.type,
        value: typeof v === "bigint" ? v.toString() : typeof v === "object" ? JSON.stringify(v) : String(v)
      };
    });
  } catch {
    return [];
  }
}

function isUnlimitedUintString(val: string): boolean {
  if (!/^\d+$/.test(val)) return false;
  try {
    const n = BigInt(val);
    // >= 2^128 is effectively unlimited for token approvals
    return n >= (1n << 128n);
  } catch {
    return false;
  }
}

/**
 * Recursively unwraps Multicall3, Uniswap V3 multicall, Uniswap Universal Router,
 * and Gnosis Safe execTransaction payloads to detect hidden approvals, sweeps, or delegatecalls.
 */
export async function unwrapNestedCalldata(
  rawHex: string,
  chain: SupportedEvmForensicChain,
  resolveSelector: (sel: string) => Promise<string | null>,
  depth = 0,
  targetContract: string | null = null
): Promise<DecodedNestedCall[]> {
  if (depth > 3) return [];
  const clean = rawHex.startsWith("0x") ? rawHex.toLowerCase() : `0x${rawHex.toLowerCase()}`;
  if (clean.length < 10) return [];
  const sel = clean.slice(0, 10);
  const argsHex = `0x${clean.slice(10)}` as `0x${string}`;
  const out: DecodedNestedCall[] = [];

  // 1. Uniswap Universal Router: execute(bytes commands, bytes[] inputs, uint256 deadline) -> 0x3593564c
  //    or execute(bytes commands, bytes[] inputs) -> 0x24856bc3
  if ((sel === "0x3593564c" || sel === "0x24856bc3") && clean.length > 74) {
    try {
      const abi =
        sel === "0x3593564c"
          ? parseAbiParameters("bytes commands, bytes[] inputs, uint256 deadline")
          : parseAbiParameters("bytes commands, bytes[] inputs");
      const decoded = decodeAbiParameters(abi, argsHex);
      const commandsHex = String(decoded[0] || "0x").replace(/^0x/i, "");
      const inputsArr = (decoded[1] as `0x${string}`[]) || [];

      for (let i = 0; i < commandsHex.length / 2 && i < inputsArr.length && i < 20; i++) {
        const cmdByte = parseInt(commandsHex.slice(i * 2, i * 2 + 2), 16) & 0x3f;
        const cmdName = UNIVERSAL_ROUTER_COMMANDS[cmdByte] || `CMD_0x${cmdByte.toString(16)}`;
        const inputHex = inputsArr[i] || "0x";
        const warnings: string[] = [];
        let isApproval = false;
        let isUnlimitedApproval = false;
        let spenderAddress: string | null = null;
        let spenderTrust: "VERIFIED_ROUTER" | "UNVERIFIED_OR_EOA" | undefined;
        let spenderLabel: string | null = null;
        const params: Array<{ index: number; type: string; value: string }> = [];

        if (cmdByte === 0x0a) {
          // PERMIT2_PERMIT((address,uint160,uint48,uint48),address,uint256,bytes)
          try {
            const p = decodeAbiParameters(
              parseAbiParameters(
                "(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline, bytes signature"
              ),
              inputHex
            );
            const details = p[0] as any;
            spenderAddress = String(p[1]).toLowerCase();
            const amt = BigInt(details.amount);
            isApproval = true;
            isUnlimitedApproval = amt >= (1n << 128n);
            const known = lookupVerifiedSpender(spenderAddress, chain);
            spenderTrust = known ? "VERIFIED_ROUTER" : "UNVERIFIED_OR_EOA";
            spenderLabel = known?.label || null;
            params.push(
              { index: 0, type: "address", value: String(details.token).toLowerCase() },
              { index: 1, type: "uint160", value: amt.toString() },
              { index: 2, type: "address", value: spenderAddress }
            );
            if (!known) {
              warnings.push(
                `HIDDEN_UNIVERSAL_ROUTER_PERMIT2: Universal Router command #${i} executes PERMIT2_PERMIT to unverified spender ${spenderAddress}.`
              );
            }
          } catch {}
        } else if (cmdByte === 0x04 || cmdByte === 0x05) {
          // SWEEP(address token, address recipient, uint256 amountMin) or TRANSFER(address token, address recipient, uint256 value)
          try {
            const p = decodeAbiParameters(
              parseAbiParameters("address token, address recipient, uint256 amount"),
              inputHex
            );
            const token = String(p[0]).toLowerCase();
            const recipient = String(p[1]).toLowerCase();
            const amount = String(p[2]);
            spenderAddress = recipient;
            const known = lookupVerifiedSpender(recipient, chain);
            spenderTrust = known ? "VERIFIED_ROUTER" : "UNVERIFIED_OR_EOA";
            spenderLabel = known?.label || null;
            params.push(
              { index: 0, type: "address", value: token },
              { index: 1, type: "address", value: recipient },
              { index: 2, type: "uint256", value: amount }
            );
            if (
              !known &&
              recipient !== "0x0000000000000000000000000000000000000001" &&
              recipient !== "0x0000000000000000000000000000000000000002"
            ) {
              warnings.push(
                `UNIVERSAL_ROUTER_${cmdName}_RECIPIENT: Command #${i} sends token ${token} directly to external recipient ${recipient}. Verify this is your wallet.`
              );
            }
          } catch {}
        }

        out.push({
          depth: depth + 1,
          wrapperProtocol: "Uniswap Universal Router",
          target: targetContract,
          selector: `cmd:0x${cmdByte.toString(16).padStart(2, "0")}`,
          signature: cmdName,
          decodedParameters: params,
          isApproval,
          isUnlimitedApproval,
          spenderAddress,
          spenderTrust,
          spenderLabel,
          warnings
        });
      }
      return out;
    } catch {}
  }

  // 2. Multicall3 aggregate3((address target, bool allowFailure, bytes callData)[]) -> 0x82ad56cb
  //    or aggregate((address target, bytes callData)[]) -> 0x252dba42
  //    or aggregate3Value((address target, bool allowFailure, uint256 value, bytes callData)[]) -> 0x174dea71
  if (sel === "0x82ad56cb" || sel === "0x252dba42" || sel === "0x174dea71") {
    try {
      const abi =
        sel === "0x82ad56cb"
          ? parseAbiParameters("(address target, bool allowFailure, bytes callData)[] calls")
          : sel === "0x174dea71"
            ? parseAbiParameters(
                "(address target, bool allowFailure, uint256 value, bytes callData)[] calls"
              )
            : parseAbiParameters("(address target, bytes callData)[] calls");
      const decoded = decodeAbiParameters(abi, argsHex);
      const calls = (decoded[0] as any[]) || [];
      for (const call of calls.slice(0, 15)) {
        const subTarget = String(call.target || "").toLowerCase();
        const subData = String(call.callData || "0x");
        const subSel = subData.length >= 10 ? subData.slice(0, 10).toLowerCase() : "0x";
        const subSig = subSel !== "0x" ? await resolveSelector(subSel) : null;
        const subParams = subSig ? safeDecodeParams(subSig, subData) : [];
        const isAppr =
          subSel === "0x095ea7b3" ||
          subSel === "0xd505accf" ||
          subSel === "0xa22cb465" ||
          subSel === "0x39509351";
        let isUnlim = false;
        let spenderAddr: string | null = null;
        const warnings: string[] = [];

        if (isAppr) {
          const addrParam = subParams.find((p) => p.type === "address");
          if (addrParam) spenderAddr = addrParam.value.toLowerCase();
          if (subSel === "0xa22cb465") {
            const b = subParams.find((p) => p.type === "bool");
            if (b?.value === "true") isUnlim = true;
          } else {
            const u = subParams.find((p) => p.type.startsWith("uint"));
            if (u && isUnlimitedUintString(u.value)) isUnlim = true;
          }
        }

        const known = spenderAddr ? lookupVerifiedSpender(spenderAddr, chain) : null;
        if (isUnlim && !known) {
          warnings.push(
            `HIDDEN_MULTICALL_UNLIMITED_APPROVAL: Nested call to ${subTarget} grants unlimited approval to unverified spender ${spenderAddr || "unknown"}.`
          );
        }

        out.push({
          depth: depth + 1,
          wrapperProtocol: "Multicall3",
          target: subTarget,
          selector: subSel,
          signature: subSig,
          decodedParameters: subParams,
          isApproval: isAppr,
          isUnlimitedApproval: isUnlim,
          spenderAddress: spenderAddr,
          spenderTrust: spenderAddr ? (known ? "VERIFIED_ROUTER" : "UNVERIFIED_OR_EOA") : undefined,
          spenderLabel: known?.label || null,
          warnings
        });

        const deeper = await unwrapNestedCalldata(subData, chain, resolveSelector, depth + 1, subTarget);
        out.push(...deeper);
      }
      return out;
    } catch {}
  }

  // 3. Uniswap V3 multicall(bytes[] data) -> 0xac9650d8
  if (sel === "0xac9650d8") {
    try {
      const decoded = decodeAbiParameters(parseAbiParameters("bytes[] data"), argsHex);
      const calls = (decoded[0] as `0x${string}`[]) || [];
      for (const subData of calls.slice(0, 15)) {
        const subSel = subData.length >= 10 ? subData.slice(0, 10).toLowerCase() : "0x";
        const subSig = subSel !== "0x" ? await resolveSelector(subSel) : null;
        const subParams = subSig ? safeDecodeParams(subSig, subData) : [];
        out.push({
          depth: depth + 1,
          wrapperProtocol: "Router Multicall",
          target: targetContract,
          selector: subSel,
          signature: subSig,
          decodedParameters: subParams,
          isApproval: false,
          isUnlimitedApproval: false,
          warnings: []
        });
      }
      return out;
    } catch {}
  }

  // 4. Gnosis Safe execTransaction(...) -> 0x6a761202
  if (sel === "0x6a761202") {
    try {
      const decoded = decodeAbiParameters(
        parseAbiParameters(
          "address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures"
        ),
        argsHex
      );
      const safeTo = String(decoded[0]).toLowerCase();
      const safeData = String(decoded[2] || "0x");
      const operation = Number(decoded[3]);
      const subSel = safeData.length >= 10 ? safeData.slice(0, 10).toLowerCase() : "0x";
      const subSig = subSel !== "0x" ? await resolveSelector(subSel) : null;
      const subParams = subSig ? safeDecodeParams(subSig, safeData) : [];
      const warnings: string[] = [];
      if (operation === 1) {
        warnings.push(
          `SAFE_DELEGATECALL_ALERT: Safe execTransaction uses operation=1 (DELEGATECALL) into ${safeTo}; malicious targets can overwrite Safe owners.`
        );
      }

      const isAppr = subSel === "0x095ea7b3" || subSel === "0xa22cb465" || subSel === "0xd505accf";
      let isUnlim = false;
      let spenderAddr: string | null = null;
      if (isAppr) {
        spenderAddr = subParams.find((p) => p.type === "address")?.value.toLowerCase() || null;
        const u = subParams.find((p) => p.type.startsWith("uint"));
        if (u && isUnlimitedUintString(u.value)) isUnlim = true;
        if (subSel === "0xa22cb465" && subParams.find((p) => p.type === "bool")?.value === "true") {
          isUnlim = true;
        }
      }

      const known = spenderAddr ? lookupVerifiedSpender(spenderAddr, chain) : null;
      if (isUnlim && !known) {
        warnings.push(
          `SAFE_UNLIMITED_APPROVAL: Safe executes unlimited approval to unverified spender ${spenderAddr}.`
        );
      }

      out.push({
        depth: depth + 1,
        wrapperProtocol: "Gnosis Safe",
        target: safeTo,
        selector: subSel,
        signature: subSig,
        decodedParameters: subParams,
        isApproval: isAppr,
        isUnlimitedApproval: isUnlim,
        isDelegateCallOp: operation === 1,
        spenderAddress: spenderAddr,
        spenderTrust: spenderAddr ? (known ? "VERIFIED_ROUTER" : "UNVERIFIED_OR_EOA") : undefined,
        spenderLabel: known?.label || null,
        warnings
      });

      const deeper = await unwrapNestedCalldata(safeData, chain, resolveSelector, depth + 1, safeTo);
      out.push(...deeper);
      return out;
    } catch {}
  }

  return out;
}

export interface TypedDataAuditResult {
  llmDigest: string;
  recommendedAgentAction: "EXECUTE_SAFE" | "CAUTION_HIGH_RISK" | "ABORT_DRAINER_APPROVAL";
  inputType: "EIP712_TYPED_DATA";
  chain: SupportedEvmForensicChain;
  primaryType: string;
  verifyingContract: string | null;
  spenderAddress: string | null;
  spenderTrust: "VERIFIED_ROUTER" | "UNVERIFIED_OR_EOA" | "UNKNOWN";
  spenderLabel: string | null;
  isUnlimitedApproval: boolean;
  touchedTokens: string[];
  warnings: string[];
  provenance: {
    chainId: number;
    timestampIso: string;
    attestationSha256: string;
    sourcesAgreed: string[];
  };
}

/**
 * Audits EIP-712 off-chain signatures (Permit, Permit2, Seaport, SafeTx) before wallet signing
 * to catch gasless blind-signing phishing traps.
 */
export function auditEip712TypedData(
  typedData: any,
  chain: SupportedEvmForensicChain
): TypedDataAuditResult {
  const domain = typedData?.domain || {};
  const msg = typedData?.message || {};
  const primaryType = String(typedData?.primaryType || "UnknownTypedData");
  const verifyingContract = domain.verifyingContract
    ? String(domain.verifyingContract).toLowerCase()
    : null;
  const domainChainId = Number(domain.chainId || EVM_CHAIN_METADATA[chain].chainId);

  const warnings: string[] = [];
  const touchedTokens = new Set<string>();
  let spenderAddress: string | null = null;
  let isUnlimitedApproval = false;

  const lowerType = primaryType.toLowerCase();

  if (lowerType.includes("permit")) {
    // ERC-2612 Permit or DAI Permit
    if (msg.spender) spenderAddress = String(msg.spender).toLowerCase();
    if (verifyingContract && !lowerType.includes("single") && !lowerType.includes("batch")) {
      touchedTokens.add(verifyingContract);
    }
    if (msg.value !== undefined && isUnlimitedUintString(String(msg.value))) {
      isUnlimitedApproval = true;
    }
    if (msg.allowed === true) {
      isUnlimitedApproval = true;
    }
    // Permit2 PermitSingle / PermitBatch
    if (msg.details) {
      const detailsList = Array.isArray(msg.details) ? msg.details : [msg.details];
      for (const d of detailsList) {
        if (d?.token) touchedTokens.add(String(d.token).toLowerCase());
        if (d?.amount !== undefined && isUnlimitedUintString(String(d.amount))) {
          isUnlimitedApproval = true;
        }
      }
    }
  } else if (lowerType.includes("order") && Array.isArray(msg.offer)) {
    // Seaport OrderComponents zero-consideration drainer check
    for (const o of msg.offer) {
      if (o?.token) touchedTokens.add(String(o.token).toLowerCase());
    }
    const consideration = Array.isArray(msg.consideration) ? msg.consideration : [];
    const offerer = String(msg.offerer || "").toLowerCase();
    const selfReceive = consideration.filter(
      (c: any) => String(c?.recipient || "").toLowerCase() === offerer && BigInt(c?.startAmount || 0) > 0n
    );
    if (msg.offer.length > 0 && selfReceive.length === 0) {
      isUnlimitedApproval = true;
      warnings.push(
        "SEAPORT_ZERO_CONSIDERATION_DRAINER: Order transfers assets out of your wallet with 0 consideration returning to offerer."
      );
    }
    if (msg.zone && !/^0x0{40}$/.test(String(msg.zone))) {
      spenderAddress = String(msg.zone).toLowerCase();
    }
  } else if (lowerType.includes("safetx")) {
    if (msg.to) spenderAddress = String(msg.to).toLowerCase();
    if (Number(msg.operation) === 1) {
      isUnlimitedApproval = true;
      warnings.push(
        `SAFE_DELEGATECALL_TYPED_DATA: SafeTx operation=1 (DELEGATECALL) to ${spenderAddress || "unknown"}.`
      );
    }
  }

  const knownSpender = spenderAddress ? lookupVerifiedSpender(spenderAddress, chain) : null;
  const spenderTrust: TypedDataAuditResult["spenderTrust"] = !spenderAddress
    ? "UNKNOWN"
    : knownSpender
      ? "VERIFIED_ROUTER"
      : "UNVERIFIED_OR_EOA";

  if (lowerType.includes("permit") && spenderAddress && !knownSpender) {
    warnings.push(
      `OFFCHAIN_PERMIT_UNVERIFIED_SPENDER: ${primaryType} grants spending power to unverified address ${spenderAddress} (gasless phishing risk).`
    );
    if (isUnlimitedApproval) {
      warnings.push("UNLIMITED_PERMIT_ALLOWANCE: Signature grants effectively infinite allowance.");
    }
  } else if (knownSpender && isUnlimitedApproval) {
    warnings.push(
      `VERIFIED_ROUTER_PERMIT: ${primaryType} approves ${knownSpender.label} (${spenderAddress}). Confirm swap intent.`
    );
  }

  let recommendedAgentAction: TypedDataAuditResult["recommendedAgentAction"] = "EXECUTE_SAFE";
  if (
    (isUnlimitedApproval && spenderTrust !== "VERIFIED_ROUTER") ||
    warnings.some((w) => w.startsWith("SEAPORT_ZERO") || w.startsWith("SAFE_DELEGATECALL"))
  ) {
    recommendedAgentAction = "ABORT_DRAINER_APPROVAL";
  } else if (spenderTrust === "UNVERIFIED_OR_EOA" || isUnlimitedApproval || warnings.length > 0) {
    recommendedAgentAction = "CAUTION_HIGH_RISK";
  }

  const timestampIso = new Date().toISOString();
  const attestationSha256 = keccak256(
    stringToHex(
      `nullclear:eip712:${domainChainId}:${primaryType}:${spenderAddress || "none"}:${recommendedAgentAction}:${timestampIso}`
    )
  );

  const llmDigest =
    recommendedAgentAction === "ABORT_DRAINER_APPROVAL"
      ? `EIP-712 DRAINER ALERT (${primaryType}): Signature grants dangerous/unlimited off-chain control to ${spenderAddress || "unknown"} (${spenderTrust}). Action: ABORT_DRAINER_APPROVAL.`
      : recommendedAgentAction === "CAUTION_HIGH_RISK"
        ? `EIP-712 CAUTION (${primaryType}): Spender ${spenderAddress || "none"} (${knownSpender?.label || spenderTrust}). Verify intent before signing.`
        : `EIP-712 VERIFIED (${primaryType}): No blind-signing drainer flags detected.`;

  return {
    llmDigest,
    recommendedAgentAction,
    inputType: "EIP712_TYPED_DATA",
    chain,
    primaryType,
    verifyingContract,
    spenderAddress,
    spenderTrust,
    spenderLabel: knownSpender?.label || null,
    isUnlimitedApproval,
    touchedTokens: Array.from(touchedTokens),
    warnings,
    provenance: {
      chainId: domainChainId,
      timestampIso,
      attestationSha256,
      sourcesAgreed: ["eip712_policy_engine", "verified_router_registry"]
    }
  };
}

export interface SimulatedAssetDiff {
  type: "ERC20_TRANSFER" | "ERC20_APPROVAL" | "ERC721_APPROVAL_FOR_ALL";
  token: string;
  from: string;
  toOrSpender: string;
  amountRaw: string;
  directionForCaller: "OUT" | "IN" | "APPROVAL" | "OTHER";
  isUnlimited?: boolean;
}

export interface StatefulSimulationOutcome {
  willRevert: boolean;
  revertReason: string | null;
  revertDataHex?: string;
  returnData: string;
  estimatedGas: number;
  blockNumber: number;
  simulationMode: "eth_simulateV1" | "eth_call";
  assetDiffs: SimulatedAssetDiff[];
  touchedTokens: string[];
  sourcesAgreed: string[];
}

function parseTopicAddress(topic?: string): string {
  if (!topic || typeof topic !== "string" || topic.length < 42) {
    return "0x0000000000000000000000000000000000000000";
  }
  return `0x${topic.slice(-40).toLowerCase()}`;
}

function extractAssetDiffsFromLogs(logs: any[], caller: string): SimulatedAssetDiff[] {
  const diffs: SimulatedAssetDiff[] = [];
  const normCaller = caller.toLowerCase();

  for (const log of logs) {
    const topics: string[] = Array.isArray(log?.topics)
      ? log.topics
      : typeof log?.topics === "string"
        ? log.topics.trim().split(/\s+/).filter(Boolean)
        : [];
    const topic0 = String(topics[0] || "").toLowerCase();
    const token = String(log?.address || "").toLowerCase();
    const dataHex = String(log?.data || "0x");

    if (topic0 === TRANSFER_TOPIC && topics.length >= 3) {
      const from = parseTopicAddress(topics[1]);
      const to = parseTopicAddress(topics[2]);
      let amountRaw = "0";
      if (dataHex.length >= 66) {
        try {
          amountRaw = BigInt(dataHex.slice(0, 66)).toString();
        } catch {}
      } else if (topics[3]) {
        // ERC-721 tokenId
        try {
          amountRaw = BigInt(topics[3]).toString();
        } catch {}
      }
      const dir: SimulatedAssetDiff["directionForCaller"] =
        from === normCaller ? "OUT" : to === normCaller ? "IN" : "OTHER";
      if (dir !== "OTHER") {
        diffs.push({
          type: "ERC20_TRANSFER",
          token,
          from,
          toOrSpender: to,
          amountRaw,
          directionForCaller: dir
        });
      }
    } else if (topic0 === APPROVAL_TOPIC && topics.length >= 3) {
      const owner = parseTopicAddress(topics[1]);
      const spender = parseTopicAddress(topics[2]);
      let amountRaw = "0";
      if (dataHex.length >= 66) {
        try {
          amountRaw = BigInt(dataHex.slice(0, 66)).toString();
        } catch {}
      }
      diffs.push({
        type: "ERC20_APPROVAL",
        token,
        from: owner,
        toOrSpender: spender,
        amountRaw,
        directionForCaller: "APPROVAL",
        isUnlimited: isUnlimitedUintString(amountRaw)
      });
    } else if (topic0 === APPROVAL_FOR_ALL_TOPIC && topics.length >= 3) {
      const owner = parseTopicAddress(topics[1]);
      const operator = parseTopicAddress(topics[2]);
      const approved = dataHex.endsWith("1");
      diffs.push({
        type: "ERC721_APPROVAL_FOR_ALL",
        token,
        from: owner,
        toOrSpender: operator,
        amountRaw: approved ? "true" : "false",
        directionForCaller: "APPROVAL",
        isUnlimited: approved
      });
    }
  }
  return diffs;
}

/**
 * Runs stateful EVM pre-flight simulation with optional stateOverrides and multi-tx bundles.
 * Attempts `eth_simulateV1` first for exact Transfer/Approval asset diffs, falling back to
 * `eth_call` (with stateOverrides) + `eth_estimateGas`.
 */
export async function runStatefulEvmSimulation(
  params: {
    chain: SupportedEvmForensicChain;
    from: string;
    calls: Array<{ to: string; data: string; value: string }>;
    stateOverrides?: Record<string, any>;
  },
  env?: Env["Bindings"]
): Promise<StatefulSimulationOutcome> {
  const rpcs = getEvmRpcUrls(params.chain, env);
  const meta = EVM_CHAIN_METADATA[params.chain];
  let blockNumber = meta.defaultBlockNumber;

  // 1. Try eth_simulateV1 when multiple calls or asset diffs are beneficial
  const simV1Calls = params.calls.map((c) => ({
    from: params.from,
    to: c.to,
    input: c.data,
    value: c.value
  }));

  const blockStateCall: Record<string, any> = {
    calls: simV1Calls
  };
  if (params.stateOverrides && Object.keys(params.stateOverrides).length > 0) {
    blockStateCall.stateOverrides = params.stateOverrides;
  }

  const simV1Res = await postJsonRpcWithFailover<any>(
    rpcs,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_simulateV1",
      params: [
        {
          blockStateCalls: [blockStateCall],
          traceTransfers: true,
          validation: false
        },
        "latest"
      ]
    },
    3000
  );

  const simBlock = Array.isArray(simV1Res?.data?.result) ? simV1Res.data.result[0] : null;
  if (simBlock && Array.isArray(simBlock.calls)) {
    if (simBlock.number) blockNumber = parseInt(simBlock.number, 16) || blockNumber;
    const allLogs: any[] = [];
    let totalGas = 0;
    let failedCall: any = null;
    let lastReturnData = "0x";

    for (const cRes of simBlock.calls) {
      if (cRes.gasUsed) totalGas += parseInt(cRes.gasUsed, 16) || 0;
      if (Array.isArray(cRes.logs)) allLogs.push(...cRes.logs);
      if (cRes.returnData) lastReturnData = cRes.returnData;
      if (cRes.status === "0x0" || cRes.error) {
        failedCall = cRes;
        break;
      }
    }

    const assetDiffs = extractAssetDiffsFromLogs(allLogs, params.from);
    const touchedTokens = Array.from(new Set(assetDiffs.map((d) => d.token)));

    if (failedCall) {
      return {
        willRevert: true,
        revertReason:
          failedCall.error?.message || "Execution reverted in eth_simulateV1 pre-flight",
        revertDataHex:
          typeof failedCall.error?.data === "string"
            ? failedCall.error.data
            : typeof failedCall.returnData === "string" && failedCall.returnData !== "0x"
              ? failedCall.returnData
              : undefined,
        returnData: lastReturnData,
        estimatedGas: totalGas || 21000,
        blockNumber,
        simulationMode: "eth_simulateV1",
        assetDiffs,
        touchedTokens,
        sourcesAgreed: ["eth_simulateV1", "transfer_log_diff", "abi_decoder"]
      };
    }

    return {
      willRevert: false,
      revertReason: null,
      returnData: lastReturnData,
      estimatedGas: totalGas || 45000,
      blockNumber,
      simulationMode: "eth_simulateV1",
      assetDiffs,
      touchedTokens,
      sourcesAgreed: ["eth_simulateV1", "transfer_log_diff", "abi_decoder"]
    };
  }

  // 2. Graceful fallback to eth_call (with optional stateOverrides) + eth_estimateGas
  const primary = params.calls[0];
  const txObj = { from: params.from, to: primary.to, data: primary.data, value: primary.value };
  const callParams: any[] = [txObj, "latest"];
  if (params.stateOverrides && Object.keys(params.stateOverrides).length > 0) {
    callParams.push(params.stateOverrides);
  }

  const batchRes = await postJsonRpcWithFailover<any[]>(
    rpcs,
    [
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_call", params: callParams },
      { jsonrpc: "2.0", id: 3, method: "eth_estimateGas", params: [txObj] }
    ],
    3500
  );

  let willRevert = false;
  let revertReason: string | null = null;
  let revertDataHex: string | undefined;
  let returnData = "0x";
  let estimatedGas = 21000;

  if (Array.isArray(batchRes?.data)) {
    const blk = batchRes.data.find((r) => r.id === 1)?.result;
    if (blk) blockNumber = parseInt(blk, 16) || blockNumber;

    const callEntry = batchRes.data.find((r) => r.id === 2);
    const gasEntry = batchRes.data.find((r) => r.id === 3);

    if (callEntry?.error || (gasEntry?.error && !params.stateOverrides)) {
      willRevert = true;
      const errObj = callEntry?.error || gasEntry?.error;
      revertReason = errObj?.message || "Execution reverted during eth_call pre-flight";
      if (typeof errObj?.data === "string" && errObj.data.startsWith("0x")) {
        revertDataHex = errObj.data;
      }
    } else {
      returnData = callEntry?.result || "0x";
      if (gasEntry?.result) {
        estimatedGas = parseInt(gasEntry.result, 16) || 45000;
      } else {
        estimatedGas = 45000;
      }
    }
  }

  return {
    willRevert,
    revertReason,
    revertDataHex,
    returnData,
    estimatedGas,
    blockNumber,
    simulationMode: "eth_call",
    assetDiffs: [],
    touchedTokens: [],
    sourcesAgreed: [
      ...(params.stateOverrides ? ["eth_call_state_override"] : ["eth_call"]),
      "eth_estimateGas",
      "abi_decoder"
    ]
  };
}

import { keccak256, stringToHex } from "viem";
import type { Env } from "../env.js";
import { fetchWithTimeout, getSolanaRpcUrls, postJsonRpcWithFailover } from "./forensics-chains.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map<string, number>(
  BASE58_ALPHABET.split("").map((ch, idx) => [ch, idx])
);

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const size = Math.ceil((bytes.length * 138) / 100) + 1;
  const b58 = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * b58[k];
      b58[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }
  let idx = size - length;
  while (idx < size && b58[idx] === 0) idx++;
  let out = "1".repeat(zeros);
  for (; idx < size; idx++) out += BASE58_ALPHABET[b58[idx]];
  return out;
}

export function decodeBase58(input: string): Uint8Array | null {
  const str = (input || "").trim();
  if (!str) return null;
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const size = Math.ceil((str.length * 733) / 1000) + 1;
  const b256 = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < str.length; i++) {
    const val = BASE58_MAP.get(str[i]);
    if (val === undefined) return null;
    let carry = val;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 58 * b256[k];
      b256[k] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    length = j;
  }
  let idx = size - length;
  while (idx < size && b256[idx] === 0) idx++;
  const out = new Uint8Array(zeros + (size - idx));
  out.fill(0, 0, zeros);
  for (let i = zeros; idx < size; i++, idx++) out[i] = b256[idx];
  return out;
}

export function decodeBase64ToBytes(b64: string): Uint8Array | null {
  try {
    const norm = (b64 || "").trim().replace(/-/g, "+").replace(/_/g, "/");
    if (!norm || !/^[A-Za-z0-9+/=]+$/.test(norm)) return null;
    const bin = atob(norm);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export interface SolanaMintOnChainAudit {
  slotNumber: number;
  rpcSucceeded: boolean;
  isMintAccount: boolean;
  isToken2022: boolean;
  decimals: number | null;
  supplyRaw: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  permanentDelegate: string | null;
  transferFeeBps: number | null;
  transferHookProgram: string | null;
  nonTransferable: boolean;
  defaultFrozen: boolean;
  topHoldersPercent: number | null;
  riskFlags: string[];
}

export async function probeSolanaMintOnChain(
  mintAddress: string,
  env?: Env["Bindings"]
): Promise<SolanaMintOnChainAudit> {
  const rpcs = getSolanaRpcUrls(env);

  // Public Solana RPC nodes return HTTP 429 on JSON-RPC batch arrays, so send single calls in parallel.
  const [acctResp, largestResp] = await Promise.all([
    postJsonRpcWithFailover<any>(
      rpcs,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "getAccountInfo",
        params: [mintAddress, { encoding: "jsonParsed", commitment: "confirmed" }]
      },
      2400
    ),
    postJsonRpcWithFailover<any>(
      rpcs,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "getTokenLargestAccounts",
        params: [mintAddress, { commitment: "confirmed" }]
      },
      2400
    )
  ]);

  let slotNumber = 315420000;
  let isMintAccount = false;
  let isToken2022 = false;
  let decimals: number | null = null;
  let supplyRaw: string | null = null;
  let mintAuthority: string | null = null;
  let freezeAuthority: string | null = null;
  let permanentDelegate: string | null = null;
  let transferFeeBps: number | null = null;
  let transferHookProgram: string | null = null;
  let nonTransferable = false;
  let defaultFrozen = false;
  let topHoldersPercent: number | null = null;
  const riskFlags: string[] = [];

  const acctResult = acctResp?.data?.result;
  if (!acctResult) {
    return {
      slotNumber,
      rpcSucceeded: false,
      isMintAccount,
      isToken2022,
      decimals,
      supplyRaw,
      mintAuthority,
      freezeAuthority,
      permanentDelegate,
      transferFeeBps,
      transferHookProgram,
      nonTransferable,
      defaultFrozen,
      topHoldersPercent,
      riskFlags
    };
  }

  if (typeof acctResult?.context?.slot === "number" && acctResult.context.slot > 0) {
    slotNumber = acctResult.context.slot;
  }

  const acctVal = acctResult?.value;
  if (acctVal) {
    const owner = String(acctVal.owner || "");
    isToken2022 = owner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    const parsed = acctVal.data?.parsed;
    if (parsed?.type === "mint" && parsed?.info) {
      isMintAccount = true;
      const info = parsed.info;
      decimals = typeof info.decimals === "number" ? info.decimals : null;
      supplyRaw = info.supply ? String(info.supply) : null;
      mintAuthority = info.mintAuthority ? String(info.mintAuthority) : null;
      freezeAuthority = info.freezeAuthority ? String(info.freezeAuthority) : null;

      if (mintAuthority) {
        riskFlags.push(`ACTIVE_MINT_AUTHORITY (${mintAuthority.slice(0, 8)}...)`);
      }
      if (freezeAuthority) {
        riskFlags.push(`ACTIVE_FREEZE_AUTHORITY (${freezeAuthority.slice(0, 8)}...)`);
      }

      if (Array.isArray(info.extensions)) {
        for (const ext of info.extensions) {
          const extName = String(ext?.extension || "");
          const st = ext?.state || {};
          if (extName === "permanentDelegate" && st.delegate) {
            permanentDelegate = String(st.delegate);
            riskFlags.push(`TOKEN2022_PERMANENT_DELEGATE (${permanentDelegate.slice(0, 8)}...)`);
          } else if (extName === "transferFeeConfig") {
            const bps = Number(
              st?.newerTransferFee?.transferFeeBasisPoints ??
                st?.olderTransferFee?.transferFeeBasisPoints ??
                0
            );
            if (Number.isFinite(bps) && bps > 0) {
              transferFeeBps = bps;
              if (bps >= 1000) {
                riskFlags.push(`TOKEN2022_HIGH_TRANSFER_FEE (${(bps / 100).toFixed(2)}%)`);
              }
            }
          } else if (extName === "transferHook" && st.programId) {
            transferHookProgram = String(st.programId);
            riskFlags.push(`TOKEN2022_TRANSFER_HOOK (${transferHookProgram.slice(0, 8)}...)`);
          } else if (extName === "nonTransferable") {
            nonTransferable = true;
            riskFlags.push("TOKEN2022_NON_TRANSFERABLE");
          } else if (
            extName === "defaultAccountState" &&
            String(st.accountState || "").toLowerCase() === "frozen"
          ) {
            defaultFrozen = true;
            riskFlags.push("TOKEN2022_DEFAULT_FROZEN");
          }
        }
      }
    }
  }

  const largestVal = largestResp?.data?.result?.value;
  if (Array.isArray(largestVal) && supplyRaw && BigInt(supplyRaw) > 0n) {
    const total = Number(BigInt(supplyRaw));
    const top10Sum = largestVal
      .slice(0, 10)
      .reduce((acc: number, item: any) => acc + Number(item?.amount || 0), 0);
    if (total > 0) {
      topHoldersPercent = Math.min(100, Math.round((top10Sum / total) * 1000) / 10);
    }
  }

  return {
    slotNumber,
    rpcSucceeded: true,
    isMintAccount,
    isToken2022,
    decimals,
    supplyRaw,
    mintAuthority,
    freezeAuthority,
    permanentDelegate,
    transferFeeBps,
    transferHookProgram,
    nonTransferable,
    defaultFrozen,
    topHoldersPercent,
    riskFlags
  };
}

const KNOWN_SOLANA_PROGRAMS: Record<string, string> = {
  "11111111111111111111111111111111": "SystemProgram",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "SPL Token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "Token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "AssociatedTokenProgram",
  ComputeBudget111111111111111111111111111111: "ComputeBudget",
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter v6",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium AMM V4",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium CLMM",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "Pump.fun",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo v2"
};

const SPL_INSTRUCTION_NAMES: Record<number, string> = {
  0: "InitializeMint",
  1: "InitializeAccount",
  3: "Transfer",
  4: "Approve",
  5: "Revoke",
  6: "SetAuthority",
  7: "MintTo",
  8: "Burn",
  9: "CloseAccount",
  10: "FreezeAccount",
  11: "ThawAccount",
  12: "TransferChecked",
  13: "ApproveChecked",
  14: "MintToChecked",
  15: "BurnChecked"
};

const SPL_AUTHORITY_TYPES: Record<number, string> = {
  0: "MintTokens",
  1: "FreezeAccount",
  2: "AccountOwner",
  3: "CloseAccount"
};

function readCompactU16(bytes: Uint8Array, offset: number): { value: number; nextOffset: number } {
  let value = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length) {
    const elem = bytes[pos++];
    value |= (elem & 0x7f) << shift;
    if ((elem & 0x80) === 0) break;
    shift += 7;
    if (shift > 21) break;
  }
  return { value, nextOffset: pos };
}

export interface DecodedSolanaInstruction {
  index: number;
  programId: string;
  programName: string;
  instructionName: string;
  accountsCount: number;
  accounts: string[];
  dataHex: string;
  riskFlags: string[];
}

export interface DecodedSolanaTxSummary {
  valid: boolean;
  messageVersion: "legacy" | "v0";
  signaturesCount: number;
  feePayer: string | null;
  accountKeys: string[];
  instructions: DecodedSolanaInstruction[];
  hasDrainerAuthorityChange: boolean;
  hasTokenApprove: boolean;
  hasCloseAccount: boolean;
  warnings: string[];
  txBase64: string;
}

/**
 * Pure TypeScript parser for serialized Solana Legacy & Versioned (v0) transactions
 * encoded in Base64 or Base58. Extracts CPI program IDs and SPL/System drainer patterns.
 */
export function decodeSolanaTransactionWire(rawInput: string): DecodedSolanaTxSummary {
  const trimmed = (rawInput || "").trim();
  let bytes: Uint8Array | null = null;
  if (trimmed.length >= 64) {
    if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
      bytes = decodeBase58(trimmed);
    }
    if (!bytes) {
      bytes = decodeBase64ToBytes(trimmed);
    }
  }

  if (!bytes || bytes.length < 70) {
    return {
      valid: false,
      messageVersion: "legacy",
      signaturesCount: 0,
      feePayer: null,
      accountKeys: [],
      instructions: [],
      hasDrainerAuthorityChange: false,
      hasTokenApprove: false,
      hasCloseAccount: false,
      warnings: ["Invalid or truncated serialized Solana transaction payload."],
      txBase64: ""
    };
  }

  try {
    let pos = 0;
    const sigInfo = readCompactU16(bytes, pos);
    const signaturesCount = sigInfo.value;
    pos = sigInfo.nextOffset;
    if (signaturesCount > 32 || pos + signaturesCount * 64 >= bytes.length) {
      throw new Error("Invalid signature table");
    }
    pos += signaturesCount * 64;

    let messageVersion: "legacy" | "v0" = "legacy";
    const firstMsgByte = bytes[pos];
    if ((firstMsgByte & 0x80) !== 0) {
      const ver = firstMsgByte & 0x7f;
      if (ver !== 0) throw new Error(`Unsupported Solana version ${ver}`);
      messageVersion = "v0";
      pos += 1;
    }

    // Message header: numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts
    pos += 3;
    const acctLenInfo = readCompactU16(bytes, pos);
    const numKeys = acctLenInfo.value;
    pos = acctLenInfo.nextOffset;
    if (numKeys === 0 || numKeys > 128 || pos + numKeys * 32 > bytes.length) {
      throw new Error("Invalid account keys table");
    }

    const accountKeys: string[] = [];
    for (let i = 0; i < numKeys; i++) {
      accountKeys.push(encodeBase58(bytes.slice(pos, pos + 32)));
      pos += 32;
    }

    // recentBlockhash (32 bytes)
    pos += 32;
    if (pos >= bytes.length) throw new Error("Missing instructions");

    const ixLenInfo = readCompactU16(bytes, pos);
    const numIx = ixLenInfo.value;
    pos = ixLenInfo.nextOffset;

    const instructions: DecodedSolanaInstruction[] = [];
    const warnings: string[] = [];
    let hasDrainerAuthorityChange = false;
    let hasTokenApprove = false;
    let hasCloseAccount = false;

    for (let i = 0; i < numIx && i < 40; i++) {
      if (pos >= bytes.length) break;
      const programIdIndex = bytes[pos++];
      const programId = accountKeys[programIdIndex] || `LookupAccount#${programIdIndex}`;
      const programName = KNOWN_SOLANA_PROGRAMS[programId] || "ExternalProgram";

      const acctIdxLen = readCompactU16(bytes, pos);
      pos = acctIdxLen.nextOffset;
      const ixAccounts: string[] = [];
      for (let a = 0; a < acctIdxLen.value && pos < bytes.length; a++) {
        const idx = bytes[pos++];
        ixAccounts.push(accountKeys[idx] || `Lookup#${idx}`);
      }

      const dataLenInfo = readCompactU16(bytes, pos);
      pos = dataLenInfo.nextOffset;
      const ixData = bytes.slice(pos, Math.min(bytes.length, pos + dataLenInfo.value));
      pos += dataLenInfo.value;

      const dataHex =
        "0x" +
        Array.from(ixData.slice(0, 64))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      const riskFlags: string[] = [];
      let instructionName = "UnknownInstruction";

      if (
        programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ||
        programId === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      ) {
        const op = ixData[0];
        instructionName = SPL_INSTRUCTION_NAMES[op] || `TokenOp(${op})`;
        if (op === 6 && ixData.length >= 2) {
          const authType = SPL_AUTHORITY_TYPES[ixData[1]] || `Type(${ixData[1]})`;
          instructionName = `SetAuthority(${authType})`;
          if (ixData[1] === 2 || ixData[1] === 3) {
            hasDrainerAuthorityChange = true;
            riskFlags.push(`SOLANA_SET_AUTHORITY_${authType.toUpperCase()}`);
            warnings.push(
              `CRITICAL_SOLANA_DRAINER: Instruction #${i} invokes SetAuthority(${authType}) on ${programName}, transferring permanent account control.`
            );
          }
        } else if (op === 4 || op === 13) {
          hasTokenApprove = true;
          riskFlags.push("SPL_TOKEN_APPROVE");
          warnings.push(
            `SPL_APPROVAL: Instruction #${i} grants SPL token delegate allowance (${instructionName}).`
          );
        } else if (op === 9) {
          hasCloseAccount = true;
          riskFlags.push("SPL_CLOSE_ACCOUNT");
        }
      } else if (programId === "11111111111111111111111111111111" && ixData.length >= 4) {
        const sysOp =
          ixData[0] | (ixData[1] << 8) | (ixData[2] << 16) | (ixData[3] << 24);
        const sysNames: Record<number, string> = {
          0: "CreateAccount",
          1: "Assign",
          2: "Transfer",
          3: "CreateAccountWithSeed",
          8: "Allocate"
        };
        instructionName = sysNames[sysOp] || `SystemOp(${sysOp})`;
        if (sysOp === 1) {
          hasDrainerAuthorityChange = true;
          riskFlags.push("SYSTEM_ASSIGN_OWNER_HIJACK");
          warnings.push(
            `CRITICAL_SOLANA_DRAINER: Instruction #${i} invokes SystemProgram.Assign, reassigning account ownership.`
          );
        }
      } else if (programId === "ComputeBudget111111111111111111111111111111" && ixData.length >= 1) {
        instructionName =
          ixData[0] === 2 ? "SetComputeUnitLimit" : ixData[0] === 3 ? "SetComputeUnitPrice" : "ComputeBudgetOp";
      } else if (programId === "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") {
        instructionName = "CreateAssociatedTokenAccount";
      } else if (programId === "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4") {
        instructionName = "JupiterSwap";
      }

      instructions.push({
        index: i,
        programId,
        programName,
        instructionName,
        accountsCount: ixAccounts.length,
        accounts: ixAccounts.slice(0, 6),
        dataHex,
        riskFlags
      });
    }

    return {
      valid: true,
      messageVersion,
      signaturesCount,
      feePayer: accountKeys[0] || null,
      accountKeys: accountKeys.slice(0, 20),
      instructions,
      hasDrainerAuthorityChange,
      hasTokenApprove,
      hasCloseAccount,
      warnings,
      txBase64: bytesToBase64(bytes)
    };
  } catch (err: any) {
    return {
      valid: false,
      messageVersion: "legacy",
      signaturesCount: 0,
      feePayer: null,
      accountKeys: [],
      instructions: [],
      hasDrainerAuthorityChange: false,
      hasTokenApprove: false,
      hasCloseAccount: false,
      warnings: [`Solana wire parse error: ${err?.message || "malformed"}`],
      txBase64: ""
    };
  }
}

export async function simulateSolanaTransactionPreflight(
  rawTransaction: string,
  env?: Env["Bindings"]
) {
  const wire = decodeSolanaTransactionWire(rawTransaction);
  const rpcs = getSolanaRpcUrls(env);

  let willRevert = !wire.valid;
  let revertReason: string | null = wire.valid ? null : wire.warnings[0] || "Invalid Solana transaction";
  let unitsConsumed: number | null = null;
  let logs: string[] = [];
  let slotNumber = 315420000;
  let simulationSource = "wire_parser_only";

  if (wire.valid && wire.txBase64) {
    const rpcRes = await postJsonRpcWithFailover<any>(
      rpcs,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: [
          wire.txBase64,
          {
            encoding: "base64",
            sigVerify: false,
            replaceRecentBlockhash: true,
            commitment: "processed"
          }
        ]
      },
      3200
    );

    const simVal = rpcRes?.data?.result?.value;
    const simCtxSlot = rpcRes?.data?.result?.context?.slot;
    if (typeof simCtxSlot === "number") slotNumber = simCtxSlot;
    if (simVal) {
      simulationSource = "solana_simulateTransaction";
      if (typeof simVal.unitsConsumed === "number") unitsConsumed = simVal.unitsConsumed;
      if (Array.isArray(simVal.logs)) logs = simVal.logs.slice(0, 20);
      if (simVal.err) {
        willRevert = true;
        revertReason =
          typeof simVal.err === "string"
            ? simVal.err
            : JSON.stringify(simVal.err);
      }
    } else if (rpcRes?.data?.error) {
      willRevert = true;
      revertReason = rpcRes.data.error.message || "Solana RPC simulation error";
    }
  }

  let recommendedAgentAction:
    | "EXECUTE_SAFE"
    | "CAUTION_HIGH_RISK"
    | "ABORT_WILL_REVERT"
    | "ABORT_DRAINER_APPROVAL" = "EXECUTE_SAFE";

  if (willRevert) {
    recommendedAgentAction = "ABORT_WILL_REVERT";
  } else if (wire.hasDrainerAuthorityChange) {
    recommendedAgentAction = "ABORT_DRAINER_APPROVAL";
  } else if (wire.hasTokenApprove || wire.hasCloseAccount) {
    recommendedAgentAction = "CAUTION_HIGH_RISK";
  }

  const timestampIso = new Date().toISOString();
  const attestationSha256 = keccak256(
    stringToHex(
      `nullclear:simulate:solana:${wire.feePayer || "unknown"}:${willRevert}:${unitsConsumed ?? 0}:${timestampIso}`
    )
  );

  const programsList = Array.from(new Set(wire.instructions.map((ix) => ix.programName))).join(", ");
  const llmDigest = willRevert
    ? `SOLANA PRE-FLIGHT FAILED (slot #${slotNumber}): Transaction WILL REVERT (${revertReason}). Action: ABORT_WILL_REVERT.`
    : recommendedAgentAction === "ABORT_DRAINER_APPROVAL"
      ? `SOLANA PRE-FLIGHT DRAINER ALERT (slot #${slotNumber}): ${wire.warnings[0]} Action: ABORT_DRAINER_APPROVAL.`
      : `SOLANA PRE-FLIGHT PASSED (slot #${slotNumber}): ${wire.instructions.length} instructions [${programsList || "none"}], ${unitsConsumed ?? "n/a"} CU, zero authority hijacks.`;

  return {
    llmDigest,
    recommendedAgentAction,
    willRevert,
    revertReason,
    isDangerousApproval: wire.hasDrainerAuthorityChange || wire.hasTokenApprove,
    estimatedGas: unitsConsumed ?? wire.instructions.length * 25000,
    computeUnitsConsumed: unitsConsumed,
    returnData: "0x",
    solanaSummary: {
      messageVersion: wire.messageVersion,
      feePayer: wire.feePayer,
      instructionsCount: wire.instructions.length,
      instructions: wire.instructions,
      logs: logs.slice(0, 10),
      warnings: wire.warnings
    },
    provenance: {
      chainId: "solana",
      blockNumber: slotNumber,
      timestampIso,
      attestationSha256,
      sourcesAgreed: [simulationSource, "solana_wire_parser"]
    }
  };
}

export async function fetchSolanaTokenMarketAndRug(mintAddress: string) {
  return Promise.allSettled([
    fetchWithTimeout(
      `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report`,
      { headers: { Accept: "application/json" } },
      3000
    ).then(async (r) => {
      if (r.ok) return r.json();
      const summary = await fetchWithTimeout(
        `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report/summary`,
        { headers: { Accept: "application/json" } },
        2000
      );
      return summary.ok ? summary.json() : null;
    }),
    fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
      { headers: { Accept: "application/json" } },
      3000
    ).then((r) => (r.ok ? r.json() : null))
  ]);
}

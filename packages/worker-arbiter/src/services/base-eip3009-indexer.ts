import {
  getArbiterStore,
  type Env,
  type IArbiterStore,
  type OnchainCounterpartyProfileRecord,
  type OnchainEip3009TransferRecord
} from "../env.js";

export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const EIP3009_AUTHORIZATION_USED_TOPIC0 =
  "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";
export const ERC20_TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const INDEXER_STATE_KEY = "base_usdc_eip3009";
export const MAX_BLOCK_CHUNK = 1000;

export interface RawEthLog {
  address?: string;
  topics: string[];
  data: string;
  blockNumber: string | number;
  transactionHash: string;
  logIndex?: string | number;
}

export interface SyncBaseEip3009Options {
  fromBlock?: number;
  toBlock?: number;
  mockLogs?: RawEthLog[];
  rpcUrl?: string;
}

export interface SyncBaseEip3009Result {
  syncedAt: number;
  rpcUrl: string;
  fromBlock: number;
  toBlock: number;
  lastIndexedBlock: number;
  authorizationLogsFound: number;
  newTransfersIndexed: number;
  transfers: OnchainEip3009TransferRecord[];
  updatedProfiles: OnchainCounterpartyProfileRecord[];
}

function toHexBlock(blockNum: number): string {
  return "0x" + Math.max(0, Math.floor(blockNum)).toString(16);
}

function parseBlockNum(val: string | number | undefined): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    try {
      return Number(BigInt(val));
    } catch {
      return 0;
    }
  }
  return 0;
}

function decodeIndexedAddress(topic: string | undefined): string | null {
  if (!topic || typeof topic !== "string") return null;
  const clean = topic.replace(/^0x/i, "");
  if (clean.length < 40) return null;
  return ("0x" + clean.slice(-40)).toLowerCase();
}

export function buildShadowGatewaySlug(address: string): string {
  const cleanHex = address.toLowerCase().replace(/^0x/i, "").slice(0, 8);
  return `base-seller-${cleanHex}`;
}

export function isMicropaymentAmount(amountAtomic: string): number {
  try {
    const val = BigInt(amountAtomic);
    return val >= 100n && val <= 10_000_000n ? 1 : 0;
  } catch {
    return 0;
  }
}

async function rpcCall<T = any>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs = 5000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params
      }),
      signal: controller.signal
    });
    const json: any = await res.json();
    if (json.error) {
      throw new Error(json.error.message || `RPC ${method} error`);
    }
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Match EIP-3009 AuthorizationUsed logs with ERC-20 Transfer logs in the same transaction where from == authorizer
 */
export function matchEip3009Logs(
  authLogs: RawEthLog[],
  transferLogs: RawEthLog[],
  nowTimestamp = Date.now()
): OnchainEip3009TransferRecord[] {
  const transfersByTx = new Map<string, RawEthLog[]>();
  for (const tLog of transferLogs) {
    if (!tLog?.transactionHash || !Array.isArray(tLog.topics)) continue;
    if ((tLog.topics[0] || "").toLowerCase() !== ERC20_TRANSFER_TOPIC0) continue;
    const txHash = tLog.transactionHash.toLowerCase();
    const list = transfersByTx.get(txHash) || [];
    list.push(tLog);
    transfersByTx.set(txHash, list);
  }

  const matched: OnchainEip3009TransferRecord[] = [];
  const seenTx = new Set<string>();

  for (const aLog of authLogs) {
    if (!aLog?.transactionHash || !Array.isArray(aLog.topics)) continue;
    if ((aLog.topics[0] || "").toLowerCase() !== EIP3009_AUTHORIZATION_USED_TOPIC0) continue;

    const txHash = aLog.transactionHash.toLowerCase();
    if (seenTx.has(txHash)) continue;

    const authorizer = decodeIndexedAddress(aLog.topics[1]);
    const nonce = aLog.topics[2] || "0x0";
    if (!authorizer) continue;

    const candidateTransfers = transfersByTx.get(txHash) || [];
    let bestRecipient: string | null = null;
    let bestAmount = -1n;

    for (const tLog of candidateTransfers) {
      const fromAddr = decodeIndexedAddress(tLog.topics[1]);
      const toAddr = decodeIndexedAddress(tLog.topics[2]);
      if (!fromAddr || !toAddr) continue;
      if (fromAddr !== authorizer) continue;

      let valueBig = 0n;
      try {
        valueBig = BigInt(tLog.data && tLog.data !== "0x" ? tLog.data : "0x0");
      } catch {
        valueBig = 0n;
      }

      if (valueBig > bestAmount) {
        bestAmount = valueBig;
        bestRecipient = toAddr;
      }
    }

    if (bestRecipient && bestAmount >= 0n) {
      seenTx.add(txHash);
      const amountStr = bestAmount.toString();
      const blockNumber = parseBlockNum(aLog.blockNumber);
      matched.push({
        tx_hash: txHash,
        block_number: blockNumber,
        timestamp: nowTimestamp,
        buyer_address: authorizer,
        seller_address: bestRecipient,
        amount_atomic: amountStr,
        nonce,
        is_micropayment: isMicropaymentAmount(amountStr)
      });
    }
  }

  return matched;
}

/**
 * Recompute counterparty profiles & Sybil wash-trade flags from indexed EIP-3009 transfers
 */
export async function recomputeCounterpartyProfiles(
  store: IArbiterStore,
  affectedAddresses?: Set<string>
): Promise<OnchainCounterpartyProfileRecord[]> {
  const allTransfers = await store.listOnchainEip3009Transfers(1000);

  interface AddrStats {
    asSellerCount: number;
    asBuyerCount: number;
    totalVolume: bigint;
    counterpartyCounts: Map<string, number>;
    lastSeenBlock: number;
  }

  const map = new Map<string, AddrStats>();
  const ensure = (addr: string): AddrStats => {
    const k = addr.toLowerCase();
    let s = map.get(k);
    if (!s) {
      s = {
        asSellerCount: 0,
        asBuyerCount: 0,
        totalVolume: 0n,
        counterpartyCounts: new Map(),
        lastSeenBlock: 0
      };
      map.set(k, s);
    }
    return s;
  };

  for (const tx of allTransfers) {
    const buyer = tx.buyer_address.toLowerCase();
    const seller = tx.seller_address.toLowerCase();
    let amt = 0n;
    try {
      amt = BigInt(tx.amount_atomic || "0");
    } catch {
      amt = 0n;
    }

    const bStat = ensure(buyer);
    bStat.asBuyerCount += 1;
    bStat.totalVolume += amt;
    bStat.counterpartyCounts.set(seller, (bStat.counterpartyCounts.get(seller) || 0) + 1);
    if (tx.block_number > bStat.lastSeenBlock) bStat.lastSeenBlock = tx.block_number;

    const sStat = ensure(seller);
    sStat.asSellerCount += 1;
    sStat.totalVolume += amt;
    sStat.counterpartyCounts.set(buyer, (sStat.counterpartyCounts.get(buyer) || 0) + 1);
    if (tx.block_number > sStat.lastSeenBlock) sStat.lastSeenBlock = tx.block_number;
  }

  const updated: OnchainCounterpartyProfileRecord[] = [];
  for (const [address, st] of map.entries()) {
    if (affectedAddresses && affectedAddresses.size > 0 && !affectedAddresses.has(address)) {
      continue;
    }

    const txCount = st.asSellerCount + st.asBuyerCount;
    if (txCount === 0) continue;

    const role: "SELLER" | "BUYER" | "BOTH" =
      st.asSellerCount > 0 && st.asBuyerCount > 0
        ? "BOTH"
        : st.asSellerCount > 0
          ? "SELLER"
          : "BUYER";

    const uniqueCounterparties = st.counterpartyCounts.size;
    let maxCpTx = 0;
    for (const c of st.counterpartyCounts.values()) {
      if (c > maxCpTx) maxCpTx = c;
    }

    const topCounterpartyShare = Number((maxCpTx / txCount).toFixed(4));
    const washTradeFlag = topCounterpartyShare > 0.6 && txCount >= 5 ? 1 : 0;

    const profile: OnchainCounterpartyProfileRecord = {
      address,
      role,
      tx_count: txCount,
      total_volume_atomic: st.totalVolume.toString(),
      unique_counterparties: uniqueCounterparties,
      top_counterparty_share: topCounterpartyShare,
      wash_trade_flag: washTradeFlag,
      shadow_gateway_slug: buildShadowGatewaySlug(address),
      last_seen_block: st.lastSeenBlock
    };

    await store.upsertOnchainCounterpartyProfile(profile);
    updated.push(profile);
  }

  return updated;
}

/**
 * Cross-reference discovered seller addresses with indexed_endpoints and seller_gateways
 */
async function crossReferenceDiscoveredSellers(
  store: IArbiterStore,
  profiles: OnchainCounterpartyProfileRecord[]
): Promise<void> {
  const gateways = await store.listSellerGateways();
  const gatewaysBySeller = new Map<string, (typeof gateways)[number]>();
  for (const gw of gateways) {
    gatewaysBySeller.set(gw.sellerAddress.toLowerCase(), gw);
  }

  const existingEndpoints = await store.queryIndexedEndpoints({ limit: 200 });
  const endpointsBySeller = new Set(
    existingEndpoints
      .map((e) => (e.seller_address || "").toLowerCase())
      .filter(Boolean)
  );

  for (const prof of profiles) {
    if (prof.role !== "SELLER" && prof.role !== "BOTH") continue;
    const sellerAddr = prof.address.toLowerCase();
    if (endpointsBySeller.has(sellerAddr)) continue;

    const matchedGw = gatewaysBySeller.get(sellerAddr);
    const endpointUrl = matchedGw
      ? `https://api.nullclear.dev/g/${matchedGw.slug}`
      : `https://api.nullclear.dev/g/${prof.shadow_gateway_slug}`;

    await store.upsertIndexedEndpoint({
      id: `ep_onchain_${prof.shadow_gateway_slug}`,
      endpoint_url: endpointUrl,
      origin_domain: "api.nullclear.dev",
      agent_id_erc8004: null,
      seller_address: prof.address,
      price_atomic: matchedGw?.priceAtomic || "10000",
      http_status: 402,
      is_valid_x402: 1,
      latency_ms: 40,
      uptime_score: prof.wash_trade_flag ? 65.0 : 99.0,
      hallucination_rate: 0.0,
      total_audits: Math.max(1, prof.tx_count),
      failed_audits: 0,
      category: matchedGw?.category || "data",
      description:
        matchedGw?.description ||
        `Discovered Base Mainnet EIP-3009 x402 Seller (${prof.tx_count} on-chain settlements). Claimable Shadow Gateway.`,
      nullclear_proxy_url: `https://api.nullclear.dev/${endpointUrl}`,
      last_audited_at: Date.now(),
      source: "ONCHAIN_EIP3009"
    });
  }
}

/**
 * Incremental Base Mainnet USDC EIP-3009 log scanner (up to 1,000 blocks per invocation)
 */
export async function syncBaseEip3009Logs(
  bindings?: Env["Bindings"],
  options?: SyncBaseEip3009Options
): Promise<SyncBaseEip3009Result> {
  const store = getArbiterStore(bindings);
  const rpcUrl =
    options?.rpcUrl ||
    bindings?.BASE_RPC_URL ||
    bindings?.BASE_MAINNET_RPC_URL ||
    "https://mainnet.base.org";

  const existingState = await store.getIndexerState(INDEXER_STATE_KEY);
  let fromBlock = options?.fromBlock ?? (existingState ? existingState.last_indexed_block + 1 : 0);
  let toBlock = options?.toBlock ?? 0;

  let authLogs: RawEthLog[] = [];
  let transferLogs: RawEthLog[] = [];

  if (Array.isArray(options?.mockLogs)) {
    authLogs = options.mockLogs.filter(
      (l) => (l.topics?.[0] || "").toLowerCase() === EIP3009_AUTHORIZATION_USED_TOPIC0
    );
    transferLogs = options.mockLogs.filter(
      (l) => (l.topics?.[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC0
    );
    const maxLogBlock = options.mockLogs.reduce(
      (max, l) => Math.max(max, parseBlockNum(l.blockNumber)),
      existingState?.last_indexed_block || 25_000_000
    );
    if (!fromBlock) fromBlock = Math.max(1, maxLogBlock - 100);
    if (!toBlock) toBlock = maxLogBlock;
  } else {
    try {
      const latestHex = await rpcCall<string>(rpcUrl, "eth_blockNumber", []);
      const latestBlock = parseBlockNum(latestHex);

      if (!fromBlock || fromBlock <= 0) {
        fromBlock = Math.max(1, latestBlock - 250);
      }
      if (!toBlock || toBlock <= 0) {
        toBlock = Math.min(latestBlock, fromBlock + MAX_BLOCK_CHUNK - 1);
      } else if (toBlock - fromBlock >= MAX_BLOCK_CHUNK) {
        toBlock = fromBlock + MAX_BLOCK_CHUNK - 1;
      }

      if (toBlock >= fromBlock) {
        // 1. Fetch EIP-3009 AuthorizationUsed logs across chunk
        const rawAuthLogs = await rpcCall<RawEthLog[]>(rpcUrl, "eth_getLogs", [
          {
            address: BASE_USDC_ADDRESS,
            fromBlock: toHexBlock(fromBlock),
            toBlock: toHexBlock(toBlock),
            topics: [EIP3009_AUTHORIZATION_USED_TOPIC0]
          }
        ]);

        if (Array.isArray(rawAuthLogs) && rawAuthLogs.length > 0) {
          authLogs = rawAuthLogs.filter(
            (l) => (l.topics?.[0] || "").toLowerCase() === EIP3009_AUTHORIZATION_USED_TOPIC0
          );
          // Check if the RPC or mock already returned Transfer logs in the same payload
          const embeddedTransfers = rawAuthLogs.filter(
            (l) => (l.topics?.[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC0
          );

          if (embeddedTransfers.length > 0) {
            transferLogs = embeddedTransfers;
          } else {
            // 2. Fetch Transfer logs for the exact block sub-range containing AuthorizationUsed events
            const blockNums = authLogs.map((l) => parseBlockNum(l.blockNumber)).filter((n) => n > 0);
            const minBlk = blockNums.length > 0 ? Math.min(...blockNums) : fromBlock;
            const maxBlk = blockNums.length > 0 ? Math.max(...blockNums) : toBlock;

            try {
              const rawTransferLogs = await rpcCall<RawEthLog[]>(rpcUrl, "eth_getLogs", [
                {
                  address: BASE_USDC_ADDRESS,
                  fromBlock: toHexBlock(minBlk),
                  toBlock: toHexBlock(maxBlk),
                  topics: [ERC20_TRANSFER_TOPIC0]
                }
              ]);
              if (Array.isArray(rawTransferLogs)) {
                transferLogs = rawTransferLogs;
              }
            } catch {
              // Fallback: fetch individual transaction receipts for matched AuthorizationUsed txs
              const uniqueTxs = Array.from(new Set(authLogs.map((a) => a.transactionHash))).slice(0, 15);
              for (const txHash of uniqueTxs) {
                try {
                  const receipt = await rpcCall<any>(rpcUrl, "eth_getTransactionReceipt", [txHash]);
                  if (Array.isArray(receipt?.logs)) {
                    transferLogs.push(...receipt.logs);
                  }
                } catch {}
              }
            }
          }
        }
      }
    } catch {
      // Fallback block window if RPC is unreachable in offline environment
      if (!fromBlock) fromBlock = existingState?.last_indexed_block || 28_500_000;
      if (!toBlock) toBlock = fromBlock;
    }
  }

  const matchedTransfers = matchEip3009Logs(authLogs, transferLogs);
  let newTransfersIndexed = 0;
  const affectedAddresses = new Set<string>();

  for (const transfer of matchedTransfers) {
    const inserted = await store.saveOnchainEip3009Transfer(transfer);
    if (inserted) {
      newTransfersIndexed += 1;
      affectedAddresses.add(transfer.buyer_address.toLowerCase());
      affectedAddresses.add(transfer.seller_address.toLowerCase());
    }
  }

  const lastIndexedBlock = Math.max(toBlock, existingState?.last_indexed_block || 0);
  if (lastIndexedBlock > 0) {
    await store.setIndexerState(INDEXER_STATE_KEY, lastIndexedBlock);
  }

  const updatedProfiles =
    affectedAddresses.size > 0
      ? await recomputeCounterpartyProfiles(store, affectedAddresses)
      : await store.listOnchainCounterpartyProfiles(undefined, 25);

  if (updatedProfiles.length > 0) {
    await crossReferenceDiscoveredSellers(store, updatedProfiles);
  }

  return {
    syncedAt: Date.now(),
    rpcUrl,
    fromBlock,
    toBlock,
    lastIndexedBlock,
    authorizationLogsFound: authLogs.length,
    newTransfersIndexed,
    transfers: matchedTransfers,
    updatedProfiles
  };
}

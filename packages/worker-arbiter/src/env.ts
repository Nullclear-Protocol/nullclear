import type {
  KYAMandate,
  SafePayCreatorRole,
  SafePayDealStatus,
  SafePayFeePayer,
  SafePayRedactedPreview,
  SafePayVerificationMode,
  SafePayVerificationSpec,
  SignedSafePaySettlementReceipt,
  X402PaymentSignaturePayload
} from "@nullclear/shared";

export interface Env {
  Bindings: {
    DB?: D1Database;
    KV?: KVNamespace;
    NULLCLEAR_CACHE?: KVNamespace;
    ENVIRONMENT?: string;
    SETTLEMENT_MODE?: "onchain" | "facilitator" | "simulated";
    ARBITER_PRIVATE_KEY?: string;
    TREASURY_WALLET_ADDRESS?: string;
    ARBITER_WALLET_ADDRESS?: string;
    ERC8004_AGENT_ID?: string;
    FACILITATOR_URL?: string;
    BASE_RPC_URL?: string;
    BASE_MAINNET_RPC_URL?: string;
    BASE_SEPOLIA_RPC_URL?: string;
    MIN_ONCHAIN_ATOMIC?: string;
    MAX_DAILY_ONCHAIN_PER_WALLET?: string;
  };
}

export interface SafePayDealRecord {
  id: string;
  title: string;
  description: string;
  creatorRole: SafePayCreatorRole;
  buyerAddress?: `0x${string}`;
  sellerAddress?: `0x${string}`;
  chainId: 8453 | 84532;
  amountAtomic: string;
  feePayer: SafePayFeePayer;
  sellerNetAtomic: string;
  protocolFeeAtomic: string;
  totalBuyerSignAtomic: string;
  status: SafePayDealStatus;
  expiresAt: number;
  verificationMode: SafePayVerificationMode;
  verificationSpec: SafePayVerificationSpec;
  sellerSignaturePayload?: X402PaymentSignaturePayload | null;
  feeSignaturePayload?: X402PaymentSignaturePayload | null;
  redactedPreview?: SafePayRedactedPreview | null;
  encryptedDeliverable?: string | null;
  deliverableMimeType?: string | null;
  deliverableFilename?: string | null;
  deliverableSha256?: string | null;
  sellerTxHash?: `0x${string}` | null;
  feeTxHash?: `0x${string}` | null;
  receipt?: SignedSafePaySettlementReceipt | null;
  validationErrors?: string[] | null;
  createdAt: number;
  updatedAt: number;
  settledAt?: number | null;
}

export interface AgentStats {
  totalClearedTx: number;
  totalFailedValidations: number;
  totalVolume: string;
}

export interface CounterpartyEdge {
  buyerAddress: string;
  sellerAgentId: string;
  txCount: number;
  totalVolume: string;
}

export interface StoredKyaRecord extends KYAMandate {
  id: string;
  chainId: number;
  signature: string;
  signerAddress: string;
  maxPerCallAtomic?: string;
  createdAt: number;
}

export interface StoredAgentRecord {
  agentId: string;
  chainId: number;
  ownerAddress?: string;
  agentUri?: string;
  createdAt: number;
}

export interface ClearingRecord {
  id: string;
  network: string;
  buyerAddress: string;
  sellerAgentId: string;
  amount: string;
  fee: string;
  targetUrl: string;
  status: "PASSED" | "FAILED_VALIDATION" | "FAILED_UPSTREAM" | "REPUTATION_BLOCKED";
  responseHash?: string;
  attestationSignature?: string;
  errorReason?: string;
  eip3009Nonce?: string;
  createdAt: number;
}

export type TrafficActorType =
  | "MCP_CLIENT"
  | "AI_CRAWLER"
  | "HUMAN_BROWSER"
  | "SDK_AGENT"
  | "BOT_SCANNER";

export interface TrafficEventRecord {
  id: string;
  timestamp: number;
  host: string;
  path: string;
  method: string;
  status: number;
  actorType: TrafficActorType;
  mcpMethod?: string | null;
  toolName?: string | null;
  country?: string | null;
  asn?: string | null;
  referer?: string | null;
}

export interface TelemetryFunnelWindow {
  windowLabel: string;
  totalInvocations: number;
  byActorType: Record<TrafficActorType, number>;
  byHost: Record<string, number>;
  topPaths: Array<{ path: string; count: number }>;
  mcp: {
    toolsListed: number;
    toolsCalled: number;
    conversionRatePct: number;
    topTools: Array<{ toolName: string; count: number }>;
    methodsBreakdown: Record<string, number>;
  };
  funnel: {
    discovery: number;
    mcpHandshake: number;
    freeOrSandboxCall: number;
    realX402Settlement: number;
  };
}

export interface TelemetryFunnelReport {
  generatedAt: number;
  last24h: TelemetryFunnelWindow;
  last7d: TelemetryFunnelWindow;
}

export interface FreeTierUsageResult {
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
}

export type ValidationPreset = "DEFAULT_JSON" | "STRICT_NO_REFUSAL" | "CUSTOM";

export interface SellerGatewayRecord {
  id: string;
  slug: string;
  sellerAddress: `0x${string}`;
  upstreamUrl: string;
  priceAtomic: string;
  description: string;
  category: string;
  validationPreset: ValidationPreset;
  customSchema?: Record<string, unknown> | null;
  totalCalls: number;
  createdAt: number;
}

export type IndexedEndpointSource =
  | "ERC8004_ONCHAIN"
  | "X402_MANIFEST"
  | "ONCHAIN_EIP3009"
  | "USER_SUBMITTED";

export interface IndexedEndpointRecord {
  id: string;
  endpoint_url: string;
  origin_domain: string;
  agent_id_erc8004?: string | null;
  seller_address?: string | null;
  price_atomic?: string | null;
  http_status?: number | null;
  is_valid_x402: number;
  latency_ms?: number | null;
  uptime_score: number;
  hallucination_rate: number;
  total_audits: number;
  failed_audits: number;
  category?: string | null;
  description?: string | null;
  nullclear_proxy_url: string;
  last_audited_at: number;
  source: IndexedEndpointSource;
}

export interface IndexedEndpointQueryFilter {
  minUptime?: number;
  maxLatencyMs?: number;
  verifiedOnly?: boolean;
  category?: string;
  query?: string;
  limit?: number;
}

export interface IndexerStateRecord {
  key: string;
  last_indexed_block: number;
  updated_at: number;
}

export interface OnchainEip3009TransferRecord {
  tx_hash: string;
  block_number: number;
  timestamp: number;
  buyer_address: string;
  seller_address: string;
  amount_atomic: string;
  nonce: string;
  is_micropayment: number;
}

export interface OnchainCounterpartyProfileRecord {
  address: string;
  role: "SELLER" | "BUYER" | "BOTH";
  tx_count: number;
  total_volume_atomic: string;
  unique_counterparties: number;
  top_counterparty_share: number;
  wash_trade_flag: number;
  shadow_gateway_slug: string;
  last_seen_block: number;
}

export const DEFAULT_SEEDED_ENDPOINTS: IndexedEndpointRecord[] = [
  {
    id: "ep_bazaar_market_oracle",
    endpoint_url: "https://api.nullclear.dev/v1/bazaar/market-oracle",
    origin_domain: "api.nullclear.dev",
    agent_id_erc8004: "124595",
    seller_address: "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c",
    price_atomic: "10000",
    http_status: 402,
    is_valid_x402: 1,
    latency_ms: 38,
    uptime_score: 100.0,
    hallucination_rate: 0.0,
    total_audits: 24,
    failed_audits: 0,
    category: "oracle",
    description:
      "Live cross-verified crypto price oracle (BTC, ETH, SOL, BASE tokens) with deterministic spread invariant check and cryptographic attestation.",
    nullclear_proxy_url: "https://api.nullclear.dev/https://api.nullclear.dev/v1/bazaar/market-oracle",
    last_audited_at: 1776400000000,
    source: "X402_MANIFEST"
  },
  {
    id: "ep_bazaar_token_security",
    endpoint_url: "https://api.nullclear.dev/v1/bazaar/token-security",
    origin_domain: "api.nullclear.dev",
    agent_id_erc8004: "124595",
    seller_address: "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c",
    price_atomic: "5000",
    http_status: 402,
    is_valid_x402: 1,
    latency_ms: 42,
    uptime_score: 100.0,
    hallucination_rate: 0.0,
    total_audits: 24,
    failed_audits: 0,
    category: "security",
    description:
      "Base Mainnet ERC-20 token security, contract bytecode verification, liquidity & honeypot risk scanner for AI trading agents.",
    nullclear_proxy_url: "https://api.nullclear.dev/https://api.nullclear.dev/v1/bazaar/token-security",
    last_audited_at: 1776400000000,
    source: "X402_MANIFEST"
  },
  {
    id: "ep_bazaar_wallet_risk",
    endpoint_url: "https://api.nullclear.dev/v1/bazaar/wallet-risk",
    origin_domain: "api.nullclear.dev",
    agent_id_erc8004: "124595",
    seller_address: "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c",
    price_atomic: "5000",
    http_status: 402,
    is_valid_x402: 1,
    latency_ms: 45,
    uptime_score: 100.0,
    hallucination_rate: 0.0,
    total_audits: 24,
    failed_audits: 0,
    category: "security",
    description:
      "Base Mainnet counterparty wallet OFAC sanctions screening, Sybil wash-trading concentration flags, and ERC-8004 reputation score.",
    nullclear_proxy_url: "https://api.nullclear.dev/https://api.nullclear.dev/v1/bazaar/wallet-risk",
    last_audited_at: 1776400000000,
    source: "X402_MANIFEST"
  },
  {
    id: "ep_bazaar_verified_fetch",
    endpoint_url: "https://api.nullclear.dev/v1/bazaar/verified-fetch",
    origin_domain: "api.nullclear.dev",
    agent_id_erc8004: "124595",
    seller_address: "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c",
    price_atomic: "10000",
    http_status: 402,
    is_valid_x402: 1,
    latency_ms: 54,
    uptime_score: 99.5,
    hallucination_rate: 0.0,
    total_audits: 20,
    failed_audits: 0,
    category: "data",
    description:
      "Cryptographically verified HTTP URL fetcher with canonical LLM refusal detection, JSON schema validation, and deep value invariants.",
    nullclear_proxy_url: "https://api.nullclear.dev/https://api.nullclear.dev/v1/bazaar/verified-fetch",
    last_audited_at: 1776400000000,
    source: "X402_MANIFEST"
  },
  {
    id: "ep_bazaar_audit",
    endpoint_url: "https://api.nullclear.dev/v1/bazaar/audit",
    origin_domain: "api.nullclear.dev",
    agent_id_erc8004: "124595",
    seller_address: "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c",
    price_atomic: "10000",
    http_status: 402,
    is_valid_x402: 1,
    latency_ms: 35,
    uptime_score: 100.0,
    hallucination_rate: 0.0,
    total_audits: 18,
    failed_audits: 0,
    category: "security",
    description:
      "ERC-8004 agent Sybil reputation score, wash-trading cluster risk, and x402 schema-escrow readiness audit on Base Mainnet.",
    nullclear_proxy_url: "https://api.nullclear.dev/https://api.nullclear.dev/v1/bazaar/audit",
    last_audited_at: 1776400000000,
    source: "ERC8004_ONCHAIN"
  },
  {
    id: "ep_bazaar_verify",
    endpoint_url: "https://api.nullclear.dev/v1/bazaar/verify",
    origin_domain: "api.nullclear.dev",
    agent_id_erc8004: "124595",
    seller_address: "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c",
    price_atomic: "10000",
    http_status: 402,
    is_valid_x402: 1,
    latency_ms: 31,
    uptime_score: 100.0,
    hallucination_rate: 0.0,
    total_audits: 18,
    failed_audits: 0,
    category: "ai",
    description:
      "Cryptographically verify an autonomous agent's x402 schema contract compatibility and active clearing readiness on Base Mainnet.",
    nullclear_proxy_url: "https://api.nullclear.dev/https://api.nullclear.dev/v1/bazaar/verify",
    last_audited_at: 1776400000000,
    source: "ERC8004_ONCHAIN"
  }
];

export interface ProtocolStats {
  totalClearings: number;
  validSettlements: number;
  voidedHallucinations: number;
  totalAgentsIndexed: number;
  recentClearings: Array<{
    clearing_id: string;
    seller_agent_id: string;
    stage: string;
    cleared: boolean;
    amount_atomic: string;
    created_at: number;
  }>;
}

export interface IArbiterStore {
  hasUsedNonce(network: string, buyerAddress: string, nonce: string): Promise<boolean>;
  getAgentStats(agentId: string): Promise<AgentStats>;
  recordPassedClearing(agentId: string, buyerAddress: string, amount: string, fee: string, clearing: ClearingRecord): Promise<void>;
  recordFailedValidation(agentId: string, buyerAddress: string, clearing: ClearingRecord): Promise<void>;
  getCounterpartyEdges(sellerAgentId: string): Promise<CounterpartyEdge[]>;
  getKyaMandate(agentId: string, chainId: number): Promise<StoredKyaRecord | null>;
  getKyaMandateByWallet(buyerAddress: string): Promise<StoredKyaRecord | null>;
  saveKyaMandate(mandate: StoredKyaRecord): Promise<void>;
  getAgent(agentId: string, chainId: number): Promise<StoredAgentRecord | null>;
  saveAgent(agent: StoredAgentRecord): Promise<void>;
  listAgents(): Promise<StoredAgentRecord[]>;
  getProtocolStats(): Promise<ProtocolStats>;
  saveSafePayDeal(deal: SafePayDealRecord): Promise<void>;
  getSafePayDeal(dealId: string): Promise<SafePayDealRecord | null>;
  recordTrafficEvent(event: TrafficEventRecord): Promise<void>;
  getTelemetryFunnel(): Promise<TelemetryFunnelReport>;
  consumeFreeTierCall(clientKey: string, dailyLimit?: number): Promise<FreeTierUsageResult>;
  getFreeTierRemaining(clientKey: string, dailyLimit?: number): Promise<number>;
  saveSellerGateway(gateway: SellerGatewayRecord): Promise<void>;
  getSellerGatewayBySlug(slug: string): Promise<SellerGatewayRecord | null>;
  listSellerGateways(category?: string): Promise<SellerGatewayRecord[]>;
  incrementSellerGatewayCalls(slug: string): Promise<void>;
  upsertIndexedEndpoint(record: IndexedEndpointRecord): Promise<void>;
  getIndexedEndpointByUrl(endpointUrl: string): Promise<IndexedEndpointRecord | null>;
  queryIndexedEndpoints(filter?: IndexedEndpointQueryFilter): Promise<IndexedEndpointRecord[]>;
  getIndexerState(key: string): Promise<IndexerStateRecord | null>;
  setIndexerState(key: string, lastIndexedBlock: number): Promise<void>;
  saveOnchainEip3009Transfer(transfer: OnchainEip3009TransferRecord): Promise<boolean>;
  listOnchainEip3009Transfers(limit?: number): Promise<OnchainEip3009TransferRecord[]>;
  upsertOnchainCounterpartyProfile(profile: OnchainCounterpartyProfileRecord): Promise<void>;
  getOnchainCounterpartyProfile(address: string): Promise<OnchainCounterpartyProfileRecord | null>;
  listOnchainCounterpartyProfiles(roleFilter?: "SELLER" | "BUYER" | "BOTH", limit?: number): Promise<OnchainCounterpartyProfileRecord[]>;
  reset(): void;
}

/**
 * High-performance deterministic in-memory store
 * Automatically active when D1 bindings are absent (unit tests, CLI demo, mock environment)
 */
export class MemoryArbiterStore implements IArbiterStore {
  private stats = new Map<string, AgentStats>();
  private edges = new Map<string, Map<string, { txCount: number; totalVolume: bigint }>>();
  private clearings: ClearingRecord[] = [];
  private usedNonces = new Set<string>();
  private kyaMandates = new Map<string, StoredKyaRecord>();
  private agents = new Map<string, StoredAgentRecord>();
  private safepayDeals = new Map<string, SafePayDealRecord>();
  private trafficEvents: TrafficEventRecord[] = [];
  private freeTierUsage = new Map<string, number>();
  private sellerGateways = new Map<string, SellerGatewayRecord>();
  private indexedEndpoints = new Map<string, IndexedEndpointRecord>();
  private indexerState = new Map<string, IndexerStateRecord>();
  private onchainTransfers = new Map<string, OnchainEip3009TransferRecord>();
  private counterpartyProfiles = new Map<string, OnchainCounterpartyProfileRecord>();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    for (const ep of DEFAULT_SEEDED_ENDPOINTS) {
      this.indexedEndpoints.set(ep.endpoint_url, { ...ep });
    }
  }

  reset(): void {
    this.stats.clear();
    this.edges.clear();
    this.clearings = [];
    this.usedNonces.clear();
    this.kyaMandates.clear();
    this.agents.clear();
    this.safepayDeals.clear();
    this.trafficEvents = [];
    this.freeTierUsage.clear();
    this.sellerGateways.clear();
    this.indexedEndpoints.clear();
    this.indexerState.clear();
    this.onchainTransfers.clear();
    this.counterpartyProfiles.clear();
    this.seedDefaults();
  }

  async hasUsedNonce(network: string, buyerAddress: string, nonce: string): Promise<boolean> {
    const key = `${network.toLowerCase()}:${buyerAddress.toLowerCase()}:${nonce.toLowerCase()}`;
    return this.usedNonces.has(key);
  }

  async getAgentStats(agentId: string): Promise<AgentStats> {
    const existing = this.stats.get(agentId);
    if (!existing) {
      return { totalClearedTx: 0, totalFailedValidations: 0, totalVolume: "0" };
    }
    return { ...existing };
  }

  async recordPassedClearing(
    agentId: string,
    buyerAddress: string,
    amount: string,
    _fee: string,
    clearing: ClearingRecord
  ): Promise<void> {
    this.clearings.push(clearing);
    if (clearing.eip3009Nonce) {
      this.usedNonces.add(`${clearing.network.toLowerCase()}:${buyerAddress.toLowerCase()}:${clearing.eip3009Nonce.toLowerCase()}`);
    }

    // Update stats
    const current = this.stats.get(agentId) || { totalClearedTx: 0, totalFailedValidations: 0, totalVolume: "0" };
    const newVolume = (BigInt(current.totalVolume) + BigInt(amount)).toString();
    this.stats.set(agentId, {
      totalClearedTx: current.totalClearedTx + 1,
      totalFailedValidations: current.totalFailedValidations,
      totalVolume: newVolume
    });

    // Update counterparty edge
    const normalizedBuyer = buyerAddress.toLowerCase();
    if (!this.edges.has(agentId)) {
      this.edges.set(agentId, new Map());
    }
    const agentBuyerMap = this.edges.get(agentId)!;
    const edge = agentBuyerMap.get(normalizedBuyer) || { txCount: 0, totalVolume: 0n };
    agentBuyerMap.set(normalizedBuyer, {
      txCount: edge.txCount + 1,
      totalVolume: edge.totalVolume + BigInt(amount)
    });
  }

  async recordFailedValidation(
    agentId: string,
    buyerAddress: string,
    clearing: ClearingRecord
  ): Promise<void> {
    this.clearings.push(clearing);
    if (clearing.eip3009Nonce) {
      this.usedNonces.add(`${clearing.network.toLowerCase()}:${buyerAddress.toLowerCase()}:${clearing.eip3009Nonce.toLowerCase()}`);
    }
    const current = this.stats.get(agentId) || { totalClearedTx: 0, totalFailedValidations: 0, totalVolume: "0" };
    this.stats.set(agentId, {
      totalClearedTx: current.totalClearedTx,
      totalFailedValidations: current.totalFailedValidations + 1,
      totalVolume: current.totalVolume
    });
  }

  async getCounterpartyEdges(sellerAgentId: string): Promise<CounterpartyEdge[]> {
    const agentBuyerMap = this.edges.get(sellerAgentId);
    if (!agentBuyerMap) return [];
    const results: CounterpartyEdge[] = [];
    for (const [buyerAddress, data] of agentBuyerMap.entries()) {
      results.push({
        buyerAddress,
        sellerAgentId,
        txCount: data.txCount,
        totalVolume: data.totalVolume.toString()
      });
    }
    return results;
  }

  async getKyaMandate(agentId: string, chainId: number): Promise<StoredKyaRecord | null> {
    const key = `${agentId}:${chainId}`;
    return this.kyaMandates.get(key) || null;
  }

  async getKyaMandateByWallet(buyerAddress: string): Promise<StoredKyaRecord | null> {
    const norm = (buyerAddress || "").trim().toLowerCase();
    if (!norm) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    let best: StoredKyaRecord | null = null;
    for (const rec of this.kyaMandates.values()) {
      const walletMatch =
        rec.agentWallet?.toLowerCase() === norm ||
        rec.signerAddress?.toLowerCase() === norm ||
        rec.agentId?.toLowerCase() === norm;
      if (walletMatch && rec.validUntil > nowSec) {
        if (!best || rec.createdAt >= best.createdAt) {
          best = rec;
        }
      }
    }
    return best ? { ...best } : null;
  }

  async saveKyaMandate(mandate: StoredKyaRecord): Promise<void> {
    const key = `${mandate.agentId}:${mandate.chainId}`;
    this.kyaMandates.set(key, mandate);
  }

  async getAgent(agentId: string, chainId: number): Promise<StoredAgentRecord | null> {
    const key = `${agentId}:${chainId}`;
    return this.agents.get(key) || null;
  }

  async saveAgent(agent: StoredAgentRecord): Promise<void> {
    const key = `${agent.agentId}:${agent.chainId}`;
    this.agents.set(key, agent);
  }

  async listAgents(): Promise<StoredAgentRecord[]> {
    return Array.from(this.agents.values()).map((a) => ({ ...a }));
  }

  async getProtocolStats(): Promise<ProtocolStats> {
    const totalClearings = this.clearings.length;
    const validSettlements = this.clearings.filter((c) => c.status === "PASSED").length;
    const voidedHallucinations = this.clearings.filter((c) => c.status !== "PASSED").length;
    const totalAgentsIndexed = this.agents.size;
    const recentClearings = this.clearings
      .slice(-10)
      .reverse()
      .map((r) => ({
        clearing_id: r.id,
        seller_agent_id: r.sellerAgentId,
        stage: r.status === "PASSED" ? "SETTLED" : r.status,
        cleared: r.status === "PASSED",
        amount_atomic: r.amount,
        created_at: r.createdAt
      }));

    return {
      totalClearings,
      validSettlements,
      voidedHallucinations,
      totalAgentsIndexed,
      recentClearings
    };
  }

  async saveSafePayDeal(deal: SafePayDealRecord): Promise<void> {
    this.safepayDeals.set(deal.id, { ...deal });
  }

  async getSafePayDeal(dealId: string): Promise<SafePayDealRecord | null> {
    const found = this.safepayDeals.get(dealId);
    return found ? { ...found } : null;
  }

  async recordTrafficEvent(event: TrafficEventRecord): Promise<void> {
    this.trafficEvents.push(event);
    if (this.trafficEvents.length > 5000) {
      this.trafficEvents.shift();
    }
  }

  async getTelemetryFunnel(): Promise<TelemetryFunnelReport> {
    const now = Date.now();
    const cutoff24h = now - 24 * 3600 * 1000;
    const cutoff7d = now - 7 * 24 * 3600 * 1000;
    const events24h = this.trafficEvents.filter((e) => e.timestamp >= cutoff24h);
    const events7d = this.trafficEvents.filter((e) => e.timestamp >= cutoff7d);
    const clearings24h = this.clearings.filter((c) => c.createdAt >= cutoff24h && c.status === "PASSED").length;
    const clearings7d = this.clearings.filter((c) => c.createdAt >= cutoff7d && c.status === "PASSED").length;

    return {
      generatedAt: now,
      last24h: buildTelemetryWindow("Last 24 Hours", events24h, clearings24h),
      last7d: buildTelemetryWindow("Last 7 Days", events7d, clearings7d)
    };
  }

  async consumeFreeTierCall(clientKey: string, dailyLimit = 10): Promise<FreeTierUsageResult> {
    const utcDate = new Date().toISOString().slice(0, 10);
    const key = `${utcDate}:${clientKey.toLowerCase()}`;
    const current = this.freeTierUsage.get(key) || 0;
    if (current >= dailyLimit) {
      return { allowed: false, used: current, remaining: 0, limit: dailyLimit };
    }
    const nextUsed = current + 1;
    this.freeTierUsage.set(key, nextUsed);
    return {
      allowed: true,
      used: nextUsed,
      remaining: Math.max(0, dailyLimit - nextUsed),
      limit: dailyLimit
    };
  }

  async getFreeTierRemaining(clientKey: string, dailyLimit = 10): Promise<number> {
    const utcDate = new Date().toISOString().slice(0, 10);
    const key = `${utcDate}:${clientKey.toLowerCase()}`;
    const current = this.freeTierUsage.get(key) || 0;
    return Math.max(0, dailyLimit - current);
  }

  async saveSellerGateway(gateway: SellerGatewayRecord): Promise<void> {
    this.sellerGateways.set(gateway.slug.toLowerCase(), { ...gateway, slug: gateway.slug.toLowerCase() });
  }

  async getSellerGatewayBySlug(slug: string): Promise<SellerGatewayRecord | null> {
    const found = this.sellerGateways.get(slug.toLowerCase());
    return found ? { ...found } : null;
  }

  async listSellerGateways(category?: string): Promise<SellerGatewayRecord[]> {
    const all = Array.from(this.sellerGateways.values());
    if (!category) return all.sort((a, b) => b.createdAt - a.createdAt);
    return all
      .filter((g) => g.category.toLowerCase() === category.toLowerCase())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async incrementSellerGatewayCalls(slug: string): Promise<void> {
    const found = this.sellerGateways.get(slug.toLowerCase());
    if (found) {
      found.totalCalls = (found.totalCalls || 0) + 1;
    }
  }

  async upsertIndexedEndpoint(record: IndexedEndpointRecord): Promise<void> {
    this.indexedEndpoints.set(record.endpoint_url, {
      ...record,
      nullclear_proxy_url: record.nullclear_proxy_url || `https://api.nullclear.dev/${record.endpoint_url}`
    });
  }

  async getIndexedEndpointByUrl(endpointUrl: string): Promise<IndexedEndpointRecord | null> {
    const found = this.indexedEndpoints.get(endpointUrl);
    return found ? { ...found } : null;
  }

  async queryIndexedEndpoints(filter?: IndexedEndpointQueryFilter): Promise<IndexedEndpointRecord[]> {
    const all = Array.from(this.indexedEndpoints.values());
    return filterAndSortIndexedEndpoints(all, filter);
  }

  async getIndexerState(key: string): Promise<IndexerStateRecord | null> {
    const found = this.indexerState.get(key);
    return found ? { ...found } : null;
  }

  async setIndexerState(key: string, lastIndexedBlock: number): Promise<void> {
    this.indexerState.set(key, {
      key,
      last_indexed_block: lastIndexedBlock,
      updated_at: Date.now()
    });
  }

  async saveOnchainEip3009Transfer(transfer: OnchainEip3009TransferRecord): Promise<boolean> {
    const normHash = transfer.tx_hash.toLowerCase();
    if (this.onchainTransfers.has(normHash)) {
      return false;
    }
    this.onchainTransfers.set(normHash, {
      ...transfer,
      tx_hash: normHash,
      buyer_address: transfer.buyer_address.toLowerCase(),
      seller_address: transfer.seller_address.toLowerCase()
    });
    return true;
  }

  async listOnchainEip3009Transfers(limit = 50): Promise<OnchainEip3009TransferRecord[]> {
    return Array.from(this.onchainTransfers.values())
      .sort((a, b) => b.block_number - a.block_number || b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async upsertOnchainCounterpartyProfile(profile: OnchainCounterpartyProfileRecord): Promise<void> {
    const normAddr = profile.address.toLowerCase();
    this.counterpartyProfiles.set(normAddr, {
      ...profile,
      address: normAddr
    });
  }

  async getOnchainCounterpartyProfile(address: string): Promise<OnchainCounterpartyProfileRecord | null> {
    const found = this.counterpartyProfiles.get(address.toLowerCase());
    return found ? { ...found } : null;
  }

  async listOnchainCounterpartyProfiles(
    roleFilter?: "SELLER" | "BUYER" | "BOTH",
    limit = 50
  ): Promise<OnchainCounterpartyProfileRecord[]> {
    let all = Array.from(this.counterpartyProfiles.values());
    if (roleFilter === "SELLER") {
      all = all.filter((p) => p.role === "SELLER" || p.role === "BOTH");
    } else if (roleFilter === "BUYER") {
      all = all.filter((p) => p.role === "BUYER" || p.role === "BOTH");
    } else if (roleFilter === "BOTH") {
      all = all.filter((p) => p.role === "BOTH");
    }
    return all
      .sort((a, b) => {
        if (a.wash_trade_flag !== b.wash_trade_flag) {
          return a.wash_trade_flag - b.wash_trade_flag;
        }
        if (b.tx_count !== a.tx_count) {
          return b.tx_count - a.tx_count;
        }
        const volDiff = BigInt(b.total_volume_atomic || "0") - BigInt(a.total_volume_atomic || "0");
        return volDiff > 0n ? 1 : volDiff < 0n ? -1 : 0;
      })
      .slice(0, limit);
  }
}

export function filterAndSortIndexedEndpoints(
  endpoints: IndexedEndpointRecord[],
  filter?: IndexedEndpointQueryFilter
): IndexedEndpointRecord[] {
  let list = endpoints.map((e) => ({ ...e }));

  if (filter) {
    if (typeof filter.minUptime === "number" && !Number.isNaN(filter.minUptime)) {
      list = list.filter((e) => Number(e.uptime_score) >= filter.minUptime!);
    }
    if (typeof filter.maxLatencyMs === "number" && !Number.isNaN(filter.maxLatencyMs)) {
      list = list.filter((e) => (e.latency_ms ?? 999999) <= filter.maxLatencyMs!);
    }
    if (filter.verifiedOnly === true) {
      list = list.filter((e) => Number(e.is_valid_x402) === 1);
    }
    if (filter.category && filter.category.trim() !== "") {
      const cat = filter.category.trim().toLowerCase();
      list = list.filter((e) => (e.category || "").toLowerCase() === cat);
    }
    if (filter.query && filter.query.trim() !== "") {
      const terms = filter.query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      list = list.filter((e) => {
        const haystack = [
          e.endpoint_url,
          e.origin_domain,
          e.description || "",
          e.category || "",
          e.agent_id_erc8004 || "",
          e.seller_address || ""
        ]
          .join(" ")
          .toLowerCase();
        return terms.every((t) => haystack.includes(t));
      });
    }
  }

  list.sort((a, b) => {
    if (b.uptime_score !== a.uptime_score) {
      return b.uptime_score - a.uptime_score;
    }
    return (a.latency_ms ?? 999999) - (b.latency_ms ?? 999999);
  });

  const limit = filter?.limit && filter.limit > 0 ? filter.limit : 100;
  return list.slice(0, limit);
}

function buildTelemetryWindow(
  windowLabel: string,
  events: TrafficEventRecord[],
  passedClearingsCount: number
): TelemetryFunnelWindow {
  const byActorType: Record<TrafficActorType, number> = {
    MCP_CLIENT: 0,
    AI_CRAWLER: 0,
    HUMAN_BROWSER: 0,
    SDK_AGENT: 0,
    BOT_SCANNER: 0
  };
  const byHost: Record<string, number> = {};
  const pathCounts = new Map<string, number>();
  const toolCounts = new Map<string, number>();
  const methodsBreakdown: Record<string, number> = {};

  let toolsListed = 0;
  let toolsCalled = 0;
  let discovery = 0;
  let mcpHandshake = 0;
  let freeOrSandboxCall = 0;
  let realX402Settlement = passedClearingsCount;

  for (const ev of events) {
    if (ev.actorType in byActorType) {
      byActorType[ev.actorType] += 1;
    } else {
      byActorType.BOT_SCANNER += 1;
    }

    const hostKey = ev.host || "unknown";
    byHost[hostKey] = (byHost[hostKey] || 0) + 1;

    const p = ev.path || "/";
    pathCounts.set(p, (pathCounts.get(p) || 0) + 1);

    if (ev.mcpMethod) {
      methodsBreakdown[ev.mcpMethod] = (methodsBreakdown[ev.mcpMethod] || 0) + 1;
      if (ev.mcpMethod === "tools/list") toolsListed += 1;
      if (ev.mcpMethod === "tools/call") toolsCalled += 1;
    }

    if (ev.toolName) {
      toolCounts.set(ev.toolName, (toolCounts.get(ev.toolName) || 0) + 1);
    }

    // Funnel classification
    if (
      p.startsWith("/.well-known/") ||
      p === "/llms.txt" ||
      p === "/llms-full.txt" ||
      p === "/openapi.json" ||
      p === "/api/v1/openapi.json" ||
      p === "/agents.md"
    ) {
      discovery += 1;
    } else if (
      ev.mcpMethod === "initialize" ||
      ev.mcpMethod === "tools/list" ||
      (p === "/mcp" && ev.method === "GET")
    ) {
      mcpHandshake += 1;
    } else if (
      ev.mcpMethod === "tools/call" ||
      p.startsWith("/v1/sandbox") ||
      p.startsWith("/v1/bazaar") ||
      p.startsWith("/https://") ||
      p.startsWith("/http://") ||
      p.startsWith("/v1/proxy") ||
      p.startsWith("/g/")
    ) {
      freeOrSandboxCall += 1;
    }
  }

  const topPaths = Array.from(pathCounts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const topTools = Array.from(toolCounts.entries())
    .map(([toolName, count]) => ({ toolName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const conversionRatePct =
    toolsListed > 0 ? Math.round((toolsCalled / toolsListed) * 10000) / 100 : 0;

  return {
    windowLabel,
    totalInvocations: events.length,
    byActorType,
    byHost,
    topPaths,
    mcp: {
      toolsListed,
      toolsCalled,
      conversionRatePct,
      topTools,
      methodsBreakdown
    },
    funnel: {
      discovery,
      mcpHandshake,
      freeOrSandboxCall,
      realX402Settlement
    }
  };
}

/**
 * Cloudflare D1 Database adapter for production deployments
 */
export class D1ArbiterStore implements IArbiterStore {
  constructor(private db: D1Database) {}

  reset(): void {
    // No-op for D1 database
  }

  async hasUsedNonce(network: string, buyerAddress: string, nonce: string): Promise<boolean> {
    const res = await this.db
      .prepare("SELECT id FROM clearings WHERE network = ? AND buyer_address = ? AND eip3009_nonce = ? LIMIT 1")
      .bind(network.toLowerCase(), buyerAddress.toLowerCase(), nonce.toLowerCase())
      .first<{ id: string }>();
    return Boolean(res);
  }

  async getAgentStats(agentId: string): Promise<AgentStats> {
    const res = await this.db
      .prepare("SELECT total_cleared_tx, total_failed_validations, total_volume FROM agent_stats WHERE agent_id = ?")
      .bind(agentId)
      .first<{ total_cleared_tx: number; total_failed_validations: number; total_volume: string }>();

    if (!res) {
      return { totalClearedTx: 0, totalFailedValidations: 0, totalVolume: "0" };
    }
    return {
      totalClearedTx: res.total_cleared_tx,
      totalFailedValidations: res.total_failed_validations,
      totalVolume: res.total_volume
    };
  }

  async recordPassedClearing(
    agentId: string,
    buyerAddress: string,
    amount: string,
    fee: string,
    clearing: ClearingRecord
  ): Promise<void> {
    const normalizedBuyer = buyerAddress.toLowerCase();
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO clearings (id, network, buyer_address, seller_agent_id, amount, fee, target_url, status, response_hash, attestation_signature, eip3009_nonce, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          clearing.id,
          clearing.network.toLowerCase(),
          normalizedBuyer,
          agentId,
          amount,
          fee,
          clearing.targetUrl,
          clearing.status,
          clearing.responseHash || null,
          clearing.attestationSignature || null,
          clearing.eip3009Nonce || null,
          clearing.createdAt
        ),
      this.db
        .prepare(
          `INSERT INTO agent_stats (agent_id, total_cleared_tx, total_failed_validations, total_volume)
           VALUES (?, 1, 0, ?)
           ON CONFLICT(agent_id) DO UPDATE SET
             total_cleared_tx = total_cleared_tx + 1,
             total_volume = CAST(CAST(total_volume AS INTEGER) + CAST(? AS INTEGER) AS TEXT)`
        )
        .bind(agentId, amount, amount),
      this.db
        .prepare(
          `INSERT INTO counterparty_edges (id, buyer_address, seller_agent_id, tx_count, total_volume, last_tx_at)
           VALUES (?, ?, ?, 1, ?, ?)
           ON CONFLICT(buyer_address, seller_agent_id) DO UPDATE SET
             tx_count = tx_count + 1,
             total_volume = CAST(CAST(total_volume AS INTEGER) + CAST(? AS INTEGER) AS TEXT),
             last_tx_at = ?`
        )
        .bind(
          `${normalizedBuyer}-${agentId}`,
          normalizedBuyer,
          agentId,
          amount,
          clearing.createdAt,
          amount,
          clearing.createdAt
        )
    ]);
  }

  async recordFailedValidation(
    agentId: string,
    buyerAddress: string,
    clearing: ClearingRecord
  ): Promise<void> {
    const normalizedBuyer = buyerAddress.toLowerCase();
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO clearings (id, network, buyer_address, seller_agent_id, amount, fee, target_url, status, error_reason, eip3009_nonce, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          clearing.id,
          clearing.network.toLowerCase(),
          normalizedBuyer,
          agentId,
          clearing.amount,
          clearing.fee,
          clearing.targetUrl,
          clearing.status,
          clearing.errorReason || null,
          clearing.eip3009Nonce || null,
          clearing.createdAt
        ),
      this.db
        .prepare(
          `INSERT INTO agent_stats (agent_id, total_cleared_tx, total_failed_validations, total_volume)
           VALUES (?, 0, 1, '0')
           ON CONFLICT(agent_id) DO UPDATE SET
             total_failed_validations = total_failed_validations + 1`
        )
        .bind(agentId)
    ]);
  }

  async getCounterpartyEdges(sellerAgentId: string): Promise<CounterpartyEdge[]> {
    const res = await this.db
      .prepare("SELECT buyer_address, seller_agent_id, tx_count, total_volume FROM counterparty_edges WHERE seller_agent_id = ?")
      .bind(sellerAgentId)
      .all<{ buyer_address: string; seller_agent_id: string; tx_count: number; total_volume: string }>();

    return (res.results || []).map(r => ({
      buyerAddress: r.buyer_address,
      sellerAgentId: r.seller_agent_id,
      txCount: r.tx_count,
      totalVolume: r.total_volume
    }));
  }

  async getKyaMandate(agentId: string, chainId: number): Promise<StoredKyaRecord | null> {
    const res = await this.db
      .prepare(
        "SELECT id, agent_id, chain_id, corporate_entity, entity_reg_num, agent_wallet, max_tx_limit_usd, liability_coverage_usd, valid_until, jurisdiction, signature, signer_address, created_at FROM kya_mandates WHERE agent_id = ? AND chain_id = ?"
      )
      .bind(agentId, chainId)
      .first<{
        id: string;
        agent_id: string;
        chain_id: number;
        corporate_entity: string;
        entity_reg_num: string;
        agent_wallet: `0x${string}`;
        max_tx_limit_usd: number;
        liability_coverage_usd: number;
        valid_until: number;
        jurisdiction: string;
        signature: string;
        signer_address: string;
        created_at: number;
      }>();

    if (!res) return null;
    return {
      id: res.id,
      agentId: res.agent_id,
      chainId: res.chain_id,
      corporateEntity: res.corporate_entity,
      entityRegistrationNumber: res.entity_reg_num,
      agentWallet: res.agent_wallet,
      maxTxLimitUsd: res.max_tx_limit_usd,
      liabilityCoverageUsd: res.liability_coverage_usd,
      validUntil: res.valid_until,
      jurisdiction: res.jurisdiction,
      signature: res.signature,
      signerAddress: res.signer_address,
      createdAt: res.created_at
    };
  }

  async getKyaMandateByWallet(buyerAddress: string): Promise<StoredKyaRecord | null> {
    const norm = (buyerAddress || "").trim().toLowerCase();
    if (!norm) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const res = await this.db
      .prepare(
        "SELECT id, agent_id, chain_id, corporate_entity, entity_reg_num, agent_wallet, max_tx_limit_usd, liability_coverage_usd, valid_until, jurisdiction, signature, signer_address, created_at FROM kya_mandates WHERE (lower(agent_wallet) = ? OR lower(signer_address) = ? OR lower(agent_id) = ?) AND valid_until > ? ORDER BY created_at DESC LIMIT 1"
      )
      .bind(norm, norm, norm, nowSec)
      .first<{
        id: string;
        agent_id: string;
        chain_id: number;
        corporate_entity: string;
        entity_reg_num: string;
        agent_wallet: `0x${string}`;
        max_tx_limit_usd: number;
        liability_coverage_usd: number;
        valid_until: number;
        jurisdiction: string;
        signature: string;
        signer_address: string;
        created_at: number;
      }>();

    if (!res) return null;
    return {
      id: res.id,
      agentId: res.agent_id,
      chainId: res.chain_id,
      corporateEntity: res.corporate_entity,
      entityRegistrationNumber: res.entity_reg_num,
      agentWallet: res.agent_wallet,
      maxTxLimitUsd: res.max_tx_limit_usd,
      liabilityCoverageUsd: res.liability_coverage_usd,
      validUntil: res.valid_until,
      jurisdiction: res.jurisdiction,
      signature: res.signature,
      signerAddress: res.signer_address,
      createdAt: res.created_at
    };
  }

  async saveKyaMandate(mandate: StoredKyaRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO kya_mandates (id, agent_id, chain_id, corporate_entity, entity_reg_num, agent_wallet, max_tx_limit_usd, liability_coverage_usd, valid_until, jurisdiction, signature, signer_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id, chain_id) DO UPDATE SET
           corporate_entity = excluded.corporate_entity,
           entity_reg_num = excluded.entity_reg_num,
           agent_wallet = excluded.agent_wallet,
           max_tx_limit_usd = excluded.max_tx_limit_usd,
           liability_coverage_usd = excluded.liability_coverage_usd,
           valid_until = excluded.valid_until,
           jurisdiction = excluded.jurisdiction,
           signature = excluded.signature,
           signer_address = excluded.signer_address`
      )
      .bind(
        mandate.id,
        mandate.agentId,
        mandate.chainId,
        mandate.corporateEntity,
        mandate.entityRegistrationNumber,
        mandate.agentWallet,
        mandate.maxTxLimitUsd,
        mandate.liabilityCoverageUsd,
        mandate.validUntil,
        mandate.jurisdiction,
        mandate.signature,
        mandate.signerAddress,
        mandate.createdAt
      )
      .run();
  }

  async getAgent(agentId: string, chainId: number): Promise<StoredAgentRecord | null> {
    const res = await this.db
      .prepare("SELECT agent_id, chain_id, owner_address, agent_uri, created_at FROM agents WHERE agent_id = ? AND chain_id = ?")
      .bind(agentId, chainId)
      .first<{ agent_id: string; chain_id: number; owner_address?: string; agent_uri?: string; created_at: number }>();

    if (!res) return null;
    return {
      agentId: res.agent_id,
      chainId: res.chain_id,
      ownerAddress: res.owner_address,
      agentUri: res.agent_uri,
      createdAt: res.created_at
    };
  }

  async saveAgent(agent: StoredAgentRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO agents (agent_id, chain_id, owner_address, agent_uri, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           owner_address = excluded.owner_address,
           agent_uri = excluded.agent_uri`
      )
      .bind(agent.agentId, agent.chainId, agent.ownerAddress || null, agent.agentUri || null, agent.createdAt)
      .run();
  }

  async listAgents(): Promise<StoredAgentRecord[]> {
    const results: StoredAgentRecord[] = [];
    const seen = new Set<string>();
    try {
      const res = await this.db
        .prepare("SELECT agent_id, chain_id, owner_address, agent_uri, created_at FROM agents ORDER BY created_at DESC LIMIT 200")
        .all<{ agent_id: string; chain_id: number; owner_address?: string; agent_uri?: string; created_at: number }>();
      for (const r of res.results || []) {
        seen.add(r.agent_id);
        results.push({
          agentId: r.agent_id,
          chainId: Number(r.chain_id || 8453),
          ownerAddress: r.owner_address,
          agentUri: r.agent_uri,
          createdAt: Number(r.created_at || Date.now())
        });
      }
    } catch {}
    try {
      const res2 = await this.db
        .prepare("SELECT agent_id, chain_id, owner_address, agent_uri, created_at FROM erc8004_agents ORDER BY created_at DESC LIMIT 200")
        .all<{ agent_id: string; chain_id: number; owner_address?: string; agent_uri?: string; created_at: number }>();
      for (const r of res2.results || []) {
        if (!seen.has(r.agent_id)) {
          seen.add(r.agent_id);
          results.push({
            agentId: r.agent_id,
            chainId: Number(r.chain_id || 8453),
            ownerAddress: r.owner_address,
            agentUri: r.agent_uri,
            createdAt: Number(r.created_at || Date.now())
          });
        }
      }
    } catch {}
    return results;
  }

  async getProtocolStats(): Promise<ProtocolStats> {
    const [totalClearingsRes, validRes, voidedRes, totalAgentsRes, recentRes] = await Promise.all([
      this.db.prepare("SELECT COUNT(*) as count FROM clearings").first<{ count: number }>(),
      this.db.prepare("SELECT COUNT(*) as count FROM clearings WHERE status = 'PASSED'").first<{ count: number }>(),
      this.db.prepare("SELECT COUNT(*) as count FROM clearings WHERE status != 'PASSED'").first<{ count: number }>(),
      this.db.prepare("SELECT COUNT(*) as count FROM agents").first<{ count: number }>(),
      this.db.prepare("SELECT id, seller_agent_id, status, amount, created_at FROM clearings ORDER BY created_at DESC LIMIT 10").all<{
        id: string;
        seller_agent_id: string;
        status: string;
        amount: string;
        created_at: number;
      }>()
    ]);

    const totalClearings = Number(totalClearingsRes?.count || 0);
    const validSettlements = Number(validRes?.count || 0);
    const voidedHallucinations = Number(voidedRes?.count || 0);
    const totalAgentsIndexed = Number(totalAgentsRes?.count || 0);
    const recentClearings = (recentRes.results || []).map((r) => ({
      clearing_id: r.id,
      seller_agent_id: r.seller_agent_id,
      stage: r.status === "PASSED" ? "SETTLED" : r.status,
      cleared: r.status === "PASSED",
      amount_atomic: r.amount,
      created_at: r.created_at
    }));

    return {
      totalClearings,
      validSettlements,
      voidedHallucinations,
      totalAgentsIndexed,
      recentClearings
    };
  }

  private async ensureSafePayTable(): Promise<void> {
    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS safepay_deals (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          creator_role TEXT NOT NULL DEFAULT 'seller',
          buyer_address TEXT,
          seller_address TEXT,
          chain_id INTEGER NOT NULL DEFAULT 8453,
          amount_atomic TEXT NOT NULL,
          fee_payer TEXT NOT NULL DEFAULT 'seller',
          seller_net_atomic TEXT NOT NULL,
          protocol_fee_atomic TEXT NOT NULL,
          total_buyer_sign_atomic TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'CREATED',
          expires_at INTEGER NOT NULL,
          verification_mode TEXT NOT NULL,
          verification_spec_json TEXT NOT NULL,
          seller_sig_payload_json TEXT,
          fee_sig_payload_json TEXT,
          redacted_preview_json TEXT,
          encrypted_deliverable TEXT,
          deliverable_mime_type TEXT,
          deliverable_filename TEXT,
          deliverable_sha256 TEXT,
          seller_tx_hash TEXT,
          fee_tx_hash TEXT,
          receipt_json TEXT,
          validation_errors_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          settled_at INTEGER
        )`
      )
      .run();
  }

  async saveSafePayDeal(deal: SafePayDealRecord): Promise<void> {
    await this.ensureSafePayTable();
    await this.db
      .prepare(
        `INSERT INTO safepay_deals (
          id, title, description, creator_role, buyer_address, seller_address, chain_id,
          amount_atomic, fee_payer, seller_net_atomic, protocol_fee_atomic, total_buyer_sign_atomic,
          status, expires_at, verification_mode, verification_spec_json,
          seller_sig_payload_json, fee_sig_payload_json, redacted_preview_json,
          encrypted_deliverable, deliverable_mime_type, deliverable_filename, deliverable_sha256,
          seller_tx_hash, fee_tx_hash, receipt_json, validation_errors_json,
          created_at, updated_at, settled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          buyer_address = excluded.buyer_address,
          seller_address = excluded.seller_address,
          status = excluded.status,
          seller_sig_payload_json = excluded.seller_sig_payload_json,
          fee_sig_payload_json = excluded.fee_sig_payload_json,
          redacted_preview_json = excluded.redacted_preview_json,
          encrypted_deliverable = excluded.encrypted_deliverable,
          deliverable_mime_type = excluded.deliverable_mime_type,
          deliverable_filename = excluded.deliverable_filename,
          deliverable_sha256 = excluded.deliverable_sha256,
          seller_tx_hash = excluded.seller_tx_hash,
          fee_tx_hash = excluded.fee_tx_hash,
          receipt_json = excluded.receipt_json,
          validation_errors_json = excluded.validation_errors_json,
          updated_at = excluded.updated_at,
          settled_at = excluded.settled_at`
      )
      .bind(
        deal.id,
        deal.title,
        deal.description,
        deal.creatorRole,
        deal.buyerAddress || null,
        deal.sellerAddress || null,
        deal.chainId,
        deal.amountAtomic,
        deal.feePayer,
        deal.sellerNetAtomic,
        deal.protocolFeeAtomic,
        deal.totalBuyerSignAtomic,
        deal.status,
        deal.expiresAt,
        deal.verificationMode,
        JSON.stringify(deal.verificationSpec),
        deal.sellerSignaturePayload ? JSON.stringify(deal.sellerSignaturePayload) : null,
        deal.feeSignaturePayload ? JSON.stringify(deal.feeSignaturePayload) : null,
        deal.redactedPreview ? JSON.stringify(deal.redactedPreview) : null,
        deal.encryptedDeliverable ?? null,
        deal.deliverableMimeType ?? null,
        deal.deliverableFilename ?? null,
        deal.deliverableSha256 ?? null,
        deal.sellerTxHash ?? null,
        deal.feeTxHash ?? null,
        deal.receipt ? JSON.stringify(deal.receipt) : null,
        deal.validationErrors ? JSON.stringify(deal.validationErrors) : null,
        deal.createdAt,
        deal.updatedAt,
        deal.settledAt ?? null
      )
      .run();
  }

  async getSafePayDeal(dealId: string): Promise<SafePayDealRecord | null> {
    await this.ensureSafePayTable();
    const row = await this.db
      .prepare("SELECT * FROM safepay_deals WHERE id = ? LIMIT 1")
      .bind(dealId)
      .first<any>();
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      description: row.description || "",
      creatorRole: row.creator_role || "seller",
      buyerAddress: row.buyer_address || undefined,
      sellerAddress: row.seller_address || undefined,
      chainId: Number(row.chain_id) === 84532 ? 84532 : 8453,
      amountAtomic: row.amount_atomic,
      feePayer: row.fee_payer || "seller",
      sellerNetAtomic: row.seller_net_atomic,
      protocolFeeAtomic: row.protocol_fee_atomic,
      totalBuyerSignAtomic: row.total_buyer_sign_atomic,
      status: row.status,
      expiresAt: Number(row.expires_at),
      verificationMode: row.verification_mode,
      verificationSpec: row.verification_spec_json ? JSON.parse(row.verification_spec_json) : {},
      sellerSignaturePayload: row.seller_sig_payload_json ? JSON.parse(row.seller_sig_payload_json) : null,
      feeSignaturePayload: row.fee_sig_payload_json ? JSON.parse(row.fee_sig_payload_json) : null,
      redactedPreview: row.redacted_preview_json ? JSON.parse(row.redacted_preview_json) : null,
      encryptedDeliverable: row.encrypted_deliverable ?? null,
      deliverableMimeType: row.deliverable_mime_type ?? null,
      deliverableFilename: row.deliverable_filename ?? null,
      deliverableSha256: row.deliverable_sha256 ?? null,
      sellerTxHash: row.seller_tx_hash ?? null,
      feeTxHash: row.fee_tx_hash ?? null,
      receipt: row.receipt_json ? JSON.parse(row.receipt_json) : null,
      validationErrors: row.validation_errors_json ? JSON.parse(row.validation_errors_json) : null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      settledAt: row.settled_at ? Number(row.settled_at) : null
    };
  }

  private async ensureTelemetryAndFreeTierTables(): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS traffic_events (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          host TEXT NOT NULL,
          path TEXT NOT NULL,
          method TEXT NOT NULL,
          status INTEGER NOT NULL,
          actor_type TEXT NOT NULL,
          mcp_method TEXT,
          tool_name TEXT,
          country TEXT,
          asn TEXT,
          referer TEXT
        )`
      ),
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS free_tier_usage (
          client_key TEXT NOT NULL,
          usage_date TEXT NOT NULL,
          call_count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (client_key, usage_date)
        )`
      )
    ]);
  }

  private async ensureGatewayTable(): Promise<void> {
    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS seller_gateways (
          id TEXT PRIMARY KEY,
          slug TEXT UNIQUE NOT NULL,
          seller_address TEXT NOT NULL,
          upstream_url TEXT NOT NULL,
          price_atomic TEXT NOT NULL,
          description TEXT,
          category TEXT,
          validation_preset TEXT,
          custom_schema TEXT,
          total_calls INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL
        )`
      )
      .run();
  }

  async recordTrafficEvent(event: TrafficEventRecord): Promise<void> {
    await this.ensureTelemetryAndFreeTierTables();
    await this.db
      .prepare(
        `INSERT INTO traffic_events (
          id, timestamp, host, path, method, status, actor_type, mcp_method, tool_name, country, asn, referer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        event.id,
        event.timestamp,
        event.host,
        event.path,
        event.method,
        event.status,
        event.actorType,
        event.mcpMethod || null,
        event.toolName || null,
        event.country || null,
        event.asn || null,
        event.referer || null
      )
      .run();
  }

  async getTelemetryFunnel(): Promise<TelemetryFunnelReport> {
    await this.ensureTelemetryAndFreeTierTables();
    const now = Date.now();
    const cutoff24h = now - 24 * 3600 * 1000;
    const cutoff7d = now - 7 * 24 * 3600 * 1000;

    const [rows7dRes, clearings24hRes, clearings7dRes] = await Promise.all([
      this.db
        .prepare("SELECT * FROM traffic_events WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 10000")
        .bind(cutoff7d)
        .all<any>(),
      this.db
        .prepare("SELECT COUNT(*) as count FROM clearings WHERE status = 'PASSED' AND created_at >= ?")
        .bind(cutoff24h)
        .first<{ count: number }>(),
      this.db
        .prepare("SELECT COUNT(*) as count FROM clearings WHERE status = 'PASSED' AND created_at >= ?")
        .bind(cutoff7d)
        .first<{ count: number }>()
    ]);

    const events7d: TrafficEventRecord[] = (rows7dRes.results || []).map((r: any) => ({
      id: r.id,
      timestamp: Number(r.timestamp),
      host: r.host,
      path: r.path,
      method: r.method,
      status: Number(r.status),
      actorType: r.actor_type as TrafficActorType,
      mcpMethod: r.mcp_method,
      toolName: r.tool_name,
      country: r.country,
      asn: r.asn,
      referer: r.referer
    }));

    const events24h = events7d.filter((e) => e.timestamp >= cutoff24h);

    return {
      generatedAt: now,
      last24h: buildTelemetryWindow("Last 24 Hours", events24h, Number(clearings24hRes?.count || 0)),
      last7d: buildTelemetryWindow("Last 7 Days", events7d, Number(clearings7dRes?.count || 0))
    };
  }

  async consumeFreeTierCall(clientKey: string, dailyLimit = 10): Promise<FreeTierUsageResult> {
    await this.ensureTelemetryAndFreeTierTables();
    const utcDate = new Date().toISOString().slice(0, 10);
    const normalizedKey = clientKey.toLowerCase();
    const existing = await this.db
      .prepare("SELECT call_count FROM free_tier_usage WHERE client_key = ? AND usage_date = ? LIMIT 1")
      .bind(normalizedKey, utcDate)
      .first<{ call_count: number }>();

    const current = Number(existing?.call_count || 0);
    if (current >= dailyLimit) {
      return { allowed: false, used: current, remaining: 0, limit: dailyLimit };
    }

    const nextUsed = current + 1;
    await this.db
      .prepare(
        `INSERT INTO free_tier_usage (client_key, usage_date, call_count, updated_at)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(client_key, usage_date) DO UPDATE SET
           call_count = call_count + 1,
           updated_at = excluded.updated_at`
      )
      .bind(normalizedKey, utcDate, Date.now())
      .run();

    return {
      allowed: true,
      used: nextUsed,
      remaining: Math.max(0, dailyLimit - nextUsed),
      limit: dailyLimit
    };
  }

  async getFreeTierRemaining(clientKey: string, dailyLimit = 10): Promise<number> {
    await this.ensureTelemetryAndFreeTierTables();
    const utcDate = new Date().toISOString().slice(0, 10);
    const normalizedKey = clientKey.toLowerCase();
    const existing = await this.db
      .prepare("SELECT call_count FROM free_tier_usage WHERE client_key = ? AND usage_date = ? LIMIT 1")
      .bind(normalizedKey, utcDate)
      .first<{ call_count: number }>();
    const current = Number(existing?.call_count || 0);
    return Math.max(0, dailyLimit - current);
  }

  async saveSellerGateway(gateway: SellerGatewayRecord): Promise<void> {
    await this.ensureGatewayTable();
    await this.db
      .prepare(
        `INSERT INTO seller_gateways (
          id, slug, seller_address, upstream_url, price_atomic, description, category, validation_preset, custom_schema, total_calls, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          seller_address = excluded.seller_address,
          upstream_url = excluded.upstream_url,
          price_atomic = excluded.price_atomic,
          description = excluded.description,
          category = excluded.category,
          validation_preset = excluded.validation_preset,
          custom_schema = excluded.custom_schema`
      )
      .bind(
        gateway.id,
        gateway.slug.toLowerCase(),
        gateway.sellerAddress,
        gateway.upstreamUrl,
        gateway.priceAtomic,
        gateway.description || "",
        gateway.category || "data",
        gateway.validationPreset || "STRICT_NO_REFUSAL",
        gateway.customSchema ? JSON.stringify(gateway.customSchema) : null,
        gateway.totalCalls || 0,
        gateway.createdAt
      )
      .run();
  }

  async getSellerGatewayBySlug(slug: string): Promise<SellerGatewayRecord | null> {
    await this.ensureGatewayTable();
    const row = await this.db
      .prepare("SELECT * FROM seller_gateways WHERE slug = ? LIMIT 1")
      .bind(slug.toLowerCase())
      .first<any>();
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      sellerAddress: row.seller_address,
      upstreamUrl: row.upstream_url,
      priceAtomic: row.price_atomic,
      description: row.description || "",
      category: row.category || "data",
      validationPreset: (row.validation_preset || "STRICT_NO_REFUSAL") as ValidationPreset,
      customSchema: row.custom_schema ? JSON.parse(row.custom_schema) : null,
      totalCalls: Number(row.total_calls || 0),
      createdAt: Number(row.created_at)
    };
  }

  async listSellerGateways(category?: string): Promise<SellerGatewayRecord[]> {
    await this.ensureGatewayTable();
    const stmt = category
      ? this.db
          .prepare("SELECT * FROM seller_gateways WHERE lower(category) = ? ORDER BY created_at DESC LIMIT 100")
          .bind(category.toLowerCase())
      : this.db.prepare("SELECT * FROM seller_gateways ORDER BY created_at DESC LIMIT 100");
    const res = await stmt.all<any>();
    return (res.results || []).map((row: any) => ({
      id: row.id,
      slug: row.slug,
      sellerAddress: row.seller_address,
      upstreamUrl: row.upstream_url,
      priceAtomic: row.price_atomic,
      description: row.description || "",
      category: row.category || "data",
      validationPreset: (row.validation_preset || "STRICT_NO_REFUSAL") as ValidationPreset,
      customSchema: row.custom_schema ? JSON.parse(row.custom_schema) : null,
      totalCalls: Number(row.total_calls || 0),
      createdAt: Number(row.created_at)
    }));
  }

  async incrementSellerGatewayCalls(slug: string): Promise<void> {
    await this.ensureGatewayTable();
    await this.db
      .prepare("UPDATE seller_gateways SET total_calls = total_calls + 1 WHERE slug = ?")
      .bind(slug.toLowerCase())
      .run();
  }

  private async ensureRadarAndCrawlerTables(): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS indexed_endpoints (
          id TEXT PRIMARY KEY,
          endpoint_url TEXT UNIQUE NOT NULL,
          origin_domain TEXT NOT NULL,
          agent_id_erc8004 TEXT,
          seller_address TEXT,
          price_atomic TEXT,
          http_status INTEGER,
          is_valid_x402 INTEGER DEFAULT 0,
          latency_ms INTEGER,
          uptime_score REAL DEFAULT 100.0,
          hallucination_rate REAL DEFAULT 0.0,
          total_audits INTEGER DEFAULT 0,
          failed_audits INTEGER DEFAULT 0,
          category TEXT,
          description TEXT,
          nullclear_proxy_url TEXT NOT NULL,
          last_audited_at INTEGER,
          source TEXT
        )`
      ),
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS indexer_state (
          key TEXT PRIMARY KEY,
          last_indexed_block INTEGER NOT NULL,
          updated_at INTEGER
        )`
      ),
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS onchain_eip3009_transfers (
          tx_hash TEXT PRIMARY KEY,
          block_number INTEGER,
          timestamp INTEGER,
          buyer_address TEXT NOT NULL,
          seller_address TEXT NOT NULL,
          amount_atomic TEXT NOT NULL,
          nonce TEXT,
          is_micropayment INTEGER DEFAULT 0
        )`
      ),
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS onchain_counterparty_profiles (
          address TEXT PRIMARY KEY,
          role TEXT,
          tx_count INTEGER DEFAULT 0,
          total_volume_atomic TEXT DEFAULT '0',
          unique_counterparties INTEGER DEFAULT 0,
          top_counterparty_share REAL DEFAULT 0.0,
          wash_trade_flag INTEGER DEFAULT 0,
          shadow_gateway_slug TEXT,
          last_seen_block INTEGER
        )`
      )
    ]);
  }

  private mapIndexedEndpointRow(row: any): IndexedEndpointRecord {
    return {
      id: row.id,
      endpoint_url: row.endpoint_url,
      origin_domain: row.origin_domain,
      agent_id_erc8004: row.agent_id_erc8004 ?? null,
      seller_address: row.seller_address ?? null,
      price_atomic: row.price_atomic ?? null,
      http_status: row.http_status !== null && row.http_status !== undefined ? Number(row.http_status) : null,
      is_valid_x402: Number(row.is_valid_x402 || 0),
      latency_ms: row.latency_ms !== null && row.latency_ms !== undefined ? Number(row.latency_ms) : null,
      uptime_score: row.uptime_score !== null && row.uptime_score !== undefined ? Number(row.uptime_score) : 100.0,
      hallucination_rate:
        row.hallucination_rate !== null && row.hallucination_rate !== undefined ? Number(row.hallucination_rate) : 0.0,
      total_audits: Number(row.total_audits || 0),
      failed_audits: Number(row.failed_audits || 0),
      category: row.category ?? null,
      description: row.description ?? null,
      nullclear_proxy_url: row.nullclear_proxy_url || `https://api.nullclear.dev/${row.endpoint_url}`,
      last_audited_at: Number(row.last_audited_at || Date.now()),
      source: (row.source || "X402_MANIFEST") as IndexedEndpointSource
    };
  }

  async upsertIndexedEndpoint(record: IndexedEndpointRecord): Promise<void> {
    await this.ensureRadarAndCrawlerTables();
    const proxyUrl = record.nullclear_proxy_url || `https://api.nullclear.dev/${record.endpoint_url}`;
    await this.db
      .prepare(
        `INSERT INTO indexed_endpoints (
          id, endpoint_url, origin_domain, agent_id_erc8004, seller_address, price_atomic,
          http_status, is_valid_x402, latency_ms, uptime_score, hallucination_rate,
          total_audits, failed_audits, category, description, nullclear_proxy_url, last_audited_at, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint_url) DO UPDATE SET
          origin_domain = excluded.origin_domain,
          agent_id_erc8004 = COALESCE(excluded.agent_id_erc8004, indexed_endpoints.agent_id_erc8004),
          seller_address = COALESCE(excluded.seller_address, indexed_endpoints.seller_address),
          price_atomic = COALESCE(excluded.price_atomic, indexed_endpoints.price_atomic),
          http_status = excluded.http_status,
          is_valid_x402 = excluded.is_valid_x402,
          latency_ms = excluded.latency_ms,
          uptime_score = excluded.uptime_score,
          hallucination_rate = excluded.hallucination_rate,
          total_audits = excluded.total_audits,
          failed_audits = excluded.failed_audits,
          category = COALESCE(excluded.category, indexed_endpoints.category),
          description = COALESCE(excluded.description, indexed_endpoints.description),
          nullclear_proxy_url = excluded.nullclear_proxy_url,
          last_audited_at = excluded.last_audited_at,
          source = excluded.source`
      )
      .bind(
        record.id,
        record.endpoint_url,
        record.origin_domain,
        record.agent_id_erc8004 ?? null,
        record.seller_address ?? null,
        record.price_atomic ?? null,
        record.http_status ?? null,
        record.is_valid_x402,
        record.latency_ms ?? null,
        record.uptime_score,
        record.hallucination_rate,
        record.total_audits,
        record.failed_audits,
        record.category ?? null,
        record.description ?? null,
        proxyUrl,
        record.last_audited_at,
        record.source
      )
      .run();
  }

  async getIndexedEndpointByUrl(endpointUrl: string): Promise<IndexedEndpointRecord | null> {
    await this.ensureRadarAndCrawlerTables();
    const row = await this.db
      .prepare("SELECT * FROM indexed_endpoints WHERE endpoint_url = ? LIMIT 1")
      .bind(endpointUrl)
      .first<any>();
    if (!row) {
      const seed = DEFAULT_SEEDED_ENDPOINTS.find((e) => e.endpoint_url === endpointUrl);
      return seed ? { ...seed } : null;
    }
    return this.mapIndexedEndpointRow(row);
  }

  async queryIndexedEndpoints(filter?: IndexedEndpointQueryFilter): Promise<IndexedEndpointRecord[]> {
    await this.ensureRadarAndCrawlerTables();
    const res = await this.db
      .prepare("SELECT * FROM indexed_endpoints ORDER BY uptime_score DESC, latency_ms ASC LIMIT 300")
      .all<any>();
    const stored = (res.results || []).map((r: any) => this.mapIndexedEndpointRow(r));
    const storedUrls = new Set(stored.map((s) => s.endpoint_url));
    const merged = [
      ...stored,
      ...DEFAULT_SEEDED_ENDPOINTS.filter((d) => !storedUrls.has(d.endpoint_url))
    ];
    return filterAndSortIndexedEndpoints(merged, filter);
  }

  async getIndexerState(key: string): Promise<IndexerStateRecord | null> {
    await this.ensureRadarAndCrawlerTables();
    const row = await this.db
      .prepare("SELECT key, last_indexed_block, updated_at FROM indexer_state WHERE key = ? LIMIT 1")
      .bind(key)
      .first<any>();
    if (!row) return null;
    return {
      key: row.key,
      last_indexed_block: Number(row.last_indexed_block),
      updated_at: Number(row.updated_at || Date.now())
    };
  }

  async setIndexerState(key: string, lastIndexedBlock: number): Promise<void> {
    await this.ensureRadarAndCrawlerTables();
    await this.db
      .prepare(
        `INSERT INTO indexer_state (key, last_indexed_block, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           last_indexed_block = excluded.last_indexed_block,
           updated_at = excluded.updated_at`
      )
      .bind(key, lastIndexedBlock, Date.now())
      .run();
  }

  async saveOnchainEip3009Transfer(transfer: OnchainEip3009TransferRecord): Promise<boolean> {
    await this.ensureRadarAndCrawlerTables();
    const normHash = transfer.tx_hash.toLowerCase();
    const existing = await this.db
      .prepare("SELECT tx_hash FROM onchain_eip3009_transfers WHERE tx_hash = ? LIMIT 1")
      .bind(normHash)
      .first<{ tx_hash: string }>();
    if (existing) {
      return false;
    }
    await this.db
      .prepare(
        `INSERT INTO onchain_eip3009_transfers (
          tx_hash, block_number, timestamp, buyer_address, seller_address, amount_atomic, nonce, is_micropayment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        normHash,
        transfer.block_number,
        transfer.timestamp,
        transfer.buyer_address.toLowerCase(),
        transfer.seller_address.toLowerCase(),
        transfer.amount_atomic,
        transfer.nonce,
        transfer.is_micropayment
      )
      .run();
    return true;
  }

  async listOnchainEip3009Transfers(limit = 50): Promise<OnchainEip3009TransferRecord[]> {
    await this.ensureRadarAndCrawlerTables();
    const res = await this.db
      .prepare("SELECT * FROM onchain_eip3009_transfers ORDER BY block_number DESC, timestamp DESC LIMIT ?")
      .bind(limit)
      .all<any>();
    return (res.results || []).map((r: any) => ({
      tx_hash: r.tx_hash,
      block_number: Number(r.block_number || 0),
      timestamp: Number(r.timestamp || 0),
      buyer_address: r.buyer_address,
      seller_address: r.seller_address,
      amount_atomic: String(r.amount_atomic || "0"),
      nonce: r.nonce || "",
      is_micropayment: Number(r.is_micropayment || 0)
    }));
  }

  async upsertOnchainCounterpartyProfile(profile: OnchainCounterpartyProfileRecord): Promise<void> {
    await this.ensureRadarAndCrawlerTables();
    const normAddr = profile.address.toLowerCase();
    await this.db
      .prepare(
        `INSERT INTO onchain_counterparty_profiles (
          address, role, tx_count, total_volume_atomic, unique_counterparties,
          top_counterparty_share, wash_trade_flag, shadow_gateway_slug, last_seen_block
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(address) DO UPDATE SET
          role = excluded.role,
          tx_count = excluded.tx_count,
          total_volume_atomic = excluded.total_volume_atomic,
          unique_counterparties = excluded.unique_counterparties,
          top_counterparty_share = excluded.top_counterparty_share,
          wash_trade_flag = excluded.wash_trade_flag,
          shadow_gateway_slug = excluded.shadow_gateway_slug,
          last_seen_block = excluded.last_seen_block`
      )
      .bind(
        normAddr,
        profile.role,
        profile.tx_count,
        profile.total_volume_atomic,
        profile.unique_counterparties,
        profile.top_counterparty_share,
        profile.wash_trade_flag,
        profile.shadow_gateway_slug,
        profile.last_seen_block
      )
      .run();
  }

  async getOnchainCounterpartyProfile(address: string): Promise<OnchainCounterpartyProfileRecord | null> {
    await this.ensureRadarAndCrawlerTables();
    const row = await this.db
      .prepare("SELECT * FROM onchain_counterparty_profiles WHERE address = ? LIMIT 1")
      .bind(address.toLowerCase())
      .first<any>();
    if (!row) return null;
    return {
      address: row.address,
      role: (row.role || "SELLER") as "SELLER" | "BUYER" | "BOTH",
      tx_count: Number(row.tx_count || 0),
      total_volume_atomic: String(row.total_volume_atomic || "0"),
      unique_counterparties: Number(row.unique_counterparties || 0),
      top_counterparty_share: Number(row.top_counterparty_share || 0),
      wash_trade_flag: Number(row.wash_trade_flag || 0),
      shadow_gateway_slug: row.shadow_gateway_slug || `base-seller-${String(row.address).replace(/^0x/i, "").slice(0, 8)}`,
      last_seen_block: Number(row.last_seen_block || 0)
    };
  }

  async listOnchainCounterpartyProfiles(
    roleFilter?: "SELLER" | "BUYER" | "BOTH",
    limit = 50
  ): Promise<OnchainCounterpartyProfileRecord[]> {
    await this.ensureRadarAndCrawlerTables();
    const res = await this.db
      .prepare(
        "SELECT * FROM onchain_counterparty_profiles ORDER BY wash_trade_flag ASC, tx_count DESC LIMIT 200"
      )
      .all<any>();
    let rows = (res.results || []).map((row: any) => ({
      address: row.address,
      role: (row.role || "SELLER") as "SELLER" | "BUYER" | "BOTH",
      tx_count: Number(row.tx_count || 0),
      total_volume_atomic: String(row.total_volume_atomic || "0"),
      unique_counterparties: Number(row.unique_counterparties || 0),
      top_counterparty_share: Number(row.top_counterparty_share || 0),
      wash_trade_flag: Number(row.wash_trade_flag || 0),
      shadow_gateway_slug: row.shadow_gateway_slug || `base-seller-${String(row.address).replace(/^0x/i, "").slice(0, 8)}`,
      last_seen_block: Number(row.last_seen_block || 0)
    }));

    if (roleFilter === "SELLER") {
      rows = rows.filter((p) => p.role === "SELLER" || p.role === "BOTH");
    } else if (roleFilter === "BUYER") {
      rows = rows.filter((p) => p.role === "BUYER" || p.role === "BOTH");
    } else if (roleFilter === "BOTH") {
      rows = rows.filter((p) => p.role === "BOTH");
    }

    return rows.slice(0, limit);
  }
}

// Shared singleton memory store for fallback execution
const globalMemoryStore = new MemoryArbiterStore();

export function getArbiterStore(bindings?: Env["Bindings"]): IArbiterStore {
  if (bindings?.DB) {
    return new D1ArbiterStore(bindings.DB);
  }
  return globalMemoryStore;
}


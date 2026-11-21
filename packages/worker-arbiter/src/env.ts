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
    CDP_FACILITATOR_URL?: string;
    CDP_API_KEY_ID?: string;
    CDP_API_KEY_SECRET?: string;
    FACILITATOR_PREFERENCE?: "payai" | "cdp";
    BASE_RPC_URL?: string;
    BASE_MAINNET_RPC_URL?: string;
    BASE_SEPOLIA_RPC_URL?: string;
    ETH_RPC_URL?: string;
    SOLANA_RPC_URL?: string;
    TELEGRAM_BOT_TOKEN?: string;
    INDEXNOW_KEY?: string;
    MIN_ONCHAIN_ATOMIC?: string;
    MAX_DAILY_ONCHAIN_PER_WALLET?: string;
  };
  Variables: {
    passId?: string;
    creditsDeducted?: number;
    agentLabel?: string | null;
    receiptUrl?: string | null;
  };
}

export interface ForensicScanRecord {
  id: string;
  chain: string;
  address: string;
  symbol: string;
  name: string;
  score: number;
  verdict: string;
  recommendedAction: string;
  isProxy: boolean;
  implementationAddress?: string | null;
  buyTaxPercent: number;
  sellTaxPercent: number;
  liquidityUsd: number;
  blockNumber: number;
  attestationSha256: string;
  payloadJson: string;
  scannedAt: number;
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
  targetAddress?: string;
  targetChain?: string;
  queryType?: string;
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
  userAgent?: string | null;
  isFreeTrial?: boolean;
  paymentTier?: string | null;
  remainingFree?: number | null;
  clientId?: string | null;
  targetSubject?: string | null;
  diagnosticReason?: string | null;
  latencyMs?: number | null;
  agentLabel?: string | null;
  passId?: string | null;
  creditsDeducted?: number | null;
  receiptUrl?: string | null;
}

export interface EnrichedProductHistoryEvent extends TrafficEventRecord {
  productCategory: string;
  productName: string;
  targetSubject: string;
  paymentTier: string;
  paymentBadge: string;
  diagnosticReason: string;
  isRealProductUse: boolean;
  isIndexerBot: boolean;
  isPaid: boolean;
}

export interface FreeTierCallerMeter {
  clientKeyMasked: string;
  bucketType: "forensic" | "bazaar-or-mcp";
  usageDate: string;
  callCount: number;
  dailyLimit: number;
  remaining: number;
  hitPaywall: boolean;
  updatedAt: number;
}

export interface ProductDiagnosticBreakdownRow {
  productCategory: string;
  productName: string;
  calls24h: number;
  calls7d: number;
  ok200Count: number;
  freeTierCount: number;
  paidCount: number;
  paywall402RealAgentCount: number;
  paywall402IndexerCount: number;
  error400Count: number;
}

export interface DailyProductUsagePoint {
  date: string;
  totalRealProductUses: number;
  mcpToolCalls: number;
  forensicsAndFirewall: number;
  bazaarAndEscrow: number;
  webAndMarkdownScorecards: number;
  uniqueFreeTierCallers: number;
  unpaid402Challenges: number;
  preBilling400Errors: number;
  totalHttpHits: number;
}

export interface PaymentDiagnosticsReport {
  generatedAt: number;
  filterApplied: string;
  executiveDiagnosis: {
    headline: string;
    reasonsWhyNotPaying: Array<{
      id: string;
      title: string;
      severity: "PRIMARY" | "SECONDARY" | "INFO";
      metricValue: string;
      shareOfTrafficPct: number;
      explanation: string;
    }>;
  };
  dailySeries: DailyProductUsagePoint[];
  counters24h: {
    totalRequests: number;
    realProductUses: number;
    executedFreeTier200: number;
    paidSettled200: number;
    realAgentUnpaid402: number;
    freeTierExhausted402: number;
    indexerBot402Probes: number;
    preBilling400Errors: number;
    publicScorecardReads: number;
    mcpHandshakes: number;
    mcpToolCalls: number;
  };
  counters7d: {
    totalRequests: number;
    realProductUses: number;
    executedFreeTier200: number;
    paidSettled200: number;
    realAgentUnpaid402: number;
    freeTierExhausted402: number;
    indexerBot402Probes: number;
    preBilling400Errors: number;
    publicScorecardReads: number;
    mcpHandshakes: number;
    mcpToolCalls: number;
  };
  quotaMeters: {
    todayDate: string;
    activeCallersToday: number;
    totalFreeCallsToday: number;
    avgCallsPerCallerToday: number;
    maxCallsBySingleCallerToday: number;
    callersHittingPaywallToday: number;
    callersHittingPaywall7d: number;
    activeCallers7d: number;
    recentCallers: FreeTierCallerMeter[];
  };
  productBreakdown: ProductDiagnosticBreakdownRow[];
  ledgerSummary: {
    totalPassedClearings: number;
    totalVoidedClearings: number;
    totalClearedVolumeUsdc: string;
    activePrepaidPasses: number;
    totalPassCreditsRemaining: number;
    recentClearings: ClearingRecord[];
    recentForensicScans: Array<{
      chain: string;
      address: string;
      symbol: string;
      name: string;
      score: number;
      verdict: string;
      recommendedAction: string;
      scannedAt: number;
    }>;
  };
  events: EnrichedProductHistoryEvent[];
}

export interface TelemetryFunnelWindow {
  windowLabel: string;
  totalInvocations: number;
  freeTrialCalls: number;
  byActorType: Record<TrafficActorType, number>;
  byHost: Record<string, number>;
  topPaths: Array<{ path: string; count: number }>;
  topUserAgents: Array<{ userAgent: string; count: number }>;
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
    price_atomic: "5000",
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
    price_atomic: "5000",
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
    price_atomic: "5000",
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
    id: "ep_bazaar_scan_batch",
    endpoint_url: "https://api.nullclear.dev/v1/bazaar/scan-batch",
    origin_domain: "api.nullclear.dev",
    agent_id_erc8004: "124595",
    seller_address: "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c",
    price_atomic: "25000",
    http_status: 402,
    is_valid_x402: 1,
    latency_ms: 180,
    uptime_score: 100.0,
    hallucination_rate: 0.0,
    total_audits: 24,
    failed_audits: 0,
    category: "security",
    description:
      "Multi-chain batch token pre-flight security scanner (Base, Ethereum, Solana; up to 15 unique tokens per $0.025 call) returning aggregated EXECUTE_SAFE or ABORT_CRITICAL_TRAP verdicts.",
    nullclear_proxy_url: "https://api.nullclear.dev/https://api.nullclear.dev/v1/bazaar/scan-batch",
    last_audited_at: 1776400000000,
    source: "X402_MANIFEST"
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

export interface ApiPassRecord {
  id: string;
  keyHash: string;
  keyPrefix: string;
  ownerAddress: string;
  tier: "micro" | "starter" | "pro" | "scale";
  creditsTotal: number;
  creditsRemaining: number;
  priceAtomic: string;
  settlementTx?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SignerPolicyRecord {
  id: string;
  ownerAddress: string;
  passId?: string | null;
  name: string;
  policyJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface WatchtowerMonitorRecord {
  id: string;
  ownerAddress: string;
  passId?: string | null;
  chain: string;
  targetAddress: string;
  webhookUrl: string;
  alertRulesJson: string;
  lastStateJson?: string | null;
  lastCheckedAt: number;
  lastAlertAt: number;
  alertCount: number;
  active: boolean;
  expiresAt: number;
  createdAt: number;
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
  getProductHistoryAndDiagnostics(options?: {
    limit?: number;
    filter?: string;
    search?: string;
  }): Promise<PaymentDiagnosticsReport>;
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
  saveForensicScan(record: ForensicScanRecord): Promise<void>;
  getForensicScan(chain: string, address: string): Promise<ForensicScanRecord | null>;
  getForensicScansBatch(targets: Array<{ chain: string; address: string }>): Promise<Map<string, ForensicScanRecord>>;
  listRecentClearings(limit?: number): Promise<ClearingRecord[]>;
  getClearingById(id: string): Promise<ClearingRecord | null>;
  listPassUsageEvents(
    passId: string,
    options?: { days?: number; agentLabel?: string | null; limit?: number }
  ): Promise<TrafficEventRecord[]>;
  listForensicScans(chain?: string, limit?: number): Promise<ForensicScanRecord[]>;
  createApiPass(pass: ApiPassRecord): Promise<void>;
  getApiPassByHash(keyHash: string): Promise<ApiPassRecord | null>;
  consumeApiPassCredit(
    keyHash: string,
    costCredits?: number
  ): Promise<{ allowed: boolean; pass: ApiPassRecord | null; creditsRemaining: number }>;
  upsertSignerPolicy(policy: SignerPolicyRecord): Promise<void>;
  getSignerPolicy(policyId: string): Promise<SignerPolicyRecord | null>;
  listSignerPoliciesByOwner(ownerAddress: string): Promise<SignerPolicyRecord[]>;
  createWatchtowerMonitor(monitor: WatchtowerMonitorRecord): Promise<void>;
  getWatchtowerMonitor(monitorId: string): Promise<WatchtowerMonitorRecord | null>;
  listActiveWatchtowerMonitors(limit?: number): Promise<WatchtowerMonitorRecord[]>;
  listWatchtowerMonitorsByOwner(ownerAddress: string): Promise<WatchtowerMonitorRecord[]>;
  updateWatchtowerMonitorState(
    monitorId: string,
    patch: {
      lastStateJson?: string | null;
      lastCheckedAt?: number;
      lastAlertAt?: number;
      incrementAlerts?: boolean;
      active?: boolean;
    }
  ): Promise<void>;
  deleteWatchtowerMonitor(monitorId: string, ownerAddress?: string): Promise<boolean>;
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
  private forensicScans = new Map<string, ForensicScanRecord>();
  private apiPassesByHash = new Map<string, ApiPassRecord>();
  private signerPolicies = new Map<string, SignerPolicyRecord>();
  private watchtowerMonitors = new Map<string, WatchtowerMonitorRecord>();

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
    this.forensicScans.clear();
    this.apiPassesByHash.clear();
    this.signerPolicies.clear();
    this.watchtowerMonitors.clear();
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

  async getProductHistoryAndDiagnostics(options?: {
    limit?: number;
    filter?: string;
    search?: string;
  }): Promise<PaymentDiagnosticsReport> {
    const freeTierRows: Array<{ clientKey: string; usageDate: string; callCount: number; updatedAt: number }> = [];
    for (const [compoundKey, count] of this.freeTierUsage.entries()) {
      const idx = compoundKey.indexOf(":");
      const usageDate = idx > 0 ? compoundKey.slice(0, idx) : new Date().toISOString().slice(0, 10);
      const clientKey = idx > 0 ? compoundKey.slice(idx + 1) : compoundKey;
      freeTierRows.push({
        clientKey,
        usageDate,
        callCount: count,
        updatedAt: Date.now()
      });
    }
    const passes = Array.from(this.apiPassesByHash.values());
    const scans = await this.listForensicScans(undefined, 15);
    return buildPaymentDiagnosticsReport({
      events: [...this.trafficEvents].reverse(),
      freeTierRows,
      clearings: [...this.clearings].reverse(),
      activePrepaidPasses: passes.length,
      totalPassCreditsRemaining: passes.reduce((acc, p) => acc + p.creditsRemaining, 0),
      recentForensicScans: scans,
      options
    });
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

  async saveForensicScan(record: ForensicScanRecord): Promise<void> {
    const key = `${record.chain.toLowerCase()}:${record.address.toLowerCase()}`;
    this.forensicScans.set(key, {
      ...record,
      chain: record.chain.toLowerCase(),
      address: record.chain.toLowerCase() === "solana" ? record.address : record.address.toLowerCase()
    });
  }

  async getForensicScan(chain: string, address: string): Promise<ForensicScanRecord | null> {
    const key = `${chain.toLowerCase()}:${address.toLowerCase()}`;
    const found = this.forensicScans.get(key);
    return found ? { ...found } : null;
  }

  async listForensicScans(chain?: string, limit = 50): Promise<ForensicScanRecord[]> {
    let all = Array.from(this.forensicScans.values());
    if (chain) {
      all = all.filter((s) => s.chain.toLowerCase() === chain.toLowerCase());
    }
    return all
      .sort((a, b) => b.scannedAt - a.scannedAt || b.liquidityUsd - a.liquidityUsd)
      .slice(0, limit);
  }

  async getForensicScansBatch(
    targets: Array<{ chain: string; address: string }>
  ): Promise<Map<string, ForensicScanRecord>> {
    const map = new Map<string, ForensicScanRecord>();
    for (const target of targets) {
      const normChain = target.chain.trim().toLowerCase();
      const normAddr = normChain === "solana" ? target.address.trim() : target.address.trim().toLowerCase();
      const storeKey = `${normChain}:${target.address.trim().toLowerCase()}`;
      const found = this.forensicScans.get(storeKey);
      if (found) {
        map.set(`${normChain}:${normAddr}`, { ...found });
      }
    }
    return map;
  }

  async listRecentClearings(limit = 20): Promise<ClearingRecord[]> {
    return this.clearings.slice(-limit).reverse().map((r) => ({ ...r }));
  }

  async getClearingById(id: string): Promise<ClearingRecord | null> {
    const found = this.clearings.find((r) => r.id === id);
    return found ? { ...found } : null;
  }

  async listPassUsageEvents(
    passId: string,
    options?: { days?: number; agentLabel?: string | null; limit?: number }
  ): Promise<TrafficEventRecord[]> {
    const days = Math.min(90, Math.max(1, Math.floor(options?.days ?? 30)));
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    const limit = Math.min(5000, Math.max(1, Math.floor(options?.limit ?? 1000)));
    const targetAgent = options?.agentLabel ? options.agentLabel.trim() : null;
    return this.trafficEvents
      .filter((ev) => {
        if (ev.passId !== passId) return false;
        if (ev.timestamp < cutoff) return false;
        if (targetAgent && ev.agentLabel !== targetAgent) return false;
        return true;
      })
      .slice(-limit)
      .reverse()
      .map((ev) => ({ ...ev }));
  }

  async createApiPass(pass: ApiPassRecord): Promise<void> {
    this.apiPassesByHash.set(pass.keyHash, { ...pass });
  }

  async getApiPassByHash(keyHash: string): Promise<ApiPassRecord | null> {
    const found = this.apiPassesByHash.get(keyHash);
    return found ? { ...found } : null;
  }

  async consumeApiPassCredit(
    keyHash: string,
    costCredits = 1
  ): Promise<{ allowed: boolean; pass: ApiPassRecord | null; creditsRemaining: number }> {
    const found = this.apiPassesByHash.get(keyHash);
    if (!found) {
      return { allowed: false, pass: null, creditsRemaining: 0 };
    }
    const cost = Math.max(0, Math.floor(costCredits));
    if (found.creditsRemaining < cost) {
      return { allowed: false, pass: { ...found }, creditsRemaining: found.creditsRemaining };
    }
    found.creditsRemaining -= cost;
    found.updatedAt = Date.now();
    this.apiPassesByHash.set(keyHash, found);
    return { allowed: true, pass: { ...found }, creditsRemaining: found.creditsRemaining };
  }

  async upsertSignerPolicy(policy: SignerPolicyRecord): Promise<void> {
    this.signerPolicies.set(policy.id, { ...policy });
  }

  async getSignerPolicy(policyId: string): Promise<SignerPolicyRecord | null> {
    const found = this.signerPolicies.get(policyId);
    return found ? { ...found } : null;
  }

  async listSignerPoliciesByOwner(ownerAddress: string): Promise<SignerPolicyRecord[]> {
    const target = ownerAddress.toLowerCase();
    return Array.from(this.signerPolicies.values())
      .filter((p) => p.ownerAddress.toLowerCase() === target)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) => ({ ...p }));
  }

  async createWatchtowerMonitor(monitor: WatchtowerMonitorRecord): Promise<void> {
    this.watchtowerMonitors.set(monitor.id, { ...monitor });
  }

  async getWatchtowerMonitor(monitorId: string): Promise<WatchtowerMonitorRecord | null> {
    const found = this.watchtowerMonitors.get(monitorId);
    return found ? { ...found } : null;
  }

  async listActiveWatchtowerMonitors(limit = 10): Promise<WatchtowerMonitorRecord[]> {
    const now = Date.now();
    return Array.from(this.watchtowerMonitors.values())
      .filter((m) => m.active && m.expiresAt > now)
      .sort((a, b) => a.lastCheckedAt - b.lastCheckedAt)
      .slice(0, limit)
      .map((m) => ({ ...m }));
  }

  async listWatchtowerMonitorsByOwner(ownerAddress: string): Promise<WatchtowerMonitorRecord[]> {
    const target = ownerAddress.toLowerCase();
    return Array.from(this.watchtowerMonitors.values())
      .filter((m) => m.ownerAddress.toLowerCase() === target)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((m) => ({ ...m }));
  }

  async updateWatchtowerMonitorState(
    monitorId: string,
    patch: {
      lastStateJson?: string | null;
      lastCheckedAt?: number;
      lastAlertAt?: number;
      incrementAlerts?: boolean;
      active?: boolean;
    }
  ): Promise<void> {
    const found = this.watchtowerMonitors.get(monitorId);
    if (!found) return;
    if (patch.lastStateJson !== undefined) found.lastStateJson = patch.lastStateJson;
    if (patch.lastCheckedAt !== undefined) found.lastCheckedAt = patch.lastCheckedAt;
    if (patch.lastAlertAt !== undefined) found.lastAlertAt = patch.lastAlertAt;
    if (patch.incrementAlerts) found.alertCount += 1;
    if (patch.active !== undefined) found.active = patch.active;
    this.watchtowerMonitors.set(monitorId, found);
  }

  async deleteWatchtowerMonitor(monitorId: string, ownerAddress?: string): Promise<boolean> {
    const found = this.watchtowerMonitors.get(monitorId);
    if (!found) return false;
    if (ownerAddress && found.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      return false;
    }
    this.watchtowerMonitors.delete(monitorId);
    return true;
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
  const uaCounts = new Map<string, number>();
  const methodsBreakdown: Record<string, number> = {};

  let toolsListed = 0;
  let toolsCalled = 0;
  let discovery = 0;
  let mcpHandshake = 0;
  let freeOrSandboxCall = 0;
  let freeTrialCalls = 0;
  let realX402Settlement = passedClearingsCount;

  for (const ev of events) {
    if (ev.actorType in byActorType) {
      byActorType[ev.actorType] += 1;
    } else {
      byActorType.BOT_SCANNER += 1;
    }

    if (ev.isFreeTrial) {
      freeTrialCalls += 1;
    }

    if (ev.userAgent) {
      uaCounts.set(ev.userAgent, (uaCounts.get(ev.userAgent) || 0) + 1);
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
      p.startsWith("/v1/guard") ||
      p.startsWith("/v1/scan") ||
      p.startsWith("/v1/inspect") ||
      p.startsWith("/v1/decode") ||
      p.startsWith("/v1/simulate") ||
      p.startsWith("/v1/pass") ||
      p.startsWith("/rpc/") ||
      p.startsWith("/v1/policy") ||
      p.startsWith("/v1/monitors") ||
      p.startsWith("/v1/clear") ||
      p.startsWith("/v1/escrow") ||
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

  const topUserAgents = Array.from(uaCounts.entries())
    .map(([userAgent, count]) => ({ userAgent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const conversionRatePct =
    toolsListed > 0 ? Math.round((toolsCalled / toolsListed) * 10000) / 100 : 0;

  return {
    windowLabel,
    totalInvocations: events.length,
    freeTrialCalls,
    byActorType,
    byHost,
    topPaths,
    topUserAgents,
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

export function maskClientKeyForDisplay(rawKey: string | null | undefined): string {
  if (!rawKey) return "anon";
  const cleaned = rawKey.trim();
  const withoutBucket = cleaned.startsWith("forensic:") ? cleaned.slice(9) : cleaned;
  if (withoutBucket.startsWith("mcp:")) {
    const sess = withoutBucket.slice(4);
    return `mcp:${sess.slice(0, 10)}${sess.length > 10 ? "…" : ""}`;
  }
  if (withoutBucket.startsWith("ip:")) {
    const ip = withoutBucket.slice(3);
    if (ip.includes(".")) {
      const parts = ip.split(".");
      let hash = 0;
      for (let i = 0; i < ip.length; i++) {
        hash = (hash * 31 + ip.charCodeAt(i)) & 0xfff;
      }
      return `ip:${parts[0]}.${parts[1]}.*.#${hash.toString(16).padStart(3, "0")}`;
    }
    if (ip.includes(":")) {
      const parts = ip.split(":").filter(Boolean);
      let hash = 0;
      for (let i = 0; i < ip.length; i++) {
        hash = (hash * 31 + ip.charCodeAt(i)) & 0xfff;
      }
      return `ipv6:${parts.slice(0, 2).join(":")}::#${hash.toString(16).padStart(3, "0")}`;
    }
  }
  return withoutBucket.slice(0, 18);
}

const KNOWN_INDEXER_BOT_PATTERNS = [
  "payai-bazaar",
  "payai",
  "coinbasebazaardiscovery",
  "x402-first-sight",
  "first-sight",
  "x402station",
  "x402-observer",
  "mortal01-x402-monitor",
  "kertivostatus",
  "carbonmonitor",
  "alalanet-prober",
  "lumiere-paycheck-prober",
  "agentrankprobe",
  "ainet-probe",
  "mareliberum",
  "genesis-live-demand-radar",
  "genesis-buyer-intent-radar",
  "erc8004-opportunity-watch",
  "nullclear-canary-auditor",
  "mcpbeat",
  "sentineloracle",
  "histor/",
  "rokmcp-collector",
  "agent402/",
  "uptime-probe",
  "uptime probe",
  "unauth probe",
  "unpaid http 402",
  "unpaid x402",
  "liveness-only",
  "liveness check",
  "healthcheck",
  "402index",
  "402explorer",
  "x402scan-worker",
  "x402scan",
  "brickbluebot",
  "agent402-probe",
  "botsrated",
  "faceabotprobe",
  "p0-catalog",
  "zerobot",
  "verantis-verifier",
  "aegis-unserved-demand",
  "tenet-boi-labels",
  "x402-list-monitor",
  "x402-census-probe",
  "x402-conformance-check",
  "x402-reliability-probe",
  "x402-discovery-probe",
  "x402-router-crawler",
  "x402-directory",
  "x402-audit",
  "x402trust",
  "x402lens",
  "x402-mpp-liveness",
  "solari-x402",
  "kanteiapiindex",
  "easy402-indexer",
  "agentvalcon",
  "sealkeeperbot",
  "agenstrybot",
  "agents-trust-probe",
  "agentprobe",
  "mcpwatch",
  "mcp-index",
  "dollardollardollar-signals",
  "entropy-daemon-trust-oracle",
  "taifoon-content-probe",
  "satohub",
  "glama",
  "smithery",
  "mcprush",
  "mcpservers",
  "mcptry",
  "subpay.ai",
  "toolvetprobe",
  "x402-census",
  "analoghubris",
  "addrbook-probe",
  "x402-index-liveness",
  "mizan/",
  "agent-deals-monitor",
  "10x402-monitor",
  "sml-authority-engine",
  "agensus-probe",
  "nightshift-census",
  "ocean_observer",
  "taifoonharvester",
  "reflectionbot",
  "ibou-search",
  "crolbot",
  "all_agents",
  "payability",
  "liveness",
  "census",
  "authority-engine",
  "observer",
  "x402-index",
  "-liveness",
  "-census",
  "-monitor",
  "_monitor",
  "-probe",
  "_probe",
  "harvester",
  "trustindex",
  "ispettore"
];

export function buildBalancedSqlAnd(clauses: string[]): string {
  if (clauses.length === 0) return "1=1";
  if (clauses.length === 1) return clauses[0];
  const mid = Math.floor(clauses.length / 2);
  return `(${buildBalancedSqlAnd(clauses.slice(0, mid))} AND ${buildBalancedSqlAnd(clauses.slice(mid))})`;
}

export function buildRealCallerSqlFilter(): string {
  const notIndexerClauses = KNOWN_INDEXER_BOT_PATTERNS.map(
    (pat) => `INSTR(LOWER(user_agent), '${pat.replace(/'/g, "''")}') = 0`
  );
  return `(payment_tier IN ('x402-paid', 'prepaid-pass') OR user_agent IS NULL OR ${buildBalancedSqlAnd(notIndexerClauses)})`;
}

export function isKnownDirectoryIndexerUa(uaRaw: string | null | undefined): boolean {
  const ua = (uaRaw || "").toLowerCase();
  if (!ua) return false;
  return KNOWN_INDEXER_BOT_PATTERNS.some((p) => ua.includes(p));
}

export function enrichTrafficEventDiagnostics(ev: TrafficEventRecord): EnrichedProductHistoryEvent {
  const p = ev.path || "/";
  const m = (ev.method || "GET").toUpperCase();
  const ua = ev.userAgent || "";
  const isKnownIndexerUa = isKnownDirectoryIndexerUa(ua);

  let productCategory = "Web UI / Navigation";
  let productName = `${m} ${p}`;
  let targetSubject = ev.targetSubject || "";
  let isRealProductUse = false;

  if (ev.mcpMethod === "tools/call" || (p.startsWith("/mcp") && ev.toolName)) {
    productCategory = "MCP Tool Call";
    productName = ev.toolName || "mcp:tools/call";
    targetSubject = targetSubject || "MCP JSON-RPC Tool Invocation";
    isRealProductUse = true;
  } else if (p.startsWith("/mcp")) {
    productCategory = "MCP Handshake";
    productName = ev.mcpMethod ? `mcp:${ev.mcpMethod}` : `mcp:${m}`;
    targetSubject = targetSubject || (ev.mcpMethod || "Streamable HTTP Session");
    isRealProductUse = false;
  } else if (p.startsWith("/v1/guard")) {
    productCategory = "1-Call Pre-Sign Firewall";
    productName = `${m} /v1/guard`;
    targetSubject = targetSubject || "EVM / EIP-712 / Solana Preflight";
    isRealProductUse = m === "POST" || p.includes("?");
  } else if (p.startsWith("/v1/scan/")) {
    productCategory = "Token Forensics API";
    productName = "GET /v1/scan";
    const parts = p.replace("/v1/scan/", "").split("/").filter(Boolean);
    targetSubject = targetSubject || (parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0] || "token-scan");
    isRealProductUse = true;
  } else if (p.startsWith("/v1/inspect/")) {
    productCategory = "Proxy & ABI Inspector";
    productName = "GET /v1/inspect";
    const parts = p.replace("/v1/inspect/", "").split("/").filter(Boolean);
    targetSubject = targetSubject || (parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0] || "contract-inspect");
    isRealProductUse = true;
  } else if (p.startsWith("/v1/decode")) {
    productCategory = "Calldata & Revert Decoder";
    productName = `${m} /v1/decode`;
    targetSubject = targetSubject || "Hex Calldata / EIP-712 / Tx Hash";
    isRealProductUse = m === "POST" || (m === "GET" && ev.status !== 400);
  } else if (p.startsWith("/v1/simulate")) {
    productCategory = "Stateful Tx Simulator";
    productName = `${m} /v1/simulate`;
    targetSubject = targetSubject || "eth_simulateV1 / Solana Sim";
    isRealProductUse = m === "POST";
  } else if (p === "/v1/pass" || p.startsWith("/v1/pass/")) {
    const isBuyPass = p.startsWith("/v1/pass/buy");
    productCategory = isBuyPass ? "Prepaid Firewall Pass" : "Prepaid Pass Read";
    productName = isBuyPass ? `${m} /v1/pass/buy` : `${m} ${p}`;
    targetSubject = targetSubject || (isBuyPass ? "nc_live_... Pass ($1 / $5 / $25 / $100)" : "0-Credit Pass Balance / Export / Tiers");
    isRealProductUse = isBuyPass;
  } else if (p.startsWith("/receipt/") || p.startsWith("/v1/receipt/")) {
    productCategory = "Public Clearing Receipt";
    productName = p.startsWith("/v1/receipt/") ? "GET /v1/receipt/:id" : "GET /receipt/:id";
    targetSubject = targetSubject || p.replace(/^\/(?:v1\/)?receipt\//, "");
    isRealProductUse = false;
  } else if (p.startsWith("/rpc/")) {
    productCategory = "Drop-In Guarded RPC";
    const chainSeg = p.replace("/rpc/", "").split("/")[0] || "base";
    productName = `${m} /rpc/${chainSeg}`;
    targetSubject = targetSubject || `chain:${chainSeg}`;
    isRealProductUse = m === "POST";
  } else if (p.startsWith("/v1/policy/")) {
    productCategory = "EIP-712 Policy Co-Signer";
    productName = `${m} ${p}`;
    targetSubject = targetSubject || "Programmable Treasury Policy";
    isRealProductUse = true;
  } else if (p.startsWith("/v1/monitors")) {
    productCategory = "Continuous Watchtower";
    productName = `${m} ${p}`;
    targetSubject = targetSubject || "30-Day Contract Monitor";
    isRealProductUse = m === "POST" || p.includes("/check");
  } else if (p.startsWith("/v1/bazaar/")) {
    const ep = p.replace("/v1/bazaar/", "").split("/")[0] || "oracle";
    productCategory = "x402 Bazaar Oracle";
    productName = `bazaar:${ep}`;
    targetSubject = targetSubject || `/v1/bazaar/${ep}`;
    isRealProductUse = ep !== "directory";
  } else if (p.startsWith("/v1/clear") || p.startsWith("/v1/escrow")) {
    productCategory = "x402 Schema Escrow";
    productName = `${m} ${p}`;
    targetSubject = targetSubject || "Deferred EIP-3009 Verification";
    isRealProductUse = m === "POST";
  } else if (p.startsWith("/v1/proxy") || /^\/https?:\/+/i.test(p)) {
    productCategory = "Auto-Guard URL Proxy";
    productName = "proxy:auto-guard";
    targetSubject = targetSubject || p.replace(/^\/v1\/proxy\??/, "").slice(0, 72) || "Upstream URL";
    isRealProductUse = true;
  } else if (p.startsWith("/g/")) {
    const slug = p.replace("/g/", "").split("/")[0] || "gateway";
    productCategory = "Seller x402 Gateway";
    productName = `gateway:${slug}`;
    targetSubject = targetSubject || `/g/${slug}`;
    isRealProductUse = true;
  } else if (p.startsWith("/v1/score/")) {
    productCategory = "ERC-8004 Reputation Oracle";
    productName = "GET /v1/score";
    targetSubject = targetSubject || p.replace("/v1/score/", "");
    isRealProductUse = true;
  } else if (p.startsWith("/v1/kya")) {
    productCategory = "Corporate KYA Mandate";
    productName = `${m} ${p}`;
    targetSubject = targetSubject || "KYA Entity Verification";
    isRealProductUse = true;
  } else if (p.startsWith("/scan/")) {
    const isMd = p.toLowerCase().endsWith(".md");
    productCategory = isMd ? "LLM Markdown Twin (.md)" : "Public Forensic Scorecard";
    productName = isMd ? "GET /scan/*.md" : "GET /scan/:chain/:addr";
    const parts = p.replace("/scan/", "").split("/").filter(Boolean);
    targetSubject = targetSubject || (parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0] || "token-report");
    isRealProductUse = true;
  } else if (p.startsWith("/api/safepay/deals")) {
    productCategory = "SafePay Escrow Deal";
    productName = `${m} ${p}`;
    targetSubject = targetSubject || p.replace("/api/safepay/deals/", "") || "new-deal";
    isRealProductUse = true;
  } else if (p.startsWith("/a2a") && m === "POST") {
    productCategory = "A2A Agent Task";
    productName = ev.toolName || "POST /a2a";
    targetSubject = targetSubject || "A2A JSON-RPC 2.0";
    isRealProductUse = true;
  } else if (p.startsWith("/v1/clean-markdown")) {
    productCategory = "Clean Markdown Scraper";
    productName = "GET /v1/clean-markdown";
    targetSubject = targetSubject || "Web Readability Scraper";
    isRealProductUse = true;
  } else if (
    p.startsWith("/.well-known/") ||
    p === "/openapi.json" ||
    p === "/api/v1/openapi.json" ||
    p === "/llms.txt" ||
    p === "/llms-full.txt" ||
    p === "/agents.md"
  ) {
    productCategory = "Protocol Discovery Manifest";
    productName = `GET ${p}`;
    targetSubject = ev.host || "nullclear.dev";
    isRealProductUse = false;
  }

  if (m === "HEAD" || m === "OPTIONS" || ev.status === 404 || (ev.status >= 300 && ev.status < 400)) {
    isRealProductUse = false;
  }

  // Classify indexer 402 probes vs real callers (payment always overrides bot classification)
  const isPaidEndpoint =
    p.startsWith("/v1/bazaar/") ||
    p.startsWith("/v1/pass/buy") ||
    p.startsWith("/v1/policy/cosign") ||
    (p.startsWith("/v1/monitors") && m === "POST") ||
    p.startsWith("/g/");

  const rawTierLower = (ev.paymentTier || "").toLowerCase();
  const isPassReadOnly =
    p === "/v1/pass" ||
    p === "/v1/pass/" ||
    p.startsWith("/v1/pass/status") ||
    p.startsWith("/v1/pass/tiers") ||
    p.startsWith("/v1/pass/export");
  const isPublicReceipt = p.startsWith("/receipt/") || p.startsWith("/v1/receipt/");
  const hasPaidSettlement =
    !isPassReadOnly &&
    !isPublicReceipt &&
    (rawTierLower === "x402-paid" || rawTierLower === "prepaid-pass");

  const isIndexerBot =
    !hasPaidSettlement &&
    rawTierLower !== "payment-failed" &&
    (isKnownIndexerUa ||
      (ev.status === 402 && isPaidEndpoint && ev.actorType === "BOT_SCANNER" && !ev.isFreeTrial));

  let paymentTier = rawTierLower;
  let paymentBadge = "EXECUTED (200)";
  let diagnosticReason = ev.diagnosticReason || "";
  let isPaid = false;

  if (hasPaidSettlement) {
    isPaid = true;
    paymentBadge = paymentTier === "prepaid-pass" ? "PAID (PASS CREDIT)" : "PAID (x402 USDC)";
    if (!diagnosticReason) {
      diagnosticReason =
        paymentTier === "prepaid-pass"
          ? "PAID: Authenticated via Prepaid Pass (nc_live_...)"
          : "PAID: Settled on-chain x402 EIP-3009 USDC authorization on Base";
    }
  } else if (isPassReadOnly && ev.status === 200) {
    paymentTier = "unmetered";
    paymentBadge = "PASS READ (0 CREDITS)";
    if (!diagnosticReason) {
      diagnosticReason = "PASS READONLY (0 CREDITS): Read-only Prepaid Pass status/tiers/export lookup — not a paid settlement";
    }
  } else if (isPublicReceipt && ev.status === 200) {
    paymentTier = "unmetered";
    paymentBadge = "PUBLIC RECEIPT (FREE)";
    if (!diagnosticReason) {
      diagnosticReason = "PUBLIC RECEIPT: Cryptographic clearing verifier (/receipt/:id) is public and unmetered";
    }
  } else if (ev.status >= 300 && ev.status < 400) {
    paymentTier = `http-${ev.status}`;
    paymentBadge = `REDIRECT (${ev.status})`;
    if (!diagnosticReason) {
      diagnosticReason = `BROWSER REDIRECT (${ev.status}): Redirected interactive browser request to web UI`;
    }
  } else if (ev.status === 200) {
    if (
      paymentTier === "forensic-free" ||
      paymentTier === "zero-key-free" ||
      p.startsWith("/v1/scan") ||
      p.startsWith("/v1/inspect") ||
      p.startsWith("/v1/decode") ||
      p.startsWith("/v1/simulate") ||
      p.startsWith("/v1/guard") ||
      ev.mcpMethod === "tools/call"
    ) {
      paymentTier = paymentTier || "forensic-free";
      const rem = typeof ev.remainingFree === "number" ? ev.remainingFree : null;
      const used = rem !== null ? Math.max(1, 10 - rem) : null;
      paymentBadge = used !== null ? `FREE TIER (${used}/10 USED)` : "FREE TIER (200 OK)";
      if (!diagnosticReason) {
        diagnosticReason =
          used !== null
            ? `FREE QUOTA: Caller used ${used}/10 daily free calls (${rem} left today) — under paywall threshold`
            : "FREE QUOTA: Served under 10 calls/day/IP free tier — caller did not reach call #11 paywall";
      }
    } else if (paymentTier === "free-trial" || ev.isFreeTrial) {
      paymentTier = "free-trial";
      const rem = typeof ev.remainingFree === "number" ? ev.remainingFree : null;
      paymentBadge = rem !== null ? `FREE TRIAL (${rem} LEFT)` : "FREE TRIAL (200 OK)";
      if (!diagnosticReason) {
        diagnosticReason = "FREE TRIAL: Caller used daily sponsored trial quota — no x402 payment required yet";
      }
    } else if (p.startsWith("/scan/")) {
      paymentTier = "public-scorecard";
      paymentBadge = "PUBLIC REPORT (FREE)";
      if (!diagnosticReason) {
        diagnosticReason = "PUBLIC SCORECARD: Web/Markdown report (/scan/:chain/:address) is free by design for SEO & LLM citation";
      }
    } else if (isPaidEndpoint || p.startsWith("/v1/clear") || p.startsWith("/v1/escrow")) {
      paymentTier = paymentTier || "settled-or-trial";
      paymentBadge = "CLEARED (200 OK)";
      if (!diagnosticReason) {
        diagnosticReason = "CLEARED (200 OK): Oracle or schema-escrow verification succeeded at edge";
      }
    } else {
      paymentTier = "unmetered";
      paymentBadge = "UNMETERED (200)";
      if (!diagnosticReason) {
        diagnosticReason = "UNMETERED: Public discovery manifest, handshake, or UI navigation";
      }
    }
  } else if (ev.status === 402) {
    if (isIndexerBot || paymentTier === "indexer-402-probe") {
      paymentTier = "indexer-402-probe";
      paymentBadge = "INDEXER 402 PROBE";
      if (!diagnosticReason) {
        diagnosticReason =
          "DIRECTORY INDEXER: Automated x402 directory scanner (PayAI / 402index / MareLiberum / First-Sight) verifying 402 schema — indexers never pay by design";
      }
    } else if (
      paymentTier === "free-tier-exhausted" ||
      paymentTier === "forensic-rate-limited" ||
      paymentTier === "free-trial-exhausted" ||
      p.startsWith("/v1/scan") ||
      p.startsWith("/v1/inspect") ||
      p.startsWith("/v1/decode") ||
      p.startsWith("/v1/simulate") ||
      p.startsWith("/v1/guard") ||
      ev.mcpMethod === "tools/call"
    ) {
      paymentTier = "free-tier-exhausted";
      paymentBadge = "HIT 10/DAY LIMIT (402)";
      if (!diagnosticReason) {
        diagnosticReason =
          "PAYWALL HIT (10/10 USED): Caller exhausted 10 free daily calls, received HTTP 402 upgrade challenge, and stopped without attaching X-Payment";
      }
    } else if (paymentTier === "payment-failed") {
      paymentBadge = "PAYMENT REJECTED (402)";
      if (!diagnosticReason) {
        diagnosticReason =
          "PAYMENT FAILED: Caller attached X-Payment header but EIP-3009 signature or facilitator settlement was rejected";
      }
    } else {
      paymentTier = "unpaid-402-challenge";
      paymentBadge = "UNPAID 402 CHALLENGE";
      if (!diagnosticReason) {
        diagnosticReason =
          "402 CHALLENGE ISSUED: Agent called paid route without X-Payment header or Bearer Pass key and did not retry with signed EIP-3009 payment";
      }
    }
  } else if (ev.status === 400) {
    paymentTier = "invalid-params-400";
    paymentBadge = "BAD PARAMS (400)";
    if (!diagnosticReason) {
      diagnosticReason =
        "PRE-BILLING 400: Caller sent empty or malformed payload (e.g. POST {}) and failed parameter validation before billing";
    }
  } else if (ev.status === 401 || ev.status === 403) {
    paymentTier = "unauthorized";
    paymentBadge = `AUTH REJECTED (${ev.status})`;
    if (!diagnosticReason) {
      diagnosticReason = `UNAUTHORIZED (HTTP ${ev.status}): Missing or invalid Prepaid Pass key (nc_live_...)`;
    }
  } else {
    paymentTier = `http-${ev.status}`;
    paymentBadge = `HTTP ${ev.status}`;
    if (!diagnosticReason) {
      diagnosticReason = `HTTP ${ev.status} response`;
    }
  }

  return {
    ...ev,
    clientId: ev.clientId || null,
    productCategory,
    productName,
    targetSubject: targetSubject || p,
    paymentTier,
    paymentBadge,
    diagnosticReason,
    isRealProductUse,
    isIndexerBot,
    isPaid
  };
}

interface SqlAggregatedDayRow {
  day: string;
  total_hits: number;
  mcp_handshakes: number;
  mcp_calls: number;
  forensics_firewall: number;
  scorecards: number;
  bazaar_escrow: number;
  count_402: number;
  count_400: number;
}

function buildPaymentDiagnosticsReport(params: {
  events: TrafficEventRecord[];
  freeTierRows: Array<{ clientKey: string; usageDate: string; callCount: number; updatedAt: number }>;
  clearings: ClearingRecord[];
  activePrepaidPasses: number;
  totalPassCreditsRemaining: number;
  recentForensicScans: ForensicScanRecord[];
  dailySqlRows?: SqlAggregatedDayRow[];
  rolling24hSqlRow?: SqlAggregatedDayRow | null;
  options?: { limit?: number; filter?: string; search?: string };
}): PaymentDiagnosticsReport {
  const now = Date.now();
  const cutoff24h = now - 24 * 3600 * 1000;
  const cutoff7d = now - 7 * 24 * 3600 * 1000;
  const todayDate = new Date().toISOString().slice(0, 10);
  const cutoff7dDate = new Date(cutoff7d).toISOString().slice(0, 10);

  const enrichedAll = params.events.map((e) => enrichTrafficEventDiagnostics(e));
  const passedClearings = params.clearings.filter((c) => c.status === "PASSED");
  const voidedClearings = params.clearings.filter((c) => c.status !== "PASSED");
  const passedClearings24h = passedClearings.filter((c) => c.createdAt >= cutoff24h).length;
  const passedClearings7d = passedClearings.filter((c) => c.createdAt >= cutoff7d).length;

  const initCounters = () => ({
    totalRequests: 0,
    realProductUses: 0,
    executedFreeTier200: 0,
    paidSettled200: 0,
    realAgentUnpaid402: 0,
    freeTierExhausted402: 0,
    indexerBot402Probes: 0,
    preBilling400Errors: 0,
    publicScorecardReads: 0,
    mcpHandshakes: 0,
    mcpToolCalls: 0
  });

  const c24 = initCounters();
  const c7d = initCounters();
  const prodMap = new Map<string, ProductDiagnosticBreakdownRow>();
  const fallbackDayMap = new Map<string, DailyProductUsagePoint>();

  for (const ev of enrichedAll) {
    const in24 = ev.timestamp >= cutoff24h;
    const in7d = ev.timestamp >= cutoff7d;
    const evDate = new Date(ev.timestamp).toISOString().slice(0, 10);

    if (!params.dailySqlRows) {
      const dp = fallbackDayMap.get(evDate) || {
        date: evDate,
        totalRealProductUses: 0,
        mcpToolCalls: 0,
        forensicsAndFirewall: 0,
        bazaarAndEscrow: 0,
        webAndMarkdownScorecards: 0,
        uniqueFreeTierCallers: 0,
        unpaid402Challenges: 0,
        preBilling400Errors: 0,
        totalHttpHits: 0
      };
      dp.totalHttpHits += 1;
      if (ev.isRealProductUse && ev.status === 200) {
        dp.totalRealProductUses += 1;
        if (ev.mcpMethod === "tools/call" || ev.productCategory === "MCP Tool Call") {
          dp.mcpToolCalls += 1;
        } else if (ev.paymentTier === "public-scorecard" || ev.path.startsWith("/scan/")) {
          dp.webAndMarkdownScorecards += 1;
        } else if (
          ev.path.startsWith("/v1/scan") ||
          ev.path.startsWith("/v1/inspect") ||
          ev.path.startsWith("/v1/guard") ||
          ev.path.startsWith("/v1/decode") ||
          ev.path.startsWith("/v1/simulate") ||
          ev.path.startsWith("/rpc") ||
          ev.path.startsWith("/v1/policy") ||
          ev.path.startsWith("/v1/monitors")
        ) {
          dp.forensicsAndFirewall += 1;
        } else {
          dp.bazaarAndEscrow += 1;
        }
      } else if (ev.status === 402) {
        dp.unpaid402Challenges += 1;
      } else if (ev.status === 400 && ev.isRealProductUse) {
        dp.preBilling400Errors += 1;
      }
      fallbackDayMap.set(evDate, dp);
    }

    if (!in7d) continue;

    const bump = (c: ReturnType<typeof initCounters>) => {
      c.totalRequests += 1;
      if (ev.productCategory === "MCP Handshake") {
        c.mcpHandshakes += 1;
      }
      if (ev.mcpMethod === "tools/call" || ev.productCategory === "MCP Tool Call") {
        c.mcpToolCalls += 1;
      }
      if (!ev.isRealProductUse) return;

      // Only count actual executed (HTTP 200) invocations as Real Product Uses
      // (402 challenges and 400 malformed probes are tracked in their own counters)
      if (ev.isPaid) {
        c.realProductUses += 1;
        c.paidSettled200 += 1;
      } else if (ev.paymentTier === "public-scorecard") {
        c.realProductUses += 1;
        c.publicScorecardReads += 1;
      } else if (ev.status === 200) {
        if (!ev.isIndexerBot) {
          c.realProductUses += 1;
          c.executedFreeTier200 += 1;
        }
      } else if (ev.status === 402) {
        if (ev.paymentTier === "indexer-402-probe" || ev.isIndexerBot) {
          c.indexerBot402Probes += 1;
        } else if (ev.paymentTier === "free-tier-exhausted") {
          c.freeTierExhausted402 += 1;
        } else {
          c.realAgentUnpaid402 += 1;
        }
      } else if (ev.status === 400) {
        c.preBilling400Errors += 1;
      }
    };

    bump(c7d);
    if (in24) bump(c24);

    if (ev.isRealProductUse) {
      const key = `${ev.productCategory}::${ev.productName}`;
      const row = prodMap.get(key) || {
        productCategory: ev.productCategory,
        productName: ev.productName,
        calls24h: 0,
        calls7d: 0,
        ok200Count: 0,
        freeTierCount: 0,
        paidCount: 0,
        paywall402RealAgentCount: 0,
        paywall402IndexerCount: 0,
        error400Count: 0
      };
      row.calls7d += 1;
      if (in24) row.calls24h += 1;
      if (ev.status === 200) {
        row.ok200Count += 1;
        if (ev.isPaid) row.paidCount += 1;
        else row.freeTierCount += 1;
      } else if (ev.status === 402) {
        if (ev.paymentTier === "indexer-402-probe" || ev.isIndexerBot) {
          row.paywall402IndexerCount += 1;
        } else {
          row.paywall402RealAgentCount += 1;
        }
      } else if (ev.status === 400) {
        row.error400Count += 1;
      }
      prodMap.set(key, row);
    }
  }

  // Build dailySeries (last 14 days) and override 7d/24h counters with full-table D1 SQL aggregations when present
  const callersByDate = new Map<string, number>();
  for (const r of params.freeTierRows) {
    callersByDate.set(r.usageDate, (callersByDate.get(r.usageDate) || 0) + 1);
  }

  let dailySeries: DailyProductUsagePoint[] = [];
  if (params.dailySqlRows && params.dailySqlRows.length > 0) {
    dailySeries = params.dailySqlRows.map((r) => {
      const mcp = Number(r.mcp_calls || 0);
      const ff = Number(r.forensics_firewall || 0);
      const sc = Number(r.scorecards || 0);
      const bz = Number(r.bazaar_escrow || 0);
      return {
        date: r.day,
        totalRealProductUses: mcp + ff + sc + bz,
        mcpToolCalls: mcp,
        forensicsAndFirewall: ff,
        bazaarAndEscrow: bz,
        webAndMarkdownScorecards: sc,
        uniqueFreeTierCallers: callersByDate.get(r.day) || 0,
        unpaid402Challenges: Number(r.count_402 || 0),
        preBilling400Errors: Number(r.count_400 || 0),
        totalHttpHits: Number(r.total_hits || 0)
      };
    });

    // Recompute exact 7-day totals across all 7 days in dailySeries (zero LIMIT truncation!)
    const last7DaysPoints = dailySeries.filter((d) => d.date >= cutoff7dDate);
    const sql7dRealUses = last7DaysPoints.reduce((s, d) => s + d.totalRealProductUses, 0);
    const sql7dMcpCalls = last7DaysPoints.reduce((s, d) => s + d.mcpToolCalls, 0);
    const sql7dScorecards = last7DaysPoints.reduce((s, d) => s + d.webAndMarkdownScorecards, 0);
    const sql7dApiUses = last7DaysPoints.reduce(
      (s, d) => s + d.mcpToolCalls + d.forensicsAndFirewall + d.bazaarAndEscrow,
      0
    );
    const sql7dTotalHits = last7DaysPoints.reduce((s, d) => s + d.totalHttpHits, 0);
    const sql7d400 = last7DaysPoints.reduce((s, d) => s + d.preBilling400Errors, 0);
    const sql7dHandshakes = params.dailySqlRows
      .filter((r) => r.day >= cutoff7dDate)
      .reduce((s, r) => s + Number(r.mcp_handshakes || 0), 0);

    c7d.totalRequests = Math.max(c7d.totalRequests, sql7dTotalHits);
    c7d.realProductUses = Math.max(c7d.realProductUses, sql7dRealUses);
    c7d.mcpToolCalls = Math.max(c7d.mcpToolCalls, sql7dMcpCalls);
    c7d.publicScorecardReads = Math.max(c7d.publicScorecardReads, sql7dScorecards);
    c7d.executedFreeTier200 = Math.max(c7d.executedFreeTier200, sql7dApiUses);
    c7d.preBilling400Errors = Math.max(c7d.preBilling400Errors, sql7d400);
    c7d.mcpHandshakes = Math.max(c7d.mcpHandshakes, sql7dHandshakes);
  } else {
    dailySeries = Array.from(fallbackDayMap.values())
      .map((d) => ({
        ...d,
        uniqueFreeTierCallers: callersByDate.get(d.date) || 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  if (params.rolling24hSqlRow) {
    const r24 = params.rolling24hSqlRow;
    const mcp24 = Number(r24.mcp_calls || 0);
    const ff24 = Number(r24.forensics_firewall || 0);
    const sc24 = Number(r24.scorecards || 0);
    const bz24 = Number(r24.bazaar_escrow || 0);
    c24.totalRequests = Number(r24.total_hits || 0);
    c24.realProductUses = mcp24 + ff24 + sc24 + bz24;
    c24.mcpToolCalls = mcp24;
    c24.publicScorecardReads = sc24;
    c24.executedFreeTier200 = mcp24 + ff24 + bz24;
    c24.preBilling400Errors = Number(r24.count_400 || 0);
    c24.mcpHandshakes = Number(r24.mcp_handshakes || 0);
  }

  c24.paidSettled200 = Math.max(c24.paidSettled200, passedClearings24h);
  c7d.paidSettled200 = Math.max(c7d.paidSettled200, passedClearings7d);

  // Free tier quota meters analysis
  const todayMeters = params.freeTierRows.filter((r) => r.usageDate === todayDate);
  const activeCallersToday = todayMeters.length;
  const totalFreeCallsToday = todayMeters.reduce((sum, r) => sum + r.callCount, 0);
  const maxCallsBySingleCallerToday = todayMeters.reduce((max, r) => Math.max(max, r.callCount), 0);
  const callersHittingPaywallToday = todayMeters.filter((r) => r.callCount >= 10).length;
  const callersHittingPaywall7d = params.freeTierRows.filter((r) => r.callCount >= 10).length;
  const avgCallsPerCallerToday =
    activeCallersToday > 0 ? Math.round((totalFreeCallsToday / activeCallersToday) * 10) / 10 : 0;

  const recentCallers: FreeTierCallerMeter[] = params.freeTierRows.slice(0, 30).map((r) => {
    const isForensic = r.clientKey.startsWith("forensic:");
    const limit = 10;
    return {
      clientKeyMasked: maskClientKeyForDisplay(r.clientKey),
      bucketType: isForensic ? "forensic" : "bazaar-or-mcp",
      usageDate: r.usageDate,
      callCount: r.callCount,
      dailyLimit: limit,
      remaining: Math.max(0, limit - r.callCount),
      hitPaywall: r.callCount >= limit,
      updatedAt: r.updatedAt
    };
  });

  // Compute Root-Cause "Why People Aren't Paying" Breakdown
  const total7dProduct = Math.max(1, c7d.realProductUses);
  const total402s7d = c7d.indexerBot402Probes + c7d.realAgentUnpaid402 + c7d.freeTierExhausted402;
  const indexerShareOf402Pct =
    total402s7d > 0 ? Math.round((c7d.indexerBot402Probes / total402s7d) * 1000) / 10 : 0;

  const reasonsWhyNotPaying: PaymentDiagnosticsReport["executiveDiagnosis"]["reasonsWhyNotPaying"] = [
    {
      id: "free_tier_headroom",
      title: "1. Daily Free-Tier Quota Headroom (10 Free Calls/Day/Agent Absorbs Current Usage)",
      severity: "PRIMARY",
      metricValue: `${activeCallersToday} active callers today · avg ${avgCallsPerCallerToday}/10 calls used · ${callersHittingPaywallToday} hit limit today (${callersHittingPaywall7d} in 7d)`,
      shareOfTrafficPct: Math.round(((c7d.executedFreeTier200 + c7d.publicScorecardReads) / total7dProduct) * 1000) / 10,
      explanation: `Real agents calling MCP tools (tools/call) and Forensics (/v1/scan, /v1/guard, /v1/decode) are averaging ${avgCallsPerCallerToday} calls/day (peak single caller today: ${maxCallsBySingleCallerToday}/10). Because the paywall only triggers on call #11/day from the same IP/session, ${callersHittingPaywallToday === 0 ? "100% of today's organic agent callers finished their task within the free tier without ever seeing an HTTP 402 paywall." : `only ${callersHittingPaywallToday} caller(s) today exceeded 10 calls.`}`
    },
    {
      id: "indexer_402_noise",
      title: "2. Automated x402 Directory & Indexer Health Probes (Look Like Traffic, Never Pay by Design)",
      severity: "PRIMARY",
      metricValue: `${c7d.indexerBot402Probes.toLocaleString()} directory 402 probes (${indexerShareOf402Pct}% of all HTTP 402s)`,
      shareOfTrafficPct: Math.round((c7d.indexerBot402Probes / total7dProduct) * 1000) / 10,
      explanation: `Ecosystem crawlers (PayAI-Bazaar, x402-first-sight, MareLiberum, GENESIS, 402index) continuously ping /v1/bazaar/*, /v1/pass/buy, and /v1/policy/cosign without an X-Payment header solely to verify that our HTTP 402 PAYMENT-REQUIRED schema stays online and listed in their directories.`
    },
    {
      id: "unequipped_402_callers",
      title: "3. Unfunded Agent 402 Challenges (No EIP-3009 Wallet Signer Attached on Retry)",
      severity: "SECONDARY",
      metricValue: `${c7d.realAgentUnpaid402.toLocaleString()} unpaid 402 challenges (${c24.realAgentUnpaid402.toLocaleString()} in 24h)`,
      shareOfTrafficPct: Math.round(((c7d.realAgentUnpaid402 + c7d.freeTierExhausted402) / total7dProduct) * 1000) / 10,
      explanation: `When SDK agents or autonomous crawlers probe paid /v1/bazaar/* or /v1/pass/buy routes without an active Base USDC hot-wallet signer (or x-nullclear-free-trial header), they receive the 402 challenge and drop off rather than signing an EIP-3009 TransferWithAuthorization.`
    },
    {
      id: "mcp_browse_vs_call",
      title: "4. MCP Registry Handshake-to-Execution Funnel (Listing Tools vs. Invoking Tools)",
      severity: "INFO",
      metricValue: `${c7d.mcpHandshakes.toLocaleString()} handshakes → ${c7d.mcpToolCalls.toLocaleString()} tool calls (7d)`,
      shareOfTrafficPct: 0,
      explanation: `MCP registries (Glama, Smithery, Cursor/Claude clients) perform frequent initialize and tools/list handshakes on connect. Only ${c7d.mcpToolCalls.toLocaleString()} resulted in actual tools/call invocations, which were served under the 10/day free tier.`
    },
    {
      id: "malformed_400_probes",
      title: "5. Pre-Billing HTTP 400 Payload Probes (Empty POST {} Scanners)",
      severity: "INFO",
      metricValue: `${c7d.preBilling400Errors.toLocaleString()} HTTP 400 responses (${c24.preBilling400Errors.toLocaleString()} in 24h)`,
      shareOfTrafficPct: Math.round((c7d.preBilling400Errors / total7dProduct) * 1000) / 10,
      explanation: `Automated agent benchmarks send empty POST {} requests to /v1/clear, /v1/guard, /v1/simulate, and /v1/decode without target addresses or calldata, returning HTTP 400 before billing is reached.`
    }
  ];

  const headline =
    `Live Diagnostic Summary: Today ${activeCallersToday} unique agents made ${totalFreeCallsToday} free-tier product calls (peak caller: ${maxCallsBySingleCallerToday}/10 calls; ${callersHittingPaywallToday} hit the 10-call paywall). ` +
    `Over 7d, ${c7d.executedFreeTier200 + c7d.publicScorecardReads} product calls succeeded for free, ${c7d.indexerBot402Probes.toLocaleString()} HTTP 402s were directory health-check bots, ${c7d.realAgentUnpaid402.toLocaleString()} were unfunded agent 402 challenges, and ${passedClearings.length} settled on-chain.`;

  // Filter events for the real-time stream
  const filter = (params.options?.filter || "real_agents").toLowerCase();
  const search = (params.options?.search || "").trim().toLowerCase();
  const limit = Math.min(300, Math.max(10, Number(params.options?.limit || 120)));

  let filteredEvents = enrichedAll;
  if (filter === "real_agents" || filter === "default") {
    filteredEvents = enrichedAll.filter(
      (e) => e.isRealProductUse && !e.isIndexerBot && e.paymentTier !== "indexer-402-probe" && e.status !== 400
    );
  } else if (filter === "product_all") {
    filteredEvents = enrichedAll.filter((e) => e.isRealProductUse);
  } else if (filter === "executed_200") {
    filteredEvents = enrichedAll.filter((e) => e.isRealProductUse && e.status === 200);
  } else if (filter === "paid") {
    filteredEvents = enrichedAll.filter((e) => e.isPaid);
  } else if (filter === "paywall_402") {
    filteredEvents = enrichedAll.filter((e) => e.status === 402 && !e.isIndexerBot && e.paymentTier !== "indexer-402-probe");
  } else if (filter === "all_402") {
    filteredEvents = enrichedAll.filter((e) => e.status === 402);
  } else if (filter === "mcp_calls") {
    filteredEvents = enrichedAll.filter((e) => e.mcpMethod === "tools/call" || e.productCategory === "MCP Tool Call");
  } else if (filter === "error_400") {
    filteredEvents = enrichedAll.filter((e) => e.isRealProductUse && e.status >= 400 && e.status !== 402);
  }

  if (search) {
    filteredEvents = filteredEvents.filter((e) => {
      const hay = [
        e.productCategory,
        e.productName,
        e.targetSubject,
        e.path,
        e.actorType,
        e.paymentBadge,
        e.diagnosticReason,
        e.userAgent || "",
        e.clientId || "",
        e.country || ""
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }

  const totalClearedAtomic = passedClearings.reduce((acc, c) => {
    try {
      return acc + BigInt(c.amount || "0");
    } catch {
      return acc;
    }
  }, 0n);
  const totalClearedVolumeUsdc = (Number(totalClearedAtomic) / 1_000_000).toFixed(4);

  const productBreakdown = Array.from(prodMap.values()).sort(
    (a, b) => b.calls7d - a.calls7d || b.calls24h - a.calls24h
  );

  return {
    generatedAt: now,
    filterApplied: filter,
    executiveDiagnosis: {
      headline,
      reasonsWhyNotPaying
    },
    dailySeries,
    counters24h: c24,
    counters7d: c7d,
    quotaMeters: {
      todayDate,
      activeCallersToday,
      totalFreeCallsToday,
      avgCallsPerCallerToday,
      maxCallsBySingleCallerToday,
      callersHittingPaywallToday,
      callersHittingPaywall7d,
      activeCallers7d: new Set(params.freeTierRows.map((r) => r.clientKey)).size,
      recentCallers
    },
    productBreakdown,
    ledgerSummary: {
      totalPassedClearings: passedClearings.length,
      totalVoidedClearings: voidedClearings.length,
      totalClearedVolumeUsdc,
      activePrepaidPasses: params.activePrepaidPasses,
      totalPassCreditsRemaining: params.totalPassCreditsRemaining,
      recentClearings: params.clearings.slice(0, 20),
      recentForensicScans: params.recentForensicScans.slice(0, 12).map((s) => ({
        chain: s.chain,
        address: s.address,
        symbol: s.symbol,
        name: s.name,
        score: s.score,
        verdict: s.verdict,
        recommendedAction: s.recommendedAction,
        scannedAt: s.scannedAt
      }))
    },
    events: filteredEvents.slice(0, limit)
  };
}

/**
 * Cloudflare D1 Database adapter for production deployments
 */
export class D1ArbiterStore implements IArbiterStore {
  private clearingsParamsEnsured = false;

  constructor(private db: D1Database) {}

  private async ensureClearingsParamColumns(): Promise<void> {
    if (this.clearingsParamsEnsured) return;
    try {
      const info = await this.db.prepare("PRAGMA table_info(clearings)").all<{ name: string }>();
      const cols = new Set((info.results || []).map((c) => c.name));
      const alters: string[] = [];
      if (!cols.has("target_address")) alters.push("ALTER TABLE clearings ADD COLUMN target_address TEXT");
      if (!cols.has("target_chain")) alters.push("ALTER TABLE clearings ADD COLUMN target_chain TEXT");
      if (!cols.has("query_type")) alters.push("ALTER TABLE clearings ADD COLUMN query_type TEXT");
      for (const sql of alters) {
        try {
          await this.db.prepare(sql).run();
        } catch {}
      }
      this.clearingsParamsEnsured = true;
    } catch {
      // Fall back quietly; migration 0006 creates these columns cleanly on remote D1
    }
  }

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
    await this.ensureClearingsParamColumns();
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO clearings (id, network, buyer_address, seller_agent_id, amount, fee, target_url, status, response_hash, attestation_signature, eip3009_nonce, target_address, target_chain, query_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
          clearing.targetAddress || null,
          clearing.targetChain || null,
          clearing.queryType || null,
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
    await this.ensureClearingsParamColumns();
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO clearings (id, network, buyer_address, seller_agent_id, amount, fee, target_url, status, error_reason, eip3009_nonce, target_address, target_chain, query_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
          clearing.targetAddress || null,
          clearing.targetChain || null,
          clearing.queryType || null,
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

  private static ensuredTrafficDiagDbs = new WeakSet<D1Database>();

  private async ensureTelemetryAndFreeTierTables(): Promise<void> {
    if (D1ArbiterStore.ensuredTrafficDiagDbs.has(this.db)) {
      return;
    }

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
          referer TEXT,
          user_agent TEXT,
          is_free_trial INTEGER DEFAULT 0,
          payment_tier TEXT,
          remaining_free INTEGER,
          client_id TEXT,
          target_subject TEXT,
          diagnostic_reason TEXT,
          latency_ms INTEGER,
          agent_label TEXT,
          pass_id TEXT,
          credits_deducted INTEGER DEFAULT 0,
          receipt_url TEXT
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

    try {
      const info = await this.db.prepare("PRAGMA table_info(traffic_events)").all<{ name: string }>();
      const cols = new Set((info.results || []).map((c) => c.name));
      const alters: string[] = [];
      if (!cols.has("payment_tier")) alters.push("ALTER TABLE traffic_events ADD COLUMN payment_tier TEXT");
      if (!cols.has("remaining_free")) alters.push("ALTER TABLE traffic_events ADD COLUMN remaining_free INTEGER");
      if (!cols.has("client_id")) alters.push("ALTER TABLE traffic_events ADD COLUMN client_id TEXT");
      if (!cols.has("target_subject")) alters.push("ALTER TABLE traffic_events ADD COLUMN target_subject TEXT");
      if (!cols.has("diagnostic_reason")) alters.push("ALTER TABLE traffic_events ADD COLUMN diagnostic_reason TEXT");
      if (!cols.has("latency_ms")) alters.push("ALTER TABLE traffic_events ADD COLUMN latency_ms INTEGER");
      if (!cols.has("agent_label")) alters.push("ALTER TABLE traffic_events ADD COLUMN agent_label TEXT");
      if (!cols.has("pass_id")) alters.push("ALTER TABLE traffic_events ADD COLUMN pass_id TEXT");
      if (!cols.has("credits_deducted")) alters.push("ALTER TABLE traffic_events ADD COLUMN credits_deducted INTEGER DEFAULT 0");
      if (!cols.has("receipt_url")) alters.push("ALTER TABLE traffic_events ADD COLUMN receipt_url TEXT");
      for (const sql of alters) {
        try {
          await this.db.prepare(sql).run();
        } catch {}
      }
      D1ArbiterStore.ensuredTrafficDiagDbs.add(this.db);
    } catch {}
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

  private mapTrafficEventRow(r: any): TrafficEventRecord {
    return {
      id: r.id,
      timestamp: Number(r.timestamp),
      host: r.host,
      path: r.path,
      method: r.method,
      status: Number(r.status),
      actorType: r.actor_type as TrafficActorType,
      mcpMethod: r.mcp_method ?? null,
      toolName: r.tool_name ?? null,
      country: r.country ?? null,
      asn: r.asn ?? null,
      referer: r.referer ?? null,
      userAgent: r.user_agent ?? null,
      isFreeTrial: Boolean(r.is_free_trial),
      paymentTier: r.payment_tier ?? null,
      remainingFree:
        r.remaining_free !== null && r.remaining_free !== undefined ? Number(r.remaining_free) : null,
      clientId: r.client_id ?? null,
      targetSubject: r.target_subject ?? null,
      diagnosticReason: r.diagnostic_reason ?? null,
      latencyMs: r.latency_ms !== null && r.latency_ms !== undefined ? Number(r.latency_ms) : null,
      agentLabel: r.agent_label ?? null,
      passId: r.pass_id ?? null,
      creditsDeducted:
        r.credits_deducted !== null && r.credits_deducted !== undefined ? Number(r.credits_deducted) : null,
      receiptUrl: r.receipt_url ?? null
    };
  }

  async recordTrafficEvent(event: TrafficEventRecord): Promise<void> {
    await this.ensureTelemetryAndFreeTierTables();
    try {
      await this.db
        .prepare(
          `INSERT INTO traffic_events (
            id, timestamp, host, path, method, status, actor_type, mcp_method, tool_name, country, asn, referer, user_agent, is_free_trial,
            payment_tier, remaining_free, client_id, target_subject, diagnostic_reason, latency_ms,
            agent_label, pass_id, credits_deducted, receipt_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          event.referer || null,
          event.userAgent || null,
          event.isFreeTrial ? 1 : 0,
          event.paymentTier || null,
          typeof event.remainingFree === "number" ? event.remainingFree : null,
          event.clientId || null,
          event.targetSubject || null,
          event.diagnosticReason || null,
          typeof event.latencyMs === "number" ? event.latencyMs : null,
          event.agentLabel || null,
          event.passId || null,
          typeof event.creditsDeducted === "number" ? event.creditsDeducted : 0,
          event.receiptUrl || null
        )
        .run();
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      if (msg.includes("no such column") || msg.includes("has no column")) {
        await this.db
          .prepare(
            `INSERT INTO traffic_events (
              id, timestamp, host, path, method, status, actor_type, mcp_method, tool_name, country, asn, referer, user_agent, is_free_trial
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            event.referer || null,
            event.userAgent || null,
            event.isFreeTrial ? 1 : 0
          )
          .run();
        return;
      }
      throw err;
    }
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

    const events7d: TrafficEventRecord[] = (rows7dRes.results || []).map((r: any) =>
      this.mapTrafficEventRow(r)
    );

    const events24h = events7d.filter((e) => e.timestamp >= cutoff24h);

    return {
      generatedAt: now,
      last24h: buildTelemetryWindow("Last 24 Hours", events24h, Number(clearings24hRes?.count || 0)),
      last7d: buildTelemetryWindow("Last 7 Days", events7d, Number(clearings7dRes?.count || 0))
    };
  }

  async getProductHistoryAndDiagnostics(options?: {
    limit?: number;
    filter?: string;
    search?: string;
  }): Promise<PaymentDiagnosticsReport> {
    await this.ensureTelemetryAndFreeTierTables();
    const now = Date.now();
    const cutoff24h = now - 24 * 3600 * 1000;
    const cutoff7d = now - 7 * 24 * 3600 * 1000;
    const cutoff14d = now - 14 * 24 * 3600 * 1000;
    const cutoff14dDate = new Date(cutoff14d).toISOString().slice(0, 10);

    const realCallerSqlFilter = buildRealCallerSqlFilter();

    const aggSelectCols = `
      COUNT(*) as total_hits,
      SUM(CASE WHEN path LIKE '/mcp%' AND mcp_method IN ('initialize', 'tools/list', 'notifications/initialized', 'prompts/list', 'resources/list', 'server/discover') THEN 1 ELSE 0 END) as mcp_handshakes,
      SUM(CASE WHEN mcp_method = 'tools/call' AND status = 200 AND is_real_caller = 1 THEN 1 ELSE 0 END) as mcp_calls,
      SUM(CASE WHEN status = 200 AND method != 'HEAD' AND is_real_caller = 1 AND (path LIKE '/v1/scan%' OR path LIKE '/v1/inspect%' OR path LIKE '/v1/guard%' OR path LIKE '/v1/decode%' OR path LIKE '/v1/simulate%' OR path LIKE '/rpc%' OR path LIKE '/v1/policy%' OR path LIKE '/v1/monitors%') THEN 1 ELSE 0 END) as forensics_firewall,
      SUM(CASE WHEN status = 200 AND method != 'HEAD' AND path LIKE '/scan/%' THEN 1 ELSE 0 END) as scorecards,
      SUM(CASE WHEN status = 200 AND method != 'HEAD' AND mcp_method IS NULL AND (path LIKE '/v1/bazaar/%' OR path LIKE '/v1/clear%' OR path LIKE '/v1/escrow%' OR path LIKE '/v1/pass/buy%' OR path LIKE '/v1/score%' OR path LIKE '/v1/kya%' OR path LIKE '/v1/proxy%' OR path LIKE '/https:%' OR path LIKE '/http:%' OR path LIKE '/g/%' OR path LIKE '/api/safepay/deals%' OR (path LIKE '/a2a%' AND method = 'POST')) AND path NOT LIKE '/v1/bazaar/directory%' AND is_real_caller = 1 THEN 1 ELSE 0 END) as bazaar_escrow,
      SUM(CASE WHEN status = 402 THEN 1 ELSE 0 END) as count_402,
      SUM(CASE WHEN status = 400 AND (path LIKE '/v1/%' OR path LIKE '/rpc%') THEN 1 ELSE 0 END) as count_400
    `;

    const [
      dailyAnd24hRes,
      realExecutedEventsRes,
      productEventsRes,
      recentAllEventsRes,
      freeTierRes,
      clearings,
      passesRes,
      scans
    ] = await Promise.all([
      this.db
        .prepare(
          `SELECT strftime('%Y-%m-%d', timestamp / 1000, 'unixepoch') as day, is_24h, ${aggSelectCols}
           FROM (
             SELECT
               timestamp,
               path,
               method,
               status,
               mcp_method,
               CASE WHEN timestamp >= ? THEN 1 ELSE 0 END as is_24h,
               CASE WHEN ${realCallerSqlFilter} THEN 1 ELSE 0 END as is_real_caller
             FROM traffic_events
             WHERE timestamp >= ?
           )
           GROUP BY day, is_24h
           ORDER BY day ASC`
        )
        .bind(cutoff24h, cutoff14d)
        .all<SqlAggregatedDayRow & { is_24h: number }>(),
      this.db
        .prepare(
          `SELECT * FROM traffic_events
           WHERE timestamp >= ?
             AND (
               mcp_method = 'tools/call'
               OR path LIKE '/v1/scan%'
               OR path LIKE '/v1/inspect%'
               OR path LIKE '/v1/guard%'
               OR path LIKE '/v1/decode%'
               OR path LIKE '/v1/simulate%'
               OR path LIKE '/rpc%'
               OR path LIKE '/g/%'
               OR path LIKE '/scan/%'
               OR path LIKE '/api/safepay/%'
               OR path LIKE '/https:%'
               OR path LIKE '/http:%'
               OR (path LIKE '/v1/bazaar/%' AND status = 200)
               OR (path LIKE '/v1/clear%' AND status = 200)
               OR (path LIKE '/v1/pass/buy%' AND status = 200)
             )
             AND path NOT LIKE '/v1/bazaar/directory%'
             AND (user_agent IS NULL OR user_agent NOT LIKE '%NullClear-Canary-Auditor%')
           ORDER BY timestamp DESC
           LIMIT 600`
        )
        .bind(cutoff7d)
        .all<any>(),
      this.db
        .prepare(
          `SELECT * FROM traffic_events
           WHERE timestamp >= ?
             AND (
               mcp_method = 'tools/call'
               OR path LIKE '/v1/%'
               OR path LIKE '/rpc%'
               OR path LIKE '/g/%'
               OR path LIKE '/scan/%'
               OR path LIKE '/api/safepay/%'
               OR path LIKE '/https:%'
               OR path LIKE '/http:%'
               OR (path LIKE '/a2a%' AND method = 'POST')
             )
             AND path NOT LIKE '/v1/telemetry%'
             AND path NOT LIKE '/v1/trending%'
             AND path NOT LIKE '/v1/stats%'
           ORDER BY timestamp DESC
           LIMIT 3500`
        )
        .bind(cutoff7d)
        .all<any>(),
      this.db
        .prepare("SELECT * FROM traffic_events WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 2000")
        .bind(cutoff7d)
        .all<any>(),
      this.db
        .prepare(
          "SELECT client_key, usage_date, call_count, updated_at FROM free_tier_usage WHERE usage_date >= ? ORDER BY usage_date DESC, call_count DESC, updated_at DESC LIMIT 300"
        )
        .bind(cutoff14dDate)
        .all<{ client_key: string; usage_date: string; call_count: number; updated_at: number }>(),
      this.listRecentClearings(100),
      this.db
        .prepare("SELECT COUNT(*) as total_passes, COALESCE(SUM(credits_remaining), 0) as total_credits FROM api_passes")
        .first<{ total_passes: number; total_credits: number }>()
        .catch(() => ({ total_passes: 0, total_credits: 0 })),
      this.listForensicScans(undefined, 15).catch(() => [])
    ]);

    const mergedMap = new Map<string, TrafficEventRecord>();
    for (const r of realExecutedEventsRes.results || []) {
      mergedMap.set(r.id, this.mapTrafficEventRow(r));
    }
    for (const r of productEventsRes.results || []) {
      if (!mergedMap.has(r.id)) {
        mergedMap.set(r.id, this.mapTrafficEventRow(r));
      }
    }
    for (const r of recentAllEventsRes.results || []) {
      if (!mergedMap.has(r.id)) {
        mergedMap.set(r.id, this.mapTrafficEventRow(r));
      }
    }

    const mergedEvents = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);
    const freeTierRows = (freeTierRes.results || []).map((r) => ({
      clientKey: r.client_key,
      usageDate: r.usage_date,
      callCount: Number(r.call_count || 0),
      updatedAt: Number(r.updated_at || 0)
    }));

    const dailyMap = new Map<string, SqlAggregatedDayRow>();
    const rolling24hSqlRow: SqlAggregatedDayRow = {
      day: "24h",
      total_hits: 0,
      mcp_handshakes: 0,
      mcp_calls: 0,
      forensics_firewall: 0,
      scorecards: 0,
      bazaar_escrow: 0,
      count_402: 0,
      count_400: 0
    };
    let has24hRows = false;

    for (const r of dailyAnd24hRes.results || []) {
      const existing = dailyMap.get(r.day) || {
        day: r.day,
        total_hits: 0,
        mcp_handshakes: 0,
        mcp_calls: 0,
        forensics_firewall: 0,
        scorecards: 0,
        bazaar_escrow: 0,
        count_402: 0,
        count_400: 0
      };
      existing.total_hits += Number(r.total_hits || 0);
      existing.mcp_handshakes += Number(r.mcp_handshakes || 0);
      existing.mcp_calls += Number(r.mcp_calls || 0);
      existing.forensics_firewall += Number(r.forensics_firewall || 0);
      existing.scorecards += Number(r.scorecards || 0);
      existing.bazaar_escrow += Number(r.bazaar_escrow || 0);
      existing.count_402 += Number(r.count_402 || 0);
      existing.count_400 += Number(r.count_400 || 0);
      dailyMap.set(r.day, existing);

      if (Number(r.is_24h) === 1) {
        has24hRows = true;
        rolling24hSqlRow.total_hits += Number(r.total_hits || 0);
        rolling24hSqlRow.mcp_handshakes += Number(r.mcp_handshakes || 0);
        rolling24hSqlRow.mcp_calls += Number(r.mcp_calls || 0);
        rolling24hSqlRow.forensics_firewall += Number(r.forensics_firewall || 0);
        rolling24hSqlRow.scorecards += Number(r.scorecards || 0);
        rolling24hSqlRow.bazaar_escrow += Number(r.bazaar_escrow || 0);
        rolling24hSqlRow.count_402 += Number(r.count_402 || 0);
        rolling24hSqlRow.count_400 += Number(r.count_400 || 0);
      }
    }

    const dailySqlRows = Array.from(dailyMap.values()).sort((a, b) => a.day.localeCompare(b.day));

    return buildPaymentDiagnosticsReport({
      events: mergedEvents,
      freeTierRows,
      clearings,
      activePrepaidPasses: Number(passesRes?.total_passes || 0),
      totalPassCreditsRemaining: Number(passesRes?.total_credits || 0),
      recentForensicScans: scans,
      dailySqlRows,
      rolling24hSqlRow: has24hRows ? rolling24hSqlRow : null,
      options
    });
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

  private async ensureForensicScansTable(): Promise<void> {
    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS forensic_scans (
          id TEXT PRIMARY KEY,
          chain TEXT NOT NULL,
          address TEXT NOT NULL,
          symbol TEXT,
          name TEXT,
          score INTEGER NOT NULL,
          verdict TEXT NOT NULL,
          recommended_action TEXT NOT NULL,
          is_proxy INTEGER DEFAULT 0,
          implementation_address TEXT,
          buy_tax_percent REAL DEFAULT 0,
          sell_tax_percent REAL DEFAULT 0,
          liquidity_usd REAL DEFAULT 0,
          block_number INTEGER DEFAULT 0,
          attestation_sha256 TEXT,
          payload_json TEXT NOT NULL,
          scanned_at INTEGER NOT NULL
        )`
      )
      .run();
  }

  async saveForensicScan(record: ForensicScanRecord): Promise<void> {
    await this.ensureForensicScansTable();
    const normChain = record.chain.toLowerCase();
    const normAddr = normChain === "solana" ? record.address : record.address.toLowerCase();
    const id = `${normChain}:${normAddr}`;
    await this.db
      .prepare(
        `INSERT INTO forensic_scans (
          id, chain, address, symbol, name, score, verdict, recommended_action,
          is_proxy, implementation_address, buy_tax_percent, sell_tax_percent,
          liquidity_usd, block_number, attestation_sha256, payload_json, scanned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          symbol = excluded.symbol,
          name = excluded.name,
          score = excluded.score,
          verdict = excluded.verdict,
          recommended_action = excluded.recommended_action,
          is_proxy = excluded.is_proxy,
          implementation_address = excluded.implementation_address,
          buy_tax_percent = excluded.buy_tax_percent,
          sell_tax_percent = excluded.sell_tax_percent,
          liquidity_usd = excluded.liquidity_usd,
          block_number = excluded.block_number,
          attestation_sha256 = excluded.attestation_sha256,
          payload_json = excluded.payload_json,
          scanned_at = excluded.scanned_at`
      )
      .bind(
        id,
        normChain,
        normAddr,
        record.symbol,
        record.name,
        record.score,
        record.verdict,
        record.recommendedAction,
        record.isProxy ? 1 : 0,
        record.implementationAddress ?? null,
        record.buyTaxPercent,
        record.sellTaxPercent,
        record.liquidityUsd,
        record.blockNumber,
        record.attestationSha256,
        record.payloadJson,
        record.scannedAt
      )
      .run();
  }

  async getForensicScan(chain: string, address: string): Promise<ForensicScanRecord | null> {
    await this.ensureForensicScansTable();
    const normChain = chain.toLowerCase();
    const normAddr = normChain === "solana" ? address : address.toLowerCase();
    const id = `${normChain}:${normAddr}`;
    const row = await this.db
      .prepare("SELECT * FROM forensic_scans WHERE id = ? OR (chain = ? AND lower(address) = ?) LIMIT 1")
      .bind(id, normChain, address.toLowerCase())
      .first<any>();
    if (!row) return null;
    return {
      id: row.id,
      chain: row.chain,
      address: row.address,
      symbol: row.symbol || "TOKEN",
      name: row.name || "On-Chain Contract",
      score: Number(row.score || 0),
      verdict: row.verdict || "CAUTION",
      recommendedAction: row.recommended_action || "CAUTION_HIGH_RISK",
      isProxy: Number(row.is_proxy || 0) === 1,
      implementationAddress: row.implementation_address ?? null,
      buyTaxPercent: Number(row.buy_tax_percent || 0),
      sellTaxPercent: Number(row.sell_tax_percent || 0),
      liquidityUsd: Number(row.liquidity_usd || 0),
      blockNumber: Number(row.block_number || 0),
      attestationSha256: row.attestation_sha256 || "",
      payloadJson: row.payload_json || "{}",
      scannedAt: Number(row.scanned_at || Date.now())
    };
  }

  async listForensicScans(chain?: string, limit = 50): Promise<ForensicScanRecord[]> {
    await this.ensureForensicScansTable();
    const stmt = chain
      ? this.db
          .prepare("SELECT * FROM forensic_scans WHERE lower(chain) = ? ORDER BY scanned_at DESC, liquidity_usd DESC LIMIT ?")
          .bind(chain.toLowerCase(), limit)
      : this.db
          .prepare("SELECT * FROM forensic_scans ORDER BY scanned_at DESC, liquidity_usd DESC LIMIT ?")
          .bind(limit);
    const res = await stmt.all<any>();
    return (res.results || []).map((row: any) => ({
      id: row.id,
      chain: row.chain,
      address: row.address,
      symbol: row.symbol || "TOKEN",
      name: row.name || "On-Chain Contract",
      score: Number(row.score || 0),
      verdict: row.verdict || "CAUTION",
      recommendedAction: row.recommended_action || "CAUTION_HIGH_RISK",
      isProxy: Number(row.is_proxy || 0) === 1,
      implementationAddress: row.implementation_address ?? null,
      buyTaxPercent: Number(row.buy_tax_percent || 0),
      sellTaxPercent: Number(row.sell_tax_percent || 0),
      liquidityUsd: Number(row.liquidity_usd || 0),
      blockNumber: Number(row.block_number || 0),
      attestationSha256: row.attestation_sha256 || "",
      payloadJson: row.payload_json || "{}",
      scannedAt: Number(row.scanned_at || Date.now())
    }));
  }

  async getForensicScansBatch(
    targets: Array<{ chain: string; address: string }>
  ): Promise<Map<string, ForensicScanRecord>> {
    const map = new Map<string, ForensicScanRecord>();
    if (!targets.length) return map;
    await this.ensureForensicScansTable();

    const uniqueIds = Array.from(
      new Set(
        targets.map((t) => {
          const normChain = t.chain.trim().toLowerCase();
          const normAddr = normChain === "solana" ? t.address.trim() : t.address.trim().toLowerCase();
          return `${normChain}:${normAddr}`;
        })
      )
    );
    if (!uniqueIds.length) return map;

    const placeholders = uniqueIds.map(() => "?").join(", ");
    const res = await this.db
      .prepare(`SELECT * FROM forensic_scans WHERE id IN (${placeholders})`)
      .bind(...uniqueIds)
      .all<any>();

    for (const row of res.results || []) {
      const record: ForensicScanRecord = {
        id: row.id,
        chain: row.chain,
        address: row.address,
        symbol: row.symbol || "",
        name: row.name || "",
        score: Number(row.score || 0),
        verdict: row.verdict || "CAUTION",
        recommendedAction: row.recommended_action || "CAUTION_HIGH_RISK",
        isProxy: Boolean(row.is_proxy),
        implementationAddress: row.implementation_address || null,
        buyTaxPercent: Number(row.buy_tax_percent || 0),
        sellTaxPercent: Number(row.sell_tax_percent || 0),
        liquidityUsd: Number(row.liquidity_usd || 0),
        blockNumber: Number(row.block_number || 0),
        attestationSha256: row.attestation_sha256 || "",
        payloadJson: row.payload_json || "{}",
        scannedAt: Number(row.scanned_at || Date.now())
      };
      map.set(row.id, record);
    }
    return map;
  }

  async listRecentClearings(limit = 20): Promise<ClearingRecord[]> {
    await this.ensureClearingsParamColumns();
    const res = await this.db
      .prepare("SELECT * FROM clearings ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<any>();
    return (res.results || []).map((row: any) => ({
      id: row.id,
      network: row.network,
      buyerAddress: row.buyer_address,
      sellerAgentId: row.seller_agent_id,
      amount: String(row.amount || "0"),
      fee: String(row.fee || "0"),
      targetUrl: row.target_url,
      status: row.status,
      responseHash: row.response_hash || undefined,
      attestationSignature: row.attestation_signature || undefined,
      errorReason: row.error_reason || undefined,
      eip3009Nonce: row.eip3009_nonce || undefined,
      targetAddress: row.target_address || undefined,
      targetChain: row.target_chain || undefined,
      queryType: row.query_type || undefined,
      createdAt: Number(row.created_at || 0)
    }));
  }

  async getClearingById(id: string): Promise<ClearingRecord | null> {
    await this.ensureClearingsParamColumns();
    const row = await this.db
      .prepare("SELECT * FROM clearings WHERE id = ? LIMIT 1")
      .bind(id)
      .first<any>();
    if (!row) return null;
    return {
      id: row.id,
      network: row.network,
      buyerAddress: row.buyer_address,
      sellerAgentId: row.seller_agent_id,
      amount: String(row.amount || "0"),
      fee: String(row.fee || "0"),
      targetUrl: row.target_url,
      status: row.status,
      responseHash: row.response_hash || undefined,
      attestationSignature: row.attestation_signature || undefined,
      errorReason: row.error_reason || undefined,
      eip3009Nonce: row.eip3009_nonce || undefined,
      targetAddress: row.target_address || undefined,
      targetChain: row.target_chain || undefined,
      queryType: row.query_type || undefined,
      createdAt: Number(row.created_at || 0)
    };
  }

  async listPassUsageEvents(
    passId: string,
    options?: { days?: number; agentLabel?: string | null; limit?: number }
  ): Promise<TrafficEventRecord[]> {
    await this.ensureTelemetryAndFreeTierTables();
    const days = Math.min(90, Math.max(1, Math.floor(options?.days ?? 30)));
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    const limit = Math.min(5000, Math.max(1, Math.floor(options?.limit ?? 1000)));
    const targetAgent = options?.agentLabel ? options.agentLabel.trim() : null;
    try {
      const res = targetAgent
        ? await this.db
            .prepare(
              "SELECT * FROM traffic_events WHERE pass_id = ? AND timestamp >= ? AND agent_label = ? ORDER BY timestamp DESC LIMIT ?"
            )
            .bind(passId, cutoff, targetAgent, limit)
            .all<any>()
        : await this.db
            .prepare(
              "SELECT * FROM traffic_events WHERE pass_id = ? AND timestamp >= ? ORDER BY timestamp DESC LIMIT ?"
            )
            .bind(passId, cutoff, limit)
            .all<any>();
      return (res.results || []).map((r) => this.mapTrafficEventRow(r));
    } catch {
      return [];
    }
  }

  private async ensureFirewallProTables(): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS api_passes (
          id TEXT PRIMARY KEY,
          key_hash TEXT UNIQUE NOT NULL,
          key_prefix TEXT NOT NULL,
          owner_address TEXT NOT NULL,
          tier TEXT NOT NULL,
          credits_total INTEGER NOT NULL,
          credits_remaining INTEGER NOT NULL,
          price_atomic TEXT NOT NULL,
          settlement_tx TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      ),
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS signer_policies (
          id TEXT PRIMARY KEY,
          owner_address TEXT NOT NULL,
          pass_id TEXT,
          name TEXT NOT NULL,
          policy_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      ),
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS watchtower_monitors (
          id TEXT PRIMARY KEY,
          owner_address TEXT NOT NULL,
          pass_id TEXT,
          chain TEXT NOT NULL,
          target_address TEXT NOT NULL,
          webhook_url TEXT NOT NULL,
          alert_rules_json TEXT NOT NULL,
          last_state_json TEXT,
          last_checked_at INTEGER DEFAULT 0,
          last_alert_at INTEGER DEFAULT 0,
          alert_count INTEGER DEFAULT 0,
          active INTEGER DEFAULT 1,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`
      )
    ]);
  }

  private mapApiPassRow(row: any): ApiPassRecord {
    return {
      id: row.id,
      keyHash: row.key_hash,
      keyPrefix: row.key_prefix,
      ownerAddress: row.owner_address,
      tier: row.tier as ApiPassRecord["tier"],
      creditsTotal: Number(row.credits_total || 0),
      creditsRemaining: Number(row.credits_remaining || 0),
      priceAtomic: String(row.price_atomic || "0"),
      settlementTx: row.settlement_tx || null,
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0)
    };
  }

  private mapMonitorRow(row: any): WatchtowerMonitorRecord {
    return {
      id: row.id,
      ownerAddress: row.owner_address,
      passId: row.pass_id || null,
      chain: row.chain,
      targetAddress: row.target_address,
      webhookUrl: row.webhook_url,
      alertRulesJson: row.alert_rules_json || "{}",
      lastStateJson: row.last_state_json || null,
      lastCheckedAt: Number(row.last_checked_at || 0),
      lastAlertAt: Number(row.last_alert_at || 0),
      alertCount: Number(row.alert_count || 0),
      active: Boolean(row.active),
      expiresAt: Number(row.expires_at || 0),
      createdAt: Number(row.created_at || 0)
    };
  }

  async createApiPass(pass: ApiPassRecord): Promise<void> {
    await this.ensureFirewallProTables();
    await this.db
      .prepare(
        `INSERT INTO api_passes (
          id, key_hash, key_prefix, owner_address, tier, credits_total, credits_remaining, price_atomic, settlement_tx, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        pass.id,
        pass.keyHash,
        pass.keyPrefix,
        pass.ownerAddress.toLowerCase(),
        pass.tier,
        pass.creditsTotal,
        pass.creditsRemaining,
        pass.priceAtomic,
        pass.settlementTx || null,
        pass.createdAt,
        pass.updatedAt
      )
      .run();
  }

  async getApiPassByHash(keyHash: string): Promise<ApiPassRecord | null> {
    await this.ensureFirewallProTables();
    const row = await this.db
      .prepare("SELECT * FROM api_passes WHERE key_hash = ? LIMIT 1")
      .bind(keyHash)
      .first<any>();
    return row ? this.mapApiPassRow(row) : null;
  }

  async consumeApiPassCredit(
    keyHash: string,
    costCredits = 1
  ): Promise<{ allowed: boolean; pass: ApiPassRecord | null; creditsRemaining: number }> {
    await this.ensureFirewallProTables();
    const cost = Math.max(0, Math.floor(costCredits));
    const now = Date.now();
    if (cost > 0) {
      const updateRes = await this.db
        .prepare(
          `UPDATE api_passes
           SET credits_remaining = credits_remaining - ?, updated_at = ?
           WHERE key_hash = ? AND credits_remaining >= ?`
        )
        .bind(cost, now, keyHash, cost)
        .run();
      const changed = Number((updateRes as any)?.meta?.changes || 0);
      const current = await this.getApiPassByHash(keyHash);
      if (!current) {
        return { allowed: false, pass: null, creditsRemaining: 0 };
      }
      if (changed === 0) {
        return { allowed: false, pass: current, creditsRemaining: current.creditsRemaining };
      }
      return { allowed: true, pass: current, creditsRemaining: current.creditsRemaining };
    }
    const current = await this.getApiPassByHash(keyHash);
    if (!current) return { allowed: false, pass: null, creditsRemaining: 0 };
    return { allowed: true, pass: current, creditsRemaining: current.creditsRemaining };
  }

  async upsertSignerPolicy(policy: SignerPolicyRecord): Promise<void> {
    await this.ensureFirewallProTables();
    await this.db
      .prepare(
        `INSERT INTO signer_policies (id, owner_address, pass_id, name, policy_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           policy_json = excluded.policy_json,
           updated_at = excluded.updated_at`
      )
      .bind(
        policy.id,
        policy.ownerAddress.toLowerCase(),
        policy.passId || null,
        policy.name,
        policy.policyJson,
        policy.createdAt,
        policy.updatedAt
      )
      .run();
  }

  async getSignerPolicy(policyId: string): Promise<SignerPolicyRecord | null> {
    await this.ensureFirewallProTables();
    const row = await this.db
      .prepare("SELECT * FROM signer_policies WHERE id = ? LIMIT 1")
      .bind(policyId)
      .first<any>();
    if (!row) return null;
    return {
      id: row.id,
      ownerAddress: row.owner_address,
      passId: row.pass_id || null,
      name: row.name,
      policyJson: row.policy_json,
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0)
    };
  }

  async listSignerPoliciesByOwner(ownerAddress: string): Promise<SignerPolicyRecord[]> {
    await this.ensureFirewallProTables();
    const res = await this.db
      .prepare("SELECT * FROM signer_policies WHERE lower(owner_address) = ? ORDER BY updated_at DESC LIMIT 50")
      .bind(ownerAddress.toLowerCase())
      .all<any>();
    return (res.results || []).map((row: any) => ({
      id: row.id,
      ownerAddress: row.owner_address,
      passId: row.pass_id || null,
      name: row.name,
      policyJson: row.policy_json,
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0)
    }));
  }

  async createWatchtowerMonitor(monitor: WatchtowerMonitorRecord): Promise<void> {
    await this.ensureFirewallProTables();
    await this.db
      .prepare(
        `INSERT INTO watchtower_monitors (
          id, owner_address, pass_id, chain, target_address, webhook_url, alert_rules_json,
          last_state_json, last_checked_at, last_alert_at, alert_count, active, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        monitor.id,
        monitor.ownerAddress.toLowerCase(),
        monitor.passId || null,
        monitor.chain.toLowerCase(),
        monitor.targetAddress,
        monitor.webhookUrl,
        monitor.alertRulesJson,
        monitor.lastStateJson || null,
        monitor.lastCheckedAt,
        monitor.lastAlertAt,
        monitor.alertCount,
        monitor.active ? 1 : 0,
        monitor.expiresAt,
        monitor.createdAt
      )
      .run();
  }

  async getWatchtowerMonitor(monitorId: string): Promise<WatchtowerMonitorRecord | null> {
    await this.ensureFirewallProTables();
    const row = await this.db
      .prepare("SELECT * FROM watchtower_monitors WHERE id = ? LIMIT 1")
      .bind(monitorId)
      .first<any>();
    return row ? this.mapMonitorRow(row) : null;
  }

  async listActiveWatchtowerMonitors(limit = 10): Promise<WatchtowerMonitorRecord[]> {
    await this.ensureFirewallProTables();
    const now = Date.now();
    const res = await this.db
      .prepare(
        `SELECT * FROM watchtower_monitors
         WHERE active = 1 AND expires_at > ?
         ORDER BY last_checked_at ASC
         LIMIT ?`
      )
      .bind(now, limit)
      .all<any>();
    return (res.results || []).map((r: any) => this.mapMonitorRow(r));
  }

  async listWatchtowerMonitorsByOwner(ownerAddress: string): Promise<WatchtowerMonitorRecord[]> {
    await this.ensureFirewallProTables();
    const res = await this.db
      .prepare("SELECT * FROM watchtower_monitors WHERE lower(owner_address) = ? ORDER BY created_at DESC LIMIT 100")
      .bind(ownerAddress.toLowerCase())
      .all<any>();
    return (res.results || []).map((r: any) => this.mapMonitorRow(r));
  }

  async updateWatchtowerMonitorState(
    monitorId: string,
    patch: {
      lastStateJson?: string | null;
      lastCheckedAt?: number;
      lastAlertAt?: number;
      incrementAlerts?: boolean;
      active?: boolean;
    }
  ): Promise<void> {
    await this.ensureFirewallProTables();
    const existing = await this.getWatchtowerMonitor(monitorId);
    if (!existing) return;
    await this.db
      .prepare(
        `UPDATE watchtower_monitors
         SET last_state_json = ?, last_checked_at = ?, last_alert_at = ?, alert_count = ?, active = ?
         WHERE id = ?`
      )
      .bind(
        patch.lastStateJson !== undefined ? patch.lastStateJson : existing.lastStateJson ?? null,
        patch.lastCheckedAt !== undefined ? patch.lastCheckedAt : existing.lastCheckedAt,
        patch.lastAlertAt !== undefined ? patch.lastAlertAt : existing.lastAlertAt,
        patch.incrementAlerts ? existing.alertCount + 1 : existing.alertCount,
        patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active ? 1 : 0,
        monitorId
      )
      .run();
  }

  async deleteWatchtowerMonitor(monitorId: string, ownerAddress?: string): Promise<boolean> {
    await this.ensureFirewallProTables();
    const res = ownerAddress
      ? await this.db
          .prepare("DELETE FROM watchtower_monitors WHERE id = ? AND lower(owner_address) = ?")
          .bind(monitorId, ownerAddress.toLowerCase())
          .run()
      : await this.db
          .prepare("DELETE FROM watchtower_monitors WHERE id = ?")
          .bind(monitorId)
          .run();
    return Number((res as any)?.meta?.changes || 0) > 0;
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


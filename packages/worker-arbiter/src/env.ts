import type { KYAMandate } from "@nullclear/shared";

export interface Env {
  Bindings: {
    DB?: D1Database;
    KV?: KVNamespace;
    NULLCLEAR_CACHE?: KVNamespace;
    ENVIRONMENT?: string;
    SETTLEMENT_MODE?: "onchain" | "facilitator" | "simulated";
    ARBITER_PRIVATE_KEY?: string;
    FACILITATOR_URL?: string;
    BASE_RPC_URL?: string;
    BASE_MAINNET_RPC_URL?: string;
    BASE_SEPOLIA_RPC_URL?: string;
  };
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

export interface IArbiterStore {
  hasUsedNonce(network: string, buyerAddress: string, nonce: string): Promise<boolean>;
  getAgentStats(agentId: string): Promise<AgentStats>;
  recordPassedClearing(agentId: string, buyerAddress: string, amount: string, fee: string, clearing: ClearingRecord): Promise<void>;
  recordFailedValidation(agentId: string, buyerAddress: string, clearing: ClearingRecord): Promise<void>;
  getCounterpartyEdges(sellerAgentId: string): Promise<CounterpartyEdge[]>;
  getKyaMandate(agentId: string, chainId: number): Promise<StoredKyaRecord | null>;
  saveKyaMandate(mandate: StoredKyaRecord): Promise<void>;
  getAgent(agentId: string, chainId: number): Promise<StoredAgentRecord | null>;
  saveAgent(agent: StoredAgentRecord): Promise<void>;
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

  reset(): void {
    this.stats.clear();
    this.edges.clear();
    this.clearings = [];
    this.usedNonces.clear();
    this.kyaMandates.clear();
    this.agents.clear();
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
}

// Shared singleton memory store for fallback execution
const globalMemoryStore = new MemoryArbiterStore();

export function getArbiterStore(bindings?: Env["Bindings"]): IArbiterStore {
  if (bindings?.DB) {
    return new D1ArbiterStore(bindings.DB);
  }
  return globalMemoryStore;
}

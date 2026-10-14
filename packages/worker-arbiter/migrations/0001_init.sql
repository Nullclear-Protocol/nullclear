-- 0001_init.sql: NullClear SQLite / D1 Schema with Nonce Replay Protection

CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  owner_address TEXT,
  agent_uri TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clearings (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  seller_agent_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  fee TEXT NOT NULL,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL,
  response_hash TEXT,
  attestation_signature TEXT,
  error_reason TEXT,
  eip3009_nonce TEXT,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clearings_nonce_replay ON clearings(network, buyer_address, eip3009_nonce);

CREATE TABLE IF NOT EXISTS counterparty_edges (
  id TEXT PRIMARY KEY,
  buyer_address TEXT NOT NULL,
  seller_agent_id TEXT NOT NULL,
  tx_count INTEGER NOT NULL DEFAULT 1,
  total_volume TEXT NOT NULL DEFAULT '0',
  last_tx_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_counterparty_pair ON counterparty_edges(buyer_address, seller_agent_id);

CREATE TABLE IF NOT EXISTS kya_mandates (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  corporate_entity TEXT NOT NULL,
  entity_reg_num TEXT NOT NULL,
  agent_wallet TEXT NOT NULL,
  max_tx_limit_usd INTEGER NOT NULL,
  liability_coverage_usd INTEGER NOT NULL,
  valid_until INTEGER NOT NULL,
  jurisdiction TEXT NOT NULL,
  signature TEXT NOT NULL,
  signer_address TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kya_agent ON kya_mandates(agent_id, chain_id);

CREATE TABLE IF NOT EXISTS agent_stats (
  agent_id TEXT PRIMARY KEY,
  total_cleared_tx INTEGER NOT NULL DEFAULT 0,
  total_failed_validations INTEGER NOT NULL DEFAULT 0,
  total_volume TEXT NOT NULL DEFAULT '0'
);

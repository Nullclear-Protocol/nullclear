-- 0004_radar_and_crawler.sql: Autonomous x402 & ERC-8004 Ecosystem Crawler, Canary Auditor & Base EIP-3009 Volume Radar

CREATE TABLE IF NOT EXISTS indexed_endpoints (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_indexed_endpoints_url ON indexed_endpoints(endpoint_url);
CREATE INDEX IF NOT EXISTS idx_indexed_endpoints_uptime ON indexed_endpoints(uptime_score DESC, latency_ms ASC);
CREATE INDEX IF NOT EXISTS idx_indexed_endpoints_category ON indexed_endpoints(category);
CREATE INDEX IF NOT EXISTS idx_indexed_endpoints_seller ON indexed_endpoints(seller_address);

CREATE TABLE IF NOT EXISTS erc8004_agents (
  agent_id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL DEFAULT 8453,
  owner_address TEXT,
  agent_uri TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  last_indexed_block INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS onchain_eip3009_transfers (
  tx_hash TEXT PRIMARY KEY,
  block_number INTEGER,
  timestamp INTEGER,
  buyer_address TEXT NOT NULL,
  seller_address TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  nonce TEXT,
  is_micropayment INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_eip3009_transfers_block ON onchain_eip3009_transfers(block_number DESC);
CREATE INDEX IF NOT EXISTS idx_eip3009_transfers_seller ON onchain_eip3009_transfers(seller_address);
CREATE INDEX IF NOT EXISTS idx_eip3009_transfers_buyer ON onchain_eip3009_transfers(buyer_address);

CREATE TABLE IF NOT EXISTS onchain_counterparty_profiles (
  address TEXT PRIMARY KEY,
  role TEXT,
  tx_count INTEGER DEFAULT 0,
  total_volume_atomic TEXT DEFAULT '0',
  unique_counterparties INTEGER DEFAULT 0,
  top_counterparty_share REAL DEFAULT 0.0,
  wash_trade_flag INTEGER DEFAULT 0,
  shadow_gateway_slug TEXT,
  last_seen_block INTEGER
);

CREATE INDEX IF NOT EXISTS idx_counterparty_profiles_role ON onchain_counterparty_profiles(role, tx_count DESC);
CREATE INDEX IF NOT EXISTS idx_counterparty_profiles_slug ON onchain_counterparty_profiles(shadow_gateway_slug);

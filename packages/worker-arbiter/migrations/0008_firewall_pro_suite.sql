-- Firewall Pro Suite: Prepaid API Passes, Cryptographic Policy Co-Signer & Continuous Watchtower Monitors
CREATE TABLE IF NOT EXISTS api_passes (
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
);

CREATE INDEX IF NOT EXISTS idx_api_passes_owner ON api_passes(owner_address, created_at);
CREATE INDEX IF NOT EXISTS idx_api_passes_key_hash ON api_passes(key_hash);

CREATE TABLE IF NOT EXISTS signer_policies (
  id TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,
  pass_id TEXT,
  name TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signer_policies_owner ON signer_policies(owner_address, updated_at);

CREATE TABLE IF NOT EXISTS watchtower_monitors (
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
);

CREATE INDEX IF NOT EXISTS idx_watchtower_active_checked ON watchtower_monitors(active, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_watchtower_owner ON watchtower_monitors(owner_address, created_at);

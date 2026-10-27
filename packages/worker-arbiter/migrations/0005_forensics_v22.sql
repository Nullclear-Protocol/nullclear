-- 0005_forensics_v22.sql: NullClear V2.2 On-Chain Forensics, Proxy-Aware Bytecode Inspector & Trending Cache

CREATE TABLE IF NOT EXISTS forensic_scans (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_forensic_scans_chain_addr ON forensic_scans(chain, address);
CREATE INDEX IF NOT EXISTS idx_forensic_scans_scanned_at ON forensic_scans(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_forensic_scans_liquidity ON forensic_scans(liquidity_usd DESC);

-- 0002_safepay.sql: NullClear SafePay Zero-Custody Cryptographic Deliverable Escrow Schema

CREATE TABLE IF NOT EXISTS safepay_deals (
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
);

CREATE INDEX IF NOT EXISTS idx_safepay_deals_buyer ON safepay_deals(buyer_address);
CREATE INDEX IF NOT EXISTS idx_safepay_deals_seller ON safepay_deals(seller_address);
CREATE INDEX IF NOT EXISTS idx_safepay_deals_status ON safepay_deals(status);

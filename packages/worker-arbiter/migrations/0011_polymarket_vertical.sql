-- 0011_polymarket_vertical.sql
-- NullClear Vertical Pivot: Policy-Guarded Polymarket Execution, Whale Copy-Tax Auditor,
-- Live /live Whale Feed, BYO Webhook Alerts, Paper Mode, Policy Receipts & Email Leads
-- Idempotent migration for Cloudflare D1

CREATE TABLE IF NOT EXISTS audited_whales (
  address TEXT PRIMARY KEY,
  display_name TEXT,
  copyability_grade TEXT NOT NULL,
  copyability_score INTEGER NOT NULL,
  naive_pnl_usd REAL NOT NULL DEFAULT 0,
  net_copier_pnl_usd REAL NOT NULL DEFAULT 0,
  maker_pnl_usd REAL NOT NULL DEFAULT 0,
  total_volume_usd REAL NOT NULL DEFAULT 0,
  drag_pct REAL NOT NULL DEFAULT 0,
  primary_category TEXT NOT NULL DEFAULT 'other',
  trade_count INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL,
  audited_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audited_whales_grade_pnl
  ON audited_whales(copyability_score DESC, net_copier_pnl_usd DESC);
CREATE INDEX IF NOT EXISTS idx_audited_whales_category
  ON audited_whales(primary_category, net_copier_pnl_usd DESC);
CREATE INDEX IF NOT EXISTS idx_audited_whales_updated
  ON audited_whales(updated_at DESC);

CREATE TABLE IF NOT EXISTS watched_whales (
  address TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  primary_category TEXT NOT NULL DEFAULT 'other',
  min_alert_usd REAL NOT NULL DEFAULT 1500,
  active INTEGER NOT NULL DEFAULT 1,
  last_polled_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_watched_whales_active
  ON watched_whales(active, last_polled_at ASC);

CREATE TABLE IF NOT EXISTS seen_whale_trades (
  trade_id TEXT PRIMARY KEY,
  whale_address TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  market_title TEXT,
  notional_usd REAL NOT NULL DEFAULT 0,
  alert_posted INTEGER NOT NULL DEFAULT 0,
  seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seen_whale_trades_whale
  ON seen_whale_trades(whale_address, seen_at DESC);

CREATE TABLE IF NOT EXISTS live_whale_alerts (
  id TEXT PRIMARY KEY,
  trade_id TEXT UNIQUE NOT NULL,
  whale_address TEXT NOT NULL,
  whale_label TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  market_title TEXT NOT NULL,
  category TEXT NOT NULL,
  side TEXT NOT NULL,
  whale_price REAL NOT NULL,
  live_best_ask REAL NOT NULL,
  notional_usd REAL NOT NULL,
  slippage_cents REAL NOT NULL DEFAULT 0,
  taker_fee_pct REAL NOT NULL DEFAULT 0,
  live_copy_tax_pct REAL NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL,
  webhooks_delivered INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_whale_alerts_created
  ON live_whale_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_whale_alerts_category
  ON live_whale_alerts(category, created_at DESC);

CREATE TABLE IF NOT EXISTS poly_policies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  wallet_address TEXT,
  mode TEXT NOT NULL DEFAULT 'paper',
  max_trade_usd REAL NOT NULL DEFAULT 100,
  max_daily_spend_usd REAL NOT NULL DEFAULT 500,
  max_daily_loss_usd REAL NOT NULL DEFAULT 75,
  max_slippage_cents REAL NOT NULL DEFAULT 1.0,
  max_fee_drag_pct REAL NOT NULL DEFAULT 2.5,
  maker_only_mode INTEGER NOT NULL DEFAULT 0,
  allowed_categories_json TEXT NOT NULL DEFAULT '["geopolitics","politics","economics","finance","sports","tech"]',
  blocked_categories_json TEXT NOT NULL DEFAULT '["crypto"]',
  webhook_url TEXT,
  webhook_format TEXT NOT NULL DEFAULT 'json',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_poly_policies_user
  ON poly_policies(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_poly_policies_wallet
  ON poly_policies(wallet_address);

CREATE TABLE IF NOT EXISTS paper_trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  policy_id TEXT,
  receipt_id TEXT NOT NULL,
  whale_address TEXT,
  asset_id TEXT NOT NULL,
  market_title TEXT NOT NULL,
  category TEXT NOT NULL,
  side TEXT NOT NULL,
  post_only INTEGER NOT NULL DEFAULT 0,
  trigger_price REAL NOT NULL,
  fill_price REAL NOT NULL,
  shares REAL NOT NULL,
  notional_usd REAL NOT NULL,
  fee_usd REAL NOT NULL DEFAULT 0,
  slippage_cents REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_user_created
  ON paper_trades(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS paper_positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  market_title TEXT NOT NULL,
  category TEXT NOT NULL,
  side TEXT NOT NULL,
  shares REAL NOT NULL DEFAULT 0,
  avg_entry_price REAL NOT NULL DEFAULT 0,
  cost_basis_usd REAL NOT NULL DEFAULT 0,
  mark_price REAL NOT NULL DEFAULT 0,
  unrealized_pnl_usd REAL NOT NULL DEFAULT 0,
  realized_pnl_usd REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_positions_user_asset
  ON paper_positions(user_id, asset_id);

CREATE TABLE IF NOT EXISTS policy_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  policy_id TEXT,
  mode TEXT NOT NULL DEFAULT 'paper',
  wallet_address TEXT,
  whale_address TEXT,
  asset_id TEXT NOT NULL,
  market_title TEXT NOT NULL,
  category TEXT NOT NULL,
  side TEXT NOT NULL,
  order_size_usd REAL NOT NULL,
  trigger_price REAL NOT NULL,
  live_book_ask REAL NOT NULL,
  execution_price REAL NOT NULL,
  computed_fee_usd REAL NOT NULL DEFAULT 0,
  computed_fee_drag_pct REAL NOT NULL DEFAULT 0,
  slippage_cents REAL NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL,
  rejection_code TEXT,
  rules_evaluated_json TEXT NOT NULL,
  policy_snapshot_json TEXT NOT NULL,
  clob_order_id TEXT,
  polygon_tx_hash TEXT,
  builder_code TEXT,
  cosigner_address TEXT,
  cosigner_signature TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policy_receipts_user_created
  ON policy_receipts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_receipts_verdict
  ON policy_receipts(verdict, created_at DESC);

CREATE TABLE IF NOT EXISTS user_leads (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  watched_whales_json TEXT NOT NULL DEFAULT '[]',
  wallet_address TEXT,
  source TEXT NOT NULL DEFAULT 'whale_page',
  subscribed INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_leads_email
  ON user_leads(email);

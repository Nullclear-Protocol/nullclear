-- 0003_telemetry_and_gateways.sql: Granular Traffic Attribution, Free Tier Credits & 1-Click Seller Gateways

CREATE TABLE IF NOT EXISTS traffic_events (
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
);

CREATE INDEX IF NOT EXISTS idx_traffic_events_timestamp ON traffic_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_traffic_events_actor ON traffic_events(actor_type);
CREATE INDEX IF NOT EXISTS idx_traffic_events_host ON traffic_events(host);
CREATE INDEX IF NOT EXISTS idx_traffic_events_path ON traffic_events(path);

CREATE TABLE IF NOT EXISTS free_tier_usage (
  client_key TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (client_key, usage_date)
);

CREATE TABLE IF NOT EXISTS seller_gateways (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_gateways_slug ON seller_gateways(slug);
CREATE INDEX IF NOT EXISTS idx_seller_gateways_category ON seller_gateways(category);

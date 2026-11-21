-- 0009_diagnostics_history.sql: Real-time product usage history & payment diagnostics columns
ALTER TABLE traffic_events ADD COLUMN payment_tier TEXT;
ALTER TABLE traffic_events ADD COLUMN remaining_free INTEGER;
ALTER TABLE traffic_events ADD COLUMN client_id TEXT;
ALTER TABLE traffic_events ADD COLUMN target_subject TEXT;
ALTER TABLE traffic_events ADD COLUMN diagnostic_reason TEXT;
ALTER TABLE traffic_events ADD COLUMN latency_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_traffic_events_tool ON traffic_events(tool_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_traffic_events_payment_tier ON traffic_events(payment_tier, timestamp);

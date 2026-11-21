-- 0010_pass_fleet_and_export.sql: Prepaid Pass fleet tagging (X-Agent-Label), credit spend accounting & receipt URLs
ALTER TABLE traffic_events ADD COLUMN agent_label TEXT;
ALTER TABLE traffic_events ADD COLUMN pass_id TEXT;
ALTER TABLE traffic_events ADD COLUMN credits_deducted INTEGER DEFAULT 0;
ALTER TABLE traffic_events ADD COLUMN receipt_url TEXT;

CREATE INDEX IF NOT EXISTS idx_traffic_events_pass_id ON traffic_events(pass_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_traffic_events_agent_label ON traffic_events(pass_id, agent_label, timestamp);

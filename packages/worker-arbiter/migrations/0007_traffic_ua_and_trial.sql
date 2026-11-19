-- Track truncated User-Agent and free-trial usage flag on traffic_events
-- so telemetry cleanly separates x402 directory bots from AI agent frameworks and trial probes
ALTER TABLE traffic_events ADD COLUMN user_agent TEXT;
ALTER TABLE traffic_events ADD COLUMN is_free_trial INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_traffic_events_trial ON traffic_events(is_free_trial, timestamp);

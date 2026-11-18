-- Track sanitized target params in clearings so paid telemetry separates infra probes from active bot scans
ALTER TABLE clearings ADD COLUMN target_address TEXT;
ALTER TABLE clearings ADD COLUMN target_chain TEXT;
ALTER TABLE clearings ADD COLUMN query_type TEXT;

CREATE INDEX IF NOT EXISTS idx_clearings_target_address ON clearings(target_address, created_at);
CREATE INDEX IF NOT EXISTS idx_clearings_query_type ON clearings(query_type, created_at);

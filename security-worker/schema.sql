CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  portal TEXT NOT NULL,
  actor_uid TEXT,
  actor_email TEXT,
  ip_address TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  user_agent TEXT,
  request_path TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_security_events_time ON security_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_time ON security_events(ip_address, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_actor_time ON security_events(actor_uid, occurred_at DESC);
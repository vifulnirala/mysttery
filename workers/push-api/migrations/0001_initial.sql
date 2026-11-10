PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS installations (
  uid TEXT PRIMARY KEY NOT NULL,
  fcm_token TEXT NOT NULL,
  device_name TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_pairing_codes_expiry ON pairing_codes(expires_at);

CREATE TABLE IF NOT EXISTS device_links (
  id TEXT PRIMARY KEY NOT NULL,
  member_a TEXT NOT NULL,
  member_b TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (member_a <> member_b),
  UNIQUE (member_a, member_b)
);

CREATE INDEX IF NOT EXISTS idx_device_links_member_a ON device_links(member_a);
CREATE INDEX IF NOT EXISTS idx_device_links_member_b ON device_links(member_b);

CREATE TABLE IF NOT EXISTS rate_limits (
  uid TEXT NOT NULL,
  action TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (uid, action)
);

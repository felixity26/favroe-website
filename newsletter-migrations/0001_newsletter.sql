-- Run only against the dedicated NEWSLETTER_DB; never INVENTORY_DB.
CREATE TABLE IF NOT EXISTS newsletter_requests (
 token_hash TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 requested_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 consent_version TEXT NOT NULL,
 consent_text TEXT NOT NULL,
 source TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',
 lock_until INTEGER NOT NULL DEFAULT 0,
 confirmed_at INTEGER,
 resend_contact_id TEXT,
 unsubscribe_hash TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS newsletter_email ON newsletter_requests(email, requested_at);
CREATE TABLE IF NOT EXISTS newsletter_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 token_hash TEXT NOT NULL,
 event TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS newsletter_limits (
 key TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS newsletter_locks (
 email TEXT PRIMARY KEY,
 owner TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);

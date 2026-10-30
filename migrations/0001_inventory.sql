-- Additive schema. No existing KV records are changed or deleted.
CREATE TABLE IF NOT EXISTS inventory_stock (mode TEXT PRIMARY KEY CHECK(mode IN ('test','live')), total INTEGER NOT NULL CHECK(total>=0), ready INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS inventory_reservations (key TEXT PRIMARY KEY, mode TEXT NOT NULL, sets INTEGER NOT NULL CHECK(sets>0), state TEXT NOT NULL CHECK(state IN ('held','allocated','released')), session_id TEXT UNIQUE, expires_at INTEGER NOT NULL, fingerprint TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS inventory_mode_state ON inventory_reservations(mode,state);
CREATE TABLE IF NOT EXISTS order_records (key TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
INSERT OR IGNORE INTO inventory_stock(mode,total,ready) VALUES('test',3000,0);
-- Live stock is intentionally not invented or seeded: physical reconciliation required.

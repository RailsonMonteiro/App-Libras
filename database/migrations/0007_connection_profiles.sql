-- Splits the single saved LouvorJA connection into three named, independently saved slots -
-- "louvorja", "flute" and "violin" (LouvorJA, LouvorJA Flute and LouvorJA Violin in the UI) - one
-- host/port/token each, picked in Configurações/Conexão. Only one is ever actually connected at
-- a time; switching to another disconnects the current one first (ConnectionService still owns
-- a single live connection, just told which profile's saved endpoint to use).
--
-- Whatever was saved before this (at most one row actually mattered - see 0004) becomes the
-- "louvorja" profile's own slot, so an existing setup keeps working without retyping anything.

CREATE TABLE connections_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  profile           TEXT NOT NULL CHECK (profile IN ('louvorja', 'flute', 'violin')),
  host              TEXT NOT NULL,
  port              INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  token             TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_connected_at TEXT,
  UNIQUE (profile)
) STRICT;

INSERT INTO connections_new (profile, host, port, token, created_at, last_connected_at)
SELECT 'louvorja', host, port, token, created_at, last_connected_at
FROM connections
ORDER BY last_connected_at IS NULL, last_connected_at DESC, id DESC
LIMIT 1;

DROP TABLE connections;
ALTER TABLE connections_new RENAME TO connections;

CREATE TABLE connection_history_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile    TEXT NOT NULL CHECK (profile IN ('louvorja', 'flute', 'violin')),
  host       TEXT NOT NULL,
  port       INTEGER NOT NULL,
  event      TEXT NOT NULL CHECK (event IN ('connected', 'disconnected', 'error')),
  message    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO connection_history_new (profile, host, port, event, message, created_at)
SELECT 'louvorja', host, port, event, message, created_at FROM connection_history;

DROP TABLE connection_history;
ALTER TABLE connection_history_new RENAME TO connection_history;

CREATE INDEX idx_connection_history_created_at ON connection_history (created_at);

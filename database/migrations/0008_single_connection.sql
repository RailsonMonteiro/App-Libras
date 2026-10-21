-- The three named profiles (0007) go back to being one connection, now that the app detects
-- which of the real programs (LouvorJA, LouvorJA Flute, LouvorJA Violin, app-Piano) is actually
-- listening on its own, from the ping alone (createAdapter.ts), and shows that program's own
-- name/logo once connected instead of asking which one it will be up front.
--
-- Whichever of the three profiles was connected to most recently becomes the one remembered
-- endpoint, so an existing setup keeps working without retyping anything.

CREATE TABLE connections_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  host              TEXT NOT NULL,
  port              INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  token             TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_connected_at TEXT,
  UNIQUE (host, port)
) STRICT;

INSERT INTO connections_new (host, port, token, created_at, last_connected_at)
SELECT host, port, token, created_at, last_connected_at
FROM connections
ORDER BY last_connected_at IS NULL, last_connected_at DESC, id DESC
LIMIT 1;

DROP TABLE connections;
ALTER TABLE connections_new RENAME TO connections;

CREATE TABLE connection_history_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  host       TEXT NOT NULL,
  port       INTEGER NOT NULL,
  event      TEXT NOT NULL CHECK (event IN ('connected', 'disconnected', 'error')),
  message    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO connection_history_new (host, port, event, message, created_at)
SELECT host, port, event, message, created_at FROM connection_history;

DROP TABLE connection_history;
ALTER TABLE connection_history_new RENAME TO connection_history;

CREATE INDEX idx_connection_history_created_at ON connection_history (created_at);

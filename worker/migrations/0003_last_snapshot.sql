CREATE TABLE IF NOT EXISTS playercount_last (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  t INTEGER NOT NULL,
  online_count INTEGER NOT NULL,
  max_count INTEGER NOT NULL DEFAULT 0,
  version TEXT,
  players_json TEXT,
  online INTEGER NOT NULL DEFAULT 1
);

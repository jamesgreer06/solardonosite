CREATE TABLE IF NOT EXISTS playercount_history (
  t INTEGER NOT NULL,
  v INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_playercount_history_t ON playercount_history (t);

CREATE TABLE IF NOT EXISTS playercount_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  all_time_high INTEGER NOT NULL DEFAULT 0,
  all_time_high_at INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO playercount_stats (id, all_time_high, all_time_high_at)
VALUES (1, 0, 0);

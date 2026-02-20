CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  is_paused INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS process (
  user_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS leaderboard (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  match_date INTEGER NOT NULL,
  place INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL
);

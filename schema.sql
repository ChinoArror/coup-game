-- Users table for SSO
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  uuid TEXT PRIMARY KEY,
  user_id INTEGER,
  name TEXT,
  username TEXT,
  token TEXT,
  first_seen INTEGER,
  last_seen INTEGER,
  is_paused INTEGER DEFAULT 0
);

-- Game process sync
DROP TABLE IF EXISTS process;
CREATE TABLE process (
  user_uuid TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER
);

-- Leaderboard with game_id to prevent duplicates
DROP TABLE IF EXISTS leaderboard;
CREATE TABLE leaderboard (
  id TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL,
  username TEXT NOT NULL,
  game_id TEXT NOT NULL UNIQUE,
  match_date INTEGER NOT NULL,
  place INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL
);

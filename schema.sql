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

-- Private completed-match snapshots. The Worker also creates this table lazily
-- so existing deployed D1 databases receive the feature without a reset.
CREATE TABLE game_history (
  id TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL UNIQUE,
  completed_at INTEGER NOT NULL,
  winner TEXT,
  ai_channels_json TEXT NOT NULL,
  state_json TEXT NOT NULL
);
CREATE INDEX idx_game_history_user_completed ON game_history(user_uuid, completed_at DESC);

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

-- Admin-selected provider channel for each fixed AI opponent.
CREATE TABLE ai_player_config (
  player_slot TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

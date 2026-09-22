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
  revision INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  owner_uuid TEXT NOT NULL,
  owner_is_admin INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  seat_count INTEGER NOT NULL,
  ai_channels_json TEXT NOT NULL,
  time_controls_json TEXT NOT NULL,
  durable_object_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE TABLE room_members (
  room_id TEXT NOT NULL,
  user_uuid TEXT NOT NULL,
  display_name TEXT NOT NULL,
  seat_index INTEGER NOT NULL,
  is_ready INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  PRIMARY KEY (room_id, user_uuid)
);
CREATE TABLE room_invites (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_uuid TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER
);

CREATE TABLE room_snapshots (
  room_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  clocks_json TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);

CREATE TABLE room_events (
  room_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  actor_key TEXT NOT NULL,
  client_action_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(room_id, actor_key, client_action_id)
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

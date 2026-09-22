# Multiplayer Rooms Design

## Goal

Add authenticated, real-time, resumable Coup rooms at `/game` without changing the existing single-player game at `/`.

## Scope and invariants

- The existing `You + Alapha + Beta` game and its `/api/process` persistence remain unchanged.
- A room contains 3-6 seats. The owner is always a human member. It can include zero to three AI seats.
- Room AI display names are `I`, `II`, and `III`; they map once each to the already-configured channel IDs `1`, `2`, and `3`. Existing Worker gateway, keys, prompts, and quota API remain the only AI implementation.
- All room members authenticate through Auth Center. Room actions are authorized by the Worker before reaching room state.
- The owner owns every AI token charge, including health checks and runtime decisions. Owner accounts whose role is `admin` are unlimited, matching the current application behavior.
- Each human can have an optional independent per-step limit and an optional independent whole-match clock. AI seats have neither limit.
- Room state is authoritative in a per-room Durable Object (DO), with D1 snapshots for recovery and ownership data. The DO broadcasts individual redacted views through WebSocket.

## Lifecycle

1. An authenticated owner submits participant count, selected distinct channels, and optional time controls.
2. The Worker verifies every requested AI channel with a minimal server-side call charged to the owner. It creates nothing when any test fails.
3. Worker stores room metadata and returns an opaque invitation token/link. The owner can open or close entry, revoke invitations, and remove non-owner human members while still in the lobby.
4. Joined humans signal Ready. The owner starts only after every current human member is Ready and the configured seat count is filled. Joining and leaving are disabled after start.
5. The DO serializes every player action, AI decision, timeout and connection event. A revision increases exactly once for every accepted transition.
6. A reconnecting user queries their active room and reconnects to the same DO. The deadline is an absolute server timestamp; reconnecting never pauses it.
7. A game ending creates the existing history entry for each human player from a server-generated final snapshot; room closure retains no playable state.

## State and privacy

The DO stores full `GameState` plus room clocks, seats, event idempotency keys and configuration. It never sends full state to a browser. `projectRoomState(state, viewerUuid)` preserves the viewer's own unrevealed card types, revealed cards, public coins/logs/turn/clock values, and replaces all other unrevealed cards with `Unknown`.

## Time controls

For a human current actor the effective deadline is the earlier of `turnStartedAt + stepLimitMs` and `playerRemainingMs` after elapsed time is charged. DO Alarm is set to that absolute time. On expiry, it applies one legal benign operation: pass while responding, income at normal turn start, Coup against the first live opponent at 10+ coins, and loss of the first unrevealed card when a card choice is due. It then schedules the next deadline.

## Routes

- `/game`: room hub and lobby/match shell.
- `/game/rules`: bilingual static rules view; locale is a local UI choice.
- `POST /api/rooms`: validate and health-test selected channels, create owner lobby.
- `GET /api/rooms`: list rooms the signed-in user belongs to.
- `GET /api/rooms/:id`: authorized lobby summary and reconnect metadata.
- `POST /api/rooms/:id/join`, `/ready`, `/start`, `/close`, `/leave`, `/kick`, `/invite`.
- `GET /api/rooms/invite/:token`: resolve invitation for an authenticated user.
- `GET /api/rooms/:id/socket`: authenticated WebSocket upgrade to the room DO.

## D1 entities

- `rooms`: id, owner_uuid, owner_is_admin, status, seat_count, ai_channels_json, time_controls_json, durable_object_id, created_at, updated_at, closed_at.
- `room_members`: room_id, user_uuid, display_name, seat_index, is_ready, joined_at, left_at; unique active seat per room and active room per user.
- `room_invites`: id, room_id, token_hash, created_by_uuid, expires_at, max_uses, use_count, revoked_at.
- `room_snapshots`: room_id, revision, state_json, clocks_json, saved_at; latest snapshot is replaceable.
- `room_events`: room_id, revision, actor_key, client_action_id, event_json, created_at; unique `(room_id, actor_key, client_action_id)` for idempotent client retries.

## Failure handling

- Unauthorized, non-member, closed, started, expired, duplicate, full and not-ready actions receive stable 4xx JSON responses.
- API health-test failure returns a sanitized provider failure and creates no room.
- A runtime AI failure broadcasts an error, retries only once from the same revision, then uses the same phase-safe timeout fallback; it is still charged only for completed provider calls.
- DO restart loads the latest D1 snapshot before accepting a socket or action.

## UI

Reuse the slate/amber tactical visual system, Lucide icons, responsive card panels and monospace labels. Add a room button to the root game's header. `/game` contains create and join cards, room cards, owner controls, ready controls, invitation copy control and a match board using the current game visual language. `/game/rules` contains a Chinese/English toggle and no network dependency.

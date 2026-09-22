# Game State Integrity and Match History Design

## Purpose

Make local Coup matches deterministic even when AI responses arrive late, and retain completed matches as private, reviewable history for the signed-in user.

## Scope

- Reject invalid game operations in the engine before they can mutate state.
- Bind an AI response to the state it was requested for and discard it if the state has advanced.
- Correct the AI response prompt for a player targeted by `STEAL`.
- Save completed match snapshots, expose private list/detail/delete APIs, and add a history view.

The current in-progress game save (`process`) remains separate from historical matches.

## State Integrity

`GameState` receives a monotonic `revision`. Every accepted engine transition increments it. A request for an AI decision captures the revision, phase, current actor, responder id, and pending action/block identity. Its result is applied only if those values still match the latest state; otherwise it is discarded without logging or changing the game.

The engine validates all public transition functions:

- Actions require `TURN_START`, the current active player, and valid required targets. Targeted actions (`STEAL`, `ASSASSINATE`, `COUP`) require a live opponent, never the actor.
- At 10 or more coins, only `COUP` is accepted. `COUP` requires at least 7 coins and a valid target before deducting coins.
- Responses (`PASS`, `CHALLENGE`, `BLOCK`) require the responding player to be alive and listed in `waitingForResponseFrom` for the current phase.
- Influence loss requires the designated player and one of their unrevealed card IDs.

The React component calls engine transitions only through guarded callbacks. The engine owns completion of pass cycles and the next legal phase; the component no longer duplicates settlement decisions.

## AI Instructions

When an AI is the target of `STEAL` or `ASSASSINATE`, its prompt first provides the targeted-response choices. For `STEAL`, these are `BLOCK` with Captain or Ambassador, or `PASS`; for `ASSASSINATE`, Contessa or `PASS`. General challenge options apply only to other respondents.

The request context identifies the legal actor and legal opposing target IDs, so providers are instructed not to select themselves or eliminated players. The engine remains the authority if a provider ignores the instruction.

## History Storage and API

Create `game_history`, keyed by a generated history ID, containing the owner UUID, game ID, creation/completion timestamps, winner, AI channel assignments, and a serialized history snapshot.

The snapshot contains the final public game state and normalized event records. Event records include a per-event timestamp, text, and coins before/after for each player. The existing in-game event text stays compact; coin deltas are displayed only in the history detail.

Endpoints, all requiring a verified session and scoped to that session's UUID:

- `GET /api/history`: returns the owner’s compact match list.
- `GET /api/history/:id`: returns one owner’s full match snapshot.
- `DELETE /api/history/:id`: deletes one owner’s history item.
- `POST /api/history`: persists a completed match once per `game_id`.

On game completion the client reads the Alapha/Beta assignments from the existing AI configuration endpoint/state response and posts the snapshot. A per-game ref prevents duplicate submissions. The server has a unique `game_id` constraint as final protection.

## UI

Add a history icon to the game header, alongside leaderboard/reset controls. The history page lists date, winner, players, and the Alapha/Beta channel IDs; a selected entry shows the game event timeline with coin changes and a delete control for each list item. It has a return-to-game control. No coin-delta duplication is added to the live game’s right-side log.

## Error Handling

Invalid engine commands and stale AI responses are ignored with no state mutation. User-visible API errors in the history screen keep the existing list/detail visible and show a concise error. Failed history upload is retried on subsequent completion-state renders until the server confirms success or reports an already-recorded game.

## Verification

Tests cover:

- self, eliminated, missing, and invalid targets; forced Coup; and no deduction on rejected Coup;
- duplicate/non-waiting responses and stale AI result guards;
- successful `STEAL` settlement after valid passes;
- owner-scoped history list/detail/delete/create endpoints and duplicate game protection;
- history snapshot coin-delta derivation;
- TypeScript compilation, full test suite, and production build.

# Multiplayer Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver authenticated real-time 3-6 player Coup rooms at `/game` while leaving the legacy single-player game unchanged.

**Architecture:** Worker routes authenticate and authorize every room request. A Durable Object is the single writer and WebSocket broadcaster for each room; D1 stores membership, invitations and durable snapshots. The frontend has route-isolated room pages and renders only redacted room state.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Cloudflare Workers, Durable Objects, D1, WebSocket, existing Auth Center and AI gateway.

**Spec:** `docs/superpowers/specs/2026-09-22-multiplayer-rooms-design.md`

## Global Constraints

- Do not change the existing `/` single-player flow or its `App.tsx` game engine behavior.
- Use no client-side AI keys or direct provider calls.
- Channels `1`, `2`, and `3` may occur at most once in a room and render as `I`, `II`, and `III`.
- Human clocks are individual server-side clocks; AI seats are never clocked.
- Use Lucide React components for new UI icons.

## Review Focus

- A stale socket action must not mutate a newer revision.
- A non-owner must not issue owner-only lobby actions.
- An invite token must never be returned or stored in plaintext after creation.
- A reconnect must preserve a running deadline rather than restart it.
- A browser must never receive another member's unrevealed card type.

### Task 1: Room domain model and generalized game seats

**Files:**
- Create: `services/rooms.ts`, `services/rooms.test.ts`
- Modify: `types.ts`, `utils/gameEngine.ts`, `utils/gameEngine.test.ts`

- [ ] Write failing tests for `validateRoomDraft({ seatCount: 3, aiChannels: ['1', '2'] })`, duplicate channels, invalid counts, and `initializeGameForSeats` with 3-6 named seats.
- [ ] Run `npx vitest run services/rooms.test.ts utils/gameEngine.test.ts` and confirm the new exports are absent.
- [ ] Implement room types, channel validation, Roman numeral labels, and a seat-driven initializer without changing `initializeGame()`.
- [ ] Add a deterministic `projectRoomState` test that proves only the viewer's own hidden cards are present.
- [ ] Run targeted tests, then `npx vitest run`, and commit `feat: add room game domain`.

### Task 2: D1 room ownership, membership and invitation APIs

**Files:**
- Modify: `schema.sql`, `worker.ts`, `worker.test.ts`
- Create: `services/roomRepository.ts`, `services/roomRepository.test.ts`

- [ ] Add failing Worker tests for create validation, provider health-test failure leaving no room, owner-only start/kick/close, authenticated invitation use, duplicate/full join rejection, and channel health calls charged to the owner.
- [ ] Run `npx vitest run worker.test.ts services/roomRepository.test.ts` and observe missing route failures.
- [ ] Implement schema migration helpers and parameterized repository functions. Hash invitation tokens with SHA-256 before persistence and return plaintext only from create/invite responses.
- [ ] Implement `/api/rooms` lifecycle routes and call `callWithQuota(owner, channel)` for every health check.
- [ ] Run targeted tests and the full suite; commit `feat: add room lobby APIs`.

### Task 3: Durable Object authority, clocks, and AI turns

**Files:**
- Create: `roomGame.ts`, `roomGame.test.ts`
- Modify: `worker.ts`, `wrangler.toml`, `services/aiGateway.ts`

- [ ] Write failing pure transition tests for stale revisions, one legal action per actor, reconnecting clock deadlines, response/income/Coup/card-loss timeout fallbacks, and owner-charged room AI calls.
- [ ] Run `npx vitest run roomGame.test.ts` and observe missing room authority implementation.
- [ ] Implement `RoomGame` Durable Object with serialized actions, snapshot writes, absolute Alarm deadlines and recipient-specific WebSocket projections.
- [ ] Add the `ROOM_GAME` Durable Object binding and migration to Wrangler configuration; proxy authenticated socket upgrades through Worker routes.
- [ ] Run targeted tests, full suite and `npx tsc --noEmit`; commit `feat: add realtime room authority`.

### Task 4: `/game` lobby, match UI and bilingual rules

**Files:**
- Create: `GameHub.tsx`, `RoomLobby.tsx`, `RoomMatch.tsx`, `Rules.tsx`, `services/roomClient.ts`, `services/rules.ts`
- Modify: `index.tsx`, `App.tsx`

- [ ] Write failing tests for path routing `/game` and `/game/rules`, locale toggle copy, room-form limits, ready/start owner visibility, and room-state redaction rendering.
- [ ] Run the frontend test files and observe absent route/components.
- [ ] Implement route selection without changing the legacy root flow; add a header link to `/game`, create/join controls, invitation link copy, owner member controls, WebSocket reconnect and room match board.
- [ ] Reuse slate/amber styles and Lucide icons; use local Chinese/English rule dictionaries.
- [ ] Run `npx vitest run`, `npx tsc --noEmit`, and `npm run build`; commit `feat: add room game interface`.

### Task 5: Documentation and end-to-end checks

**Files:**
- Modify: `README.md`, `worker.test.ts`, `roomGame.test.ts`

- [ ] Add tests for disconnect/reconnect after deadline start, invitation expiry, owner quota attribution, and final history persistence for each human room member.
- [ ] Update README with room URLs, invitation/security behavior, time fallback behavior, Durable Object binding and local test commands.
- [ ] Run full tests, TypeScript, build, D1 migration smoke test and an authenticated Worker/room socket smoke test.
- [ ] Commit `docs: document multiplayer rooms`.

# Post-Login Game Hub and Responsive Play Flows

## Goal

After authentication, give players a clear home screen to choose the existing direct match against Alapha and Beta or create/join a multiplayer room, with a simpler responsive flow on desktop and mobile.

## Current Context

- The app is a React 19, TypeScript, and Vite frontend. Tailwind utility classes are currently supplied by the Tailwind CDN, and UI icons use `lucide-react`.
- `worker.ts` is the Cloudflare Worker API. D1 stores account-linked match and room data; the `RoomGame` Durable Object owns live multiplayer state.
- `/` currently renders the direct match. `/game`, `/game/:id`, and `/game/rules` are the multiplayer room routes. The Worker already supports rooms of 3–6 seats, up to three distinct AI channels, one-use human invitations, readiness, and starting a match.
- Auth Center verifies sessions. The browser entry checks `/api/me` and gates the admin dashboard by the verified `admin` role.

## Selected Approach

Make `/` the authenticated game hub and move the existing direct match to `/play`. Preserve `/game` room routes and reuse the current match engine, room APIs, D1 schema, Durable Object, and AI channels. This creates a clear post-login choice while keeping the two game modes on their current backend contracts.

The visual direction is a focused tactical operations desk: keep the dark palette and amber identity, use stronger spacing and type hierarchy, make the two game modes the primary choices, and reduce the density of secondary settings. Do not rebuild unrelated admin, history, leaderboard, or rules features.

## User Experience

### Authenticated home

- `/` shows the brand, signed-in display name, and a role label.
- The two primary actions are **Direct Match** and **Create Room**. Direct Match names Alapha and Beta so the fixed opponents are clear. If an unfinished saved direct match exists, offer **Continue Match**; otherwise offer **Start Match**.
- Provide a room-list/join path and secondary links for match history and leaderboard. Show the Admin Dashboard entry only to a verified admin.
- Keep unauthenticated access on the existing Auth Center login flow. After SSO callback, return to `/` and show the hub.

### Direct match

- Serve the existing persistent solo game at `/play`; preserve its game rules, AI slots, saved state, and API behavior.
- Add a clear route back to the hub.
- Reorder the board so the active protocol, current player action, and response choices are easy to find. Keep opponent status visible, make target selection and cancellation explicit, and keep all primary touch targets at least 44 px high.
- On mobile, prioritize the action/response controls and current player state; avoid requiring horizontal scrolling for the core turn.

### Room setup and play

- Keep `/game` as the room area. Make room creation a clear setup flow with total seats (3–6), selectable unique AI channels (0–3, always leaving at least one human seat), and a live count of AI seats, owner/other human seats, and open guest seats.
- Keep the owner as the first human seat. The owner invites other humans using the existing one-use invitation flow; explain that each invitation is for one guest and can be generated again for additional guest seats.
- Move optional step and total clocks into a collapsed advanced section. Preserve the existing defaults and validation.
- Preserve the current member-ready and owner-start rules. Clarify why Start is unavailable (open seats or members not ready), show these states in the lobby, and keep room play, pause, end, leave, and recovery behavior intact.
- Present the same seat and action information in a stacked layout on phone widths without shrinking controls or hiding required steps.

### Role behavior

- A normal user can use direct matches, create/join rooms, view their own history, and use the existing leaderboard flow.
- A verified admin sees the additional Admin Dashboard entry and retains existing admin room capabilities.
- The client may hide role-specific navigation for clarity, but Worker authorization remains authoritative and is not weakened or replaced.

## Local End-to-End Test Design

- Run the app with a local Worker, local D1, and local Durable Object. Auth Center remains the identity verifier for the supplied test identities; do not write test game or room records to the production D1.
- The existing Worker sets `Domain=.aryuki.com` on the SSO cookie, which browsers reject on localhost. Make cookie-domain behavior host-aware: preserve `.aryuki.com` on production hosts and omit the Domain attribute for local hosts. Add focused coverage for both cases.
- Use deterministic local AI test doubles: intercept direct-match `POST /api/ai` requests in the browser test, and point the local Worker's room-AI relay at a local fake provider. Create the AI room as the verified admin (whose existing policy skips quota checks); join it as the user. Assert that no quota check/consume request or live provider request occurs. Keep the test doubles out of production configuration and frontend bundles.
- Exercise both real test identities in separate browser contexts. Verify role visibility and the user/admin room flow, including create, invite, join, ready, start, and a live turn. Verify the solo flow through a human action and AI response.
- Capture desktop (1440×900) and mobile (390×844) screenshots for the authenticated hub, room setup, populated lobby, active room match, direct match, and admin-only navigation/dashboard. Store screenshots in a local task artifact directory outside Git and do not include credentials in filenames or images.
- Run the project unit tests, TypeScript check, and production build, then complete the requested browser flows. Do not deploy.

## Constraints and Non-Goals

- Do not change Coup rules, AI strategy, room ownership/authorization, invitation token properties, quota policy, database schema, or authentication semantics.
- Do not add test credentials, session tokens, or secrets to source files, screenshots, Git, or captured logs.
- Do not perform production writes, consume quota, deploy, or call live model providers as part of local screenshot testing. Auth Center may verify the supplied test identities; game and room records stay in local D1 and Durable Object state.
- Keep existing Alapha/Beta naming and server-side channel mapping.
- No new icon library or hand-written icon SVGs; use the existing Lucide React components and `currentColor` styling.

## Acceptance Criteria

1. An authenticated user lands on the hub at `/` and can enter either game mode.
2. The existing direct match is available at `/play`, still resumes its saved state, and can return to the hub.
3. Room setup communicates how seat count, AI seats, and human invitation seats fit together, and the existing backend accepts valid 3–6 seat configurations.
4. Admin-only navigation is present for the admin identity and absent for the user identity; Worker permissions continue to protect admin endpoints.
5. User/admin room and direct-match browser flows complete against local app data on both desktop and mobile layouts.
6. The requested screenshot set is saved locally, the unit/type/build checks pass, and no deployment or live AI usage occurs.

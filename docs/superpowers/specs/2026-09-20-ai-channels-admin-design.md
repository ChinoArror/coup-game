# AI Channels and AdminDash Design

## Goal

Add a third, OpenAI-backed model channel; let an SSO administrator select the channel for the Alapha and Beta game players; and test any channel through AdminDash without bypassing Auth-Center quota accounting.

## Channel contract

- Channel `1` is Gemini, reads `GEMINI_API_KEY` and `Model_1`.
- Channel `2` is DeepSeek, reads `DEEPSEEK_API_KEY` and `Model_2`.
- Channel `3` is OpenAI, reads `OPENAI_API_KEY` and `Model_3`.
- Keys are Worker Secrets only. The local `.design/secret.txt` is ignored and is used only as the upload source.
- Each non-streaming provider response is normalized to `{ content, totalTokens }`, preserving the current Gemini, DeepSeek, and OpenAI usage fields.

## Authorization and data model

- `verifyToken()` is the authority for a request's identity. The verified `role` is carried in the session; only `role === "admin"` can read or change AI configuration or test a channel.
- A D1 `ai_player_config` table persists the selected channel for player slots `alapha` and `beta`. Defaults are `1` and `2`, respectively.
- The game client sends a player slot, never a provider name. The Worker validates it against the two supported slots and resolves the selected channel server-side.

## Quotas and errors

- Both game and AdminDash test requests call `/api/quota/check` before an upstream request.
- They call `/api/quota/consume` with the provider-reported total token count through `ctx.waitUntil` only after a successful upstream response.
- Quota failures retain meaningful 401, 403, and 429 statuses. Provider failures retain a sanitized provider status/message and are never consumed.

## UI

- The two AI opponents display as `Alapha` and `Beta`; their existing personality prompt text is otherwise unchanged.
- An explicit `ADMINDASH` button appears in the game header only for `role === "admin"`.
- AdminDash shows each player slot's selected channel, allows saving either of the three channels, and has a per-channel model test action with a small, visible status result. The obsolete local user-management UI is removed because user administration belongs to Auth-Center and its Worker endpoints do not exist.

## Security constraints

- No API key is included in source, a browser bundle, a response, a log, or the repository.
- Local secrets and worktree material remain ignored.
- Request authorization does not trust a merely Base64-decoded JWT payload for privileged access.

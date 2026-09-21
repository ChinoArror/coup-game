# AI Channels and AdminDash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three server-side AI channels with persisted per-player selection, admin-only testing, verified SSO roles, and correctly metered token use.

**Architecture:** A testable gateway maps each channel to its Worker environment variables and normalizes its response. The Worker owns verified authorization, D1 configuration, quota calls, and API endpoints. React sends stable player slots and renders saved configuration in AdminDash.

**Tech Stack:** Cloudflare Workers, D1, React 19, TypeScript, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-ai-channels-admin-design.md`

## Global Constraints

- Channels are exactly `1`, `2`, and `3`; providers are Gemini, DeepSeek, and OpenAI.
- Secrets are `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, and `OPENAI_API_KEY`; no source or response contains their values.
- Models are Worker variables `Model_1`, `Model_2`, and `Model_3`.
- Admin authorization requires the SSO-verified `role === "admin"`.
- Both games and administrator tests preserve Auth-Center quota pre-check and post-consumption.
- Icons use Lucide components.

## Review Focus

- A forged decoded JWT cannot access `/api/admin/*`.
- Invalid player slots/channel IDs cannot call an arbitrary provider or consume quota.
- A failed provider request never invokes quota consumption.
- All three provider usage formats report correct token totals.
- Missing keys/models return errors without leaking a secret.

---

### Task 1: Provider gateway and test harness

**Files:** Create `services/aiGateway.ts`, `services/aiGateway.test.ts`; modify `package.json`, `package-lock.json`.

**Interfaces:** Produce `callAIChannel(channelId, env, request, fetcher): Promise<{ content: string; totalTokens: number }>` for IDs `1 | 2 | 3`.

- [ ] Write failing tests for normalized Gemini `usageMetadata.totalTokenCount`, DeepSeek `usage.total_tokens`, OpenAI `usage.total_tokens`, and invalid channel rejection.
- [ ] Run `npm test -- services/aiGateway.test.ts`; expect missing-module failure.
- [ ] Add Vitest and the minimal provider gateway.
- [ ] Run `npm test -- services/aiGateway.test.ts`; expect all cases passing.
- [ ] Commit: `git add package.json package-lock.json services/aiGateway.ts services/aiGateway.test.ts && git commit -m "feat: add metered AI channel gateway"`.

### Task 2: Worker authorization, configuration, and quota endpoints

**Files:** Modify `worker.ts`, `schema.sql`; create `worker.test.ts`.

**Interfaces:** Consume `callAIChannel`; produce `GET/PUT /api/admin/ai-config`, `POST /api/admin/ai-test`, and `POST /api/ai` accepting `playerSlot`.

- [ ] Write failing tests for non-admin rejection, defaults `alapha=1`/`beta=2`, saved selection, successful OpenAI token consumption, and no consumption after provider failure.
- [ ] Run `npm test -- worker.test.ts`; expect endpoint/configuration failure.
- [ ] Implement verified session resolution, D1 defaults, strict slot/channel validation, shared quota helpers, game dispatch, and admin test dispatch.
- [ ] Run `npm test -- worker.test.ts`; expect all authorization/accounting cases passing.
- [ ] Commit: `git add worker.ts schema.sql worker.test.ts && git commit -m "feat: add admin AI routing and quota controls"`.

### Task 3: Game and AdminDash UI

**Files:** Modify `utils/gameEngine.ts`, `services/geminiService.ts`, `App.tsx`, `AdminPanel.tsx`, `index.tsx`; create focused UI/service tests.

**Interfaces:** Consume `playerSlot`, configuration, and test endpoints; produce Alapha/Beta labels and an admin-only control surface.

- [ ] Write failing tests that `ai1`/`ai2` send stable slots and ordinary roles do not render the AdminDash entry.
- [ ] Run the targeted test command; expect existing name-driven routing to fail.
- [ ] Rename visible players, preserve existing prompt bodies, send `playerSlot`, and replace invalid local-user management with per-player selectors and per-channel test actions.
- [ ] Run focused UI/service tests; expect them to pass.
- [ ] Commit: `git add utils/gameEngine.ts services/geminiService.ts App.tsx AdminPanel.tsx index.tsx && git commit -m "feat: configure AI channels from admin dash"`.

### Task 4: Secure deployment configuration

**Files:** Modify `wrangler.toml`, `README.md`; create a configuration test.

**Interfaces:** Consume the secret/model names from Task 1; produce secret-safe deployment instructions.

- [ ] Write a failing configuration test requiring `Model_1`, `Model_2`, and `Model_3`, and prohibiting API keys under `[vars]`.
- [ ] Run it; expect legacy names to fail.
- [ ] Replace legacy model names, document three `wrangler secret put` operations, and upload each local value to the matching Worker Secret only after automated checks are green.
- [ ] Run the configuration test and `npm run build`; expect both passing.
- [ ] Commit: `git add wrangler.toml README.md && git commit -m "chore: configure AI channel secrets"`.

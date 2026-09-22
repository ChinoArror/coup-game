# Game State Integrity and Match History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Prevent late or illegal operations from corrupting a Coup match and retain private, deletable completed-match history.

**Architecture:** gameEngine validates and owns all transitions, incrementing a revision after valid input. App records revision and actor/responder context for each abortable AI call and applies a result only when it still matches the current state. The Worker stores final private snapshots, attaching actual Alapha/Beta channel assignments; hidden coin snapshots in log entries drive history-only coin deltas.

**Tech Stack:** React 19, TypeScript, Vitest, Cloudflare Workers, Cloudflare D1, Lucide React, Vite.

**Spec:** docs/superpowers/specs/2026-09-22-game-state-history-design.md

## Global Constraints

- Keep live-game log text compact; only history detail displays per-event coin deltas.
- Never trust an AI action, target, response, or card ID; the game engine is authoritative.
- Scope every history read and deletion to the verified session UUID.
- The Worker, not the browser, records active Alapha/Beta channel assignments.
- Do not expose provider secrets or game history to other users.

## Review Focus

- An aborted AI request must not become the fallback PASS action.
- A human pass must invalidate the prior AI request and permit a fresh response request.
- At 10 coins, a non-Coup action must leave coins, logs, and pending action unchanged.
- An ID owned by another user must appear absent for history detail and deletion.
- Old saved logs with no coin snapshots must display a history timeline without crashing.

---

### Task 1: Validate and version all game transitions

**Files:**

- Modify: types.ts:51-107
- Modify: utils/gameEngine.ts:1-403
- Modify: utils/gameEngine.test.ts:1-39

**Interfaces:**

- Produces GameState.revision, GameLogEntry.coins?: Record<string, number>, and actor-aware handlePlayerAction(state, actorId, action, targetId?).
- All response methods retain their player ID and return the original state without mutation for invalid input.

- [ ] **Step 1: Write failing tests for invalid targets, forced Coup, and repeat responses**

    it('rejects a self-targeted steal without creating a pending action', () => {
      const state = playableState({ currentPlayerIndex: 1 });
      expect(handlePlayerAction(state, 'ai1', ActionType.STEAL, 'ai1')).toEqual(state);
    });

    it('requires Coup at ten coins without mutating coins or logs', () => {
      const state = playableState({ humanCoins: 10 });
      expect(handlePlayerAction(state, 'human', ActionType.TAX)).toEqual(state);
    });

    it('ignores a second response from a player no longer waiting', () => {
      const passed = handlePass(handlePlayerAction(playableState(), 'human', ActionType.TAX), 'ai1');
      expect(handleChallenge(passed, 'ai1')).toEqual(passed);
    });

- [ ] **Step 2: Run the focused test before implementation**

Run: npx vitest run utils/gameEngine.test.ts

Expected: FAIL because actions lack actor validation and responses do not require waiting status.

- [ ] **Step 3: Implement immutable state and legality helpers**

    const cloneState = (state: GameState) => structuredClone(state);
    const isLiveOpponent = (state: GameState, actorId: string, targetId?: string) =>
      Boolean(targetId && targetId !== actorId && state.players.some(p => p.id === targetId && !p.isEliminated));
    const canRespond = (state: GameState, playerId: string) =>
      state.waitingForResponseFrom.includes(playerId) && Boolean(state.players.find(p => p.id === playerId && !p.isEliminated));
    const commit = (state: GameState): GameState => ({ ...state, revision: state.revision + 1 });

Initialize revision: 0. Clone before every accepted mutation. Validate phase, actor, live opponent, coin cost, and 10-coin Coup before logging/deducting. Targeted actions require a non-self, non-eliminated target.

- [ ] **Step 4: Make pass completion engine-owned and capture coin snapshots**

    const snapshotCoins = (state: GameState) => Object.fromEntries(
      state.players.map(player => [player.id, player.coins]),
    );
    const log = (state: GameState, text: string, type: GameLogEntry['type'] = 'info') => {
      state.logs.push({ id: generateId(), text, type, timestamp: Date.now(), coins: snapshotCoins(state) });
    };

After the final valid pass, handlePass resolves a declared action or completed block phase. Put Coup/Assassinate declaration logs after valid cost deduction; retain visible messages.

- [ ] **Step 5: Verify and commit**

Run: npx vitest run utils/gameEngine.test.ts

Expected: PASS for uppercase Steal, invalid targets, forced Coup/no mutation, duplicate responses, valid Coup cost, and coin snapshots.

    git add types.ts utils/gameEngine.ts utils/gameEngine.test.ts
    git commit -m "fix: validate game transitions"

### Task 2: Abort stale AI calls and fix targeted decisions

**Files:**

- Modify: App.tsx:1-230
- Modify: services/geminiService.ts:24-206
- Create: services/aiDecisionGuard.ts
- Create: services/aiDecisionGuard.test.ts

**Interfaces:**

- Produces AIRequestContext, createAIRequestContext(state, playerId), and isAIRequestCurrent(state, context).
- getAIDecision(state, player, signal?: AbortSignal) propagates browser aborts instead of returning fallback PASS.

- [ ] **Step 1: Write the failing request-context tests**

    it('rejects a result after another player pass advances revision', () => {
      const state = actionDeclaredState();
      const context = createAIRequestContext(state, 'ai1');
      expect(isAIRequestCurrent(handlePass(state, 'human'), context)).toBe(false);
    });

    it('accepts only the waiting responder in the original revision', () => {
      const state = actionDeclaredState();
      expect(isAIRequestCurrent(state, createAIRequestContext(state, 'ai1'))).toBe(true);
      expect(isAIRequestCurrent(state, createAIRequestContext(state, 'ai2'))).toBe(false);
    });

- [ ] **Step 2: Run the guard test before implementation**

Run: npx vitest run services/aiDecisionGuard.test.ts

Expected: FAIL because the guard module does not exist.

- [ ] **Step 3: Implement the context guard**

    export type AIRequestContext = {
      revision: number; phase: GamePhase; playerId: string; currentActorId: string;
      pendingActionKey: string | null; pendingBlockerId: string | null;
    };

    export const isAIRequestCurrent = (state: GameState, context: AIRequestContext) =>
      state.revision === context.revision &&
      state.phase === context.phase &&
      state.players[state.currentPlayerIndex]?.id === context.currentActorId &&
      (state.phase === GamePhase.TURN_START
        ? context.playerId === context.currentActorId
        : state.waitingForResponseFrom.includes(context.playerId));

Build pendingActionKey from actorId:action:targetId and compare it with the current action; compare pendingBlockerId too.

- [ ] **Step 4: Replace callbacks with abortable guarded dispatch**

    const controller = new AbortController();
    const context = createAIRequestContext(gameState, responder.id);
    const decision = await getAIDecision(gameState, responder, controller.signal);
    setGameState(previous => {
      if (!previous || !isAIRequestCurrent(previous, context)) return previous;
      return applyAIDecision(previous, responder.id, decision);
    });
    return () => controller.abort();

Pass expected actor IDs to handlePlayerAction. Make target-specific Steal/Assassinate prompting run before generic ACTION_DECLARED prompting, offering Captain/Ambassador or Contessa blocks. Include legal live opponent IDs in action prompts.

- [ ] **Step 5: Verify and commit**

Run: npx vitest run services/aiDecisionGuard.test.ts utils/gameEngine.test.ts

Expected: PASS; stale context is rejected and valid Steal settlement remains.

    git add App.tsx services/geminiService.ts services/aiDecisionGuard.ts services/aiDecisionGuard.test.ts utils/gameEngine.ts utils/gameEngine.test.ts
    git commit -m "fix: discard stale AI decisions"

### Task 3: Add private Worker history endpoints

**Files:**

- Modify: schema.sql:14-40
- Modify: worker.ts:96-224
- Modify: worker.test.ts:1-184

**Interfaces:**

- Produces POST /api/history, GET /api/history, GET /api/history/:id, and DELETE /api/history/:id.
- The POST body is { state: GameState }; the Worker derives { alapha: ChannelId, beta: ChannelId }.

- [ ] **Step 1: Write failing Worker tests**

    it('stores a final game with current Alapha and Beta channels', async () => {
      db.config.alapha = '3'; db.config.beta = '1';
      const response = await worker.fetch(request('/api/history', 'user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: finishedState() }),
      }), env, ctx);
      expect(await response.json()).toMatchObject({ ai_channels: { alapha: '3', beta: '1' } });
    });

    it('does not delete another users history', async () => {
      expect((await worker.fetch(request('/api/history/other-history', 'user', { method: 'DELETE' }), env, ctx)).status).toBe(404);
    });

- [ ] **Step 2: Run Worker tests before implementation**

Run: npx vitest run worker.test.ts

Expected: FAIL because no history route or FakeDatabase support exists.

- [ ] **Step 3: Add schema, lazy D1 setup, and endpoints**

    CREATE TABLE IF NOT EXISTS game_history (
      id TEXT PRIMARY KEY, user_uuid TEXT NOT NULL, game_id TEXT NOT NULL UNIQUE,
      completed_at INTEGER NOT NULL, winner TEXT, ai_channels_json TEXT NOT NULL, state_json TEXT NOT NULL
    );

Require a final state (phase === GAME_OVER) with gameId, players, and logs. Insert one generated ID; return 409 for repeated game IDs. List compact rows, fetch detail with id and user_uuid, and delete with the same owner predicate.

- [ ] **Step 4: Extend FakeDatabase and verify owner isolation**

    readonly history = new Map<string, {
      user_uuid: string; game_id: string; state_json: string; ai_channels_json: string;
    }>();

Teach first, all, and run to emulate only the added history SQL and seed another owner’s row.

- [ ] **Step 5: Verify and commit**

Run: npx vitest run worker.test.ts

Expected: PASS for creation, duplicate protection, channel snapshot, list/detail/delete, and owner isolation.

    git add schema.sql worker.ts worker.test.ts
    git commit -m "feat: store private game history"

### Task 4: Persist completed games and render history

**Files:**

- Modify: App.tsx:1-292
- Modify: index.tsx:1-69
- Create: History.tsx

**Interfaces:**

- Consumes history endpoints and GameLogEntry.coins.
- Produces the history root view with list, detail, and delete controls.

- [ ] **Step 1: Submit a final game once without changing live logs**

    if (gameState.phase === GamePhase.GAME_OVER && !historySubmittedRef.current) {
      void fetch('/api/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: gameState }),
      }).then(response => {
        if (response.ok || response.status === 409) historySubmittedRef.current = true;
      });
    }

Reset the ref in resetGame. Add a Lucide History icon to the game header; do not alter live log rendering.

- [ ] **Step 2: Implement list, detail, coin deltas, and deletion**

    const remove = async (id: string) => {
      const response = await fetch('/api/history/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to delete match history.');
      setMatches(items => items.filter(item => item.id !== id));
      if (selected?.id === id) setSelected(null);
    };

Render date, winner, Alapha Channel N, Beta Channel N, and a Trash2 button on every list row. Detail compares each log coin snapshot to its preceding snapshot and renders non-zero +N/-N changes. Absent old snapshots render no delta. Use ArrowLeft, History, Trash2, and CircleDollarSign from Lucide.

- [ ] **Step 3: Wire root routing and compile**

    type View = 'game' | 'admin' | 'leaderboard' | 'history';
    if (view === 'history') return <History onBack={() => setView('game')} />;

Run: npx tsc --noEmit

Expected: PASS.

- [ ] **Step 4: Verify and commit**

Run: npx vitest run && npm run build

Expected: all tests PASS and Vite emits dist.

    git add App.tsx index.tsx History.tsx
    git commit -m "feat: add match history view"

### Task 5: Final checks

**Files:**

- Modify: README.md only if its feature list has a natural history entry.

**Interfaces:**

- Consumes all preceding changes.
- Produces a verified branch ready for deployment.

- [ ] **Step 1: Run full verification**

Run: npx vitest run

Expected: all tests pass.

Run: npx tsc --noEmit

Expected: exit code 0.

Run: npm run build

Expected: exit code 0.

- [ ] **Step 2: Inspect final patch and commit documentation only if changed**

Run: git diff --check && git status --short && git log --oneline -5

Expected: no whitespace errors or unrelated files.

    git add README.md
    git commit -m "docs: describe match history"

Run the commit only if README.md changed; otherwise make no empty documentation commit.


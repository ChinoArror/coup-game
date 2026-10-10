import { describe, expect, it, vi } from 'vitest';
import { ActionType, GamePhase } from './types';
import { RoomGame, timeoutTransition } from './roomGame';
import { handlePlayerAction, initializeGameForSeats } from './utils/gameEngine';

const game = () => initializeGameForSeats([
  { id: 'one', name: 'One', isAI: false },
  { id: 'two', name: 'Two', isAI: false },
  { id: 'three', name: 'Three', isAI: false },
]);

describe('room timeout fallback', () => {
  it('uses Income at a normal turn and Coup when the player must Coup', () => {
    const income = timeoutTransition(game());
    expect(income.players[0].coins).toBe(3);
    expect(income.currentPlayerIndex).toBe(1);

    const mustCoup = game();
    mustCoup.players[0].coins = 10;
    const coup = timeoutTransition(mustCoup);
    expect(coup.phase).toBe(GamePhase.CHALLENGE_LOSS);
    expect(coup.pendingAction).toMatchObject({ action: ActionType.COUP, targetId: 'two' });
  });

  it('passes a pending response and loses the first hidden card when required', () => {
    const declared = handlePlayerAction(game(), 'one', ActionType.TAX);
    const passed = timeoutTransition(declared);
    expect(passed.waitingForResponseFrom).not.toContain('two');

    const loss = game();
    loss.phase = GamePhase.CHALLENGE_LOSS;
    loss.playerToLoseInfluence = 'one';
    loss.waitingForResponseFrom = ['one'];
    const resolved = timeoutTransition(loss);
    expect(resolved.players[0].cards[0].isRevealed).toBe(true);
  });
});

describe('room AI recovery', () => {
  it('runs an AI response while an earlier human responder has not acted', async () => {
    const stored = new Map<string, any>();
    const tasks: Promise<unknown>[] = [];
    const state = {
      storage: {
        get: async (key: string) => stored.get(key),
        put: async (key: string, value: unknown) => { stored.set(key, value); },
        setAlarm: vi.fn(), deleteAlarm: vi.fn(),
      },
      waitUntil: (task: Promise<unknown>) => tasks.push(task),
    };
    const roomGame = new RoomGame(state, {});
    const initial = initializeGameForSeats([
      { id: 'owner', name: 'Owner', isAI: false },
      { id: 'guest', name: 'Guest', isAI: false },
      { id: 'room-ai-1', name: 'I', isAI: true },
    ]);
    const declared = handlePlayerAction(initial, 'owner', ActionType.TAX);
    expect(declared.waitingForResponseFrom).toEqual(['guest', 'room-ai-1']);
    const room = {
      roomId: 'room-id', owner: { uuid: 'owner', isAdmin: true }, aiChannels: ['1'], state: declared,
      config: {}, remaining: {}, phaseStartedAt: Date.now(), revision: declared.revision,
      activity: { owner: Date.now(), guest: Date.now() },
    };
    stored.set('room', room);
    (roomGame as any).callOwnerAi = vi.fn().mockResolvedValue({ type: 'PASS' });

    await (roomGame as any).maybeRunAi(room);
    await Promise.all(tasks);

    expect((roomGame as any).callOwnerAi).toHaveBeenCalledOnce();
    expect((stored.get('room').state as typeof declared).waitingForResponseFrom).toEqual(['guest']);
    expect((stored.get('room').state as typeof declared).phase).toBe(GamePhase.ACTION_DECLARED);
  });

  it('keeps one pending AI decision when a human passes during the request', async () => {
    const stored = new Map<string, any>();
    const tasks: Promise<unknown>[] = [];
    const state = {
      storage: {
        get: async (key: string) => stored.get(key),
        put: async (key: string, value: unknown) => { stored.set(key, value); },
        setAlarm: vi.fn(), deleteAlarm: vi.fn(),
      },
      waitUntil: (task: Promise<unknown>) => tasks.push(task),
    };
    const roomGame = new RoomGame(state, {});
    const initial = initializeGameForSeats([
      { id: 'owner', name: 'Owner', isAI: false },
      { id: 'guest', name: 'Guest', isAI: false },
      { id: 'room-ai-1', name: 'I', isAI: true },
    ]);
    const declared = handlePlayerAction(initial, 'owner', ActionType.TAX);
    const room = {
      roomId: 'room-id', owner: { uuid: 'owner', isAdmin: true }, aiChannels: ['1'], state: declared,
      config: {}, remaining: {}, phaseStartedAt: Date.now(), revision: declared.revision,
      activity: { owner: Date.now(), guest: Date.now() },
    };
    stored.set('room', room);
    let finishAi!: (value: { type: string }) => void;
    const decision = new Promise<{ type: string }>(resolve => { finishAi = resolve; });
    (roomGame as any).callOwnerAi = vi.fn().mockReturnValue(decision);

    await (roomGame as any).maybeRunAi(room);
    const passed = await roomGame.fetch(new Request('https://room.internal/action', {
      method: 'POST', headers: { 'X-Room-Actor': 'guest', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pass', revision: declared.revision }),
    }));
    expect(passed.status).toBe(200);
    finishAi({ type: 'PASS' });
    await Promise.all(tasks);

    expect((roomGame as any).callOwnerAi).toHaveBeenCalledOnce();
    expect((stored.get('room').state as typeof declared).phase).toBe(GamePhase.TURN_START);
  });

  it('broadcasts a provider failure instead of silently passing and lets only the owner switch to an unused channel', async () => {
    const stored = new Map<string, any>();
    const tasks: Promise<unknown>[] = [];
    const state = {
      storage: {
        get: async (key: string) => stored.get(key),
        put: async (key: string, value: unknown) => { stored.set(key, value); },
        setAlarm: vi.fn(),
        deleteAlarm: vi.fn(),
      },
      waitUntil: (task: Promise<unknown>) => tasks.push(task),
    };
    const roomGame = new RoomGame(state, {});
    const roomState = initializeGameForSeats([
      { id: 'owner', name: 'Owner', isAI: false },
      { id: 'room-ai-1', name: 'I', isAI: true },
      { id: 'other', name: 'Other', isAI: false },
    ]);
    roomState.currentPlayerIndex = 1;
    stored.set('room', {
      roomId: 'room-id', owner: { uuid: 'owner', isAdmin: true }, aiChannels: ['1'], state: roomState,
      config: {}, remaining: {}, phaseStartedAt: Date.now(), revision: roomState.revision, activity: { owner: Date.now(), other: Date.now() },
    });

    await (roomGame as any).runAi(roomState.revision, 'room-ai-1');
    const failure = await stored.get('room');
    expect(failure.aiFailure).toMatchObject({ playerId: 'room-ai-1', channelId: '1', status: 500 });
    expect(failure.state.currentPlayerIndex).toBe(1);

    const outsider = await roomGame.fetch(new Request('https://room.internal/recovery', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Room-Internal': '1', 'X-Room-Actor': 'other' },
      body: JSON.stringify({ type: 'switch-ai', channelId: '2' }),
    }));
    expect(outsider.status).toBe(403);

    const ownerRecovery = await roomGame.fetch(new Request('https://room.internal/recovery', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Room-Internal': '1', 'X-Room-Actor': 'owner' },
      body: JSON.stringify({ type: 'switch-ai', channelId: '2' }),
    }));
    expect(ownerRecovery.status).toBe(200);
    expect(await ownerRecovery.json()).toMatchObject({ aiChannels: ['2'] });
    expect((await stored.get('room')).aiChannels).toEqual(['2']);
    await Promise.all(tasks);
    expect((await stored.get('room')).aiFailure).toMatchObject({ channelId: '2' });
  });
});

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

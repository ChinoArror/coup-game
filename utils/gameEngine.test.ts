import { describe, expect, it } from 'vitest';
import { ActionType, CardType, GamePhase, type GameState } from '../types';
import { handleChallenge, handlePass, handlePlayerAction, initializeGameForSeats, resolveActionSuccess } from './gameEngine';

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: 'room',
    turn: 4,
    currentPlayerIndex: 1,
    phase: GamePhase.TURN_START,
    players: [
      { id: 'human', name: 'You', isAI: false, coins: 3, cards: [{ id: 'human-duke', type: CardType.DUKE, isRevealed: false }], isEliminated: false },
      { id: 'ai1', name: 'Alapha', isAI: true, coins: 2, cards: [{ id: 'ai1-captain', type: CardType.CAPTAIN, isRevealed: false }], isEliminated: false },
      { id: 'ai2', name: 'Beta', isAI: true, coins: 2, cards: [{ id: 'ai2-duke', type: CardType.DUKE, isRevealed: false }], isEliminated: false },
    ],
    deck: [],
    pendingAction: null,
    pendingBlock: null,
    waitingForResponseFrom: [],
    playerToLoseInfluence: null,
    logs: [],
    winner: null,
    startedAt: 0,
    gameId: 'game',
    revision: 0,
    ...overrides,
  };
}

describe('game transition validation', () => {
  it('initializes a room game with between three and six supplied seats', () => {
    const state = initializeGameForSeats([
      { id: 'owner', name: 'Owner', isAI: false },
      { id: 'room-ai-1', name: 'I', isAI: true },
      { id: 'guest', name: 'Guest', isAI: false },
      { id: 'room-ai-2', name: 'II', isAI: true },
    ]);

    expect(state.players.map(player => player.id)).toEqual(['owner', 'room-ai-1', 'guest', 'room-ai-2']);
    expect(state.players).toHaveLength(4);
    expect(state.deck).toHaveLength(7);
  });

  it('transfers coins when an AI uppercase STEAL is accepted by every responder', () => {
    const declared = handlePlayerAction(gameState(), 'STEAL' as ActionType, 'human');
    const afterTargetPass = handlePass(declared, 'human');
    const afterAllPass = handlePass(afterTargetPass, 'ai2');

    const settled = resolveActionSuccess(afterAllPass);

    expect(settled.players.find(player => player.id === 'ai1')?.coins).toBe(4);
    expect(settled.players.find(player => player.id === 'human')?.coins).toBe(1);
  });

  it('rejects a self-targeted steal without creating a pending action', () => {
    const state = gameState();

    const result = handlePlayerAction(state, ActionType.STEAL, 'ai1');

    expect(result).toEqual(state);
  });

  it('requires Coup at ten coins without mutating coins or logs', () => {
    const state = gameState({
      currentPlayerIndex: 0,
      players: gameState().players.map(player => player.id === 'human' ? { ...player, coins: 10 } : player),
    });
    const original = structuredClone(state);

    const result = handlePlayerAction(state, ActionType.TAX);

    expect(result).toEqual(original);
  });

  it('ignores a second response from a player no longer waiting', () => {
    const declared = handlePlayerAction(gameState({ currentPlayerIndex: 0 }), ActionType.TAX);
    const passed = handlePass(declared, 'ai1');
    const original = structuredClone(passed);

    const result = handleChallenge(passed, 'ai1');

    expect(result).toEqual(original);
  });

  it('records coin snapshots in settlement logs for history', () => {
    const declared = handlePlayerAction(gameState(), 'STEAL' as ActionType, 'human');
    const settled = resolveActionSuccess(handlePass(handlePass(declared, 'human'), 'ai2'));

    expect(settled.logs.at(-1)?.coins).toEqual({ human: 1, ai1: 4, ai2: 2 });
  });

  it('explains that a proven character is replaced after a failed challenge', () => {
    const state = gameState({
      currentPlayerIndex: 0,
      players: gameState().players.map(player => player.id === 'human'
        ? { ...player, cards: [{ id: 'human-duke', type: CardType.DUKE, isRevealed: false }] }
        : player),
      deck: [CardType.CAPTAIN],
    });

    const challenged = handleChallenge(handlePlayerAction(state, 'human', ActionType.TAX), 'ai1');

    expect(challenged.players.find(player => player.id === 'human')?.cards[0]).toMatchObject({ isRevealed: false });
    expect(challenged.players.find(player => player.id === 'human')?.cards[0].id).not.toBe('human-duke');
    expect(challenged.logs.at(-1)?.text).toBe('You reveals Duke! Challenge FAILED. Duke returns to the Court deck and a replacement is drawn.');
  });
});

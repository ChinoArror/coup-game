import { describe, expect, it } from 'vitest';
import { ActionType, GamePhase, type GameState } from '../types';
import { handlePass, handlePlayerAction, resolveActionSuccess } from './gameEngine';

function stealState(): GameState {
  return {
    roomId: 'room',
    turn: 4,
    currentPlayerIndex: 1,
    phase: GamePhase.TURN_START,
    players: [
      { id: 'human', name: 'You', isAI: false, coins: 3, cards: [], isEliminated: false },
      { id: 'ai1', name: 'Alapha', isAI: true, coins: 2, cards: [], isEliminated: false },
      { id: 'ai2', name: 'Beta', isAI: true, coins: 2, cards: [], isEliminated: false },
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
  };
}

describe('steal settlement', () => {
  it('transfers coins when an AI uppercase STEAL is accepted by every responder', () => {
    const declared = handlePlayerAction(stealState(), 'STEAL' as ActionType, 'human');
    const afterTargetPass = handlePass(declared, 'human');
    const afterAllPass = handlePass(afterTargetPass, 'ai2');

    const settled = resolveActionSuccess(afterAllPass);

    expect(settled.players.find(player => player.id === 'ai1')?.coins).toBe(4);
    expect(settled.players.find(player => player.id === 'human')?.coins).toBe(1);
  });
});

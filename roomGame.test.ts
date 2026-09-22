import { describe, expect, it } from 'vitest';
import { ActionType, GamePhase } from './types';
import { timeoutTransition } from './roomGame';
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

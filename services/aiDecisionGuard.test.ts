import { describe, expect, it } from 'vitest';
import { ActionType } from '../types';
import { handlePass, handlePlayerAction, initializeGame } from '../utils/gameEngine';
import { createAIRequestContext, isAIRequestCurrent, isAIRequestRelevant } from './aiDecisionGuard';

function actionDeclaredState() {
  const state = initializeGame();
  state.currentPlayerIndex = 1;
  return handlePlayerAction(state, 'ai1', ActionType.TAX);
}

describe('AI decision guard', () => {
  it('rejects a result after another player pass advances revision', () => {
    const state = actionDeclaredState();
    const context = createAIRequestContext(state, 'ai2');

    expect(isAIRequestCurrent(handlePass(state, 'human'), context)).toBe(false);
  });

  it('keeps a pending AI response relevant after another responder passes', () => {
    const state = actionDeclaredState();
    const context = createAIRequestContext(state, 'ai2');

    expect(isAIRequestRelevant(handlePass(state, 'human'), context)).toBe(true);
    expect(isAIRequestRelevant(handlePass(state, 'ai2'), context)).toBe(false);
  });

  it('accepts only the waiting responder in the original revision', () => {
    const state = actionDeclaredState();

    expect(isAIRequestCurrent(state, createAIRequestContext(state, 'ai2'))).toBe(true);
    expect(isAIRequestCurrent(state, createAIRequestContext(state, 'ai1'))).toBe(false);
  });
});

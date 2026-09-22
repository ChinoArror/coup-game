import { GamePhase, type GameState } from '../types';

export type AIRequestContext = {
  revision: number;
  phase: GamePhase;
  playerId: string;
  currentActorId: string;
  pendingActionKey: string | null;
  pendingBlockerId: string | null;
};

const actionKey = (state: GameState) => {
  const action = state.pendingAction;
  return action ? [action.actorId, action.action, action.targetId || ''].join(':') : null;
};

export const createAIRequestContext = (state: GameState, playerId: string): AIRequestContext => ({
  revision: state.revision || 0,
  phase: state.phase,
  playerId,
  currentActorId: state.players[state.currentPlayerIndex]?.id || '',
  pendingActionKey: actionKey(state),
  pendingBlockerId: state.pendingBlock?.blockerId || null,
});

export const isAIRequestCurrent = (state: GameState, context: AIRequestContext): boolean => {
  if (state.revision !== context.revision || state.phase !== context.phase) return false;
  if (state.players[state.currentPlayerIndex]?.id !== context.currentActorId) return false;
  if (actionKey(state) !== context.pendingActionKey || (state.pendingBlock?.blockerId || null) !== context.pendingBlockerId) return false;
  return state.phase === GamePhase.TURN_START
    ? context.playerId === context.currentActorId
    : state.waitingForResponseFrom.includes(context.playerId);
};

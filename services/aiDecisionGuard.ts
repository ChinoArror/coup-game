import { GamePhase, type GameState } from '../types';

export type AIRequestContext = {
  gameId: string;
  turn: number;
  revision: number;
  phase: GamePhase;
  playerId: string;
  currentActorId: string;
  pendingActionKey: string | null;
  pendingBlockerId: string | null;
  lossPlayerId: string | null;
};

const actionKey = (state: GameState) => {
  const action = state.pendingAction;
  return action ? [action.actorId, action.action, action.targetId || ''].join(':') : null;
};

export const createAIRequestContext = (state: GameState, playerId: string): AIRequestContext => ({
  gameId: state.gameId,
  turn: state.turn,
  revision: state.revision || 0,
  phase: state.phase,
  playerId,
  currentActorId: state.players[state.currentPlayerIndex]?.id || '',
  pendingActionKey: actionKey(state),
  pendingBlockerId: state.pendingBlock?.blockerId || null,
  lossPlayerId: state.playerToLoseInfluence,
});

export const isAIRequestRelevant = (state: GameState, context: AIRequestContext): boolean => {
  if (state.gameId !== context.gameId || state.turn !== context.turn || state.phase !== context.phase) return false;
  if (state.players[state.currentPlayerIndex]?.id !== context.currentActorId) return false;
  if (actionKey(state) !== context.pendingActionKey || (state.pendingBlock?.blockerId || null) !== context.pendingBlockerId) return false;
  if (state.playerToLoseInfluence !== context.lossPlayerId) return false;
  return state.phase === GamePhase.TURN_START
    ? context.playerId === context.currentActorId
    : state.waitingForResponseFrom.includes(context.playerId);
};

export const isAIRequestCurrent = (state: GameState, context: AIRequestContext): boolean =>
  state.revision === context.revision && isAIRequestRelevant(state, context);

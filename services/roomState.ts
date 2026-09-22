import { CardType, type GameState } from '../types';

/**
 * Create the only form of a room state that may cross the Worker boundary.
 * Coins, revealed influence and the event log are public; an unrevealed card is
 * visible only to its owner.
 */
export const projectRoomState = (state: GameState, viewerId: string): GameState => {
  const projected = structuredClone(state);
  projected.deck = [];
  projected.players = projected.players.map(player => ({
    ...player,
    cards: player.cards.map(card => (
      !card.isRevealed && player.id !== viewerId
        ? { ...card, type: CardType.UNKNOWN }
        : card
    )),
  }));
  return projected;
};

export const roomPublicSummary = (state: GameState) => ({
  revision: state.revision,
  phase: state.phase,
  currentPlayerId: state.players[state.currentPlayerIndex]?.id ?? null,
  waitingForResponseFrom: state.waitingForResponseFrom,
  winner: state.winner,
});

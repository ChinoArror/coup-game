import { describe, expect, it } from 'vitest';
import { CardType } from '../types';
import { initializeGameForSeats } from '../utils/gameEngine';
import { projectRoomState } from './roomState';

describe('projectRoomState', () => {
  it('keeps only the viewer\'s hidden influence and never exposes the court deck', () => {
    const state = initializeGameForSeats([
      { id: 'owner', name: 'Owner', isAI: false },
      { id: 'guest', name: 'Guest', isAI: false },
      { id: 'room-ai-1', name: 'I', isAI: true },
    ]);
    const projected = projectRoomState(state, 'owner');

    expect(projected.deck).toEqual([]);
    expect(projected.players.find(player => player.id === 'owner')?.cards.map(card => card.type))
      .toEqual(state.players.find(player => player.id === 'owner')?.cards.map(card => card.type));
    expect(projected.players.filter(player => player.id !== 'owner').flatMap(player => player.cards).every(card => card.type === CardType.UNKNOWN)).toBe(true);
  });
});

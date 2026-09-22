import { describe, expect, it } from 'vitest';
import { coinChanges } from './history';

describe('history coin deltas', () => {
  it('shows only non-zero changes between event snapshots', () => {
    expect(coinChanges({ human: 4, ai1: 1, ai2: 2 }, { human: 2, ai1: 3, ai2: 2 })).toEqual([
      { playerId: 'human', delta: 2 },
      { playerId: 'ai1', delta: -2 },
    ]);
  });

  it('handles logs created before coin snapshots existed', () => {
    expect(coinChanges(undefined, { human: 2 })).toEqual([]);
  });
});

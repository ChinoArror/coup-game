export type CoinSnapshot = Record<string, number> | undefined;

export const coinChanges = (current: CoinSnapshot, previous: CoinSnapshot) => {
  if (!current) return [] as Array<{ playerId: string; delta: number }>;
  return Object.entries(current)
    .map(([playerId, coins]) => ({ playerId, delta: coins - (previous?.[playerId] ?? coins) }))
    .filter(change => change.delta !== 0);
};

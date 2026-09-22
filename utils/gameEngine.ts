import { GameState, Player, CardType, ActionType, GamePhase, GameLogEntry } from "../types";

const INITIAL_COINS = 2;
const generateId = () => Math.random().toString(36).slice(2, 11);
const shuffle = <T,>(array: T[]): T[] => array.sort(() => Math.random() - 0.5);

const createDeck = (): CardType[] => shuffle(
  [CardType.DUKE, CardType.ASSASSIN, CardType.CAPTAIN, CardType.AMBASSADOR, CardType.CONTESSA]
    .flatMap(type => [type, type, type]),
);

const createPlayer = (id: string, name: string, isAI: boolean, deck: CardType[]): Player => ({
  id,
  name,
  isAI,
  coins: INITIAL_COINS,
  cards: [
    { id: generateId(), type: deck.pop()!, isRevealed: false },
    { id: generateId(), type: deck.pop()!, isRevealed: false },
  ],
  isEliminated: false,
});

const cloneState = (state: GameState): GameState => structuredClone(state);
const commit = (state: GameState): GameState => ({ ...state, revision: (state.revision || 0) + 1 });
const snapshotCoins = (state: GameState) => Object.fromEntries(state.players.map(player => [player.id, player.coins]));

const log = (state: GameState, text: string, type: GameLogEntry['type'] = 'info') => {
  state.logs.push({ id: generateId(), text, type, timestamp: Date.now(), coins: snapshotCoins(state) });
};
const normalizeActionType = (action?: string): ActionType | null => {
  if (!action) return null;
  const normalized = action.trim().toUpperCase().replace(/[\s_]+/g, '_');
  return Object.values(ActionType).find(candidate => candidate.toUpperCase().replace(/[\s_]+/g, '_') === normalized) || null;
};

const playerById = (state: GameState, playerId?: string) => state.players.find(player => player.id === playerId);
const isLiveOpponent = (state: GameState, actorId: string, targetId?: string) => {
  const target = playerById(state, targetId);
  return Boolean(target && !target.isEliminated && target.id !== actorId);
};
const canRespond = (state: GameState, playerId: string) => {
  const player = playerById(state, playerId);
  return state.waitingForResponseFrom.includes(playerId) && Boolean(player && !player.isEliminated);
};

const nextTurnInPlace = (state: GameState): void => {
  const activePlayers = state.players.filter(player => !player.isEliminated);
  if (activePlayers.length === 1) {
    if (state.phase !== GamePhase.GAME_OVER) {
      activePlayers[0].placement = 1;
      state.phase = GamePhase.GAME_OVER;
      state.winner = activePlayers[0].name;
      log(state, activePlayers[0].name + " wins the game!", 'success');
    }
    return;
  }

  let nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  while (state.players[nextIndex].isEliminated) nextIndex = (nextIndex + 1) % state.players.length;
  state.currentPlayerIndex = nextIndex;
  state.phase = GamePhase.TURN_START;
  state.pendingAction = null;
  state.pendingBlock = null;
  state.waitingForResponseFrom = [];
  state.playerToLoseInfluence = null;
  state.turn += 1;
};

const resolveActionSuccessInPlace = (state: GameState): void => {
  const action = state.pendingAction;
  if (!action) return;
  const actor = playerById(state, action.actorId);
  const target = playerById(state, action.targetId);
  if (!actor) return;

  switch (action.action) {
    case ActionType.FOREIGN_AID:
      actor.coins += 2;
      log(state, actor.name + " collected Foreign Aid.");
      break;
    case ActionType.TAX:
      actor.coins += 3;
      log(state, actor.name + " collected Tax.");
      break;
    case ActionType.STEAL:
      if (target) {
        const stolen = Math.min(2, target.coins);
        target.coins -= stolen;
        actor.coins += stolen;
        log(state, actor.name + " stole " + stolen + " from " + target.name + ".");
      }
      break;
    case ActionType.EXCHANGE: {
      const currentCards = actor.cards.filter(card => !card.isRevealed).map(card => card.type);
      const newCards = [state.deck.pop(), state.deck.pop()].filter((card): card is CardType => Boolean(card));
      state.deck.push(...currentCards);
      state.deck = shuffle(state.deck);
      const revealed = actor.cards.filter(card => card.isRevealed);
      actor.cards = [...revealed, ...newCards.slice(0, currentCards.length).map(type => ({ id: generateId(), type, isRevealed: false }))];
      log(state, actor.name + " exchanged cards with the Court deck.");
      break;
    }
    case ActionType.ASSASSINATE:
      if (target) {
        state.phase = GamePhase.CHALLENGE_LOSS;
        state.playerToLoseInfluence = target.id;
        state.waitingForResponseFrom = [target.id];
        log(state, "Assassination successful! Target must lose influence.");
        return;
      }
      break;
  }
  nextTurnInPlace(state);
};

export const initializeGame = (): GameState => {
  const deck = createDeck();
  const state: GameState = {
    roomId: generateId(),
    turn: 1,
    currentPlayerIndex: 0,
    phase: GamePhase.TURN_START,
    players: [createPlayer('human', 'You', false, deck), createPlayer('ai1', 'Alapha', true, deck), createPlayer('ai2', 'Beta', true, deck)],
    deck,
    pendingAction: null,
    pendingBlock: null,
    waitingForResponseFrom: [],
    playerToLoseInfluence: null,
    logs: [],
    winner: null,
    startedAt: Date.now(),
    gameId: crypto.randomUUID(),
    revision: 0,
  };
  log(state, "Game Started. Good luck.");
  return state;
};

export const nextTurn = (state: GameState): GameState => {
  const next = cloneState(state);
  nextTurnInPlace(next);
  return commit(next);
};

export const handlePlayerAction = (
  state: GameState,
  actorIdOrAction: string | ActionType,
  actionOrTarget?: ActionType | string,
  targetId?: string,
): GameState => {
  const legacyAction = normalizeActionType(actorIdOrAction);
  const actorId = legacyAction ? state.players[state.currentPlayerIndex]?.id : actorIdOrAction as string;
  const action = normalizeActionType(legacyAction || actionOrTarget as string);
  const target = legacyAction ? actionOrTarget as string | undefined : targetId;
  const actor = playerById(state, actorId);

  if (!actor || actor.isEliminated || state.phase !== GamePhase.TURN_START || state.players[state.currentPlayerIndex]?.id !== actorId || !action) return state;
  if (actor.coins >= 10 && action !== ActionType.COUP) return state;
  if ((action === ActionType.COUP && actor.coins < 7) || (action === ActionType.ASSASSINATE && actor.coins < 3)) return state;
  if ([ActionType.STEAL, ActionType.ASSASSINATE, ActionType.COUP].includes(action) && !isLiveOpponent(state, actorId, target)) return state;

  const next = cloneState(state);
  const nextActor = playerById(next, actorId)!;
  if (action === ActionType.COUP) nextActor.coins -= 7;
  if (action === ActionType.ASSASSINATE) nextActor.coins -= 3;
  const targetName = target ? playerById(next, target)?.name : undefined;
  log(next, nextActor.name + " declares " + action + (targetName ? " on " + targetName : "") + ".");
  next.pendingAction = { actorId, action, targetId: target };

  if (action === ActionType.INCOME) {
    nextActor.coins += 1;
    log(next, nextActor.name + " gained 1 coin.");
    nextTurnInPlace(next);
    return commit(next);
  }
  if (action === ActionType.COUP) {
    next.phase = GamePhase.CHALLENGE_LOSS;
    next.playerToLoseInfluence = target!;
    next.waitingForResponseFrom = [target!];
    return commit(next);
  }

  next.phase = GamePhase.ACTION_DECLARED;
  next.waitingForResponseFrom = next.players.filter(player => player.id !== actorId && !player.isEliminated).map(player => player.id);
  return commit(next);
};

export const resolveActionSuccess = (state: GameState): GameState => {
  if (!state.pendingAction) return state;
  const next = cloneState(state);
  resolveActionSuccessInPlace(next);
  return commit(next);
};

export const handleChallenge = (state: GameState, challengerId: string): GameState => {
  if (!canRespond(state, challengerId) || ![GamePhase.ACTION_DECLARED, GamePhase.BLOCK_DECLARED].includes(state.phase)) return state;
  const next = cloneState(state);
  const challenger = playerById(next, challengerId)!;

  if (next.phase === GamePhase.ACTION_DECLARED && next.pendingAction) {
    const action = next.pendingAction;
    const actor = playerById(next, action.actorId)!;
    const required = new Map<ActionType, CardType>([
      [ActionType.TAX, CardType.DUKE], [ActionType.ASSASSINATE, CardType.ASSASSIN], [ActionType.STEAL, CardType.CAPTAIN], [ActionType.EXCHANGE, CardType.AMBASSADOR],
    ]).get(action.action);
    if (!required) return state;
    log(next, challenger.name + " challenges " + actor.name + "'s " + action.action + "!");
    const cardIndex = actor.cards.findIndex(card => !card.isRevealed && card.type === required);
    if (cardIndex >= 0) {
      log(next, actor.name + " reveals " + required + "! Challenge FAILED.");
      next.phase = GamePhase.CHALLENGE_LOSS;
      next.playerToLoseInfluence = challengerId;
      next.waitingForResponseFrom = [challengerId];
      next.deck.push(actor.cards[cardIndex].type);
      next.deck = shuffle(next.deck);
      actor.cards[cardIndex] = { ...actor.cards[cardIndex], id: generateId(), type: next.deck.pop()! };
    } else {
      log(next, actor.name + " DOES NOT have " + required + "! Challenge WON.");
      next.phase = GamePhase.CHALLENGE_LOSS;
      next.playerToLoseInfluence = actor.id;
      next.waitingForResponseFrom = [actor.id];
      next.pendingAction = null;
    }
    return commit(next);
  }

  if (next.phase === GamePhase.BLOCK_DECLARED && next.pendingBlock) {
    const blocker = playerById(next, next.pendingBlock.blockerId)!;
    const claim = next.pendingBlock.cardClaimed;
    log(next, challenger.name + " challenges " + blocker.name + "'s block with " + claim + "!");
    const cardIndex = blocker.cards.findIndex(card => !card.isRevealed && card.type === claim);
    if (cardIndex >= 0) {
      log(next, blocker.name + " reveals " + claim + "! Challenge FAILED.");
      next.phase = GamePhase.CHALLENGE_LOSS;
      next.playerToLoseInfluence = challengerId;
      next.waitingForResponseFrom = [challengerId];
      next.deck.push(blocker.cards[cardIndex].type);
      next.deck = shuffle(next.deck);
      blocker.cards[cardIndex] = { ...blocker.cards[cardIndex], id: generateId(), type: next.deck.pop()! };
    } else {
      log(next, blocker.name + " DOES NOT have " + claim + "! Challenge WON.");
      next.phase = GamePhase.CHALLENGE_LOSS;
      next.playerToLoseInfluence = blocker.id;
      next.waitingForResponseFrom = [blocker.id];
      next.pendingBlock = null;
    }
    return commit(next);
  }
  return state;
};

export const handleBlock = (state: GameState, blockerId: string, cardClaim: CardType): GameState => {
  if (!canRespond(state, blockerId) || state.phase !== GamePhase.ACTION_DECLARED || !state.pendingAction) return state;
  const action = state.pendingAction;
  const valid = (action.action === ActionType.FOREIGN_AID && cardClaim === CardType.DUKE)
    || (action.action === ActionType.STEAL && action.targetId === blockerId && [CardType.CAPTAIN, CardType.AMBASSADOR].includes(cardClaim))
    || (action.action === ActionType.ASSASSINATE && action.targetId === blockerId && cardClaim === CardType.CONTESSA);
  if (!valid) return state;

  const next = cloneState(state);
  log(next, playerById(next, blockerId)?.name + " blocks using " + cardClaim + ".");
  next.pendingBlock = { blockerId, cardClaimed: cardClaim };
  next.phase = GamePhase.BLOCK_DECLARED;
  next.waitingForResponseFrom = next.players.filter(player => player.id !== blockerId && !player.isEliminated).map(player => player.id);
  return commit(next);
};

export const handlePass = (state: GameState, playerId: string): GameState => {
  if (!canRespond(state, playerId)) return state;
  const next = cloneState(state);
  log(next, playerById(next, playerId)?.name + " chooses to PASS.");
  next.waitingForResponseFrom = next.waitingForResponseFrom.filter(id => id !== playerId);
  if (next.waitingForResponseFrom.length === 0) {
    if (next.phase === GamePhase.ACTION_DECLARED) resolveActionSuccessInPlace(next);
    else if (next.phase === GamePhase.BLOCK_DECLARED) {
      log(next, "Block stands. Action thwarted.");
      nextTurnInPlace(next);
    }
  }
  return commit(next);
};

export const handleLoseCard = (state: GameState, playerId: string, cardId: string): GameState => {
  if (state.phase !== GamePhase.CHALLENGE_LOSS || state.playerToLoseInfluence !== playerId || !canRespond(state, playerId)) return state;
  const player = playerById(state, playerId);
  const originalCard = player?.cards.find(card => card.id === cardId && !card.isRevealed);
  if (!player || !originalCard) return state;

  const next = cloneState(state);
  const nextPlayer = playerById(next, playerId)!;
  const card = nextPlayer.cards.find(candidate => candidate.id === cardId)!;
  card.isRevealed = true;
  log(next, nextPlayer.name + " lost influence: " + card.type + ".", 'danger');
  if (nextPlayer.cards.every(candidate => candidate.isRevealed)) {
    nextPlayer.isEliminated = true;
    nextPlayer.placement = next.players.filter(candidate => !candidate.isEliminated).length + 1;
    log(next, nextPlayer.name + " has been exiled!", 'danger');
  }

  if (next.pendingAction?.action === ActionType.COUP && next.pendingAction.targetId === playerId) nextTurnInPlace(next);
  else if (next.pendingAction?.action === ActionType.ASSASSINATE && next.pendingAction.targetId === playerId) nextTurnInPlace(next);
  else if (next.pendingBlock) {
    log(next, "Block stands. Action thwarted.");
    nextTurnInPlace(next);
  } else if (next.pendingAction) resolveActionSuccessInPlace(next);
  else nextTurnInPlace(next);
  return commit(next);
};

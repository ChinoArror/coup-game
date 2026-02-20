import { GameState, Player, Card, CardType, ActionType, GamePhase, GameLogEntry } from "../types";

// --- Constants ---
const COINS_TO_WIN = 999;
const INITIAL_COINS = 2;

// --- Helper Functions ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const shuffle = <T,>(array: T[]): T[] => {
  return array.sort(() => Math.random() - 0.5);
};

const createDeck = (): CardType[] => {
  const types = [CardType.DUKE, CardType.ASSASSIN, CardType.CAPTAIN, CardType.AMBASSADOR, CardType.CONTESSA];
  // 3 copies of each card (Standard Coup rules)
  let deck: CardType[] = [];
  types.forEach(t => {
    deck.push(t, t, t);
  });
  return shuffle(deck);
};

const createPlayer = (id: string, name: string, isAI: boolean, deck: CardType[]): Player => {
  const c1 = deck.pop()!;
  const c2 = deck.pop()!;
  return {
    id,
    name,
    isAI,
    coins: INITIAL_COINS,
    cards: [
      { id: generateId(), type: c1, isRevealed: false },
      { id: generateId(), type: c2, isRevealed: false }
    ],
    isEliminated: false
  };
};

const log = (state: GameState, text: string, type: GameLogEntry['type'] = 'info') => {
  state.logs.push({
    id: generateId(),
    text,
    type,
    timestamp: Date.now()
  });
};

// --- Core Logic ---

export const initializeGame = (): GameState => {
  const deck = createDeck();
  const human = createPlayer('human', 'You', false, deck);
  const ai1 = createPlayer('ai1', 'Gemini Alpha', true, deck);
  const ai2 = createPlayer('ai2', 'Deepseek Beta', true, deck);

  return {
    roomId: generateId(),
    turn: 1,
    currentPlayerIndex: 0,
    phase: GamePhase.TURN_START,
    players: [human, ai1, ai2],
    deck,
    pendingAction: null,
    pendingBlock: null,
    waitingForResponseFrom: [],
    playerToLoseInfluence: null,
    logs: [{ id: generateId(), text: "Game Started. Good luck.", type: 'info', timestamp: Date.now() }],
    winner: null,
    startedAt: Date.now()
  };
};

export const nextTurn = (state: GameState): GameState => {
  // Check win condition and placements
  const activePlayers = state.players.filter(p => !p.isEliminated);
  if (activePlayers.length === 1) {
    if (state.phase !== GamePhase.GAME_OVER) {
      activePlayers[0].placement = 1;
      state.phase = GamePhase.GAME_OVER;
      state.winner = activePlayers[0].name;
      log(state, `${activePlayers[0].name} wins the game!`, 'success');
    }
    return { ...state };
  }

  // Find next player who is not eliminated
  let nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  while (state.players[nextIndex].isEliminated) {
    nextIndex = (nextIndex + 1) % state.players.length;
  }

  return {
    ...state,
    currentPlayerIndex: nextIndex,
    phase: GamePhase.TURN_START,
    pendingAction: null,
    pendingBlock: null,
    waitingForResponseFrom: [],
    playerToLoseInfluence: null,
    turn: state.turn + 1
  };
};

export const handlePlayerAction = (state: GameState, action: ActionType, targetId?: string): GameState => {
  const actor = state.players[state.currentPlayerIndex];

  // Validation
  if (actor.coins >= 10 && action !== ActionType.COUP) {
    log(state, "You have 10+ coins. You MUST Coup.", 'alert');
    return state; // Invalid move
  }
  if (action === ActionType.COUP && actor.coins < 7) return state;
  if (action === ActionType.ASSASSINATE && actor.coins < 3) return state;

  log(state, `${actor.name} declares ${action}${targetId ? ` on ${state.players.find(p => p.id === targetId)?.name}` : ''}.`);

  const newState = { ...state, pendingAction: { actorId: actor.id, action, targetId } };

  // Payment costs are deducted immediately? In some rules yes, but if challenged successfully, coins return? 
  // Coup/Assassinate cost is spent. If Assassinate is blocked, coins spent. If Challenged and lost, coins spent?
  // Simplification: Deduct coins now.
  if (action === ActionType.COUP) newState.players[state.currentPlayerIndex].coins -= 7;
  if (action === ActionType.ASSASSINATE) newState.players[state.currentPlayerIndex].coins -= 3;

  // Next Phase logic
  if (action === ActionType.INCOME) {
    // Unblockable, unchallengeable
    newState.players[state.currentPlayerIndex].coins += 1;
    log(newState, `${actor.name} gained 1 coin.`);
    return nextTurn(newState);
  }

  if (action === ActionType.COUP) {
    // Unblockable, unchallengeable
    if (!targetId) return state;
    newState.phase = GamePhase.CHALLENGE_LOSS;
    newState.playerToLoseInfluence = targetId;
    newState.waitingForResponseFrom = [targetId];
    return newState;
  }

  // All other actions can be challenged
  newState.phase = GamePhase.ACTION_DECLARED;
  newState.waitingForResponseFrom = state.players
    .filter(p => p.id !== actor.id && !p.isEliminated)
    .map(p => p.id);

  return newState;
};

export const resolveActionSuccess = (state: GameState): GameState => {
  const action = state.pendingAction!;
  const actorIndex = state.players.findIndex(p => p.id === action.actorId);
  const targetIndex = action.targetId ? state.players.findIndex(p => p.id === action.targetId) : -1;

  switch (action.action) {
    case ActionType.FOREIGN_AID:
      state.players[actorIndex].coins += 2;
      log(state, `${state.players[actorIndex].name} collected Foreign Aid.`);
      break;
    case ActionType.TAX:
      state.players[actorIndex].coins += 3;
      log(state, `${state.players[actorIndex].name} collected Tax.`);
      break;
    case ActionType.STEAL:
      if (targetIndex !== -1) {
        const stolen = Math.min(2, state.players[targetIndex].coins);
        state.players[targetIndex].coins -= stolen;
        state.players[actorIndex].coins += stolen;
        log(state, `${state.players[actorIndex].name} stole ${stolen} from ${state.players[targetIndex].name}.`);
      }
      break;
    case ActionType.EXCHANGE:
      // Simplified exchange: draw 2, shuffle, remove 2 (Logic is complex for UI, simplified here to just shuffling cards for variety)
      // In a real app, we need a modal to pick cards. 
      // For this demo: "Ambassador shuffles your cards with the deck."
      const player = state.players[actorIndex];
      const currentCards = player.cards.filter(c => !c.isRevealed).map(c => c.type);
      const newCards = [state.deck.pop()!, state.deck.pop()!];
      state.deck.push(...currentCards); // Put old back
      state.deck = shuffle(state.deck); // Shuffle
      // Assign new cards (keeping IDs logic simple)
      const kept1 = newCards[0] || state.deck.pop()!;
      const kept2 = newCards[1] || state.deck.pop()!;

      // Reset player cards (keeping revealed status if they had revealed ones? No, only unrevealed are exchanged)
      // Rebuilding player hand
      const revealed = player.cards.filter(c => c.isRevealed);
      player.cards = [...revealed, { id: generateId(), type: kept1, isRevealed: false }];
      if (currentCards.length > 1) {
        player.cards.push({ id: generateId(), type: kept2, isRevealed: false });
      }
      log(state, `${player.name} exchanged cards with the Court deck.`);
      break;
    case ActionType.ASSASSINATE:
      if (targetIndex !== -1) {
        state.phase = GamePhase.CHALLENGE_LOSS;
        state.playerToLoseInfluence = state.players[targetIndex].id;
        state.waitingForResponseFrom = [state.players[targetIndex].id];
        log(state, "Assassination successful! Target must lose influence.");
        return state; // Do not go to next turn yet
      }
      break;
  }

  return nextTurn(state);
};

export const handleChallenge = (state: GameState, challengerId: string): GameState => {
  const challenger = state.players.find(p => p.id === challengerId)!;

  if (state.phase === GamePhase.ACTION_DECLARED) {
    const actorId = state.pendingAction!.actorId;
    const actor = state.players.find(p => p.id === actorId)!;
    const action = state.pendingAction!.action;

    // Determine required card
    let requiredCard = CardType.UNKNOWN;

    // We must handle string comparisons robustly because AI might send "STEAL" or "Steal"
    const actionUpper = action.toUpperCase();

    if (actionUpper === 'TAX') requiredCard = CardType.DUKE;
    if (actionUpper === 'ASSASSINATE') requiredCard = CardType.ASSASSIN;
    if (actionUpper === 'STEAL') requiredCard = CardType.CAPTAIN;
    if (actionUpper === 'EXCHANGE') requiredCard = CardType.AMBASSADOR;

    if (actionUpper === 'FOREIGN_AID' || actionUpper === 'FOREIGN AID' || actionUpper === 'INCOME' || actionUpper === 'COUP') {
      log(state, `${challenger.name} tried to challenge ${action}, which is unchallengeable!`, 'alert');
      return state;
    }

    log(state, `${challenger.name} challenges ${actor.name}'s ${action}!`);

    const hasCard = actor.cards.some(c => !c.isRevealed && c.type === requiredCard);

    if (hasCard) {
      log(state, `${actor.name} reveals ${requiredCard}! Challenge FAILED.`);
      // Challenger loses influence
      state.phase = GamePhase.CHALLENGE_LOSS;
      state.playerToLoseInfluence = challengerId;
      state.waitingForResponseFrom = [challengerId];

      // Actor shuffles revealed card back and gets new one
      const cardIdx = actor.cards.findIndex(c => !c.isRevealed && c.type === requiredCard);
      state.deck.push(actor.cards[cardIdx].type);
      state.deck = shuffle(state.deck);
      actor.cards[cardIdx].type = state.deck.pop()!;
      actor.cards[cardIdx].id = generateId(); // New ID to prevent tracking

      // If challenge failed, the action usually proceeds. 
      // BUT, we first need to resolve the influence loss of the challenger.
      // We set a flag in state to resume action after influence loss?
      // Or simply resolve action now if it doesn't require further input?
      // To simplify: The action SUCCEEDS immediately after the penalty is paid. 
      // We'll handle this in the loseCard function.
    } else {
      log(state, `${actor.name} DOES NOT have ${requiredCard}! Challenge WON.`);
      // Actor loses influence
      state.phase = GamePhase.CHALLENGE_LOSS;
      state.playerToLoseInfluence = actorId;
      state.waitingForResponseFrom = [actorId];
      // Action is canceled
      state.pendingAction = null;
    }
  } else if (state.phase === GamePhase.BLOCK_DECLARED) {
    const blockerId = state.pendingBlock!.blockerId;
    const blocker = state.players.find(p => p.id === blockerId)!;
    const claim = state.pendingBlock!.cardClaimed;

    log(state, `${challenger.name} challenges ${blocker.name}'s block with ${claim}!`);

    const hasCard = blocker.cards.some(c => !c.isRevealed && c.type === claim);

    if (hasCard) {
      log(state, `${blocker.name} reveals ${claim}! Challenge FAILED.`);
      // Challenger loses influence
      state.phase = GamePhase.CHALLENGE_LOSS;
      state.playerToLoseInfluence = challengerId;
      state.waitingForResponseFrom = [challengerId];

      // Swap card
      const cardIdx = blocker.cards.findIndex(c => !c.isRevealed && c.type === claim);
      state.deck.push(blocker.cards[cardIdx].type);
      state.deck = shuffle(state.deck);
      blocker.cards[cardIdx].type = state.deck.pop()!;

      // Block stands, Action fails. 
      state.pendingAction = null;
    } else {
      log(state, `${blocker.name} DOES NOT have ${claim}! Challenge WON.`);
      state.phase = GamePhase.CHALLENGE_LOSS;
      state.playerToLoseInfluence = blockerId;
      state.waitingForResponseFrom = [blockerId];
      // Block fails, Action proceeds.
      state.pendingBlock = null;
      // We will execute the action after the penalty in `loseCard`.
    }
  }

  return { ...state };
};

export const handleBlock = (state: GameState, blockerId: string, cardClaim: CardType): GameState => {
  log(state, `${state.players.find(p => p.id === blockerId)?.name} blocks using ${cardClaim}.`);
  state.pendingBlock = { blockerId, cardClaimed: cardClaim };
  state.phase = GamePhase.BLOCK_DECLARED;
  state.waitingForResponseFrom = state.players
    .filter(p => p.id !== blockerId && !p.isEliminated)
    .map(p => p.id);
  return { ...state };
};

export const handlePass = (state: GameState, playerId: string): GameState => {
  const player = state.players.find(p => p.id === playerId);
  if (player) {
    log(state, `${player.name} chooses to PASS.`);
  }
  const newState = {
    ...state,
    waitingForResponseFrom: state.waitingForResponseFrom.filter(id => id !== playerId)
  };
  return newState;
};

export const handleLoseCard = (state: GameState, playerId: string, cardId: string): GameState => {
  const player = state.players.find(p => p.id === playerId)!;
  const card = player.cards.find(c => c.id === cardId);

  if (card) {
    card.isRevealed = true;
    log(state, `${player.name} lost influence: ${card.type}.`, 'danger');
  }

  // Check elimination
  const activeCards = player.cards.filter(c => !c.isRevealed);
  if (activeCards.length === 0) {
    player.isEliminated = true;

    // Determine placement (if 3 players alive before this, this player gets 3. If 2, they get 2)
    const aliveCount = state.players.filter(p => !p.isEliminated).length;
    player.placement = aliveCount + 1; // 2 alive -> this player is 3rd. 1 alive -> this player is 2nd.

    log(state, `${player.name} has been exiled!`, 'danger');
  }

  // Determine what happens next based on what led to this loss

  // 1. Was it a Coup?
  if (state.pendingAction?.action === ActionType.COUP && state.pendingAction.targetId === playerId) {
    return nextTurn(state);
  }

  // 2. Was it a successful Assassination (Target lost card)?
  if (state.pendingAction?.action === ActionType.ASSASSINATE && state.pendingAction.targetId === playerId && state.phase === GamePhase.CHALLENGE_LOSS) {
    return nextTurn(state);
  }

  // 3. Was it a failed Challenge against an Action? (Challenger lost card, Action proceeds)
  // If pendingAction exists and pendingBlock is null, we were in ACTION_DECLARED
  if (state.pendingAction && !state.pendingBlock) {
    // If the action was Assassinate, and the challenger was NOT the target, the target still has a chance to block.
    // If the action was Assassinate and challenger WAS target, they lost a card for challenging. 
    // Can they still block? Rules say: "If you challenge, you cannot block."
    // So action resolves.
    return resolveActionSuccess(state);
  }

  // 4. Was it a failed Challenge against a Block? (Challenger lost card, Block stands)
  if (state.pendingBlock) {
    // Block stands. Action canceled.
    log(state, "Block stands. Action thwarted.");
    return nextTurn(state);
  }

  // 5. Was it a successful Challenge against an Action? (Actor lost card, Action canceled)
  // We detected this if pendingAction was set to null in handleChallenge? 
  // Wait, in handleChallenge we set pendingAction = null if challenge won.
  // So if pendingAction is null, turn ends.
  if (!state.pendingAction && !state.pendingBlock) {
    return nextTurn(state);
  }

  // 6. Successful Challenge against Block (Blocker lost card, Action proceeds)
  // In handleChallenge, if Block failed, we set pendingBlock to null, but kept pendingAction.
  if (state.pendingAction && state.phase === GamePhase.CHALLENGE_LOSS) {
    return resolveActionSuccess(state);
  }

  return nextTurn(state);
};
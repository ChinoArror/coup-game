import { ActionType, CardType, GamePhase, type GameState, type Player } from '../types';

export const getPublicAIState = (gameState: GameState, aiPlayerId: string) => ({
  phase: gameState.phase,
  myInfo: gameState.players.find(player => player.id === aiPlayerId),
  opponents: gameState.players.filter(player => player.id !== aiPlayerId).map(player => ({
    id: player.id, name: player.name, coins: player.coins,
    influenceCount: player.cards.filter(card => !card.isRevealed).length,
    revealedCards: player.cards.filter(card => card.isRevealed).map(card => card.type),
  })),
  history: gameState.logs.slice(-6), pendingAction: gameState.pendingAction, pendingBlock: gameState.pendingBlock,
});

/** Shared decision prompt for both the legacy game and room AI seats. */
export const createAIDecisionRequest = (gameState: GameState, aiPlayer: Player) => {
  const publicState = getPublicAIState(gameState, aiPlayer.id);
  let goal = ''; let validOptions = '';
  if (gameState.phase === GamePhase.TURN_START) {
    goal = 'Choose an action. You generally want to accumulate coins to Coup (7 coins) or use character abilities (Tax, Steal, Assassinate). If you have 10+ coins, you MUST Coup.';
    validOptions = `Valid Actions: ${Object.values(ActionType).join(', ')}. NOTE: If coins >= 10, only COUP is allowed.`;
  } else if (gameState.pendingAction?.targetId === aiPlayer.id && !gameState.pendingBlock) {
    goal = `You are being targeted by ${gameState.pendingAction.action}. You MUST choose to BLOCK with a valid counter claim or PASS to allow it.`;
    validOptions = gameState.pendingAction.action === ActionType.ASSASSINATE ? 'BLOCK (Claim Contessa), PASS (Allow)' : gameState.pendingAction.action === ActionType.STEAL ? 'BLOCK (Claim Captain/Ambassador), PASS (Allow)' : 'PASS';
  } else if (gameState.phase === GamePhase.ACTION_DECLARED) {
    goal = `Player ${gameState.pendingAction?.actorId} declared ${gameState.pendingAction?.action}. Evaluate if they are lying. You MUST choose to either CHALLENGE or PASS. If the action is Foreign Aid, you can BLOCK (claiming Duke).`;
    validOptions = 'CHALLENGE, PASS' + (gameState.pendingAction?.action === ActionType.FOREIGN_AID ? ', BLOCK (claim Duke)' : '');
  } else if (gameState.phase === GamePhase.BLOCK_DECLARED) {
    goal = `Player ${gameState.pendingBlock?.blockerId} blocked using ${gameState.pendingBlock?.cardClaimed}. Evaluate if they actually have that card. You MUST choose to either CHALLENGE or PASS.`;
    validOptions = 'CHALLENGE, PASS';
  } else if (gameState.phase === GamePhase.CHALLENGE_LOSS) {
    goal = 'You lost a challenge or were Couped. You must choose a card ID to lose (reveal).';
    validOptions = `Card IDs: ${aiPlayer.cards.filter(card => !card.isRevealed).map(card => card.id).join(', ')}`;
  }
  const rules = 'CARDS: Duke, Assassin, Captain, Ambassador, Contessa; three of each. Goal: be the last player with influence. Income +1 is safe. Foreign Aid +2 is blocked by Duke. Tax +3 claims Duke. Steal +2 claims Captain and is blocked by Captain or Ambassador. Assassinate costs 3 and claims Assassin, blocked by Contessa. Exchange claims Ambassador. Coup costs 7, is unblockable and mandatory at 10+ coins. Claimed actions and blocks can be challenged: a truthful claimant replaces their revealed card and the challenger loses influence; a liar loses influence and the action fails.';
  const format = `Return ONLY one valid JSON object with: {"type":"ACTION"|"CHALLENGE"|"BLOCK"|"PASS"|"LOSE_CARD","action":"ActionType","targetId":"player id","cardToLose":"card id","blockCard":"CardType","thoughtProcess":"brief reasoning"}. Goal: ${goal}. Valid options: ${validOptions}.`;
  const isBeta = aiPlayer.id === 'ai2' || aiPlayer.id === 'room-ai-2';
  const personality = isBeta ? 'You are Deepseek Beta, a highly analytical, ruthless, calculating Coup player. Calculate risks, challenge only when strongly justified, and pursue Assassination or Coup while preserving influence. Think concisely inside <think> tags before the JSON.' : 'You are Gemini Alpha, an aggressive but prudent Coup player. Use Tax, Steal and Assassinate when advantageous, bluff strategically, avoid blind challenges, and survive at all costs. Put one or two concise sentences in thoughtProcess.';
  return {
    systemInstruction: `${personality}\nYour ID is ${aiPlayer.id}.\n${rules}\n${format}`,
    userMessage: `Game State: ${JSON.stringify(publicState)}. Legal opposing target IDs: ${gameState.players.filter(player => player.id !== aiPlayer.id && !player.isEliminated).map(player => player.id).join(', ')}. Never target yourself or an eliminated player. Make your move now.`,
  };
};

export const validBlockCards = [CardType.DUKE, CardType.CAPTAIN, CardType.AMBASSADOR, CardType.CONTESSA];

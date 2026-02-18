import { GameState, AIDecision, Player, CardType, ActionType, GamePhase } from "../types";

// DeepSeek API Configuration
const apiKey = 'sk-a23f523a20364e86bb11a28db06c4eee';
const API_URL = "https://api.deepseek.com/chat/completions";

// Helper to sanitize state for AI (hide opponent cards)
const getPublicState = (gameState: GameState, aiPlayerId: string) => {
  return {
    phase: gameState.phase,
    myInfo: gameState.players.find(p => p.id === aiPlayerId),
    opponents: gameState.players.filter(p => p.id !== aiPlayerId).map(p => ({
      id: p.id,
      name: p.name,
      coins: p.coins,
      influenceCount: p.cards.filter(c => !c.isRevealed).length,
      revealedCards: p.cards.filter(c => c.isRevealed).map(c => c.type)
    })),
    history: gameState.logs.slice(-6), // Last 6 logs for context
    pendingAction: gameState.pendingAction,
    pendingBlock: gameState.pendingBlock
  };
};

export const getAIDecision = async (
  gameState: GameState, 
  aiPlayer: Player
): Promise<AIDecision> => {
  
  const publicState = getPublicState(gameState, aiPlayer.id);
  
  // Construct a prompt based on the specific phase
  let goal = "";
  let validOptions = "";

  if (gameState.phase === GamePhase.TURN_START) {
    goal = "Choose an action. You generally want to accumulate coins to Coup (7 coins) or use character abilities (Tax, Steal, Assassinate). If you have 10+ coins, you MUST Coup.";
    validOptions = `Valid Actions: ${Object.values(ActionType).join(', ')}. NOTE: If coins >= 10, only COUP is allowed.`;
  } else if (gameState.phase === GamePhase.ACTION_DECLARED) {
    goal = `Player ${gameState.pendingAction?.actorId} declared ${gameState.pendingAction?.action}. Evaluate if they are lying. You MUST choose to either CHALLENGE or PASS. If the action is Foreign Aid, you can BLOCK (claiming Duke).`;
    validOptions = "CHALLENGE, PASS" + (gameState.pendingAction?.action === ActionType.FOREIGN_AID ? ", BLOCK (claim Duke)" : "");
  } else if (gameState.phase === GamePhase.BLOCK_DECLARED) {
    goal = `Player ${gameState.pendingBlock?.blockerId} blocked using ${gameState.pendingBlock?.cardClaimed}. Evaluate if they actually have that card. You MUST choose to either CHALLENGE or PASS.`;
    validOptions = "CHALLENGE, PASS";
  } else if (gameState.phase === GamePhase.CHALLENGE_LOSS) {
    goal = "You lost a challenge or were Couped. You must choose a card ID to lose (reveal).";
    validOptions = `Card IDs: ${aiPlayer.cards.filter(c => !c.isRevealed).map(c => c.id).join(', ')}`;
  } else if (gameState.pendingAction?.targetId === aiPlayer.id && !gameState.pendingBlock) {
     goal = `You are being targeted by ${gameState.pendingAction.action}. You MUST choose to BLOCK (claim a counter card) or ALLOW (Pass).`;
     if (gameState.pendingAction.action === ActionType.ASSASSINATE) validOptions = "BLOCK (Claim Contessa), PASS (Allow)";
     else if (gameState.pendingAction.action === ActionType.STEAL) validOptions = "BLOCK (Claim Captain/Ambassador), PASS (Allow)";
     else validOptions = "PASS";
  }

  const systemInstruction = `
    You are an expert AI player for the board game Coup.
    Your ID is ${aiPlayer.id} (${aiPlayer.name}).
    
    *** GAME RULES SUMMARY ***
    1. CARDS: Duke, Assassin, Captain, Ambassador, Contessa. (3 of each in deck).
    2. GOAL: Be the last player with influence (cards).
    3. ACTIONS & CLAIMS:
       - Income (+1): No claim. Safe.
       - Foreign Aid (+2): No claim. Blocked by DUKE.
       - Tax (+3): Claims DUKE.
       - Steal (+2 from target): Claims CAPTAIN. Blocked by CAPTAIN or AMBASSADOR.
       - Assassinate (pay 3, kill card): Claims ASSASSIN. Blocked by CONTESSA.
       - Exchange (swap cards): Claims AMBASSADOR.
       - Coup (pay 7, kill card): Unblockable. Mandatory at 10+ coins.
    4. CHALLENGES:
       - Any action claiming a character (Tax, Steal, Assassinate, Exchange) can be Challenged.
       - Any Block can be Challenged.
       - If Challenged:
         - If you have the card: Reveal it, shuffle it back, draw new one. Challenger loses a card.
         - If you DO NOT have it: You lose a card. Action fails.
    
    *** DECISION STRATEGY ***
    1. BLUFFING: You are allowed to lie.
    2. CHALLENGING: 
       - If an opponent takes a powerful action (Tax, Assassinate, Steal) and you suspect they lack the card based on probability or past reveals, CHALLENGE them.
       - Do not be too passive. If someone Taxes 3 times in a row, they might be lying.
    3. SPEED: Make your decision quickly and decisively.
    
    *** OUTPUT FORMAT ***
    Return ONLY a valid JSON object. No markdown.
    Structure:
    {
      "type": "ACTION" | "CHALLENGE" | "BLOCK" | "PASS" | "LOSE_CARD",
      "payload": {
        "action": "string (ActionType)",
        "targetId": "string (Player ID)",
        "cardToLose": "string (Card ID)",
        "blockCard": "string (CardType)"
      },
      "thoughtProcess": "Very brief reasoning (max 1 sentence)."
    }

    Current Context:
    Goal: ${goal}
    Valid Options: ${validOptions}
  `;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-reasoner",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `Game State: ${JSON.stringify(publicState)}. Make your move now.` }
        ],
        temperature: 0.6, // Balanced for game logic
        response_format: { type: "json_object" } 
      })
    });

    if (!response.ok) {
        throw new Error(`DeepSeek API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) throw new Error("Empty response from DeepSeek");

    // Clean potential markdown or reasoning logs if they leak into content
    // deepseek-reasoner might output thought chains, but usually inside separate fields or if forced to JSON, strictly JSON.
    // We add a regex fallback to extract JSON just in case.
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AIDecision;
    } else {
        return JSON.parse(content) as AIDecision;
    }

  } catch (error) {
    console.error("AI Error:", error);
    // Fallback safe move to prevent game freeze
    return { type: 'PASS', thoughtProcess: "Connection error, passing turn." };
  }
};
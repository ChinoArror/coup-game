import { GameState, AIDecision, Player, CardType, ActionType, GamePhase } from "../types";

// Proxy to Cloudflare Worker API
const API_URL = "/api/ai";

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

  const baseRules = `
    *** GAME RULES SUMMARY ***
    1. CARDS: Duke, Assassin, Captain, Ambassador, Contessa. (3 of each in deck).
    2. GOAL: Be the last player with influence (cards). KILL YOUR OPPONENTS.
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
  `;

  const jsonFormat = `
    Structure (Flat JSON):
    {
      "type": "ACTION" | "CHALLENGE" | "BLOCK" | "PASS" | "LOSE_CARD",
      "action": "string (ActionType, e.g. TAX, STEAL, ASSASSINATE, FOREIGN_AID, INCOME, COUP)",
      "targetId": "string (Player ID, if acting on someone)",
      "cardToLose": "string (Card ID, if losing a card)",
      "blockCard": "string (CardType, e.g. DUKE, CONTESSA, CAPTAIN, AMBASSADOR if blocking)",
      "thoughtProcess": "Very brief reasoning (max 1 sentence)."
    }

    Current Context:
    Goal: ${goal}
    Valid Options: ${validOptions}
  `;

  let systemInstruction = "";

  if (aiPlayer.name === "Deepseek Beta") {
    systemInstruction = `
    You are Deepseek Beta, a highly analytical, ruthless, and calculating AI player for the board game Coup.
    Your ID is ${aiPlayer.id}.
    ${baseRules}
    
    *** DECISION STRATEGY: CALCULATED ASSASSIN ***
    1. LOGICAL BLUFFING: You calculate probabilities. Lie if the risk is low, but be convincing.
    2. STRATEGIC CHALLENGES (CRITICAL):
       - If an opponent takes a powerful action (Tax, Assassinate, Steal), calculate the chance they are lying based on past actions. DO NOT ALWAYS PASS. Challenge if suspicious!
       - If someone is gaining too much wealth, forcefully stop them by stealing or challenging.
       - If you are Targeted by ASSASSINATE or STEAL, ALWAYS try to BLOCK or CHALLENGE. Never just PASS and die.
    3. ENDGAME: Secure 3 coins for Assassination or 7 for Coup early. 

    *** OUTPUT FORMAT ***
    You MUST mathematically and psychologically analyze the board state inside <think>...</think> tags BEFORE returning JSON.
    Keep your <think> phase concise, deep, and focused on the immediate threat to ensure your thinking speed stays around 20 seconds.
    After your <think> tags, return ONLY a valid JSON object. No markdown.
    ${jsonFormat}
      `;
  } else {
    systemInstruction = `
    You are Gemini Alpha, a highly unpredictable, aggressive, and fast AI player for the board game Coup.
    Your ID is ${aiPlayer.id}.
    ${baseRules}

    *** DECISION STRATEGY: CHAOSTIC AGGRESSOR ***
    1. EXTREME AGGRESSION: You love to act boldly. Use TAX, STEAL, and ASSASSINATE frequently. Always bluff if needed!
    2. FREQUENT CHALLENGES (CRITICAL):
       - You hate letting opponents get free money. Challenge their TAX or BLOCK their FOREIGN_AID aggressively!
       - NEVER just sit there and PASS. If an opponent attacks you (Assassinate/Steal), you MUST BLOCK (claim the counter card) or CHALLENGE. Passing is cowardice! 
    3. WINNING: Your main joy is killing opponents. If you have 3+ coins, use ASSASSINATE. If 7+, COUP. 

    *** OUTPUT FORMAT ***
    Think deeply about the psychological state of the game. Write a thorough 1-2 sentence analysis inside the "thoughtProcess" JSON field.
    Return ONLY a valid JSON object. Do not include markdown formatting like \`\`\`json.
    ${jsonFormat}
      `;
  }

  try {
    const startTime = Date.now();

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        aiName: aiPlayer.name,
        systemInstruction,
        userMessage: `Game State: ${JSON.stringify(publicState)}. Make your move now.`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.content;

    if (!content) throw new Error("Empty response from Proxy");

    // Remove DeepSeek <think> blocks if present
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/ig, '').trim();

    let parsed: any;
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(cleanContent);
    }

    console.log(`[AI Response - ${aiPlayer.name}]:`, parsed);

    // Enforce 20-30s thinking time for maximum immersion and perceived deep thought
    const elapsed = Date.now() - startTime;
    const targetThinkTime = Math.floor(Math.random() * 10000) + 20000; // Random between 20s and 30s
    if (elapsed < targetThinkTime) {
      await new Promise(resolve => setTimeout(resolve, targetThinkTime - elapsed));
    }

    // Normalize into AIDecision (since we flattened the prompt)
    return {
      type: parsed.type,
      payload: {
        action: parsed.action || parsed.payload?.action,
        targetId: parsed.targetId || parsed.payload?.targetId,
        cardToLose: parsed.cardToLose || parsed.payload?.cardToLose,
        blockCard: parsed.blockCard || parsed.payload?.blockCard
      },
      thoughtProcess: parsed.thoughtProcess
    } as AIDecision;

  } catch (error: any) {
    console.error("AI Error:", error);
    alert(`[SYSTEM ALERT] AI (${aiPlayer.name}) crashed during thought process!\n\nReason: ${error.message}\n\nThis usually happens if your API Key in Cloudflare Secrets is missing/invalid, or the Model name is wrong. The AI will now skip its turn to prevent crashing the game.`);
    // Fallback safe move to prevent game freeze
    return { type: 'PASS', thoughtProcess: "Connection error, passing turn." };
  }
};
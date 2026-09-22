import { type AIDecision, type GameState, type Player } from '../types';
import { createAIDecisionRequest } from './aiPrompt';

const API_URL = '/api/ai';

export const getPlayerSlot = (playerId: string): 'alapha' | 'beta' => playerId === 'ai1' ? 'alapha' : 'beta';

export const getAIDecision = async (gameState: GameState, aiPlayer: Player, signal?: AbortSignal): Promise<AIDecision> => {
  const request = createAIDecisionRequest(gameState, aiPlayer);
  try {
    const response = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSlot: getPlayerSlot(aiPlayer.id), ...request }), signal,
    });
    if (!response.ok) throw new Error(`API Error: ${response.status} - ${await response.text()}`);
    const content = (await response.json()).content as string;
    if (!content) throw new Error('Empty response from Proxy');
    const clean = content.replace(/<think>[\s\S]*?<\/think>/ig, '').trim();
    const parsed = JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0] || clean);
    return {
      type: parsed.type,
      payload: {
        action: parsed.action || parsed.payload?.action,
        targetId: parsed.targetId || parsed.payload?.targetId,
        cardToLose: parsed.cardToLose || parsed.payload?.cardToLose,
        blockCard: parsed.blockCard || parsed.payload?.blockCard,
      },
      thoughtProcess: parsed.thoughtProcess,
    } as AIDecision;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    console.error('AI Error:', error);
    return { type: 'PASS', thoughtProcess: 'Connection error, passing turn.' };
  }
};

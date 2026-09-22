import { ActionType, GamePhase, type GameState } from './types';
import { handleLoseCard, handlePass, handlePlayerAction } from './utils/gameEngine';

type RoomConfig = { stepLimitMs?: number; totalLimitMs?: number };
type StoredRoom = { state: GameState; config: RoomConfig; remaining: Record<string, number>; turnStartedAt: number };

export class RoomGame {
  constructor(private state: any, private env: any) {}
  async fetch(request: Request) {
    const body = await request.json() as any;
    const stored = await this.state.storage.get('room') as StoredRoom | undefined;
    if (body.type === 'initialize') {
      await this.state.storage.put('room', body.room);
      await this.schedule(body.room);
      return Response.json({ state: body.room.state });
    }
    if (!stored) return Response.json({ error: 'Room has not started' }, { status: 409 });
    if (body.type === 'state') return Response.json({ state: stored.state, remaining: stored.remaining });
    const actor = body.actorId as string;
    let next = stored.state;
    if (body.type === 'pass') next = handlePass(next, actor);
    if (body.type === 'action') next = handlePlayerAction(next, actor, body.action as ActionType, body.targetId);
    if (body.type === 'lose') next = handleLoseCard(next, actor, body.cardId);
    const updated = { ...stored, state: next, turnStartedAt: Date.now() };
    await this.state.storage.put('room', updated);
    await this.schedule(updated);
    return Response.json({ state: next, remaining: updated.remaining });
  }
  async alarm() {
    const stored = await this.state.storage.get('room') as StoredRoom | undefined;
    if (!stored || stored.state.phase === GamePhase.GAME_OVER) return;
    const actor = stored.state.players[stored.state.currentPlayerIndex];
    if (!actor || actor.isAI) return;
    let next = stored.state;
    if (stored.state.phase === GamePhase.TURN_START) {
      const target = stored.state.players.find(player => player.id !== actor.id && !player.isEliminated)?.id;
      next = actor.coins >= 10 ? handlePlayerAction(next, actor.id, ActionType.COUP, target) : handlePlayerAction(next, actor.id, ActionType.INCOME);
    } else if (stored.state.phase === GamePhase.CHALLENGE_LOSS) {
      const card = actor.cards.find((candidate: any) => !candidate.isRevealed);
      if (card) next = handleLoseCard(next, actor.id, card.id);
    } else next = handlePass(next, actor.id);
    const updated = { ...stored, state: next, turnStartedAt: Date.now() };
    await this.state.storage.put('room', updated);
    await this.schedule(updated);
  }
  private async schedule(room: StoredRoom) {
    const actor = room.state.players[room.state.currentPlayerIndex];
    if (!actor || actor.isAI) return;
    const step = room.config.stepLimitMs || Number.MAX_SAFE_INTEGER;
    const total = room.remaining[actor.id] ?? Number.MAX_SAFE_INTEGER;
    await this.state.storage.setAlarm(Date.now() + Math.min(step, total));
  }
}

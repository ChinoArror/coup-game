import { ActionType, CardType, GamePhase, type GameState } from './types';
import { callAIChannel } from './services/aiGateway';
import { createAIDecisionRequest } from './services/aiPrompt';
import { projectRoomState } from './services/roomState';
import { handleBlock, handleChallenge, handleLoseCard, handlePass, handlePlayerAction } from './utils/gameEngine';

type RoomConfig = { stepLimitMs?: number; totalLimitMs?: number };
type StoredRoom = {
  roomId: string;
  owner: { uuid: string; isAdmin: boolean };
  aiChannels: string[];
  state: GameState;
  config: RoomConfig;
  remaining: Record<string, number>;
  phaseStartedAt: number;
  revision: number;
};
type RoomAction = {
  type: 'action' | 'pass' | 'lose' | 'challenge' | 'block';
  revision: number;
  action?: ActionType;
  targetId?: string;
  cardId?: string;
  cardClaim?: CardType;
  clientActionId?: string;
};

const json = (data: unknown, status = 200) => Response.json(data, { status });
const finiteLimit = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

/** The deterministic, phase-safe move used when a human's clock expires. */
export const timeoutTransition = (state: GameState): GameState => {
  const current = state.players[state.currentPlayerIndex];
  const responderId = state.phase === GamePhase.CHALLENGE_LOSS ? state.playerToLoseInfluence : state.waitingForResponseFrom[0];
  const responder = state.players.find(player => player.id === responderId);
  if (state.phase === GamePhase.CHALLENGE_LOSS && responder) {
    const card = responder.cards.find(candidate => !candidate.isRevealed);
    return card ? handleLoseCard(state, responder.id, card.id) : state;
  }
  if (state.phase === GamePhase.TURN_START && current) {
    const target = state.players.find(player => player.id !== current.id && !player.isEliminated)?.id;
    return current.coins >= 10
      ? handlePlayerAction(state, current.id, ActionType.COUP, target)
      : handlePlayerAction(state, current.id, ActionType.INCOME);
  }
  return responder ? handlePass(state, responder.id) : state;
};

export class RoomGame {
  private sockets = new Map<WebSocket, string>();

  constructor(private state: any, private env: any) {}

  async fetch(request: Request) {
    const actorId = request.headers.get('X-Room-Actor');
    if (request.headers.get('Upgrade') === 'websocket') return this.connect(actorId);
    const body = await request.json() as any;
    if (body.type === 'initialize') {
      if (request.headers.get('X-Room-Internal') !== '1' || !body.room) return json({ error: 'Forbidden' }, 403);
      const room: StoredRoom = { ...body.room, phaseStartedAt: Date.now(), revision: body.room.state.revision || 0 };
      await this.save(room);
      await this.publish(room);
      await this.schedule(room);
      await this.maybeRunAi(room);
      return json({ state: projectRoomState(room.state, actorId || '') });
    }
    const room = await this.load();
    if (!room) return json({ error: 'Room has not started' }, 409);
    if (!actorId || !room.state.players.some(player => player.id === actorId && !player.isAI)) return json({ error: 'Forbidden' }, 403);
    if (body.type === 'state') return json(this.view(room, actorId));
    return this.apply(room, actorId, body as RoomAction);
  }

  async alarm() {
    const room = await this.load();
    if (!room || room.state.phase === GamePhase.GAME_OVER) return;
    const timedActor = this.timedActor(room.state);
    if (!timedActor || timedActor.isAI) return;
    const deadline = this.deadline(room, timedActor.id);
    if (deadline && deadline > Date.now()) return this.state.storage.setAlarm(deadline);
    const charged = this.chargeClock(room, timedActor.id);
    const next = timeoutTransition(charged.state);
    if (next === charged.state) return;
    const updated = this.advance({ ...charged, state: next });
    await this.save(updated);
    await this.publish(updated);
    await this.schedule(updated);
    await this.maybeRunAi(updated);
  }

  private async connect(actorId: string | null) {
    const room = await this.load();
    if (!room || !actorId || !room.state.players.some(player => player.id === actorId && !player.isAI)) return new Response('Forbidden', { status: 403 });
    const pair = new (globalThis as any).WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sockets.set(server, actorId);
    server.send(JSON.stringify({ type: 'state', ...this.view(room, actorId) }));
    server.addEventListener('message', event => { void this.onSocketMessage(server, actorId, event.data); });
    server.addEventListener('close', () => this.sockets.delete(server));
    server.addEventListener('error', () => this.sockets.delete(server));
    return new Response(null, { status: 101, webSocket: client } as any);
  }

  private async onSocketMessage(socket: WebSocket, actorId: string, raw: unknown) {
    try {
      const room = await this.load();
      if (!room) return;
      const body = JSON.parse(String(raw)) as RoomAction;
      const response = await this.apply(room, actorId, body);
      if (!response.ok) socket.send(JSON.stringify({ type: 'error', ...(await response.json()) }));
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: 'Invalid room action' }));
    }
  }

  private async apply(room: StoredRoom, actorId: string, body: RoomAction) {
    if (!Number.isInteger(body.revision) || body.revision !== room.revision) return json({ error: 'Stale room state', revision: room.revision }, 409);
    if (body.clientActionId && await this.state.storage.get(`event:${actorId}:${body.clientActionId}`)) return json(this.view(room, actorId));
    const charged = this.chargeClock(room, actorId);
    const state = charged.state;
    let next = state;
    if (body.type === 'action' && body.action) next = handlePlayerAction(state, actorId, body.action, body.targetId);
    if (body.type === 'pass') next = handlePass(state, actorId);
    if (body.type === 'lose' && body.cardId) next = handleLoseCard(state, actorId, body.cardId);
    if (body.type === 'challenge') next = handleChallenge(state, actorId);
    if (body.type === 'block' && body.cardClaim) next = handleBlock(state, actorId, body.cardClaim);
    if (next === state) return json({ error: 'Illegal room action' }, 400);
    const updated = this.advance({ ...charged, state: next });
    await this.save(updated);
    if (body.clientActionId) await this.recordAction(updated, actorId, body.clientActionId, body);
    await this.publish(updated);
    await this.schedule(updated);
    await this.maybeRunAi(updated);
    return json(this.view(updated, actorId));
  }

  private advance(room: StoredRoom): StoredRoom { return { ...room, revision: room.state.revision, phaseStartedAt: Date.now() }; }

  private timedActor(state: GameState) {
    const id = state.phase === GamePhase.TURN_START ? state.players[state.currentPlayerIndex]?.id
      : state.phase === GamePhase.CHALLENGE_LOSS ? state.playerToLoseInfluence : state.waitingForResponseFrom[0];
    return state.players.find(player => player.id === id);
  }

  private chargeClock(room: StoredRoom, actorId: string): StoredRoom {
    if (!finiteLimit(room.config.totalLimitMs) || room.remaining[actorId] === undefined) return room;
    if (this.timedActor(room.state)?.id !== actorId) return room;
    return { ...room, remaining: { ...room.remaining, [actorId]: Math.max(0, room.remaining[actorId] - (Date.now() - room.phaseStartedAt)) } };
  }

  private deadline(room: StoredRoom, actorId: string) {
    const limit = Math.min(finiteLimit(room.config.stepLimitMs) ?? Infinity, finiteLimit(room.remaining[actorId]) ?? Infinity);
    return Number.isFinite(limit) ? room.phaseStartedAt + limit : undefined;
  }

  private async schedule(room: StoredRoom) {
    if (room.state.phase === GamePhase.GAME_OVER) return this.state.storage.deleteAlarm();
    const actor = this.timedActor(room.state);
    if (!actor || actor.isAI) return this.state.storage.deleteAlarm();
    const deadline = this.deadline(room, actor.id);
    if (deadline) await this.state.storage.setAlarm(Math.max(Date.now(), deadline));
  }

  private view(room: StoredRoom, viewerId: string) {
    const actor = this.timedActor(room.state);
    return { state: projectRoomState(room.state, viewerId), remaining: room.remaining, revision: room.revision, deadline: actor ? this.deadline(room, actor.id) ?? null : null };
  }

  private async save(room: StoredRoom) {
    await this.state.storage.put('room', room);
    await this.env.DB?.prepare('INSERT INTO room_snapshots (room_id, revision, state_json, clocks_json, saved_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET revision=excluded.revision, state_json=excluded.state_json, clocks_json=excluded.clocks_json, saved_at=excluded.saved_at')
      .bind(room.roomId, room.revision, JSON.stringify(room.state), JSON.stringify({ remaining: room.remaining, phaseStartedAt: room.phaseStartedAt }), Date.now()).run();
    if (room.state.phase === GamePhase.GAME_OVER) await this.saveFinalHistory(room);
  }
  private load() { return this.state.storage.get('room') as Promise<StoredRoom | undefined>; }
  private async publish(room: StoredRoom) {
    for (const [socket, viewerId] of this.sockets) {
      try { socket.send(JSON.stringify({ type: 'state', ...this.view(room, viewerId) })); }
      catch { this.sockets.delete(socket); }
    }
  }

  private async recordAction(room: StoredRoom, actorId: string, actionId: string, body: RoomAction) {
    await this.state.storage.put(`event:${actorId}:${actionId}`, room.revision);
    await this.env.DB?.prepare('INSERT OR IGNORE INTO room_events (room_id, revision, actor_key, client_action_id, event_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(room.roomId, room.revision, actorId, actionId, JSON.stringify(body), Date.now()).run();
  }

  private async saveFinalHistory(room: StoredRoom) {
    if (!this.env.DB) return;
    await this.env.DB.prepare('CREATE TABLE IF NOT EXISTS game_history (id TEXT PRIMARY KEY, user_uuid TEXT NOT NULL, game_id TEXT NOT NULL UNIQUE, completed_at INTEGER NOT NULL, winner TEXT, ai_channels_json TEXT NOT NULL, state_json TEXT NOT NULL)').run();
    const aiChannels = Object.fromEntries(room.aiChannels.map((channel, index) => [`AI-${['I', 'II', 'III'][index] || channel}`, channel]));
    const humans = room.state.players.filter(player => !player.isAI);
    await Promise.all(humans.map(player => this.env.DB.prepare('INSERT OR IGNORE INTO game_history (id, user_uuid, game_id, completed_at, winner, ai_channels_json, state_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), player.id, `room:${room.roomId}:${player.id}`, Date.now(), room.state.winner, JSON.stringify(aiChannels), JSON.stringify(projectRoomState(room.state, player.id))).run()));
  }

  private async maybeRunAi(room: StoredRoom) {
    const actor = this.timedActor(room.state);
    if (!actor?.isAI || room.state.phase === GamePhase.GAME_OVER) return;
    const task = this.runAi(room.revision, actor.id);
    const waitUntil = (this.state as any).waitUntil;
    if (typeof waitUntil === 'function') waitUntil.call(this.state, task); else void task;
  }

  private async runAi(expectedRevision: number, actorId: string) {
    const room = await this.load();
    if (!room || room.revision !== expectedRevision || this.timedActor(room.state)?.id !== actorId) return;
    let decision: any;
    try { decision = await this.callOwnerAi(room, actorId); } catch { decision = { type: 'PASS' }; }
    const latest = await this.load();
    if (!latest || latest.revision !== expectedRevision || this.timedActor(latest.state)?.id !== actorId) return;
    const next = this.applyAiDecision(latest.state, actorId, decision);
    const fallback = next === latest.state ? timeoutTransition(latest.state) : next;
    if (fallback === latest.state) return;
    const updated = this.advance({ ...latest, state: fallback });
    await this.save(updated); await this.publish(updated); await this.schedule(updated); await this.maybeRunAi(updated);
  }

  private applyAiDecision(state: GameState, actorId: string, decision: any): GameState {
    const type = String(decision?.type || '').toUpperCase(); const payload = decision?.payload || decision || {};
    if (state.phase === GamePhase.TURN_START && type === 'ACTION') return handlePlayerAction(state, actorId, payload.action, payload.targetId);
    if (state.phase === GamePhase.CHALLENGE_LOSS) return handleLoseCard(state, actorId, payload.cardToLose);
    if (type === 'CHALLENGE') return handleChallenge(state, actorId);
    if (type === 'BLOCK') return handleBlock(state, actorId, payload.blockCard);
    return handlePass(state, actorId);
  }

  private async callOwnerAi(room: StoredRoom, aiId: string) {
    const appId = this.env.SSO_APP_ID || 'coup-game'; const appSecret = this.env.SSO_APP_SECRET || this.env.SSO_SECRET;
    if (!room.owner.isAdmin) {
      const quota = await fetch(`https://accounts.aryuki.com/api/quota/check?uuid=${encodeURIComponent(room.owner.uuid)}&app_id=${encodeURIComponent(appId)}`, { headers: { Authorization: `Bearer ${appSecret}` } });
      if (!quota.ok) throw new Error('Owner quota unavailable');
    }
    const player = room.state.players.find(candidate => candidate.id === aiId)!;
    const response = await callAIChannel(aiId.replace('room-ai-', ''), this.env, createAIDecisionRequest(room.state, player));
    if (!room.owner.isAdmin) await fetch('https://accounts.aryuki.com/api/quota/consume', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appSecret}` }, body: JSON.stringify({ uuid: room.owner.uuid, app_id: appId, tokens: response.totalTokens }) });
    const cleaned = response.content.replace(/<think>[\s\S]*?<\/think>/ig, '').trim(); const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match?.[0] || cleaned);
  }
}

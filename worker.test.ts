import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker';

type ConfigState = Record<string, string>;
type HistoryRecord = {
  id: string;
  user_uuid: string;
  game_id: string;
  completed_at: number;
  winner: string | null;
  ai_channels_json: string;
  state_json: string;
};
type ProcessRecord = {
  user_uuid: string;
  game_id: string;
  state_json: string;
  revision: number;
  started_at: number;
};
type RoomRecord = {
  id: string; owner_uuid: string; owner_is_admin: number; status: string; seat_count: number;
  ai_channels_json: string; time_controls_json: string; durable_object_id: string;
  created_at: number; updated_at: number; closed_at?: number | null;
};
type RoomMemberRecord = { room_id: string; user_uuid: string; display_name: string; seat_index: number; is_ready: number; joined_at: number; left_at?: number | null };
type RoomInviteRecord = { id: string; room_id: string; token_hash: string; created_by_uuid: string; expires_at: number; max_uses: number; use_count: number; revoked_at?: number | null };

class FakeDatabase {
  readonly config: ConfigState = {};
  readonly history = new Map<string, HistoryRecord>();
  readonly process = new Map<string, ProcessRecord>();
  readonly rooms = new Map<string, RoomRecord>();
  readonly roomMembers = new Map<string, RoomMemberRecord>();
  readonly roomInvites = new Map<string, RoomInviteRecord>();

  prepare(sql: string) {
    let values: unknown[] = [];
    return {
      bind: (...nextValues: unknown[]) => {
        values = nextValues;
        return this.prepareBound(sql, () => values);
      },
      first: async () => this.first(sql, values),
      all: async () => this.all(sql, values),
      run: async () => this.run(sql, values),
    };
  }

  private prepareBound(sql: string, getValues: () => unknown[]) {
    return {
      first: async () => this.first(sql, getValues()),
      all: async () => this.all(sql, getValues()),
      run: async () => this.run(sql, getValues()),
    };
  }

  private async first(sql: string, values: unknown[]) {
    if (sql.includes('SELECT * FROM users')) return null;
    if (sql.includes('SELECT * FROM process WHERE user_uuid = ?')) return this.process.get(String(values[0])) || null;
    if (sql.includes('SELECT * FROM rooms WHERE id = ?')) return this.rooms.get(String(values[0])) || null;
    if (sql.includes('SELECT * FROM room_members WHERE room_id = ? AND user_uuid = ?')) {
      const record = this.roomMembers.get(`${values[0]}:${values[1]}`);
      return record && !record.left_at ? record : null;
    }
    if (sql.includes('SELECT * FROM room_invites WHERE room_id = ? AND token_hash = ?')) {
      return [...this.roomInvites.values()].find(record => record.room_id === String(values[0]) && record.token_hash === String(values[1]) && !record.revoked_at) || null;
    }
    if (sql.includes('SELECT * FROM room_invites WHERE token_hash = ?')) {
      return [...this.roomInvites.values()].find(record => record.token_hash === String(values[0]) && !record.revoked_at) || null;
    }
    if (sql.includes('SELECT channel_id FROM ai_player_config')) {
      const slot = String(values[0]);
      return this.config[slot] ? { channel_id: this.config[slot] } : null;
    }
    if (sql.includes('FROM game_history WHERE id = ? AND user_uuid = ?')) {
      const record = this.history.get(String(values[0]));
      return record?.user_uuid === String(values[1]) ? record : null;
    }
    return null;
  }

  private async all(sql: string, values: unknown[]) {
    if (sql.includes('FROM rooms WHERE status != ?')) {
      return { results: [...this.rooms.values()].filter(room => room.status !== String(values[0])) };
    }
    if (sql.includes('FROM room_members WHERE room_id = ? AND left_at IS NULL')) {
      return { results: [...this.roomMembers.values()].filter(record => record.room_id === String(values[0]) && !record.left_at).sort((a, b) => a.seat_index - b.seat_index) };
    }
    if (sql.includes('FROM rooms r JOIN room_members m')) {
      const userUuid = String(values[0]);
      return { results: [...this.roomMembers.values()].filter(member => member.user_uuid === userUuid && !member.left_at).map(member => ({ ...this.rooms.get(member.room_id), is_ready: member.is_ready })) };
    }
    if (sql.includes('FROM ai_player_config')) {
      return { results: Object.entries(this.config).map(([player_slot, channel_id]) => ({ player_slot, channel_id })) };
    }
    if (sql.includes('FROM game_history WHERE user_uuid = ?')) {
      return {
        results: [...this.history.values()]
          .filter(record => record.user_uuid === String(values[0]))
          .sort((left, right) => right.completed_at - left.completed_at)
          .map(({ state_json, user_uuid, ...record }) => record),
      };
    }
    return { results: [] };
  }

  private async run(sql: string, values: unknown[]) {
    if (sql.includes('INSERT INTO rooms')) {
      const [id, owner_uuid, owner_is_admin, status, seat_count, ai_channels_json, time_controls_json, durable_object_id, created_at, updated_at] = values as [string, string, number, string, number, string, string, string, number, number];
      this.rooms.set(id, { id, owner_uuid, owner_is_admin, status, seat_count, ai_channels_json, time_controls_json, durable_object_id, created_at, updated_at });
    }
    if (sql.includes('INSERT INTO room_members')) {
      const [room_id, user_uuid, display_name, seat_index, is_ready, joined_at] = values as [string, string, string, number, number, number];
      this.roomMembers.set(`${room_id}:${user_uuid}`, { room_id, user_uuid, display_name, seat_index, is_ready, joined_at });
    }
    if (sql.includes('INSERT INTO room_invites')) {
      const [id, room_id, token_hash, created_by_uuid, expires_at, max_uses, use_count] = values as [string, string, string, string, number, number, number];
      this.roomInvites.set(id, { id, room_id, token_hash, created_by_uuid, expires_at, max_uses, use_count });
    }
    if (sql.includes('UPDATE room_members SET is_ready')) {
      const record = this.roomMembers.get(`${values[1]}:${values[2]}`);
      if (record) record.is_ready = Number(values[0]);
    }
    if (sql.includes("UPDATE rooms SET status = ?")) {
      const room = this.rooms.get(String(values[values.length - 1]));
      if (room) { room.status = String(values[0]); room.updated_at = Number(values[values.length - 2]); if (String(values[0]) === 'closed') room.closed_at = Number(values[values.length - 2]); }
    }
    if (sql.includes('UPDATE rooms SET updated_at = ?')) {
      const room = this.rooms.get(String(values[1])); if (room) room.updated_at = Number(values[0]);
    }
    if (sql.includes('UPDATE room_invites SET use_count')) {
      const invite = this.roomInvites.get(String(values[0])); if (invite) invite.use_count += 1;
    }
    if (sql.includes('ai_player_config') && values[0] !== undefined) {
      if (sql.includes('INSERT OR IGNORE') && this.config[String(values[0])]) return { success: true };
      this.config[String(values[0])] = String(values[1]);
    }
    if (sql.includes('INSERT INTO game_history')) {
      const [id, user_uuid, game_id, completed_at, winner, ai_channels_json, state_json] = values as [string, string, string, number, string | null, string, string];
      if ([...this.history.values()].some(record => record.game_id === game_id)) throw new Error('UNIQUE constraint failed: game_history.game_id');
      this.history.set(id, { id, user_uuid, game_id, completed_at, winner, ai_channels_json, state_json });
    }
    if (sql.includes('DELETE FROM game_history WHERE id = ? AND user_uuid = ?')) {
      const record = this.history.get(String(values[0]));
      if (record?.user_uuid === String(values[1])) {
        this.history.delete(record.id);
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (sql.includes('INSERT INTO process')) {
      const [user_uuid, game_id, state_json, revisionValue, startedAtValue] = values as [string, string, string, number | undefined, number | undefined];
      const state = JSON.parse(state_json) as { revision?: number; startedAt?: number };
      const candidate: ProcessRecord = {
        user_uuid,
        game_id,
        state_json,
        revision: Number(revisionValue ?? state.revision ?? 0),
        started_at: Number(startedAtValue ?? state.startedAt ?? 0),
      };
      const current = this.process.get(user_uuid);
      const guarded = sql.includes('excluded.started_at > process.started_at');
      const accepted = !current || !guarded
        || candidate.started_at > current.started_at
        || (candidate.game_id === current.game_id && candidate.revision >= current.revision);
      if (accepted) this.process.set(user_uuid, candidate);
      return { success: true, meta: { changes: accepted ? 1 : 0 } };
    }
    return { success: true };
  }
}

function tokenFor(role: 'admin' | 'user', uuid = `${role}-uuid`) {
  const payload = Buffer.from(JSON.stringify({ uuid, username: role, role })).toString('base64url');
  return `header.${payload}.signature`;
}

function request(path: string, role: 'admin' | 'user', init: RequestInit = {}, uuid?: string) {
  return new Request(`https://coup.example${path}`, {
    ...init,
    headers: { Cookie: `coup_session=${tokenFor(role, uuid)}`, ...(init.headers || {}) },
  });
}

function createEnvironment(db = new FakeDatabase()) {
  return {
    db,
    env: {
      DB: db,
      ASSETS: { fetch: vi.fn(async () => new Response('missing', { status: 404 })) },
      SSO_APP_ID: 'coup-game',
      SSO_APP_SECRET: 'subapp-secret',
      AI_RELAY_URL: 'https://model.aryuki.com',
      AI_RELAY_SHARED_SECRET: 'relay-shared-test-secret-at-least-32-bytes',
      GEMINI_API_KEY: 'gemini-key',
      DEEPSEEK_API_KEY: 'deepseek-key',
      OPENAI_API_KEY: 'openai-key',
      Model_1: 'gemini-model',
      Model_2: 'deepseek-model',
      Model_3: 'openai-model',
      ROOM_GAME: undefined as any,
    },
  };
}

function finishedState(gameId = 'finished-game') {
  return {
    gameId,
    phase: 'GAME_OVER',
    winner: 'You',
    players: [{ id: 'human', name: 'You', coins: 7 }],
    logs: [{ id: 'start', text: 'Game Started. Good luck.', timestamp: 1 }],
  };
}

function processState(gameId: string, revision: number, startedAt: number) {
  return { gameId, revision, startedAt, phase: 'TURN_START', players: [], logs: [] };
}

function installFetchMock(providerStatus = 200) {
  const consumeBodies: any[] = [];
  const quotaChecks: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/verify')) {
      const bearer = (init?.headers as Record<string, string>).Authorization;
      const payload = JSON.parse(Buffer.from(bearer.replace('Bearer ', '').split('.')[1], 'base64url').toString());
      return Response.json(payload);
    }
    if (url.includes('/api/quota/check')) {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer subapp-secret');
      quotaChecks.push(url);
      return Response.json({ valid: true, remaining_tokens: 1000 });
    }
    if (url.includes('/api/quota/consume')) {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer subapp-secret');
      consumeBodies.push(JSON.parse(String(init?.body)));
      return Response.json({ success: true });
    }
    if (url.includes('model.aryuki.com/openai/')) {
      return providerStatus === 200
        ? Response.json({ choices: [{ message: { content: '{"type":"PASS"}' } }], usage: { total_tokens: 21 } })
        : new Response('provider unavailable', { status: providerStatus });
    }
    if (url.includes('model.aryuki.com/gemini/')) {
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"type":"PASS"}' }] } }], usageMetadata: { totalTokenCount: 7 } });
    }
    if (url.includes('model.aryuki.com/deepseek/')) {
      return Response.json({ choices: [{ message: { content: '{"type":"PASS"}' } }], usage: { total_tokens: 17 } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
  return { consumeBodies, quotaChecks };
}

afterEach(() => vi.unstubAllGlobals());

describe('AI administration and quota routing', () => {
  it('rejects a verified non-admin from the configuration endpoint', async () => {
    const { env } = createEnvironment();
    installFetchMock();

    const response = await worker.fetch(request('/api/admin/ai-config', 'user'), env, { waitUntil() {} } as any);

    expect(response.status).toBe(403);
  });

  it('consumes the returned tokens after a successful regular-user game call', async () => {
    const { env } = createEnvironment();
    const { consumeBodies } = installFetchMock();
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as any;

    (env.DB as FakeDatabase).config.alapha = '3';

    const response = await worker.fetch(request('/api/ai', 'user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSlot: 'alapha', systemInstruction: 'Return JSON.', userMessage: 'Pass.' }),
    }), env, ctx);
    await Promise.all(pending);

    expect(response.status).toBe(200);
    expect(consumeBodies).toContainEqual(expect.objectContaining({ uuid: 'user-uuid', app_id: 'coup-game', tokens: 21 }));
  });

  it('does not check or consume quota for an administrator AI call', async () => {
    const { env } = createEnvironment();
    const { consumeBodies, quotaChecks } = installFetchMock();
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as any;

    const response = await worker.fetch(request('/api/admin/ai-test', 'admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: '3' }),
    }), env, ctx);
    await Promise.all(pending);

    expect(response.status).toBe(200);
    expect(quotaChecks).toEqual([]);
    expect(consumeBodies).toEqual([]);
  });

  it('does not consume quota when the selected provider fails', async () => {
    const { env, db } = createEnvironment();
    db.config.alapha = '3';
    const { consumeBodies } = installFetchMock(503);
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as any;

    const response = await worker.fetch(request('/api/ai', 'admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSlot: 'alapha', systemInstruction: 'Return JSON.', userMessage: 'Pass.' }),
    }), env, ctx);
    await Promise.all(pending);

    expect(response.status).toBe(503);
    expect(consumeBodies).toEqual([]);
  });
});

describe('multiplayer room lifecycle', () => {
  it('health-checks selected room AIs for the owner before creating and starts only after ready', async () => {
    const { env, db } = createEnvironment();
    const { quotaChecks, consumeBodies } = installFetchMock();
    const pending: Promise<unknown>[] = [];
    const initialized: any[] = [];
    const roomHints: unknown[] = [];
    env.ROOM_GAME = {
      idFromName: (name: string) => name,
      get: (_id: string, options: unknown) => { roomHints.push(options); return { fetch: async (request: Request) => {
        initialized.push(await request.json());
        return Response.json({ ok: true });
      } }; },
    };
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as any;
    const created = await worker.fetch(request('/api/rooms', 'user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seatCount: 3, aiChannels: ['1', '3'], timeControls: { stepLimitMs: 30_000 } }),
    }), env, ctx);
    await Promise.all(pending);
    const room = await created.json() as any;

    expect(created.status).toBe(201);
    expect(room.invite.url).toContain('/game?invite=');
    expect(quotaChecks).toHaveLength(2);
    expect(consumeBodies).toHaveLength(2);
    expect(db.rooms.get(room.id)?.status).toBe('open');

    expect((await worker.fetch(request(`/api/rooms/${room.id}/start`, 'user', { method: 'POST' }), env, ctx)).status).toBe(409);
    expect((await worker.fetch(request(`/api/rooms/${room.id}/ready`, 'user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ready: true }) }), env, ctx)).status).toBe(200);
    const started = await worker.fetch(request(`/api/rooms/${room.id}/start`, 'user', { method: 'POST' }), env, ctx);

    expect(started.status).toBe(200);
    expect(db.rooms.get(room.id)?.status).toBe('started');
    expect(initialized[0]).toMatchObject({ type: 'initialize', room: { roomId: room.id, owner: { uuid: 'user-uuid' } } });
    expect(initialized[0].room.state.players.map((player: any) => player.name)).toEqual(['user', 'I', 'III']);
    expect(roomHints).toContainEqual({ locationHint: 'enam' });
  });

  it('routes AI recovery through the owner-only room Durable Object command', async () => {
    const { env, db } = createEnvironment();
    installFetchMock();
    const created = await worker.fetch(request('/api/rooms', 'user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seatCount: 3, aiChannels: ['1'] }),
    }), env, { waitUntil() {} } as any);
    const room = await created.json() as any;
    db.rooms.get(room.id)!.status = 'started';
    const commands: Request[] = [];
    env.ROOM_GAME = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async (command: Request) => { commands.push(command); return Response.json({ recovered: true, aiChannels: ['2'] }); } }),
    };

    const response = await worker.fetch(request(`/api/rooms/${room.id}/ai-recovery`, 'user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'switch-ai', channelId: '2' }),
    }), env, { waitUntil() {} } as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ recovered: true, aiChannels: ['2'] });
    expect(commands).toHaveLength(1);
    expect(commands[0].headers.get('X-Room-Actor')).toBe('user-uuid');
    expect(commands[0].headers.get('X-Room-Internal')).toBe('1');
    expect(await commands[0].json()).toEqual({ type: 'switch-ai', channelId: '2' });

    const denied = await worker.fetch(request(`/api/rooms/${room.id}/ai-recovery`, 'user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'retry-ai' }),
    }, 'non-owner-uuid'), env, { waitUntil() {} } as any);
    expect(denied.status).toBe(403);
  });

  it('lets admins list active rooms and observe them without taking a seat', async () => {
    const { env, db } = createEnvironment();
    installFetchMock();
    const created = await worker.fetch(request('/api/rooms', 'user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seatCount: 3, aiChannels: [] }),
    }), env, { waitUntil() {} } as any);
    const room = await created.json() as any;
    db.rooms.get(room.id)!.status = 'started';
    const token = new URL(room.invite.url).searchParams.get('invite')!;

    const rooms = await worker.fetch(request('/api/admin/rooms', 'admin'), env, { waitUntil() {} } as any);
    expect(rooms.status).toBe(200);
    expect(await rooms.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: room.id, status: 'started' })]));

    const watch = await worker.fetch(request(`/api/admin/rooms/${room.id}/watch`, 'admin'), env, { waitUntil() {} } as any);
    expect(watch.status).toBe(200);
    expect(await watch.json()).toMatchObject({ id: room.id, spectator: true, status: 'started' });

    const inviteWatch = await worker.fetch(request(`/api/rooms/${room.id}/watch?invite=${encodeURIComponent(token)}`, 'user'), env, { waitUntil() {} } as any);
    expect(inviteWatch.status).toBe(200);
    expect(await inviteWatch.json()).toMatchObject({ id: room.id, spectator: true, status: 'started' });

    const inviteRecord = [...db.roomInvites.values()][0];
    inviteRecord.use_count = inviteRecord.max_uses;
    const resolvedAfterJoin = await worker.fetch(request(`/api/rooms/invite/${encodeURIComponent(token)}`, 'user'), env, { waitUntil() {} } as any);
    expect(resolvedAfterJoin.status).toBe(200);
    expect(await resolvedAfterJoin.json()).toMatchObject({ canJoin: false, canWatch: true });

    const closed = await worker.fetch(request(`/api/admin/rooms/${room.id}/close`, 'admin', { method: 'POST' }), env, { waitUntil() {} } as any);
    expect(closed.status).toBe(200);
    expect(db.rooms.get(room.id)?.status).toBe('closed');
  });

  it('rejects ordinary users from the admin room list', async () => {
    const { env } = createEnvironment();
    installFetchMock();
    const response = await worker.fetch(request('/api/admin/rooms', 'user'), env, { waitUntil() {} } as any);
    expect(response.status).toBe(403);
  });
});

describe('private match history', () => {
  it('stores a completed game with the active Alapha and Beta channels', async () => {
    const { env, db } = createEnvironment();
    db.config.alapha = '3';
    db.config.beta = '1';
    installFetchMock();

    const response = await worker.fetch(request('/api/history', 'user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: finishedState() }),
    }), env, { waitUntil() {} } as any);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ai_channels: { alapha: '3', beta: '1' } });
  });

  it('does not return or delete another users history', async () => {
    const { env, db } = createEnvironment();
    installFetchMock();
    db.history.set('other-history', {
      id: 'other-history', user_uuid: 'admin-uuid', game_id: 'admin-game', completed_at: 1, winner: 'Admin',
      ai_channels_json: JSON.stringify({ alapha: '1', beta: '2' }), state_json: JSON.stringify(finishedState('admin-game')),
    });

    const detail = await worker.fetch(request('/api/history/other-history', 'user'), env, { waitUntil() {} } as any);
    const deletion = await worker.fetch(request('/api/history/other-history', 'user', { method: 'DELETE' }), env, { waitUntil() {} } as any);

    expect(detail.status).toBe(404);
    expect(deletion.status).toBe(404);
    expect(db.history.has('other-history')).toBe(true);
  });

  it('lists, retrieves, deletes, and rejects duplicate games for the owner', async () => {
    const { env } = createEnvironment();
    installFetchMock();
    const ctx = { waitUntil() {} } as any;
    const create = (gameId: string) => worker.fetch(request('/api/history', 'user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: finishedState(gameId) }),
    }), env, ctx);

    const created = await create('owned-game');
    const item = await created.json() as { id: string };
    expect((await create('owned-game')).status).toBe(409);

    const list = await (await worker.fetch(request('/api/history', 'user'), env, ctx)).json() as any[];
    const detail = await (await worker.fetch(request(`/api/history/${item.id}`, 'user'), env, ctx)).json() as any;
    expect(list).toHaveLength(1);
    expect(detail.state.gameId).toBe('owned-game');

    expect((await worker.fetch(request(`/api/history/${item.id}`, 'user', { method: 'DELETE' }), env, ctx)).status).toBe(200);
    expect((await worker.fetch(request(`/api/history/${item.id}`, 'user'), env, ctx)).status).toBe(404);
  });
});

describe('game process synchronization', () => {
  it('does not allow an older state revision or an earlier game to overwrite progress', async () => {
    const { env } = createEnvironment();
    installFetchMock();
    const ctx = { waitUntil() {} } as any;
    const save = (state: ReturnType<typeof processState>) => worker.fetch(request('/api/process', 'user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, game_id: state.gameId }),
    }), env, ctx);

    await save(processState('game-a', 5, 100));
    await save(processState('game-a', 4, 100));
    expect((await (await worker.fetch(request('/api/process', 'user'), env, ctx)).json() as any).state.revision).toBe(5);

    await save(processState('game-b', 0, 200));
    await save(processState('game-a', 6, 100));
    const restored = await (await worker.fetch(request('/api/process', 'user'), env, ctx)).json() as any;
    expect(restored.state).toMatchObject({ gameId: 'game-b', revision: 0, startedAt: 200 });
  });
});

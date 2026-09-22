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

class FakeDatabase {
  readonly config: ConfigState = {};
  readonly history = new Map<string, HistoryRecord>();

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
    return { success: true };
  }
}

function tokenFor(role: 'admin' | 'user') {
  const payload = Buffer.from(JSON.stringify({ uuid: `${role}-uuid`, username: role, role })).toString('base64url');
  return `header.${payload}.signature`;
}

function request(path: string, role: 'admin' | 'user', init: RequestInit = {}) {
  return new Request(`https://coup.example${path}`, {
    ...init,
    headers: { Cookie: `coup_session=${tokenFor(role)}`, ...(init.headers || {}) },
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
      GEMINI_API_KEY: 'gemini-key',
      DEEPSEEK_API_KEY: 'deepseek-key',
      OPENAI_API_KEY: 'openai-key',
      Model_1: 'gemini-model',
      Model_2: 'deepseek-model',
      Model_3: 'openai-model',
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
    if (url.includes('api.openai.com')) {
      return providerStatus === 200
        ? Response.json({ choices: [{ message: { content: '{"type":"PASS"}' } }], usage: { total_tokens: 21 } })
        : new Response('provider unavailable', { status: providerStatus });
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"type":"PASS"}' }] } }], usageMetadata: { totalTokenCount: 7 } });
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

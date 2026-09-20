import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker';

type ConfigState = Record<string, string>;

class FakeDatabase {
  readonly config: ConfigState = {};

  prepare(sql: string) {
    let values: unknown[] = [];
    return {
      bind: (...nextValues: unknown[]) => {
        values = nextValues;
        return this.prepareBound(sql, () => values);
      },
      first: async () => this.first(sql, values),
      all: async () => this.all(sql),
      run: async () => this.run(sql, values),
    };
  }

  private prepareBound(sql: string, getValues: () => unknown[]) {
    return {
      first: async () => this.first(sql, getValues()),
      all: async () => this.all(sql),
      run: async () => this.run(sql, getValues()),
    };
  }

  private async first(sql: string, values: unknown[]) {
    if (sql.includes('SELECT * FROM users')) return null;
    if (sql.includes('SELECT channel_id FROM ai_player_config')) {
      const slot = String(values[0]);
      return this.config[slot] ? { channel_id: this.config[slot] } : null;
    }
    return null;
  }

  private async all(sql: string) {
    if (sql.includes('FROM ai_player_config')) {
      return { results: Object.entries(this.config).map(([player_slot, channel_id]) => ({ player_slot, channel_id })) };
    }
    return { results: [] };
  }

  private async run(sql: string, values: unknown[]) {
    if (sql.includes('ai_player_config') && values[0] !== undefined) {
      if (sql.includes('INSERT OR IGNORE') && this.config[String(values[0])]) return { success: true };
      this.config[String(values[0])] = String(values[1]);
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

function installFetchMock(providerStatus = 200) {
  const consumeBodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/verify')) {
      const bearer = (init?.headers as Record<string, string>).Authorization;
      const payload = JSON.parse(Buffer.from(bearer.replace('Bearer ', '').split('.')[1], 'base64url').toString());
      return Response.json(payload);
    }
    if (url.includes('/api/quota/check')) {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer subapp-secret');
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
  return consumeBodies;
}

afterEach(() => vi.unstubAllGlobals());

describe('AI administration and quota routing', () => {
  it('rejects a verified non-admin from the configuration endpoint', async () => {
    const { env } = createEnvironment();
    installFetchMock();

    const response = await worker.fetch(request('/api/admin/ai-config', 'user'), env, { waitUntil() {} } as any);

    expect(response.status).toBe(403);
  });

  it('uses the selected OpenAI channel and consumes the returned tokens after a successful game call', async () => {
    const { env } = createEnvironment();
    const consumeBodies = installFetchMock();
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as any;

    const saveResponse = await worker.fetch(request('/api/admin/ai-config', 'admin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSlot: 'alapha', channelId: '3' }),
    }), env, ctx);
    expect(saveResponse.status).toBe(200);

    const response = await worker.fetch(request('/api/ai', 'admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSlot: 'alapha', systemInstruction: 'Return JSON.', userMessage: 'Pass.' }),
    }), env, ctx);
    await Promise.all(pending);

    expect(response.status).toBe(200);
    expect(consumeBodies).toContainEqual(expect.objectContaining({ uuid: 'admin-uuid', app_id: 'coup-game', tokens: 21 }));
  });

  it('does not consume quota when the selected provider fails', async () => {
    const { env, db } = createEnvironment();
    db.config.alapha = '3';
    const consumeBodies = installFetchMock(503);
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

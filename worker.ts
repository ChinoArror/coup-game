import { AIChannelError, callAIChannel } from './services/aiGateway';

const SSO_URL = 'https://accounts.aryuki.com';
const PLAYER_SLOTS = ['alapha', 'beta'] as const;
const CHANNEL_IDS = ['1', '2', '3'] as const;
const processSchemaMigrations = new WeakMap<object, Promise<void>>();

type PlayerSlot = typeof PLAYER_SLOTS[number];
type ChannelId = typeof CHANNEL_IDS[number];
type WorkerExecutionContext = { waitUntil(promise: Promise<unknown>): void };

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function parseCookies(cookieStr: string | null) {
  const cookies: Record<string, string> = {};
  for (const cookie of cookieStr?.split(';') || []) {
    const separator = cookie.indexOf('=');
    if (separator > 0) cookies[cookie.slice(0, separator).trim()] = cookie.slice(separator + 1).trim();
  }
  return cookies;
}

function decodeJwt(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=')));
  } catch {
    return null;
  }
}

function validSlot(value: unknown): value is PlayerSlot {
  return typeof value === 'string' && (PLAYER_SLOTS as readonly string[]).includes(value);
}

function validChannel(value: unknown): value is ChannelId {
  return typeof value === 'string' && (CHANNEL_IDS as readonly string[]).includes(value);
}

function ensureProcessSchema(db: any) {
  const existing = processSchemaMigrations.get(db);
  if (existing) return existing;
  const migration = (async () => {
    await db.prepare('CREATE TABLE IF NOT EXISTS process (user_uuid TEXT PRIMARY KEY, game_id TEXT NOT NULL, state_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, started_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER)').run();
    try { await db.prepare('ALTER TABLE process ADD COLUMN revision INTEGER NOT NULL DEFAULT 0').run(); } catch { /* Existing installations may already have this column. */ }
    try { await db.prepare('ALTER TABLE process ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0').run(); } catch { /* Existing installations may already have this column. */ }
  })();
  processSchemaMigrations.set(db, migration);
  return migration;
}

export default {
  async fetch(request: Request, env: any, ctx: WorkerExecutionContext) {
    const url = new URL(request.url);
    const appId = env.SSO_APP_ID || 'coup-game';
    const appSecret = env.SSO_APP_SECRET || env.SSO_SECRET;

    const verifyToken = async (token: string) => {
      try {
        const response = await fetch(`${SSO_URL}/api/verify?app_id=${appId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return null;
        const data = await response.json() as any;
        const user = data.user || data;
        return user?.uuid ? user : null;
      } catch {
        return null;
      }
    };

    const getVerifiedSession = async () => {
      const token = parseCookies(request.headers.get('Cookie')).coup_session;
      if (!token || !decodeJwt(token)) return null;
      const user = await verifyToken(token);
      if (!user) return null;
      return {
        uuid: user.uuid,
        username: user.username || 'agent',
        name: user.name || user.username || 'Agent',
        role: user.role || 'user',
        token,
      };
    };

    const session = await getVerifiedSession();

    const requireSession = () => {
      if (!session) throw new HttpError(401, 'Unauthorized');
      return session;
    };

    const requireAdmin = () => {
      const user = requireSession();
      if (user.role !== 'admin') throw new HttpError(403, 'Administrator access required');
      return user;
    };

    const ensureAIConfig = async () => {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_player_config (player_slot TEXT PRIMARY KEY, channel_id TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
      await env.DB.prepare('INSERT OR IGNORE INTO ai_player_config (player_slot, channel_id, updated_at) VALUES (?, ?, ?)').bind('alapha', '1', Date.now()).run();
      await env.DB.prepare('INSERT OR IGNORE INTO ai_player_config (player_slot, channel_id, updated_at) VALUES (?, ?, ?)').bind('beta', '2', Date.now()).run();
    };

    const getChannelForSlot = async (playerSlot: PlayerSlot): Promise<ChannelId> => {
      await ensureAIConfig();
      const record = await env.DB.prepare('SELECT channel_id FROM ai_player_config WHERE player_slot = ?').bind(playerSlot).first() as any;
      return validChannel(record?.channel_id) ? record.channel_id : (playerSlot === 'alapha' ? '1' : '2');
    };

    const ensureHistoryTable = async () => {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS game_history (id TEXT PRIMARY KEY, user_uuid TEXT NOT NULL, game_id TEXT NOT NULL UNIQUE, completed_at INTEGER NOT NULL, winner TEXT, ai_channels_json TEXT NOT NULL, state_json TEXT NOT NULL)').run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_history_user_completed ON game_history(user_uuid, completed_at DESC)').run();
    };

    const checkQuota = async (user: NonNullable<typeof session>) => {
      const response = await fetch(`${SSO_URL}/api/quota/check?uuid=${encodeURIComponent(user.uuid)}&app_id=${encodeURIComponent(appId)}`, {
        headers: { Authorization: `Bearer ${appSecret}` },
      });
      if (response.ok) return;
      if (response.status === 429) throw new HttpError(429, 'Quota exceeded: please try again later.');
      if (response.status === 403) throw new HttpError(403, 'No quota authorization for this app.');
      if (response.status === 401) throw new HttpError(401, 'Subapp quota credential is invalid.');
      throw new HttpError(502, 'Quota check failed.');
    };

    const callWithQuota = async (user: NonNullable<typeof session>, channelId: ChannelId, systemInstruction: string, userMessage: string) => {
      const hasUnlimitedQuota = user.role === 'admin';
      if (!hasUnlimitedQuota) await checkQuota(user);
      const result = await callAIChannel(channelId, env, { systemInstruction, userMessage });
      if (hasUnlimitedQuota) return result;
      ctx.waitUntil(fetch(`${SSO_URL}/api/quota/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appSecret}` },
        body: JSON.stringify({ uuid: user.uuid, app_id: appId, tokens: result.totalTokens }),
      }).then(async response => {
        if (!response.ok) console.error('[QUOTA_CONSUME_FAILED]', response.status);
      }).catch(() => console.error('[QUOTA_CONSUME_FAILED]')));
      return result;
    };

    try {
      if (url.pathname === '/api/logout' && request.method === 'POST') {
        return json({ success: true }, 200, { 'Set-Cookie': 'coup_session=; Path=/; Domain=.aryuki.com; Max-Age=0;' });
      }

      if (url.pathname === '/api/sso-callback' && request.method === 'POST') {
        const body = await request.json() as any;
        if (!body?.token) throw new HttpError(400, 'Missing token');
        const user = await verifyToken(body.token);
        if (!user) throw new HttpError(401, 'SSO verification failed');
        await env.DB.prepare('INSERT INTO users (uuid, user_id, name, username, token, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, username=excluded.username, token=excluded.token, last_seen=excluded.last_seen')
          .bind(user.uuid, user.user_id || 0, user.name || user.username || 'Agent', user.username || 'agent', body.token, Date.now(), Date.now()).run();
        return json({ success: true }, 200, { 'Set-Cookie': `coup_session=${body.token}; Path=/; Domain=.aryuki.com; Max-Age=604800; HttpOnly; Secure; SameSite=Lax` });
      }

      if (url.pathname === '/api/me' && request.method === 'GET') {
        const user = requireSession();
        const localUser = await env.DB.prepare('SELECT * FROM users WHERE uuid = ?').bind(user.uuid).first() as any;
        if (localUser?.is_paused) return json({ error: 'paused' }, 403, { 'Set-Cookie': 'coup_session=; Path=/; Max-Age=0;' });
        return json({ uuid: user.uuid, username: user.username, name: user.name, role: user.role });
      }

      if (url.pathname === '/api/admin/ai-config') {
        requireAdmin();
        await ensureAIConfig();
        if (request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT player_slot, channel_id FROM ai_player_config ORDER BY player_slot').all() as any;
          return json({ players: results });
        }
        if (request.method === 'PUT') {
          const body = await request.json() as any;
          if (!validSlot(body?.playerSlot) || !validChannel(body?.channelId)) throw new HttpError(400, 'Invalid player slot or AI channel');
          await env.DB.prepare('INSERT INTO ai_player_config (player_slot, channel_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_slot) DO UPDATE SET channel_id=excluded.channel_id, updated_at=excluded.updated_at')
            .bind(body.playerSlot, body.channelId, Date.now()).run();
          return json({ playerSlot: body.playerSlot, channelId: body.channelId });
        }
        throw new HttpError(405, 'Method not allowed');
      }

      if (url.pathname === '/api/admin/ai-test' && request.method === 'POST') {
        const user = requireAdmin();
        const body = await request.json() as any;
        if (!validChannel(body?.channelId)) throw new HttpError(400, 'Invalid AI channel');
        const result = await callWithQuota(user, body.channelId, 'You are a service health check. Reply with one valid JSON object only.', '{"status":"ok"}');
        return json({ channelId: body.channelId, content: result.content, totalTokens: result.totalTokens });
      }

      if (url.pathname === '/api/ai' && request.method === 'POST') {
        const user = requireSession();
        const body = await request.json() as any;
        if (!validSlot(body?.playerSlot) || typeof body?.systemInstruction !== 'string' || typeof body?.userMessage !== 'string') throw new HttpError(400, 'Invalid AI request');
        const channelId = await getChannelForSlot(body.playerSlot);
        const result = await callWithQuota(user, channelId, body.systemInstruction, body.userMessage);
        return json({ content: result.content });
      }

      if (url.pathname === '/api/history' || url.pathname.startsWith('/api/history/')) {
        const user = requireSession();
        await ensureHistoryTable();
        const itemId = url.pathname === '/api/history' ? null : decodeURIComponent(url.pathname.slice('/api/history/'.length));
        if (itemId && itemId.includes('/')) throw new HttpError(404, 'History item not found');

        if (!itemId && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT id, game_id, completed_at, winner, ai_channels_json FROM game_history WHERE user_uuid = ? ORDER BY completed_at DESC').bind(user.uuid).all() as any;
          return json(results.map((record: any) => ({ ...record, ai_channels: JSON.parse(record.ai_channels_json) })));
        }

        if (!itemId && request.method === 'POST') {
          const body = await request.json() as any;
          const state = body?.state;
          if (!state || state.phase !== 'GAME_OVER' || typeof state.gameId !== 'string' || !Array.isArray(state.players) || !Array.isArray(state.logs)) {
            throw new HttpError(400, 'A completed game state is required');
          }
          const aiChannels = { alapha: await getChannelForSlot('alapha'), beta: await getChannelForSlot('beta') };
          const record = {
            id: crypto.randomUUID(),
            game_id: state.gameId,
            completed_at: Date.now(),
            winner: typeof state.winner === 'string' ? state.winner : null,
            ai_channels: aiChannels,
          };
          try {
            await env.DB.prepare('INSERT INTO game_history (id, user_uuid, game_id, completed_at, winner, ai_channels_json, state_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .bind(record.id, user.uuid, record.game_id, record.completed_at, record.winner, JSON.stringify(aiChannels), JSON.stringify(state)).run();
          } catch {
            throw new HttpError(409, 'This game is already recorded');
          }
          return json(record, 201);
        }

        if (itemId && request.method === 'GET') {
          const record = await env.DB.prepare('SELECT id, game_id, completed_at, winner, ai_channels_json, state_json FROM game_history WHERE id = ? AND user_uuid = ?').bind(itemId, user.uuid).first() as any;
          if (!record) throw new HttpError(404, 'History item not found');
          return json({ ...record, ai_channels: JSON.parse(record.ai_channels_json), state: JSON.parse(record.state_json) });
        }

        if (itemId && request.method === 'DELETE') {
          const result = await env.DB.prepare('DELETE FROM game_history WHERE id = ? AND user_uuid = ?').bind(itemId, user.uuid).run() as any;
          if (!result.meta?.changes) throw new HttpError(404, 'History item not found');
          return json({ success: true });
        }

        throw new HttpError(405, 'Method not allowed');
      }

      if (url.pathname === '/api/process') {
        const user = requireSession();
        await ensureProcessSchema(env.DB);
        if (request.method === 'GET') {
          const proc = await env.DB.prepare('SELECT * FROM process WHERE user_uuid = ?').bind(user.uuid).first() as any;
          return json({ state: proc ? JSON.parse(proc.state_json) : null });
        }
        if (request.method === 'POST') {
          const body = await request.json() as any;
          const state = body?.state;
          const gameId = typeof body?.game_id === 'string' ? body.game_id : state?.gameId;
          if (!state || typeof state !== 'object' || typeof gameId !== 'string' || !gameId) throw new HttpError(400, 'Invalid game state');
          const revision = Number.isInteger(state.revision) && state.revision >= 0 ? state.revision : 0;
          const startedAt = Number.isFinite(state.startedAt) && state.startedAt >= 0 ? state.startedAt : 0;
          const result = await env.DB.prepare('INSERT INTO process (user_uuid, game_id, state_json, revision, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_uuid) DO UPDATE SET game_id=excluded.game_id, state_json=excluded.state_json, revision=excluded.revision, started_at=excluded.started_at, updated_at=excluded.updated_at WHERE excluded.started_at > process.started_at OR (excluded.game_id = process.game_id AND excluded.revision >= process.revision)')
            .bind(user.uuid, gameId, JSON.stringify(state), revision, startedAt, Date.now()).run() as any;
          return json({ success: true, ignored: !result.meta?.changes });
        }
        if (request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM process WHERE user_uuid = ?').bind(user.uuid).run();
          return json({ success: true });
        }
      }

      if (url.pathname === '/api/leaderboard') {
        if (request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM leaderboard ORDER BY match_date DESC LIMIT 100').all() as any;
          return json(results);
        }
        if (request.method === 'POST') {
          const user = requireSession();
          const body = await request.json() as any;
          try {
            await env.DB.prepare('INSERT INTO leaderboard (id, user_uuid, username, game_id, match_date, place, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .bind(crypto.randomUUID(), user.uuid, user.name || user.username, body.game_id, Date.now(), body.place, body.duration).run();
            return json({ success: true });
          } catch {
            return json({ success: false, error: 'Already recorded' }, 409);
          }
        }
      }

      if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'Not found');
      return env.ASSETS.fetch(request);
    } catch (error: any) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof AIChannelError) return json({ error: error.message }, error.status);
      console.error('[WORKER_ERROR]', error?.message || error);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};

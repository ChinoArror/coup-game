import { AIChannelError, callAIChannel } from './services/aiGateway';

const SSO_URL = 'https://accounts.aryuki.com';
const PLAYER_SLOTS = ['alapha', 'beta'] as const;
const CHANNEL_IDS = ['1', '2', '3'] as const;

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

export default {
  async fetch(request: Request, env: any, ctx: WorkerExecutionContext) {
    const url = new URL(request.url);
    const appId = env.SSO_APP_ID || 'coup-game';
    const appSecret = env.SSO_SECRET;

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
      await checkQuota(user);
      const result = await callAIChannel(channelId, env, { systemInstruction, userMessage });
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

      if (url.pathname === '/api/process') {
        const user = requireSession();
        if (request.method === 'GET') {
          const proc = await env.DB.prepare('SELECT * FROM process WHERE user_uuid = ?').bind(user.uuid).first() as any;
          return json({ state: proc ? JSON.parse(proc.state_json) : null });
        }
        if (request.method === 'POST') {
          const body = await request.json() as any;
          await env.DB.prepare('INSERT INTO process (user_uuid, game_id, state_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_uuid) DO UPDATE SET game_id=excluded.game_id, state_json=excluded.state_json, updated_at=excluded.updated_at')
            .bind(user.uuid, body.game_id, JSON.stringify(body.state), Date.now()).run();
          return json({ success: true });
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

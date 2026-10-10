import { AIChannelError, callAIChannel } from './services/aiGateway';
import { isRoomAiChannel, roomAiName, validateRoomDraft } from './services/rooms';
import { clearSessionCookie, createSessionCookie } from './services/sessionCookie';
import { initializeGameForSeats } from './utils/gameEngine';
import { DEFAULT_SITE_URL, normalizeSiteUrl, publicSeoPages, renderNotFoundHtml, renderPrivateHtml, renderPublicHtml, renderRobots, renderSitemap } from './seo';
export { RoomGame } from './roomGame';

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
        return (user?.uuid || user?.sub) ? user : null;
      } catch {
        return null;
      }
    };

    const getVerifiedSession = async () => {
      const token = parseCookies(request.headers.get('Cookie')).coup_session;
      const payload = token ? decodeJwt(token) : null;
      if (!token || !payload) return null;
      if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return null;
      const user = await verifyToken(token);
      if (!user) return null;
      return {
        uuid: user.uuid || user.sub,
        username: user.username || 'agent',
        name: user.name || user.username || 'Agent',
        role: user.role || payload.role || 'user',
        token,
      };
    };

    const session = await getVerifiedSession();
    const staleCookie = Boolean(parseCookies(request.headers.get('Cookie')).coup_session) && !session;

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
    const ensureRooms = async () => {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, owner_uuid TEXT NOT NULL, owner_is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, seat_count INTEGER NOT NULL, ai_channels_json TEXT NOT NULL, time_controls_json TEXT NOT NULL, durable_object_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, closed_at INTEGER)').run();
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS room_members (room_id TEXT NOT NULL, user_uuid TEXT NOT NULL, display_name TEXT NOT NULL, seat_index INTEGER NOT NULL, is_ready INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL, left_at INTEGER, PRIMARY KEY(room_id,user_uuid))').run();
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS room_invites (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by_uuid TEXT NOT NULL, expires_at INTEGER NOT NULL, max_uses INTEGER NOT NULL DEFAULT 1, use_count INTEGER NOT NULL DEFAULT 0, revoked_at INTEGER)').run();
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS room_snapshots (room_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state_json TEXT NOT NULL, clocks_json TEXT NOT NULL, saved_at INTEGER NOT NULL)').run();
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS room_events (room_id TEXT NOT NULL, revision INTEGER NOT NULL, actor_key TEXT NOT NULL, client_action_id TEXT NOT NULL, event_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(room_id, actor_key, client_action_id))').run();
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
      if (request.method === 'GET' || request.method === 'HEAD') {
        const siteUrl = normalizeSiteUrl(env.SITE_URL || DEFAULT_SITE_URL);
        const environment = env.ENVIRONMENT || 'preview';
        const canonicalHost = new URL(siteUrl).hostname;
        const redirectHost = environment === 'production' && (
          url.hostname.endsWith('.workers.dev') || url.hostname === `www.${canonicalHost}` ||
          (url.hostname === canonicalHost && url.protocol !== 'https:')
        );
        const trimmedPath = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
        if (redirectHost || trimmedPath !== url.pathname || url.pathname === '/index.html') {
          const destination = new URL(`${siteUrl}${url.pathname === '/index.html' ? '/' : trimmedPath}`);
          destination.search = url.search;
          return Response.redirect(destination.toString(), 308);
        }

        const previewHeaders = environment === 'production' ? {} : { 'X-Robots-Tag': 'noindex, nofollow' };
        if (url.pathname === '/robots.txt') return new Response(request.method === 'HEAD' ? null : renderRobots(siteUrl), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600', ...previewHeaders },
        });
        if (url.pathname === '/sitemap.xml') return new Response(request.method === 'HEAD' ? null : renderSitemap(siteUrl), {
          headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600', ...previewHeaders },
        });

        if (!url.pathname.startsWith('/api/')) {
          const page = publicSeoPages[url.pathname];
          const privateRoute = url.pathname === '/play' || url.pathname === '/game' ||
            url.pathname === '/game/rules' || url.pathname === '/sso-callback';
          const roomMatch = url.pathname.match(/^\/game\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
          let roomExists = Boolean(roomMatch && !session);
          if (roomMatch && session) {
            roomExists = Boolean(await env.DB.prepare('SELECT id FROM rooms WHERE id = ?').bind(roomMatch[1]).first());
          }
          if (page || privateRoute || roomExists || !url.pathname.startsWith('/assets/')) {
            const asset = await env.ASSETS.fetch(new Request(new URL('/', url), { method: 'GET' }));
            const shell = await asset.text();
            const status = page || privateRoute || roomExists ? 200 : 404;
            const html = page
              ? renderPublicHtml(shell, page, { siteUrl, environment, verification: env.GOOGLE_SITE_VERIFICATION })
              : status === 404 ? renderNotFoundHtml(shell) : renderPrivateHtml(shell);
            const isIndexable = Boolean(page && environment === 'production');
            return new Response(request.method === 'HEAD' ? null : html, {
              status,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': isIndexable ? 'public, max-age=0, s-maxage=300' : 'private, no-store',
                ...(!isIndexable ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
              },
            });
          }
          return env.ASSETS.fetch(request);
        }
      }

      const roomIdFromPath = (suffix = '') => url.pathname.startsWith('/api/rooms/') ? decodeURIComponent(url.pathname.slice('/api/rooms/'.length, suffix ? -suffix.length : undefined)) : null;
      const hashInvite = async (token: string) => {
        const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      };
      const newInviteToken = () => {
        const bytes = crypto.getRandomValues(new Uint8Array(24));
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      };
      const normalizeTimeControls = (value: any) => {
        const normalize = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 10_000 && candidate <= 86_400_000 ? Math.floor(candidate) : undefined;
        return { stepLimitMs: normalize(value?.stepLimitMs), totalLimitMs: normalize(value?.totalLimitMs) };
      };
      const getRoom = async (id: string) => await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first() as any;
      // Pin newly-created room objects to North America for upstream AI availability.
      // Cloudflare treats this as a best-effort hint; existing object locations do not move.
      const roomStub = (room: any) => env.ROOM_GAME.get(env.ROOM_GAME.idFromName(room.durable_object_id), { locationHint: 'enam' });
      const getMember = async (id: string, userId: string) => await env.DB.prepare('SELECT * FROM room_members WHERE room_id = ? AND user_uuid = ? AND left_at IS NULL').bind(id, userId).first() as any;
      const activeMembers = async (id: string) => (await env.DB.prepare('SELECT * FROM room_members WHERE room_id = ? AND left_at IS NULL ORDER BY seat_index').bind(id).all() as any).results as any[];
      const roomDetails = (room: any, members: any[], member: any | null, spectator = false) => ({
        id: room.id,
        ownerUuid: room.owner_uuid,
        status: room.status,
        seatCount: room.seat_count,
        aiChannels: JSON.parse(room.ai_channels_json),
        aiNames: (JSON.parse(room.ai_channels_json) as string[]).map(channel => roomAiName(channel as any)),
        timeControls: JSON.parse(room.time_controls_json),
        me: spectator || !member ? null : { ready: Boolean(member.is_ready) },
        members: members.map(item => ({ uuid: item.user_uuid, name: item.display_name, seatIndex: item.seat_index, ready: Boolean(item.is_ready) })),
        spectator,
      });
      const spectatorInvite = async (id: string, token: string) => {
        const invite = await env.DB.prepare('SELECT * FROM room_invites WHERE room_id = ? AND token_hash = ? AND revoked_at IS NULL').bind(id, await hashInvite(token)).first() as any;
        const room = await getRoom(id);
        if (!invite || !room || invite.expires_at <= Date.now() || (room.status !== 'started' && room.status !== 'paused')) throw new HttpError(403, 'Spectator invitation is unavailable');
        return room;
      };
      const requireRoomMember = async (id: string, user: NonNullable<typeof session>) => {
        const room = await getRoom(id); if (!room) throw new HttpError(404, 'Room not found');
        const member = await getMember(id, user.uuid); if (!member) throw new HttpError(403, 'Room membership required');
        return { room, member };
      };
      const requireRoomOwner = async (id: string, user: NonNullable<typeof session>) => {
        const { room } = await requireRoomMember(id, user);
        if (room.owner_uuid !== user.uuid) throw new HttpError(403, 'Only the room owner can do that');
        return room;
      };
      const createInvite = async (roomId: string, creatorUuid: string) => {
        const token = newInviteToken(); const now = Date.now();
        await env.DB.prepare('INSERT INTO room_invites (id, room_id, token_hash, created_by_uuid, expires_at, max_uses, use_count) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), roomId, await hashInvite(token), creatorUuid, now + 86_400_000, 1, 0).run();
        return { token, expiresAt: now + 86_400_000 };
      };

      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const user = requireSession(); const body = await request.json() as any;
        const draft = validateRoomDraft({ seatCount: body?.seatCount, aiChannels: body?.aiChannels || [] });
        if (!draft.valid) throw new HttpError(400, 'error' in draft ? draft.error : 'Invalid room');
        const aiChannels = body.aiChannels.filter(isRoomAiChannel) as ChannelId[];
        const timeControls = normalizeTimeControls(body.timeControls);
        await ensureRooms();
        // Health checks are real, server-side calls and deliberately happen before any D1 write.
        for (const channelId of aiChannels) await callWithQuota(user, channelId, 'You are a service health check. Reply with one valid JSON object only.', '{"status":"ok"}');
        const id = crypto.randomUUID(); const now = Date.now();
        await env.DB.prepare('INSERT INTO rooms (id,owner_uuid,owner_is_admin,status,seat_count,ai_channels_json,time_controls_json,durable_object_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, user.uuid, user.role === 'admin' ? 1 : 0, 'open', body.seatCount, JSON.stringify(aiChannels), JSON.stringify(timeControls), id, now, now).run();
        await env.DB.prepare('INSERT INTO room_members (room_id,user_uuid,display_name,seat_index,is_ready,joined_at) VALUES (?,?,?,?,?,?)').bind(id, user.uuid, user.name, 0, 0, now).run();
        const invite = await createInvite(id, user.uuid);
        return json({ id, status: 'open', invite: { url: `${url.origin}/game?invite=${invite.token}`, expiresAt: invite.expiresAt } }, 201);
      }

      if (url.pathname === '/api/rooms' && request.method === 'GET') {
        const user = requireSession(); await ensureRooms();
        const { results } = await env.DB.prepare('SELECT r.*, m.is_ready FROM rooms r JOIN room_members m ON m.room_id = r.id WHERE m.user_uuid = ? AND m.left_at IS NULL ORDER BY r.updated_at DESC').bind(user.uuid).all() as any;
        return json(await Promise.all(results.map(async (room: any) => ({
          id: room.id,
          status: room.status,
          seatCount: room.seat_count,
          aiChannels: JSON.parse(room.ai_channels_json),
          aiNames: (JSON.parse(room.ai_channels_json) as string[]).map(channel => roomAiName(channel as any)),
          timeControls: JSON.parse(room.time_controls_json),
          isReady: Boolean(room.is_ready),
          memberCount: (await activeMembers(room.id)).length,
        }))));
      }

      if (url.pathname.startsWith('/api/rooms/invite/') && request.method === 'GET') {
        const user = requireSession(); await ensureRooms(); const token = decodeURIComponent(url.pathname.slice('/api/rooms/invite/'.length));
        const invite = await env.DB.prepare('SELECT * FROM room_invites WHERE token_hash = ? AND revoked_at IS NULL').bind(await hashInvite(token)).first() as any;
        if (!invite || invite.expires_at <= Date.now()) throw new HttpError(404, 'Invitation is unavailable');
        const room = await getRoom(invite.room_id); if (!room) throw new HttpError(404, 'Room not found');
        if (room.status === 'started' || room.status === 'paused') return json({ room: { id: room.id, status: room.status, seatCount: room.seat_count, aiChannels: JSON.parse(room.ai_channels_json) }, canJoin: false, canWatch: true });
        if (room.status !== 'open') throw new HttpError(409, 'Room is not accepting members');
        const member = await getMember(room.id, user.uuid);
        if (invite.use_count >= invite.max_uses && !member) throw new HttpError(404, 'Invitation is unavailable');
        return json({ room: { id: room.id, status: room.status, seatCount: room.seat_count, aiChannels: JSON.parse(room.ai_channels_json) }, canJoin: !member, canWatch: false });
      }

      if (url.pathname === '/api/admin/rooms' && request.method === 'GET') {
        requireAdmin(); await ensureRooms();
        const { results } = await env.DB.prepare('SELECT * FROM rooms WHERE status != ? ORDER BY updated_at DESC').bind('closed').all() as any;
        return json(await Promise.all(results.map(async (room: any) => {
          const members = await activeMembers(room.id);
          return { ...roomDetails(room, members, null), ownerName: members.find(member => member.user_uuid === room.owner_uuid)?.display_name || room.owner_uuid, memberNames: members.map(member => member.display_name) };
        })));
      }

      if (url.pathname.startsWith('/api/admin/rooms/') && url.pathname.endsWith('/watch') && request.method === 'GET') {
        requireAdmin(); await ensureRooms(); const id = decodeURIComponent(url.pathname.slice('/api/admin/rooms/'.length, -'/watch'.length)); const room = await getRoom(id);
        if (!room || (room.status !== 'started' && room.status !== 'paused')) throw new HttpError(409, 'Room is not active');
        return json(roomDetails(room, await activeMembers(id), null, true));
      }

      if (url.pathname.startsWith('/api/admin/rooms/') && url.pathname.endsWith('/close') && request.method === 'POST') {
        requireAdmin(); await ensureRooms(); const id = decodeURIComponent(url.pathname.slice('/api/admin/rooms/'.length, -'/close'.length)); const room = await getRoom(id);
        if (!room) throw new HttpError(404, 'Room not found');
        if ((room.status === 'started' || room.status === 'paused') && env.ROOM_GAME) {
          const stub = roomStub(room);
          await stub.fetch(new Request('https://room.internal/close', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Room-Internal': '1', 'X-Room-Actor': 'admin' }, body: JSON.stringify({ type: 'close' }) }));
        }
        await env.DB.prepare('UPDATE rooms SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?').bind('closed', Date.now(), Date.now(), id).run();
        return json({ status: 'closed' });
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/join') && request.method === 'POST') {
        const user = requireSession(); await ensureRooms(); const id = roomIdFromPath('/join'); if (!id) throw new HttpError(404, 'Room not found');
        const room = await getRoom(id); if (!room) throw new HttpError(404, 'Room not found'); if (room.status !== 'open') throw new HttpError(409, 'Room is not accepting members');
        if (await getMember(id, user.uuid)) return json({ id, joined: true });
        const body = await request.json() as any; if (typeof body?.inviteToken !== 'string') throw new HttpError(400, 'An invitation is required');
        const invite = await env.DB.prepare('SELECT * FROM room_invites WHERE room_id = ? AND token_hash = ? AND revoked_at IS NULL').bind(id, await hashInvite(body.inviteToken)).first() as any;
        if (!invite || invite.expires_at <= Date.now() || invite.use_count >= invite.max_uses) throw new HttpError(403, 'Invitation is unavailable');
        const members = await activeMembers(id); const aiCount = JSON.parse(room.ai_channels_json).length;
        if (members.length + aiCount >= room.seat_count) throw new HttpError(409, 'Room is full');
        const now = Date.now();
        await env.DB.prepare('INSERT INTO room_members (room_id,user_uuid,display_name,seat_index,is_ready,joined_at) VALUES (?,?,?,?,?,?)').bind(id, user.uuid, user.name, members.length, 0, now).run();
        await env.DB.prepare('UPDATE room_invites SET use_count = use_count + 1 WHERE id = ?').bind(invite.id).run();
        await env.DB.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').bind(now, id).run();
        return json({ id, joined: true });
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/ready') && request.method === 'POST') {
        const user = requireSession(); const id = roomIdFromPath('/ready'); if (!id) throw new HttpError(404, 'Room not found'); const { room } = await requireRoomMember(id, user);
        if (room.status !== 'open') throw new HttpError(409, 'Room has already started'); const body = await request.json() as any;
        await env.DB.prepare('UPDATE room_members SET is_ready = ? WHERE room_id = ? AND user_uuid = ? AND left_at IS NULL').bind(body?.ready === false ? 0 : 1, id, user.uuid).run();
        return json({ ready: body?.ready !== false });
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/invite') && request.method === 'POST') {
        const user = requireSession(); const id = roomIdFromPath('/invite'); if (!id) throw new HttpError(404, 'Room not found'); const room = await requireRoomOwner(id, user);
        if (room.status !== 'open') throw new HttpError(409, 'Room is not accepting members'); const invite = await createInvite(id, user.uuid);
        return json({ url: `${url.origin}/game?invite=${invite.token}`, expiresAt: invite.expiresAt }, 201);
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/start') && request.method === 'POST') {
        const user = requireSession(); const id = roomIdFromPath('/start'); if (!id) throw new HttpError(404, 'Room not found'); const room = await requireRoomOwner(id, user);
        if (room.status !== 'open') throw new HttpError(409, 'Room has already started'); const members = await activeMembers(id); const channels = JSON.parse(room.ai_channels_json) as string[];
        if (members.length + channels.length !== room.seat_count) throw new HttpError(409, 'Room seats are not full');
        if (members.some(member => !member.is_ready)) throw new HttpError(409, 'Every human member must be ready');
        if (!env.ROOM_GAME) throw new HttpError(503, 'Realtime room service is unavailable');
        const game = initializeGameForSeats([...members.map(member => ({ id: member.user_uuid, name: member.display_name, isAI: false })), ...channels.map(channel => ({ id: `room-ai-${channel}`, name: roomAiName(channel as any), isAI: true }))]);
        game.roomId = id;
        const controls = JSON.parse(room.time_controls_json); const remaining = Object.fromEntries(members.map(member => [member.user_uuid, controls.totalLimitMs || 0]));
        const stub = roomStub(room);
        const initialized = await stub.fetch(new Request('https://room.internal/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Room-Internal': '1', 'X-Room-Actor': user.uuid }, body: JSON.stringify({ type: 'initialize', room: { roomId: id, owner: { uuid: room.owner_uuid, isAdmin: Boolean(room.owner_is_admin) }, aiChannels: channels, state: game, config: controls, remaining } }) }));
        if (!initialized.ok) throw new HttpError(502, 'Room initialization failed');
        await env.DB.prepare('UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?').bind('started', Date.now(), id).run();
        return json({ id, status: 'started' });
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/close') && request.method === 'POST') {
        const user = requireSession(); const id = roomIdFromPath('/close'); if (!id) throw new HttpError(404, 'Room not found'); const room = await requireRoomOwner(id, user);
        if ((room.status === 'started' || room.status === 'paused') && env.ROOM_GAME) {
          const stub = roomStub(room);
          await stub.fetch(new Request('https://room.internal/close', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Room-Internal': '1', 'X-Room-Actor': user.uuid }, body: JSON.stringify({ type: 'close' }) }));
        }
        await env.DB.prepare('UPDATE rooms SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?').bind('closed', Date.now(), Date.now(), id).run(); return json({ status: 'closed' });
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/resume') && request.method === 'POST') {
        const user = requireSession(); const id = roomIdFromPath('/resume'); if (!id) throw new HttpError(404, 'Room not found'); const room = await requireRoomOwner(id, user);
        if (room.status !== 'paused') throw new HttpError(409, 'Room is not paused'); if (!env.ROOM_GAME) throw new HttpError(503, 'Realtime room service is unavailable');
        const stub = roomStub(room);
        const resumed = await stub.fetch(new Request('https://room.internal/resume', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Room-Internal': '1', 'X-Room-Actor': user.uuid }, body: JSON.stringify({ type: 'resume' }) }));
        if (!resumed.ok) throw new HttpError(502, 'Room resume failed');
        return json({ status: 'started' });
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/pause') && request.method === 'POST') {
        const user = requireSession(); const id = roomIdFromPath('/pause'); if (!id) throw new HttpError(404, 'Room not found'); const room = await requireRoomOwner(id, user);
        if (room.status !== 'started') throw new HttpError(409, 'Room is not active'); if (!env.ROOM_GAME) throw new HttpError(503, 'Realtime room service is unavailable');
        const stub = roomStub(room);
        const paused = await stub.fetch(new Request('https://room.internal/pause', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Room-Internal': '1', 'X-Room-Actor': user.uuid }, body: JSON.stringify({ type: 'pause' }) }));
        if (!paused.ok) throw new HttpError(502, 'Room pause failed'); return json({ status: 'paused' });
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/ai-recovery') && request.method === 'POST') {
        const user = requireSession(); const id = roomIdFromPath('/ai-recovery'); if (!id) throw new HttpError(404, 'Room not found');
        const room = await requireRoomOwner(id, user);
        if (room.status !== 'started') throw new HttpError(409, 'Room is not active');
        if (!env.ROOM_GAME) throw new HttpError(503, 'Realtime room service is unavailable');
        const body = await request.json() as any;
        if (body?.type !== 'retry-ai' && body?.type !== 'switch-ai') throw new HttpError(400, 'Invalid AI recovery action');
        if (body.type === 'switch-ai' && !isRoomAiChannel(body.channelId)) throw new HttpError(400, 'Invalid AI channel');
        const recovered = await roomStub(room).fetch(new Request('https://room.internal/ai-recovery', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Room-Internal': '1', 'X-Room-Actor': user.uuid }, body: JSON.stringify(body),
        }));
        const result = await recovered.json().catch(() => ({})) as any;
        if (!recovered.ok) throw new HttpError(recovered.status, result.error || 'AI recovery failed');
        return json(result);
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/leave') && request.method === 'POST') {
        const user = requireSession(); const id = roomIdFromPath('/leave'); if (!id) throw new HttpError(404, 'Room not found'); const { room } = await requireRoomMember(id, user);
        if (room.status !== 'open') throw new HttpError(409, 'Players cannot leave a started room'); if (room.owner_uuid === user.uuid) throw new HttpError(409, 'The owner must close the room instead');
        await env.DB.prepare('UPDATE room_members SET left_at = ?, is_ready = 0 WHERE room_id = ? AND user_uuid = ?').bind(Date.now(), id, user.uuid).run(); return json({ left: true });
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/kick') && request.method === 'POST') {
        const user = requireSession(); const id = roomIdFromPath('/kick'); if (!id) throw new HttpError(404, 'Room not found'); const room = await requireRoomOwner(id, user); const body = await request.json() as any;
        if (room.status !== 'open') throw new HttpError(409, 'Players cannot be removed after start'); if (!body?.userUuid || body.userUuid === user.uuid) throw new HttpError(400, 'Invalid member');
        const result = await env.DB.prepare('UPDATE room_members SET left_at = ?, is_ready = 0 WHERE room_id = ? AND user_uuid = ? AND left_at IS NULL').bind(Date.now(), id, body.userUuid).run() as any;
        if (!result.meta?.changes) throw new HttpError(404, 'Member not found'); return json({ removed: true });
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/watch') && request.method === 'GET') {
        const user = requireSession(); await ensureRooms(); const id = roomIdFromPath('/watch'); if (!id) throw new HttpError(404, 'Room not found');
        const room = await spectatorInvite(id, url.searchParams.get('invite') || '');
        return json(roomDetails(room, await activeMembers(id), null, true));
      }

      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/socket') && request.method === 'GET') {
        const user = requireSession(); const id = roomIdFromPath('/socket'); if (!id) throw new HttpError(404, 'Room not found'); const room = await getRoom(id); if (!room) throw new HttpError(404, 'Room not found');
        const adminWatch = url.searchParams.get('admin') === '1'; const inviteToken = url.searchParams.get('invite');
        let spectator = false;
        if (adminWatch) { requireAdmin(); spectator = true; }
        else if (!(await getMember(id, user.uuid))) { await spectatorInvite(id, inviteToken || ''); spectator = true; }
        if (room.status !== 'started' && room.status !== 'paused') throw new HttpError(409, 'Room has not started'); if (!env.ROOM_GAME) throw new HttpError(503, 'Realtime room service is unavailable');
        const stub = roomStub(room);
        return stub.fetch(new Request('https://room.internal/socket', { headers: { Upgrade: 'websocket', 'X-Room-Actor': spectator ? '' : user.uuid, 'X-Room-Spectator': spectator ? '1' : '0' } }));
      }

      if (url.pathname.startsWith('/api/rooms/') && request.method === 'GET') {
        const user = requireSession(); await ensureRooms(); const id = roomIdFromPath(); if (!id || id.includes('/')) throw new HttpError(404, 'Room not found'); const { room, member } = await requireRoomMember(id, user); return json(roomDetails(room, await activeMembers(id), member));
      }
      if (url.pathname === '/api/logout' && request.method === 'POST') {
        return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie(url.hostname) });
      }

      if (url.pathname === '/api/sso-callback' && request.method === 'POST') {
        const body = await request.json() as any;
        if (!body?.token) throw new HttpError(400, 'Missing token');
        const callbackPayload = decodeJwt(body.token);
        if (typeof callbackPayload?.exp === 'number' && callbackPayload.exp * 1000 <= Date.now()) throw new HttpError(401, 'Token expired');
        const user = await verifyToken(body.token);
        if (!user) throw new HttpError(401, 'SSO verification failed');
        await env.DB.prepare('INSERT INTO users (uuid, user_id, name, username, token, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, username=excluded.username, token=excluded.token, last_seen=excluded.last_seen')
          .bind(user.uuid, user.user_id || 0, user.name || user.username || 'Agent', user.username || 'agent', body.token, Date.now(), Date.now()).run();
        return json({ success: true }, 200, { 'Set-Cookie': createSessionCookie(body.token, url.hostname) });
      }

      if (url.pathname === '/api/me' && request.method === 'GET') {
        const user = requireSession();
        const localUser = await env.DB.prepare('SELECT * FROM users WHERE uuid = ?').bind(user.uuid).first() as any;
        if (localUser?.is_paused) return json({ error: 'paused' }, 403, { 'Set-Cookie': clearSessionCookie(url.hostname) });
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
      if (error instanceof HttpError) return json({ error: error.message }, error.status, error.status === 401 && staleCookie ? { 'Set-Cookie': clearSessionCookie(url.hostname) } : {});
      if (error instanceof AIChannelError) return json({ error: error.message }, error.status);
      console.error('[WORKER_ERROR]', error?.message || error);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};

export type AppRoute =
  | { page: 'home' }
  | { page: 'solo' }
  | { page: 'rooms' }
  | { page: 'invite'; token: string }
  | { page: 'room'; roomId: string }
  | { page: 'rules' }
  | { page: 'publicRules' }
  | { page: 'callback' }
  | { page: 'notFound' };

export const pendingInviteStorageKey = 'coup_pending_room_invite';

export function invitePathForToken(token: string | null): string | null {
  return token && /^[a-f0-9]{32,128}$/i.test(token) ? `/game?invite=${encodeURIComponent(token)}` : null;
}

export function resolveAppRoute(pathname: string, search = ''): AppRoute {
  if (pathname === '/rules') return { page: 'publicRules' };
  if (pathname === '/sso-callback') return { page: 'callback' };
  if (pathname === '/play') return { page: 'solo' };
  if (pathname === '/game') {
    const params = new URLSearchParams(search);
    return params.has('invite') ? { page: 'invite', token: params.get('invite') || '' } : { page: 'rooms' };
  }
  if (pathname === '/game/rules') return { page: 'rules' };

  const match = pathname.match(/^\/game\/([^/]+)$/);
  if (match) {
    try {
      const roomId = decodeURIComponent(match[1]);
      if (roomId && !roomId.includes('/')) return { page: 'room', roomId };
    } catch {
      // Malformed room links return to the hub instead of breaking app startup.
    }
  }

  return pathname === '/' ? { page: 'home' } : { page: 'notFound' };
}

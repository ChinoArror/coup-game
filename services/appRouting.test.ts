import { describe, expect, it } from 'vitest';
import { invitePathForToken, resolveAppRoute } from './appRouting';

describe('authenticated app routes', () => {
  it('uses the post-login root as the game hub and gives direct play its own route', () => {
    expect(resolveAppRoute('/')).toEqual({ page: 'home' });
    expect(resolveAppRoute('/play')).toEqual({ page: 'solo' });
  });

  it('preserves room, room-detail, and rules routes', () => {
    expect(resolveAppRoute('/game')).toEqual({ page: 'rooms' });
    expect(resolveAppRoute('/game/room-123')).toEqual({ page: 'room', roomId: 'room-123' });
    expect(resolveAppRoute('/game/rules')).toEqual({ page: 'rules' });
  });

  it('opens a room invitation in its own decision screen', () => {
    const token = 'a'.repeat(48);
    expect(resolveAppRoute('/game', `?invite=${token}`)).toEqual({ page: 'invite', token });
    expect(resolveAppRoute('/game', '?invite=')).toEqual({ page: 'invite', token: '' });
    expect(invitePathForToken(token)).toBe(`/game?invite=${token}`);
    expect(invitePathForToken('../game')).toBeNull();
  });

  it('distinguishes public rules and SSO callback from missing paths', () => {
    expect(resolveAppRoute('/rules')).toEqual({ page: 'publicRules' });
    expect(resolveAppRoute('/sso-callback')).toEqual({ page: 'callback' });
    expect(resolveAppRoute('/unknown')).toEqual({ page: 'notFound' });
    expect(resolveAppRoute('/game/%E0%A4%A')).toEqual({ page: 'notFound' });
  });
});

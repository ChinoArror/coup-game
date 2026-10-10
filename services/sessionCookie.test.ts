import { describe, expect, it } from 'vitest';
import { clearSessionCookie, createSessionCookie } from './sessionCookie';

describe('session cookie host scope', () => {
  it('shares the session across Aryuki production subdomains', () => {
    expect(createSessionCookie('sample-token', 'coup.aryuki.com')).toBe(
      'coup_session=sample-token; Path=/; Domain=.aryuki.com; Max-Age=604800; HttpOnly; Secure; SameSite=Lax',
    );
    expect(clearSessionCookie('accounts.aryuki.com')).toContain('Domain=.aryuki.com');
  });

  it('keeps local sessions host-only so localhost accepts them', () => {
    expect(createSessionCookie('sample-token', 'localhost')).toBe(
      'coup_session=sample-token; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax',
    );
    expect(createSessionCookie('sample-token', '127.0.0.1')).not.toContain('Domain=');
    expect(clearSessionCookie('localhost')).not.toContain('Domain=');
  });
});

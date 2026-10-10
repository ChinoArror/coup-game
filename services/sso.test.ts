import { describe, expect, it } from 'vitest';
import { cleanSsoCallbackPath, createSsoLoginUrl, createSsoLogoutUrl } from './sso';

describe('SSO browser routing', () => {
  it('starts login with the deployed subapp identifier', () => {
    expect(createSsoLoginUrl('https://coup.aryuki.com')).toBe(
      'https://accounts.aryuki.com/login?app_id=coup-shadow-protocol&redirect=https%3A%2F%2Fcoup.aryuki.com%2Fsso-callback',
    );
  });

  it('builds the Auth Center logout URL with an encoded return address', () => {
    expect(createSsoLogoutUrl('https://coup.aryuki.com/')).toBe(
      'https://accounts.aryuki.com/logout?redirect=https%3A%2F%2Fcoup.aryuki.com%2F',
    );
  });

  it('removes the callback route and its query parameters from the browser address', () => {
    expect(cleanSsoCallbackPath('/sso-callback')).toBe('/');
  });
});

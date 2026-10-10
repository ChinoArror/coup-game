import { describe, expect, it } from 'vitest';
import { cleanSsoCallbackPath, createSsoLoginUrl } from './sso';

describe('SSO browser routing', () => {
  it('starts login with the deployed subapp identifier', () => {
    expect(createSsoLoginUrl('https://coup.aryuki.com')).toBe(
      'https://accounts.aryuki.com/?client_id=coup-shadow-protocol&redirect=https%3A%2F%2Fcoup.aryuki.com%2Fsso-callback',
    );
  });

  it('removes the callback route and its query parameters from the browser address', () => {
    expect(cleanSsoCallbackPath('/sso-callback')).toBe('/');
  });
});

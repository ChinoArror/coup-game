const SSO_URL = 'https://accounts.aryuki.com';
const SSO_APP_ID = 'coup-shadow-protocol';
export const SSO_LOGOUT_URL = 'https://accounts.aryuki.com/logout';

export function createSsoLoginUrl(origin: string): string {
  const redirect = `${origin}/sso-callback`;
  return `${SSO_URL}/login?${new URLSearchParams({ app_id: SSO_APP_ID, redirect }).toString()}`;
}

export function createSsoLogoutUrl(returnTo: string): string {
  return `${SSO_URL}/logout?redirect=${encodeURIComponent(returnTo)}`;
}

export function cleanSsoCallbackPath(pathname: string): string {
  return pathname === '/sso-callback' ? '/' : pathname;
}

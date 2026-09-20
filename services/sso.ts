const SSO_URL = 'https://accounts.aryuki.com';
const SSO_APP_ID = 'coup-shadow-protocol';

export function createSsoLoginUrl(origin: string): string {
  const redirect = `${origin}/sso-callback`;
  return `${SSO_URL}/?${new URLSearchParams({ client_id: SSO_APP_ID, redirect }).toString()}`;
}

export function cleanSsoCallbackPath(pathname: string): string {
  return pathname === '/sso-callback' ? '/' : pathname;
}

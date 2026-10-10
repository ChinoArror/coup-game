const cookieDomain = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'aryuki.com' || normalized.endsWith('.aryuki.com')
    ? '; Domain=.aryuki.com'
    : '';
};

export function createSessionCookie(token: string, hostname: string): string {
  return `coup_session=${token}; Path=/${cookieDomain(hostname)}; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(hostname: string): string {
  return `coup_session=; Path=/${cookieDomain(hostname)}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

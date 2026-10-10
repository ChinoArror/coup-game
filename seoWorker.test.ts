import { describe, expect, it, vi } from 'vitest';
import worker from './worker';

const shell = '<!doctype html><html lang="en"><head><title>Coup: Shadow Protocol</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
const environment = (environment = 'production') => ({
  SITE_URL: 'https://coup.aryuki.com', ENVIRONMENT: environment,
  ASSETS: { fetch: vi.fn(async () => new Response(shell, { headers: { 'Content-Type': 'text/html' } })) },
});
const fetchPath = (path: string, env = environment()) => worker.fetch(new Request(`https://coup.aryuki.com${path}`), env, { waitUntil() {} });

describe('Worker SEO routes', () => {
  it('serves indexable public HTML, robots, and an XML sitemap', async () => {
    const env = environment();
    const home = await fetchPath('/', env);
    const rules = await fetchPath('/rules', env);
    const robots = await fetchPath('/robots.txt', env);
    const sitemap = await fetchPath('/sitemap.xml', env);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('<h1');
    expect(rules.status).toBe(200);
    expect(await rules.text()).toContain('COUP 行动准则');
    expect(robots.headers.get('Content-Type')).toContain('text/plain');
    expect(await robots.text()).toContain('Sitemap: https://coup.aryuki.com/sitemap.xml');
    expect(sitemap.headers.get('Content-Type')).toContain('application/xml');
    expect(await sitemap.text()).toContain('<urlset');
  });

  it('returns a real noindex 404 and keeps game pages out of the index', async () => {
    const missing = await fetchPath('/missing-seo-page');
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('noindex');
    const game = await fetchPath('/game');
    expect(game.status).toBe(200);
    expect(game.headers.get('X-Robots-Tag')).toContain('noindex');
    const signedOutRoom = await fetchPath('/game/11111111-1111-4111-8111-111111111111');
    expect(signedOutRoom.status).toBe(200);
    expect(signedOutRoom.headers.get('X-Robots-Tag')).toContain('noindex');
  });

  it('redirects duplicate and workers.dev URLs to the canonical host', async () => {
    const trailing = await fetchPath('/rules/?utm_source=example');
    expect(trailing.status).toBe(308);
    expect(trailing.headers.get('Location')).toBe('https://coup.aryuki.com/rules?utm_source=example');
    const workersDev = await worker.fetch(new Request('https://coup-shadow-protocol.yysy-rhy.workers.dev/rules'), environment(), { waitUntil() {} });
    expect(workersDev.status).toBe(308);
    expect(workersDev.headers.get('Location')).toBe('https://coup.aryuki.com/rules');
  });

  it('noindexes preview HTML without blocking production', async () => {
    const preview = await fetchPath('/', environment('preview'));
    const production = await fetchPath('/');
    expect(preview.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(await preview.text()).toContain('noindex,nofollow');
    expect(production.headers.get('X-Robots-Tag')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { buildCanonicalUrl, publicSeoPages, renderPublicHtml, renderRobots, renderSitemap } from './seo';

const shell = '<!doctype html><html lang="en"><head><title>Coup: Shadow Protocol</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';

describe('public SEO output', () => {
  it('uses only the configured production origin and removes trailing slashes and tracking queries', () => {
    expect(buildCanonicalUrl('/rules/?utm_source=test', 'https://coup.aryuki.com')).toBe('https://coup.aryuki.com/rules');
    expect(buildCanonicalUrl('/', 'https://coup.aryuki.com')).toBe('https://coup.aryuki.com/');
    expect(() => buildCanonicalUrl('//other.example/rules', 'https://coup.aryuki.com')).toThrow();
  });

  it('renders unique metadata and meaningful content in the first HTML response', () => {
    const home = renderPublicHtml(shell, publicSeoPages['/'], { siteUrl: 'https://coup.aryuki.com', environment: 'production' });
    const rules = renderPublicHtml(shell, publicSeoPages['/rules'], { siteUrl: 'https://coup.aryuki.com', environment: 'production' });

    expect(home).toContain('<link rel="canonical" href="https://coup.aryuki.com/"');
    expect(home).toContain('<meta name="description"');
    expect(home).toContain('<meta property="og:url" content="https://coup.aryuki.com/"');
    expect(home).toContain('application/ld+json');
    expect(home).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
    expect(home).toContain('href="/rules"');
    expect(home).not.toContain('name="robots" content="noindex');
    expect(rules).toContain('<html lang="zh-CN">');
    expect(rules).toContain('<link rel="canonical" href="https://coup.aryuki.com/rules"');
    expect(rules).toContain('COUP 行动准则');
    expect(rules).toContain('href="/"');
    expect(rules.match(/<title>(.*?)<\/title>/)?.[1]).not.toBe(home.match(/<title>(.*?)<\/title>/)?.[1]);
  });

  it('emits the optional verification token only on production pages', () => {
    const production = renderPublicHtml(shell, publicSeoPages['/'], { siteUrl: 'https://coup.aryuki.com', environment: 'production', verification: 'verify-token' });
    const preview = renderPublicHtml(shell, publicSeoPages['/'], { siteUrl: 'https://coup.aryuki.com', environment: 'preview', verification: 'verify-token' });
    expect(production).toContain('<meta name="google-site-verification" content="verify-token">');
    expect(preview).not.toContain('google-site-verification');
  });

  it('builds robots and sitemap from the public page registry without private URLs', () => {
    const robots = renderRobots('https://coup.aryuki.com');
    const sitemap = renderSitemap('https://coup.aryuki.com');
    expect(robots).toContain('Sitemap: https://coup.aryuki.com/sitemap.xml');
    expect(sitemap).toContain('<loc>https://coup.aryuki.com/</loc>');
    expect(sitemap).toContain('<loc>https://coup.aryuki.com/rules</loc>');
    expect(sitemap).not.toMatch(/workers\.dev|localhost|\/game|\/play|<lastmod>/);
  });
});

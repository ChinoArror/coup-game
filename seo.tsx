import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server.browser';
import Login from './Login';
import NotFound from './NotFound';
import Rules from './Rules';

export const DEFAULT_SITE_URL = 'https://coup.aryuki.com';

type SeoOptions = {
  siteUrl: string;
  environment: string;
  verification?: string;
};

type PublicSeoPage = {
  pathname: string;
  lang: string;
  title: string;
  description: string;
  render: () => ReactElement;
  structuredData?: 'WebSite';
};

// Public pages are registered once here. The sitemap and edge HTML use this same list.
export const publicSeoPages: Record<string, PublicSeoPage> = {
  '/': {
    pathname: '/', lang: 'en',
    title: 'Play Coup with AI or Friends | Coup: Shadow Protocol',
    description: 'Play Coup against Alapha and Beta in a direct match, or create a private room with friends and AI players. Sign in to take your seat.',
    render: () => createElement(Login, { invited: false }), structuredData: 'WebSite',
  },
  '/rules': {
    pathname: '/rules', lang: 'zh-CN',
    title: 'Coup 游戏规则与行动说明 | Coup: Shadow Protocol',
    description: '了解 Coup 的身份、行动、质疑、阻挡、强制政变及房间计时规则，开始与朋友或 AI 对战。',
    render: () => createElement(Rules, { backHref: '/' }),
  },
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export function normalizeSiteUrl(value = DEFAULT_SITE_URL): string {
  const site = new URL(value);
  if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) {
    throw new Error('SITE_URL must be a bare HTTPS origin');
  }
  return site.origin;
}

export function buildCanonicalUrl(pathname: string, siteUrl = DEFAULT_SITE_URL): string {
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) {
    throw new Error('Canonical path must be a local absolute path');
  }
  const parsed = new URL(pathname, `${normalizeSiteUrl(siteUrl)}/`);
  const cleanPath = parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/+$/, '');
  return `${normalizeSiteUrl(siteUrl)}${cleanPath}`;
}

export function renderRobots(siteUrl = DEFAULT_SITE_URL): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${normalizeSiteUrl(siteUrl)}/sitemap.xml\n`;
}

export function renderSitemap(siteUrl = DEFAULT_SITE_URL): string {
  const urls = Object.values(publicSeoPages).map(page =>
    `  <url><loc>${escapeHtml(buildCanonicalUrl(page.pathname, siteUrl))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function replaceShell(shell: string, head: string, content: string, lang: string): string {
  if (!/<div id="root"><\/div>/.test(shell) || !/<\/head>/i.test(shell)) throw new Error('Vite HTML shell is missing the expected insertion points');
  return shell
    .replace(/<html\b[^>]*>/i, `<html lang="${escapeHtml(lang)}">`)
    .replace(/<title[^>]*>[\s\S]*?<\/title>/i, '')
    .replace(/<\/head>/i, `${head}\n</head>`)
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`);
}

export function renderPublicHtml(shell: string, page: PublicSeoPage, options: SeoOptions): string {
  const canonical = buildCanonicalUrl(page.pathname, options.siteUrl);
  const noindex = options.environment !== 'production';
  const metadata = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta name="robots" content="${noindex ? 'noindex,nofollow' : 'index,follow'}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:site_name" content="Coup: Shadow Protocol">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}">`,
  ];
  if (options.verification && options.environment === 'production') {
    metadata.push(`<meta name="google-site-verification" content="${escapeHtml(options.verification)}">`);
  }
  if (page.structuredData === 'WebSite') {
    const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Coup: Shadow Protocol', url: canonical, description: page.description });
    metadata.push(`<script type="application/ld+json">${schema.replace(/</g, '\\u003c')}</script>`);
  }
  return replaceShell(shell, metadata.join('\n'), renderToString(page.render()), page.lang);
}

export function renderPrivateHtml(shell: string, title = 'Coup: Shadow Protocol'): string {
  return replaceShell(shell, `<title>${escapeHtml(title)}</title>\n<meta name="robots" content="noindex,nofollow">`, '', 'en');
}

export function renderNotFoundHtml(shell: string): string {
  return replaceShell(shell, '<title>Page not found | Coup: Shadow Protocol</title>\n<meta name="robots" content="noindex,nofollow">\n<meta name="coup-route-status" content="404">', renderToString(createElement(NotFound)), 'en');
}

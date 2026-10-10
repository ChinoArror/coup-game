import assert from 'node:assert/strict';

const siteUrl = new URL(process.env.SITE_URL || 'https://coup.aryuki.com').origin;
const target = new URL(process.env.SEO_BASE_URL || siteUrl).origin;
const expectNoindex = process.env.SEO_EXPECT_NOINDEX === '1';

async function get(path, init) {
  const response = await fetch(`${target}${path}`, init);
  return { response, body: await response.text() };
}

function checkHtml(body, path, { noindex = false, status = 200 } = {}) {
  assert.match(body, /<title>[^<]+<\/title>/i, `${path}: title is missing`);
  assert.match(body, /<h1\b[^>]*>[^<]+<\/h1>/i, `${path}: H1 is missing`);
  if (status === 200) {
    assert.match(body, /<meta name="description" content="[^"]+">/i, `${path}: description is missing`);
    const canonical = path === '/' ? `${siteUrl}/` : `${siteUrl}${path}`;
    assert.ok(body.includes(`<link rel="canonical" href="${canonical}">`), `${path}: canonical is incorrect`);
  }
  assert.equal(/(?:<meta name="robots"[^>]*content="[^"]*noindex|<meta name="robots"[^>]*content="noindex)/i.test(body), noindex, `${path}: unexpected robots setting`);
}

try {
  const home = await get('/');
  assert.equal(home.response.status, 200);
  assert.match(home.response.headers.get('Content-Type') || '', /text\/html/i);
  checkHtml(home.body, '/', { noindex: expectNoindex });
  assert.equal(/noindex/i.test(home.response.headers.get('X-Robots-Tag') || ''), expectNoindex, 'home: unexpected X-Robots-Tag');
  assert.match(home.body, /href="\/rules"/, 'home: rules link is missing');

  const rules = await get('/rules');
  assert.equal(rules.response.status, 200);
  checkHtml(rules.body, '/rules', { noindex: expectNoindex });
  assert.equal(/noindex/i.test(rules.response.headers.get('X-Robots-Tag') || ''), expectNoindex, 'rules: unexpected X-Robots-Tag');
  assert.notEqual(home.body.match(/<title>(.*?)<\/title>/)?.[1], rules.body.match(/<title>(.*?)<\/title>/)?.[1]);
  const trackedRules = await get('/rules?utm_source=seo_check');
  assert.equal(trackedRules.response.status, 200);
  assert.ok(trackedRules.body.includes(`<link rel="canonical" href="${siteUrl}/rules">`), 'tracking query polluted canonical');

  const robots = await get('/robots.txt');
  assert.equal(robots.response.status, 200);
  assert.match(robots.response.headers.get('Content-Type') || '', /text\/plain/i);
  assert.ok(robots.body.includes(`Sitemap: ${siteUrl}/sitemap.xml`));

  const sitemap = await get('/sitemap.xml');
  assert.equal(sitemap.response.status, 200);
  assert.match(sitemap.response.headers.get('Content-Type') || '', /application\/xml/i);
  let inner = sitemap.body.trim();
  inner = inner.replace(/^<\?xml version="1\.0" encoding="UTF-8"\?>\s*/, '');
  inner = inner.replace(/^<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\s*/, '');
  inner = inner.replace(/\s*<\/urlset>$/, '');
  const entries = [...inner.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>[^<]+<\/lastmod>\s*)?<\/url>/g)];
  assert.ok(entries.length > 0, 'sitemap has no URLs');
  assert.equal(inner.replace(/<url>\s*<loc>[^<]+<\/loc>\s*(?:<lastmod>[^<]+<\/lastmod>\s*)?<\/url>/g, '').trim(), '', 'sitemap XML structure is unexpected');
  const locations = entries.map(entry => entry[1]);
  assert.equal(new Set(locations).size, locations.length, 'sitemap contains duplicate URLs');
  for (const location of locations) {
    const url = new URL(location);
    assert.equal(url.origin, siteUrl, `sitemap uses another domain: ${location}`);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.search, '', 'sitemap contains a query string');
    assert.ok(!/localhost|workers\.dev/i.test(location));
    assert.ok(!/\/(?:game|play|api)(?:\/|$)/.test(url.pathname), `sitemap contains a private URL: ${location}`);
  }
  assert.deepEqual(new Set(locations), new Set([`${siteUrl}/`, `${siteUrl}/rules`]));

  const missing = await get('/seo-check-unlisted-page');
  assert.equal(missing.response.status, 404);
  checkHtml(missing.body, '/seo-check-unlisted-page', { noindex: true, status: 404 });
  const game = await get('/game');
  assert.equal(game.response.status, 200);
  assert.match(game.response.headers.get('X-Robots-Tag') || '', /noindex/i);

  const slash = await get('/rules/', { redirect: 'manual' });
  assert.equal(slash.response.status, 308);
  assert.equal(slash.response.headers.get('Location'), `${siteUrl}/rules`);

  console.log(`SEO checks passed for ${target} (${locations.length} public URLs).`);
} catch (error) {
  console.error(`SEO check failed for ${target}: ${error.message}`);
  process.exitCode = 1;
}

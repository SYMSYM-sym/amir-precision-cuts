#!/usr/bin/env node
/**
 * Live smoke test — proves the site is actually serving what you think it is.
 *
 * Dependency-free (Node 18+ global fetch). Verifies the LIVE site end-to-end:
 *   - homepage + /blog/ reachable and well-formed
 *   - sitemap.xml lists blog URLs; EVERY blog URL is live (200), renders its <h1>,
 *     and carries JSON-LD Article schema
 *   - brand assets exist: /favicon.ico + /og.jpg return 200   (R4)
 *   - feed.xml / feed.json / llms.txt valid
 *   - CONSISTENCY: sitemap blog URLs == blog index cards == feed.xml == feed.json
 *     (this is what catches the SILENT failures — half-built renders, drifted feeds,
 *      an article in the sitemap that 404s)
 *
 * Exit 0 = healthy; exit 1 = at least one failure (CI-friendly).
 * Run: `npm run verify`  |  `node scripts/verify-live.mjs https://staging.example.com`
 */

// SITE_DOMAIN must be the FULL host (e.g. "www.example.com" or "example.com").
// Do NOT prepend "www." — apex-only domains would fail every check.
const BASE = (process.argv[2] || `https://${process.env.SITE_DOMAIN || 'example.com'}`).replace(/\/$/, '');
const results = [];
let failed = 0;

function ok(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  if (!cond) failed++;
}

async function get(path) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'verify-live' } });
    const body = await res.text();
    return { status: res.status, body, url };
  } catch (e) {
    return { status: 0, body: '', url, error: e.message };
  }
}

async function head(path) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    return res.status;
  } catch { return 0; }
}

const blogUrlsFromSitemap = (xml) =>
  [...xml.matchAll(/<loc>([^<]*\/blog\/[^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => !/\/blog\/?$/.test(u)); // exclude the index itself

async function main() {
  console.log(`Verifying live site: ${BASE}\n`);

  // 1. Homepage
  const home = await get('/');
  ok('homepage 200', home.status === 200, `status ${home.status}`);
  ok('homepage has JSON-LD schema', /application\/ld\+json/.test(home.body));
  ok('homepage has LocalBusiness-ish schema', /"@type"\s*:\s*"(LocalBusiness|HealthAndBeautyBusiness|HairSalon|BeautySalon|NailSalon|DaySpa|MedicalSpa)"/.test(home.body));
  ok('homepage schema has logo', /"logo"/.test(home.body));
  ok('homepage has canonical', /rel="canonical"/.test(home.body));
  ok('homepage has og:image', /property="og:image"/.test(home.body));
  ok('homepage has favicon link', /rel="icon"/.test(home.body));
  ok('homepage has viewport (mobile)', /name="viewport"/.test(home.body));

  // 2. Brand assets must EXIST, not just be referenced (R4)
  ok('/favicon.ico 200', (await head('/favicon.ico')) === 200);
  ok('/og.jpg 200', (await head('/og.jpg')) === 200);

  // 3. robots.txt
  const robots = await get('/robots.txt');
  ok('robots.txt 200 + Sitemap line', robots.status === 200 && /Sitemap:/i.test(robots.body));

  // 4. Blog index
  const blog = await get('/blog/');
  ok('/blog/ 200', blog.status === 200, `status ${blog.status}`);
  const cardCount = (blog.body.match(/class="blog-card"/g) || []).length;
  ok('/blog/ lists article cards', cardCount > 0, `${cardCount} cards`);

  // 5. Sitemap
  const sitemap = await get('/sitemap.xml');
  ok('sitemap.xml 200', sitemap.status === 200, `status ${sitemap.status}`);
  ok('sitemap.xml is a urlset', /<urlset/.test(sitemap.body));
  ok('sitemap has lastmod', /<lastmod>/.test(sitemap.body));
  const blogUrls = blogUrlsFromSitemap(sitemap.body);
  ok('sitemap has blog URLs', blogUrls.length > 0, `${blogUrls.length} blog URLs`);

  // 6. Every article live + rendered + schema
  let liveArticles = 0;
  for (const u of blogUrls) {
    const a = await get(u);
    const live = a.status === 200;
    const hasH1 = /<h1[^>]*>/.test(a.body);
    const hasSchema = /application\/ld\+json/.test(a.body) && /"Article"|"BlogPosting"/.test(a.body);
    if (live && hasH1 && hasSchema) liveArticles++;
    ok(`article live+schema: ${u.replace(BASE, '')}`, live && hasH1 && hasSchema,
      `200=${live} h1=${hasH1} schema=${hasSchema}`);
  }

  // 7. Feeds + llms
  const fx = await get('/feed.xml');
  ok('feed.xml valid', fx.status === 200 && /<(rss|feed)/.test(fx.body));
  const fxItems = (fx.body.match(/<(item|entry)>/g) || []).length;
  const fj = await get('/feed.json');
  let fjItems = 0;
  try { fjItems = (JSON.parse(fj.body).items || []).length; } catch { /* invalid */ }
  ok('feed.json valid JSON', fj.status === 200 && fjItems > 0, `${fjItems} items`);
  const llms = await get('/llms.txt');
  ok('llms.txt present', llms.status === 200 && llms.body.length > 50);

  // 8. Consistency — the silent-failure detector
  ok('consistency sitemap==index cards', blogUrls.length === cardCount, `sitemap=${blogUrls.length} cards=${cardCount}`);
  ok('consistency sitemap==feed.xml items', blogUrls.length === fxItems, `sitemap=${blogUrls.length} feed.xml=${fxItems}`);
  ok('consistency sitemap==feed.json items', blogUrls.length === fjItems, `sitemap=${blogUrls.length} feed.json=${fjItems}`);
  ok('every sitemap article is live', liveArticles === blogUrls.length, `${liveArticles}/${blogUrls.length} live`);

  console.log('Results:');
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  if (failed) { console.error(`\n${failed} check(s) FAILED.`); process.exit(1); }
  console.log('\nAll live-site checks passed. ✅');
}

main().catch((e) => { console.error('verify-live crashed:', e); process.exit(1); });

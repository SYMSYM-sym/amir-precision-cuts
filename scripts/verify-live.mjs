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

/**
 * Config is loaded OPTIONALLY.
 *
 * This script is deliberately dependency-free so it can run in a bare CI job
 * with no `npm install` — that is why it uses global fetch and imports nothing
 * at the top level. But the domain and the expected schema type are business
 * facts, and hardcoding them (the reference fell back to "example.com") means
 * a green run against the wrong site.
 *
 * So: try to load the config, and if the dependency is not there, fall back to
 * an explicit argument or env var. What is NOT allowed is a silent default.
 */
let cfg = null;
try {
  ({ cfg } = await import('./paths.mjs'));
} catch { /* running without node_modules — argv/env must supply the domain */ }

const argUrl = process.argv[2];
// Keep an explicit scheme when one is given, so the built site can be verified
// against a local server before it is ever deployed. Everything else defaults
// to https -- an http default would let a misconfigured host pass.
const scheme = argUrl && /^http:\/\//.test(argUrl) ? 'http' : 'https';
const domain = argUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '')
  || process.env.SITE_DOMAIN
  || cfg?.site?.domain;

if (!domain) {
  console.error(
    'No domain to verify.\n' +
    'Pass one (`node scripts/verify-live.mjs https://example.com`), set SITE_DOMAIN,\n' +
    'or run where business.config.yaml and node_modules are available.\n' +
    'There is deliberately no default — a smoke test that green-lights the wrong\n' +
    'site is worse than one that does not run.',
  );
  process.exit(2);
}

// The FULL host, e.g. "www.example.com" or "example.com". Never prepend "www."
// — apex-only domains would fail every check.
const BASE = `${scheme}://${domain}`.replace(/\/$/, '');
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

/**
 * Sitemap URLs are absolute and canonical — they name the PRODUCTION domain
 * even in a staging build, which is correct. So when BASE is not that domain
 * (a staging host, or a local server checking a build before it ships), the
 * paths are re-pointed at BASE. Without this the doc's own documented usage
 * — `node scripts/verify-live.mjs https://staging.example.com` — fetches
 * production for every article and reports a green staging run.
 */
const blogUrlsFromSitemap = (xml) =>
  [...xml.matchAll(/<loc>([^<]*\/blog\/[^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => !/\/blog\/?$/.test(u)) // exclude the index itself
    .map((u) => {
      try {
        return `${BASE}${new URL(u).pathname}`;
      } catch {
        return u;
      }
    });

async function main() {
  console.log(`Verifying live site: ${BASE}\n`);

  // 1. Homepage
  const home = await get('/');
  ok('homepage 200', home.status === 200, `status ${home.status}`);
  ok('homepage has JSON-LD schema', /application\/ld\+json/.test(home.body));
  // When the config is available, assert the EXACT declared type rather than
  // "one of the beauty-ish types" — a NailSalon config that ships HairSalon
  // schema would otherwise pass.
  if (cfg) {
    ok(`homepage schema @type is ${cfg.business.category_schema}`,
      new RegExp(`"@type"\\s*:\\s*"${cfg.business.category_schema}"`).test(home.body));
    ok('homepage names the business', home.body.includes(cfg.business.name));
    // Canonical must always name the PRODUCTION domain, even on staging —
    // a staging canonical pointing at staging is how a staging site gets
    // indexed and outranks the real one.
    ok(`canonical names the production domain (${cfg.site.domain})`,
      home.body.includes(`https://${cfg.site.domain}/`));
  } else {
    ok('homepage has LocalBusiness-ish schema',
      /"@type"\s*:\s*"(LocalBusiness|HealthAndBeautyBusiness|HairSalon|BeautySalon|NailSalon|DaySpa|MedicalSpa|BarberShop|TattooParlor|MassageTherapy|SkinCareClinic)"/.test(home.body));
  }
  ok('homepage schema has logo', /"logo"/.test(home.body));
  ok('homepage has canonical', /rel="canonical"/.test(home.body));
  ok('homepage has og:image', /property="og:image"/.test(home.body));
  ok('homepage has favicon link', /rel="icon"/.test(home.body));
  ok('homepage has viewport (mobile)', /name="viewport"/.test(home.body));
  ok('homepage has og:image dimensions', /property="og:image:width"/.test(home.body) && /property="og:image:height"/.test(home.body));
  ok('homepage has twitter:card', /name="twitter:card"/.test(home.body));

  // 1b. The contact gate, on the LIVE site (04 §A).
  // The build asserts this too, but a build assertion only covers what the
  // build produced. This covers what is actually being served — including a
  // hand-edit someone made straight on the host.
  if (cfg && cfg.booking.publish_phone !== true) {
    const scrubbed = home.body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/https?:\/\/\S+/gi, '');
    ok('no tel: link (publish_phone is false)', !/tel:/i.test(home.body));
    ok('no phone-shaped digits (publish_phone is false)',
      !/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(scrubbed.replace(/<[^>]+>/g, ' ')));
  }
  if (cfg && cfg.booking.publish_email !== true) {
    ok('no mailto: link (publish_email is false)', !/mailto:/i.test(home.body));
  }

  // 2. Brand assets must EXIST, not just be referenced (R4)
  // All FOUR, not two. 07 §A lists icon-512 and apple-touch-icon as well, and
  // "referencing is not the same as existing" applies to every one of them.
  for (const asset of ['/favicon.ico', '/og.jpg', '/assets/img/icon-512.png', '/assets/img/apple-touch-icon.png']) {
    ok(`${asset} 200`, (await head(asset)) === 200);
  }

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
    // 07 §C: Article needs image + publisher.logo + mainEntityOfPage. The
    // reference omitted all three and nothing noticed.
    const hasImage = /"image"\s*:/.test(a.body);
    const hasPublisherLogo = /"logo"\s*:/.test(a.body);
    const hasCanonical = /rel="canonical"/.test(a.body);
    const good = live && hasH1 && hasSchema && hasImage && hasPublisherLogo && hasCanonical;
    if (good) liveArticles++;
    ok(`article complete: ${u.replace(BASE, '')}`, good,
      `200=${live} h1=${hasH1} schema=${hasSchema} image=${hasImage} logo=${hasPublisherLogo} canonical=${hasCanonical}`);
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
  // 07 §D wants TITLES and URLs, not bare URLs — the reference emitted bare ones.
  ok('llms.txt lists titled articles', blogUrls.length === 0 || /\[[^\]]+\]\(https?:/.test(llms.body));

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

main().catch((e) => {
  // R2: a broken verifier must go RED, never quietly green.
  console.error('verify-live crashed:', e);
  process.exit(1);
});

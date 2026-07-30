/**
 * layout-css.test.mjs — every layout variant must ship the CSS its own markup uses.
 *
 * WHY THIS EXISTS
 *
 * templates/styles.css is PARTITIONED by variant: a common block, then
 * `{{#if IS_EDITORIAL}}` / `IS_COMPACT` / `IS_GALLERY` / `IS_CLASSIC` blocks. A
 * rule written inside the wrong block ships for one layout and silently vanishes
 * for the other three. Nothing catches that, because the page still renders —
 * just with browser-default styling on whichever element lost its rule.
 *
 * That is not hypothetical. The two dev fixtures pinned `editorial` and
 * `gallery`, so `compact` and `classic` were never rendered by any test. The
 * first real `classic` build put an unstyled <dl> of transit and parking notes on
 * a client's homepage: full-bleed, browser-indented, left-aligned inside a
 * centred section. The markup was right and the stylesheet simply had no rule
 * for `.visit__notes` in three of the four layouts.
 *
 * So: render all four variants and assert that every class the markup emits has
 * at least one rule in that variant's stylesheet. Purely-semantic hook classes
 * are listed explicitly below — writing one down is cheap, and it forces the
 * decision to be deliberate rather than an oversight nobody sees until a client
 * looks at their own site.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadConfig, ROOT } from './paths.mjs';
import { LAYOUT_VARIANTS, buildDerived } from './config-schema.mjs';
import { renderSiteFrom } from './site-render.mjs';
import { loadTemplateSet } from './derive-site.mjs';

/**
 * Classes that intentionally carry no rule of their own. Each is either a JS/test
 * hook or a semantic wrapper that inherits everything from its parent. If you add
 * to this list, the class must genuinely need no styling in ANY variant.
 */
const UNSTYLED_BY_DESIGN = new Set([
  // theme + layout markers on <html>/<body>; the token block targets them by
  // attribute, and per-client overrides hook onto them
  'theme-dark', 'theme-light',
  'layout-editorial', 'layout-compact', 'layout-gallery', 'layout-classic',
  // section identity hooks, for anchors and for downstream per-client overrides
  'section--about', 'section--services', 'section--aftercare', 'section--faq',
  'section--visit', 'section--hero', 'section--gallery',
  // pure grid/flow wrappers: they hold children, they carry no appearance
  'about__copy', 'about__card-top', 'visit__copy', 'service-row__body',
  'hero__inner', 'footer__meta',
  // elements that inherit everything from a sibling class on the same tag
  // (.h3) or from a parent's descendant rule
  'visit__aside-title', 'about__card-address', 'service-card__title',
  'care-inline__head', 'hero__lead',
  'service-list__name', 'service-row__name', 'service-card__name', 'service-table__name',
]);

function classesIn(html) {
  const out = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

function hasRule(css, cls) {
  // A rule for `.foo` — not `.foobar`, and not `.foo-baz`.
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${esc}(?![a-zA-Z0-9_-])`).test(css);
}

const FIXTURE = join(ROOT, 'fixtures', 'config.dev-a.yaml');

/**
 * A CLIENT repo is this template plus one config; it deletes fixtures/ on the way
 * out (15-NEW-BUSINESS-RUNBOOK) because a dev fixture in a client repo is a
 * second business's facts sitting next to the first one's.
 *
 * So skip EXPLICITLY rather than throwing. A throw from a describe() body makes
 * `node --test` report "0 tests, 0 fail", which is indistinguishable from green
 * in CI — the failure mode this whole file exists to prevent, one level up.
 */
const noFixture = existsSync(FIXTURE) ? false : `fixtures/config.dev-a.yaml absent (client repo) — variant CSS is checked in the template repo`;

describe('layout variants ship their own CSS', () => {
  const templates = noFixture ? null : loadTemplateSet(ROOT);

  for (const variant of LAYOUT_VARIANTS) {
    test(`${variant}: every class in the markup has a rule`, { skip: noFixture }, () => {
      // Re-derive so hours/booking/etc. are consistent with the variant swap.
      const cfg = loadConfig(FIXTURE);
      cfg.brand.layout_variant = variant;
      const { indexHtml, css } = renderSiteFrom(cfg, templates);

      const missing = [...classesIn(indexHtml)]
        .filter((c) => !UNSTYLED_BY_DESIGN.has(c))
        .filter((c) => !hasRule(css, c))
        .sort();

      assert.deepEqual(
        missing, [],
        `layout_variant "${variant}" emits ${missing.length} class(es) with no CSS rule: `
        + `${missing.join(', ')}.\n`
        + 'A rule placed inside the wrong IS_<VARIANT> block ships for one layout only. '
        + 'Put shared rules in the common block at the top of templates/styles.css, '
        + 'or add the class to UNSTYLED_BY_DESIGN if it genuinely needs none.',
      );
    });

    test(`${variant}: renders a complete page`, { skip: noFixture }, () => {
      const cfg = loadConfig(FIXTURE);
      cfg.brand.layout_variant = variant;
      const { indexHtml, css } = renderSiteFrom(cfg, templates);
      for (const id of ['id="about"', 'id="services"', 'id="aftercare"', 'id="faq"', 'id="visit"']) {
        assert.ok(indexHtml.includes(id), `${variant} is missing section ${id}`);
      }
      assert.ok(css.length > 4000, `${variant} stylesheet looks truncated (${css.length} bytes)`);
      // Only a full mustache pair counts: JSON-LD legitimately ends objects with }}.
      assert.ok(!/\{\{[^{}]*\}\}/.test(indexHtml), `${variant} left an unrendered template tag in the HTML`);
      assert.ok(!/\{\{[^{}]*\}\}/.test(css), `${variant} left an unrendered template tag in the CSS`);
    });
  }

  test('base fixture still declares a known variant', { skip: noFixture }, () => {
    assert.ok(LAYOUT_VARIANTS.includes(loadConfig(FIXTURE).brand.layout_variant));
  });
});

/**
 * "Springfield, Springfield".
 *
 * A very common case for a local business: the neighbourhood IS the city. Both
 * dev fixtures have a neighbourhood distinct from their city (Fox Point in
 * Providence, Boise Bench in Boise), so every test passed while three templates
 * wrote `neighborhood`, `address_city` side by side and printed the same word
 * twice on the live site — in an <h2>, in a hero fact row, and in an about card.
 *
 * config-schema.mjs already collapses that case in `place_line` and
 * `place_primary`/`place_secondary`. This is the test that makes templates
 * actually use them: force the two fields equal and assert no rendered word is
 * immediately followed by itself.
 */
describe('a neighbourhood that IS the city never renders twice', () => {
  const templates = noFixture ? null : loadTemplateSet(ROOT);

  for (const variant of LAYOUT_VARIANTS) {
    test(`${variant}: no doubled place name`, { skip: noFixture }, () => {
      const cfg = loadConfig(FIXTURE);
      cfg.brand.layout_variant = variant;
      cfg.location.neighborhood = cfg.location.address_city;
      const { indexHtml } = renderSiteFrom(cfg, templates);

      // Text only: JSON-LD legitimately repeats addressLocality next to the
      // neighbourhood, and a <meta> may carry both. This is about what a
      // visitor reads.
      const text = indexHtml
        .replace(/<script[\s\S]*?<\/script>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/g, ' ');
      const city = cfg.location.address_city;
      const doubled = new RegExp(`\\b${city}\\b[\\s,·|/–—-]+\\b${city}\\b`, 'i');
      const hit = text.match(doubled);

      assert.equal(
        hit, null,
        `layout_variant "${variant}" renders "${hit && hit[0]}" — the neighbourhood and the `
        + 'city are the same word and a template printed both. Use derived.place_line for a '
        + 'one-line label, or derived.place_primary / place_secondary for a two-line one.',
      );
    });
  }
});


/**
 * Long-cached asset URLs must carry a content hash.
 *
 * THE BUG THIS EXISTS FOR
 *
 * vercel.json serves /assets/ with `max-age=31536000, immutable`. `immutable`
 * is a promise that the bytes behind a URL will never change, and browsers
 * honour it completely — no revalidation, no conditional request, nothing, for
 * a year. The stylesheet lived at the fixed path /assets/styles.css.
 *
 * So a redesign shipped and every RETURNING visitor rendered the new markup
 * with the old stylesheet: correct HTML, year-old CSS, every new class falling
 * back to browser defaults. It looked fine to anyone with a cold cache, which
 * is everyone who tests. 90 unit tests, 38 live checks and a byte-for-byte
 * comparison of the deployed CSS all passed while the site was visibly broken
 * for the only person who had seen it before.
 *
 * verify-live.mjs checks the same contract against real response headers. This
 * checks it at BUILD time, against the config and the markup, so it fails
 * before a deploy rather than after one.
 */
describe('assets that are cached forever have content-hashed URLs', () => {
  const templates = noFixture ? null : loadTemplateSet(ROOT);
  const vercelPath = join(ROOT, 'vercel.json');

  // Sources in vercel.json whose Cache-Control promises immutability. Anything
  // matching one of these must have a hash in its filename.
  const immutableSources = () => {
    const conf = JSON.parse(readFileSync(vercelPath, 'utf8'));
    return (conf.headers || [])
      .filter((h) => (h.headers || []).some(
        (k) => k.key.toLowerCase() === 'cache-control' && /immutable|max-age=[0-9]{6,}/.test(k.value)))
      .map((h) => h.source);
  };

  // path-to-regexp, reduced to what this config uses: `(.*)` and an inline
  // negative-lookahead group. Enough to decide whether a URL is covered.
  const sourceMatches = (source, url) =>
    new RegExp(`^${source.replace(/\(\.\*\)/g, '(?:.*)')}$`).test(url);

  const HASHED = /\.[0-9a-f]{6,}\.[a-z0-9]+$/;

  test('vercel.json still marks something immutable', { skip: noFixture }, () => {
    assert.ok(immutableSources().length > 0,
      'no immutable Cache-Control rule found — if that was deliberate, delete this suite; '
      + 'if it was an accident, the site just lost its asset caching.');
  });

  for (const variant of LAYOUT_VARIANTS) {
    test(`${variant}: no immutable URL without a content hash`, { skip: noFixture }, () => {
      const cfg = loadConfig(FIXTURE);
      cfg.brand.layout_variant = variant;
      // A stand-in for what process-media.py writes. renderSiteFrom is pure and
      // takes the manifest as an argument, so the test supplies one rather than
      // depending on site/ having been built — and it must, because without a
      // manifest the renderer emits the config's unhashed logical paths and
      // this test would fail on a condition derive-site.mjs already refuses.
      const manifest = Object.fromEntries(
        [...(cfg.media?.gallery || []).map((g) => g.src), cfg.media?.hero_image]
          .filter(Boolean)
          .map((u) => {
            const stem = u.replace(/^.*\//, '').replace(/\.[^.]+$/, '').replace(/-\d+$/, '');
            const base = `/assets/img/media/${stem}-1600.abc123de`;
            return [stem, {
              src: `${base}.jpg`, width: 1600, height: 1200,
              srcset_webp: `${base}.webp 1600w`, srcset_jpg: `${base}.jpg 1600w`,
            }];
          }),
      );
      const { indexHtml } = renderSiteFrom(cfg, templates, manifest);

      const refs = [
        ...[...indexHtml.matchAll(/<link[^>]+href="(\/[^"]+)"/g)].map((m) => m[1]),
        ...[...indexHtml.matchAll(/<script[^>]+src="(\/[^"]+)"/g)].map((m) => m[1]),
        ...[...indexHtml.matchAll(/<img[^>]+src="(\/[^"]+)"/g)].map((m) => m[1]),
      ];
      const sources = immutableSources();
      const offenders = [...new Set(refs)]
        .filter((u) => sources.some((src) => sourceMatches(src, u)))
        .filter((u) => !HASHED.test(u))
        .sort();

      assert.deepEqual(
        offenders, [],
        `layout_variant "${variant}" links ${offenders.length} URL(s) that vercel.json serves `
        + `immutable but that carry no content hash: ${offenders.join(', ')}.\n`
        + 'A fixed URL under an immutable header can never be updated for a returning '
        + 'visitor. Either content-hash the filename or narrow the header rule.',
      );
    });
  }
});


/**
 * The Contact row is built from three INDEPENDENTLY optional channels.
 *
 * Both fixtures now publish something, which is realistic and also means the
 * empty case stops being covered — the same gap that let "Encino, Encino" ship
 * (no fixture had neighbourhood == city, so no test ever rendered it). So the
 * zero case is asserted here by taking a real config and removing them.
 *
 * The Instagram handle is derived from the URL rather than stored beside it,
 * so the parsing is worth pinning too: the URL a client pastes comes off the
 * app's share sheet as often as from a browser bar.
 */
describe('the Visit contact row handles every combination of channels', () => {
  const templates = noFixture ? null : loadTemplateSet(ROOT);
  const VISIT_VARIANTS = { classic: 'visit.stacked', editorial: 'visit.split' };

  for (const [variant, tpl] of Object.entries(VISIT_VARIANTS)) {
    test(`${variant} (${tpl}): no channels published means no Contact row`, { skip: noFixture }, () => {
      const cfg = loadConfig(FIXTURE);
      cfg.brand.layout_variant = variant;
      cfg.booking.publish_phone = false;
      cfg.booking.publish_email = false;
      delete cfg.booking.social;
      // loadConfig derives once at load; mutating the config afterwards does
      // not re-derive it, and a stale derived block is worse than none — the
      // flags would still say a channel exists while the value is gone.
      cfg.derived = buildDerived(cfg);
      const { indexHtml } = renderSiteFrom(cfg, templates);
      assert.ok(!/>Contact</.test(indexHtml),
        `${variant} rendered a Contact row with nothing to put in it`);
    });

    test(`${variant} (${tpl}): Instagram alone still opens the row`, { skip: noFixture }, () => {
      const cfg = loadConfig(FIXTURE);
      cfg.brand.layout_variant = variant;
      cfg.booking.publish_phone = false;
      cfg.booking.publish_email = false;
      cfg.booking.social = { instagram: 'https://www.instagram.com/testhandle' };
      cfg.derived = buildDerived(cfg);
      const { indexHtml } = renderSiteFrom(cfg, templates);
      assert.ok(/>Contact</.test(indexHtml),
        `${variant} hid the Contact row for a business whose only published channel is Instagram`);
      assert.ok(indexHtml.includes('@testhandle'),
        `${variant} did not render the handle`);
      assert.ok(indexHtml.includes('https://www.instagram.com/testhandle'),
        `${variant} rendered the handle but not the link`);
    });
  }

  test('the handle is parsed from however the URL was pasted', { skip: noFixture }, () => {
    const cfg = loadConfig(FIXTURE);
    const cases = [
      ['https://www.instagram.com/amir_cuts', '@amir_cuts'],
      ['https://instagram.com/amir_cuts', '@amir_cuts'],
      ['https://www.instagram.com/amir_cuts/', '@amir_cuts'],
      ['https://www.instagram.com/amir_cuts?igsh=MXhhbGY', '@amir_cuts'],
      ['https://www.instagram.com/amir.cuts/reels/', '@amir.cuts'],
    ];
    for (const [url, want] of cases) {
      const c = { ...cfg, booking: { ...cfg.booking, social: { instagram: url } } };
      assert.equal(buildDerived(c).instagram_handle, want, `parsing ${url}`);
    }
    // Unparseable must be undefined, not "@" — the engine is strict, so an
    // undefined value throws at build time instead of printing a bare @ live.
    const bad = { ...cfg, booking: { ...cfg.booking, social: { instagram: 'not-a-url' } } };
    assert.equal(buildDerived(bad).instagram_handle, undefined);
  });
});

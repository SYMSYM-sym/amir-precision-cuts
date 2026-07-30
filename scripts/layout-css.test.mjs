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
import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, ROOT } from './paths.mjs';
import { LAYOUT_VARIANTS } from './config-schema.mjs';
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

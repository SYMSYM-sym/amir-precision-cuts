import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildPortal } from './build-portal.mjs';
import { ROOT } from './paths.mjs';

describe('intake portal bundle', () => {
  test('builds, and the bundle parses', () => {
    // buildPortal() runs `node --check` on both script blocks internally and
    // throws rather than writing a portal that dies on load.
    const r = buildPortal();
    assert.ok(r.bytes > 50_000, 'bundle looks too small to contain the engine');
  });

  test('inlines every template the renderer can ask for', () => {
    const html = readFileSync(join(ROOT, 'portal', 'index.html'), 'utf8');
    const wanted = [
      ...readdirSync(join(ROOT, 'templates', 'sections')).filter((f) => f.endsWith('.html'))
        .map((f) => `sections/${f.replace('.html', '')}`),
      ...readdirSync(join(ROOT, 'templates', 'partials')).filter((f) => f.endsWith('.html'))
        .map((f) => `partials/${f.replace('.html', '')}`),
      'styles.css', 'robots.txt',
    ];
    for (const key of wanted) {
      assert.ok(html.includes(JSON.stringify(key)), `template "${key}" is missing from the bundle`);
    }
  });

  test('no </script> escapes the enclosing script block', () => {
    const html = readFileSync(join(ROOT, 'portal', 'index.html'), 'utf8');
    const blocks = [...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)];
    assert.equal(blocks.length, 2, 'expected exactly two script blocks — a third means one broke out early');
  });

  test('the portal carries no business facts of its own', () => {
    let html = readFileSync(join(ROOT, 'portal', 'index.html'), 'utf8');
    // site-render.mjs's REFERENCE_FACTS array legitimately NAMES the reference
    // business — it is the leak detector. Strip the detector before scanning,
    // or the guard reports itself.
    // Two arrays legitimately NAME the reference business: REFERENCE_FACTS in
    // site-render.mjs and FORBIDDEN_VALUES in config-schema.mjs. Both are leak
    // detectors. Strip them, or the guard reports itself.
    html = html.replace(/const REFERENCE_FACTS = \[[\s\S]*?\];/, '')
      .replace(/const FORBIDDEN_VALUES = \[[\s\S]*?\];/, '');
    for (const fact of ['Igor For Men', 'igorformen', 'Larrabee', 'Ledgerwood', 'Sweetwater', 'Wickenden']) {
      assert.ok(!html.includes(fact), `portal bundle contains "${fact}" — it ships to clients and must start empty`);
    }
  });

  test('bundles the real validator, not a copy', () => {
    const html = readFileSync(join(ROOT, 'portal', 'index.html'), 'utf8');
    const schema = readFileSync(join(ROOT, 'scripts', 'config-schema.mjs'), 'utf8');
    // A distinctive line from the engine's own validator must be present
    // verbatim. If someone reimplements validation in the portal, this fails.
    const marker = 'must be STRICTLY LESS than';
    assert.ok(schema.includes(marker), 'the engine validator changed shape — update this test');
    assert.ok(html.includes(marker), 'the portal is not using the engine validator');
  });
});

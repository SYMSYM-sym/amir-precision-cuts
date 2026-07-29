/**
 * derive-site.mjs — the fs half of the site build.
 *
 * All rendering logic lives in site-render.mjs (pure), so the intake portal can
 * import it in a browser and preview exactly what this writes to disk.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { ROOT, configHash } from './paths.mjs';
import { renderSiteFrom, BANNER } from './site-render.mjs';

export { BANNER, fontsHref, localBusinessJsonLd, faqPageJsonLd, assertNoLeakedContact,
  assertNoForeignFacts, assertContrast, renderSiteFrom } from './site-render.mjs';

const SITE = join(ROOT, 'site');

/** Read every template the renderer can ask for, keyed the way it asks. */
export function loadTemplateSet(root = ROOT) {
  const T = join(root, 'templates');
  const out = {
    page: readFileSync(join(T, 'page.html'), 'utf8'),
    'styles.css': readFileSync(join(T, 'styles.css'), 'utf8'),
    'robots.txt': readFileSync(join(T, 'robots.txt'), 'utf8'),
  };
  for (const f of readdirSync(join(T, 'partials'))) {
    if (f.endsWith('.html')) out[`partials/${basename(f, '.html')}`] = readFileSync(join(T, 'partials', f), 'utf8');
  }
  for (const f of readdirSync(join(T, 'sections'))) {
    if (f.endsWith('.html')) out[`sections/${basename(f, '.html')}`] = readFileSync(join(T, 'sections', f), 'utf8');
  }
  return out;
}

export async function renderSite(cfg, { write = true } = {}) {
  const { indexHtml, css, robots } = renderSiteFrom(cfg, loadTemplateSet());
  if (write) {
    mkdirSync(join(SITE, 'assets'), { recursive: true });
    writeFileSync(join(SITE, 'index.html'), indexHtml, 'utf8');
    writeFileSync(join(SITE, 'assets', 'styles.css'), css, 'utf8');
    writeFileSync(join(SITE, 'robots.txt'), robots, 'utf8');
  }
  return { indexHtml, css, robots, hash: configHash({ ...cfg, derived: undefined }) };
}

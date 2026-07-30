/**
 * derive-site.mjs — the fs half of the site build.
 *
 * All rendering logic lives in site-render.mjs (pure), so the intake portal can
 * import it in a browser and preview exactly what this writes to disk.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'fs';
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
    // script.js used to live at site/assets/script.js — a HAND-AUTHORED source
    // file inside the DERIVED output directory. `rm -rf site && npm run derive`
    // (the AF5 delete-and-rebuild test) destroyed it and could not bring it
    // back, because nothing generated it. Anything under site/ must be
    // reproducible from templates/ and business.config.yaml, or site/ is not
    // output. It carries no business facts, so derive copies it verbatim.
    'script.js': readFileSync(join(T, 'script.js'), 'utf8'),
  };
  for (const f of readdirSync(join(T, 'partials'))) {
    if (f.endsWith('.html')) out[`partials/${basename(f, '.html')}`] = readFileSync(join(T, 'partials', f), 'utf8');
  }
  for (const f of readdirSync(join(T, 'sections'))) {
    if (f.endsWith('.html')) out[`sections/${basename(f, '.html')}`] = readFileSync(join(T, 'sections', f), 'utf8');
  }
  return out;
}

/**
 * Final pixel dimensions of every processed image, keyed by source stem.
 *
 * site-render.mjs is PURE (no fs) so the intake portal can run it in a browser,
 * which means it cannot read this itself — it arrives as an argument. Missing or
 * unbuilt is fine and returns {}: the templates mark width/height optional, and
 * a site with no imagery is a supported configuration.
 */
function loadMediaManifest() {
  const p = join(SITE, 'assets', 'img', 'media', 'manifest.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * A config that declares imagery MUST have a built manifest by the time the
 * markup is rendered.
 *
 * The manifest is what turns the config's logical path
 * (/assets/img/media/hero-1600.jpg) into the shipped, content-hashed one
 * (/assets/img/media/hero-1376.b9e6f298.jpg). Without it the renderer falls
 * back to the logical path — which 404s, AND which vercel.json serves
 * `immutable`, so the 404 would be cached by the browser for a year.
 *
 * The renderer stays lenient because it is pure and the intake portal previews
 * configs in a browser with no manifest at all. The fs side is where the
 * distinction between "previewing" and "shipping" exists, so the check lives
 * here. `npm run derive -- --only=site` on a fresh clone is the way to hit it.
 */
function assertMediaResolved(cfg, manifest) {
  const declared = [
    ...(cfg.media?.hero_image ? [cfg.media.hero_image] : []),
    ...(cfg.media?.gallery || []).map((g) => g.src),
    ...(cfg.media?.texture ? [cfg.media.texture] : []),
  ];
  const stem = (u) => String(u).replace(/^.*\//, '').replace(/\.[^.]+$/, '').replace(/-\d+$/, '');
  const missing = declared.filter((u) => !manifest[stem(u)]);
  if (!missing.length) return;
  throw new Error(
    `business.config.yaml declares ${missing.length} image(s) that the media pipeline has not `
    + `built:\n${missing.map((m) => `  • ${m}`).join('\n')}\n\n`
    + 'Run the assets step first:  npm run derive -- --only=assets,site\n\n'
    + 'Rendering without the manifest emits the config path rather than the shipped, '
    + 'content-hashed one. That URL 404s, and vercel.json serves /assets/ immutable, '
    + 'so the browser would cache the 404 for a year.',
  );
}

/**
 * The stylesheet and script URLs currently on disk.
 *
 * Both filenames carry a content hash, so build-blog.mjs cannot hardcode them —
 * and it must not compute them independently either, because a second copy of
 * that logic is a second thing to drift. It reads what derive actually wrote.
 *
 * Throws rather than guessing. A blog page that silently linked a stylesheet
 * that is not there is precisely the failure this whole change is about.
 */
export function readAssetHrefs() {
  const dir = join(SITE, 'assets');
  const find = (re, what) => {
    const hits = existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)) : [];
    if (hits.length === 1) return `/assets/${hits[0]}`;
    throw new Error(
      `expected exactly one ${what} in site/assets/, found ${hits.length}${hits.length ? `: ${hits.join(', ')}` : ''}.\n` +
      'Run `npm run derive -- --only=site` first — build-blog.mjs links the files derive emits.',
    );
  };
  return {
    stylesHref: find(/^styles\.[0-9a-f]{6,}\.css$/, 'hashed stylesheet'),
    scriptHref: find(/^script\.[0-9a-f]{6,}\.js$/, 'hashed script'),
  };
}

export async function renderSite(cfg, { write = true } = {}) {
  const mediaManifest = loadMediaManifest();
  assertMediaResolved(cfg, mediaManifest);
  const { indexHtml, css, robots, script, stylesHref, scriptHref } =
    renderSiteFrom(cfg, loadTemplateSet(), mediaManifest);
  if (write) {
    const assets = join(SITE, 'assets');
    mkdirSync(assets, { recursive: true });
    // A content-hashed name means a changed file writes a NEW one rather than
    // overwriting the old. Without a sweep every edit leaves its predecessor
    // behind and the deploy grows a tail of unreachable stylesheets forever —
    // the same reason process-media.py sweeps site/assets/img/media/.
    for (const f of readdirSync(assets)) {
      if (/^(styles\.[0-9a-f]+\.css|script\.[0-9a-f]+\.js|styles\.css|script\.js)$/.test(f)) {
        rmSync(join(assets, f), { force: true });
      }
    }
    writeFileSync(join(SITE, 'index.html'), indexHtml, 'utf8');
    writeFileSync(join(SITE, stylesHref.replace(/^\//, '')), css, 'utf8');
    writeFileSync(join(SITE, 'robots.txt'), robots, 'utf8');
    writeFileSync(join(SITE, scriptHref.replace(/^\//, '')), script, 'utf8');
  }
  return {
    indexHtml, css, robots, script, stylesHref, scriptHref,
    hash: configHash({ ...cfg, derived: undefined }),
  };
}

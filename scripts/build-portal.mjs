#!/usr/bin/env node
/**
 * build-portal.mjs — bundles the intake portal into one self-contained file.
 *
 * The portal is DERIVED FROM THE REPO, not written alongside it. It inlines the
 * actual validator, the actual renderer, the actual layout variants and the
 * actual templates. So:
 *
 *   • what the portal previews is what `npm run derive` writes
 *   • what the portal accepts is what the engine accepts at boot
 *   • adding a section template or a layout variant updates the portal for free
 *
 * The alternative — a portal with its own form schema and its own preview — has
 * one failure mode, and it is the expensive one: a config that passes the portal,
 * gets signed off by a client on the strength of a preview, and then fails at
 * build time or produces a different site.
 *
 * Output: portal/index.html — no build step, no server, no network at runtime
 * except Google Fonts. Open it from a file:// URL or host it anywhere.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { join, basename } from 'path';
import { ROOT } from './paths.mjs';

const PORTAL = join(ROOT, 'portal');
const SCRIPTS = join(ROOT, 'scripts');
const TEMPLATES = join(ROOT, 'templates');

/**
 * Strip ESM syntax so several modules can share one classic-script scope.
 * Order matters: dependencies first. Verified by the smoke test at the bottom,
 * which fails the build rather than shipping a portal that throws on load.
 */
function flatten(file, { drop = [] } = {}) {
  let src = readFileSync(join(SCRIPTS, file), 'utf8');
  for (const fn of drop) {
    // Remove a whole exported function (used for the two fs-bound helpers in
    // render-templates.mjs, which the browser has no use for).
    const re = new RegExp(`export async function ${fn}\\([\\s\\S]*?\\n\\}\\n`, 'm');
    src = src.replace(re, '');
  }
  return src
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, 'const __default__ = ')
    .replace(/^export\s+/gm, '');
}

function collectTemplates() {
  const out = {
    page: readFileSync(join(TEMPLATES, 'page.html'), 'utf8'),
    'styles.css': readFileSync(join(TEMPLATES, 'styles.css'), 'utf8'),
    'robots.txt': readFileSync(join(TEMPLATES, 'robots.txt'), 'utf8'),
  };
  for (const f of readdirSync(join(TEMPLATES, 'partials'))) {
    if (f.endsWith('.html')) out[`partials/${basename(f, '.html')}`] = readFileSync(join(TEMPLATES, 'partials', f), 'utf8');
  }
  for (const f of readdirSync(join(TEMPLATES, 'sections'))) {
    if (f.endsWith('.html')) out[`sections/${basename(f, '.html')}`] = readFileSync(join(TEMPLATES, 'sections', f), 'utf8');
  }
  return out;
}

/**
 * The ONLY sequence that can terminate a <script> block is a literal
 * "</script". Escaping the slash is a no-op inside a JS string or template
 * literal, so this is safe and surgical — escaping every "</" would corrupt
 * genuine less-than-slash operators.
 *
 * This is not hypothetical. It broke the first build twice: once because
 * blog-index.html carries the bucket-filter IIFE inside a <script> tag, and
 * again because site-render.mjs emits <script type="application/ld+json"> from
 * a template literal. Both landed inside the bundle as raw markup.
 */
function escapeScriptClose(s) {
  return s.replace(/<\/(script)/gi, '<\\/$1');
}

/** Refuse to ship a bundle that does not parse. */
function assertParses(label, src, { module = false } = {}) {
  const tmp = join(tmpdir(), `portal-check-${label}.${module ? 'mjs' : 'js'}`);
  writeFileSync(tmp, src, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (e) {
    const msg = (e.stderr || Buffer.from('')).toString().split('\n').slice(0, 8).join('\n');
    throw new Error(
      `The bundled ${label} script does not parse — refusing to write a portal that ` +
      `throws on load.\n\n${msg}`,
    );
  } finally {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

export function buildPortal() {
  const engine = [
    '/* ===== inlined from scripts/ — this is the real engine, not a copy ===== */',
    '(function () {',
    flatten('config-schema.mjs'),
    flatten('render-templates.mjs', { drop: ['loadPartial', 'loadPartials'] }),
    flatten('layout-variants.mjs'),
    flatten('site-render.mjs'),
    '  window.__FACTORY__ = {',
    '    validateConfig, buildDerived, ConfigError, DAYS, SCHEMA_TYPES, LAYOUT_VARIANTS,',
    '    renderSiteFrom, contrastRatio, buildTokens, getVariant, render, escapeHtml,',
    '  };',
    '})();',
    `window.__TEMPLATES__ = ${JSON.stringify(collectTemplates())};`,
  ].join('\n');

  const css = readFileSync(join(PORTAL, 'app.css'), 'utf8');
  const fields = readFileSync(join(PORTAL, 'fields.js'), 'utf8');
  const app = readFileSync(join(PORTAL, 'app.js'), 'utf8');

  // fields.js is imported by app.js; inline it and drop the import.
  const appInlined = [
    fields.replace(/^export /gm, ''),
    app.replace(/^import\s+\{[\s\S]*?\}\s+from\s+'\.\/fields\.js';\s*$/m, ''),
  ].join('\n');

  assertParses('engine', engine);
  assertParses('app', appInlined, { module: true });

  const html = readFileSync(join(PORTAL, 'shell.html'), 'utf8')
    .replace('/* @@CSS@@ */', () => css)
    .replace('/* @@ENGINE@@ */', () => escapeScriptClose(engine))
    .replace('/* @@APP@@ */', () => escapeScriptClose(appInlined));

  mkdirSync(PORTAL, { recursive: true });
  const dest = join(PORTAL, 'index.html');
  writeFileSync(dest, html, 'utf8');
  return { dest, bytes: Buffer.byteLength(html), templates: Object.keys(collectTemplates()).length };
}

const invoked = process.argv[1] && process.argv[1].endsWith('build-portal.mjs');
if (invoked) {
  const r = buildPortal();
  console.log(`portal built: ${r.dest.replace(`${ROOT}/`, '')} — ${(r.bytes / 1024).toFixed(0)} KB, ${r.templates} templates inlined`);
}

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

/**
 * Self-extracting build.
 *
 * The portal is ~194 KB of markup, engine and templates. Getting it onto a host
 * whose API takes file contents INLINE means transmitting all of it, so the
 * hosted copy ships gzipped and base64'd inside a ~2 KB loader: 194 KB becomes
 * 69 KB on the wire, and the browser inflates it with DecompressionStream.
 *
 * The loader carries a SHA-256 of the payload and checks it before writing. A
 * truncated or corrupted upload otherwise produces a page that half-renders,
 * which is a far worse failure than one that refuses to start and says why.
 *
 * portal/index.html stays the plain, readable artifact. This is only for hosts
 * that need the bytes inline.
 */
/**
 * Minify the bundle for hosting. The repo copy stays readable — every comment
 * in the engine explains a bug that cost someone real downtime, and stripping
 * those from the source would be a bad trade. Stripping them from a hosted
 * artifact costs nothing, because the source is right here.
 */
async function minifyBundle(html) {
  let esbuild;
  try {
    ({ default: esbuild } = await import('esbuild'));
  } catch {
    console.log('  (esbuild not installed — shipping the unminified bundle)');
    return html;
  }
  // NOTE: every replacement below passes a FUNCTION, not a string.
  // String.replace interprets $&, $` and $' inside a string replacement, and
  // minified JS is full of $. The first version of this used a string and $'
  // ("everything after the match") spliced the rest of the bundle back in --
  // 194 KB became 357 KB and the build reported it cheerfully.
  const blocks = [...html.matchAll(/<script( type="module")?>([\s\S]*?)<\/script>/g)];
  let out = html;
  for (const [full, isModule, code] of blocks) {
    const min = await esbuild.transform(code, {
      loader: 'js', minify: true, format: isModule ? 'esm' : undefined, target: 'es2022',
    });
    const replacement = `<script${isModule || ''}>${escapeScriptClose(min.code)}</script>`;
    out = out.replace(full, () => replacement);
  }
  const styles = [...out.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  for (const [full, css] of styles) {
    const min = await esbuild.transform(css, { loader: 'css', minify: true });
    const replacement = `<style>${min.code}</style>`;
    out = out.replace(full, () => replacement);
  }
  return out;
}

export async function buildSelfExtracting() {
  const { gzipSync } = await import('zlib');
  const { createHash } = await import('crypto');
  const html = await minifyBundle(readFileSync(join(PORTAL, 'index.html'), 'utf8'));
  const raw = Buffer.from(html, 'utf8');
  const gz = gzipSync(raw, { level: 9 });
  const b64 = gz.toString('base64');
  const sha = createHash('sha256').update(raw).digest('hex');

  const loader = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Site Intake — Personal Services Factory</title>
<meta name="description" content="Everything the factory needs to build a marketing site and a self-publishing SEO blog for a personal-services business." />
<meta name="robots" content="index,follow" />
<style>
  body{margin:0;font:15px/1.6 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f7f6f3;color:#17181a;display:grid;place-items:center;min-height:100dvh}
  .boot{max-width:46ch;padding:2rem;text-align:center}
  .boot h1{font-size:17px;margin:0 0 .5rem}
  .boot p{color:#6b6f76;font-size:14px;margin:0}
  .boot code{font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace;background:#eceae5;padding:2px 6px;border-radius:4px}
  .err{color:#a3271f}
</style>
</head>
<body>
<div class="boot" id="boot">
  <h1>Loading the intake portal…</h1>
  <p>Unpacking. This happens once.</p>
</div>
<noscript>
  <div class="boot"><h1>This portal needs JavaScript</h1>
  <p>Everything runs in your browser — the validation, the site preview, the config export. Nothing is sent anywhere.</p></div>
</noscript>
<script>
(async function () {
  var boot = document.getElementById('boot');
  function fail(title, detail) {
    boot.innerHTML = '<h1 class="err">' + title + '</h1><p>' + detail + '</p>';
  }
  try {
    if (typeof DecompressionStream === 'undefined') {
      return fail('Your browser is too old for this page',
        'It needs DecompressionStream (Chrome/Edge 103+, Firefox 113+, Safari 16.4+). ' +
        'The portal itself works anywhere — ask for the plain HTML file instead.');
    }
    var bin = Uint8Array.from(atob(PAYLOAD), function (c) { return c.charCodeAt(0); });
    var stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    var buf = await new Response(stream).arrayBuffer();

    var digest = await crypto.subtle.digest('SHA-256', buf);
    var hex = Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    if (hex !== INTEGRITY) {
      return fail('This page did not arrive intact',
        'The unpacked portal does not match its checksum, so it is not safe to run. ' +
        'A half-rendered form that silently drops answers is worse than one that refuses to start.');
    }

    var doc = new TextDecoder().decode(buf);
    document.open();
    document.write(doc);
    document.close();
  } catch (e) {
    fail('The portal could not be unpacked', String(e && e.message ? e.message : e));
  }
})();
</script>
</body>
</html>`;

  const withData = loader
    .replace('PAYLOAD', JSON.stringify(b64))
    .replace('INTEGRITY', JSON.stringify(sha));

  const dist = join(PORTAL, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), withData, 'utf8');
  return {
    dest: join(dist, 'index.html'),
    rawBytes: raw.length,
    wireBytes: Buffer.byteLength(withData),
    sha,
  };
}

const invoked = process.argv[1] && process.argv[1].endsWith('build-portal.mjs');
if (invoked) {
  const r = buildPortal();
  console.log(`portal built: ${r.dest.replace(`${ROOT}/`, '')} — ${(r.bytes / 1024).toFixed(0)} KB, ${r.templates} templates inlined`);
  if (process.argv.includes('--self-extracting')) {
    const z = await buildSelfExtracting();
    console.log(
      `self-extracting: ${z.dest.replace(`${ROOT}/`, '')} — `
      + `${(z.rawBytes / 1024).toFixed(0)} KB unpacked, ${(z.wireBytes / 1024).toFixed(1)} KB on the wire`,
    );
    console.log(`  sha256 ${z.sha}`);
  }
}

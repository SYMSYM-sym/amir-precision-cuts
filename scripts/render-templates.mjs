/**
 * render-templates.mjs — a small mustache-flavoured template engine.
 *
 * WHY THIS EXISTS
 * The reference renderer was 12 lines of flat `{{key}}` regex substitution with
 * an explicit docstring: "no conditionals". That is not a stylistic limitation —
 * it is *physically* unable to emit this system's homepage, because:
 *
 *   • `services[]`   is variable length (4-10 per business)
 *   • `hours.days[]` is an array
 *   • `homepage.faq[]` is 6-10 items
 *   • the contact block is CONDITIONAL on `booking.publish_phone`
 *
 * Without loops and conditionals the only way to ship a service list is to
 * hand-write `index.html` per client — which is exactly the mold that
 * 02-DERIVE-BRAIN.md §6 exists to prevent. Building this renderer IS the
 * mold→factory step (14-PORTING-NOTES.md §F step 3).
 *
 * SYNTAX
 *   {{path.to.value}}          HTML-escaped interpolation
 *   {{{path.to.value}}}        raw interpolation (pre-rendered HTML only)
 *   {{#if path}}…{{else}}…{{/if}}
 *   {{#unless path}}…{{/unless}}
 *   {{#each items}}…{{/each}}  with {{this}} {{@index}} {{@first}} {{@last}}
 *                              and {{../parent}} to reach the enclosing scope
 *   {{> partial-name}}         include a registered partial
 *   {{! comment }}             stripped
 *
 * STRICTNESS (this is the point)
 * An unresolved path THROWS by default. A typo'd `{{busines.name}}` must fail
 * the build loudly, not render an empty <span> that nobody notices until a
 * client's homepage has a blank address. 04 §A: "Never leave this to a human
 * eyeball." Pass `{ strict: false }` only where a missing value is genuinely
 * optional, or mark the token optional inline: `{{?maybe.missing}}`.
 */

// Triple-brace must be tried FIRST: a non-greedy {{…}} match against "{{{x}}}"
// stops at the first "}}" and captures "{x", silently mangling raw tokens.
const TAG_RAW = /\{\{\{(.*?)\}\}\}/s;
const TAG = /\{\{(.*?)\}\}/s;

export class TemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TemplateError';
  }
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(src) {
  const tokens = [];
  let rest = src;
  while (rest.length) {
    const mRaw = rest.match(TAG_RAW);
    const mStd = rest.match(TAG);

    // Whichever opens earliest wins; on a tie the raw form is the real one,
    // because "{{{x}}}" also matches TAG at the same index.
    let m; let raw;
    if (mRaw && (!mStd || mRaw.index <= mStd.index)) { m = mRaw; raw = true; } else { m = mStd; raw = false; }

    if (!m) {
      tokens.push({ t: 'text', v: rest });
      break;
    }
    // `${{ ... }}` IS NOT A MUSTACHE TAG.
    //
    // GitHub Actions expressions — `${{ secrets.GITHUB_TOKEN }}`,
    // `${{ github.event.inputs.slug }}` — open with a brace pair this tokenizer
    // is otherwise delighted to eat. It did. Every derived workflow shipped
    // with `GH_TOKEN: $` instead of a token, because the workflow templates are
    // the ONE place rendered with strict:false, so the unresolved path returned
    // an empty string rather than throwing.
    //
    // The result was a repo whose auto-merge job failed every hour on an
    // unauthenticated `gh pr list`, and whose publish job would have failed the
    // same way the first time it ran. The strict-mode escape hatch that exists
    // so a workflow can contain literal braces is exactly what hid it.
    //
    // A `$` immediately before `{{` means the author meant the host system's
    // expression syntax, not ours. Emit it verbatim and carry on scanning.
    if (m.index > 0 && rest[m.index - 1] === '$') {
      tokens.push({ t: 'text', v: rest.slice(0, m.index + m[0].length) });
      rest = rest.slice(m.index + m[0].length);
      continue;
    }

    if (m.index > 0) tokens.push({ t: 'text', v: rest.slice(0, m.index) });

    let body = m[1].trim();

    if (body.startsWith('!')) {
      // comment — emit nothing
    } else if (body.startsWith('#')) {
      const [kw, ...args] = body.slice(1).trim().split(/\s+/);
      tokens.push({ t: 'open', kw, arg: args.join(' ') });
    } else if (body.startsWith('/')) {
      tokens.push({ t: 'close', kw: body.slice(1).trim() });
    } else if (body === 'else') {
      tokens.push({ t: 'else' });
    } else if (body.startsWith('>')) {
      tokens.push({ t: 'partial', name: body.slice(1).trim() });
    } else {
      tokens.push({ t: 'var', path: body, raw });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser → AST
// ---------------------------------------------------------------------------

function parse(tokens) {
  const root = { t: 'root', body: [] };
  const stack = [root];

  for (const tok of tokens) {
    const node = stack[stack.length - 1];
    const target = node.inElse ? node.alt : node.body;

    switch (tok.t) {
      case 'text':
      case 'var':
      case 'partial':
        target.push(tok);
        break;
      case 'open': {
        if (!['if', 'unless', 'each'].includes(tok.kw)) {
          throw new TemplateError(`unknown block helper {{#${tok.kw}}} — expected if | unless | each`);
        }
        const block = { t: 'block', kw: tok.kw, arg: tok.arg, body: [], alt: [], inElse: false };
        target.push(block);
        stack.push(block);
        break;
      }
      case 'else':
        if (stack.length === 1) throw new TemplateError('{{else}} outside of a block');
        stack[stack.length - 1].inElse = true;
        break;
      case 'close': {
        if (stack.length === 1) throw new TemplateError(`{{/${tok.kw}}} with no matching open tag`);
        const open = stack.pop();
        if (open.kw !== tok.kw) {
          throw new TemplateError(`{{/${tok.kw}}} does not match {{#${open.kw} ${open.arg}}}`);
        }
        break;
      }
      default:
        break;
    }
  }

  if (stack.length !== 1) {
    const unclosed = stack[stack.length - 1];
    throw new TemplateError(`unclosed block {{#${unclosed.kw} ${unclosed.arg}}}`);
  }
  return root;
}

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

const MISSING = Symbol('missing');

function lookup(scopes, path) {
  let depth = scopes.length - 1;
  let p = path;

  while (p.startsWith('../')) {
    p = p.slice(3);
    depth -= 1;
    if (depth < 0) return MISSING;
  }

  const scope = scopes[depth];
  if (p === 'this' || p === '.') return scope.value;
  if (p.startsWith('@')) {
    return p.slice(1) in scope.meta ? scope.meta[p.slice(1)] : MISSING;
  }

  // Walk down from the current scope; fall back outward so a template inside
  // {{#each services}} can still reach {{business.name}} without `../`.
  for (let d = depth; d >= 0; d--) {
    let v = scopes[d].value;
    let ok = true;
    for (const part of p.split('.')) {
      if (v == null || typeof v !== 'object' || !(part in v)) { ok = false; break; }
      v = v[part];
    }
    if (ok) return v;
  }
  return MISSING;
}

function truthy(v) {
  if (v === MISSING || v === undefined || v === null || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return true;
  return Boolean(v);
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function evalNodes(nodes, scopes, opts, out) {
  for (const n of nodes) {
    switch (n.t) {
      case 'text':
        out.push(n.v);
        break;

      case 'var': {
        let path = n.path;
        let optional = false;
        if (path.startsWith('?')) { optional = true; path = path.slice(1); }
        const v = lookup(scopes, path);
        if (v === MISSING) {
          if (opts.strict && !optional) {
            throw new TemplateError(
              `unresolved template path "{{${path}}}" in ${opts.name}. ` +
                'Either the config key is missing or the token is misspelled — ' +
                'both would silently render an empty string, so this is a hard error. ' +
                `Use {{?${path}}} if it is genuinely optional.`,
            );
          }
          break;
        }
        if (v === null || v === undefined || v === false) break;
        out.push(n.raw ? String(v) : escapeHtml(v));
        break;
      }

      case 'partial': {
        const tpl = opts.partials?.[n.name];
        if (tpl === undefined) {
          throw new TemplateError(
            `unknown partial {{> ${n.name}}} in ${opts.name}. ` +
              `Registered: ${Object.keys(opts.partials || {}).join(', ') || '(none)'}`,
          );
        }
        if (opts._depth > 16) throw new TemplateError(`partial recursion too deep at {{> ${n.name}}}`);
        const sub = compile(tpl, { ...opts, name: `partial:${n.name}`, _depth: opts._depth + 1 });
        out.push(sub(scopes[scopes.length - 1].value, scopes));
        break;
      }

      case 'block': {
        // `{{#if ?path}}` marks a GENUINELY OPTIONAL key: absent is a legitimate
        // answer, not a typo. Without it, strict mode forces every template that
        // touches an optional config key to be edited whenever a client leaves
        // that key blank — which is most clients, most keys. The distinction
        // matters: a missing REQUIRED key must still throw, because a condition
        // that silently takes the false branch is how a contact block disappears
        // without anyone noticing.
        let arg = n.arg;
        let optional = false;
        if (arg.startsWith('?')) { optional = true; arg = arg.slice(1); }
        const v = lookup(scopes, arg);

        if (n.kw === 'if' || n.kw === 'unless') {
          if (v === MISSING && opts.strict && !optional) {
            throw new TemplateError(
              `unresolved path "{{#${n.kw} ${n.arg}}}" in ${opts.name}. ` +
                'A missing condition silently takes the false branch — which is how a ' +
                'contact block disappears without anyone noticing. ' +
                `Fix the path, or write {{#${n.kw} ?${arg}}} if it is genuinely optional.`,
            );
          }
          const test = n.kw === 'if' ? truthy(v) : !truthy(v);
          evalNodes(test ? n.body : n.alt, scopes, opts, out);
          break;
        }

        // each
        if (v === MISSING) {
          if (opts.strict && !optional) {
            throw new TemplateError(
              `unresolved path "{{#each ${n.arg}}}" in ${opts.name}`
              + ` — write {{#each ?${arg}}} if the list is genuinely optional.`,
            );
          }
          break;
        }
        const items = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
        if (!items.length) { evalNodes(n.alt, scopes, opts, out); break; }
        items.forEach((item, i) => {
          scopes.push({
            value: item,
            meta: {
              index: i,
              number: i + 1,
              first: i === 0,
              last: i === items.length - 1,
              even: i % 2 === 0,
              odd: i % 2 === 1,
            },
          });
          evalNodes(n.body, scopes, opts, out);
          scopes.pop();
        });
        break;
      }

      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const cache = new Map();

export function compile(template, opts = {}) {
  const o = {
    strict: opts.strict !== false,
    partials: opts.partials || {},
    name: opts.name || 'template',
    _depth: opts._depth || 0,
  };
  const key = `${o.name} ${template}`;
  let ast = cache.get(key);
  if (!ast) {
    ast = parse(tokenize(template));
    cache.set(key, ast);
  }
  return (data, parentScopes) => {
    const scopes = parentScopes
      ? [...parentScopes.slice(0, -1), { value: data, meta: {} }]
      : [{ value: data, meta: {} }];
    const out = [];
    evalNodes(ast.body, scopes, o, out);
    return out.join('');
  };
}

/**
 * Render a template string with `vars`.
 *
 * Backwards note: the reference engine treated every `{{key}}` as RAW html and
 * relied on callers to pre-escape. This engine escapes `{{key}}` and leaves
 * `{{{key}}}` raw (mustache convention), so callers must stop double-escaping.
 * build-blog.mjs was updated accordingly — see the comment there.
 */
export function render(template, vars, opts = {}) {
  return compile(template, opts)(vars);
}

export async function loadPartial(root, name) {
  const { readFile } = await import('fs/promises');
  const { join } = await import('path');
  return readFile(join(root, 'templates', 'partials', name), 'utf8');
}

/** Load every *.html in templates/partials as a partial registry keyed by basename. */
export async function loadPartials(root) {
  const { readdir, readFile } = await import('fs/promises');
  const { join, basename } = await import('path');
  const dir = join(root, 'templates', 'partials');
  const out = {};
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.html')) continue;
    out[basename(f, '.html')] = await readFile(join(dir, f), 'utf8');
  }
  return out;
}

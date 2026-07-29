/**
 * app.js — the intake portal.
 *
 * The preview is not a mock. It calls `renderSiteFrom` — the same function
 * `npm run derive` calls — against the same templates, and validates with the
 * same `validateConfig` the engine runs at boot. A portal with its own
 * approximations would drift, and the drift only surfaces after a client has
 * signed off on a preview of a site that does not exist.
 */
import { SECTIONS, VERTICALS, LAYOUT_INFO, PALETTE_PRESETS, GOOGLE_FONTS_DISPLAY, GOOGLE_FONTS_BODY } from './fields.js';

/* eslint-disable no-undef */
const { validateConfig, buildDerived, ConfigError, DAYS } = window.__FACTORY__;
const { renderSiteFrom } = window.__FACTORY__;
const { contrastRatio } = window.__FACTORY__;
const TEMPLATES = window.__TEMPLATES__;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return n;
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const BLANK = {
  business: { address_country: 'US' },
  location: { address_country: 'US', location_anchors: [], service_area: [] },
  hours: { days: [], opens: '09:00', closes: '18:00', per_day: null },
  booking: { model: 'appointment-only', publish_phone: false, publish_email: false, social: {} },
  homepage: { faq: [], testimonials: [] },
  services: [],
  brand: {
    voice_adjectives: [], banned_extra: [],
    palette: { ...PALETTE_PRESETS[0] }, fonts: { display: 'Fraunces', body: 'Inter' },
    layout_variant: 'editorial',
  },
  site: { blog_path: '/blog' },
  content: {
    cadence_days: ['Monday', 'Thursday'], publish_hour_local: '09:00', articles_per_day_max: 1,
    publish_mode: 'instant',
    word_count: { min: 850, max: 1500, target_min: 900, target_max: 1400 },
    originality_max_similarity: 0.85, queue_dedupe_max_similarity: 0.80,
    internal_links: { min: 2, max: 4 },
    location_mentions_min: 3, faq_questions: 4,
    buckets: ['hyperlocal', 'service-detail', 'comparison', 'question', 'aftercare', 'pricing', 'first-timer', 'eeat'],
    topics_to_seed: 50,
    limits: { max_topics_per_run: 3, max_regen_per_topic: 2, max_api_calls_per_run: 5, max_derive_api_calls: 4 },
  },
  compliance: {
    no_medical_claims: true, no_guarantees: true,
    no_superlatives_without_evidence: true, no_invented_prices: true,
  },
  integrations: { anthropic_model: 'claude-sonnet-4-5-20250929' },
};

let state = structuredClone(BLANK);
let vertical = null;
let step = 0;
let dirty = false;

const ALL_BUCKETS = ['hyperlocal', 'service-detail', 'comparison', 'question', 'aftercare', 'pricing', 'first-timer', 'eeat', 'myth-busting', 'seasonal'];

function get(path, obj = state) {
  return path.split('.').reduce((a, k) => (a === null || a === undefined ? a : a[k]), obj);
}
function set(path, value) {
  const parts = path.split('.');
  let o = state;
  for (const p of parts.slice(0, -1)) {
    if (o[p] === null || typeof o[p] !== 'object') o[p] = {};
    o = o[p];
  }
  o[parts.at(-1)] = value;
  dirty = true;
  scheduleRefresh();
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return structuredClone(patch);
  if (!patch || typeof patch !== 'object') return patch === undefined ? base : patch;
  const out = Array.isArray(base) ? [] : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k]))
      ? deepMerge(base[k], v)
      : structuredClone(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validation — the engine's own validator, plus portal-only guidance
// ---------------------------------------------------------------------------

function buildConfigObject() {
  const c = structuredClone(state);
  // Prune empties so the validator sees "absent" rather than "blank".
  const prune = (o) => {
    if (Array.isArray(o)) return o.filter((v) => v !== '' && v !== null && v !== undefined).map(prune);
    if (o && typeof o === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(o)) {
        const p = prune(v);
        const empty = p === '' || p === null || p === undefined
          || (Array.isArray(p) && p.length === 0 && !['location_anchors', 'faq', 'services', 'days', 'cadence_days', 'buckets', 'voice_adjectives'].includes(k));
        if (!empty) out[k] = p;
      }
      return out;
    }
    return o;
  };
  const pruned = prune(c);
  if (!state.hours.per_day || !Object.keys(state.hours.per_day || {}).length) delete pruned.hours?.per_day;
  return pruned;
}

function validate() {
  const cfg = buildConfigObject();
  let errors = [];
  try {
    validateConfig(cfg);
  } catch (e) {
    if (e instanceof ConfigError || e.name === 'ConfigError') {
      errors = e.message.split('\n').filter((l) => l.trim().startsWith('•')).map((l) => l.replace(/^\s*•\s*/, ''));
    } else throw e;
  }
  return { cfg, errors };
}

/** Advice that is not a hard failure but that people regret ignoring. */
function advisories() {
  const out = [];
  const s = state;
  if ((s.location.location_anchors || []).length && (s.location.location_anchors || []).length < 10) {
    out.push('Fewer than 10 local anchors. Every article must name several distinct ones; a thin list makes them repeat and near-duplicate articles get rejected.');
  }
  if ((s.services || []).length && s.services.every((x) => !x.price_from)) {
    out.push('No service has a price. That is allowed, but the writer is then forbidden from mentioning any price at all, and "how much is…" is one of the highest-intent searches in this trade.');
  }
  if (s.booking.publish_phone && !s.booking.url) {
    out.push('You publish a phone number but no booking link, so every "Book" button will be omitted.');
  }
  if (!s.booking.url && !s.booking.publish_phone && !s.booking.publish_email) {
    out.push('No booking link, no phone, no email — the site will have no way to contact you at all.');
  }
  if ((s.homepage.faq || []).length && s.homepage.faq.length < s.content.faq_questions) {
    out.push(`You have ${s.homepage.faq.length} homepage FAQs but articles are set to ${s.content.faq_questions} questions each. The dry-run sample draws from the homepage list, so add more or lower the per-article count.`);
  }
  if (!s.integrations.sentry_dsn) {
    out.push('No Sentry DSN. Without a heartbeat, "the publisher stopped running entirely" is invisible — that failure mode once ran for eight days unnoticed.');
  }
  if (s.brand.palette) {
    const r = contrastRatio(s.brand.palette.accent, s.brand.palette.bg);
    if (r >= 3 && r < 4.5) out.push(`Accent on background is ${r.toFixed(2)}:1 — fine for large text and buttons, but do not use it for body copy.`);
  }
  const anchors = (s.location.location_anchors || []).map((a) => a.toLowerCase().trim());
  if (new Set(anchors).size !== anchors.length) out.push('Two of your local anchors are identical.');
  return out;
}

// ---------------------------------------------------------------------------
// Field renderers
// ---------------------------------------------------------------------------

function fieldWrap(f, ...control) {
  const bits = [];
  if (f.label) {
    bits.push(el('label', { class: 'f__label' }, f.label,
      f.req ? el('span', { class: 'f__req' }, 'required') : null,
      f.opt ? el('span', { class: 'f__opt' }, 'optional') : null));
  }
  bits.push(...control);
  if (f.hint) bits.push(el('p', { class: 'f__hint' }, f.hint));
  if (f.warn) bits.push(el('p', { class: 'f__warn' }, f.warn));
  return el('div', { class: 'f', 'data-path': f.path }, bits);
}

function textInput(f) {
  const v = get(f.path) ?? f.def ?? '';
  const input = el('input', {
    class: 'inp', type: 'text', value: v, placeholder: f.placeholder || '',
    oninput: (e) => {
      let val = e.target.value;
      if (f.slug) val = slugify(val);
      set(f.path, val);
      if (f.counter) count.textContent = counterText(val, f.maxlen);
      if (f.path === 'business.short_name' && !get('business.author_id')) {
        set('business.author_id', `${slugify(val)}-team`);
        refreshInputs();
      }
    },
  });
  const count = f.counter ? el('span', { class: 'f__count' }, counterText(v, f.maxlen)) : null;
  return fieldWrap(f, el('div', { class: 'f__row' }, input, count));
}

function counterText(v, max) {
  const n = String(v || '').length;
  return max ? `${n}/${max}` : String(n);
}

function textArea(f) {
  const v = get(f.path) ?? '';
  const ta = el('textarea', {
    class: 'inp inp--area', rows: f.rows || 3,
    oninput: (e) => { set(f.path, e.target.value); if (f.counter) count.textContent = counterText(e.target.value, f.maxlen); },
  });
  ta.value = v;
  const count = f.counter ? el('span', { class: 'f__count' }, counterText(v, f.maxlen)) : null;
  return fieldWrap(f, ta, count);
}

function numberInput(f) {
  const v = get(f.path) ?? f.def ?? '';
  return fieldWrap(f, el('input', {
    class: 'inp inp--num', type: 'number', value: v,
    oninput: (e) => set(f.path, e.target.value === '' ? '' : Number(e.target.value)),
  }));
}

function selectInput(f) {
  const v = get(f.path) ?? f.def ?? '';
  const sel = el('select', { class: 'inp', onchange: (e) => set(f.path, e.target.value) },
    !v ? el('option', { value: '' }, '— choose —') : null,
    f.options.map(([val, label]) => el('option', { value: val, selected: val === v }, label)));
  return fieldWrap(f, sel);
}

function toggleInput(f) {
  const v = get(f.path) ?? f.def ?? false;
  const btn = el('button', {
    class: `tog ${v ? 'is-on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(!!v),
    onclick: () => { set(f.path, !get(f.path)); render(); },
  }, el('span', { class: 'tog__dot' }), el('span', { class: 'tog__txt' }, v ? 'Yes' : 'No'));
  return fieldWrap(f, btn);
}

function timeInput(f) {
  const v = get(f.path) ?? f.def ?? '09:00';
  return fieldWrap(f, el('input', {
    class: 'inp inp--time', type: 'time', value: v,
    oninput: (e) => set(f.path, e.target.value),
  }));
}

function listInput(f) {
  const items = get(f.path) || [];
  const rows = items.map((item, i) => el('div', { class: 'list__row' },
    el('input', {
      class: 'inp', type: 'text', value: item,
      oninput: (e) => { const a = [...get(f.path)]; a[i] = e.target.value; set(f.path, a); },
    }),
    el('button', {
      class: 'btn btn--icon', type: 'button', title: 'Remove',
      onclick: () => { const a = [...get(f.path)]; a.splice(i, 1); set(f.path, a); render(); },
    }, '×')));
  const counter = f.min ? el('span', { class: `list__count ${items.length < f.min ? 'is-short' : 'is-ok'}` },
    `${items.length}${f.min ? ` / ${f.min} minimum` : ''}`) : null;
  return fieldWrap(f,
    el('div', { class: 'list' }, rows,
      el('div', { class: 'list__foot' },
        el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { set(f.path, [...(get(f.path) || []), '']); render(); } }, '+ Add'),
        counter)));
}

function hoursInput(f) {
  const h = state.hours;
  h.days ||= [];
  const perDay = h.per_day && Object.keys(h.per_day).length > 0;
  const dayRow = (d) => {
    const on = h.days.includes(d);
    const dh = (h.per_day || {})[d] || { opens: h.opens, closes: h.closes };
    return el('div', { class: `hrs__row ${on ? 'is-on' : ''}` },
      el('button', {
        class: `chip ${on ? 'is-on' : ''}`, type: 'button',
        onclick: () => {
          const days = on ? h.days.filter((x) => x !== d) : [...h.days, d];
          days.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
          state.hours.days = days;
          if (!on && state.hours.per_day) state.hours.per_day[d] = { opens: h.opens, closes: h.closes };
          if (on && state.hours.per_day) delete state.hours.per_day[d];
          dirty = true; render();
        },
      }, d.slice(0, 3)),
      on && perDay ? el('div', { class: 'hrs__times' },
        el('input', {
          class: 'inp inp--time', type: 'time', value: dh.opens,
          oninput: (e) => { state.hours.per_day[d] = { ...state.hours.per_day[d], opens: e.target.value }; dirty = true; scheduleRefresh(); },
        }),
        el('span', { class: 'hrs__dash' }, '–'),
        el('input', {
          class: 'inp inp--time', type: 'time', value: dh.closes,
          oninput: (e) => { state.hours.per_day[d] = { ...state.hours.per_day[d], closes: e.target.value }; dirty = true; scheduleRefresh(); },
        })) : null,
      on && !perDay ? el('span', { class: 'hrs__same muted' }, 'same hours') : null);
  };

  return fieldWrap(f,
    el('div', { class: 'hrs' },
      !perDay ? el('div', { class: 'hrs__uniform' },
        el('label', {}, 'Opens'),
        el('input', { class: 'inp inp--time', type: 'time', value: h.opens, oninput: (e) => set('hours.opens', e.target.value) }),
        el('label', {}, 'Closes'),
        el('input', { class: 'inp inp--time', type: 'time', value: h.closes, oninput: (e) => set('hours.closes', e.target.value) })) : null,
      el('div', { class: 'hrs__days' }, DAYS.map(dayRow)),
      el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button',
        onclick: () => {
          if (perDay) state.hours.per_day = null;
          else {
            state.hours.per_day = {};
            for (const d of h.days) state.hours.per_day[d] = { opens: h.opens, closes: h.closes };
          }
          dirty = true; render();
        },
      }, perDay ? 'Use the same hours every day' : 'Set hours per day')));
}

function servicesInput(f) {
  const list = (state.services ||= []);
  const card = (s, i) => el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('span', { class: 'card__n' }, String(i + 1)),
      el('input', {
        class: 'inp inp--title', type: 'text', placeholder: 'Service name', value: s.label || '',
        oninput: (e) => {
          list[i].label = e.target.value;
          if (!list[i]._keyEdited) list[i].key = slugify(e.target.value);
          dirty = true; scheduleRefresh(); $(`#svc-key-${i}`).value = list[i].key || '';
        },
      }),
      el('button', { class: 'btn btn--icon', type: 'button', title: 'Remove', onclick: () => { list.splice(i, 1); dirty = true; render(); } }, '×')),
    el('div', { class: 'card__grid' },
      el('label', { class: 'mini' }, 'ID',
        el('input', {
          class: 'inp', id: `svc-key-${i}`, type: 'text', value: s.key || '',
          oninput: (e) => { list[i].key = slugify(e.target.value); list[i]._keyEdited = true; dirty = true; scheduleRefresh(); },
        })),
      el('label', { class: 'mini' }, 'Price from',
        el('input', {
          class: 'inp', type: 'text', placeholder: 'e.g. $65 — blank if it varies', value: s.price_from || '',
          oninput: (e) => { list[i].price_from = e.target.value; dirty = true; scheduleRefresh(); },
        })),
      el('label', { class: 'mini' }, 'Price suffix',
        el('input', {
          class: 'inp', type: 'text', placeholder: '+  or  /hr', value: s.price_note || '',
          oninput: (e) => { list[i].price_note = e.target.value; dirty = true; scheduleRefresh(); },
        })),
      el('label', { class: 'mini' }, 'Duration',
        el('input', {
          class: 'inp', type: 'text', placeholder: '45 min', value: s.duration || '',
          oninput: (e) => { list[i].duration = e.target.value; dirty = true; scheduleRefresh(); },
        }))),
    el('label', { class: 'mini' }, 'Description',
      el('textarea', {
        class: 'inp inp--area', rows: 2, placeholder: 'One or two plain sentences.',
        oninput: (e) => { list[i].description = e.target.value; dirty = true; scheduleRefresh(); },
      }, s.description || '')));

  return fieldWrap(f,
    el('div', { class: 'cards' }, list.map(card),
      el('div', { class: 'list__foot' },
        el('button', {
          class: 'btn btn--ghost', type: 'button',
          onclick: () => { list.push({ key: '', label: '', price_from: '', price_note: '', duration: '', description: '' }); dirty = true; render(); },
        }, '+ Add service'),
        el('span', { class: `list__count ${list.length < 4 ? 'is-short' : 'is-ok'}` }, `${list.length} / 4 minimum, 10 maximum`))));
}

function faqInput(f) {
  const list = (state.homepage.faq ||= []);
  return fieldWrap(f,
    el('div', { class: 'cards' },
      list.map((q, i) => el('div', { class: 'card' },
        el('div', { class: 'card__head' },
          el('span', { class: 'card__n' }, String(i + 1)),
          el('input', {
            class: 'inp inp--title', type: 'text', placeholder: 'The question, in the words clients use', value: q.q || '',
            oninput: (e) => { list[i].q = e.target.value; dirty = true; scheduleRefresh(); },
          }),
          el('button', { class: 'btn btn--icon', type: 'button', onclick: () => { list.splice(i, 1); dirty = true; render(); } }, '×')),
        el('textarea', {
          class: 'inp inp--area', rows: 3, placeholder: 'The answer you would actually give.',
          oninput: (e) => { list[i].a = e.target.value; dirty = true; scheduleRefresh(); },
        }, q.a || ''))),
      el('div', { class: 'list__foot' },
        el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { list.push({ q: '', a: '' }); dirty = true; render(); } }, '+ Add question'),
        el('span', { class: `list__count ${list.length < 6 ? 'is-short' : 'is-ok'}` }, `${list.length} / 6 minimum, 10 maximum`))));
}

function testimonialsInput(f) {
  const list = (state.homepage.testimonials ||= []);
  return fieldWrap(f,
    el('div', { class: 'cards' },
      list.map((t, i) => el('div', { class: 'card' },
        el('div', { class: 'card__head' },
          el('span', { class: 'card__n' }, String(i + 1)),
          el('input', {
            class: 'inp inp--title', type: 'text', placeholder: 'Attribution — a name, or "R.M., client since 2021"', value: t.attribution || '',
            oninput: (e) => { list[i].attribution = e.target.value; dirty = true; scheduleRefresh(); },
          }),
          el('button', { class: 'btn btn--icon', type: 'button', onclick: () => { list.splice(i, 1); dirty = true; render(); } }, '×')),
        el('textarea', {
          class: 'inp inp--area', rows: 2, placeholder: 'The quote.',
          oninput: (e) => { list[i].quote = e.target.value; dirty = true; scheduleRefresh(); },
        }, t.quote || ''))),
      el('div', { class: 'list__foot' },
        el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { list.push({ quote: '', attribution: '' }); dirty = true; render(); } }, '+ Add testimonial'))));
}

function paletteInput(f) {
  const p = (state.brand.palette ||= { ...PALETTE_PRESETS[0] });
  const swatch = (key, label) => el('label', { class: 'sw' },
    el('input', {
      class: 'sw__in', type: 'color', value: p[key] || '#000000',
      oninput: (e) => { state.brand.palette[key] = e.target.value; dirty = true; scheduleRefresh(); paintContrast(); },
    }),
    el('span', { class: 'sw__meta' }, el('strong', {}, label),
      el('input', {
        class: 'sw__hex', type: 'text', value: p[key] || '',
        oninput: (e) => { state.brand.palette[key] = e.target.value; dirty = true; scheduleRefresh(); paintContrast(); },
      })));

  const contrastBox = el('div', { class: 'contrast', id: 'contrastBox' });
  const presets = el('div', { class: 'presets' }, PALETTE_PRESETS.map((pr) => el('button', {
    class: 'preset', type: 'button', title: pr.name,
    style: `--a:${pr.bg};--b:${pr.surface};--c:${pr.accent};--d:${pr.text}`,
    onclick: () => { state.brand.palette = { bg: pr.bg, surface: pr.surface, accent: pr.accent, text: pr.text, muted: pr.muted }; dirty = true; render(); },
  }, el('span', { class: 'preset__name' }, pr.name))));

  const node = fieldWrap(f, presets,
    el('div', { class: 'sws' }, swatch('bg', 'Background'), swatch('surface', 'Surface'),
      swatch('accent', 'Accent'), swatch('text', 'Text'), swatch('muted', 'Muted text')),
    contrastBox);
  setTimeout(paintContrast, 0);
  return node;
}

function paintContrast() {
  const box = $('#contrastBox');
  if (!box) return;
  const p = state.brand.palette;
  const checks = [
    ['Body text on background', p.text, p.bg, 4.5],
    ['Muted text on background', p.muted, p.bg, 4.5],
    ['Body text on surface', p.text, p.surface, 4.5],
    ['Accent on background', p.accent, p.bg, 3.0],
  ];
  box.replaceChildren(...checks.map(([label, a, b, min]) => {
    let r = 0;
    try { r = contrastRatio(a, b); } catch { r = 0; }
    const ok = r >= min;
    return el('div', { class: `contrast__row ${ok ? 'is-ok' : 'is-bad'}` },
      el('span', { class: 'contrast__sample', style: `background:${b};color:${a}` }, 'Aa'),
      el('span', { class: 'contrast__label' }, label),
      el('span', { class: 'contrast__ratio' }, `${r.toFixed(2)}:1`),
      el('span', { class: 'contrast__verdict' }, ok ? `passes AA (${min}:1)` : `FAILS AA — needs ${min}:1`));
  }));
}

function fontsInput(f) {
  const fonts = (state.brand.fonts ||= { display: 'Fraunces', body: 'Inter' });
  const picker = (key, label, opts) => el('label', { class: 'mini' }, label,
    el('select', {
      class: 'inp',
      onchange: (e) => { state.brand.fonts[key] = e.target.value; dirty = true; loadFontPreview(); scheduleRefresh(); },
    }, opts.map((o) => el('option', { value: o, selected: o === fonts[key] }, o))));
  return fieldWrap(f,
    el('div', { class: 'card__grid' }, picker('display', 'Headings', GOOGLE_FONTS_DISPLAY), picker('body', 'Body', GOOGLE_FONTS_BODY)),
    el('div', { class: 'fontprev', id: 'fontPrev' },
      el('p', { class: 'fontprev__d' }, state.business?.tagline || 'The quick brown fox'),
      el('p', { class: 'fontprev__b' }, 'Body copy sets the tone more than the headline does. This is roughly the size and rhythm it will read at on the page.')));
}

function loadFontPreview() {
  const f = state.brand.fonts;
  const id = 'fontPrevLink';
  let link = document.getElementById(id);
  if (!link) { link = el('link', { id, rel: 'stylesheet' }); document.head.append(link); }
  const fam = [f.display, f.body].map((x) => `family=${x.trim().replace(/\s+/g, '+')}:wght@400;600`).join('&');
  link.href = `https://fonts.googleapis.com/css2?${fam}&display=swap`;
  const prev = $('#fontPrev');
  if (prev) {
    $('.fontprev__d', prev).style.fontFamily = `"${f.display}", serif`;
    $('.fontprev__b', prev).style.fontFamily = `"${f.body}", sans-serif`;
  }
}

function layoutInput(f) {
  const cur = state.brand.layout_variant;
  return fieldWrap(f, el('div', { class: 'layouts' },
    Object.entries(LAYOUT_INFO).map(([key, info]) => el('button', {
      class: `layout ${cur === key ? 'is-on' : ''}`, type: 'button',
      onclick: () => { set('brand.layout_variant', key); render(); },
    },
    el('span', { class: `layout__viz layout__viz--${key}` },
      el('i'), el('i'), el('i'), el('i')),
    el('strong', {}, info.name),
    el('span', { class: 'layout__blurb' }, info.blurb),
    el('span', { class: 'layout__shape' }, info.shape)))));
}

function daysInput(f) {
  const cur = get(f.path) || [];
  return fieldWrap(f, el('div', { class: 'chips' }, DAYS.map((d) => el('button', {
    class: `chip ${cur.includes(d) ? 'is-on' : ''}`, type: 'button',
    onclick: () => {
      const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
      next.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
      set(f.path, next); render();
    },
  }, d.slice(0, 3)))));
}

function bucketsInput(f) {
  const cur = get(f.path) || [];
  return fieldWrap(f, el('div', { class: 'chips' }, ALL_BUCKETS.map((b) => el('button', {
    class: `chip chip--wide ${cur.includes(b) ? 'is-on' : ''}`, type: 'button',
    onclick: () => { set(f.path, cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]); render(); },
  }, b))));
}

function wordCountInput(f) {
  const w = (state.content.word_count ||= structuredClone(BLANK.content.word_count));
  const n = (key, label) => el('label', { class: 'mini' }, label,
    el('input', {
      class: 'inp inp--num', type: 'number', value: w[key],
      oninput: (e) => { state.content.word_count[key] = Number(e.target.value); dirty = true; scheduleRefresh(); },
    }));
  return fieldWrap(f, el('div', { class: 'card__grid' },
    n('min', 'Hard floor'), n('target_min', 'Aim from'), n('target_max', 'Aim to'), n('max', 'Hard ceiling')));
}

function thresholdsInput(f) {
  const c = state.content;
  const box = el('div', { class: 'thr' },
    el('label', { class: 'mini' }, 'SEED gate — reject a new topic this similar to an existing one',
      el('input', {
        class: 'inp inp--num', type: 'number', step: '0.01', min: '0.5', max: '0.99', value: c.queue_dedupe_max_similarity,
        oninput: (e) => { state.content.queue_dedupe_max_similarity = Number(e.target.value); dirty = true; scheduleRefresh(); paintThreshold(); },
      })),
    el('label', { class: 'mini' }, 'PUBLISH gate — reject a finished article this similar to an existing one',
      el('input', {
        class: 'inp inp--num', type: 'number', step: '0.01', min: '0.5', max: '0.99', value: c.originality_max_similarity,
        oninput: (e) => { state.content.originality_max_similarity = Number(e.target.value); dirty = true; scheduleRefresh(); paintThreshold(); },
      })),
    el('p', { class: 'thr__verdict', id: 'thrVerdict' }));
  const node = fieldWrap(f, box);
  setTimeout(paintThreshold, 0);
  return node;
}

function paintThreshold() {
  const v = $('#thrVerdict');
  if (!v) return;
  const { queue_dedupe_max_similarity: seed, originality_max_similarity: pub } = state.content;
  const ok = seed < pub;
  v.className = `thr__verdict ${ok ? 'is-ok' : 'is-bad'}`;
  v.textContent = ok
    ? `Seed ${seed} is stricter than publish ${pub}. Correct — near-duplicate topics are caught before they are ever written.`
    : `Seed ${seed} is not stricter than publish ${pub}. This will let near-duplicate topics into the queue, where they produce articles that fail the publish gate forever.`;
}

function minMaxInput(f) {
  const v = get(f.path) || f.def;
  const n = (key, label) => el('label', { class: 'mini' }, label,
    el('input', {
      class: 'inp inp--num', type: 'number', value: v[key],
      oninput: (e) => { const cur = { ...get(f.path) }; cur[key] = Number(e.target.value); set(f.path, cur); },
    }));
  return fieldWrap(f, el('div', { class: 'card__grid' }, n('min', 'Minimum'), n('max', 'Maximum')));
}

function limitsInput(f) {
  const L = (state.content.limits ||= structuredClone(BLANK.content.limits));
  const rows = [
    ['max_topics_per_run', 'Topics attempted per run', 'How many different topics one run may try before giving up.'],
    ['max_regen_per_topic', 'Regenerations per topic', '2 means 3 attempts total. Past that the topic is quarantined rather than retried forever.'],
    ['max_api_calls_per_run', 'API calls per run', 'A real counter that aborts the run. Without it the worst case is topics × attempts, uncapped.'],
    ['max_derive_api_calls', 'API calls per derive', 'Seeding the brain is the most expensive operation in the system.'],
  ];
  return fieldWrap(f, el('div', { class: 'limits' }, rows.map(([key, label, hint]) => el('label', { class: 'mini' }, label,
    el('input', {
      class: 'inp inp--num', type: 'number', value: L[key],
      oninput: (e) => { state.content.limits[key] = Number(e.target.value); dirty = true; scheduleRefresh(); },
    }),
    el('span', { class: 'mini__hint' }, hint)))));
}

function verticalInput(f) {
  return fieldWrap(f, el('div', { class: 'verticals' }, Object.entries(VERTICALS).map(([key, v]) => el('button', {
    class: `vert ${vertical === key ? 'is-on' : ''}`, type: 'button',
    onclick: () => { applyVertical(key); render(); },
  },
  el('strong', {}, v.label),
  v.complianceNote ? el('span', { class: 'vert__note' }, v.complianceNote) : el('span', { class: 'vert__note muted' }, 'Standard compliance rules.')))));
}

function applyVertical(key) {
  vertical = key;
  const v = VERTICALS[key];
  set('business.type', v.type);
  set('business.category_schema', v.schema);
  state.content.buckets = [...v.buckets];
  state.compliance = { ...state.compliance, ...v.compliance };
  if (v.complianceNote) state.compliance.extra_notes = v.complianceNote;
  const existing = new Set(state.brand.banned_extra || []);
  state.brand.banned_extra = [...new Set([...existing, ...v.banned])];
  dirty = true;
}

const RENDERERS = {
  text: textInput, textarea: textArea, number: numberInput, select: selectInput,
  toggle: toggleInput, time: timeInput, list: listInput, hours: hoursInput,
  services: servicesInput, faq: faqInput, testimonials: testimonialsInput,
  palette: paletteInput, fonts: fontsInput, layout: layoutInput, days: daysInput,
  buckets: bucketsInput, wordcount: wordCountInput, thresholds: thresholdsInput,
  minmax: minMaxInput, limits: limitsInput, vertical: verticalInput,
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { updateStatus(); updatePreview(); }, 250);
}

function refreshInputs() {
  const author = $('[data-path="business.author_id"] input');
  if (author) author.value = get('business.author_id') || '';
}

function render() {
  const section = SECTIONS[step];
  $('#steps').replaceChildren(...SECTIONS.map((s, i) => el('button', {
    class: `step ${i === step ? 'is-on' : ''} ${sectionComplete(s) ? 'is-done' : ''}`,
    type: 'button', onclick: () => { step = i; render(); },
  }, el('span', { class: 'step__n' }, String(i + 1)), s.title)));

  $('#panel').replaceChildren(...[
    el('header', { class: 'panel__head' },
      el('h2', {}, section.title),
      section.blurb ? el('p', { class: 'panel__blurb' }, section.blurb) : null),
    ...section.fields
      .filter((f) => !f.showIf || !!get(f.showIf))
      .map((f) => (RENDERERS[f.type] || textInput)(f)),
    el('nav', { class: 'panel__nav' },
      el('button', { class: 'btn btn--ghost', type: 'button', disabled: step === 0, onclick: () => { step = Math.max(0, step - 1); render(); } }, '← Back'),
      el('button', {
        class: 'btn btn--accent', type: 'button', disabled: step === SECTIONS.length - 1,
        onclick: () => { step = Math.min(SECTIONS.length - 1, step + 1); render(); },
      }, 'Next →')),
  ].filter(Boolean));

  loadFontPreview();
  updateStatus();
  updatePreview();
}

function sectionComplete(s) {
  return s.fields.filter((f) => f.req).every((f) => {
    if (f.path === '_vertical') return !!vertical;
    if (f.path === 'hours') return state.hours.days.length > 0;
    if (f.path === 'content._thresholds') return true;
    const v = get(f.path);
    if (Array.isArray(v)) return v.length >= (f.min || 1) && v.every((x) => (typeof x === 'string' ? x.trim() : true));
    return v !== undefined && v !== null && v !== '';
  });
}

function updateStatus() {
  const { errors } = validate();
  const notes = advisories();
  const ok = errors.length === 0;

  // replaceChildren stringifies null into a literal "null" text node — hence
  // the filter. el() already guards its own children; this is the top level.
  $('#status').replaceChildren(...[
    el('div', { class: `status__pill ${ok ? 'is-ok' : 'is-bad'}` },
      ok ? 'Ready to build' : `${errors.length} thing${errors.length === 1 ? '' : 's'} left`),
    errors.length ? el('ul', { class: 'status__list' }, errors.slice(0, 12).map((e) => el('li', {}, e))) : null,
    errors.length > 12 ? el('p', { class: 'muted' }, `…and ${errors.length - 12} more.`) : null,
    notes.length ? el('details', { class: 'status__adv' },
      el('summary', {}, `${notes.length} thing${notes.length === 1 ? '' : 's'} worth a look`),
      el('ul', {}, notes.map((n) => el('li', {}, n)))) : null,
  ].filter(Boolean));

  $('#exportBtn').disabled = !ok;
  $('#buildBtn').disabled = !ok;
}

let previewVariantOverride = null;

/**
 * Paint the preview by writing directly into the iframe's document.
 *
 * Two approaches were tried and rejected first:
 *   • `srcdoc` — Chromium populates the DOM and computes layout (elements have
 *     real boxes and colours) but never composites a frame, so the panel is
 *     blank. Confirmed by measuring the h1's bounding box inside a box that
 *     screenshots pure white.
 *   • a Blob URL — a real navigation, so it paints when hosted, but blob: from
 *     a `file://` parent has an opaque origin and is blocked. The portal has to
 *     work when someone just double-clicks the HTML file.
 *
 * document.write is the one that works in both.
 */
function paintPreview(html) {
  const doc = $('#preview').contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
}

function updatePreview() {
  const { cfg, errors } = validate();
  if (errors.length) {
    paintPreview(`<!DOCTYPE html><meta charset="utf-8"><style>
      body{font:15px/1.6 system-ui,-apple-system,sans-serif;padding:2.5rem;color:#6b6f76;background:#faf9f7;margin:0}
      h3{color:#17181a;font-weight:600;margin:0 0 .6rem;font-size:16px}
      ul{padding-left:1.1rem;margin:.9rem 0 0}li{margin:.35rem 0;font-size:13.5px}</style>
      <h3>The preview is waiting on a few fields</h3>
      <p>It runs the real builder, so it needs a config the builder would accept.</p>
      <ul>${errors.slice(0, 6).map((e) => `<li>${e.replace(/</g, '&lt;')}</li>`).join('')}</ul>`);
    return;
  }
  try {
    const c = structuredClone(cfg);
    if (previewVariantOverride) c.brand.layout_variant = previewVariantOverride;
    c.derived = buildDerived(c);
    const { indexHtml, css } = renderSiteFrom(c, TEMPLATES);
    paintPreview(indexHtml
      .replace('<link rel="stylesheet" href="/assets/styles.css" />', `<style>${css}</style>`)
      .replace('<script src="/assets/script.js" defer></script>', ''));
  } catch (e) {
    paintPreview(`<!DOCTYPE html><meta charset="utf-8"><style>
      body{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;padding:2rem;color:#a3271f;margin:0}
      h3{font-family:system-ui,sans-serif;margin:0 0 .8rem}pre{white-space:pre-wrap}</style>
      <h3>The builder rejected this config</h3><pre>${String(e.message).replace(/</g, '&lt;')}</pre>`);
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function toYaml(o, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(o)) {
    if (!o.length) return ' []';
    return `\n${o.map((v) => {
      if (v && typeof v === 'object') return `${pad}- ${toYaml(v, indent + 1).replace(/^\n/, '').replace(new RegExp(`^${'  '.repeat(indent + 1)}`), '')}`;
      return `${pad}- ${scalar(v)}`;
    }).join('\n')}`;
  }
  if (o && typeof o === 'object') {
    const keys = Object.keys(o).filter((k) => !k.startsWith('_'));
    if (!keys.length) return ' {}';
    return `\n${keys.map((k) => {
      const v = o[k];
      if (v && typeof v === 'object') return `${pad}${k}:${toYaml(v, indent + 1)}`;
      return `${pad}${k}: ${scalar(v)}`;
    }).join('\n')}`;
  }
  return ` ${scalar(o)}`;
}

function scalar(v) {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s.includes('\n')) return `>-\n${s.split('\n').map((l) => `      ${l.trim()}`).join('\n')}`;
  return JSON.stringify(s);
}

function configYaml() {
  const { cfg } = validate();
  const clean = structuredClone(cfg);
  delete clean.derived;
  for (const s of clean.services || []) delete s._keyEdited;
  const head = [
    '# ============================================================================',
    '# business.config.yaml',
    '#',
    '# THE SINGLE INPUT. Every artifact in the build derives from this file:',
    '# the brand voice, the banned-word list, the internal-link map, the byline,',
    '# the topic queue, the brand assets, and the site itself.',
    '#',
    '# Produced by the intake portal. Keep it at the repo root.',
    '# No business fact may live anywhere else — not in a .mjs, .ts, .html, .css,',
    '# and not in any other .yaml.',
    `# Generated ${new Date().toISOString().slice(0, 10)}`,
    '# ============================================================================',
    '',
  ].join('\n');
  const body = Object.keys(clean).map((k) => `${k}:${toYaml(clean[k], 1)}`).join('\n\n');
  return `${head}${body}\n`;
}

function download(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  $('#saveBtn').onclick = () => {
    download(`intake-${slugify(state.business.short_name || 'draft')}.json`,
      JSON.stringify({ state, vertical, step }, null, 2), 'application/json');
    dirty = false;
  };
  $('#loadBtn').onclick = () => $('#loadFile').click();
  $('#loadFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      // Deep merge, not spread: a spread replaces `homepage` wholesale, so a
      // config without a `testimonials` key drops the [] default and the
      // renderer throws on .map. Real configs routinely omit optional keys.
      state = deepMerge(structuredClone(BLANK), data.state || {});
      vertical = data.vertical ?? null;
      step = data.step ?? 0;
      dirty = false;
      render();
    } catch (err) {
      alert(`That file could not be read as a saved intake.\n\n${err.message}`);
    }
    e.target.value = '';
  };
  $('#exportBtn').onclick = () => { download('business.config.yaml', configYaml(), 'text/yaml'); dirty = false; };
  $('#buildBtn').onclick = showHandoff;
  $('#previewVariant').onchange = (e) => { previewVariantOverride = e.target.value || null; updatePreview(); };
  $('#deviceBtns').onclick = (e) => {
    const b = e.target.closest('button[data-w]');
    if (!b) return;
    $$('#deviceBtns button').forEach((x) => x.classList.toggle('is-on', x === b));
    $('#previewWrap').style.setProperty('--pw', b.dataset.w);
  };
  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
  render();
}

function showHandoff() {
  const yaml = configYaml();
  const dlg = $('#handoff');
  $('#handoffYaml').textContent = yaml;
  $('#copyYaml').onclick = async () => {
    await navigator.clipboard.writeText(yaml);
    $('#copyYaml').textContent = 'Copied';
    setTimeout(() => { $('#copyYaml').textContent = 'Copy'; }, 1500);
  };
  $('#dlYaml').onclick = () => download('business.config.yaml', yaml, 'text/yaml');
  dlg.showModal();
}

boot();

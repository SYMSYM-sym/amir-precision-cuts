/**
 * layout-variants.mjs — THE ANTI-RECOLOR MACHINERY.
 *
 * 04-FRONTEND-SPEC.md §D forbids shipping a recolor. 02-DERIVE-BRAIN.md §6
 * explains why that rule is dangerous: a recolor passes EVERY automated gate.
 * Zero fact-leaks, byte-identical re-runs, swap test green — and two clients
 * still get the same site in different hex codes. Only a human looking at both
 * catches it, and by then you have shipped.
 *
 * So distinctness has to be structural, and it has to be a lookup (not a model
 * call) or `--only=site` stops being deterministic. Each variant therefore
 * carries THREE things:
 *
 *   1. `tokens`   — the CSS custom properties. Note that `--step-*`, `--space`,
 *                   `--measure` and `--radius` DO NOT EXIST in the reference
 *                   stylesheet; every size there is a raw literal. The scale is
 *                   invented here, once, so it can vary per variant.
 *   2. `order`    — the section sequence. Different variants tell the story in
 *                   a different order; that alone changes the DOM.
 *   3. `sections` — which markup template each section uses. `services.rows`
 *                   and `services.grid` are genuinely different elements, not
 *                   the same <article> with a different class.
 *
 * Exit test (§02.6): diff two variants' index.html. If they differ only in
 * strings and hex codes, this file failed at its job.
 */

/** Every section the homepage can contain. 04 §A requires all of these to exist. */
export const ALL_SECTIONS = ['hero', 'about', 'services', 'aftercare', 'faq', 'visit'];

/**
 * Sections a variant MAY order but is not required to render.
 *
 * `gallery` only appears when the config supplies two or more images, so it
 * cannot be in ALL_SECTIONS — that list drives the "never renders section(s)"
 * check, and a business with no photographs would fail it. It still has to be
 * a KNOWN name, or the "orders unknown section(s)" check rejects it. Two lists,
 * two questions: what must every variant handle, and what is it allowed to.
 */
export const OPTIONAL_SECTIONS = ['gallery'];

export const VARIANTS = {
  /**
   * EDITORIAL — big whitespace, large display type, asymmetric.
   * Type-led hero with no image band. Services read as a numbered editorial
   * list, not cards. About runs asymmetric with a sticky detail column.
   */
  editorial: {
    label: 'editorial',
    tokens: {
      '--step--1': 'clamp(.83rem, .8rem + .2vw, .94rem)',
      '--step-0': 'clamp(1rem, .95rem + .3vw, 1.13rem)',
      '--step-1': 'clamp(1.33rem, 1.2rem + .7vw, 1.78rem)',
      '--step-2': 'clamp(1.78rem, 1.55rem + 1.2vw, 2.37rem)',
      '--step-3': 'clamp(2.37rem, 1.95rem + 2.1vw, 3.16rem)',
      '--step-4': 'clamp(3.16rem, 2.4rem + 3.8vw, 5.61rem)',
      '--space': 'clamp(1.25rem, 1rem + .9vw, 2rem)',
      '--section-y': 'clamp(6rem, 9vw, 10rem)',
      '--measure': '60ch',
      '--radius': '0px',
      '--radius-sm': '0px',
      '--rule': '1px',
      '--grid-about': '1.35fr .65fr',
      '--grid-visit': '1fr .8fr',
      '--max': '1240px',
      '--pad': 'clamp(20px, 4vw, 64px)',
      '--display-weight': '400',
      '--display-tracking': '-0.02em',
      '--eyebrow-tracking': '.24em',
      '--nav-h': '76px',
    },
    order: ['hero', 'about', 'services', 'gallery', 'aftercare', 'faq', 'visit'],
    sections: {
      hero: 'hero.editorial',
      gallery: 'gallery.grid',
      about: 'about.split',
      services: 'services.rows',
      aftercare: 'aftercare.columns',
      faq: 'faq.accordion',
      visit: 'visit.split',
    },
    heroHasImage: false,
    darkSections: ['services', 'faq'],
  },

  /**
   * COMPACT — information-dense, tighter vertical rhythm.
   * Services move UP to sit directly under the hero (the pitch is the price
   * list), and render as a dense definition table rather than cards. The hero
   * is short with an inline stat strip.
   */
  compact: {
    label: 'compact',
    tokens: {
      '--step--1': 'clamp(.8rem, .78rem + .1vw, .86rem)',
      '--step-0': 'clamp(.94rem, .92rem + .15vw, 1rem)',
      '--step-1': 'clamp(1.13rem, 1.08rem + .25vw, 1.25rem)',
      '--step-2': 'clamp(1.35rem, 1.26rem + .45vw, 1.56rem)',
      '--step-3': 'clamp(1.62rem, 1.47rem + .75vw, 1.95rem)',
      '--step-4': 'clamp(1.95rem, 1.7rem + 1.25vw, 2.44rem)',
      '--space': 'clamp(.75rem, .68rem + .35vw, 1rem)',
      '--section-y': 'clamp(3rem, 4.5vw, 4.5rem)',
      '--measure': '72ch',
      '--radius': '4px',
      '--radius-sm': '2px',
      '--rule': '1px',
      '--grid-about': '1fr 1fr',
      '--grid-visit': '1fr 1fr',
      '--max': '1100px',
      '--pad': 'clamp(16px, 3vw, 32px)',
      '--display-weight': '600',
      '--display-tracking': '-0.01em',
      '--eyebrow-tracking': '.12em',
      '--nav-h': '58px',
    },
    order: ['hero', 'services', 'gallery', 'about', 'faq', 'aftercare', 'visit'],
    sections: {
      gallery: 'gallery.grid',
      hero: 'hero.compact',
      about: 'about.split',
      services: 'services.table',
      aftercare: 'aftercare.inline',
      faq: 'faq.accordion',
      visit: 'visit.stacked',
    },
    heroHasImage: false,
    darkSections: ['about', 'aftercare'],
  },

  /**
   * GALLERY — image-led, wide cards, centered.
   * Centered hero over an image band, centered section heads throughout, and
   * services as a wide card grid. Aftercare becomes a numbered step strip.
   */
  gallery: {
    label: 'gallery',
    tokens: {
      '--step--1': 'clamp(.84rem, .81rem + .15vw, .92rem)',
      '--step-0': 'clamp(1rem, .96rem + .25vw, 1.1rem)',
      '--step-1': 'clamp(1.25rem, 1.17rem + .4vw, 1.44rem)',
      '--step-2': 'clamp(1.56rem, 1.42rem + .7vw, 1.95rem)',
      '--step-3': 'clamp(1.95rem, 1.72rem + 1.15vw, 2.6rem)',
      '--step-4': 'clamp(2.44rem, 2.05rem + 1.95vw, 3.6rem)',
      '--space': 'clamp(1.1rem, .95rem + .7vw, 1.75rem)',
      '--section-y': 'clamp(4.5rem, 7vw, 7.5rem)',
      '--measure': '55ch',
      '--radius': '12px',
      '--radius-sm': '8px',
      '--rule': '1px',
      '--grid-about': '1fr 1fr',
      '--grid-visit': '1fr 1fr',
      '--max': '1320px',
      '--pad': 'clamp(20px, 4vw, 48px)',
      '--display-weight': '500',
      '--display-tracking': '-0.015em',
      '--eyebrow-tracking': '.18em',
      '--nav-h': '72px',
    },
    order: ['hero', 'gallery', 'about', 'services', 'faq', 'aftercare', 'visit'],
    sections: {
      gallery: 'gallery.grid',
      hero: 'hero.gallery',
      about: 'about.centered',
      services: 'services.grid',
      aftercare: 'aftercare.steps',
      faq: 'faq.accordion',
      visit: 'visit.split',
    },
    heroHasImage: true,
    darkSections: ['services'],
  },

  /**
   * CLASSIC — symmetric, serif-forward, traditional.
   * Centered everything, rule-separated sections, services in a two-column
   * symmetric list, and a hero with a centered rule motif.
   */
  classic: {
    label: 'classic',
    tokens: {
      '--step--1': 'clamp(.85rem, .83rem + .12vw, .92rem)',
      '--step-0': 'clamp(1.02rem, 1rem + .15vw, 1.1rem)',
      '--step-1': 'clamp(1.22rem, 1.17rem + .28vw, 1.38rem)',
      '--step-2': 'clamp(1.47rem, 1.38rem + .45vw, 1.73rem)',
      '--step-3': 'clamp(1.76rem, 1.62rem + .72vw, 2.16rem)',
      '--step-4': 'clamp(2.11rem, 1.87rem + 1.2vw, 2.99rem)',
      '--space': 'clamp(1rem, .92rem + .5vw, 1.5rem)',
      '--section-y': 'clamp(4rem, 6vw, 6.5rem)',
      '--measure': '65ch',
      '--radius': '2px',
      '--radius-sm': '2px',
      '--rule': '2px',
      '--grid-about': '1fr 1fr',
      '--grid-visit': '1fr 1fr',
      '--max': '1080px',
      '--pad': 'clamp(20px, 3.5vw, 40px)',
      '--display-weight': '500',
      '--display-tracking': '0em',
      '--eyebrow-tracking': '.2em',
      '--nav-h': '68px',
    },
    order: ['hero', 'about', 'gallery', 'services', 'aftercare', 'faq', 'visit'],
    sections: {
      hero: 'hero.classic',
      gallery: 'gallery.grid',
      about: 'about.centered',
      services: 'services.columns',
      aftercare: 'aftercare.columns',
      faq: 'faq.accordion',
      visit: 'visit.stacked',
    },
    heroHasImage: false,
    darkSections: [],
  },
};

export function getVariant(name) {
  const v = VARIANTS[name];
  if (!v) {
    throw new Error(
      `Unknown brand.layout_variant "${name}". Known: ${Object.keys(VARIANTS).join(' | ')}. ` +
        'Add a new variant to scripts/layout-variants.mjs — do not hand-edit a client\'s CSS.',
    );
  }
  // Every variant must cover every section, or a homepage silently loses one.
  const missing = [...ALL_SECTIONS, ...OPTIONAL_SECTIONS].filter((s) => !v.sections[s]);
  if (missing.length) {
    throw new Error(`layout_variant "${name}" is missing section template(s): ${missing.join(', ')}`);
  }
  const stray = v.order.filter((s) => ![...ALL_SECTIONS, ...OPTIONAL_SECTIONS].includes(s));
  if (stray.length) throw new Error(`layout_variant "${name}" orders unknown section(s): ${stray.join(', ')}`);
  const dropped = ALL_SECTIONS.filter((s) => !v.order.includes(s));
  if (dropped.length) throw new Error(`layout_variant "${name}" never renders section(s): ${dropped.join(', ')}`);
  return v;
}

/**
 * Merge the variant's structural tokens with the config's palette + fonts into
 * the final `:root` custom-property map.
 *
 * Palette and fonts are the ONLY two visual welds the reference stylesheet had
 * (14 §C2). Deriving just these two is the recolor §D forbids — the structural
 * tokens above are what make it a different site.
 */
export function buildTokens(cfg) {
  const v = getVariant(cfg.brand.layout_variant);
  const p = cfg.brand.palette;
  const f = cfg.brand.fonts;

  return {
    // palette (from config)
    '--bg': p.bg,
    '--surface': p.surface,
    '--accent': p.accent,
    '--text': p.text,
    '--muted': p.muted,
    // derived palette steps — computed, so a light-background brand does not
    // need a separate set of hand-picked greys.
    '--bg-2': mix(p.bg, p.surface, 0.5),
    '--bg-3': p.surface,
    '--line': alphaOver(p.text, p.bg, 0.12),
    '--line-strong': alphaOver(p.text, p.bg, 0.28),
    '--accent-soft': mix(p.accent, p.text, 0.35),
    '--accent-deep': mix(p.accent, p.bg, 0.35),
    // fonts (from config)
    '--font-display': `"${f.display}", Georgia, 'Times New Roman', serif`,
    '--font-body': `"${f.body}", -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
    // motion
    '--ease': 'cubic-bezier(.2,.7,.2,1)',
    // structure (from the variant)
    ...v.tokens,
  };
}

// --- tiny colour helpers (no dependency; deterministic) ---

function parseHex(h) {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear blend of two hex colours; t=0 → a, t=1 → b. */
export function mix(a, b, t) {
  const A = parseHex(a); const B = parseHex(b);
  return toHex([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t));
}

/** `fg` at `alpha` composited over `bg`, flattened to an opaque hex. */
export function alphaOver(fg, bg, alpha) {
  return mix(bg, fg, alpha);
}

/** WCAG relative luminance. Used to decide light-on-dark vs dark-on-light. */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. 04 §E requires >= 4.5:1 body. */
export function contrastRatio(a, b) {
  const la = luminance(a); const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function isDarkTheme(cfg) {
  return luminance(cfg.brand.palette.bg) < 0.5;
}

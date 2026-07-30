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
 *
 * ---------------------------------------------------------------------------
 * 2026-07 REDESIGN NOTES — what changed and why it lives here
 *
 * The homepage read as "a good template" because every section shared one
 * `--section-y`, one alignment and one type ramp. Proportion is the lever this
 * file owns, so the fixes are tokens rather than per-client CSS:
 *
 *   • `--section-y-tight` / `--section-y-loose` give the stylesheet a way to
 *     pace sections instead of stamping them. One rhythm for seven sections is
 *     the single biggest reason the page had no pacing.
 *   • `--step--2` adds a real micro tier so eyebrows, labels, durations and
 *     captions stop borrowing `--step--1` (body-small) and reading as body.
 *   • `--step-4` is now a genuine display size in every variant. It was 45px on
 *     a 900px-tall hero in `classic`, which is a headline that apologises.
 *   • `--display-tracking-display` exists because tracking that is right at
 *     20px is loose at 100px. One tracking value for both is why the old
 *     headline looked untuned.
 *   • `--max-wide` lets a section (the price board, the gallery) break out of
 *     the reading measure without every section going full width.
 *   • `--rule-strong` separates a hairline (structure) from a feature rule
 *     (emphasis). `classic` dropped `--rule` from 2px to 1px and uses
 *     `--rule-strong` for the few rules that are meant to be seen.
 *   • `--grid-faq` turns the FAQ into a two-column head/answers split per
 *     variant — and stays `1fr` for `gallery`, which is centred by design.
 *
 * Palette additions live in buildTokens(): a COMPUTED cool counter-tone, so a
 * warm-accent brand gets cool-shifted surfaces (depth without a second hue in
 * the config) and every client gets it for free. See counterTone().
 * ---------------------------------------------------------------------------
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
      '--step--2': 'clamp(.7rem, .68rem + .1vw, .78rem)',
      '--step--1': 'clamp(.83rem, .8rem + .2vw, .94rem)',
      '--step-0': 'clamp(1rem, .95rem + .3vw, 1.13rem)',
      '--step-1': 'clamp(1.33rem, 1.2rem + .7vw, 1.78rem)',
      '--step-2': 'clamp(1.78rem, 1.55rem + 1.2vw, 2.37rem)',
      '--step-3': 'clamp(2.37rem, 1.85rem + 2.4vw, 3.7rem)',
      '--step-4': 'clamp(3.16rem, 1.9rem + 6.4vw, 7.9rem)',
      '--space': 'clamp(1.25rem, 1rem + .9vw, 2rem)',
      '--section-y': 'clamp(6rem, 9vw, 10rem)',
      '--section-y-tight': 'clamp(3.5rem, 5vw, 5.5rem)',
      '--section-y-loose': 'clamp(8rem, 13vw, 14rem)',
      '--measure': '60ch',
      '--radius': '0px',
      '--radius-sm': '0px',
      '--rule': '1px',
      '--rule-strong': '2px',
      '--grid-about': '1.35fr .65fr',
      '--grid-visit': '1.2fr .8fr',
      '--grid-faq': '.8fr 1.2fr',
      '--max': '1240px',
      '--max-wide': '1520px',
      '--pad': 'clamp(20px, 4vw, 64px)',
      '--display-weight': '400',
      '--display-tracking': '-0.02em',
      '--display-tracking-display': '-0.04em',
      '--eyebrow-tracking': '.24em',
      '--nav-h': '82px',
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
      '--step--2': 'clamp(.66rem, .65rem + .05vw, .7rem)',
      '--step--1': 'clamp(.8rem, .78rem + .1vw, .86rem)',
      '--step-0': 'clamp(.94rem, .92rem + .15vw, 1rem)',
      '--step-1': 'clamp(1.13rem, 1.08rem + .25vw, 1.25rem)',
      '--step-2': 'clamp(1.35rem, 1.26rem + .45vw, 1.56rem)',
      '--step-3': 'clamp(1.7rem, 1.5rem + .95vw, 2.25rem)',
      '--step-4': 'clamp(2.1rem, 1.6rem + 2.6vw, 3.6rem)',
      '--space': 'clamp(.75rem, .68rem + .35vw, 1rem)',
      '--section-y': 'clamp(3rem, 4.5vw, 4.5rem)',
      '--section-y-tight': 'clamp(2rem, 3vw, 3rem)',
      '--section-y-loose': 'clamp(4rem, 6vw, 6rem)',
      '--measure': '72ch',
      '--radius': '4px',
      '--radius-sm': '2px',
      '--rule': '1px',
      '--rule-strong': '2px',
      '--grid-about': '1fr 1fr',
      '--grid-visit': '1fr 1fr',
      '--grid-faq': '.75fr 1.25fr',
      '--max': '1100px',
      '--max-wide': '1260px',
      '--pad': 'clamp(16px, 3vw, 32px)',
      '--display-weight': '600',
      '--display-tracking': '-0.01em',
      '--display-tracking-display': '-0.02em',
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
   *
   * `--grid-faq: 1fr` on purpose: this is the one variant whose section heads
   * are centred, and a centred head above a two-column split reads broken.
   */
  gallery: {
    label: 'gallery',
    tokens: {
      '--step--2': 'clamp(.7rem, .68rem + .08vw, .76rem)',
      '--step--1': 'clamp(.84rem, .81rem + .15vw, .92rem)',
      '--step-0': 'clamp(1rem, .96rem + .25vw, 1.1rem)',
      '--step-1': 'clamp(1.25rem, 1.17rem + .4vw, 1.44rem)',
      '--step-2': 'clamp(1.56rem, 1.42rem + .7vw, 1.95rem)',
      '--step-3': 'clamp(2rem, 1.7rem + 1.4vw, 3rem)',
      '--step-4': 'clamp(2.6rem, 1.8rem + 4.4vw, 5.6rem)',
      '--space': 'clamp(1.1rem, .95rem + .7vw, 1.75rem)',
      '--section-y': 'clamp(4.5rem, 7vw, 7.5rem)',
      '--section-y-tight': 'clamp(2.75rem, 4vw, 4.25rem)',
      '--section-y-loose': 'clamp(6rem, 9.5vw, 10rem)',
      '--measure': '55ch',
      '--radius': '12px',
      '--radius-sm': '8px',
      '--rule': '1px',
      '--rule-strong': '2px',
      '--grid-about': '1fr 1fr',
      '--grid-visit': '1fr 1fr',
      '--grid-faq': '1fr',
      '--max': '1320px',
      '--max-wide': '1520px',
      '--pad': 'clamp(20px, 4vw, 48px)',
      '--display-weight': '500',
      '--display-tracking': '-0.015em',
      '--display-tracking-display': '-0.03em',
      '--eyebrow-tracking': '.18em',
      '--nav-h': '76px',
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
   *
   * "Symmetric" used to mean "centred, at one rhythm, for seven sections". It
   * now means symmetric where symmetry earns it — the price board, the gallery
   * grid — and asymmetric where centring was flattening the content:
   *
   *   • `services` moved to position 2. The price list IS the pitch for a
   *     barbershop-shaped business, and it was buried under About and Gallery.
   *   • `about` switched from `about.centered` to `about.split`, which already
   *     existed. A centred column of body copy next to nothing was the least
   *     confident thing on the page; the split puts the practical detail in a
   *     panel and lets the prose sit on a measure.
   *   • `darkSections` was empty, so all seven sections sat on one flat black.
   *     Three of them now carry `--bg-2` (a cool-shifted near-black, see
   *     counterTone) so the page has surfaces instead of a single field.
   *   • `--rule` dropped to 1px with `--rule-strong` reserved for the rules
   *     that are meant to read as emphasis.
   */
  classic: {
    label: 'classic',
    tokens: {
      '--step--2': 'clamp(.68rem, .66rem + .1vw, .74rem)',
      '--step--1': 'clamp(.8rem, .78rem + .12vw, .875rem)',
      '--step-0': 'clamp(1.02rem, 1rem + .18vw, 1.14rem)',
      '--step-1': 'clamp(1.22rem, 1.14rem + .38vw, 1.48rem)',
      '--step-2': 'clamp(1.5rem, 1.32rem + .85vw, 2.12rem)',
      '--step-3': 'clamp(2rem, 1.62rem + 1.75vw, 3.3rem)',
      '--step-4': 'clamp(3.1rem, 1.9rem + 6vw, 7.4rem)',
      '--space': 'clamp(1rem, .9rem + .55vw, 1.6rem)',
      '--section-y': 'clamp(4.5rem, 7vw, 8rem)',
      '--section-y-tight': 'clamp(2.75rem, 4vw, 4.5rem)',
      '--section-y-loose': 'clamp(6rem, 10vw, 11rem)',
      '--measure': '62ch',
      '--radius': '2px',
      '--radius-sm': '2px',
      '--rule': '1px',
      '--rule-strong': '2px',
      '--grid-about': '1.3fr .7fr',
      '--grid-visit': '1.15fr .85fr',
      '--grid-faq': '.85fr 1.15fr',
      '--max': '1120px',
      '--max-wide': '1400px',
      '--pad': 'clamp(20px, 3.5vw, 48px)',
      '--display-weight': '500',
      '--display-tracking': '-0.012em',
      '--display-tracking-display': '-0.035em',
      '--eyebrow-tracking': '.22em',
      '--nav-h': '76px',
    },
    order: ['hero', 'services', 'about', 'gallery', 'aftercare', 'faq', 'visit'],
    sections: {
      hero: 'hero.classic',
      gallery: 'gallery.grid',
      about: 'about.split',
      services: 'services.columns',
      aftercare: 'aftercare.columns',
      faq: 'faq.accordion',
      visit: 'visit.stacked',
    },
    heroHasImage: false,
    darkSections: ['about', 'aftercare', 'visit'],
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
 * The film-grain texture, as a data URI.
 *
 * A token rather than an asset on purpose. `assets-src/` is processed by the
 * Python media step and versioned into `site/assets/img/`, which is the right
 * home for photographs and the wrong home for a 340-byte texture that every
 * page needs before first paint — a separate request for grain is a request the
 * 160ms LCP budget does not have, and a tiled PNG cannot inherit the palette.
 *
 * Percent-encoded to the point of paranoia: no literal quotes, spaces or
 * parentheses survive, so the value is safe unquoted inside `url()` in a
 * stylesheet that is itself rendered through a mustache-ish template engine.
 * `%23` is the `#` of the filter reference; leaving it raw truncates the URI at
 * the fragment and the texture silently disappears.
 */
const GRAIN_URI =
  'url(data:image/svg+xml;charset=utf-8,'
  + '%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22120%22%20height%3D%22120%22%3E'
  + '%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.85%22'
  + '%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E'
  + '%3Crect%20width%3D%22120%22%20height%3D%22120%22%20filter%3D%22url%28%23n%29%22%2F%3E%3C%2Fsvg%3E)';

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
  const dark = isDarkTheme(cfg);

  // The computed counter-tone. Everything cool in the design comes from here,
  // which is why there is no second accent field in business.config.yaml.
  const cool = counterTone(p.accent, dark);

  return {
    // palette (from config)
    '--bg': p.bg,
    '--surface': p.surface,
    '--accent': p.accent,
    '--text': p.text,
    '--muted': p.muted,
    // derived palette steps — computed, so a light-background brand does not
    // need a separate set of hand-picked greys.
    //
    // Each of these used to be a straight neutral blend, which is why the page
    // read as one flat field: --bg, --bg-2 and --surface differed only in
    // lightness, and three near-identical greys are one grey. Blending a little
    // `cool` in gives them a HUE difference as well, so a warm-accent brand
    // reads as warm gold on cool charcoal rather than gold on grey. The mix
    // fractions are small on purpose — this is depth, not a colour scheme.
    '--cool': cool,
    '--bg-2': mix(mix(p.bg, p.surface, 0.5), cool, 0.35),
    '--bg-3': mix(p.surface, cool, 0.28),
    '--line': mix(alphaOver(p.text, p.bg, 0.12), cool, 0.35),
    '--line-strong': mix(alphaOver(p.text, p.bg, 0.28), cool, 0.3),
    '--accent-soft': mix(p.accent, p.text, 0.35),
    '--accent-deep': mix(p.accent, p.bg, 0.35),
    // A flattened accent-over-background wash. Used for the one or two radial
    // glows that give a section a light source; kept opaque so it composites
    // identically over any surface it lands on.
    '--halo': alphaOver(p.accent, p.bg, 0.16),
    // fonts (from config)
    '--font-display': `"${f.display}", Georgia, 'Times New Roman', serif`,
    '--font-body': `"${f.body}", -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
    // motion
    '--ease': 'cubic-bezier(.2,.7,.2,1)',
    // texture. Two strengths, both tokens, so a client who wants a clean page
    // sets them to 0 in one place rather than hunting for the overlays.
    '--grain': GRAIN_URI,
    '--grain-page': dark ? '.045' : '.03',
    '--grain-media': dark ? '.11' : '.07',
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

/** hex → [h (0-360), s (0-1), l (0-1)]. */
export function hexToHsl(hex) {
  const [r, g, b] = parseHex(hex).map((v) => v / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return [(h + 360) % 360, s, l];
}

/** [h, s, l] → hex. */
export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hp) % 6];
  return toHex(seg.map((v) => (v + m) * 255));
}

/**
 * The second tone, COMPUTED from the first.
 *
 * The brief asked for room for a cool counter-tone. Adding
 * `brand.palette.accent_2` would have been the obvious move and the wrong one:
 * every one of the four layouts and every future client would then carry a
 * value someone has to choose, and a config field nobody sets well is worse
 * than no field. `assertContrast()` also only gates the five palette entries it
 * knows about, so a hand-picked second hue is a contrast regression waiting for
 * a client who picks badly.
 *
 * So: rotate the accent's hue by 180°, crush the saturation to roughly a fifth
 * of the original, and pin the lightness to the dark or light end depending on
 * the theme. Gold (h≈46) yields a cold slate (h≈226); a blue brand yields a
 * warm brown. It is never used as a text colour — only in surfaces, hairlines
 * and one image grade — so it cannot fail AA no matter what the accent is.
 *
 * A greyscale accent (s=0) returns a neutral of the same lightness, which is
 * the correct degenerate answer: nothing to counter.
 */
export function counterTone(accent, dark = true) {
  const [h, s] = hexToHsl(accent);
  return hslToHex((h + 180) % 360, Math.min(0.18, Math.max(0.06, s * 0.21)), dark ? 0.2 : 0.86);
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

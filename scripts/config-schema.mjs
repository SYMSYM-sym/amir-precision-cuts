/**
 * config-schema.mjs — the config contract. PURE: no fs, no path, no node builtins.
 *
 * Split out of paths.mjs so the intake portal can import the EXACT validator the
 * engine runs. If the portal had its own copy, the two would drift, and the
 * failure mode is the worst kind: a config that passes the portal, gets handed
 * to a client as finished, and then fails at build time.
 */

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const LAYOUT_VARIANTS = ['editorial', 'compact', 'gallery', 'classic'];
export const SCHEMA_TYPES = [
  'HairSalon', 'BeautySalon', 'NailSalon', 'DaySpa',
  'HealthAndBeautyBusiness', 'MedicalSpa', 'TattooParlor', 'BarberShop',
  'MassageTherapy', 'SkinCareClinic',
];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const BOOKING_MODELS = ['appointment-only', 'walk-ins welcome', 'online booking'];

export const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/**
 * Placeholder sentinels. `01-INTAKE-business.config.yaml` ships every example
 * value behind a `# e.g.` comment; a fictional address that survives into a
 * real config is precisely what the swap test exists to catch. These are the
 * literal example values from the intake file plus the reference business's
 * facts, which must never appear in a derived config.
 */
export const FORBIDDEN_VALUES = [
  // 01-INTAKE fictional placeholders
  'nolan & co. barbering', 'nolan & co.', 'nco', 'nolanco.com',
  '1420 ash street, suite 2', '78702',
  'notes on grooming, from our chair in south congress.',
  // the reference business (14 §C: the grep that is the definition of done)
  'igor for men', 'igorformen.com', 'ifm', 'west hollywood',
  '801 larrabee st, suite 5', '801 larrabee street, suite 5', '90069',
  "rene'", 'the ifm team', 'ifm-team',
];

function fail(errors) {
  throw new ConfigError(
    `business.config.yaml is invalid — ${errors.length} problem(s):\n` +
      errors.map((e) => `  • ${e}`).join('\n') +
      '\n\nEvery one of these is a business fact the site would otherwise render blank,\n' +
      'or a placeholder that would ship to a real client. Fix the config, not the code.',
  );
}

function req(obj, path, errors, { type = 'string', min, enumOf, pattern, patternName } = {}) {
  const parts = path.split('.');
  let v = obj;
  for (const p of parts) {
    if (v == null) break;
    v = v[p];
  }
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
    errors.push(`${path} is required but empty`);
    return undefined;
  }
  if (type === 'array' && !Array.isArray(v)) {
    errors.push(`${path} must be a list`);
    return undefined;
  }
  if (type === 'string' && typeof v !== 'string') {
    errors.push(`${path} must be a string (got ${typeof v})`);
    return undefined;
  }
  if (type === 'number' && typeof v !== 'number') {
    errors.push(`${path} must be a number (got ${typeof v})`);
    return undefined;
  }
  if (min !== undefined && (Array.isArray(v) ? v.length : v) < min) {
    errors.push(
      Array.isArray(v)
        ? `${path} needs at least ${min} entries (has ${v.length})`
        : `${path} must be >= ${min}`,
    );
  }
  if (enumOf && !enumOf.includes(v)) {
    errors.push(`${path} must be one of: ${enumOf.join(' | ')} — got "${v}"`);
  }
  if (pattern && typeof v === 'string' && !pattern.test(v)) {
    errors.push(`${path} is not a valid ${patternName} — got "${v}"`);
  }
  return v;
}

/** Walk every string in the config looking for placeholder / reference-business leakage. */
function scanForPlaceholders(node, errors, path = '') {
  if (typeof node === 'string') {
    for (const bad of FORBIDDEN_VALUES) {
      const re = new RegExp(
        `(^|[^a-z0-9])${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
        'i',
      );
      if (re.test(node)) {
        errors.push(
          `${path || '(root)'} contains the placeholder/reference value "${bad}" — ` +
            'every "# e.g." in 01-INTAKE is fictional and must be replaced',
        );
        break;
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanForPlaceholders(v, errors, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      scanForPlaceholders(v, errors, path ? `${path}.${k}` : k);
    }
  }
}

export function validateConfig(c, { allowPlaceholders = false } = {}) {
  const errors = [];
  if (!c || typeof c !== 'object') fail(['config is empty or not a YAML mapping']);

  // --- business ---
  req(c, 'business.name', errors);
  req(c, 'business.short_name', errors);
  const initials = req(c, 'business.initials', errors);
  if (initials && (initials.length < 2 || initials.length > 4)) {
    errors.push(`business.initials should be 2-4 characters (got "${initials}")`);
  }
  req(c, 'business.type', errors);
  req(c, 'business.category_schema', errors, { enumOf: SCHEMA_TYPES });
  const tagline = req(c, 'business.tagline', errors);
  if (tagline && tagline.length > 60) {
    errors.push(`business.tagline must be <= 60 chars (got ${tagline.length})`);
  }
  req(c, 'business.positioning', errors);
  req(c, 'business.practitioner_name', errors);
  req(c, 'business.years_experience', errors);
  req(c, 'business.author_id', errors);

  // --- location ---
  req(c, 'location.address_street', errors);
  req(c, 'location.address_city', errors);
  req(c, 'location.address_region', errors);
  req(c, 'location.address_postal', errors);
  req(c, 'location.address_country', errors);
  const tz = req(c, 'location.timezone', errors);
  if (tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      errors.push(`location.timezone "${tz}" is not a valid IANA timezone`);
    }
  }
  req(c, 'location.neighborhood', errors);
  req(c, 'location.location_anchors', errors, { type: 'array', min: 8 });

  // --- hours ---
  const days = req(c, 'hours.days', errors, { type: 'array', min: 1 });
  if (Array.isArray(days)) {
    for (const d of days) {
      if (!DAYS.includes(d)) errors.push(`hours.days contains "${d}" — must be a full English day name`);
    }
  }
  req(c, 'hours.opens', errors, { pattern: TIME_24H, patternName: '24-hour time (HH:MM)' });
  req(c, 'hours.closes', errors, { pattern: TIME_24H, patternName: '24-hour time (HH:MM)' });

  // --- booking (R20 / 04 §A: the contact hard rule) ---
  req(c, 'booking.model', errors, { enumOf: BOOKING_MODELS });
  const b = c.booking || {};
  if (b.publish_phone === true && !b.phone) {
    errors.push('booking.publish_phone is true but booking.phone is empty');
  }
  if (b.publish_phone !== true && b.phone) {
    errors.push(
      'booking.phone is set but booking.publish_phone is false — remove the number. ' +
        'A stored-but-unpublished phone is one refactor away from being rendered.',
    );
  }
  if (b.publish_email === true && !b.email) {
    errors.push('booking.publish_email is true but booking.email is empty');
  }
  if (b.publish_email !== true && b.email) {
    errors.push('booking.email is set but booking.publish_email is false — remove it');
  }

  // --- homepage prose (keeps the site render deterministic — §02.6) ---
  req(c, 'homepage.about_body', errors);
  req(c, 'homepage.aftercare_body', errors);
  const faq = req(c, 'homepage.faq', errors, { type: 'array', min: 6 });
  if (Array.isArray(faq)) {
    if (faq.length > 10) errors.push(`homepage.faq should be 6-10 entries (got ${faq.length})`);
    faq.forEach((f, i) => {
      if (!f || !f.q || !f.a) errors.push(`homepage.faq[${i}] needs both q and a`);
    });
  }

  // --- services ---
  const services = req(c, 'services', errors, { type: 'array', min: 4 });
  if (Array.isArray(services)) {
    if (services.length > 10) errors.push(`services should be 4-10 entries (got ${services.length})`);
    const seen = new Set();
    services.forEach((s, i) => {
      if (!s || !s.key) { errors.push(`services[${i}].key is required`); return; }
      if (!/^[a-z0-9-]+$/.test(s.key)) errors.push(`services[${i}].key "${s.key}" must be kebab-case`);
      if (seen.has(s.key)) errors.push(`services[${i}].key "${s.key}" is a duplicate`);
      seen.add(s.key);
      if (!s.label) errors.push(`services[${i}].label is required`);
      if (!s.description) errors.push(`services[${i}].description is required`);
      // price_from may legitimately be "" — never invent one (04 exit criteria).
    });
  }

  // --- brand ---
  req(c, 'brand.voice_adjectives', errors, { type: 'array', min: 3 });
  req(c, 'brand.audience', errors);
  for (const k of ['bg', 'surface', 'accent', 'text', 'muted']) {
    req(c, `brand.palette.${k}`, errors, { pattern: HEX, patternName: 'hex colour' });
  }
  req(c, 'brand.fonts.display', errors);
  req(c, 'brand.fonts.body', errors);
  req(c, 'brand.layout_variant', errors, { enumOf: LAYOUT_VARIANTS });

  // --- site ---
  req(c, 'site.domain', errors, {
    pattern: DOMAIN,
    patternName: 'bare domain (no protocol, no trailing slash)',
  });
  req(c, 'site.blog_title', errors);
  req(c, 'site.blog_subtitle', errors);

  // --- content ---
  const cadence = req(c, 'content.cadence_days', errors, { type: 'array', min: 1 });
  if (Array.isArray(cadence)) {
    for (const d of cadence) {
      if (!DAYS.includes(d)) errors.push(`content.cadence_days contains "${d}" — must be a full English day name`);
    }
  }
  req(c, 'content.publish_hour_local', errors, { pattern: TIME_24H, patternName: '24-hour time (HH:MM)' });
  req(c, 'content.buckets', errors, { type: 'array', min: 4 });
  req(c, 'content.topics_to_seed', errors, { type: 'number', min: 10 });

  const wc = c.content?.word_count || {};
  for (const k of ['min', 'max', 'target_min', 'target_max']) {
    if (typeof wc[k] !== 'number') errors.push(`content.word_count.${k} must be a number`);
  }
  if (typeof wc.min === 'number' && typeof wc.max === 'number' && wc.min >= wc.max) {
    errors.push('content.word_count.min must be less than .max');
  }

  const orig = c.content?.originality_max_similarity;
  const dedupe = c.content?.queue_dedupe_max_similarity;
  if (typeof orig !== 'number' || orig <= 0 || orig >= 1) {
    errors.push('content.originality_max_similarity must be a number between 0 and 1');
  }
  if (typeof dedupe !== 'number' || dedupe <= 0 || dedupe >= 1) {
    errors.push('content.queue_dedupe_max_similarity must be a number between 0 and 1');
  }
  // R13 / §02.4: the seed gate MUST be stricter than the publish gate. Collapsing
  // them into one number is how near-duplicate topics reach the queue and then
  // fail the article gate forever.
  if (typeof orig === 'number' && typeof dedupe === 'number' && dedupe >= orig) {
    errors.push(
      `content.queue_dedupe_max_similarity (${dedupe}) must be STRICTLY LESS than ` +
        `content.originality_max_similarity (${orig}) — two thresholds, two jobs (§02.4, R13)`,
    );
  }

  const il = c.content?.internal_links || {};
  if (typeof il.min !== 'number' || typeof il.max !== 'number' || il.min > il.max) {
    errors.push('content.internal_links needs numeric min <= max');
  }
  req(c, 'content.location_mentions_min', errors, { type: 'number', min: 1 });
  req(c, 'content.faq_questions', errors, { type: 'number', min: 1 });

  const limits = c.content?.limits || {};
  for (const k of ['max_topics_per_run', 'max_regen_per_topic', 'max_api_calls_per_run']) {
    if (typeof limits[k] !== 'number' || limits[k] < 1) {
      errors.push(`content.limits.${k} must be a positive number (R19 — the cap must be real, not aspirational)`);
    }
  }
  if (typeof limits.max_derive_api_calls !== 'number' || limits.max_derive_api_calls < 1) {
    errors.push('content.limits.max_derive_api_calls must be a positive number (§02 cost guard)');
  }

  // --- OPTIONAL keys ---------------------------------------------------
  // Everything below is optional: absent is fine, present must be well-formed.
  // These exist because a real intake asks them, and collecting a field the
  // renderer never reads is how a form becomes theatre. Each one is wired:
  // geo + social -> JSON-LD, parking/transit/accessibility -> the visit
  // section, per-day hours -> the hours formatters and openingHoursSpecification,
  // testimonials -> an optional homepage section, price_note -> the service
  // rows, hero overrides -> the hero.
  const opt = (path, test, msg) => {
    const v = path.split('.').reduce((a, k) => (a == null ? a : a[k]), c);
    if (v === undefined || v === null || v === '') return;
    if (!test(v)) errors.push(`${path} ${msg}`);
  };

  opt('business.founded_year', (v) => /^\d{4}$/.test(String(v)) && Number(v) <= new Date().getFullYear(),
    'must be a 4-digit year not in the future');
  opt('location.latitude', (v) => Math.abs(Number(v)) <= 90, 'must be between -90 and 90');
  opt('location.longitude', (v) => Math.abs(Number(v)) <= 180, 'must be between -180 and 180');
  opt('location.service_area', (v) => Array.isArray(v), 'must be a list');

  if (c.hours?.per_day) {
    for (const [day, h] of Object.entries(c.hours.per_day)) {
      if (!DAYS.includes(day)) errors.push(`hours.per_day has unknown day "${day}"`);
      if (!TIME_24H.test(h?.opens || '')) errors.push(`hours.per_day.${day}.opens must be HH:MM`);
      if (!TIME_24H.test(h?.closes || '')) errors.push(`hours.per_day.${day}.closes must be HH:MM`);
      if (!(c.hours.days || []).includes(day)) {
        errors.push(`hours.per_day lists ${day}, but hours.days does not — the site would show hours for a day it says it is closed`);
      }
    }
  }

  const social = c.booking?.social || {};
  for (const [k, v] of Object.entries(social)) {
    if (v && !/^https?:\/\//.test(String(v))) {
      errors.push(`booking.social.${k} must be a full URL starting with https:// (it becomes a schema.org sameAs)`);
    }
  }

  for (const [i, t] of (c.homepage?.testimonials || []).entries()) {
    if (!t?.quote) errors.push(`homepage.testimonials[${i}].quote is required`);
    if (!t?.attribution) {
      errors.push(`homepage.testimonials[${i}].attribution is required — an unattributed testimonial is not evidence`);
    }
  }

  for (const [i, sv] of (c.services || []).entries()) {
    if (sv?.price_note && !sv?.price_from) {
      errors.push(`services[${i}].price_note is set but price_from is empty — a suffix with no price renders as a dangling "+"`);
    }
  }

  // --- integrations ---
  req(c, 'integrations.anthropic_model', errors);

  // --- placeholder sweep ---
  if (!allowPlaceholders) scanForPlaceholders(c, errors);

  if (errors.length) fail(errors);
  return c;
}

// ---------------------------------------------------------------------------
// Derived helpers — one config value, many renderings.
//
// The reference site rendered hours in FIVE incompatible formats and the address
// in THREE (plus a URL-encoded one). Each of those was a separate weld. They are
// formatters here so there is exactly one source and no drift.
// ---------------------------------------------------------------------------

const DAY_ABBR = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

function to12h(hhmm, { padded = true } = {}) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 && !padded ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** True when `days` is an unbroken Mon..Sun run, so it can render as "Tue – Sat". */
function contiguousRange(days) {
  const idx = days.map((d) => DAYS.indexOf(d)).sort((a, b) => a - b);
  for (let i = 1; i < idx.length; i++) if (idx[i] !== idx[i - 1] + 1) return null;
  return [DAYS[idx[0]], DAYS[idx[idx.length - 1]]];
}

export function buildDerived(c) {
  const { hours, location: loc, site, business, booking } = c;
  const range = contiguousRange(hours.days);
  const perDay = hours.per_day || null;

  const daysLong = range ? `${range[0]} – ${range[1]}` : hours.days.join(', ');
  const daysShort = range
    ? `${DAY_ABBR[range[0]]} – ${DAY_ABBR[range[1]]}`
    : hours.days.map((d) => DAY_ABBR[d]).join(', ');
  const daysTight = range
    ? `${DAY_ABBR[range[0]]}–${DAY_ABBR[range[1]]}`
    : hours.days.map((d) => DAY_ABBR[d]).join(',');

  const timesLong = `${to12h(hours.opens)} – ${to12h(hours.closes)}`;
  const timesTight = `${to12h(hours.opens, { padded: false })}–${to12h(hours.closes, { padded: false })}`;

  // Per-day override: a shop open 9-5 on weekdays and 10-4 on Saturday cannot be
  // described by one opens/closes pair, and rounding it to one is how a website
  // tells someone to turn up an hour before the door is unlocked.
  const hoursRows = hours.days.map((d) => {
    const h = (perDay && perDay[d]) || { opens: hours.opens, closes: hours.closes };
    return { day: d, day_short: DAY_ABBR[d], opens: h.opens, closes: h.closes,
      times: `${to12h(h.opens)} – ${to12h(h.closes)}` };
  });
  const uniformHours = hoursRows.every((r) => r.opens === hours.opens && r.closes === hours.closes);

  // schema.org wants one spec per distinct opens/closes group.
  const hoursSpec = [];
  for (const r of hoursRows) {
    const found = hoursSpec.find((g) => g.opens === r.opens && g.closes === r.closes);
    if (found) found.dayOfWeek.push(r.day);
    else hoursSpec.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: [r.day], opens: r.opens, closes: r.closes });
  }

  const cityRegionPostal = `${loc.address_city}, ${loc.address_region} ${loc.address_postal}`;
  const addressOneLine = `${loc.address_street}, ${cityRegionPostal}`;
  const mapsQuery = encodeURIComponent(
    `${loc.address_street} ${loc.address_city} ${loc.address_region} ${loc.address_postal}`,
  );

  const bookingLine =
    booking.model === 'appointment-only' ? 'By appointment only'
      : booking.model === 'walk-ins welcome' ? 'Walk-ins welcome'
        : 'Book online';

  const socialUrls = Object.values(booking.social || {}).filter(Boolean);

  return {
    // hours — the five renderings plus the per-day table, all one source
    hours_rows: hoursRows,
    hours_uniform: uniformHours,
    hours_spec: hoursSpec,
    hours_days_long: daysLong,                    // "Tuesday – Saturday"
    hours_days_short: daysShort,                  // "Tue – Sat"
    hours_days_tight: daysTight,                  // "Tue–Sat"
    hours_times_long: timesLong,                  // "8:00 AM – 6:00 PM"
    hours_times_tight: timesTight,                // "8 AM–6 PM"
    hours_line: uniformHours
      ? `${daysShort} · ${timesTight}`
      : hoursRows.map((r) => `${r.day_short} ${r.times}`).join(' · '),

    // address — the three renderings plus the encoded one
    address_city_region_postal: cityRegionPostal,
    address_one_line: addressOneLine,
    address_maps_url: `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`,

    // identity / urls
    site_url: `https://${site.domain}`,
    og_image_url: `https://${site.domain}/og.jpg`,
    logo_url: `https://${site.domain}/assets/img/icon-512.png`,
    author_url: `https://${site.domain}/#about`,

    // extras
    social_urls: socialUrls,
    has_geo: loc.latitude !== undefined && loc.latitude !== '' && loc.longitude !== undefined && loc.longitude !== '',
    has_getting_here: Boolean(loc.parking_notes || loc.transit_notes || loc.accessibility_notes),
    has_testimonials: Boolean((c.homepage.testimonials || []).length),
    services_display: (c.services || []).map((sv) => ({
      ...sv,
      price_display: sv.price_from ? `${sv.price_from}${sv.price_note || ''}` : '',
    })),

    // booking
    booking_line: bookingLine,
    booking_line_period: `${bookingLine}.`,
    has_contact: booking.publish_phone === true || booking.publish_email === true,

    // seo copy formulas (07 §B)
    meta_title: site.meta_title_override || `${business.name} — ${business.tagline} | ${loc.address_city}`,
    meta_description: site.meta_description_override
      || `${business.name} — ${business.type} in ${loc.address_city}. ` +
      `${(c.services || []).slice(0, 3).map((s) => s.label).join(', ')}. ` +
      `${bookingLine}.`,

    year: String(new Date().getFullYear()),
  };
}


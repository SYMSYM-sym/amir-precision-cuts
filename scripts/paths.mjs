/**
 * paths.mjs — repo paths + THE single source of business truth.
 *
 * CONTRACTS.md requires this module to export `ROOT` and `cfg`.
 * `cfg` is the parsed, validated `business.config.yaml`. Nothing else in this
 * repo may contain a business fact (14-PORTING-NOTES.md §C).
 *
 * The loader is deliberately strict: a missing or placeholder value must fail
 * at import time with a message naming the key, not silently render an empty
 * <span> or — far worse — fall back to another business's data (bug A4).
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root (parent of /scripts). */
export const ROOT = join(__dirname, '..');

export function contentPath(...segments) {
  return join(ROOT, 'content', ...segments);
}

export function sitePath(...segments) {
  return join(ROOT, 'site', ...segments);
}

export function templatePath(...segments) {
  return join(ROOT, 'templates', ...segments);
}

/** Thrown for environment/config problems. R15: these hard-stop, never quarantine. */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const LAYOUT_VARIANTS = ['editorial', 'compact', 'gallery', 'classic'];
const SCHEMA_TYPES = [
  'HairSalon', 'BeautySalon', 'NailSalon', 'DaySpa',
  'HealthAndBeautyBusiness', 'MedicalSpa', 'TattooParlor', 'BarberShop',
  'MassageTherapy', 'SkinCareClinic',
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BOOKING_MODELS = ['appointment-only', 'walk-ins welcome', 'online booking'];

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;
const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/**
 * Placeholder sentinels. `01-INTAKE-business.config.yaml` ships every example
 * value behind a `# e.g.` comment; a fictional address that survives into a
 * real config is precisely what the swap test exists to catch. These are the
 * literal example values from the intake file plus the reference business's
 * facts, which must never appear in a derived config.
 */
const FORBIDDEN_VALUES = [
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

  const daysLong = range ? `${range[0]} – ${range[1]}` : hours.days.join(', ');
  const daysShort = range
    ? `${DAY_ABBR[range[0]]} – ${DAY_ABBR[range[1]]}`
    : hours.days.map((d) => DAY_ABBR[d]).join(', ');
  const daysTight = range
    ? `${DAY_ABBR[range[0]]}–${DAY_ABBR[range[1]]}`
    : hours.days.map((d) => DAY_ABBR[d]).join(',');

  const timesLong = `${to12h(hours.opens)} – ${to12h(hours.closes)}`;
  const timesTight = `${to12h(hours.opens, { padded: false })}–${to12h(hours.closes, { padded: false })}`;

  const cityRegionPostal = `${loc.address_city}, ${loc.address_region} ${loc.address_postal}`;
  const addressOneLine = `${loc.address_street}, ${cityRegionPostal}`;
  const mapsQuery = encodeURIComponent(
    `${loc.address_street} ${loc.address_city} ${loc.address_region} ${loc.address_postal}`,
  );

  const bookingLine =
    booking.model === 'appointment-only' ? 'By appointment only'
      : booking.model === 'walk-ins welcome' ? 'Walk-ins welcome'
        : 'Book online';

  return {
    // hours — the five renderings, now one source
    hours_days_long: daysLong,                    // "Tuesday – Saturday"
    hours_days_short: daysShort,                  // "Tue – Sat"
    hours_days_tight: daysTight,                  // "Tue–Sat"
    hours_times_long: timesLong,                  // "8:00 AM – 6:00 PM"
    hours_times_tight: timesTight,                // "8 AM–6 PM"
    hours_line: `${daysShort} · ${timesTight}`,   // "Tue – Sat · 8 AM–6 PM"

    // address — the three renderings plus the encoded one
    address_city_region_postal: cityRegionPostal,
    address_one_line: addressOneLine,
    address_maps_url: `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`,

    // identity / urls
    site_url: `https://${site.domain}`,
    og_image_url: `https://${site.domain}/og.jpg`,
    logo_url: `https://${site.domain}/assets/img/icon-512.png`,
    author_url: `https://${site.domain}/#about`,

    // booking
    booking_line: bookingLine,
    booking_line_period: `${bookingLine}.`,
    has_contact: booking.publish_phone === true || booking.publish_email === true,

    // seo copy formulas (07 §B)
    meta_title: `${business.name} — ${business.tagline} | ${loc.address_city}`,
    meta_description:
      `${business.name} — ${business.type} in ${loc.address_city}. ` +
      `${(c.services || []).slice(0, 3).map((s) => s.label).join(', ')}. ` +
      `${bookingLine}.`,

    year: String(new Date().getFullYear()),
  };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export const CONFIG_PATH = process.env.BUSINESS_CONFIG
  ? (process.env.BUSINESS_CONFIG.startsWith('/')
    ? process.env.BUSINESS_CONFIG
    : join(ROOT, process.env.BUSINESS_CONFIG))
  : join(ROOT, 'business.config.yaml');

export function loadConfig(path = CONFIG_PATH, opts = {}) {
  if (!existsSync(path)) {
    throw new ConfigError(
      `business.config.yaml not found at ${path}.\n` +
        'Copy 01-INTAKE-business.config.yaml to the repo root and fill it in. ' +
        'It is the only input this system has.',
    );
  }
  let parsed;
  try {
    parsed = yaml.load(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new ConfigError(`business.config.yaml is not valid YAML: ${e.message}`);
  }
  validateConfig(parsed, opts);
  parsed.derived = buildDerived(parsed);
  return parsed;
}

/**
 * Stable hash of a config slice — used by derive's hand-edit guard (§02) so a
 * regenerated artifact can tell "the config changed" from "a human edited me".
 */
export function configHash(slice) {
  return createHash('sha256').update(JSON.stringify(slice)).digest('hex').slice(0, 16);
}

export const cfg = loadConfig();
export default cfg;

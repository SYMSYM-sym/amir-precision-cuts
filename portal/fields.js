/**
 * fields.js — the intake schema.
 *
 * Every question the factory can act on, in the order a human can answer them.
 * Each field declares the config path it writes, so the portal never has to
 * translate between "what we asked" and "what the engine reads" — there is no
 * mapping layer to fall out of sync.
 *
 * `req: true`   the build fails without it
 * `hint`        why we are asking, in the answerer's terms
 * `warn`        shown inline when the answer is risky rather than invalid
 */

export const GOOGLE_FONTS_DISPLAY = [
  'Fraunces', 'Playfair Display', 'Spectral', 'Cormorant Garamond', 'Lora', 'Bitter',
  'DM Serif Display', 'Libre Baskerville', 'Crimson Pro', 'Newsreader', 'Instrument Serif',
  'Syne', 'Space Grotesk', 'Outfit', 'Sora', 'Archivo', 'Bricolage Grotesque',
];
export const GOOGLE_FONTS_BODY = [
  'Inter', 'Karla', 'Work Sans', 'Source Sans 3', 'IBM Plex Sans', 'Public Sans',
  'Manrope', 'Nunito Sans', 'Rubik', 'DM Sans', 'Figtree', 'Plus Jakarta Sans',
  'Lato', 'Open Sans', 'Mulish',
];

export const TIMEZONES = [
  'America/New_York', 'America/Detroit', 'America/Toronto',
  'America/Chicago', 'America/Winnipeg', 'America/Mexico_City',
  'America/Denver', 'America/Phoenix', 'America/Boise', 'America/Edmonton',
  'America/Los_Angeles', 'America/Vancouver', 'America/Anchorage',
  'Pacific/Honolulu', 'America/Puerto_Rico', 'Europe/London', 'Europe/Dublin',
  'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Amsterdam',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
  'Pacific/Auckland',
];

/** Vertical presets: pick one and the risky defaults are already right. */
export const VERTICALS = {
  barbershop: {
    label: "Barbershop / men's grooming",
    type: "men's barbershop",
    schema: 'BarberShop',
    buckets: ['hyperlocal', 'service-detail', 'comparison', 'question', 'aftercare', 'pricing', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['manscaping', 'fresh cut fade life', 'bro'],
    complianceNote: '',
  },
  'hair-salon': {
    label: 'Hair salon',
    type: 'hair salon',
    schema: 'HairSalon',
    buckets: ['hyperlocal', 'service-detail', 'comparison', 'question', 'aftercare', 'pricing', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['hair goals', 'transformation journey'],
    complianceNote: '',
  },
  'lash-brow': {
    label: 'Lash & brow studio',
    type: 'lash and brow studio',
    schema: 'BeautySalon',
    buckets: ['hyperlocal', 'service-detail', 'comparison', 'question', 'aftercare', 'pricing', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['wispy', 'flutter', 'insta-ready', 'bombshell'],
    complianceNote: 'Never imply ophthalmic or medical expertise. Patch-test language must not promise safety.',
  },
  nails: {
    label: 'Nail salon / lounge',
    type: 'nail lounge',
    schema: 'NailSalon',
    buckets: ['hyperlocal', 'service-detail', 'question', 'aftercare', 'comparison', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['mani-pedi', 'pamper', 'treat yourself', 'me-time'],
    complianceNote: 'Never diagnose nail conditions. Discoloured, fungal or psoriatic nails get referred to a physician.',
  },
  waxing: {
    label: 'Waxing / hair removal',
    type: 'waxing studio',
    schema: 'HealthAndBeautyBusiness',
    buckets: ['hyperlocal', 'service-detail', 'comparison', 'question', 'aftercare', 'pricing', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['down there', 'private parts', 'manscaping'],
    complianceNote: 'Never promise painlessness or permanence. Use plain anatomical terms, never euphemisms.',
  },
  'med-spa': {
    label: 'Med-spa / aesthetics clinic',
    type: 'medical spa',
    schema: 'MedicalSpa',
    buckets: ['hyperlocal', 'service-detail', 'comparison', 'question', 'aftercare', 'pricing', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['miracle', 'anti-aging cure', 'reverse aging', 'medical-grade results'],
    complianceNote: 'HIGHEST CARE. State supervising-practitioner credentials. Never claim to treat, cure or diagnose. "Results vary" on any before/after. Check state advertising rules for injectables.',
  },
  massage: {
    label: 'Massage / bodywork',
    type: 'massage studio',
    schema: 'MassageTherapy',
    buckets: ['hyperlocal', 'service-detail', 'question', 'aftercare', 'comparison', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['rubdown', 'happy ending', 'cures pain'],
    complianceNote: 'Never claim to treat injuries or medical conditions. State licence type. Draping and consent language must be explicit.',
  },
  tattoo: {
    label: 'Tattoo / piercing studio',
    type: 'tattoo studio',
    schema: 'TattooParlor',
    buckets: ['hyperlocal', 'service-detail', 'question', 'aftercare', 'comparison', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['ink slinger', 'tramp stamp', 'painless tattoo'],
    complianceNote: 'State age requirements and bloodborne-pathogen certification. Aftercare must not read as medical advice.',
  },
  'day-spa': {
    label: 'Day spa',
    type: 'day spa',
    schema: 'DaySpa',
    buckets: ['hyperlocal', 'service-detail', 'question', 'aftercare', 'comparison', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['pamper', 'me-time', 'self-care journey', 'detox'],
    complianceNote: '"Detox" and "toxin removal" are unsupportable claims — they are banned by default.',
  },
  skincare: {
    label: 'Skincare / facials',
    type: 'skincare studio',
    schema: 'SkinCareClinic',
    buckets: ['hyperlocal', 'service-detail', 'comparison', 'question', 'aftercare', 'pricing', 'first-timer', 'eeat'],
    compliance: { no_medical_claims: true, no_guarantees: true, no_superlatives_without_evidence: true, no_invented_prices: true },
    banned: ['miracle', 'erase wrinkles', 'cure acne', 'detox'],
    complianceNote: 'Acne, rosacea and eczema are medical conditions — never claim to treat them. Refer to a dermatologist.',
  },
};

export const SCHEMA_TYPE_OPTIONS = [
  ['BarberShop', 'Barbershop'],
  ['HairSalon', 'Hair salon'],
  ['BeautySalon', 'Beauty salon (lash, brow, general)'],
  ['NailSalon', 'Nail salon'],
  ['DaySpa', 'Day spa'],
  ['MedicalSpa', 'Medical spa'],
  ['MassageTherapy', 'Massage therapy'],
  ['TattooParlor', 'Tattoo / piercing'],
  ['SkinCareClinic', 'Skincare clinic'],
  ['HealthAndBeautyBusiness', 'Other health & beauty'],
];

export const LAYOUT_INFO = {
  editorial: {
    name: 'Editorial',
    blurb: 'Big whitespace, very large display type, asymmetric. Services read as a numbered list. Best for a single-practitioner studio selling craft.',
    shape: 'Type-led hero · numbered service rows · sticky detail card',
  },
  compact: {
    name: 'Compact',
    blurb: 'Dense and tabular. Services move directly under the hero as a price table — the pitch IS the price list. Best when people arrive already knowing what they want.',
    shape: 'Short hero + fact strip · service price table · services before about',
  },
  gallery: {
    name: 'Gallery',
    blurb: 'Image-led, centred, wide cards. Aftercare becomes numbered steps. Best when the work is visual and the room matters.',
    shape: 'Image band hero · service card grid · numbered aftercare steps',
  },
  classic: {
    name: 'Classic',
    blurb: 'Symmetric, serif-forward, rule-separated. Services in a two-column dotted-leader list. Best for an established practice with a traditional clientele.',
    shape: 'Centred hero with rule · two-column service list · symmetric throughout',
  },
};

export const PALETTE_PRESETS = [
  { name: 'Warm dark', bg: '#12100e', surface: '#1c1917', accent: '#b08d57', text: '#f4efe7', muted: '#a89e91' },
  { name: 'Cool dark', bg: '#0d1117', surface: '#161b22', accent: '#58a6ff', text: '#e6edf3', muted: '#9aa7b4' },
  { name: 'Ink & brass', bg: '#101014', surface: '#18181d', accent: '#c8a45c', text: '#f2f2f0', muted: '#a5a5a0' },
  { name: 'Paper light', bg: '#fbfaf7', surface: '#ffffff', accent: '#2f6f6a', text: '#1a1c1b', muted: '#5f6b68' },
  { name: 'Bone & clay', bg: '#f7f4ef', surface: '#ffffff', accent: '#9c5b3f', text: '#241f1b', muted: '#6b6259' },
  { name: 'Cold light', bg: '#f8f9fb', surface: '#ffffff', accent: '#3b4a9c', text: '#14161f', muted: '#5b6274' },
];

/**
 * The form. Sections are wizard steps; every field names the config path it owns.
 */
export const SECTIONS = [
  // -----------------------------------------------------------------------
  {
    id: 'start',
    title: 'Start',
    blurb: 'Pick the trade first — it sets the schema type, the banned-word list and the compliance rules, all of which are easy to get wrong and expensive to get wrong.',
    fields: [
      {
        path: '_vertical', label: 'What kind of business is this?', type: 'vertical', req: true,
        hint: 'This drives the schema.org type Google reads, the vertical-specific words the writer is forbidden from using, and the compliance rules the validator enforces. A med-spa and a barbershop are not the same risk.',
      },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'business',
    title: 'The business',
    blurb: 'Identity. These appear on the homepage, in every article byline, and in the search result.',
    fields: [
      { path: 'business.name', label: 'Full business name', type: 'text', req: true,
        hint: 'Exactly as it should appear in Google. Must match your Google Business Profile character for character — a mismatch splits your local ranking.' },
      { path: 'business.short_name', label: 'Short name', type: 'text', req: true,
        hint: 'For the nav and footer, where the full name would wrap. "Nolan & Co." for "Nolan & Co. Barbering".' },
      { path: 'business.initials', label: 'Monogram', type: 'text', req: true, maxlen: 4,
        hint: '2–4 characters. Becomes the nav mark and the favicon — this is the little logo in the Google result, so it is worth a moment.' },
      { path: 'business.type', label: 'Type, in plain words', type: 'text', req: true,
        hint: 'Lower case, as it would read mid-sentence: "a lash and brow studio in ___". Used in article prompts and meta descriptions.' },
      { path: 'business.category_schema', label: 'Schema.org category', type: 'select', req: true, options: SCHEMA_TYPE_OPTIONS,
        hint: 'What Google files you under. Set by your trade above; change it only if you know why.' },
      { path: 'business.tagline', label: 'Tagline', type: 'text', req: true, maxlen: 60, counter: true,
        hint: 'Under 60 characters. Goes in the hero and the page title. Say what you do or how you do it — not "Excellence in every detail".' },
      { path: 'business.positioning', label: 'Positioning', type: 'textarea', req: true, rows: 3,
        hint: 'One or two sentences: who it is for and why it is different. This is the single most-reused sentence in the whole build — hero, meta description, llms.txt, every article prompt. Be concrete.' },
      { path: 'business.practitioner_name', label: 'Lead practitioner', type: 'text', req: true,
        hint: 'First name is fine. Articles quote this person, and one topic bucket is built around their experience.' },
      { path: 'business.years_experience', label: 'Years of experience', type: 'text', req: true,
        hint: 'A number. Used in the hero stats and the E-E-A-T topics ("what 14 years taught…"). Do not round up.' },
      { path: 'business.founded_year', label: 'Year founded', type: 'text', opt: true,
        hint: 'Optional. Adds foundingDate to your business schema.' },
      { path: 'business.legal_name', label: 'Registered legal name', type: 'text', opt: true,
        hint: 'Optional, if different from the trading name.' },
      { path: 'business.author_id', label: 'Byline ID', type: 'text', req: true, slug: true,
        hint: 'Auto-filled from the short name. Names the author record every article is bylined to.' },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'location',
    title: 'Where you are',
    blurb: 'The address goes in your schema, your footer, and the footer of every article. Local anchors are how articles rank for "near me" searches.',
    fields: [
      { path: 'location.address_street', label: 'Street address', type: 'text', req: true,
        hint: 'Including unit or suite. Must match your Google Business Profile exactly.' },
      { path: 'location.address_city', label: 'City', type: 'text', req: true },
      { path: 'location.address_region', label: 'State / region', type: 'text', req: true, hint: 'Two-letter code in the US.' },
      { path: 'location.address_postal', label: 'Postcode', type: 'text', req: true },
      { path: 'location.address_country', label: 'Country', type: 'text', req: true, def: 'US', hint: 'Two-letter code.' },
      { path: 'location.timezone', label: 'Timezone', type: 'select', req: true, options: TIMEZONES.map((t) => [t, t]),
        hint: 'Drives the publish schedule and the once-per-day guard. Getting this wrong means articles publish at the wrong hour and the guard measures the wrong day.' },
      { path: 'location.neighborhood', label: 'Neighbourhood', type: 'text', req: true,
        hint: 'The one locals would name. Appears throughout the site and in hyperlocal topics.' },
      {
        path: 'location.location_anchors', label: 'Local anchors', type: 'list', req: true, min: 8,
        hint: '8–15 REAL nearby places: cross streets, landmarks, parks, adjacent neighbourhoods, big employers. Every article must mention several, and the validator counts them.',
        warn: 'These must be findable on a map. An invented landmark is the one error here that damages trust rather than just ranking — and nobody proofreads a list of place names.',
      },
      { path: 'location.service_area', label: 'Wider area served', type: 'list', opt: true,
        hint: 'Optional. Towns or districts people travel from. Adds to areaServed in your schema.' },
      { path: 'location.transit_notes', label: 'Getting here by transit', type: 'textarea', opt: true, rows: 2,
        hint: 'Optional. Nearest stop or station and the walk from it.' },
      { path: 'location.parking_notes', label: 'Parking', type: 'textarea', opt: true, rows: 2,
        hint: 'Optional, and one of the most-asked questions in this trade. Be honest about how hard it is.' },
      { path: 'location.accessibility_notes', label: 'Accessibility', type: 'textarea', opt: true, rows: 2,
        hint: 'Optional. Steps, lift, door width, accessible bathroom. People who need this information need it before they book, not after.' },
      { path: 'location.latitude', label: 'Latitude', type: 'text', opt: true, hint: 'Optional. Adds geo coordinates to your schema.' },
      { path: 'location.longitude', label: 'Longitude', type: 'text', opt: true },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'hours',
    title: 'Hours',
    blurb: 'Only the days you are actually open. These become your opening-hours schema, so they should be right.',
    fields: [
      { path: 'hours', label: 'Opening hours', type: 'hours', req: true,
        hint: 'Tick the days you open. If one day differs — a short Saturday, a late Thursday — switch on per-day hours rather than rounding it. Rounding is how a website tells someone to arrive an hour before the door is unlocked.' },
      { path: 'hours.notes', label: 'Hours notes', type: 'text', opt: true,
        hint: 'Optional. "Closed the first Monday of each month", holiday closures, seasonal changes.' },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'booking',
    title: 'Booking & contact',
    blurb: 'How people reach you — and, just as importantly, what must never be published.',
    fields: [
      { path: 'booking.model', label: 'How booking works', type: 'select', req: true,
        options: [['appointment-only', 'Appointment only'], ['walk-ins welcome', 'Walk-ins welcome'], ['online booking', 'Online booking']] },
      { path: 'booking.url', label: 'Booking link', type: 'text', opt: true,
        hint: 'Your booking system URL. Every "Book" button on the site points here. Leave blank and the buttons are omitted rather than dead.' },
      {
        path: 'booking.publish_phone', label: 'Publish a phone number on the site?', type: 'toggle',
        hint: 'If off, the build FAILS if a phone number appears anywhere — no tel: link, no digits, no image of a number. That is a hard gate, not a preference, because a private number that gets indexed cannot be un-indexed.',
      },
      { path: 'booking.phone', label: 'Phone number', type: 'text', showIf: 'booking.publish_phone',
        hint: 'Only stored if you publish it. A stored-but-unpublished number is one refactor away from being rendered, so the validator rejects that combination.' },
      { path: 'booking.publish_email', label: 'Publish an email address?', type: 'toggle', hint: 'Same hard gate as the phone.' },
      { path: 'booking.email', label: 'Email address', type: 'text', showIf: 'booking.publish_email' },
      { path: 'booking.lead_time_note', label: 'How far ahead to book', type: 'text', opt: true,
        hint: 'Optional. "Usually two weeks out for a Saturday."' },
      { path: 'booking.cancellation_policy', label: 'Cancellation policy', type: 'textarea', opt: true, rows: 2,
        hint: 'Optional but frequently asked. Notice period and what happens if it is missed.' },
      { path: 'booking.deposit_policy', label: 'Deposit policy', type: 'textarea', opt: true, rows: 2 },
      { path: 'booking.social.instagram', label: 'Instagram URL', type: 'text', opt: true, hint: 'Full URL. Social profiles become sameAs in your schema, which helps Google connect the site to the business.' },
      { path: 'booking.social.facebook', label: 'Facebook URL', type: 'text', opt: true },
      { path: 'booking.social.tiktok', label: 'TikTok URL', type: 'text', opt: true },
      { path: 'booking.social.yelp', label: 'Yelp URL', type: 'text', opt: true },
      { path: 'booking.social.google_business', label: 'Google Business Profile URL', type: 'text', opt: true,
        hint: 'Optional but the highest-value local SEO asset you have. Your name and address here must match this form exactly.' },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'services',
    title: 'Services',
    blurb: 'Four to ten. These become the services section, the internal-link map every article draws from, and the only prices the writer is permitted to state.',
    fields: [
      {
        path: 'services', label: 'Services', type: 'services', req: true, min: 4, max: 10,
        hint: 'Leave a price blank if it genuinely varies — the site will say so rather than guess, and the validator will reject any article that invents a number.',
      },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'homepage',
    title: 'Homepage words',
    blurb: 'The prose only you can write. This is deliberately not generated: it keeps the homepage build deterministic, and it is the part that sounds like a person.',
    fields: [
      { path: 'homepage.hero_headline', label: 'Hero headline override', type: 'text', opt: true,
        hint: 'Optional. Leave blank and the tagline is used.' },
      { path: 'homepage.about_body', label: 'About — the story', type: 'textarea', req: true, rows: 5,
        hint: 'Two to four plain sentences. Concrete beats warm: the room, the practitioner, why the place works the way it does. No filler.' },
      { path: 'homepage.aftercare_body', label: 'Aftercare guidance', type: 'textarea', req: true, rows: 5,
        hint: 'What someone should do after a visit. Specific and practical — this section earns more search traffic than almost anything else on the page.' },
      {
        path: 'homepage.faq', label: 'FAQ', type: 'faq', req: true, min: 6, max: 10,
        hint: 'Six to ten real questions. Use the ones you actually answer at the chair, in the words clients use. These become FAQ schema and can win a rich result.',
        warn: 'Never write an answer here you would not give a client to their face. This is the part of the site people screenshot.',
      },
      {
        path: 'homepage.testimonials', label: 'Testimonials', type: 'testimonials', opt: true,
        hint: 'Optional. Attribution is required for any you add — an unattributed testimonial is not evidence, and reads as invented.',
      },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'brand',
    title: 'Look & voice',
    blurb: 'Colour, type and layout skeleton. The layout variant matters more than the colours — two businesses on the same variant will look like siblings.',
    fields: [
      { path: 'brand.voice_adjectives', label: 'Voice in 3–5 words', type: 'list', req: true, min: 3,
        hint: 'How the writing should sound: "precise", "unhurried", "plain-spoken". These go straight into the voice guide the writer follows on every article.' },
      { path: 'brand.audience', label: 'Who the customer is', type: 'textarea', req: true, rows: 2,
        hint: 'One sentence. Specific enough to exclude someone.' },
      { path: 'brand.feel', label: 'Tone, in your own words', type: 'text', opt: true,
        hint: 'Optional, free prose. Shapes the VOICE only — layout comes from the variant below, so this cannot make the build non-deterministic.' },
      { path: 'brand.banned_extra', label: 'Words this brand never uses', type: 'list', opt: true,
        hint: 'On top of the universal slop list and your trade\'s defaults. Any article containing one is rejected outright, so only list things that must never appear.' },
      { path: 'brand.palette', label: 'Colours', type: 'palette', req: true,
        hint: 'Contrast is checked live against WCAG AA. A palette that fails will not build — that is deliberate, since low-contrast text is the most common accessibility failure on sites like this.' },
      { path: 'brand.fonts', label: 'Typefaces', type: 'fonts', req: true,
        hint: 'Two Google Fonts: one for headings, one for body.' },
      { path: 'brand.layout_variant', label: 'Layout skeleton', type: 'layout', req: true,
        hint: 'This picks a genuinely different page structure, not a colour scheme. Different section order, different service markup, different spacing and type scale.',
        warn: 'If you run more than one site from this factory, give them different variants. Same variant plus different colours is a recolor, and it is obvious side by side.' },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'site',
    title: 'Site & search',
    blurb: 'The domain and how the blog presents itself.',
    fields: [
      { path: 'site.domain', label: 'Domain', type: 'text', req: true,
        hint: 'Bare domain, no https:// and no trailing slash. Every canonical URL, the sitemap and the feeds are built from this.' },
      { path: 'site.blog_title', label: 'Blog name', type: 'text', req: true,
        hint: '"The Journal", "Studio Notes", "From the Table". Appears in the nav and the feeds.' },
      { path: 'site.blog_subtitle', label: 'Blog subtitle', type: 'text', req: true,
        hint: 'One line under the blog title. Where it is written from and about what.' },
      { path: 'site.meta_title_override', label: 'Page title override', type: 'text', opt: true, maxlen: 60, counter: true,
        hint: 'Optional. Leave blank for "Name — Tagline | City", which is usually right.' },
      { path: 'site.meta_description_override', label: 'Meta description override', type: 'textarea', opt: true, rows: 2, maxlen: 160, counter: true,
        hint: 'Optional, 70–160 characters. Leave blank and one is built from your type, city and first three services.' },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'content',
    title: 'Publishing',
    blurb: 'How often the blog writes itself, and the quality gates every article must clear.',
    fields: [
      { path: 'content.cadence_days', label: 'Publish days', type: 'days', req: true,
        hint: 'Two a week is a sustainable default. More is not better — near-duplicate articles get rejected, so cadence is limited by how many genuinely distinct topics exist.' },
      { path: 'content.publish_hour_local', label: 'Publish time', type: 'time', req: true, def: '09:00',
        hint: 'Local to your timezone.' },
      { path: 'content.topics_to_seed', label: 'Topics to seed', type: 'number', req: true, def: 50,
        hint: 'The starting backlog. 50 at two a week is about six months of runway.' },
      { path: 'content.buckets', label: 'Topic mix', type: 'buckets', req: true,
        hint: 'The kinds of article the queue draws from. Hyperlocal is capped at 30% automatically, because those are near-clones of each other and clone articles get rejected forever.' },
      { path: 'content.word_count', label: 'Article length', type: 'wordcount', req: true,
        hint: 'Hard floor and ceiling, plus the band the writer aims for.' },
      {
        path: 'content._thresholds', label: 'Similarity gates', type: 'thresholds', req: true,
        hint: 'Two numbers doing two different jobs. The SEED gate rejects a new topic too close to an existing one; the PUBLISH gate rejects a finished article too close to an existing article.',
        warn: 'The seed gate must be STRICTLY stricter than the publish gate. Collapse them into one number and near-duplicate topics reach the queue, then fail the publish gate forever — the failure that once took a blog offline for eight days.',
      },
      { path: 'content.internal_links', label: 'Internal links per article', type: 'minmax', req: true, def: { min: 2, max: 4 } },
      { path: 'content.location_mentions_min', label: 'Minimum local mentions', type: 'number', req: true, def: 3,
        hint: 'How many of your local anchors each article must name. This is what makes them rank locally.' },
      { path: 'content.faq_questions', label: 'FAQ questions per article', type: 'number', req: true, def: 4 },
      { path: 'content.publish_mode', label: 'Publishing mode', type: 'select', req: true,
        options: [['instant', 'Publish immediately'], ['delayed:24', 'Hold 24h for review'], ['delayed:72', 'Hold 72h for review']],
        hint: 'Immediate means no human step at all. The validator is what stands between the writer and the public either way.' },
      { path: 'content.limits', label: 'Safety limits', type: 'limits', req: true,
        hint: 'Hard caps on how much a single run can spend. These are real counters that abort, not advice.' },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'compliance',
    title: 'Compliance',
    blurb: 'Rules the validator enforces on every article before it can publish. Defaults come from your trade.',
    fields: [
      { path: 'compliance.no_medical_claims', label: 'Block medical claims', type: 'toggle', def: true,
        hint: 'Rejects "cures", "heals", "treats", "clinically proven".' },
      { path: 'compliance.no_guarantees', label: 'Block guarantees', type: 'toggle', def: true,
        hint: 'Rejects "guaranteed", "pain-free", "painless", "risk-free".' },
      { path: 'compliance.no_superlatives_without_evidence', label: 'Block unevidenced superlatives', type: 'toggle', def: true,
        hint: 'Rejects "the best", "world-class", "number one".' },
      { path: 'compliance.no_invented_prices', label: 'Block invented prices', type: 'toggle', def: true,
        hint: 'Any price not in your services list fails the article. This one is worth keeping on.' },
      { path: 'compliance.extra_notes', label: 'Additional rules', type: 'textarea', opt: true, rows: 3,
        hint: 'Licensing language, "results vary" disclaimers, anything your regulator requires. Passed to the writer on every article.' },
    ],
  },

  // -----------------------------------------------------------------------
  {
    id: 'integrations',
    title: 'Plumbing',
    blurb: 'Where it deploys and what writes it. You can fill these in later.',
    fields: [
      { path: 'integrations.anthropic_model', label: 'Model', type: 'text', req: true, def: 'claude-sonnet-4-5-20250929',
        hint: 'A current model ID. A retired one hard-stops the publisher rather than failing quietly.' },
      { path: 'integrations.github_repo', label: 'GitHub repo', type: 'text', opt: true,
        hint: 'owner/repo. Must be private — the publishing workflow depends on it.' },
      { path: 'integrations.vercel_project', label: 'Vercel project', type: 'text', opt: true },
      { path: 'integrations.sentry_dsn', label: 'Sentry DSN', type: 'text', opt: true,
        hint: 'Optional but strongly advised: it powers the heartbeat that catches "the publisher stopped running entirely", which is invisible otherwise.' },
      { path: 'integrations.analytics', label: 'Analytics', type: 'text', opt: true, hint: 'ga4:G-XXXX or clarity:XXXX' },
    ],
  },
];

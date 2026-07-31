import { readFileSync, existsSync, readdirSync } from 'fs';
import { parseMd as matter } from './md.mjs';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { ROOT, cfg } from './paths.mjs';
import { maxSimilarityToCorpus } from './embed-similarity.mjs';

const FORBIDDEN_PATH = join(ROOT, 'content/brand/forbidden.yaml');
const ARTICLES_DIR = join(ROOT, 'content/articles');

/**
 * Was a 21-entry hardcoded array of one city's landmarks. A second business
 * would have been graded on whether its articles mentioned Sunset Strip.
 */
const LOCATION_ANCHORS = [
  ...cfg.location.location_anchors,
  cfg.location.neighborhood,
  cfg.location.address_city,
].map((a) => String(a).toLowerCase());

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Words a keyword phrase is allowed to gain when it is written as English.
 * "mens haircut <city>" is typed by a searcher; "a men's haircut in <City>" is
 * how it appears in a sentence. Matching the raw phrase as a substring scored
 * every well-written article at 0.00% and the warning became noise nobody read.
 */
const FILLER = new Set(['a', 'an', 'the', 'in', 'at', 'on', 'of', 'for', 'to', 'near', 'and', 'ca', 'usa']);

/** Crude singularise. "mens" and "men's" and "men" must all count as one term. */
const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

function normaliseWords(text) {
  return String(text)
    .toLowerCase()
    .replace(/['’]s\b/g, 's')    // men's → mens, then stemmed to men
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);
}

function keywordTerms(phrase) {
  return normaliseWords(phrase).filter((t) => !FILLER.has(t));
}

/**
 * Count occurrences of a keyword phrase, tolerating filler words and possessive
 * apostrophes between its terms. A match is all of the phrase's significant
 * terms appearing IN ORDER inside a window no wider than twice their count —
 * tight enough that unrelated mentions scattered across a paragraph do not
 * count, loose enough that natural prose does.
 */
function countKeywordPhrase(text, phrase) {
  const terms = keywordTerms(phrase);
  if (!terms.length) return 0;
  const words = normaliseWords(text);
  const window = terms.length * 2 + 1;
  let count = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== terms[0]) continue;
    let ti = 1;
    for (let j = i + 1; j < Math.min(words.length, i + window); j++) {
      if (words[j] === terms[ti]) { ti++; if (ti === terms.length) break; }
    }
    if (ti === terms.length) { count++; i += terms.length - 1; }
  }
  return count;
}

function splitMainAndFaq(body) {
  const re = /^##\s+Frequently asked\s*$/im;
  const m = body.match(re);
  if (!m || m.index === undefined) return { main: body.trim(), faq: '' };
  const idx = m.index;
  return {
    main: body.slice(0, idx).trim(),
    faq: body.slice(idx).trim(),
  };
}

function countH2BeforeFaq(main) {
  const lines = main.split('\n');
  let n = 0;
  for (const line of lines) {
    if (/^##\s+/.test(line) && !/^##\s+Frequently asked\s*$/i.test(line)) n++;
  }
  return n;
}

function countBlockquotes(body) {
  const lines = body.split('\n');
  let inQuote = false;
  let blocks = 0;
  for (const line of lines) {
    if (/^>\s?/.test(line)) {
      if (!inQuote) {
        blocks++;
        inQuote = true;
      }
    } else if (line.trim() === '') {
      continue;
    } else {
      inQuote = false;
    }
  }
  return blocks;
}

function countInternalLinks(body) {
  const a = [...body.matchAll(/\]\(\/(?!\/)/g)].length;
  const b = [...body.matchAll(new RegExp(`\\]\\(https://${cfg.site.domain.replace(/\./g, '\\.')}/`, 'gi'))].length;
  return a + b;
}

function countLocationMentions(text) {
  const lower = text.toLowerCase();
  let n = 0;
  for (const a of LOCATION_ANCHORS) {
    const needle = a.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(needle, idx)) !== -1) {
      n++;
      idx += needle.length;
    }
  }
  return n;
}

function faqQuestionCount(faqSection) {
  const lines = faqSection.split('\n').filter((l) => l.trim());
  let q = 0;
  for (const line of lines) {
    if (/^\*\*.+\*\*\s*$/.test(line.trim())) q++;
  }
  return q;
}

function loadForbidden() {
  const doc = yaml.load(readFileSync(FORBIDDEN_PATH, 'utf8'));
  return {
    phrases: (doc.phrases || []).map((s) => String(s).toLowerCase()),
    words: (doc.words || []).map((s) => String(s).toLowerCase()),
  };
}

function containsForbidden(text, fb) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const p of fb.phrases) if (lower.includes(p)) hits.push(`phrase:${p}`);
  for (const w of fb.words) {
    const re = new RegExp(`\\b${escapeWord(w)}\\b`, 'i');
    if (re.test(lower)) hits.push(`word:${w}`);
  }
  return hits;
}

function escapeWord(w) {
  return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * BUG A7 (fixed): these errors carried no stable prefix, so `classifyFailure`
 * fell through to TRANSIENT and the engine regenerated the topic twice before
 * quarantining. A model that leaked a phone number once will do it again — this
 * is PERMANENT, and the `Contact leak:` prefix is what makes it so.
 *
 * R20: the prompt suggests, the validator enforces. Publishing contact details
 * the business chose not to publish is the failure this exists to prevent, so
 * the checks run even when publish_phone is true (an article still should not
 * carry raw contact details — that is what the site is for).
 */
function contactLeakChecks(body) {
  const errors = [];
  if (/mailto:/i.test(body)) errors.push('Contact leak: mailto: link not allowed');
  if (/tel:/i.test(body)) errors.push('Contact leak: tel: link not allowed');
  const phonePatterns = [
    /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
    /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/,
    /\b\+?1[-.\s]?\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
  ];
  if (phonePatterns.some((re) => re.test(body))) {
    errors.push('Contact leak: phone-like digit pattern detected');
  }
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(body)) {
    errors.push('Contact leak: email-like pattern detected');
  }
  return errors;
}

/** R20 — compliance is a validator rule, not a hope. */
function complianceChecks(body) {
  const errors = [];
  const lower = body.toLowerCase();
  const c = cfg.compliance || {};
  if (c.no_medical_claims) {
    const m = lower.match(/\b(cures?|heals?|treats?|curing|healing|medically proven|clinically proven)\b/);
    if (m) errors.push(`Forbidden: medical claim "${m[0]}" (compliance.no_medical_claims)`);
  }
  if (c.no_guarantees) {
    const m = lower.match(/\b(guaranteed?|pain-free|painless|risk-free|100% safe|no risk)\b/);
    if (m) errors.push(`Forbidden: guarantee "${m[0]}" (compliance.no_guarantees)`);
  }
  if (c.no_superlatives_without_evidence) {
    const m = lower.match(/\b(the best|world-class|the ultimate|number one|#1|unrivalled|unrivaled|the finest)\b/);
    if (m) errors.push(`Forbidden: unevidenced superlative "${m[0]}" (compliance.no_superlatives_without_evidence)`);
  }
  /**
   * R20, second half: an invented DURATION is the same defect as an invented
   * price, and it went unguarded until three published articles were found
   * claiming a haircut takes forty-five minutes after the price board said
   * thirty. The pipeline publishes unattended, so nothing but this stands
   * between a model's plausible guess and a live client page.
   *
   * SCOPED ON PURPOSE. These articles are full of legitimate durations that
   * are not service times — "fifteen minutes of walking", "three or four
   * minutes at the start", "under ten minutes from Sherman Oaks". Flagging
   * every number followed by "minutes" would quarantine every good article
   * and the check would be turned off within a week.
   *
   * So a duration is only challenged when the SENTENCE it appears in also
   * names a service or quotes a price — which is exactly the shape of the
   * sentences that were wrong ("A haircut runs about forty-five minutes",
   * "$90 and an hour and a half"). A model writing about the drive from
   * Tarzana is left alone.
   */
  if (c.no_invented_prices) {
    // Spelled-out durations, because that is how this voice writes them.
    // "forty five" is listed with a space: the sentence is normalised to strip
    // hyphens before matching, so "forty-five" and "forty five" both land here.
    const WORDS = [
      ['ten', 10], ['fifteen', 15], ['twenty', 20], ['twenty five', 25],
      ['thirty', 30], ['forty', 40], ['forty five', 45], ['fifty', 50],
      ['sixty', 60], ['ninety', 90],
    ];
    const toMinutes = (text) => {
      const t = text.toLowerCase().replace(/[-\u2011\u2013\u2014]/g, ' ');
      let m;
      if ((m = /\b(\d+)\s*(?:hr|hour)s?\s*(\d+)\s*min/.exec(t))) return +m[1] * 60 + +m[2];
      if ((m = /\ban hour and a quarter\b/.exec(t))) return 75;
      if ((m = /\ban hour and a half\b/.exec(t))) return 90;
      if ((m = /\b(?:a|one)\s+(?:full\s+)?hour\b/.exec(t))) return 60;
      if ((m = /\b(\d+)\s*(?:hr|hour)s?\b/.exec(t))) return +m[1] * 60;
      if ((m = /\b(\d+)\s*min/.exec(t))) return +m[1];
      // Longest phrase first, so "forty five" is not read as "forty".
      for (const [w, n] of [...WORDS].sort((a, b) => b[0].length - a[0].length)) {
        if (new RegExp(`\\b${w}\\s+minutes?\\b`).test(t)) return n;
      }
      return null;
    };

    const svcs = (cfg.services || [])
      .map((sv) => ({
        label: String(sv.label || ''),
        mins: toMinutes(String(sv.duration || '')),
        // Words distinctive enough to name a service in prose. Short ones are
        // dropped because "cut" and "the" match half the article.
        words: String(sv.label || '').toLowerCase().split(/\s+/)
          .filter((w) => w.length > 3 && !['with', 'and', 'the'].includes(w)),
      }))
      .filter((sv) => sv.mins);
    const allowedMins = new Set(svcs.map((sv) => sv.mins));
    const serviceWords = svcs.flatMap((sv) => sv.words);

    if (allowedMins.size) {
      // Split on sentence ends AND on blank lines. Markdown headings carry no
      // terminal punctuation, so a sentence-only split glues a heading to the
      // paragraph under it: "## Whether it is worth the ten minutes" merged
      // with the next sentence and reported a 10-minute service.
      for (const sentence of body.split(/(?<=[.!?])\s+|\n{2,}/)) {
        const low = sentence.toLowerCase();
        const namesService = /\$\s?\d/.test(sentence)
          || serviceWords.some((w) => low.includes(w));
        if (!namesService) continue;
        const mins = toMinutes(sentence);
        if (mins === null) continue;

        // Compare against the duration of the service the sentence actually
        // NAMES, not against every duration on the board. Checking the global
        // set let "a haircut runs about forty-five minutes" through, because 45
        // is a real duration — of the shave and the scissor cut. That is the
        // exact sentence that shipped wrong.
        const named = svcs.filter((sv) => sv.words.some((w) => low.includes(w)));
        const candidates = named.length ? named : svcs;
        if (candidates.some((sv) => sv.mins === mins)) continue;

        errors.push(
          `Forbidden: "${sentence.trim().slice(0, 90)}…" states ${mins} minutes for ` +
          (named.length
            ? `${named.map((sv) => `"${sv.label}" (${sv.mins} min)`).join(' / ')}`
            : 'a service')
          + ' (compliance.no_invented_prices)',
        );
        break;
      }
    }
  }

  if (c.no_invented_prices) {
    const allowed = new Set(
      (cfg.services || [])
        .map((sv) => String(sv.price_from || '').replace(/[^0-9]/g, ''))
        .filter(Boolean),
    );
    for (const m of body.matchAll(/\$\s?(\d[\d,]*)/g)) {
      const digits = m[1].replace(/,/g, '');
      if (!allowed.has(digits)) {
        errors.push(
          `Forbidden: price "${m[0]}" is not in services[].price_from ` +
          '(compliance.no_invented_prices)',
        );
        break;
      }
    }
  }
  return errors;
}

function markdownParseOk(body) {
  try {
    marked.parse(body);
    return true;
  } catch {
    return false;
  }
}

function countPriorArticles(currentSlug) {
  if (!existsSync(ARTICLES_DIR)) return 0;
  let n = 0;
  for (const f of readdirSync(ARTICLES_DIR)) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const raw = readFileSync(join(ARTICLES_DIR, f), 'utf8');
    const { data } = matter(raw);
    const slug = data.slug || '';
    if (slug && slug !== currentSlug) n++;
  }
  return n;
}

/**
 * @returns {Promise<{ ok: boolean, errors: string[], warnings: string[] }>}
 */
export async function validateArticleFile(mdPath, options = {}) {
  const errors = [];
  const warnings = [];
  if (!existsSync(mdPath)) {
    return { ok: false, errors: [`Missing file: ${mdPath}`], warnings };
  }

  const raw = readFileSync(mdPath, 'utf8');
  let data;
  let body;
  try {
    const parsed = matter(raw);
    data = parsed.data;
    body = parsed.content.trim();
  } catch (e) {
    return { ok: false, errors: [`Frontmatter parse error: ${e.message}`], warnings };
  }

  const req = ['title', 'slug', 'target_keyword', 'description', 'date', 'author', 'bucket', 'intent'];
  for (const k of req) {
    if (data[k] == null || data[k] === '') errors.push(`Missing frontmatter: ${k}`);
  }

  const { main, faq } = splitMainAndFaq(body);
  if (!faq || !/^##\s+Frequently asked/im.test(body)) errors.push('Missing "## Frequently asked" section');

  const wcMain = wordCount(main);
  const { min: WC_MIN, max: WC_MAX } = cfg.content.word_count;
  if (wcMain < WC_MIN || wcMain > WC_MAX) {
    errors.push(`Word count: main body ${wcMain} (need ${WC_MIN}–${WC_MAX}, excluding FAQ)`);
  }

  const h2Main = countH2BeforeFaq(main);
  if (h2Main < 3 || h2Main > 5) errors.push(`H2 sections in main body: ${h2Main} (need 3–5)`);

  const quotes = countBlockquotes(body);
  if (quotes !== 1) errors.push(`Blockquote blocks: ${quotes} (need exactly 1)`);

  if (faq) {
    const qs = faqQuestionCount(faq);
    const needQ = cfg.content.faq_questions;
    if (qs < needQ) errors.push(`FAQ questions found: ${qs} (need >=${needQ} bold question lines)`);
  }

  const il = countInternalLinks(body);
  const { min: IL_MIN, max: IL_MAX } = cfg.content.internal_links;
  if (il < IL_MIN || il > IL_MAX) errors.push(`Internal links: ${il} (need ${IL_MIN}–${IL_MAX})`);

  const loc = countLocationMentions(body);
  const LOC_MIN = cfg.content.location_mentions_min;
  if (loc < LOC_MIN) errors.push(`Location mentions: ${loc} (need >=${LOC_MIN})`);

  const desc = String(data.description || '');
  if (desc.length < 70 || desc.length > 160) errors.push(`Meta description length ${desc.length} (need 70–160)`);

  const fb = loadForbidden();
  const bad = containsForbidden(body, fb);
  if (bad.length) errors.push(`Forbidden: ${bad.join(', ')}`);

  errors.push(...contactLeakChecks(body));
  errors.push(...complianceChecks(body));

  if (!markdownParseOk(body)) errors.push('Markdown failed to parse');

  // 14 §D: the template emits <h1>{{TITLE}}</h1>, so an H1 in the body renders twice.
  if (/^#\s+/m.test(main)) errors.push('Structure: body contains an H1 (the template renders the title)');

  const skipEmbed = options.skipSimilarity === true;
  if (!skipEmbed && data.slug) {
    const priorCount = countPriorArticles(data.slug);
    if (priorCount > 0) {
      try {
        const sim = await maxSimilarityToCorpus(body, data.slug);
        const MAX_SIM = cfg.content.originality_max_similarity;
        if (sim > MAX_SIM) {
          errors.push(`Originality: max cosine similarity ${sim.toFixed(3)} exceeds ${MAX_SIM}`);
        }
      } catch (e) {
        warnings.push(`Embedding check skipped/failed: ${e.message}`);
      }
    }
  }

  const kw = String(data.target_keyword || '').toLowerCase();
  if (kw) {
    const occurrences = countKeywordPhrase(main, kw);
    const pct = (occurrences / Math.max(wcMain, 1)) * 100;
    // A percentage floor only makes sense for a SINGLE-term head keyword. Applied
    // to a phrase it demands stuffing: "<trade> near <town>" is two significant
    // terms, and 0.5% of a 950-word article is five proximate repetitions of
    // them — which no barber would write and no reader would forgive. Any
    // multi-word phrase therefore gets an occurrence floor of 2: present in the
    // opening answer paragraph, and once more in the body.
    // The 2.5% CEILING still applies to everything; that one is about stuffing.
    const terms = keywordTerms(kw).length;
    const floor = terms <= 1 ? Math.max(2, Math.ceil(0.005 * wcMain)) : 2;
    if (occurrences < floor) {
      warnings.push(`Target keyword appears ${occurrences}× (want >=${floor} for "${kw}")`);
    } else if (pct > 2.5) {
      warnings.push(`Keyword density ${pct.toFixed(2)}% — over the 2.5% stuffing ceiling`);
    }
  }
  const secs = data.secondary_keywords || [];
  const anySec = secs.some((s) => countKeywordPhrase(main, String(s)) > 0);
  if (secs.length && !anySec) warnings.push('No secondary keyword detected in main body (soft check)');

  // The frontmatter carries a self_check block. Nothing verified it, so it was
  // decoration: a model could claim 1100 words in a 700-word article and the
  // number sat in the file looking authoritative. Warn on a real mismatch —
  // not an error, because the numbers the validator computes itself are the
  // ones that gate publication, and a wrong self-report is a signal about the
  // generation rather than a defect in the article.
  const sc = data.self_check;
  if (sc && typeof sc === 'object') {
    const claims = [
      ['word_count', sc.word_count, wcMain, 60],
      ['h2_count', sc.h2_count, h2Main, 0],
      ['internal_links', sc.internal_links, il, 0],
      ['location_mentions', sc.location_mentions, loc, 0],
    ];
    for (const [name, claimed, actual, tolerance] of claims) {
      if (claimed === undefined || claimed === null) continue;
      if (Math.abs(Number(claimed) - actual) > tolerance) {
        warnings.push(`self_check.${name} says ${claimed}, actual is ${actual} (soft check)`);
      }
    }
    if (sc.has_blockquote === false && quotes > 0) warnings.push('self_check.has_blockquote is false but a blockquote is present');
    if (sc.has_faq_block === false && faq) warnings.push('self_check.has_faq_block is false but an FAQ section is present');
  }

  return { ok: errors.length === 0, errors, warnings };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule && process.argv[2]) {
  validateArticleFile(process.argv[2], { skipSimilarity: process.env.SKIP_EMBED === '1' }).then((r) => {
    for (const w of r.warnings) console.warn('WARN:', w);
    if (!r.ok) {
      for (const e of r.errors) console.error('ERR:', e);
      process.exit(1);
    }
    console.log('OK');
    process.exit(0);
  });
}

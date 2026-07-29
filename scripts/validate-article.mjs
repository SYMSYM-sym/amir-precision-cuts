import { readFileSync, existsSync, readdirSync } from 'fs';
import matter from 'gray-matter';
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
  const mainLower = main.toLowerCase();
  if (kw) {
    const occurrences = mainLower.split(kw).length - 1;
    const density = occurrences / Math.max(wcMain, 1);
    const pct = density * 100;
    if (pct < 0.5 || pct > 2.5) warnings.push(`Keyword density ${pct.toFixed(2)}% (soft band 0.5–2.5%)`);
  }
  const secs = data.secondary_keywords || [];
  const anySec = secs.some((s) => mainLower.includes(String(s).toLowerCase()));
  if (secs.length && !anySec) warnings.push('No secondary keyword detected in main body (soft check)');

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

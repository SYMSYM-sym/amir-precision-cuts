import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parseMd as matter } from './md.mjs';
import gm from 'gray-matter';
import yaml from 'js-yaml';
import { ROOT, cfg, ConfigError } from './paths.mjs';
import { localDateString } from './pick-topic.mjs';
import { complete, provider } from './model.mjs';
import { applyAuthoritativeFrontmatter } from './frontmatter.mjs';

const VOICE_PATH = join(ROOT, 'content/brand/voice.md');
const FORBIDDEN_PATH = join(ROOT, 'content/brand/forbidden.yaml');
const INTERNAL_PATH = join(ROOT, 'content/brand/internal-links.yaml');
const ARTICLES_DIR = join(ROOT, 'content/articles');

function loadBrandFiles() {
  const voice = readFileSync(VOICE_PATH, 'utf8');
  const forbiddenDoc = yaml.load(readFileSync(FORBIDDEN_PATH, 'utf8'));
  const phrases = (forbiddenDoc.phrases || []).map((p) => `- ${p}`).join('\n');
  const words = (forbiddenDoc.words || []).map((w) => `- ${w}`).join('\n');
  const forbiddenBullets = `${phrases}\n${words}`;
  const internal = yaml.load(readFileSync(INTERNAL_PATH, 'utf8'));
  let table = '| Anchor idea | Path |\n|---|---|\n';
  for (const [key, def] of Object.entries(internal.services || {})) {
    const v = (def.variants || []).join('; ');
    table += `| ${key}: ${v} | ${def.href} |\n`;
  }
  for (const [key, def] of Object.entries(internal.pages || {})) {
    const v = (def.variants || []).join('; ');
    table += `| ${key}: ${v} | ${def.href} |\n`;
  }
  return { voice, forbiddenBullets, internalTable: table };
}

function listArticleMarkdowns() {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => join(ARTICLES_DIR, f));
}

/** Recent articles: title + first ~400 chars of body for originality prompts. */
function recentArticleSummaries(limit = 5) {
  const files = listArticleMarkdowns();
  const parsed = files.map((filePath) => {
    const raw = readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);
    return {
      date: data.date || '',
      title: data.title || '',
      excerpt: content.replace(/^\s+/, '').slice(0, 450),
    };
  });
  parsed.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return parsed.slice(0, limit);
}

function buildSystemPrompt(topic, isoDate) {
  const { voice, forbiddenBullets, internalTable } = loadBrandFiles();
  const recent = recentArticleSummaries(5);
  const recentBlock = recent.length
    ? recent.map((r) => `- ${r.title}: ${r.excerpt.replace(/\s+/g, ' ')}`).join('\n')
    : '(none yet — first article in repo)';

  // `yaml.dump(['a','b'])` returns "- a\n- b\n", which spliced onto
  // `secondary_keywords: ` produces `secondary_keywords: - a` — invalid YAML on
  // the first line and a valid-but-orphaned list item on the second. The model
  // copies the example it is shown, so a malformed example is a malformed
  // article every time. Indent it as a proper block sequence.
  const secKw = (topic.secondary_keywords || []).length
    ? `\n${(topic.secondary_keywords || []).map((k) => `  - ${JSON.stringify(String(k))}`).join('\n')}`
    : ' []';

  const b = cfg.business;
  const loc = cfg.location;

  // years_experience is OPTIONAL. Interpolating it unguarded printed
  // "<practitioner>, undefined years experience" into the reference block and
  // "the practitioner, undefined years of experience" into the quote rule —
  // which is worse than useless: it hands the model a blank and invites it to
  // fill in a number about someone's career. When we do not know, say so, and
  // say what to do instead.
  const practitionerLine = cfg.derived.has_experience
    ? `${b.practitioner_name}, ${cfg.derived.experience_years} years experience`
    : `${b.practitioner_name}. NO length of experience has been supplied — never state, imply `
      + 'or gesture at how long they have been working (no "years of experience", no '
      + '"decades", no "seasoned", no "since starting out"). Build authority from craft '
      + 'specifics instead.';
  const quoteTenureRule = cfg.derived.has_experience
    ? `The quote may reference ${cfg.derived.experience_years} years of experience`
    : 'The quote must NOT reference any length of experience — none has been supplied';

  const wc = cfg.content.word_count;
  const il = cfg.content.internal_links;

  // Prices: ONLY what services[].price_from actually says. R20 / compliance —
  // "no prices unless they appear here" is enforced by the validator too, so a
  // model that invents one fails the build rather than publishing it.
  //
  // The reference wrote "<label> from <price>" unconditionally and headed the
  // block "Service prices (start at)". For a business whose prices are FIXED
  // that is the prompt instructing the model to hedge every number — the exact
  // "from $50" phrasing the voice file bans. `price_note` (e.g. "+") is where a
  // business says the price is a floor; absent it, the price is the price.
  const priceLines = cfg.derived.services_display
    .map((sv) => (sv.price_display
      ? `${sv.label} ${sv.price_display}`
      : `${sv.label} (price on request — DO NOT state a price)`))
    .join(', ');
  const anyOpenEnded = cfg.derived.services_display.some((sv) => sv.price_note);
  const priceHeading = anyOpenEnded
    ? 'Service prices — a trailing "+" means that price is a starting point; without one it is the price'
    : 'Service prices — these are the prices, NOT starting points. Never write "from $X" or "$X+"';

  // The contact rule is stated as a prohibition, not an omission. A prompt that
  // simply fails to mention a phone number is not the same as one that forbids it.
  const contactRules = [
    cfg.booking.publish_phone === true
      ? `- The business phone is ${cfg.booking.phone}, but articles must NOT contain it. Link to the site instead.`
      : '- This business does NOT publish a phone number. Never write a phone number or a tel: link.',
    cfg.booking.publish_email === true
      ? `- The business email is ${cfg.booking.email}, but articles must NOT contain it.`
      : '- This business does NOT publish an email address. Never write an email or a mailto: link.',
  ].join('\n');

  const complianceRules = [
    cfg.compliance?.no_medical_claims && '- No medical claims. Never write that anything cures, heals, or treats a condition.',
    cfg.compliance?.no_guarantees && '- No guarantees. Never promise a result, and never write "pain-free" or "painless".',
    cfg.compliance?.no_superlatives_without_evidence && '- No superlatives without evidence ("best", "the ultimate", "number one").',
    cfg.compliance?.no_invented_prices && '- Never state a price that is not in the reference data below.',
    cfg.compliance?.extra_notes && `- ${cfg.compliance.extra_notes}`,
  ].filter(Boolean).join('\n');

  return `You write articles for ${b.name}, a ${b.type} in ${loc.address_city}, ${loc.address_region}. Your output is published verbatim. You follow the brand voice exactly.

# Brand voice (authoritative)
${voice}

# Forbidden phrases and words (case-insensitive)
${forbiddenBullets}

# Internal link map
The article MUST include at least ${il.min} internal links chosen from this map. Use ONE anchor variant per service/page; do not reuse the same anchor twice in the article. Always link to the absolute path. Do not invent paths.
${internalTable}

# Location anchors (use ${cfg.content.location_mentions_min}+ in the article, naturally)
${loc.location_anchors.join(', ')}

# Recent articles (avoid repeating angles, examples, or quotes)
${recentBlock}

# Output rules
- Word count: ${wc.target_min}–${wc.target_max} (hard limits ${wc.min}–${wc.max}, excluding the FAQ).
- 3–5 H2 sections. H3 sparingly.
- Open with a 40–60 word "answer paragraph" that directly answers the article's keyword query. No preamble.
- Include exactly ONE blockquote. Voice it as ${b.practitioner_name}. ${quoteTenureRule}. No first person plural in the quote.
- Include exactly ONE FAQ section at the end with ${cfg.content.faq_questions} Q&As. Each Q must be a real long-tail query someone would type.
- Internal links: minimum ${il.min}, maximum ${il.max}.
- Location mentions: minimum ${cfg.content.location_mentions_min} (neighborhood, cross street, or landmark).
- No emojis. No exclamation points except in the FAQ if a real question contains one.
${complianceRules}

# Brand reference data — these are the only prices/facts you may cite
- Business: ${b.name} (${b.short_name}), ${b.type}
- Address: ${cfg.derived.address_one_line}
- Neighborhood: ${loc.neighborhood}
- Hours: ${cfg.derived.hours_line}${cfg.hours.notes ? ` (${cfg.hours.notes})` : ''}
- Practitioner: ${practitionerLine}
- Booking: ${cfg.derived.booking_line}
- ${priceHeading}: ${priceLines}
${contactRules}

# Output format — STRICT
Return a single fenced markdown block. No prose before or after. Frontmatter is YAML. Body is Markdown. Do not include the H1 heading inside the body — it is rendered from the title field.

\`\`\`markdown
---
title: "${topic.title.replace(/"/g, '\\"')}"
slug: "${topic.slug}"
target_keyword: "${topic.target_keyword.replace(/"/g, '\\"')}"
secondary_keywords:${secKw}
description: "<70-160 character meta description, no quotes around it>"
date: "${isoDate}"
author: "${b.author_id}"
bucket: "${topic.bucket}"
intent: "${topic.intent}"
reading_time_minutes: <integer>
self_check:
  word_count: <integer>
  h2_count: <integer>
  internal_links: <integer>
  location_mentions: <integer>
  has_blockquote: <boolean>
  has_faq_block: <boolean>
---

<answer paragraph, 40-60 words, no header>

## <H2 #1>
<body>

## <H2 #2>
<body>

> "<${b.practitioner_name} quote, 1-3 sentences>"
> — ${cfg.derived.quote_attribution}

## <H2 #3>
<body>

## Frequently asked

${Array.from({ length: cfg.content.faq_questions }, (_, i) => `**<Q${i + 1}>**\n<A${i + 1}, 1-3 sentences>`).join('\n\n')}
\`\`\`

Now write the article for:
TITLE: ${topic.title}
TARGET KEYWORD: ${topic.target_keyword}
SECONDARY KEYWORDS: ${(topic.secondary_keywords || []).join(', ')}
INTENT: ${topic.intent}
BUCKET: ${topic.bucket}
NOTES: ${topic.notes || ''}`;
}

function extractFencedMarkdown(text) {
  const m = text.match(/```markdown\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  const m2 = text.match(/```md\s*([\s\S]*?)```/);
  if (m2) return m2[1].trim();
  throw new Error('Claude response missing fenced markdown block');
}

/**
 * @returns {{ filePath: string, frontmatter: object }}
 */
export async function generateArticleFromTopic(topic) {
  // R15 — a missing provider is an ENVIRONMENT problem. It must hard-stop,
  // never quarantine, or one bad secret silently burns the entire backlog.
  if (!provider()) {
    throw new ConfigError(
      'No model provider: set ANTHROPIC_API_KEY, or MODEL_OFFLINE_DIR to publish '
      + 'from supplied completions.',
    );
  }

  const isoDate = localDateString();
  const system = buildSystemPrompt(topic, isoDate);
  const text = await complete({
    system,
    user: 'Write the article now. Output the markdown block only.',
    tag: `article-${topic.slug}`,
    maxTokens: 4096,
    temperature: 0.7,
  });
  const md = extractFencedMarkdown(text);
  const { data, content } = matter(md);
  applyAuthoritativeFrontmatter(data, topic, isoDate);
  const body = content.trim();
  const stitched = gm.stringify(body, data);
  mkdirSync(ARTICLES_DIR, { recursive: true });
  const fileName = `${isoDate}-${data.slug}.md`;
  const filePath = join(ARTICLES_DIR, fileName);
  writeFileSync(filePath, stitched, 'utf8');
  return { filePath, frontmatter: data };
}
export { ConfigError } from './paths.mjs';

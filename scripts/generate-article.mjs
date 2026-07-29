import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import Anthropic from '@anthropic-ai/sdk';
import { ROOT, cfg, ConfigError } from './paths.mjs';
import { localDateString } from './pick-topic.mjs';
import { readAuthor } from './authors.mjs';
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

  const secKw = yaml.dump(topic.secondary_keywords || [], { lineWidth: 120 });

  const b = cfg.business;
  const loc = cfg.location;
  const wc = cfg.content.word_count;
  const il = cfg.content.internal_links;
  const author = readAuthor();

  // Prices: ONLY what services[].price_from actually says. R20 / compliance —
  // "no prices unless they appear here" is enforced by the validator too, so a
  // model that invents one fails the build rather than publishing it.
  const priceLines = cfg.services
    .map((sv) => (sv.price_from ? `${sv.label} from ${sv.price_from}` : `${sv.label} (price on request — DO NOT state a price)`))
    .join(', ');

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
- Include exactly ONE blockquote. Voice it as ${b.practitioner_name} (the practitioner, ${b.years_experience} years of experience). No first person plural in the quote.
- Include exactly ONE FAQ section at the end with ${cfg.content.faq_questions} Q&As. Each Q must be a real long-tail query someone would type.
- Internal links: minimum ${il.min}, maximum ${il.max}.
- Location mentions: minimum ${cfg.content.location_mentions_min} (neighborhood, cross street, or landmark).
- No emojis. No exclamation points except in the FAQ if a real question contains one.
${complianceRules}

# Brand reference data — these are the only prices/facts you may cite
- Business: ${b.name} (${b.short_name}), ${b.type}
- Address: ${cfg.derived.address_one_line}
- Neighborhood: ${loc.neighborhood}
- Hours: ${cfg.derived.hours_days_short}, ${cfg.derived.hours_times_long}
- Practitioner: ${b.practitioner_name}, ${b.years_experience} years experience
- Booking: ${cfg.derived.booking_line}
- Service prices (start at): ${priceLines}
${contactRules}

# Output format — STRICT
Return a single fenced markdown block. No prose before or after. Frontmatter is YAML. Body is Markdown. Do not include the H1 heading inside the body — it is rendered from the title field.

\`\`\`markdown
---
title: "${topic.title.replace(/"/g, '\\"')}"
slug: "${topic.slug}"
target_keyword: "${topic.target_keyword.replace(/"/g, '\\"')}"
secondary_keywords: ${secKw.trimEnd()}
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
> — ${b.practitioner_name}, practitioner

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
  // R15 — a missing key / retired model / exhausted credit is an ENVIRONMENT
  // problem. It must hard-stop, never quarantine, or one bad secret silently
  // burns the entire backlog.
  const model = process.env.ANTHROPIC_MODEL || cfg.integrations.anthropic_model;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ConfigError('ANTHROPIC_API_KEY is not set');
  if (!model) throw new ConfigError('No model configured (integrations.anthropic_model)');

  const isoDate = localDateString();
  const system = buildSystemPrompt(topic, isoDate);
  const client = new Anthropic({ apiKey });

  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0.7,
    system,
    messages: [{ role: 'user', content: 'Write the article now. Output the markdown block only.' }],
  });

  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const md = extractFencedMarkdown(text);
  const { data, content } = matter(md);
  applyAuthoritativeFrontmatter(data, topic, isoDate);
  const body = content.trim();
  const stitched = matter.stringify(body, data);
  mkdirSync(ARTICLES_DIR, { recursive: true });
  const fileName = `${isoDate}-${data.slug}.md`;
  const filePath = join(ARTICLES_DIR, fileName);
  writeFileSync(filePath, stitched, 'utf8');
  return { filePath, frontmatter: data };
}
export { ConfigError } from './paths.mjs';

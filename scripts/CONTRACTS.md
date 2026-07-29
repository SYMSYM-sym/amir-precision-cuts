# Script Contracts — module-by-module signatures

Implement to these signatures. Behavior detail lives in `05-CONTENT-ENGINE-SPEC.md`; the hardening rationale in `08-HARDENING-RULES.md`.

```js
// paths.mjs
export const ROOT               // repo root (absolute)
export const cfg                // parsed business.config.yaml (single source of truth)
```

```js
// pick-topic.mjs
export function localDateString(date = new Date()): string   // YYYY-MM-DD in cfg.location.timezone
export function loadQueue(): Topic[]                          // throws if queue.yaml isn't an array
export function loadPublished(): { entries: PublishedEntry[] }
export function loadNeedsReview(): { entries: QuarantineEntry[] }
export function alreadyPublishedToday(published?): boolean     // any entry.published_at === localDateString()
export function pickTopic({ forceSlug }?): { topic, index } | null   // forceSlug: find by slug, throw if absent; else queue[0]
export function dequeueTopic(index: number): Topic             // splice + rewrite (keep header comment); atomic write
export function appendPublished(entry): void                   // { slug, published_at, title, target_keyword } — append-only
export function quarantineTopic(topic, reason: string): void   // remove from queue + append to needs-review (atomic); R1
export function archiveCompletedFrontmatter(slug, data): void
```

```js
// frontmatter.mjs                                              // R3 — the model never owns known data
export function applyAuthoritativeFrontmatter(data, topic, isoDate): object
// FORCE: slug, intent, bucket.  DEFAULT: title, target_keyword, date, author, secondary_keywords.
// NEVER inject `description` (the model authors it; missing/short -> transient regenerate).
```

```js
// generate-article.mjs
export async function generateArticleFromTopic(topic): Promise<{ filePath, frontmatter }>
// Assembles: voice.md + forbidden + internal-link map + location anchors +
//            recent-article excerpts (5) + output rules + brand reference data + topic.notes
// Anthropic: { model: cfg.integrations.anthropic_model, max_tokens: 4096, temperature: 0.7, system, messages:[user] }
// Extract a single ```markdown fence -> no fence = TRANSIENT.
// Missing ANTHROPIC_API_KEY -> throw ConfigError (hard stop, never quarantine). R15
export class ConfigError extends Error {}
```

```js
// embed-similarity.mjs                                         // local, free, cached
export async function maxSimilarityToCorpus(body: string, selfSlug: string): Promise<number>
export async function findNearDuplicateTopic(topic, topics, threshold = 0.80): Promise<Topic | null>
// Xenova/all-MiniLM-L6-v2, mean-pool + L2-normalize, cosine.
// Cache in content/articles/_embeddings.json keyed by slug + content hash.
// 0.80 -> queue-build gate (topics). 0.85 -> publish gate (articles). R13
```

```js
// validate-article.mjs
export async function validateArticleFile(mdPath, { skipSimilarity = false } = {})
  : Promise<{ ok: boolean, errors: string[], warnings: string[] }>
// ok === errors.length === 0. 13 error checks + 2 warnings — see 05-CONTENT-ENGINE-SPEC §D.
// Error strings MUST be stable prefixes ("Originality:", "Forbidden:", "Internal links:",
// "Missing frontmatter:") because failure-classify.mjs pattern-matches them.
// Embedding infra throw -> push a WARNING, never block. R2-adjacent: don't fail on infra.
// CLI: node scripts/validate-article.mjs <path>   (exit 0 = OK, 1 = errors)
```

```js
// failure-classify.mjs                                         // R1
export function classifyFailure(errors: string[]): 'PERMANENT' | 'TRANSIENT'
// PERMANENT iff /Originality:|Forbidden:/ matches — regenerating cannot fix those.
// Everything else -> TRANSIENT.
export function isConfigError(e: Error): boolean                // R15
```

```js
// index.mjs — orchestrator (the file that must never wedge). R1
// flags: --dry-run (fixture, no API, skip similarity), --skip-merge-prep
// env:   FORCE_SLUG, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, GITHUB_ACTIONS
const MAX_TOPICS_PER_RUN = 3, MAX_REGEN_PER_TOPIC = 3, MAX_API_CALLS_PER_RUN = 5;  // R19
// guard: CI && !dry && !forceSlug && alreadyPublishedToday() -> log + exit 0        // R7
// loop:  pick -> generate -> inject -> validate
//        ok        -> dequeue + appendPublished + archive -> published = true
//        TRANSIENT -> regenerate same topic (<= MAX_REGEN_PER_TOPIC)
//        PERMANENT -> quarantineTopic -> next topic
//        exhausted -> quarantineTopic anyway (no wedge)                             // R1
//        ConfigError -> rethrow (hard stop)                                          // R15
//        forceSlug -> only ever try the one topic
// !published -> console.error + exit 1 (alerts fire)
// then: await buildBlog(); appendGithubEnv({ARTICLE_TITLE,SLUG,KEYWORD,BUCKET,WORDS})
```

```js
// build-blog.mjs
export async function buildBlog(): Promise<void>
// reads content/articles/*.md (skip _*) -> writes:
//   blog/<slug>/index.html   (article tpl + Article JSON-LD + canonical + OG/Twitter)
//   blog/index.html          (cards + bucket chips, newest first)
//   sitemap.xml (home + articles + lastmod), feed.xml (RSS), feed.json (JSON Feed 1.1), llms.txt
// Idempotent. Does NOT touch robots.txt. Never hand-edit its outputs.
```

```js
// verify-live.mjs   — see the full implementation in this folder. Exit 1 on any failure.
// pipeline.test.mjs — node --test; the 8 cases in 10-VERIFICATION-AND-TESTS §B.
// bootstrap-queue.mjs — seed/dedupe the queue; --dedupe-only rejects topics > 0.80. R13
// generate-assets.py  — favicon/icon/apple-touch/og.jpg. R4
```

## Types

```ts
type Topic = { slug, title, target_keyword, secondary_keywords?: string[],
               intent, bucket, internal_links?: ({service?:string}|{page?:string})[], notes?: string }
type PublishedEntry  = { slug, published_at, title, target_keyword }
type QuarantineEntry = { slug, title, target_keyword, reason, quarantined_at }
```

## Invariants (assert these)
1. Every topic is in **exactly one** of queue / published / needs-review.
2. A topic leaves the queue **only** on a passing validation or a quarantine.
3. `published.yaml` is **append-only**.
4. Validator error prefixes are stable (failure-classify depends on them).
5. `--dry-run` makes **zero** API calls.

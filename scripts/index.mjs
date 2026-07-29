import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
  appendFileSync,
  mkdirSync,
} from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { ROOT, cfg } from './paths.mjs';
import { generateArticleFromTopic } from './generate-article.mjs';
import { validateArticleFile } from './validate-article.mjs';
import { buildBlog } from './build-blog.mjs';
import {
  pickTopic,
  dequeueTopic,
  appendPublished,
  archiveCompletedFrontmatter,
  alreadyPublishedToday,
  localDateString,
  quarantineTopic,
} from './pick-topic.mjs';
import {
  MAX_TOPICS_PER_RUN,
  MAX_REGEN_PER_TOPIC,
  MAX_API_CALLS_PER_RUN,
  classifyFailure,
  isConfigError,
} from './failure-classify.mjs';

/**
 * R19 — the reference had NO counter at all. The cap was aspirational: worst
 * case was MAX_TOPICS_PER_RUN x (MAX_REGEN_PER_TOPIC + 1) = 9 uncapped calls.
 * This is the real thing: a counter that aborts the run.
 */
let apiCalls = 0;
export function resetApiCalls() { apiCalls = 0; }
export function apiCallCount() { return apiCalls; }
function chargeApiCall() {
  apiCalls += 1;
  if (apiCalls > MAX_API_CALLS_PER_RUN) {
    throw new ApiBudgetExceeded(
      `API call budget exhausted: ${apiCalls} > MAX_API_CALLS_PER_RUN=${MAX_API_CALLS_PER_RUN} (R19)`,
    );
  }
}
export class ApiBudgetExceeded extends Error {
  constructor(m) { super(m); this.name = 'ApiBudgetExceeded'; }
}

const ARTICLES_DIR = join(ROOT, 'content/articles');
const FIXTURE_PATH = join(ROOT, 'scripts/fixtures/dry-run-sample.md');

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const skipMergePrep = process.argv.includes('--skip-merge-prep');
  return { dryRun, skipMergePrep };
}

function appendGithubEnv(pairs) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const path = process.env.GITHUB_ENV;
  if (!path) return;
  for (const [k, raw] of Object.entries(pairs)) {
    const v = String(raw ?? '').replace(/\n/g, '%0A');
    appendFileSync(path, `${k}=${v}\n`);
  }
}

function removePriorDryRunArtifacts() {
  if (!existsSync(ARTICLES_DIR)) return;
  for (const f of readdirSync(ARTICLES_DIR)) {
    if (f.endsWith('-dry-run-sample.md')) {
      try {
        unlinkSync(join(ARTICLES_DIR, f));
      } catch {
        /* ignore */
      }
    }
  }
}

function safeUnlink(path) {
  if (path && existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
}

async function runDryRunFixture() {
  removePriorDryRunArtifacts();
  mkdirSync(ARTICLES_DIR, { recursive: true });
  const iso = localDateString();
  const raw = readFileSync(FIXTURE_PATH, 'utf8');
  const { data, content } = matter(raw);
  data.date = iso;
  const stitched = matter.stringify(content.trim(), data);
  const dest = join(ARTICLES_DIR, `${iso}-dry-run-sample.md`);
  writeFileSync(dest, stitched, 'utf8');
  return dest;
}

async function publishValidatedTopic(topic, index, skipMergePrep) {
  chargeApiCall();
  const gen = await generateArticleFromTopic(topic);
  const v = await validateArticleFile(gen.filePath, { skipSimilarity: false });
  for (const w of v.warnings) console.warn('WARN:', w);
  if (v.ok) {
    if (!skipMergePrep) {
      dequeueTopic(index);
      appendPublished({
        slug: topic.slug,
        published_at: localDateString(),
        title: topic.title,
        target_keyword: topic.target_keyword,
      });
      const finalFm = matter(readFileSync(gen.filePath, 'utf8')).data;
      archiveCompletedFrontmatter(topic.slug, finalFm);
    }
    return { published: true, articlePath: gen.filePath, frontmatter: gen.frontmatter };
  }

  for (const e of v.errors) console.error('ERR:', e);
  // 14 §A2 — DO NOT REMOVE. A rejected draft left on disk poisons the
  // originality corpus (every future article is scored against text that was
  // never good enough to publish) and build-blog renders it.
  safeUnlink(gen.filePath);
  return { published: false, errors: v.errors };
}

async function runSelfHealingPublish({ forceSlug, skipMergePrep }) {
  let published = false;
  let articlePath;
  let frontmatter;

  for (let t = 0; t < MAX_TOPICS_PER_RUN && !published; t++) {
    const picked = pickTopic({ forceSlug: forceSlug || undefined });
    if (!picked) {
      console.error('Topic queue is empty.');
      break;
    }
    const { topic, index } = picked;
    console.log('Selected topic:', topic.slug);

    let lastErrors = [];
    let quarantined = false;

    for (let attempt = 0; attempt <= MAX_REGEN_PER_TOPIC; attempt++) {
      let result;
      try {
        result = await publishValidatedTopic(topic, index, skipMergePrep);
      } catch (e) {
        if (isConfigError(e)) throw e;
        lastErrors = [e instanceof Error ? e.message : String(e)];
        console.error('ERR:', lastErrors[0]);
        console.warn(
          `Transient failure on ${topic.slug}, attempt ${attempt + 1}/${MAX_REGEN_PER_TOPIC + 1}`,
        );
        continue;
      }

      if (result.published) {
        articlePath = result.articlePath;
        frontmatter = result.frontmatter;
        published = true;
        break;
      }

      lastErrors = result.errors;
      const kind = classifyFailure(result.errors);
      if (kind === 'PERMANENT') {
        if (!skipMergePrep) {
          quarantineTopic(topic, result.errors.join('; '));
        }
        console.warn(`Quarantined ${topic.slug} (permanent): ${result.errors.join('; ')}`);
        quarantined = true;
        break;
      }

      console.warn(
        `Transient failure on ${topic.slug}, attempt ${attempt + 1}/${MAX_REGEN_PER_TOPIC + 1}`,
      );
    }

    if (!published && !quarantined && lastErrors.length) {
      const reason = `Transient failures exhausted: ${lastErrors.join('; ')}`;
      if (!skipMergePrep) {
        quarantineTopic(topic, reason);
      }
      console.warn(`Quarantined ${topic.slug} (${reason})`);
    }

    if (forceSlug) break;
  }

  return { published, articlePath, frontmatter };
}

async function main() {
  const { dryRun, skipMergePrep } = parseArgs();
  const forceSlug = (process.env.FORCE_SLUG || '').trim();

  if (process.env.GITHUB_ACTIONS === 'true' && !dryRun && !forceSlug) {
    if (alreadyPublishedToday()) {
      console.log(`Already published today (${cfg.location.timezone}). Skipping.`);
      process.exit(0);
    }
    // R7 — the once-per-day guard reads published.yaml on main, which only
    // updates ON MERGE. While merges were stalled, the reference build's guard
    // never tripped and every run opened ANOTHER PR. This second guard is what
    // stops the pile-up. It FAILS OPEN: a GitHub API hiccup must not block
    // publishing (that would trade a pile-up for an outage).
    if (process.env.OPEN_AUTO_ARTICLE_PR === 'true') {
      console.log('An auto-article PR is already open. Skipping (R7 dedup guard).');
      process.exit(0);
    }
  }

  let articlePath;
  let frontmatter;

  if (dryRun) {
    console.log('Dry run: using fixture article (no API).');
    articlePath = await runDryRunFixture();
    const v = await validateArticleFile(articlePath, { skipSimilarity: true });
    for (const w of v.warnings) console.warn('WARN:', w);
    if (!v.ok) {
      for (const e of v.errors) console.error('ERR:', e);
      process.exit(1);
    }
    const parsed = matter(readFileSync(articlePath, 'utf8'));
    frontmatter = parsed.data;
  } else {
    const result = await runSelfHealingPublish({ forceSlug, skipMergePrep });
    if (!result.published) {
      console.error('No topic could be published this run.');
      process.exit(1);
    }
    articlePath = result.articlePath;
    frontmatter = result.frontmatter;
  }

  await buildBlog();

  const wc = matter(readFileSync(articlePath, 'utf8')).content.split(/\s+/).filter(Boolean).length;
  appendGithubEnv({
    ARTICLE_TITLE: frontmatter.title || '',
    ARTICLE_SLUG: frontmatter.slug || '',
    ARTICLE_KEYWORD: frontmatter.target_keyword || '',
    ARTICLE_BUCKET: frontmatter.bucket || '',
    ARTICLE_WORDS: String(wc),
  });

  console.log('Done:', articlePath);
}

main().catch((e) => {
  // R15 — a config error is an environment problem. Say so loudly, and make it
  // unmistakable in the log that NOTHING was quarantined.
  if (isConfigError(e)) {
    console.error('\nCONFIG ERROR — hard stop. No topic was quarantined.\n');
    console.error(e.message);
    process.exit(2);
  }
  console.error(e);
  process.exit(1);
});

export { runSelfHealingPublish, classifyFailure, publishValidatedTopic };

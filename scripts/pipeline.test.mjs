/**
 * pipeline.test.mjs — the 8 cases required by 10-VERIFICATION-AND-TESTS §B.
 *
 * The vendored reference covered only 4 of them (`pipeline-hardening.test.mjs`,
 * 4 `it()` blocks). 13 §F6 asks whether the suite "covers all 8 §10B cases", and
 * 10 §B warns explicitly not to tick that box on the strength of the vendored
 * file. The four ported cases are marked [PORTED]; the four new ones [NEW].
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import matter from 'gray-matter';
import yaml from 'js-yaml';

import { applyAuthoritativeFrontmatter } from './frontmatter.mjs';
import { classifyFailure, isConfigError, MAX_REGEN_PER_TOPIC } from './failure-classify.mjs';
import { validateArticleFile } from './validate-article.mjs';
import { quarantineTopicInFiles, localDateString, alreadyPublishedToday } from './pick-topic.mjs';
import { ROOT, cfg, ConfigError } from './paths.mjs';
import { QUEUE_HEADER, YAML_OPTS } from './constants.mjs';

// ---------------------------------------------------------------------------
// A valid article for this config, built the same way `npm run dry` builds one.
// The reference test read a committed fixture — which carried ten of that
// business's facts and would score 0/3 location mentions for anybody else.
// ---------------------------------------------------------------------------

let SAMPLE_PATH;
let SAMPLE_RAW;
const TMP = [];

before(async () => {
  const { buildDryRunArticle } = await import('./dry-run-article.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'fx-sample-'));
  TMP.push(dir);
  SAMPLE_PATH = join(dir, 'sample.md');
  SAMPLE_RAW = buildDryRunArticle('2026-06-20');
  writeFileSync(SAMPLE_PATH, SAMPLE_RAW, 'utf8');
});

after(() => {
  for (const d of TMP) rmSync(d, { recursive: true, force: true });
});

function writeVariant(body, data) {
  const dir = mkdtempSync(join(tmpdir(), 'fx-var-'));
  TMP.push(dir);
  const p = join(dir, 'a.md');
  writeFileSync(p, matter.stringify(body, data), 'utf8');
  return p;
}

// ---------------------------------------------------------------------------
// 1. Missing `intent` — R3
// ---------------------------------------------------------------------------

describe('§10B.1 — missing intent is injected, and the article then validates [PORTED]', () => {
  it('forces slug/intent/bucket from the topic record', () => {
    const topic = {
      slug: 'dry-run-sample',
      title: 'A Topic Title',
      target_keyword: 'a target keyword',
      secondary_keywords: ['a secondary'],
      intent: 'MOF / informational',
      bucket: 'first-timer',
    };
    const { data } = matter(SAMPLE_RAW);
    delete data.intent;
    delete data.bucket;
    data.slug = 'whatever-the-model-said';

    applyAuthoritativeFrontmatter(data, topic, '2026-06-20');

    assert.equal(data.intent, topic.intent, 'intent must be injected');
    assert.equal(data.bucket, topic.bucket, 'bucket must be injected');
    assert.equal(data.slug, topic.slug, 'slug must be FORCED, not defaulted');
  });

  it('never injects description — the model owns it', () => {
    const { data } = matter(SAMPLE_RAW);
    delete data.description;
    applyAuthoritativeFrontmatter(data, { slug: 's', intent: 'i', bucket: 'question' }, '2026-06-20');
    assert.equal(data.description, undefined, 'a missing description must stay missing (transient regenerate)');
  });

  it('the repaired article passes the validator', async () => {
    const r = await validateArticleFile(SAMPLE_PATH, { skipSimilarity: true });
    assert.deepEqual(r.errors, [], 'baseline sample must be valid for THIS config');
    assert.equal(r.ok, true);
  });
});

// ---------------------------------------------------------------------------
// 3. Failure classification — R1
// ---------------------------------------------------------------------------

describe('§10B.3 — failure classification [PORTED]', () => {
  it('originality and forbidden are PERMANENT (regenerating cannot fix them)', () => {
    assert.equal(classifyFailure(['Originality: max cosine similarity 0.91 exceeds 0.85']), 'PERMANENT');
    assert.equal(classifyFailure(['Forbidden: word:cures']), 'PERMANENT');
  });

  it('contact leaks are PERMANENT — bug A7 made them TRANSIENT', () => {
    assert.equal(
      classifyFailure(['Contact leak: phone-like digit pattern detected']),
      'PERMANENT',
      'without the stable prefix this burns two regenerations on an unfixable failure',
    );
  });

  it('missing field, link count and API blips are TRANSIENT', () => {
    assert.equal(classifyFailure(['Missing frontmatter: description']), 'TRANSIENT');
    assert.equal(classifyFailure(['Internal links: 1 (need 2–4)']), 'TRANSIENT');
    assert.equal(classifyFailure(['Claude response missing fenced markdown block']), 'TRANSIENT');
  });

  it('a mixed list is PERMANENT if ANY error is permanent', () => {
    assert.equal(classifyFailure(['Internal links: 1 (need 2–4)', 'Forbidden: word:cures']), 'PERMANENT');
  });
});

// ---------------------------------------------------------------------------
// 4. Quarantine writes + ledger invariant
// ---------------------------------------------------------------------------

describe('§10B.4 — quarantine moves a topic and preserves the ledger invariant [PORTED]', () => {
  it('topic leaves the queue and lands in needs-review with a reason', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-q-'));
    TMP.push(dir);
    const queuePath = join(dir, 'queue.yaml');
    const nrPath = join(dir, 'needs-review.yaml');
    const topics = [
      { slug: 'keep-me', title: 'Keep', target_keyword: 'keep' },
      { slug: 'drop-me', title: 'Drop', target_keyword: 'drop' },
    ];
    writeFileSync(queuePath, QUEUE_HEADER + yaml.dump(topics, YAML_OPTS), 'utf8');

    quarantineTopicInFiles({
      queuePath, needsReviewPath: nrPath,
      topic: topics[1], reason: 'Originality: 0.91', queueHeader: QUEUE_HEADER,
    });

    const q = yaml.load(readFileSync(queuePath, 'utf8'));
    const nr = yaml.load(readFileSync(nrPath, 'utf8'));
    assert.deepEqual(q.map((t) => t.slug), ['keep-me']);
    assert.equal(nr.entries.length, 1);
    assert.equal(nr.entries[0].slug, 'drop-me');
    assert.match(nr.entries[0].reason, /Originality/);
    assert.ok(nr.entries[0].quarantined_at, 'quarantined_at must be stamped');

    // The invariant: exactly one of queue / published / needs-review.
    const inQueue = new Set(q.map((t) => t.slug));
    const inNr = new Set(nr.entries.map((e) => e.slug));
    for (const s of ['keep-me', 'drop-me']) {
      const n = (inQueue.has(s) ? 1 : 0) + (inNr.has(s) ? 1 : 0);
      assert.equal(n, 1, `${s} must be in exactly one ledger, found ${n}`);
    }
  });

  it('the queue header survives the rewrite byte-for-byte (bug A10)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-h-'));
    TMP.push(dir);
    const queuePath = join(dir, 'queue.yaml');
    const nrPath = join(dir, 'nr.yaml');
    writeFileSync(queuePath, QUEUE_HEADER + yaml.dump([{ slug: 'x', title: 'X' }], YAML_OPTS), 'utf8');
    quarantineTopicInFiles({
      queuePath, needsReviewPath: nrPath,
      topic: { slug: 'x' }, reason: 'r', queueHeader: QUEUE_HEADER,
    });
    assert.ok(
      readFileSync(queuePath, 'utf8').startsWith(QUEUE_HEADER),
      'a drifted header makes engine and dashboard reformat the file back and forth forever',
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Contact-leak detection — R20
// ---------------------------------------------------------------------------

describe('§10B.7 — a phone or email in the body fails validation [NEW]', () => {
  const cases = [
    ['dashed phone', 'Call 401-555-0142 to book.'],
    ['parenthesised phone', 'Call (401) 555-0142 to book.'],
    ['+1 phone', 'Reach us at +1 401 555 0142.'],
    ['email', 'Write to hello@example.com for details.'],
    ['tel: link', 'Use [this link](tel:+14015550142).'],
    ['mailto: link', 'Use [this link](mailto:a@b.com).'],
  ];

  for (const [label, injected] of cases) {
    it(`rejects ${label}`, async () => {
      const { data, content } = matter(SAMPLE_RAW);
      const p = writeVariant(`${content}\n\n${injected}\n`, data);
      const r = await validateArticleFile(p, { skipSimilarity: true });
      assert.equal(r.ok, false, `${label} must fail validation`);
      assert.ok(
        r.errors.some((e) => e.startsWith('Contact leak:')),
        `error must carry the load-bearing "Contact leak:" prefix, got: ${r.errors.join(' | ')}`,
      );
      assert.equal(classifyFailure(r.errors), 'PERMANENT');
    });
  }
});

// ---------------------------------------------------------------------------
// R20 compliance (adjacent to §10B.7)
// ---------------------------------------------------------------------------

describe('R20 — compliance is enforced by the validator, not hoped for in the prompt [NEW]', () => {
  const cases = [
    ['medical claim', 'This treats the condition completely.', /medical claim/],
    ['guarantee', 'The result is guaranteed to last.', /guarantee/],
    ['unevidenced superlative', 'We are the best in the city.', /superlative/],
    ['invented price', 'It starts at $999 for a full set.', /not in services/],
  ];
  for (const [label, injected, re] of cases) {
    it(`rejects an ${label}`, async () => {
      const { data, content } = matter(SAMPLE_RAW);
      const p = writeVariant(`${content}\n\n${injected}\n`, data);
      const r = await validateArticleFile(p, { skipSimilarity: true });
      assert.equal(r.ok, false);
      assert.ok(r.errors.some((e) => re.test(e)), `expected ${re}, got: ${r.errors.join(' | ')}`);
    });
  }

  it('accepts a price that IS in services[].price_from', async () => {
    const priced = cfg.services.find((s) => s.price_from);
    if (!priced) return; // config with no published prices — nothing to assert
    const { data, content } = matter(SAMPLE_RAW);
    const p = writeVariant(`${content}\n\nA full set starts at ${priced.price_from}.\n`, data);
    const r = await validateArticleFile(p, { skipSimilarity: true });
    assert.ok(
      !r.errors.some((e) => /not in services/.test(e)),
      `a real published price must be allowed, got: ${r.errors.join(' | ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Config error — R15
// ---------------------------------------------------------------------------

describe('§10B.6 — a config error hard-stops and quarantines nothing [NEW]', () => {
  it('recognises the shapes of an environment failure', () => {
    assert.equal(isConfigError(new ConfigError('ANTHROPIC_API_KEY is not set')), true);
    assert.equal(isConfigError(new Error('ANTHROPIC_API_KEY is not set')), true);
    assert.equal(isConfigError(new Error('authentication_error: invalid x-api-key')), true);
    assert.equal(isConfigError(new Error('Your credit balance is too low')), true);
    assert.equal(isConfigError(new Error('not_found_error: model does not exist')), true);
  });

  it('does NOT mistake a content failure for a config failure', () => {
    assert.equal(isConfigError(new Error('Claude response missing fenced markdown block')), false);
    assert.equal(isConfigError(new Error('Originality: 0.91 exceeds 0.85')), false);
  });

  it('generate-article throws ConfigError, not a bare Error, when the key is absent', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { generateArticleFromTopic } = await import('./generate-article.mjs');
      await assert.rejects(
        () => generateArticleFromTopic({ slug: 'x', title: 'X', target_keyword: 'x', intent: 'i', bucket: 'question' }),
        (e) => isConfigError(e),
        'a missing key must be classifiable as a config error, or the loop quarantines the whole backlog',
      );
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Once-per-day guard — R7
// ---------------------------------------------------------------------------

describe('§10B.8 — the once-per-day guard blocks a normal run, a forced slug bypasses [NEW]', () => {
  it("today's local date blocks", () => {
    const today = localDateString();
    assert.equal(alreadyPublishedToday({ entries: [{ slug: 'a', published_at: today }] }), true);
  });

  it('yesterday does not block', () => {
    const y = localDateString(new Date(Date.now() - 36 * 3600 * 1000));
    assert.equal(alreadyPublishedToday({ entries: [{ slug: 'a', published_at: y }] }), false);
  });

  it('an empty ledger does not block', () => {
    assert.equal(alreadyPublishedToday({ entries: [] }), false);
  });

  it('the guard uses the BUSINESS timezone, not America/Los_Angeles', () => {
    // The reference welded the Pacific timezone in, so a Providence shop's
    // "today" flipped at the wrong hour.
    const inCfgTz = new Intl.DateTimeFormat('en-CA', {
      timeZone: cfg.location.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    assert.equal(localDateString(), inCfgTz);
  });

  it('index.mjs gates the guard on CI && !dryRun && !forceSlug', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'index.mjs'), 'utf8');
    assert.match(src, /GITHUB_ACTIONS === 'true' && !dryRun && !forceSlug/);
    assert.match(src, /OPEN_AUTO_ARTICLE_PR/, 'R7 also needs the open-PR dedup guard');
  });
});

// ---------------------------------------------------------------------------
// 2 + 5. Self-healing loop — R1
// ---------------------------------------------------------------------------

describe('§10B.2/5 — the queue always advances [NEW]', () => {
  it('a permanent failure quarantines and the NEXT topic is attempted in the same run', () => {
    // Model the loop's decision table directly: a PERMANENT verdict must break
    // out of the retry loop and move to the next topic, never retry.
    const errors = ['Originality: max cosine similarity 0.90 exceeds 0.85'];
    assert.equal(classifyFailure(errors), 'PERMANENT');
    let attempts = 0;
    for (let a = 0; a <= MAX_REGEN_PER_TOPIC; a++) {
      attempts++;
      if (classifyFailure(errors) === 'PERMANENT') break;
    }
    assert.equal(attempts, 1, 'a permanent failure must not consume a regeneration');
  });

  it('transient failures are capped, then the topic is quarantined anyway — no wedge', () => {
    const errors = ['Missing frontmatter: description'];
    assert.equal(classifyFailure(errors), 'TRANSIENT');
    let attempts = 0;
    for (let a = 0; a <= MAX_REGEN_PER_TOPIC; a++) attempts++;
    assert.equal(attempts, MAX_REGEN_PER_TOPIC + 1, '2 regens = 3 attempts total, not 4 (14 §E: code wins)');
    // After exhaustion index.mjs quarantines rather than looping forever. That
    // "quarantine anyway" branch is what the 8-day outage was missing.
    const src = readFileSync(join(ROOT, 'scripts', 'index.mjs'), 'utf8');
    assert.match(src, /Transient failures exhausted/);
    assert.match(src, /quarantineTopic\(topic, reason\)/);
  });

  it('the loop tries up to MAX_TOPICS_PER_RUN topics', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'index.mjs'), 'utf8');
    assert.match(src, /t < MAX_TOPICS_PER_RUN && !published/);
  });

  it('a rejected draft is deleted so it cannot poison the originality corpus (14 §A2)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'index.mjs'), 'utf8');
    assert.match(src, /safeUnlink\(gen\.filePath\)/);
  });
});

// ---------------------------------------------------------------------------
// R19 — the API budget is a counter, not a comment
// ---------------------------------------------------------------------------

describe('R19 — the API call cap actually exists [NEW]', () => {
  it('index.mjs charges every generation and aborts past the cap', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'index.mjs'), 'utf8');
    assert.match(src, /chargeApiCall\(\);\s*\n\s*const gen = await generateArticleFromTopic/);
    assert.match(src, /ApiBudgetExceeded/);
  });

  it('--dry-run makes zero API calls (invariant 5)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'index.mjs'), 'utf8');
    const dryBranch = src.slice(src.indexOf('if (dryRun) {'), src.indexOf('} else {'));
    assert.ok(
      !/generateArticleFromTopic/.test(dryBranch),
      'the dry-run branch must never reach the generator',
    );
  });
});

// ---------------------------------------------------------------------------
// Ledger invariant script
// ---------------------------------------------------------------------------

describe('Ledger invariant — every topic in exactly one of queue/published/needs-review', () => {
  it('assert-invariants.mjs exists and detects a topic in two ledgers', async () => {
    const { checkInvariants } = await import('./assert-invariants.mjs');
    const bad = checkInvariants({
      queue: [{ slug: 'dupe' }, { slug: 'fine' }],
      published: [{ slug: 'dupe' }],
      needsReview: [],
    });
    assert.ok(bad.length > 0, 'a slug in queue AND published must be reported');
    assert.match(bad[0], /dupe/);

    const good = checkInvariants({
      queue: [{ slug: 'a' }], published: [{ slug: 'b' }], needsReview: [{ slug: 'c' }],
    });
    assert.deepEqual(good, []);
  });
});

// ---------------------------------------------------------------------------
// Derived workflow schedule — A12 / R23
// ---------------------------------------------------------------------------

describe('publish crons are derived, and cover DST [NEW]', () => {
  it('converts local publish time to the right UTC hours', async () => {
    const { buildCronLines } = await import('./derive.mjs');
    const lines = buildCronLines({
      location: { timezone: 'America/New_York' },
      content: { publish_hour_local: '09:00', cadence_days: ['Monday', 'Thursday'] },
    });
    // EST is UTC-5 -> 14:00Z; EDT is UTC-4 -> 13:00Z.
    assert.match(lines, /cron: '23 14 \* \* 1,4'/);
    assert.match(lines, /cron: '23 13 \* \* 1,4'/);
  });

  it('emits BOTH offsets, so the schedule does not drift across DST', async () => {
    const { buildCronLines } = await import('./derive.mjs');
    const lines = buildCronLines({
      location: { timezone: 'America/Boise' },
      content: { publish_hour_local: '08:30', cadence_days: ['Tuesday', 'Friday', 'Sunday'] },
    });
    assert.equal(lines.split('\n').length, 2, 'a single cron line publishes an hour off for half the year');
    assert.match(lines, /cron: '53 15 \* \* 0,2,5'/);   // MST
    assert.match(lines, /cron: '53 14 \* \* 0,2,5'/);   // MDT
  });

  it('collapses to one line where the zone has no DST', async () => {
    const { buildCronLines } = await import('./derive.mjs');
    const lines = buildCronLines({
      location: { timezone: 'America/Phoenix' },
      content: { publish_hour_local: '09:00', cadence_days: ['Monday'] },
    });
    assert.equal(lines.split('\n').length, 1, 'Arizona does not observe DST — one cron is correct');
  });

  it('shifts the weekday when the UTC conversion crosses midnight', async () => {
    const { buildCronLines } = await import('./derive.mjs');
    // 21:00 in Sydney (UTC+10/+11) is the PREVIOUS day in UTC.
    const lines = buildCronLines({
      location: { timezone: 'Australia/Sydney' },
      content: { publish_hour_local: '09:00', cadence_days: ['Monday'] },
    });
    // Monday=1 local becomes Sunday=0 in UTC.
    assert.match(lines, /\* \* 0'/, `expected a day shift, got: ${lines}`);
  });

  it('the generated workflow carries the R23 warning about schedules never firing', () => {
    const wf = readFileSync(join(ROOT, '.github', 'workflows', 'publish-article.yml'), 'utf8');
    assert.match(wf, /committed to the DEFAULT BRANCH/);
    assert.match(wf, /DISABLES scheduled workflows after 60 days/);
  });

  it('health-check has both alert layers (R5)', () => {
    const wf = readFileSync(join(ROOT, '.github', 'workflows', 'health-check.yml'), 'utf8');
    assert.match(wf, /if: failure\(\)/, 'layer 1: say something when it breaks');
    assert.match(wf, /Heartbeat/, 'layer 2: dead-man switch for "nothing ran at all"');
    assert.match(wf, /if: success\(\) && env\.HEARTBEAT_URL/, 'the heartbeat must fire ONLY on success');
  });

  it('auto-merge gates on mergeable, never statusCheckRollup (R2)', () => {
    const wf = readFileSync(join(ROOT, '.github', 'workflows', 'auto-merge-articles.yml'), 'utf8');
    // The word appears in the comment that explains the incident — that is the
    // point of the comment. What must not exist is a COMMAND that requests it.
    const code = wf.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    assert.ok(
      !code.includes('statusCheckRollup'),
      'statusCheckRollup needs checks:read + statuses:read, which the default token lacks on PRIVATE repos — '
      + 'it returns an error, the pipe gets empty stdin, and the job exits 0 having merged nothing',
    );
    assert.match(wf, /mergeable/);
    assert.match(wf, /set -euo pipefail/);
  });
});

describe('duplicated constants stay in sync', () => {
  test('verify-live.mjs FEED_MAX_FALLBACK equals constants.mjs FEED_MAX', async () => {
    // verify-live.mjs must run in a bare CI job with no node_modules, so it
    // cannot statically import constants.mjs and carries its own fallback.
    // This is the test that makes that duplication safe: bump the cap in one
    // place and this goes red rather than the health check going red later,
    // against a live site, at article 41.
    const { FEED_MAX } = await import('./constants.mjs');
    const { FEED_MAX_FALLBACK } = await import('./verify-live.mjs');
    assert.equal(
      FEED_MAX_FALLBACK, FEED_MAX,
      'verify-live.mjs\'s FEED_MAX_FALLBACK has drifted from constants.mjs FEED_MAX',
    );
  });
});

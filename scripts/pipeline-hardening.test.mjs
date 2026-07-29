import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { applyAuthoritativeFrontmatter } from './frontmatter.mjs';
import { classifyFailure } from './failure-classify.mjs';
import { validateArticleFile } from './validate-article.mjs';
import { quarantineTopicInFiles } from './pick-topic.mjs';
import { ROOT } from './paths.mjs';

const FIXTURE = join(ROOT, 'scripts/fixtures/dry-run-sample.md');

describe('Change 1 — authoritative frontmatter', () => {
  it('injects intent from topic when model omits it', async () => {
    const topic = {
      slug: 'dry-run-sample',
      title: 'Dry Run Sample Title',
      target_keyword: 'first time male brazilian wax what to expect',
      secondary_keywords: ['nervous first brazilian wax male'],
      intent: 'MOF / informational',
      bucket: 'first-timer',
    };
    const raw = readFileSync(FIXTURE, 'utf8');
    const { data, content } = matter(raw);
    delete data.intent;
    delete data.bucket;

    applyAuthoritativeFrontmatter(data, topic, '2026-06-20');
    assert.equal(data.intent, topic.intent);
    assert.equal(data.bucket, topic.bucket);
    assert.equal(data.slug, topic.slug);

    const tmpDir = mkdtempSync(join(tmpdir(), 'ifm-fm-'));
    const mdPath = join(tmpDir, 'article.md');
    writeFileSync(mdPath, matter.stringify(content.trim(), data), 'utf8');

    const v = await validateArticleFile(mdPath, { skipSimilarity: true });
    assert.equal(v.ok, true, v.errors.join('; '));
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('Change 2 — failure classification and quarantine', () => {
  it('classifies originality and forbidden as permanent', () => {
    assert.equal(classifyFailure(['Originality: max cosine 0.99']), 'PERMANENT');
    assert.equal(classifyFailure(['Forbidden: phrase:best ever']), 'PERMANENT');
    assert.equal(classifyFailure(['Missing frontmatter: intent']), 'TRANSIENT');
  });

  it('quarantines a topic and advances the queue', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifm-q-'));
    const queuePath = join(dir, 'queue.yaml');
    const reviewPath = join(dir, 'needs-review.yaml');
    const topics = [
      { slug: 'bad-duplicate', title: 'Bad', target_keyword: 'kw1' },
      { slug: 'good-next', title: 'Good', target_keyword: 'kw2' },
    ];
    writeFileSync(queuePath, yaml.dump(topics), 'utf8');
    writeFileSync(reviewPath, 'entries: []\n', 'utf8');

    quarantineTopicInFiles({
      queuePath,
      needsReviewPath: reviewPath,
      topic: topics[0],
      reason: 'Originality: max cosine similarity 0.990 exceeds 0.85',
    });

    const remaining = yaml.load(readFileSync(queuePath, 'utf8'));
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].slug, 'good-next');

    const review = yaml.load(readFileSync(reviewPath, 'utf8'));
    assert.equal(review.entries.length, 1);
    assert.equal(review.entries[0].slug, 'bad-duplicate');

    rmSync(dir, { recursive: true, force: true });
  });

  it('attempts the next topic after a permanent failure', () => {
    const queue = [
      { slug: 'bad-duplicate', title: 'Bad' },
      { slug: 'good-next', title: 'Good' },
    ];
    const actions = [];

    for (let t = 0; t < 3; t++) {
      if (!queue.length) break;
      const topic = queue[0];
      const errors =
        topic.slug === 'bad-duplicate'
          ? ['Originality: max cosine similarity 0.990 exceeds 0.85']
          : [];

      if (errors.length && classifyFailure(errors) === 'PERMANENT') {
        actions.push({ action: 'quarantine', slug: topic.slug });
        queue.shift();
        continue;
      }

      if (!errors.length) {
        actions.push({ action: 'publish', slug: topic.slug });
        break;
      }
    }

    assert.deepEqual(actions, [
      { action: 'quarantine', slug: 'bad-duplicate' },
      { action: 'publish', slug: 'good-next' },
    ]);
  });
});

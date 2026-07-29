import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { ROOT } from './paths.mjs';

const CACHE_PATH = join(ROOT, 'content/articles/_embeddings.json');
const ARTICLES_DIR = join(ROOT, 'content/articles');

let pipePromise;

async function getPipe() {
  if (!pipePromise) {
    const { pipeline } = await import('@xenova/transformers');
    pipePromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipePromise;
}

function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function saveEmbeddingCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function topicSignatureText(title, targetKeyword) {
  return `${String(title || '').trim()}\n${String(targetKeyword || '').trim()}`;
}

async function cachedEmbed(cache, key, text) {
  let vec = cache[key];
  if (!vec) {
    vec = await embedText(text);
    cache[key] = vec;
  }
  return vec;
}

/**
 * Max cosine similarity for title+keyword vs article corpus and queue topics.
 * @returns {Promise<{ max: number, matchSlug: string | null }>}
 */
export async function maxSimilarityForTopic(title, targetKeyword, options = {}) {
  const { queueTopics = [], excludeSlug } = options;
  const sig = topicSignatureText(title, targetKeyword);
  const cache = loadCache();
  const vecNew = await cachedEmbed(cache, `topic-sig:${excludeSlug || sig}`, sig);

  let max = 0;
  let matchSlug = null;

  for (const file of articleFiles()) {
    const raw = readFileSync(join(ARTICLES_DIR, file), 'utf8');
    const { data } = matter(raw);
    const slug = data.slug || file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
    if (slug === excludeSlug) continue;
    const otherSig = topicSignatureText(data.title, data.target_keyword);
    const vec = await cachedEmbed(cache, `topic-sig:${slug}`, otherSig);
    const sim = dot(vecNew, vec);
    if (sim > max) {
      max = sim;
      matchSlug = slug;
    }
  }

  for (const t of queueTopics) {
    if (t.slug === excludeSlug) continue;
    const otherSig = topicSignatureText(t.title, t.target_keyword);
    const vec = await cachedEmbed(cache, `topic-sig:q:${t.slug}`, otherSig);
    const sim = dot(vecNew, vec);
    if (sim > max) {
      max = sim;
      matchSlug = t.slug;
    }
  }

  saveEmbeddingCache(cache);
  return { max, matchSlug };
}

/** @returns {Promise<string|null>} slug of near-duplicate match, or null if OK */
export async function findNearDuplicateTopic(topic, options = {}) {
  const threshold = options.threshold ?? 0.8;
  const { max, matchSlug } = await maxSimilarityForTopic(topic.title, topic.target_keyword, options);
  if (max > threshold) return matchSlug;
  return null;
}

async function embedText(text) {
  const pipe = await getPipe();
  const out = await pipe(String(text).slice(0, 8000), { pooling: 'mean', normalize: true });
  if (out?.data != null) return Array.from(out.data);
  if (ArrayBuffer.isView(out)) return Array.from(out);
  return Array.from(out);
}

function articleFiles() {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
}

/**
 * Max cosine similarity vs other articles (by slug). Updates cache for current slug.
 * @returns {Promise<number>} 0 if no prior articles to compare.
 */
export async function maxSimilarityToCorpus(bodyText, currentSlug) {
  const others = [];
  for (const file of articleFiles()) {
    const raw = readFileSync(join(ARTICLES_DIR, file), 'utf8');
    const { data, content } = matter(raw);
    const slug = data.slug || file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
    if (slug === currentSlug) continue;
    others.push({ slug, body: content });
  }
  if (others.length === 0) return 0;

  const cache = loadCache();
  let vecNew = cache[currentSlug];
  if (!vecNew) {
    vecNew = await embedText(bodyText);
    cache[currentSlug] = vecNew;
  }

  let max = 0;
  for (const o of others) {
    let vec = cache[o.slug];
    if (!vec) {
      vec = await embedText(o.body);
      cache[o.slug] = vec;
    }
    const sim = dot(vecNew, vec);
    if (sim > max) max = sim;
  }
  saveEmbeddingCache(cache);
  return max;
}

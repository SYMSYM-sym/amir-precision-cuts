import type { TopicBucket } from '@/types/topic';
import { AUTHOR_ID } from './generated-constants';

/**
 * Everything a second copy of would drift.
 *
 * BUG A10: `QUEUE_YAML_HEADER` was written out here AND in pick-topic.mjs. They
 * drifted, so every dashboard save reformatted queue.yaml one way and every
 * engine publish reformatted it back — an infinite churn in git with no
 * functional change to show for it.
 *
 * BUG A11: `BUCKETS` was an 11-entry hand-maintained list while the config
 * declared 8. `validateTopic` checked against THIS list, so the dashboard
 * silently rejected valid topics and silently accepted buckets the engine had
 * never heard of ('demographic', 'commercial').
 *
 * BUG A12: the publish cadence was hardcoded in fmt.ts.
 *
 * Same disease, one cure: `npm run derive --only=dashboard` generates
 * ./generated-constants.ts from business.config.yaml, and everything here
 * re-exports it. The dashboard cannot hold a second opinion about the business.
 */
export {
  BUCKETS,
  INTENTS as INTENT_PRESETS,
  SERVICE_KEYS,
  PAGE_KEYS,
  QUEUE_HEADER,
  QUEUE_HEADER as QUEUE_YAML_HEADER,
  CADENCE_DAYS,
  PUBLISH_HOUR_LOCAL,
  TIMEZONE,
  LIVE_URL,
  BUSINESS_NAME,
} from './generated-constants';

export type { TopicBucket };

// --- repo paths (structure, not business facts) -----------------------------
export const QUEUE_PATH = 'content/topics/queue.yaml';
export const NEEDS_REVIEW_PATH = 'content/topics/needs-review.yaml';
export const PUBLISHED_PATH = 'content/topics/published.yaml';
export const VOICE_PATH = 'content/brand/voice.md';
export const FORBIDDEN_PATH = 'content/brand/forbidden.yaml';
export const INTERNAL_LINKS_PATH = 'content/brand/internal-links.yaml';
export const EMBEDDINGS_PATH = 'content/articles/_embeddings.json';

/**
 * The author file is named after business.author_id. The reference hardcoded
 * `content/authors/ifm-team.yaml`, so a cloned dashboard read a file that did
 * not exist for its own business — and the byline editor showed an error nobody
 * could explain. §02.2b: this is a .yaml, so the fact-grep does not catch it.
 */
export const AUTHORS_PATH = `content/authors/${AUTHOR_ID}.yaml`;

/**
 * R3 — the model never owns data we already have.
 *
 * Incident: the model intermittently omitted `intent`, the validator hard-failed
 * on a missing field, and runs died on an otherwise-fine topic. The fix is not a
 * better prompt; it is to stop asking. slug/intent/bucket are FORCED from the
 * topic record. title/target_keyword/date/author/secondary_keywords are
 * DEFAULTED (the model may improve them). `description` is never injected — the
 * model authors it, and a missing one is a transient regenerate.
 */
import { cfg } from './paths.mjs';

export function applyAuthoritativeFrontmatter(data, topic, isoDate) {
  // FORCED — overwrite whatever the model said.
  data.slug = topic.slug;
  data.intent = topic.intent;
  data.bucket = topic.bucket;

  // DEFAULTED — keep the model's version if it supplied one.
  data.title = data.title || topic.title;
  data.target_keyword = data.target_keyword || topic.target_keyword;
  data.date = data.date || isoDate;
  data.author = data.author || cfg.business.author_id;

  if (!Array.isArray(data.secondary_keywords) || data.secondary_keywords.length === 0) {
    data.secondary_keywords = topic.secondary_keywords || [];
  }
  return data;
}

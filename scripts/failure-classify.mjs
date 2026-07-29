/**
 * R1 — classify a validation failure so the queue can always advance.
 *
 * PERMANENT means regenerating cannot fix it: the topic is a near-duplicate of
 * something already published (Originality), it used a banned term (Forbidden),
 * or it leaked contact details (Contact leak). Quarantine and move on.
 * Everything else is TRANSIENT: regenerate the same topic, up to the cap.
 *
 * BUG A7 (fixed here): contact-leak errors had no stable prefix in the
 * reference, so they fell through to TRANSIENT and the engine regenerated twice
 * before quarantining — three API calls burned on a failure mode that a
 * different sample was never going to fix. `validate-article.mjs` now emits the
 * `Contact leak:` prefix and this regex treats it as PERMANENT.
 *
 * The prefixes are LOAD-BEARING (14 §D). Change a string in the validator
 * without changing it here and permanent failures silently become transient.
 */
import { ConfigError } from './paths.mjs';

export { MAX_TOPICS_PER_RUN, MAX_REGEN_PER_TOPIC, MAX_API_CALLS_PER_RUN } from './constants.mjs';

export const PERMANENT_PREFIXES = ['Originality:', 'Forbidden:', 'Contact leak:'];

const PERMANENT_RE = new RegExp(
  PERMANENT_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

export function classifyFailure(errors) {
  return PERMANENT_RE.test(errors.join(' | ')) ? 'PERMANENT' : 'TRANSIENT';
}

/**
 * R15 — environment problems hard-stop; they never quarantine. Quarantining
 * topics because an API key is missing would silently burn the whole backlog.
 */
export function isConfigError(err) {
  if (err instanceof ConfigError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /ANTHROPIC_API_KEY is not set|not_found_error|model .* (?:does not exist|is retired)|credit balance is too low|authentication_error/i.test(msg);
}

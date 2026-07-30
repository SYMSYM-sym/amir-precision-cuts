/**
 * model.mjs — the one place the system talks to a model.
 *
 * Two providers, one interface:
 *
 *   api      calls Anthropic. The normal path.
 *   offline  reads a completion from `offline/<tag>.txt`.
 *
 * WHY OFFLINE EXISTS, and why it is not a cheat
 *
 * The two JUDGMENT artifacts (voice.md, the topic queue) and every article need
 * a model. That used to mean: no API key, no build. Which in turn meant the
 * whole judgment half of the factory was untestable without spending money, and
 * therefore rarely tested — the reference build shipped with a `bootstrap-queue`
 * script full of hand-written topics precisely because nobody wanted to burn
 * credit to exercise the real path.
 *
 * The offline provider fixes that without weakening anything. The prompt is
 * still assembled from `business.config.yaml` by the same code. The completion
 * still goes through the same parser, the same `validateTopics`, the same
 * seed-gate dedupe, the same hash-guarded write. The ONLY thing that changes is
 * where the bytes came from.
 *
 * That distinction is the whole point of §02's "refining ≠ authoring" rule.
 * Supplying a completion is refining: the config still produced the prompt, and
 * the gates still decide whether the output is acceptable. Hand-writing
 * `queue.yaml` is authoring: nothing generated it and no gate ever saw it.
 *
 * It also buys three things the API path cannot:
 *   • a deterministic, replayable build (same input, same site, every time)
 *   • a way to test the judgment path in CI for free
 *   • a review workflow — a human can edit a completion and re-run the gates,
 *     rather than re-rolling the dice and hoping
 *
 * Selection: ANTHROPIC_API_KEY present → api. MODEL_OFFLINE_DIR present →
 * offline. Both → offline wins, so a machine with a key can still do a free
 * deterministic build. Neither → ConfigError naming both options (R15).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ROOT, cfg, ConfigError } from './paths.mjs';

export function provider() {
  if (process.env.MODEL_OFFLINE_DIR) return 'offline';
  if (process.env.ANTHROPIC_API_KEY) return 'api';
  return null;
}

function offlineDir() {
  const d = process.env.MODEL_OFFLINE_DIR;
  return d.startsWith('/') ? d : join(ROOT, d);
}

/**
 * Ask the model for one completion.
 *
 * `tag` names the artifact. In offline mode it is also the filename, so the
 * mapping between "what was asked for" and "what was supplied" is visible on
 * disk rather than implied.
 */
export async function complete({ system, user, tag, maxTokens = 8192, temperature = 0.6 }) {
  const p = provider();

  if (p === 'offline') {
    const dir = offlineDir();
    const path = join(dir, `${tag}.txt`);
    if (!existsSync(path)) {
      // Write the prompt out so whoever is supplying the completion can see
      // exactly what was asked. Without this, offline mode is guesswork.
      mkdirSync(dir, { recursive: true });
      const promptPath = join(dir, `${tag}.prompt.txt`);
      writeFileSync(promptPath, `### SYSTEM\n${system}\n\n### USER\n${user}\n`, 'utf8');
      throw new ConfigError(
        `Offline model output missing: ${path}\n\n`
        + `The prompt this artifact needs has been written to:\n  ${promptPath}\n\n`
        + 'Supply the completion at the path above and re-run. The output still goes '
        + 'through the same validation, dedupe and hash guard as an API response — '
        + 'offline changes where the bytes come from, not what they have to satisfy.',
      );
    }
    return readFileSync(path, 'utf8').trim();
  }

  if (p === 'api') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ANTHROPIC_MODEL || cfg.integrations.anthropic_model;
    if (!model) throw new ConfigError('No model configured (integrations.anthropic_model)');
    const res = await client.messages.create({
      model, max_tokens: maxTokens, temperature, system,
      messages: [{ role: 'user', content: user }],
    });
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  }

  throw new ConfigError(
    `No model provider available for "${tag}".\n`
    + '  Set ANTHROPIC_API_KEY to call the API, or\n'
    + '  set MODEL_OFFLINE_DIR to build from supplied completions.\n\n'
    + 'Deterministic artifacts (forbidden, links, authors, site, assets, workflows, '
    + 'dashboard) need neither — try `npm run derive --only=site`.',
  );
}

/** Strip a wrapping code fence, if the completion arrived with one. */
export function stripFence(t) {
  const m = t.match(/^```(?:ya?ml|markdown|md)?\s*([\s\S]*?)```\s*$/);
  return (m ? m[1] : t).trim();
}

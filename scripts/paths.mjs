/**
 * paths.mjs — repo paths + THE single source of business truth.
 *
 * CONTRACTS.md requires this module to export `ROOT` and `cfg`.
 * `cfg` is the parsed, validated `business.config.yaml`. Nothing else in this
 * repo may contain a business fact (14-PORTING-NOTES.md §C).
 *
 * The loader is deliberately strict: a missing or placeholder value must fail
 * at import time with a message naming the key, not silently render an empty
 * <span> or — far worse — fall back to another business's data (bug A4).
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import yaml from 'js-yaml';
import { validateConfig, buildDerived, ConfigError } from './config-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root (parent of /scripts). */
export const ROOT = join(__dirname, '..');

export function contentPath(...segments) {
  return join(ROOT, 'content', ...segments);
}

export function sitePath(...segments) {
  return join(ROOT, 'site', ...segments);
}

export function templatePath(...segments) {
  return join(ROOT, 'templates', ...segments);
}

/** Thrown for environment/config problems. R15: these hard-stop, never quarantine. */
export { ConfigError } from './config-schema.mjs';

export {
  validateConfig, buildDerived, LAYOUT_VARIANTS, SCHEMA_TYPES, DAYS, BOOKING_MODELS,
} from './config-schema.mjs';

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export const CONFIG_PATH = process.env.BUSINESS_CONFIG
  ? (process.env.BUSINESS_CONFIG.startsWith('/')
    ? process.env.BUSINESS_CONFIG
    : join(ROOT, process.env.BUSINESS_CONFIG))
  : join(ROOT, 'business.config.yaml');

export function loadConfig(path = CONFIG_PATH, opts = {}) {
  if (!existsSync(path)) {
    throw new ConfigError(
      `business.config.yaml not found at ${path}.\n` +
        'Copy 01-INTAKE-business.config.yaml to the repo root and fill it in. ' +
        'It is the only input this system has.',
    );
  }
  let parsed;
  try {
    parsed = yaml.load(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new ConfigError(`business.config.yaml is not valid YAML: ${e.message}`);
  }
  validateConfig(parsed, opts);
  parsed.derived = buildDerived(parsed);
  return parsed;
}

/**
 * Stable hash of a config slice — used by derive's hand-edit guard (§02) so a
 * regenerated artifact can tell "the config changed" from "a human edited me".
 */
export function configHash(slice) {
  return createHash('sha256').update(JSON.stringify(slice)).digest('hex').slice(0, 16);
}

export const cfg = loadConfig();
export default cfg;

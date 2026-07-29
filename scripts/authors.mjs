/**
 * authors.mjs — the byline record.
 *
 * 02-DERIVE-BRAIN.md §2b calls the reference author file "four business facts in
 * a trench coat", and notes the trap: it is a `.yaml`, so the fact-grep that
 * everyone scopes to .mjs/.ts/.html/.css sails straight past it. An underived
 * copy puts the REFERENCE business's bio on every one of business #2's
 * articles, and the audit passes clean.
 */
import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';
import { contentPath, cfg } from './paths.mjs';

export function authorPath(id = cfg.business.author_id) {
  return contentPath('authors', `${id}.yaml`);
}

export function readAuthor(id = cfg.business.author_id) {
  const p = authorPath(id);
  if (!existsSync(p)) {
    throw new Error(
      `Author record not found: ${p}\n` +
        'It is a derived artifact — run `npm run derive --only=authors`. ' +
        'Do not hand-write it (§02.2b).',
    );
  }
  const doc = yaml.load(readFileSync(p, 'utf8'));
  if (!doc || !doc.name) throw new Error(`Author record ${p} has no name`);
  return doc;
}

/** Deterministic: pure function of config. §02.2b. */
export function buildAuthor(c = cfg) {
  const b = c.business;
  return {
    slug: b.author_id,
    name: `The ${b.short_name} Team`,
    short_bio:
      `${b.positioning} ${b.practitioner_name} has ${b.years_experience} years of ` +
      `practitioner experience in ${c.location.address_city}, ${c.location.address_region}.`,
    url: c.derived.author_url,
    image: null,
  };
}

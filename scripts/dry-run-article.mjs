/**
 * dry-run-article.mjs — renders the dry-run sample article from config.
 *
 * Extracted from index.mjs so the test suite can build a valid article for
 * WHICHEVER business owns the config, instead of reading a committed fixture
 * that carried the reference business's city, practitioner and services.
 * That fixture was a weld the porting notes never listed: `npm run dry` wrote
 * it into content/articles/, where build-blog rendered it and it joined the
 * originality corpus every future article is scored against.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT, cfg } from './paths.mjs';
import { render } from './render-templates.mjs';
import yaml from 'js-yaml';

export function buildDryRunArticle(isoDate) {
  const anchors = cfg.location.location_anchors;
  const links = yaml.load(readFileSync(join(ROOT, 'content/brand/internal-links.yaml'), 'utf8'));
  const anchorFor = (kind, key) => {
    const def = (links[kind] || {})[key];
    if (!def) throw new Error(`internal-links.yaml has no ${kind}.${key} — run \`npm run derive --only=links\``);
    return `[${def.variants[0]}](${def.href})`;
  };
  const firstService = cfg.services[0];

  return render(readFileSync(join(ROOT, 'templates/dry-run-sample.md'), 'utf8'), {
    ...cfg,
    DRY_DATE: isoDate,
    DRY_TITLE: `What to Expect at a ${cfg.business.type} in ${cfg.location.address_city}`,
    DRY_KEYWORD: `${cfg.business.type} ${cfg.location.address_city} what to expect`,
    DRY_DESC:
      `What happens at a first ${cfg.business.type} appointment in ${cfg.location.address_city} `
      + '— how the visit is structured, what to bring, and what to ask before you book.',
    DRY_FAQ: cfg.homepage.faq.slice(0, cfg.content.faq_questions),
    ANCHOR_1: anchors[0],
    ANCHOR_2: anchors[1],
    ANCHOR_3: anchors[2] || anchors[0],
    SERVICE_ANCHOR: anchorFor('services', firstService.key),
    AFTERCARE_ANCHOR: anchorFor('pages', 'aftercare'),
    VISIT_ANCHOR: anchorFor('pages', 'visit'),
  }, { name: 'dry-run-sample' });
}

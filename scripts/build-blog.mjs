import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { parseMd as matter } from './md.mjs';
import { marked } from 'marked';
import { render, loadPartial } from './render-templates.mjs';
import { ROOT, cfg, contentPath } from './paths.mjs';
import { readAuthor } from './authors.mjs';
import { isDarkTheme } from './layout-variants.mjs';
import { fontsHref } from './derive-site.mjs';

const ARTICLES_DIR = join(ROOT, 'content/articles');
/**
 * DEPLOY LAYOUT: site/ is the deployable root (vercel.json outputDirectory).
 *
 * The reference wrote blog pages, the sitemap and the feeds to the REPO root
 * while index.html and styles.css lived under site/ and were referenced as
 * /assets/styles.css. Those two facts cannot both be true at deploy time --
 * one of them 404s. Everything the browser can reach is under site/ now, so
 * the paths in the markup and the paths on disk agree.
 */
const BLOG_DIR = join(ROOT, 'site', 'blog');
const OUT = join(ROOT, 'site');
const TEMPLATES = join(ROOT, 'templates');
const SITE = cfg.derived.site_url;

/**
 * BUG A1 (fixed): `writeFeeds` capped at 40 and `llms.txt` at 30, but the
 * sitemap emitted every article — so verify-live's consistency check
 * (sitemap URLs == index cards == feed items) goes PERMANENTLY RED at article
 * 41. Nobody notices until the site has been quietly failing its own health
 * check for weeks. One cap, applied to all three.
 */
const FEED_MAX = 40;

/**
 * The partials (head/nav/footer/topbar) are config-driven now, so every render
 * call needs the full config in scope — not just PAGE_TITLE/META_DESC. Passing
 * a partial variable set used to render an empty <span>; the strict renderer
 * throws instead, which is how this got caught.
 */
function baseVars(extra = {}) {
  return {
    ...cfg,
    THEME: isDarkTheme(cfg) ? 'dark' : 'light',
    FONTS_HREF: fontsHref(cfg),
    HOME_HREF: '/',
    NAV_JOURNAL_ACTIVE: true,
    ...extra,
  };
}

/**
 * BUG A6 (fixed): article dates were stamped `T12:00:00-08:00` — a fixed
 * offset, so wrong for half the year in any DST timezone, and simply wrong for
 * a business outside Pacific time. Compute the real offset for the business's
 * timezone on the article's own date.
 */
function isoAtNoonLocal(dateStr) {
  const tz = cfg.location.timezone;
  const base = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, timeZoneName: 'longOffset',
  }).formatToParts(base);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const off = name.replace('GMT', '') || '+00:00';
  return `${dateStr}T12:00:00${off === '' ? '+00:00' : off}`;
}

marked.use({
  mangle: false,
  headerIds: true,
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitMainAndFaq(body) {
  const re = /^##\s+Frequently asked\s*$/im;
  const m = body.match(re);
  if (!m || m.index === undefined) return { main: body.trim(), faq: '' };
  const idx = m.index;
  return { main: body.slice(0, idx).trim(), faq: body.slice(idx).trim() };
}

function faqMarkdownToAccordion(faqMd) {
  const lines = faqMd.split('\n');
  let i = 0;
  while (i < lines.length && !/^##\s+Frequently asked/i.test(lines[i])) i++;
  if (i < lines.length) i++;
  const blocks = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (/^\*\*.+\*\*$/.test(line)) {
      const q = line.replace(/^\*\*|\*\*$/g, '');
      i++;
      const ans = [];
      while (i < lines.length && !/^\*\*.+\*\*$/.test(lines[i].trim())) {
        if (lines[i].trim()) ans.push(lines[i].trim());
        i++;
      }
      blocks.push({ q, a: ans.join(' ') });
    } else i++;
  }
  let html = '<div class="article-faq section"><div class="container"><p class="eyebrow">FAQ</p><h2 class="h2 article-faq__title">Frequently asked</h2><div class="faq">';
  for (const { q, a } of blocks) {
    const bodyHtml = marked.parse(a || '');
    html += `<details class="faq__item"><summary><span>${escapeHtml(q)}</span><span class="faq__icon" aria-hidden="true"></span></summary><div class="faq__body">${bodyHtml}</div></details>`;
  }
  html += '</div></div></div>';
  return { html, blocks };
}

function parseArticles() {
  if (!existsSync(ARTICLES_DIR)) return [];
  const out = [];
  for (const f of readdirSync(ARTICLES_DIR)) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const raw = readFileSync(join(ARTICLES_DIR, f), 'utf8');
    const { data, content } = matter(raw);
    const slug = data.slug;
    if (!slug) continue;
    const { main, faq } = splitMainAndFaq(content.trim());
    out.push({
      file: f,
      slug,
      data,
      mainMd: main,
      faqMd: faq,
      rawBody: content.trim(),
    });
  }
  out.sort((a, b) => String(b.data.date || '').localeCompare(String(a.data.date || '')));
  return out;
}

function excerpt(md, max = 220) {
  const text = md.replace(/^#+\s.*/gm, '').replace(/\[(.*?)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function relatedArticles(all, current) {
  const scores = all
    .filter((a) => a.slug !== current.slug)
    .map((a) => {
      let s = 0;
      if (a.data.bucket === current.data.bucket) s += 3;
      const sec = current.data.secondary_keywords || [];
      const body = `${a.mainMd} ${a.data.target_keyword || ''}`.toLowerCase();
      for (const k of sec) {
        if (body.includes(String(k).toLowerCase())) s += 2;
      }
      return { a, s };
    });
  scores.sort((x, y) => y.s - x.s);
  return scores.slice(0, 3).map((x) => x.a);
}

function articleJsonLd(article, faqBlocks, url, author) {
  const d = article.data;
  const pub = d.date ? isoAtNoonLocal(d.date) : undefined;
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: d.title,
    datePublished: pub,
    dateModified: pub,
    author: { '@type': 'Person', name: author.name, url: author.url },
    publisher: {
      '@type': 'Organization',
      name: cfg.business.name,
      url: SITE,
      // 07 §C requires publisher.logo. The reference Article schema omitted
      // logo, image and mainEntityOfPage-as-URL; all three are here now.
      logo: { '@type': 'ImageObject', url: cfg.derived.logo_url },
    },
    image: cfg.derived.og_image_url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: d.bucket || undefined,
    description: d.description,
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: cfg.site.blog_title, item: `${SITE}/blog/` },
      { '@type': 'ListItem', position: 3, name: d.title, item: url },
    ],
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqBlocks.map((b) => ({
      '@type': 'Question',
      name: b.q,
      acceptedAnswer: { '@type': 'Answer', text: b.a },
    })),
  };
  return [articleLd, breadcrumb, faqLd];
}

function buildRelatedHtml(related) {
  if (!related.length) return '';
  let h =
    `<section class="section section--dark continue-reading"><div class="container"><p class="eyebrow">Continue reading</p><h2 class="h2">More from <span class="accent">${escapeHtml(cfg.site.blog_title)}</span></h2><div class="continue-reading__grid">`;
  for (const a of related) {
    const url = `/blog/${a.slug}`;
    h += `<article class="continue-reading__card"><a href="${url}"><h3 class="h3">${escapeHtml(a.data.title)}</h3><p class="muted">${escapeHtml(excerpt(a.mainMd, 140))}</p></a></article>`;
  }
  h += '</div></div></section>';
  return h;
}

async function renderArticlePage(article, all, partials) {
  const { mainMd, faqMd, data, slug } = article;
  const mainHtml = marked.parse(mainMd);
  const { html: faqHtml, blocks: faqBlocks } = faqMarkdownToAccordion(faqMd || '');
  const related = relatedArticles(all, article);
  const relatedHtml = buildRelatedHtml(related);
  const url = `${SITE}/blog/${slug}`;
  const canonical = `/blog/${slug}`;
  const reading = data.reading_time_minutes || Math.max(4, Math.round(mainMd.split(/\s+/).length / 200));
  const ogImage = `${SITE}/og.jpg`;

  const author = readAuthor(data.author);
  const jsonLd = articleJsonLd(article, faqBlocks, url, author);

  const extraHead = `
<link rel="canonical" href="${url}" />
<meta property="og:title" content="${escapeHtml(data.title)} — ${escapeHtml(cfg.business.name)}" />
<meta property="og:description" content="${escapeHtml(data.description)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${ogImage}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(data.title)}" />
<meta name="twitter:description" content="${escapeHtml(data.description)}" />
<script type="application/ld+json">${JSON.stringify(jsonLd[0])}</script>
<script type="application/ld+json">${JSON.stringify(jsonLd[1])}</script>
<script type="application/ld+json">${JSON.stringify(jsonLd[2])}</script>`;

  const headHtml = render(partials.head, baseVars({
    PAGE_TITLE: `${data.title} — ${cfg.business.name}`,
    META_DESC: data.description,
    EXTRA_HEAD: extraHead,
  }), { name: 'partial:head(article)' });

  const bucketEyebrow = data.bucket ? String(data.bucket).replace(/-/g, ' ') : cfg.site.blog_title;

  const tpl = readFileSync(join(TEMPLATES, 'article.html'), 'utf8');
  const body = render(tpl, baseVars({
    AUTHOR_NAME: author.name,
    HEAD: headHtml,
    TOPBAR: partials.topbar,
    NAV: partials.navJournal,
    BUCKET_EYEBROW: bucketEyebrow,
    TITLE: data.title,
    READING_TIME: String(reading),
    BODY_HTML: mainHtml,
    FAQ_HTML: faqHtml,
    RELATED_HTML: relatedHtml,
    FOOTER: partials.footer,
  }), { name: 'article.html' });

  const dir = join(BLOG_DIR, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), body, 'utf8');
}

async function renderBlogIndex(all, partials) {
  const cards = all
    .map((a) => {
      const bucket = escapeHtml(String(a.data.bucket || '').replace(/-/g, ' '));
      const dt = escapeHtml(String(a.data.date || ''));
      return `<article class="blog-card" data-bucket="${escapeHtml(String(a.data.bucket || ''))}">
<a class="blog-card__link" href="/blog/${a.slug}">
<span class="blog-card__meta"><time datetime="${dt}">${dt}</time><span class="blog-card__pill">${bucket}</span></span>
<h2 class="blog-card__title h3">${escapeHtml(a.data.title)}</h2>
<p class="blog-card__excerpt muted">${escapeHtml(excerpt(a.mainMd))}</p>
</a></article>`;
    })
    .join('\n');

  const buckets = [...new Set(all.map((a) => a.data.bucket).filter(Boolean))];
  const filterHtml = buckets
    .map((b) => `<button type="button" class="blog-filter__btn" data-bucket="${escapeHtml(String(b))}">${escapeHtml(String(b).replace(/-/g, ' '))}</button>`)
    .join('');

  const tpl = readFileSync(join(TEMPLATES, 'blog-index.html'), 'utf8');
  const extraHead = `
<link rel="canonical" href="${SITE}/blog/" />
<meta property="og:title" content="${escapeHtml(cfg.site.blog_title)} — ${escapeHtml(cfg.business.name)}" />
<meta property="og:description" content="${escapeHtml(cfg.site.blog_subtitle)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${SITE}/blog/" />`;

  const headHtml = render(partials.head, baseVars({
    PAGE_TITLE: `${cfg.site.blog_title} — ${cfg.business.name}`,
    META_DESC: cfg.site.blog_subtitle,
    EXTRA_HEAD: extraHead,
  }), { name: 'partial:head(index)' });

  const html = render(tpl, baseVars({
    HEAD: headHtml,
    TOPBAR: partials.topbar,
    NAV: partials.navJournal,
    FILTER_BUTTONS: filterHtml || '',
    ARTICLE_CARDS: cards,
    // Three welds lived in this one string: the blog's name, the vertical
    // ("men's grooming"), and a publish cadence that contradicted
    // content.cadence_days. All three come from config now.
    EMPTY_STATE_HTML: all.length === 0
      ? `<div class="blog-empty-state"><p><strong>${escapeHtml(cfg.site.blog_title)} is just getting started.</strong></p>`
        + `<p>New notes publish ${escapeHtml(cfg.derived.cadence_line)}.</p></div>`
      : '',
    FOOTER: partials.footer,
  }), { name: 'blog-index.html' });

  mkdirSync(BLOG_DIR, { recursive: true });
  writeFileSync(join(BLOG_DIR, 'index.html'), html, 'utf8');
}

function writeSitemap(all) {
  // BUG A6 (fixed): homepage lastmod used TODAY, so sitemap.xml churned in git on
  // every single build and told crawlers the homepage changed daily when it had
  // not. Use the newest real content date instead.
  const newest = all[0]?.data.date
    ? String(all[0].data.date).slice(0, 10)
    : homepageMtime();
  const urls = [{ loc: `${SITE}/`, lastmod: newest }];
  // BUG A1 (fixed): the sitemap used to emit EVERY article while the feeds
  // capped at 40 — so verify-live's consistency check broke permanently at 41.
  for (const a of all.slice(0, FEED_MAX)) {
    urls.push({ loc: `${SITE}/blog/${a.slug}`, lastmod: (a.data.date || '').toString().slice(0, 10) });
  }
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const u of urls) {
    xml += `<url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>\n`;
  }
  xml += '</urlset>';
  writeFileSync(join(OUT, 'sitemap.xml'), xml, 'utf8');
}

function writeFeeds(all) {
  const latest = all[0]?.data.date || homepageMtime();
  let rssItems = '';
  let jsonItems = [];
  for (const a of all.slice(0, FEED_MAX)) {
    const link = `${SITE}/blog/${a.slug}`;
    const pub = a.data.date ? isoAtNoonLocal(a.data.date) : latest;
    rssItems += `
    <item>
      <title>${escapeXml(a.data.title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${formatRssDate(pub)}</pubDate>
      <description>${escapeXml(excerpt(a.mainMd, 400))}</description>
    </item>`;
    jsonItems.push({
      id: link,
      url: link,
      title: a.data.title,
      content_text: excerpt(a.mainMd, 5000),
      date_published: pub,
    });
  }
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(cfg.site.blog_title)} — ${escapeXml(cfg.business.name)}</title>
    <link>${SITE}/blog/</link>
    <description>${escapeXml(cfg.site.blog_subtitle)}</description>
    <language>en-US</language>
    ${rssItems}
  </channel>
</rss>`;
  writeFileSync(join(OUT, 'feed.xml'), rss, 'utf8');

  const jfeed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${cfg.site.blog_title} — ${cfg.business.name}`,
    home_page_url: `${SITE}/blog/`,
    feed_url: `${SITE}/feed.json`,
    items: jsonItems,
  };
  writeFileSync(join(OUT, 'feed.json'), JSON.stringify(jfeed, null, 2), 'utf8');
}

function escapeXml(s) {
  return escapeHtml(s).replace(/'/g, '&apos;');
}

function formatRssDate(isoLike) {
  try {
    const d = new Date(isoLike);
    return d.toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}

function contactLine() {
  const bits = [];
  if (cfg.booking.url) bits.push(`Book online: ${cfg.booking.url}`);
  if (cfg.booking.publish_phone === true) bits.push(`Phone: ${cfg.booking.phone}`);
  if (cfg.booking.publish_email === true) bits.push(`Email: ${cfg.booking.email}`);
  bits.push(`Address: ${cfg.derived.address_one_line}`);
  return bits.join(' · ');
}

/** Fallback lastmod when there are no articles yet: the homepage's own mtime. */
function homepageMtime() {
  try {
    return statSync(join(ROOT, 'site', 'index.html')).mtime.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function writeLlmsTxt(all) {
  const lines = [
    `# ${cfg.business.name}`,
    '',
    `> ${cfg.business.positioning}`,
    '',
    `${cfg.business.type} in ${cfg.location.address_city}, ${cfg.location.address_region}. ` +
      `${cfg.derived.booking_line}. Hours: ${cfg.derived.hours_line}.`,
    '',
    '## Services',
    ...cfg.services.map((sv) => `- ${sv.label}${sv.price_from ? ` — from ${sv.price_from}` : ''}: ${sv.description}`),
    '',
    '## Canonical pages',
    `- ${SITE}/`,
    `- ${SITE}/blog/`,
    ...all.slice(0, FEED_MAX).map((a) => `- [${a.data.title}](${SITE}/blog/${a.slug})`),
    '',
    '## Contact',
    contactLine(),
  ];
  writeFileSync(join(OUT, 'llms.txt'), lines.join('\n'), 'utf8');
}

async function loadPartials() {
  const [head, navHome, footer, topbar] = await Promise.all([
    loadPartial(ROOT, 'head.html'),
    loadPartial(ROOT, 'nav.html'),
    loadPartial(ROOT, 'footer.html'),
    loadPartial(ROOT, 'topbar.html'),
  ]);
  // The reference did a string replaceAll on the literal '<a href="/blog/">Journal</a>'
  // to mark the active nav item — which silently stopped working the moment the
  // link text came from site.blog_title. It is a template conditional now.
  return {
    head,
    navJournal: render(navHome, baseVars(), { name: 'partial:nav' }),
    footer: render(footer, baseVars(), { name: 'partial:footer' }),
    topbar: render(topbar, baseVars(), { name: 'partial:topbar' }),
  };
}

/**
 * Remove /blog/<slug>/ directories with no corresponding article.
 *
 * build-blog only ever WROTE pages, so a slug that stopped existing kept its
 * page forever: the dry-run fixture after cleanup, a topic that was quarantined
 * after publishing, a slug corrected in frontmatter. The page stays live and
 * reachable while vanishing from the sitemap, the feeds and the index — and the
 * consistency check in verify-live.mjs cannot see it, because sitemap, cards and
 * feeds all agree with each other. The only thing that disagrees is the disk.
 */
function pruneOrphanArticleDirs(all) {
  if (!existsSync(BLOG_DIR)) return [];
  const live = new Set(all.map((a) => a.slug).filter(Boolean));
  const removed = [];
  for (const name of readdirSync(BLOG_DIR)) {
    const dir = join(BLOG_DIR, name);
    if (!statSync(dir).isDirectory()) continue;
    if (live.has(name)) continue;
    rmSync(dir, { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}

export async function buildBlog() {
  const all = parseArticles();
  const partials = await loadPartials();
  mkdirSync(BLOG_DIR, { recursive: true });
  for (const article of all) {
    await renderArticlePage(article, all, partials);
  }
  const orphans = pruneOrphanArticleDirs(all);
  if (orphans.length) console.log(`      pruned ${orphans.length} orphaned blog page(s): ${orphans.join(', ')}`);
  await renderBlogIndex(all, partials);
  writeSitemap(all);
  writeFeeds(all);
  writeLlmsTxt(all);
  // R21: robots.txt is rendered ONCE by `npm run derive --only=site`. A build
  // that clobbers it is how a production site served a 404 robots.txt for weeks.
  if (!existsSync(join(OUT, 'robots.txt'))) {
    throw new Error(
      'robots.txt is missing. build-blog.mjs must never create it (R21) — ' +
      'run `npm run derive --only=site`, which renders it from business.config.yaml.',
    );
  }
  console.log(
    `Built ${all.length} article(s) (feeds/sitemap capped at ${FEED_MAX}), blog index, sitemap, feeds, llms.txt`,
  );
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  buildBlog().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

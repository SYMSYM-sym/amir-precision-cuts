import yaml from 'js-yaml';
import { Octokit } from '@octokit/rest';
import { listBlogArticles } from '@/lib/github';
import { GH_OWNER, GH_REPO, LIVE_URL } from '@/lib/identity';

const owner = GH_OWNER;
const repo = GH_REPO;

function octo(): Octokit {
  const auth = process.env.GH_TOKEN;
  if (!auth) throw new Error('GH_TOKEN is not configured');
  return new Octokit({ auth });
}

function parseFrontmatter(md: string): Record<string, unknown> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  try {
    return (yaml.load(m[1]) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

export type ArticleSummary = {
  slug: string;
  title: string;
  date: string;
  bucket: string;
  liveUrl: string;
};

export async function listPublishedArticleSummaries(): Promise<ArticleSummary[]> {
  const dirs = await listBlogArticles();
  const oct = octo();
  const res = await oct.repos.getContent({ owner, repo, path: 'content/articles' });
  if (!Array.isArray(res.data)) return [];

  const mdFiles = res.data.filter(
    (d) => d.type === 'file' && d.name.endsWith('.md') && !d.name.startsWith('_'),
  );

  const bySlug = new Map<string, string>();
  for (const f of mdFiles) {
    const base = f.name.replace(/\.md$/, '');
    const slug = base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    bySlug.set(slug, f.name);
  }

  const out: ArticleSummary[] = [];

  for (const d of dirs) {
    const slug = d.name;
    const fname = bySlug.get(slug);
    if (!fname) {
      out.push({
        slug,
        title: slug.replace(/-/g, ' '),
        date: '',
        bucket: '',
        liveUrl: `${LIVE_URL}/blog/${slug}`,
      });
      continue;
    }
    const file = await oct.repos.getContent({ owner, repo, path: `content/articles/${fname}` });
    if (Array.isArray(file.data) || file.data.type !== 'file') continue;
    const md = Buffer.from(file.data.content, 'base64').toString('utf8');
    const fm = parseFrontmatter(md);
    out.push({
      slug,
      title: String(fm.title ?? slug),
      date: String(fm.date ?? ''),
      bucket: String(fm.bucket ?? ''),
      liveUrl: `${LIVE_URL}/blog/${slug}`,
    });
  }

  out.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

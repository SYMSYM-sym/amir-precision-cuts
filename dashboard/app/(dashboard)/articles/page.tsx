import { LIVE_URL } from '@/lib/identity';
import { listPublishedArticleSummaries } from '@/lib/articles';

export default async function ArticlesPage() {
  let articles: Awaited<ReturnType<typeof listPublishedArticleSummaries>> = [];
  let error: string | null = null;
  try {
    articles = await listPublishedArticleSummaries();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load';
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-ink">Published articles</h1>
      {error ? <p className="text-danger">{error}</p> : null}
      {!error && articles.length === 0 ? (
        <p className="font-serif italic text-ink-dim">No articles in /blog yet.</p>
      ) : null}
      <div className="space-y-3">
        {articles.map((a) => (
          <div
            key={a.slug}
            className="flex flex-col gap-2 rounded-brand border border-line bg-bg-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-serif text-lg text-ink">{a.title}</p>
              <p className="text-xs text-ink-mute">
                {a.date || '—'} · {a.bucket || '—'}
              </p>
            </div>
            <a
              href={a.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-accent px-4 py-2 text-center text-sm text-accent hover:bg-accent/10"
            >
              Open live
            </a>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-mute">
        Links use production URLs (
        <a href={`${LIVE_URL}/blog/`} className="text-accent underline" target="_blank" rel="noreferrer">
          {LIVE_URL.replace(/^https?:\/\//, '')}/blog
        </a>
        ).
      </p>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { Topic, TopicBucket } from '@/types/topic';
import { BUCKETS, INTENT_PRESETS, PAGE_KEYS, SERVICE_KEYS } from '@/lib/constants';

const emptyLink = (): { service?: string; page?: string } => ({ service: 'brazilian' });

export function TopicForm({
  initial,
  slugReadOnly,
  onSubmit,
  submitLabel,
}: {
  initial: Partial<Topic>;
  slugReadOnly?: boolean;
  onSubmit: (t: Topic) => void;
  submitLabel: string;
}) {
  const [slug, setSlug] = useState(initial.slug ?? '');
  const [title, setTitle] = useState(initial.title ?? '');
  const [target_keyword, setKw] = useState(initial.target_keyword ?? '');
  const [secondary_keywords, setSec] = useState((initial.secondary_keywords ?? []).join(', '));
  const [intent, setIntent] = useState(initial.intent ?? 'MOF / informational');
  const [bucket, setBucket] = useState<TopicBucket>((initial.bucket as TopicBucket) ?? 'first-timer');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [links, setLinks] = useState(initial.internal_links?.length ? initial.internal_links : [emptyLink()]);

  function addLink() {
    setLinks([...links, emptyLink()]);
  }
  function removeLink(i: number) {
    setLinks(links.filter((_, j) => j !== i));
  }
  function patchLink(i: number, patch: { service?: string; page?: string }) {
    const next = [...links];
    next[i] = patch;
    setLinks(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sec = secondary_keywords
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const internal_links = links.map((l) => {
      if (l.page) return { page: l.page };
      return { service: l.service ?? 'brazilian' };
    });
    onSubmit({
      slug: slug.trim(),
      title: title.trim(),
      target_keyword: target_keyword.trim(),
      secondary_keywords: sec,
      intent: intent.trim(),
      bucket,
      notes: notes.trim(),
      internal_links,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Slug</span>
        <input
          className="mt-1 w-full rounded-brand border border-line-strong bg-bg-3 px-3 py-2 text-sm text-ink"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          disabled={slugReadOnly}
          required
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Title</span>
        <input
          className="mt-1 w-full rounded-brand border border-line-strong bg-bg-3 px-3 py-2 font-serif text-lg text-ink"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Target keyword</span>
        <input
          className="mt-1 w-full rounded-brand border border-line-strong bg-bg-3 px-3 py-2 text-sm text-ink"
          value={target_keyword}
          onChange={(e) => setKw(e.target.value)}
          required
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
          Secondary keywords (comma-separated)
        </span>
        <input
          className="mt-1 w-full rounded-brand border border-line-strong bg-bg-3 px-3 py-2 text-sm text-ink"
          value={secondary_keywords}
          onChange={(e) => setSec(e.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Bucket</span>
          <select
            className="mt-1 w-full rounded-brand border border-line-strong bg-bg-3 px-3 py-2 text-sm text-ink"
            value={bucket}
            onChange={(e) => setBucket(e.target.value as TopicBucket)}
          >
            {BUCKETS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Intent</span>
          <input
            className="mt-1 w-full rounded-brand border border-line-strong bg-bg-3 px-3 py-2 text-sm text-ink"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            list="intent-presets"
          />
          <datalist id="intent-presets">
            {INTENT_PRESETS.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </label>
      </div>
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Internal links</span>
        <div className="mt-2 space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-brand border border-line-strong bg-bg-3 px-2 py-1 text-sm"
                value={l.service ? `s:${l.service}` : `p:${l.page}`}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith('s:')) patchLink(i, { service: v.slice(2) });
                  else patchLink(i, { page: v.slice(2) });
                }}
              >
                <optgroup label="Service">
                  {SERVICE_KEYS.map((s) => (
                    <option key={s} value={`s:${s}`}>
                      {s}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Page">
                  {PAGE_KEYS.map((p) => (
                    <option key={p} value={`p:${p}`}>
                      {p}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button type="button" className="text-xs text-danger" onClick={() => removeLink(i)}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="text-sm text-accent hover:underline" onClick={addLink}>
            Add link
          </button>
        </div>
      </div>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Notes</span>
        <textarea
          className="mt-1 min-h-[100px] w-full rounded-brand border border-line-strong bg-bg-3 px-3 py-2 text-sm text-ink"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className="rounded-full bg-accent px-6 py-2 text-sm font-semibold uppercase tracking-wide text-bg"
      >
        {submitLabel}
      </button>
    </form>
  );
}

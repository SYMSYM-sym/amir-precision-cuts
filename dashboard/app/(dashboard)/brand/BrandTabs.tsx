import { AUTHORS_PATH } from '@/lib/constants';
'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useToast } from '@/components/Providers';

type Tab = 'voice' | 'forbidden' | 'internal' | 'authors';

export function BrandTabs() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('voice');

  const [voiceText, setVoiceText] = useState('');
  const [voiceSha, setVoiceSha] = useState('');

  const [phrases, setPhrases] = useState('');
  const [words, setWords] = useState('');
  const [forbiddenSha, setForbiddenSha] = useState('');

  const [internalJson, setInternalJson] = useState('');
  const [internalSha, setInternalSha] = useState('');

  const [authorsYaml, setAuthorsYaml] = useState('');
  const [authorsSha, setAuthorsSha] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [v, f, i, a] = await Promise.all([
          fetch('/api/brand/voice'),
          fetch('/api/brand/forbidden'),
          fetch('/api/brand/internal-links'),
          fetch('/api/brand/authors'),
        ]);
        const [vd, fd, id, ad] = await Promise.all([v.json(), f.json(), i.json(), a.json()]);
        if (cancelled) return;
        if (v.ok) {
          setVoiceText(vd.content);
          setVoiceSha(vd.sha);
        }
        if (f.ok) {
          setPhrases((fd.phrases as string[]).join('\n'));
          setWords((fd.words as string[]).join('\n'));
          setForbiddenSha(fd.sha);
        }
        if (i.ok) {
          setInternalJson(JSON.stringify(id.doc, null, 2));
          setInternalSha(id.sha);
        }
        if (a.ok) {
          setAuthorsYaml(ad.content);
          setAuthorsSha(ad.sha);
        }
      } catch {
        if (!cancelled) toast.push('Failed to load brand files');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; toast push is stable via Providers
  }, []);

  async function saveVoice() {
    const res = await fetch('/api/brand/voice', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: voiceText, sha: voiceSha }),
    });
    if (!res.ok) {
      toast.push('Voice save failed');
      const r = await fetch('/api/brand/voice');
      const d = await r.json();
      if (r.ok) {
        setVoiceText(d.content);
        setVoiceSha(d.sha);
      }
      return;
    }
    toast.push('Voice saved');
    const r = await fetch('/api/brand/voice');
    const d = await r.json();
    if (r.ok) {
      setVoiceText(d.content);
      setVoiceSha(d.sha);
    }
  }

  async function saveForbidden() {
    const ph = phrases
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const wd = words
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch('/api/brand/forbidden', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrases: ph, words: wd, sha: forbiddenSha }),
    });
    if (!res.ok) {
      toast.push('Forbidden save failed');
      return;
    }
    toast.push('Forbidden list saved');
    const r = await fetch('/api/brand/forbidden');
    const d = await r.json();
    if (r.ok) {
      setPhrases((d.phrases as string[]).join('\n'));
      setWords((d.words as string[]).join('\n'));
      setForbiddenSha(d.sha);
    }
  }

  async function saveInternal() {
    let doc: unknown;
    try {
      doc = JSON.parse(internalJson);
    } catch {
      toast.push('Internal links JSON invalid');
      return;
    }
    const res = await fetch('/api/brand/internal-links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc, sha: internalSha }),
    });
    if (!res.ok) {
      toast.push('Internal links save failed');
      return;
    }
    toast.push('Internal links saved');
    const r = await fetch('/api/brand/internal-links');
    const d = await r.json();
    if (r.ok) {
      setInternalJson(JSON.stringify(d.doc, null, 2));
      setInternalSha(d.sha);
    }
  }

  async function saveAuthors() {
    const res = await fetch('/api/brand/authors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: authorsYaml, sha: authorsSha }),
    });
    if (!res.ok) {
      toast.push('Authors save failed');
      return;
    }
    toast.push('Authors saved');
    const r = await fetch('/api/brand/authors');
    const d = await r.json();
    if (r.ok) {
      setAuthorsYaml(d.content);
      setAuthorsSha(d.sha);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'voice', label: 'Voice' },
    { id: 'forbidden', label: 'Forbidden' },
    { id: 'internal', label: 'Internal links' },
    { id: 'authors', label: 'Authors' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-line pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === t.id ? 'bg-accent text-bg' : 'border border-line-strong text-ink-dim hover:text-ink'
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'voice' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Edit</label>
            <textarea
              className="mt-2 min-h-[420px] w-full rounded-brand border border-line-strong bg-bg-3 p-3 font-mono text-sm text-ink"
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
            />
            <button
              type="button"
              className="mt-4 rounded-full bg-accent px-6 py-2 text-sm font-semibold text-bg"
              onClick={() => void saveVoice()}
            >
              Save voice
            </button>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Preview</p>
            <div className="markdown-preview mt-2 max-h-[480px] overflow-auto rounded-brand border border-line bg-bg-2 p-4 text-sm leading-relaxed text-ink-dim">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="font-serif text-xl text-ink">{children}</h1>,
                  h2: ({ children }) => <h2 className="mt-4 font-serif text-lg text-ink">{children}</h2>,
                  li: ({ children }) => <li className="ml-4 list-disc">{children}</li>,
                  a: ({ href, children }) => (
                    <a href={href} className="text-accent underline">
                      {children}
                    </a>
                  ),
                }}
              >
                {voiceText}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'forbidden' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Phrases (one per line)</span>
            <textarea
              className="mt-2 min-h-[240px] w-full rounded-brand border border-line-strong bg-bg-3 p-3 font-mono text-sm"
              value={phrases}
              onChange={(e) => setPhrases(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Words (one per line)</span>
            <textarea
              className="mt-2 min-h-[240px] w-full rounded-brand border border-line-strong bg-bg-3 p-3 font-mono text-sm"
              value={words}
              onChange={(e) => setWords(e.target.value)}
            />
          </label>
          <div className="lg:col-span-2">
            <button
              type="button"
              className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-bg"
              onClick={() => void saveForbidden()}
            >
              Save forbidden lists
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'internal' ? (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
            internal-links.yaml as JSON (services + pages)
          </label>
          <textarea
            className="mt-2 min-h-[480px] w-full rounded-brand border border-line-strong bg-bg-3 p-3 font-mono text-sm"
            value={internalJson}
            onChange={(e) => setInternalJson(e.target.value)}
          />
          <button
            type="button"
            className="mt-4 rounded-full bg-accent px-6 py-2 text-sm font-semibold text-bg"
            onClick={() => void saveInternal()}
          >
            Save internal links
          </button>
        </div>
      ) : null}

      {tab === 'authors' ? (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{AUTHORS_PATH.split('/').pop()}</label>
          <textarea
            className="mt-2 min-h-[320px] w-full rounded-brand border border-line-strong bg-bg-3 p-3 font-mono text-sm"
            value={authorsYaml}
            onChange={(e) => setAuthorsYaml(e.target.value)}
          />
          <button
            type="button"
            className="mt-4 rounded-full bg-accent px-6 py-2 text-sm font-semibold text-bg"
            onClick={() => void saveAuthors()}
          >
            Save authors
          </button>
        </div>
      ) : null}
    </div>
  );
}

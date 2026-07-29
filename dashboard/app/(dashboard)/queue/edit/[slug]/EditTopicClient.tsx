'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopicForm } from '@/components/TopicForm';
import { useToast } from '@/components/Providers';
import type { Topic } from '@/types/topic';

export function EditTopicClient({ slug }: { slug: string }) {
  const toast = useToast();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [sha, setSha] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/queue/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Failed to load');
        return;
      }
      if (!cancelled) {
        setTopic(data.topic);
        setSha(data.queueSha);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function save(t: Topic) {
    if (!sha) return;
    const res = await fetch(`/api/queue/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: t, sha }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push(j.error?.[0] || j.error || 'Save failed');
      return;
    }
    toast.push('Saved');
    const nr = await fetch(`/api/queue/${encodeURIComponent(slug)}`);
    const nd = await nr.json();
    if (nr.ok) {
      setTopic(nd.topic);
      setSha(nd.queueSha);
    }
  }

  if (err) {
    return (
      <p className="text-danger">
        {err}{' '}
        <Link href="/queue" className="text-accent underline">
          Back to queue
        </Link>
      </p>
    );
  }

  if (!topic || !sha) {
    return <div className="h-40 animate-pulse rounded-brand bg-bg-2" />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/queue" className="text-sm text-accent hover:underline">
        Back to queue
      </Link>
      <h1 className="font-serif text-3xl text-ink">Edit topic</h1>
      <TopicForm initial={topic} slugReadOnly submitLabel="Save changes" onSubmit={(t) => void save(t)} />
    </div>
  );
}

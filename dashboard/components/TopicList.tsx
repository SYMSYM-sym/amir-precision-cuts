'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Topic } from '@/types/topic';
import { TopicForm } from '@/components/TopicForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Providers';

function SortRow({
  topic,
  onPromote,
  onDelete,
}: {
  topic: Topic;
  onPromote: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: topic.slug,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-3 rounded-brand border border-line bg-bg-2 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-1 gap-3">
        <button
          type="button"
          className="mt-1 h-10 w-8 shrink-0 cursor-grab rounded border border-line text-ink-mute"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          ::
        </button>
        <div>
          <Link href={`/queue/edit/${encodeURIComponent(topic.slug)}`} className="font-serif text-lg text-ink hover:text-accent">
            {topic.title}
          </Link>
          <p className="text-sm text-ink-dim">{topic.target_keyword}</p>
          <span className="mt-1 inline-block rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-wide text-accent">
            {topic.bucket}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink" onClick={onPromote}>
          Publish next
        </button>
        <Link
          href={`/queue/edit/${encodeURIComponent(topic.slug)}`}
          className="rounded-full border border-accent px-3 py-1 text-xs text-accent"
        >
          Edit
        </Link>
        <button type="button" className="rounded-full border border-danger/50 px-3 py-1 text-xs text-danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function TopicList({ initialQueue, initialSha }: { initialQueue: Topic[]; initialSha: string }) {
  const toast = useToast();
  const [queue, setQueue] = useState(initialQueue);
  const [sha, setSha] = useState(initialSha);
  const baselineSlugs = useRef(initialQueue.map((t) => t.slug));
  const [addOpen, setAddOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [delSlug, setDelSlug] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => queue.map((t) => t.slug), [queue]);

  async function refresh() {
    const res = await fetch('/api/queue');
    const data = await res.json();
    setQueue(data.queue);
    setSha(data.sha);
    baselineSlugs.current = data.queue.map((t: Topic) => t.slug);
    setDirty(false);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = queue.findIndex((t) => t.slug === active.id);
    const newIndex = queue.findIndex((t) => t.slug === over.id);
    setQueue(arrayMove(queue, oldIndex, newIndex));
    setDirty(true);
  }

  async function saveOrder() {
    let moved = 0;
    const base = baselineSlugs.current;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].slug !== base[i]) moved++;
    }
    const res = await fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queue,
        sha,
        message: `dashboard: reorder queue (${moved} moved)`,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push(j.error || 'Save failed');
      await refresh();
      return;
    }
    toast.push('Queue order saved');
    await refresh();
  }

  async function promote(slug: string) {
    const res = await fetch(`/api/queue/${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promote: true, sha }),
    });
    if (!res.ok) {
      toast.push('Promote failed');
      await refresh();
      return;
    }
    toast.push('Topic promoted');
    await refresh();
  }

  async function confirmDelete() {
    if (!delSlug) return;
    const res = await fetch(`/api/queue/${encodeURIComponent(delSlug)}?sha=${encodeURIComponent(sha)}`, {
      method: 'DELETE',
    });
    setDelSlug(null);
    if (!res.ok) {
      toast.push('Delete failed');
      await refresh();
      return;
    }
    toast.push('Topic removed');
    await refresh();
  }

  async function addTopic(t: Topic) {
    const next = [...queue, t];
    const res = await fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queue: next,
        sha,
        message: `dashboard: add topic "${t.slug}"`,
      }),
    });
    setAddOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push((j.details && j.details[0]) || j.error || 'Add failed');
      await refresh();
      return;
    }
    toast.push('Topic added');
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty ? (
          <button
            type="button"
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bg"
            onClick={() => void saveOrder()}
          >
            Save order
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-full border border-accent px-5 py-2 text-sm font-semibold text-accent"
          onClick={() => setAddOpen(true)}
        >
          Add topic
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {queue.map((t) => (
              <SortRow
                key={t.slug}
                topic={t}
                onPromote={() => void promote(t.slug)}
                onDelete={() => setDelSlug(t.slug)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {queue.length === 0 ? (
        <p className="font-serif italic text-ink-dim">The queue is empty. Add a topic to start.</p>
      ) : null}

      {addOpen ? (
        <div className="fixed inset-0 z-[85] overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto mt-10 max-w-lg rounded-brand border border-line bg-bg-2 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl text-accent">New topic</h2>
              <button type="button" className="text-ink-dim hover:text-ink" onClick={() => setAddOpen(false)}>
                Close
              </button>
            </div>
            <TopicForm initial={{}} submitLabel="Add to queue" onSubmit={(t) => void addTopic(t)} />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(delSlug)}
        title="Remove topic"
        body="This permanently removes the topic from queue.yaml. Undo via git history."
        danger
        confirmLabel="Delete"
        onCancel={() => setDelSlug(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

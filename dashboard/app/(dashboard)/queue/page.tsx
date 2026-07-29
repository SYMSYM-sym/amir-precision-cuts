import { TopicList } from '@/components/TopicList';
import { fetchQueueBundle } from '@/lib/data';

export default async function QueuePage() {
  const { queue, sha } = await fetchQueueBundle();

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-ink">Topic queue</h1>
      <p className="text-sm text-ink-dim">
        Drag using the handle, then save order. Promote sends a topic to publish-next without removing it from the list order until the automation runs.
      </p>
      <TopicList initialQueue={queue} initialSha={sha} />
    </div>
  );
}

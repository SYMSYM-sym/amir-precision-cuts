import { EditTopicClient } from './EditTopicClient';

export default async function EditTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EditTopicClient slug={slug} />;
}

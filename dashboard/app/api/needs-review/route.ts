import { NextResponse } from 'next/server';
import yaml from 'js-yaml';
import { getFile, putFile } from '@/lib/github';
import { NEEDS_REVIEW_PATH, QUEUE_PATH, QUEUE_HEADER } from '@/lib/constants';
import { parseQueueYaml } from '@/lib/yaml';

/**
 * /api/needs-review — the triage surface for quarantined topics.
 *
 * NEVER BUILT IN THE REFERENCE (14 §B). The self-healing loop wrote to
 * needs-review.yaml faithfully, and then nothing on earth read it. Topics that
 * failed permanently — usually because their angle was too close to something
 * already published (R13) — accumulated invisibly.
 *
 * That matters more than it sounds. R13's prescribed fix is to REWRITE THE
 * ANGLE and send the topic back through the pipeline, so the gate certifies it.
 * You cannot do that for a topic you cannot see, which leaves the tempting
 * alternative: publish around the validator. This endpoint exists so the
 * correct fix is the easy one.
 */

export const dynamic = 'force-dynamic';

type Entry = {
  slug: string;
  title?: string;
  target_keyword?: string;
  intent?: string;
  bucket?: string;
  reason?: string;
  quarantined_at?: string;
};

export async function GET() {
  try {
    const raw = await getFile(NEEDS_REVIEW_PATH);
    const doc = yaml.load(raw.content) as { entries?: Entry[] };
    const entries = doc?.entries ?? [];

    // Group by WHY, because the reason determines the fix. "Originality" means
    // rewrite the angle; "Forbidden" means a word choice; "Contact leak" means
    // the prompt let something through. Lumping them together hides that.
    const byReason: Record<string, number> = {};
    for (const e of entries) {
      const kind = /Originality:/.test(e.reason ?? '') ? 'originality'
        : /Forbidden:/.test(e.reason ?? '') ? 'forbidden'
          : /Contact leak:/.test(e.reason ?? '') ? 'contact-leak'
            : 'transient-exhausted';
      byReason[kind] = (byReason[kind] ?? 0) + 1;
    }

    return NextResponse.json({
      count: entries.length,
      byReason,
      entries: [...entries].sort((a, b) => String(b.quarantined_at ?? '').localeCompare(String(a.quarantined_at ?? ''))),
    });
  } catch {
    // No file yet is the healthy empty state, not an error.
    return NextResponse.json({ count: 0, byReason: {}, entries: [] });
  }
}

/**
 * Requeue a topic after its angle has been rewritten.
 *
 * The topic is REMOVED from needs-review and APPENDED to the queue in one
 * commit, which preserves the ledger invariant: every topic in exactly one of
 * queue / published / needs-review. Doing it as two commits leaves a window
 * where the topic is in both or neither, and R9's incident was exactly that
 * kind of window.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { slug?: string; notes?: string };
  if (!body.slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }
  if (!body.notes || body.notes.trim().length < 60) {
    // R13: a topic quarantined for originality will be quarantined again unless
    // the ANGLE changed. Requeuing it unchanged wastes a publish slot and an
    // API call to reach the same verdict.
    return NextResponse.json({
      error:
        'A rewritten `notes` angle of at least 60 characters is required. '
        + 'Requeuing a topic without changing its reason to exist produces the '
        + 'same article and the same rejection (R13).',
    }, { status: 400 });
  }

  const nrRaw = await getFile(NEEDS_REVIEW_PATH);
  const nrDoc = (yaml.load(nrRaw.content) as { entries?: Entry[] }) ?? { entries: [] };
  const entries = nrDoc.entries ?? [];
  const idx = entries.findIndex((e) => e.slug === body.slug);
  if (idx === -1) {
    return NextResponse.json({ error: `${body.slug} is not in needs-review` }, { status: 404 });
  }
  const [entry] = entries.splice(idx, 1);

  const qRaw = await getFile(QUEUE_PATH);
  const queue = parseQueueYaml(qRaw.content);
  if (queue.some((t: { slug: string }) => t.slug === entry.slug)) {
    return NextResponse.json({
      error: `${entry.slug} is already in the queue — the ledger invariant is broken. Run \`npm run invariants\`.`,
    }, { status: 409 });
  }

  // R3's principle applied to triage: intent and bucket are authoritative data
  // the quarantine record carries. If the record predates them being stored,
  // the requeue needs them supplied rather than guessed — a topic with the
  // wrong bucket fails validation on the next run for a brand-new reason.
  if (!entry.intent || !entry.bucket) {
    return NextResponse.json({
      error:
        `${entry.slug} was quarantined without an intent/bucket record, so it cannot be `
        + 'requeued safely. Add it back to content/topics/queue.yaml by hand with the '
        + 'correct intent and bucket, then delete it from needs-review.yaml.',
    }, { status: 422 });
  }

  queue.push({
    slug: entry.slug,
    title: entry.title ?? entry.slug,
    target_keyword: entry.target_keyword ?? entry.slug.replace(/-/g, ' '),
    intent: entry.intent,
    bucket: entry.bucket,
    notes: body.notes.trim(),
  } as never);

  await putFile(
    NEEDS_REVIEW_PATH,
    yaml.dump({ entries }, { lineWidth: 100, noRefs: true, quotingType: '"' }),
    `triage: requeue ${entry.slug} with a rewritten angle`,
    nrRaw.sha,
  );
  await putFile(
    QUEUE_PATH,
    QUEUE_HEADER + yaml.dump(queue, { lineWidth: 100, noRefs: true, quotingType: '"' }),
    `triage: requeue ${entry.slug} with a rewritten angle`,
    qRaw.sha,
  );

  return NextResponse.json({ ok: true, slug: entry.slug, queueLength: queue.length });
}

import { CADENCE_DAYS, PUBLISH_HOUR_LOCAL, TIMEZONE } from './generated-constants';

export function formatLocalDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export function formatDurationMs(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h % 24) parts.push(`${h % 24}h`);
  if (m % 60 && !d) parts.push(`${m % 60}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.slice(0, 3).join(' ');
}

export function formatRelativeAge(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  return `${formatDurationMs(diff)} ago`;
}

/**
 * BUG A12 (fixed): this hardcoded Mon/Thu 09:00 America/Los_Angeles. Change the
 * cadence in the config and the dashboard's "next publish" kept confidently
 * naming the old schedule — a wrong answer displayed with the same certainty as
 * a right one, which is worse than no answer.
 *
 * The cadence now comes from the same generated constants the workflow crons
 * are rendered from, so the two cannot disagree.
 */
export function nextScheduledPublish(from = Date.now()): { isoDate: string; eta: string } {
  const [wantHour, wantMinute] = PUBLISH_HOUR_LOCAL.split(':').map(Number);
  const wantDays = new Set(CADENCE_DAYS.map((d) => d.slice(0, 3)));

  for (let minutes = 1; minutes < 60 * 24 * 21; minutes++) {
    const t = from + minutes * 60 * 1000;
    const d = new Date(t);
    const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TIMEZONE }).format(d);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(d);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? -1);
    if (wantDays.has(wd) && hour === wantHour && minute === wantMinute) {
      return { isoDate: d.toISOString(), eta: formatDurationMs(t - from) };
    }
  }
  return { isoDate: '', eta: 'unknown' };
}

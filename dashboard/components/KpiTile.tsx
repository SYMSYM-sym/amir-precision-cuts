export function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-brand border border-line bg-bg-2 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-mute">{label}</p>
      <p className="mt-2 font-serif text-3xl text-accent">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-dim">{hint}</p> : null}
    </div>
  );
}

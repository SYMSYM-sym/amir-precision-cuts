'use client';

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-brand border border-line bg-bg-2 p-6 shadow-xl"
      >
        <h2 className="font-serif text-xl text-ink">{title}</h2>
        <p className="mt-3 text-sm text-ink-dim">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-full border border-line-strong px-5 py-2 text-sm font-semibold text-ink-dim hover:border-accent hover:text-accent"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`rounded-full px-5 py-2 text-sm font-semibold ${
              danger
                ? 'bg-danger text-bg hover:opacity-90'
                : 'bg-accent text-bg hover:bg-accent-soft'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

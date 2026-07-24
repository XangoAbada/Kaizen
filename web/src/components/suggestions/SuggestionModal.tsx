import { useEffect } from 'react';
import type { Suggestion } from '@kaizen/shared';

/**
 * Detail modal for a single suggestion. Presentational — the parent owns open/close and the
 * accept/reject actions. Shares the app's overlay/panel styling (see ConfirmDialog).
 */
export function SuggestionModal({
  suggestion,
  onClose,
  onAct,
}: {
  suggestion: Suggestion;
  onClose: () => void;
  onAct: (action: 'accept' | 'reject' | 'archive' | 'unarchive' | 'delete') => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const s = suggestion;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-neutral-700 bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 p-5">
          <h2 className="text-lg font-semibold leading-snug">{s.title}</h2>
          <div className="flex shrink-0 gap-1 text-xs">
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">{s.kind}</span>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">effort {s.effort}</span>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">impact {s.impact}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="whitespace-pre-wrap text-sm text-neutral-200">{s.description}</p>
          {s.rationale && (
            <>
              <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Rationale
              </h3>
              <p className="whitespace-pre-wrap text-sm italic text-neutral-400">{s.rationale}</p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 p-4">
          {s.archivedAt ? (
            <>
              <span className="mr-auto text-sm text-neutral-500">Archived</span>
              <button
                onClick={() => onAct('delete')}
                className="rounded-lg px-4 py-2 text-sm text-red-400 hover:bg-red-900/40"
              >
                Delete
              </button>
              <button
                onClick={() => onAct('unarchive')}
                className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Restore
              </button>
            </>
          ) : s.status === 'accepted' ? (
            <>
              <span className="mr-auto text-sm text-emerald-400">✓ Accepted — added to TODO</span>
              <button
                onClick={() => onAct('archive')}
                className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                🗄 Archive
              </button>
            </>
          ) : (
            <>
              {s.status === 'rejected' && (
                <>
                  <span className="mr-auto text-sm text-neutral-500">Previously rejected</span>
                  <button
                    onClick={() => onAct('delete')}
                    className="rounded-lg px-4 py-2 text-sm text-red-400 hover:bg-red-900/40"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => onAct('archive')}
                    className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    🗄 Archive
                  </button>
                </>
              )}
              {s.status === 'proposed' && (
                <button
                  onClick={() => onAct('reject')}
                  className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800"
                >
                  Reject
                </button>
              )}
              <button
                onClick={() => onAct('accept')}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
              >
                Accept → TODO
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

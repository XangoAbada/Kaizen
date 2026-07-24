import { useState } from 'react';
import { useBrowseDir } from '../api/hooks';
import { ApiError } from '../api/client';

/**
 * Modal that browses directories on the server's filesystem so the user can pick a
 * project folder without typing the absolute path by hand.
 */
export function FolderPicker({
  initialPath,
  onPick,
  onClose,
}: {
  initialPath?: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [cwd, setCwd] = useState<string | null>(initialPath?.trim() || null);
  const { data: listing, isLoading, error } = useBrowseDir(cwd);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex h-[70vh] w-full max-w-lg flex-col rounded-xl border border-neutral-700 bg-neutral-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-semibold">Choose folder</h2>

        <div className="mb-3 truncate rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-300">
          {listing?.path ?? (cwd || 'Home')}
        </div>

        {listing?.drives && listing.drives.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {listing.drives.map((d) => (
              <button
                key={d}
                onClick={() => setCwd(d)}
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-emerald-500"
              >
                {d}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-800">
          {isLoading && <p className="p-3 text-sm text-neutral-400">Loading…</p>}
          {error && (
            <p className="p-3 text-sm text-red-400">
              {error instanceof ApiError ? error.message : String(error)}
            </p>
          )}
          {listing && (
            <ul className="divide-y divide-neutral-800/60 text-sm">
              {listing.parent && (
                <li>
                  <button
                    onClick={() => setCwd(listing.parent)}
                    className="w-full px-3 py-2 text-left text-neutral-400 hover:bg-neutral-800"
                  >
                    ⬆ ..
                  </button>
                </li>
              )}
              {listing.entries.length === 0 && (
                <li className="px-3 py-2 text-neutral-600">No subfolders</li>
              )}
              {listing.entries.map((e) => (
                <li key={e.path}>
                  <button
                    onClick={() => setCwd(e.path)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-neutral-200 hover:bg-neutral-800"
                  >
                    <span className="text-neutral-500">📁</span>
                    <span className="truncate">{e.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={() => {
              if (listing?.path) {
                onPick(listing.path);
                onClose();
              }
            }}
            disabled={!listing?.path}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
}

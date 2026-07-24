import { useEffect, useState } from 'react';
import { useAppSettings, useUpdateAppSettings } from '../api/hooks';
import { ApiError } from '../api/client';

const inputCls =
  'w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500';

export function SettingsPage() {
  const { data: settings } = useAppSettings();
  const update = useUpdateAppSettings();
  const [maxConcurrentRuns, setMaxConcurrentRuns] = useState(2);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setMaxConcurrentRuns(settings.maxConcurrentRuns);
  }, [settings]);

  const save = () => {
    setError(null);
    setSaved(false);
    update.mutate(
      { maxConcurrentRuns },
      {
        onSuccess: () => setSaved(true),
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-4 text-lg font-semibold">Global settings</h2>

      <label className="mb-1 block text-sm text-neutral-400">Max concurrent runs (total)</label>
      <input
        type="number"
        min={1}
        max={50}
        value={maxConcurrentRuns}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) {
            setMaxConcurrentRuns(Math.min(50, Math.max(1, Math.round(n))));
            setSaved(false);
          }
        }}
        className={`${inputCls} mb-1`}
      />
      <p className="mb-4 text-xs text-neutral-500">
        The total number of AI runs allowed to execute at the same time across all projects. Each
        project can further cap its own share in the project's Settings tab. Changes take effect
        immediately — no restart needed.
      </p>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={update.isPending || !settings}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !update.isPending && <span className="text-sm text-emerald-400">Saved</span>}
      </div>
    </div>
  );
}

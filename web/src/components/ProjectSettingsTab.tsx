import { useState } from 'react';
import { CLAUDE_MODELS, OUTPUT_LANGUAGES, type Project, type ProjectSettings } from '@kaizen/shared';
import { useUpdateProject } from '../api/hooks';
import { ApiError } from '../api/client';

const inputCls =
  'w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500';

export function ProjectSettingsTab({ project }: { project: Project }) {
  // The whole settings object is written wholesale on save, so keep every field in local state.
  const [settings, setSettings] = useState<ProjectSettings>(project.settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProject(project.id);

  const set = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaved(false);
  };

  const save = () => {
    setError(null);
    setSaved(false);
    update.mutate(
      { settings },
      {
        onSuccess: () => setSaved(true),
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-4 text-lg font-semibold">Settings</h2>

      <label className="mb-1 block text-sm text-neutral-400">Model</label>
      <select
        value={settings.model ?? ''}
        onChange={(e) => set('model', e.target.value === '' ? null : e.target.value)}
        className={`${inputCls} mb-1`}
      >
        <option value="">Default (CLI)</option>
        {CLAUDE_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="mb-4 text-xs text-neutral-500">
        Model passed to the <code>claude</code> CLI for this project's runs. “Default (CLI)” uses the
        model from your Claude Code login.
      </p>

      <label className="mb-1 block text-sm text-neutral-400">Output language</label>
      <select
        value={settings.outputLanguage}
        onChange={(e) => set('outputLanguage', e.target.value)}
        className={`${inputCls} mb-1`}
      >
        {OUTPUT_LANGUAGES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      <p className="mb-4 text-xs text-neutral-500">
        Language the AI writes generated content in (suggestion titles/descriptions, summaries,
        review findings). Code and JSON structure stay in English.
      </p>

      <label className="mb-1 block text-sm text-neutral-400">Permission mode (implementer)</label>
      <select
        value={settings.permissionMode}
        onChange={(e) => set('permissionMode', e.target.value as ProjectSettings['permissionMode'])}
        className={`${inputCls} mb-4`}
      >
        <option value="acceptEdits">acceptEdits</option>
        <option value="bypassPermissions">bypassPermissions</option>
      </select>

      <label className="mb-1 block text-sm text-neutral-400">Max attempts (AI review retries)</label>
      <input
        type="number"
        min={1}
        max={10}
        value={settings.maxAttempts}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) set('maxAttempts', Math.min(10, Math.max(1, Math.round(n))));
        }}
        className={`${inputCls} mb-4`}
      />

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={update.isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !update.isPending && <span className="text-sm text-emerald-400">Saved</span>}
      </div>
    </div>
  );
}

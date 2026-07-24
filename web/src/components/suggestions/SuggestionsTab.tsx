import { useState } from 'react';
import type { Project, Suggestion } from '@kaizen/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useSuggestions, useQueue } from '../../api/hooks';
import { api, ApiError } from '../../api/client';
import { LiveLog } from '../task/LiveLog';
import { SuggestionModal } from './SuggestionModal';
import { ConfirmDialog } from '../ConfirmDialog';

export function SuggestionsTab({ project }: { project: Project }) {
  const { data: suggestions } = useSuggestions(project.id);
  const { data: queue } = useQueue();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'proposed' | 'accepted' | 'rejected' | 'archived'>('proposed');
  const [genOpen, setGenOpen] = useState(false);
  const [genRunId, setGenRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Suggestion | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<'accept' | 'reject' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const suggesterRunning =
    queue && [...queue.running, ...queue.queued].some((r) => r.projectId === project.id && r.role === 'suggester');
  const filtered = (suggestions ?? []).filter((s) =>
    filter === 'archived' ? !!s.archivedAt : s.status === filter && !s.archivedAt,
  );

  const act = async (s: Suggestion, action: 'accept' | 'reject' | 'archive' | 'unarchive' | 'delete') => {
    setError(null);
    try {
      if (action === 'delete') await api.delete(`/api/suggestions/${s.id}`);
      else await api.post(`/api/suggestions/${s.id}/${action}`);
      void qc.invalidateQueries({ queryKey: ['suggestions', project.id] });
      void qc.invalidateQueries({ queryKey: ['tasks', project.id] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const bulk = async (action: 'accept' | 'reject') => {
    setBulkConfirm(null);
    setBulkBusy(true);
    setError(null);
    const targets = (suggestions ?? []).filter((s) => s.status === 'proposed');
    const results = await Promise.allSettled(
      targets.map((s) => api.post(`/api/suggestions/${s.id}/${action}`)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) setError(`${failed} of ${targets.length} could not be ${action}ed.`);
    void qc.invalidateQueries({ queryKey: ['suggestions', project.id] });
    void qc.invalidateQueries({ queryKey: ['tasks', project.id] });
    setBulkBusy(false);
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1">
          {(['proposed', 'accepted', 'rejected', 'archived'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                filter === f ? 'bg-neutral-800 font-medium text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {filter === 'proposed' && filtered.length > 0 && (
            <>
              <button
                onClick={() => setBulkConfirm('reject')}
                disabled={bulkBusy}
                className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
              >
                Reject all
              </button>
              <button
                onClick={() => setBulkConfirm('accept')}
                disabled={bulkBusy}
                className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-900/40 disabled:opacity-50"
              >
                Accept all
              </button>
            </>
          )}
          <button
            onClick={() => setGenOpen(true)}
            disabled={!!suggesterRunning}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {suggesterRunning ? 'Generating…' : '✨ Generate suggestions'}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {genRunId && suggesterRunning && (
        <div className="mb-4 h-64 overflow-hidden rounded-lg">
          <LiveLog runId={genRunId} live />
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-700 p-10 text-center text-sm text-neutral-500">
          {filter === 'proposed'
            ? 'No proposed suggestions. Generate some — the knowledge base helps a lot (run Analysis first).'
            : `No ${filter} suggestions.`}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-neutral-600"
          >
            <h3 className="truncate font-medium">{s.title}</h3>
            <div className="flex shrink-0 gap-1 text-xs">
              <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">{s.kind}</span>
              <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">effort {s.effort}</span>
              <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">impact {s.impact}</span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <SuggestionModal
          suggestion={selected}
          onClose={() => setSelected(null)}
          onAct={(action) => {
            if (action === 'delete') {
              setDeleteConfirm(selected);
              setSelected(null);
              return;
            }
            void act(selected, action);
            setSelected(null);
          }}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          title="Delete suggestion?"
          message={
            <>
              This permanently deletes <span className="font-medium text-neutral-100">{deleteConfirm.title}</span> and
              cannot be undone.
            </>
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            void act(deleteConfirm, 'delete');
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {bulkConfirm && (
        <ConfirmDialog
          title={bulkConfirm === 'accept' ? 'Accept all proposals?' : 'Reject all proposals?'}
          message={
            bulkConfirm === 'accept'
              ? `This creates a TODO task for each of the ${filtered.length} proposed suggestions.`
              : `This moves all ${filtered.length} proposed suggestions to rejected. You can re-accept them later.`
          }
          confirmLabel={bulkConfirm === 'accept' ? 'Accept all' : 'Reject all'}
          danger={bulkConfirm === 'reject'}
          onConfirm={() => void bulk(bulkConfirm)}
          onCancel={() => setBulkConfirm(null)}
        />
      )}

      {genOpen && (
        <GenerateDialog
          projectId={project.id}
          onClose={() => setGenOpen(false)}
          onStarted={(runId) => {
            setGenRunId(runId);
            setGenOpen(false);
          }}
        />
      )}
    </div>
  );
}

function GenerateDialog({
  projectId,
  onClose,
  onStarted,
}: {
  projectId: string;
  onClose: () => void;
  onStarted: (runId: string) => void;
}) {
  const [useWeb, setUseWeb] = useState(false);
  const [focus, setFocus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    try {
      const res = await api.post<{ runId: string }>(`/api/projects/${projectId}/suggest`, {
        useWebResearch: useWeb,
        focus: focus.trim() || undefined,
      });
      onStarted(res.runId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Generate suggestions</h2>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useWeb} onChange={(e) => setUseWeb(e.target.checked)} />
          Research competitor apps on the web (slower, better ideas)
        </label>
        <label className="mb-1 block text-sm text-neutral-400">Focus (optional)</label>
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="e.g. onboarding UX, performance, mobile support"
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={() => void start()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

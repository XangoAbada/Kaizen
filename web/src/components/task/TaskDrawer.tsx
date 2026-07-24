import { useEffect, useState } from 'react';
import type { Project, TaskRun } from '@kaizen/shared';
import {
  useArchiveTask,
  useDeleteTask,
  useQueue,
  useReplanTask,
  useTaskDetail,
  useTransitionTask,
  useUpdateTask,
} from '../../api/hooks';
import { api, ApiError } from '../../api/client';
import { LiveLog } from './LiveLog';
import { DiffViewer } from './DiffViewer';
import { ConfirmDialog } from '../ConfirmDialog';

const ARCHIVABLE_STATUSES = ['todo', 'plan', 'done'];

const TABS = ['Details', 'Live Log', 'Diff', 'Runs'] as const;
type Tab = (typeof TABS)[number];

export function TaskDrawer({
  taskId,
  project,
  onClose,
}: {
  taskId: string;
  project: Project;
  onClose: () => void;
}) {
  const { data } = useTaskDetail(taskId);
  const { data: queue } = useQueue();
  const transition = useTransitionTask(project.id);
  const updateTask = useUpdateTask(project.id);
  const replan = useReplanTask(project.id);
  const archiveTask = useArchiveTask(project.id);
  const deleteTask = useDeleteTask(project.id);
  const [tab, setTab] = useState<Tab>('Details');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [replanOpen, setReplanOpen] = useState(false);
  const [replanText, setReplanText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState('');

  const savedPrompt = data?.task.userPrompt ?? '';
  useEffect(() => {
    setPromptDraft(savedPrompt);
  }, [taskId, savedPrompt]);

  if (!data) return null;
  const { task, runs, events } = data;

  const promptEditable = task.status !== 'done';
  const promptDirty = promptDraft !== savedPrompt;
  const savePrompt = () => {
    setError(null);
    updateTask.mutate(
      { taskId, userPrompt: promptDraft },
      { onError: (e) => setError(e instanceof ApiError ? e.message : String(e)) },
    );
  };

  const activeRun =
    queue && [...queue.running, ...queue.queued].find((r) => r.taskId === taskId);
  const latestRun: TaskRun | undefined = runs[0];

  const doTransition = (to: 'done' | 'todo' | 'plan' | 'in_progress', fb?: string) => {
    setError(null);
    transition.mutate(
      { taskId, to, feedback: fb },
      {
        onSuccess: () => onClose(),
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  const doReplan = (fb?: string) => {
    setError(null);
    replan.mutate(
      { taskId, feedback: fb },
      {
        onSuccess: () => onClose(),
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  const doArchive = () => {
    setError(null);
    archiveTask.mutate(taskId, {
      onSuccess: () => onClose(),
      onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
    });
  };

  const doDelete = () => {
    setError(null);
    deleteTask.mutate(taskId, {
      onSuccess: () => onClose(),
      onError: (e) => {
        setDeleteOpen(false);
        setError(e instanceof ApiError ? e.message : String(e));
      },
    });
  };

  const canArchiveOrDelete = !activeRun && ARCHIVABLE_STATUSES.includes(task.status);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-800 px-5 py-4">
          <div className="mb-1 flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
            <button onClick={onClose} className="rounded px-2 text-neutral-500 hover:bg-neutral-800">
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="rounded bg-neutral-800 px-2 py-0.5 uppercase">{task.status.replace('_', ' ')}</span>
            {task.attemptCount > 0 && (
              <span>
                attempt {task.attemptCount}/{task.maxAttempts}
              </span>
            )}
            {activeRun && (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                {activeRun.role} running
              </span>
            )}
          </div>
        </div>

        <nav className="flex gap-1 border-b border-neutral-800 px-5 pt-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t-lg px-3 py-1.5 text-sm ${
                tab === t ? 'bg-neutral-950 font-medium text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'Details' && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-400">
                    Instructions for AI <span className="font-normal text-neutral-600">· priority</span>
                  </h3>
                  {promptEditable && promptDirty && (
                    <button
                      onClick={savePrompt}
                      disabled={updateTask.isPending}
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {updateTask.isPending ? 'Saving…' : 'Save'}
                    </button>
                  )}
                </div>
                {promptEditable ? (
                  <textarea
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    rows={3}
                    placeholder="Extra instructions passed to the AI with top priority (e.g. constraints, preferred approach, things to avoid)…"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                ) : savedPrompt ? (
                  <p className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
                    {savedPrompt}
                  </p>
                ) : (
                  <p className="text-sm italic text-neutral-500">No instructions</p>
                )}
              </div>

              {task.description ? (
                <p className="whitespace-pre-wrap text-sm text-neutral-300">{task.description}</p>
              ) : (
                <p className="text-sm italic text-neutral-500">No description</p>
              )}

              {(task.status === 'plan' || task.plan.trim()) && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-400">
                    Implementation plan
                    {task.status === 'plan' && activeRun && (
                      <span className="ml-2 font-normal text-sky-400">· planning…</span>
                    )}
                  </h3>
                  {task.status === 'plan' && activeRun ? (
                    <div className="h-72 overflow-hidden rounded-lg border border-neutral-800">
                      <LiveLog runId={activeRun.runId} live />
                    </div>
                  ) : task.plan.trim() ? (
                    <p className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
                      {task.plan}
                    </p>
                  ) : (
                    <p className="text-sm italic text-neutral-500">No plan yet</p>
                  )}
                </div>
              )}

              {task.feedback.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-400">Feedback history</h3>
                  <div className="space-y-2">
                    {task.feedback.map((f, i) => (
                      <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm">
                        <div className="mb-1 text-xs text-neutral-500">
                          {f.source === 'user' ? '👤 user' : '🤖 AI reviewer'} · {new Date(f.createdAt).toLocaleString()}
                        </div>
                        <p className="whitespace-pre-wrap text-neutral-300">{f.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-neutral-400">Timeline</h3>
                <div className="space-y-1 text-xs text-neutral-500">
                  {events.map((e) => (
                    <div key={e.id} className="flex gap-2">
                      <span className="shrink-0 text-neutral-600">{new Date(e.createdAt).toLocaleTimeString()}</span>
                      <span>
                        {e.type === 'status_changed' && `→ ${String(e.payload.to).replace('_', ' ')}`}
                        {e.type === 'run_finished' && `run ${e.payload.role}: ${e.payload.status}`}
                        {e.type === 'reviewer_findings' && `AI review: ${e.payload.verdict}`}
                        {e.type === 'plan_ready' && `plan ready`}
                        {e.type === 'user_feedback' && `user feedback added`}
                        {e.type === 'warning' && `⚠ ${e.payload.message}`}
                        {e.type === 'error' && `✖ ${e.payload.message}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'Live Log' && <LiveLog runId={activeRun?.runId ?? latestRun?.id ?? null} live={!!activeRun} />}
          {tab === 'Diff' && <DiffViewer taskId={taskId} isGit={project.isGit} />}
          {tab === 'Runs' && (
            <div className="space-y-2">
              {runs.length === 0 && <p className="text-sm text-neutral-500">No runs yet</p>}
              {runs.map((r) => (
                <div key={r.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.role}</span>
                    <RunStatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {r.startedAt && new Date(r.startedAt).toLocaleString()}
                    {r.startedAt && r.finishedAt && (
                      <> · {Math.round((+new Date(r.finishedAt) - +new Date(r.startedAt)) / 1000)}s</>
                    )}
                    {r.numTurns != null && <> · {r.numTurns} turns</>}
                  </div>
                  {r.error && <p className="mt-1 text-xs text-red-400">{r.error}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-800 p-4">
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            {canArchiveOrDelete && (
              <>
                <button
                  onClick={doArchive}
                  disabled={archiveTask.isPending}
                  className="mr-auto rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                >
                  🗄 Archive
                </button>
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="rounded-lg px-4 py-2 text-sm text-red-400 hover:bg-red-900/40"
                >
                  Delete
                </button>
              </>
            )}
            {activeRun && (
              <button
                onClick={() => void api.post(`/api/runs/${activeRun.runId}/cancel`)}
                className="rounded-lg bg-red-900/60 px-4 py-2 text-sm text-red-300 hover:bg-red-900"
              >
                Cancel run
              </button>
            )}
            {task.status === 'todo' && !activeRun && (
              <>
                <button
                  onClick={() => doTransition('plan')}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium hover:bg-sky-600"
                >
                  🧭 Start planning
                </button>
                <button
                  onClick={() => doTransition('in_progress')}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
                >
                  ▶ Start implementation
                </button>
              </>
            )}
            {task.status === 'plan' && !activeRun && (
              <>
                <button
                  onClick={() => setReplanOpen((v) => !v)}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium hover:bg-amber-600"
                >
                  Request changes…
                </button>
                <button
                  onClick={() => doTransition('in_progress')}
                  disabled={!task.plan.trim()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                >
                  ✓ Accept plan → In Progress
                </button>
              </>
            )}
            {task.status === 'user_review' && (
              <>
                <button
                  onClick={() => setRejectOpen(true)}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium hover:bg-amber-600"
                >
                  Reject…
                </button>
                <button
                  onClick={() => doTransition('done')}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
                >
                  ✓ Approve
                </button>
              </>
            )}
          </div>

          {replanOpen && (
            <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-950 p-3">
              <textarea
                autoFocus
                value={replanText}
                onChange={(e) => setReplanText(e.target.value)}
                rows={3}
                placeholder="What should the plan do differently? (a new planning session will run)"
                className="mb-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setReplanOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    doReplan(replanText.trim() || undefined);
                    setReplanOpen(false);
                    setReplanText('');
                  }}
                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500"
                >
                  Re-plan
                </button>
              </div>
            </div>
          )}

          {rejectOpen && (
            <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-950 p-3">
              <textarea
                autoFocus
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                placeholder="What should be different?"
                className="mb-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRejectOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    doTransition('todo', feedback);
                    setRejectOpen(false);
                    setFeedback('');
                  }}
                  className="rounded-lg bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600"
                >
                  Reject → TODO
                </button>
                <button
                  onClick={() => {
                    doTransition('in_progress', feedback);
                    setRejectOpen(false);
                    setFeedback('');
                  }}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium hover:bg-amber-500"
                >
                  Reject & retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {deleteOpen && (
        <ConfirmDialog
          title="Delete task?"
          message={
            <>
              This permanently deletes <span className="font-medium text-neutral-100">{task.title}</span> and cannot be
              undone. To hide it instead, use Archive.
            </>
          }
          confirmLabel={deleteTask.isPending ? 'Deleting…' : 'Delete'}
          danger
          onConfirm={doDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}

export function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: 'bg-neutral-700 text-neutral-300',
    running: 'bg-sky-900/60 text-sky-300',
    succeeded: 'bg-emerald-900/60 text-emerald-300',
    failed: 'bg-red-900/60 text-red-300',
    canceled: 'bg-neutral-700 text-neutral-400',
    timeout: 'bg-amber-900/60 text-amber-300',
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${colors[status] ?? ''}`}>{status}</span>;
}

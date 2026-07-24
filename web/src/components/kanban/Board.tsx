import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useSearchParams } from 'react-router-dom';
import type { Project, Task, TaskStatus } from '@kaizen/shared';
import { TASK_STATUSES, userTargets } from '@kaizen/shared';
import {
  useArchivedTasks,
  useCreateTask,
  useDeleteTask,
  useQueue,
  useTasks,
  useTransitionTask,
  useUnarchiveTask,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';

const COLUMN_LABELS: Record<TaskStatus, string> = {
  todo: 'TODO',
  plan: 'Plan',
  in_progress: 'In Progress',
  ai_review: 'AI Review',
  user_review: 'User Review',
  done: 'Done',
};

export function Board({ project }: { project: Project }) {
  const { data: tasks } = useTasks(project.id);
  const transition = useTransitionTask(project.id);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<{ task: Task; to: TaskStatus } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  // Require a small drag distance before a pointer press becomes a drag, so a plain click on a card
  // still fires onClick (opens the TaskDrawer) instead of being swallowed as a drag gesture.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  };

  const doTransition = (task: Task, to: TaskStatus, feedback?: string) => {
    transition.mutate(
      { taskId: task.id, to, feedback },
      {
        onSuccess: (res) => {
          if (res.warning) showToast(`⚠ ${res.warning}`);
        },
        onError: (e) => showToast(e instanceof ApiError ? `✖ ${e.message}` : String(e)),
      },
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const task = event.active.data.current?.task as Task | undefined;
    const to = event.over?.id as TaskStatus | undefined;
    if (!task || !to || task.status === to) return;
    if (!userTargets(task.status).includes(to)) return;
    // rejecting from user_review requires a feedback prompt
    if (task.status === 'user_review' && (to === 'todo' || to === 'in_progress')) {
      setFeedbackFor({ task, to });
      return;
    }
    doTransition(task, to);
  };

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setArchivedOpen(true)}
          className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          🗄 Archived
        </button>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveTask((e.active.data.current?.task as Task) ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveTask(null)}
      >
        <div className="grid min-h-0 flex-1 grid-cols-6 gap-3">
          {TASK_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              project={project}
              tasks={(tasks ?? []).filter((t) => t.status === status)}
              draggingTask={activeTask}
            />
          ))}
        </div>
        <DragOverlay>{activeTask && <CardBody task={activeTask} dragging />}</DragOverlay>
      </DndContext>

      {feedbackFor && (
        <FeedbackModal
          to={feedbackFor.to}
          onCancel={() => setFeedbackFor(null)}
          onSubmit={(feedback) => {
            doTransition(feedbackFor.task, feedbackFor.to, feedback);
            setFeedbackFor(null);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm shadow-xl">
          {toast}
        </div>
      )}

      {archivedOpen && <ArchivedTasksModal project={project} onClose={() => setArchivedOpen(false)} />}
    </div>
  );
}

function ArchivedTasksModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { data: tasks, isLoading } = useArchivedTasks(project.id, true);
  const unarchive = useUnarchiveTask(project.id);
  const del = useDeleteTask(project.id);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-neutral-700 bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 p-5">
          <h2 className="text-lg font-semibold">Archived tasks</h2>
          <button onClick={onClose} className="rounded px-2 text-neutral-500 hover:bg-neutral-800">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (tasks ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-700 p-10 text-center text-sm text-neutral-500">
              No archived tasks.
            </div>
          ) : (
            <div className="space-y-2">
              {(tasks ?? []).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{t.title}</h3>
                    <span className="text-xs uppercase text-neutral-500">{t.status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => unarchive.mutate(t.id)}
                      disabled={unarchive.isPending}
                      className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => setDeleteTask(t)}
                      className="rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {deleteTask && (
        <ConfirmDialog
          title="Delete task?"
          message={
            <>
              This permanently deletes <span className="font-medium text-neutral-100">{deleteTask.title}</span> and
              cannot be undone.
            </>
          }
          confirmLabel={del.isPending ? 'Deleting…' : 'Delete'}
          danger
          onConfirm={() => del.mutate(deleteTask.id, { onSuccess: () => setDeleteTask(null) })}
          onCancel={() => setDeleteTask(null)}
        />
      )}
    </div>
  );
}

function Column({
  status,
  project,
  tasks,
  draggingTask,
}: {
  status: TaskStatus;
  project: Project;
  tasks: Task[];
  draggingTask: Task | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const legal = draggingTask ? userTargets(draggingTask.status).includes(status) : true;
  const dimmed = draggingTask !== null && !legal && draggingTask.status !== status;

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 flex-col rounded-xl border bg-neutral-900/60 transition ${
        isOver && legal ? 'border-emerald-500' : 'border-neutral-800'
      } ${dimmed ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {COLUMN_LABELS[status]}
        </span>
        <span className="text-xs text-neutral-600">{tasks.length}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
        {status === 'todo' && <QuickAdd projectId={project.id} />}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  const [, setSearchParams] = useSearchParams();

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) setSearchParams((p) => ({ ...Object.fromEntries(p), task: task.id }));
      }}
      className={isDragging ? 'opacity-30' : ''}
    >
      <CardBody task={task} />
    </div>
  );
}

function CardBody({ task, dragging }: { task: Task; dragging?: boolean }) {
  const { data: queue } = useQueue();
  const hasActiveRun =
    queue !== undefined &&
    [...queue.running, ...queue.queued].some((r) => r.taskId === task.id);
  const planReady = task.status === 'plan' && !hasActiveRun && task.plan.trim().length > 0;

  return (
    <div
      className={`cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-sm shadow-sm transition hover:border-neutral-500 ${
        dragging ? 'rotate-2 shadow-2xl' : ''
      }`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="leading-snug">{task.title}</span>
        {hasActiveRun && <span className="mt-0.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />}
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        {task.attemptCount > 0 && (
          <span className="rounded bg-neutral-700/60 px-1.5 py-0.5">
            attempt {task.attemptCount}/{task.maxAttempts}
          </span>
        )}
        {planReady && (
          <span className="rounded bg-sky-900/60 px-1.5 py-0.5 text-sky-300" title="Plan ready — awaiting acceptance">
            plan ready
          </span>
        )}
        {task.suggestionId && <span title="Created from suggestion">💡</span>}
        {task.feedback.length > 0 && <span title="Has feedback">🗨 {task.feedback.length}</span>}
      </div>
    </div>
  );
}

function QuickAdd({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useCreateTask(projectId);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-neutral-700 py-2 text-xs text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
      >
        + Add task
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-2">
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (title.trim()) {
              create.mutate({ title: title.trim() });
              setTitle('');
              setOpen(false);
            }
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Task title… (Enter to add)"
        rows={2}
        className="w-full resize-none rounded bg-neutral-900 px-2 py-1 text-sm outline-none"
      />
    </div>
  );
}

function FeedbackModal({
  to,
  onCancel,
  onSubmit,
}: {
  to: TaskStatus;
  onCancel: () => void;
  onSubmit: (feedback: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-lg font-semibold">Reject with feedback</h2>
        <p className="mb-3 text-sm text-neutral-400">
          {to === 'in_progress'
            ? 'The task will be re-implemented immediately with your feedback.'
            : 'The task returns to TODO with your feedback attached.'}
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="What should be different?"
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(text)}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

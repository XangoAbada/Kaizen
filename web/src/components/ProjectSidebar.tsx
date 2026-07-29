import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import type { QueuedRunInfo } from '@kaizen/shared';
import { useProjects, useQueue } from '../api/hooks';
import { AddProjectDialog } from '../pages/ProjectsPage';

type ActiveRun = QueuedRunInfo & { queued: boolean };

export function ProjectSidebar() {
  const { data: projects } = useProjects();
  const { data: queue } = useQueue();
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();

  const byProject = new Map<string, ActiveRun[]>();
  for (const r of queue?.running ?? []) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), { ...r, queued: false }]);
  for (const r of queue?.queued ?? []) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), { ...r, queued: true }]);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r border-neutral-800 bg-neutral-900/60 p-3">
      {projects?.map((p) => (
        <div key={p.id}>
          <NavLink
            to={`/projects/${p.id}`}
            className={({ isActive }) =>
              `block rounded-xl border p-3 transition ${
                isActive
                  ? 'border-emerald-600/60 bg-neutral-800'
                  : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'
              }`
            }
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{p.name}</span>
              {p.status === 'analyzing' && (
                <span className="shrink-0 rounded bg-sky-900/60 px-1.5 py-0.5 text-[10px] text-sky-300">analyzing…</span>
              )}
            </div>
            <p className="truncate text-xs text-neutral-500">{p.path}</p>
          </NavLink>
          {byProject.get(p.id)?.map((r) => (
            <button
              key={r.runId}
              onClick={() => navigate(`/projects/${p.id}?tab=Kanban`)}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-1 text-left text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  r.queued ? 'bg-neutral-600' : 'animate-pulse bg-emerald-400'
                }`}
              />
              <span className="shrink-0 capitalize">{r.role}</span>
              {r.taskTitle && <span className="truncate text-neutral-500">· {r.taskTitle}</span>}
            </button>
          ))}
        </div>
      ))}

      <button
        onClick={() => setShowAdd(true)}
        className="rounded-xl border border-dashed border-neutral-700 p-3 text-sm text-neutral-400 hover:border-emerald-600 hover:text-emerald-400"
      >
        + Add project
      </button>

      {showAdd && <AddProjectDialog onClose={() => setShowAdd(false)} />}
    </aside>
  );
}

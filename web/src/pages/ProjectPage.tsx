import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useProject } from '../api/hooks';
import { Board } from '../components/kanban/Board';
import { SuggestionsTab } from '../components/suggestions/SuggestionsTab';
import { KnowledgeBrowser } from '../components/knowledge/KnowledgeBrowser';
import { BrainstormTab } from '../components/brainstorm/BrainstormTab';
import { ActivityTab } from '../components/ActivityTab';
import { TaskDrawer } from '../components/task/TaskDrawer';
import { ProjectSettingsTab } from '../components/ProjectSettingsTab';

const TABS = ['Kanban', 'Brainstorm', 'Suggestions', 'Knowledge', 'Activity', 'Settings'] as const;
type Tab = (typeof TABS)[number];

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project } = useProject(projectId!);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.find((t) => t === searchParams.get('tab')) ?? 'Kanban';
  const [tab, setTab] = useState<Tab>(initialTab);
  const openTaskId = searchParams.get('task');

  if (!project) return <div className="p-8 text-neutral-400">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 bg-neutral-900/60 px-6 pt-4">
        <div className="mb-3 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <span className="text-sm text-neutral-500">{project.path}</span>
          {project.status === 'analyzing' && (
            <span className="rounded bg-sky-900/60 px-2 py-0.5 text-xs text-sky-300">analyzing…</span>
          )}
        </div>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t-lg px-4 py-2 text-sm ${
                tab === t
                  ? 'bg-neutral-950 font-medium text-emerald-400'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'Kanban' && <Board project={project} />}
        {tab === 'Brainstorm' && <BrainstormTab project={project} />}
        {tab === 'Suggestions' && <SuggestionsTab project={project} />}
        {tab === 'Knowledge' && <KnowledgeBrowser project={project} />}
        {tab === 'Activity' && <ActivityTab projectId={project.id} />}
        {tab === 'Settings' && <ProjectSettingsTab project={project} />}
      </div>

      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          project={project}
          onClose={() => {
            searchParams.delete('task');
            setSearchParams(searchParams);
          }}
        />
      )}
    </div>
  );
}

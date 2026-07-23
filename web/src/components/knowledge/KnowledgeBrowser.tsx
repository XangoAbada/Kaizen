import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Project } from '@kaizen/shared';
import { useKnowledge, useKnowledgeDoc, useQueue } from '../../api/hooks';
import { api, ApiError } from '../../api/client';
import { LiveLog } from '../task/LiveLog';

export function KnowledgeBrowser({ project }: { project: Project }) {
  const { data: docs } = useKnowledge(project.id);
  const { data: queue } = useQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: doc } = useKnowledgeDoc(selectedId);
  const [error, setError] = useState<string | null>(null);
  const [analyzeRunId, setAnalyzeRunId] = useState<string | null>(null);

  const analyzerActive =
    queue && [...queue.running, ...queue.queued].find((r) => r.projectId === project.id && r.role === 'analyzer');

  const startAnalysis = async (refresh: boolean) => {
    setError(null);
    if (refresh && !confirm('Refresh will re-explore the project and update knowledge files. Continue?')) return;
    try {
      const res = await api.post<{ runId: string }>(`/api/projects/${project.id}/analyze`, { refresh });
      setAnalyzeRunId(res.runId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const hasDocs = (docs?.length ?? 0) > 0;

  return (
    <div className="flex h-full">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-400">Knowledge base</h2>
          {hasDocs && (
            <button
              onClick={() => void startAnalysis(true)}
              disabled={!!analyzerActive}
              className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
              title="Re-analyze the project"
            >
              ⟳ Refresh
            </button>
          )}
        </div>
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        {!hasDocs && !analyzerActive && (
          <div className="rounded-lg border border-dashed border-neutral-700 p-4 text-center">
            <p className="mb-3 text-sm text-neutral-400">No knowledge base yet.</p>
            <button
              onClick={() => void startAnalysis(false)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
            >
              🔍 Run analysis
            </button>
          </div>
        )}
        {analyzerActive && (
          <p className="mb-2 inline-flex items-center gap-2 text-xs text-sky-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" /> analysis in progress…
          </p>
        )}
        <ul className="space-y-1">
          {docs?.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => setSelectedId(d.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  selectedId === d.id ? 'bg-neutral-800 text-emerald-400' : 'hover:bg-neutral-800/60'
                }`}
              >
                <div className="font-medium">{d.title}</div>
                {d.summary && <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{d.summary}</div>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {analyzerActive && analyzeRunId ? (
          <div className="h-full">
            <LiveLog runId={analyzeRunId} live />
          </div>
        ) : doc ? (
          <article className="prose prose-invert prose-sm max-w-3xl [&_code]:text-emerald-300">
            <ReactMarkdown>{doc.content.replace(/^---[\s\S]*?---\s*/, '')}</ReactMarkdown>
          </article>
        ) : (
          <p className="text-sm text-neutral-500">
            {hasDocs ? 'Select a document.' : 'Run analysis to build the knowledge base.'}
          </p>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useProjectRuns } from '../api/hooks';
import { RunStatusBadge } from './task/TaskDrawer';
import { LiveLog } from './task/LiveLog';

export function ActivityTab({ projectId }: { projectId: string }) {
  const { data: runs } = useProjectRuns(projectId);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-4 text-sm font-semibold text-neutral-400">Recent runs</h2>
      {(runs?.length ?? 0) === 0 && <p className="text-sm text-neutral-500">No runs yet.</p>}
      <div className="space-y-2">
        {runs?.map((r) => (
          <div key={r.id} className="rounded-lg border border-neutral-800 bg-neutral-900">
            <button
              onClick={() => setOpenRunId(openRunId === r.id ? null : r.id)}
              className="flex w-full items-center justify-between p-3 text-left text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium capitalize">{r.role}</span>
                <RunStatusBadge status={r.status} />
              </div>
              <span className="text-xs text-neutral-500">
                {r.startedAt && new Date(r.startedAt).toLocaleString()}
                {r.startedAt && r.finishedAt && (
                  <> · {Math.round((+new Date(r.finishedAt) - +new Date(r.startedAt)) / 1000)}s</>
                )}
              </span>
            </button>
            {r.error && <p className="px-3 pb-2 text-xs text-red-400">{r.error}</p>}
            {openRunId === r.id && (
              <div className="max-h-96 overflow-hidden border-t border-neutral-800 p-2">
                <LiveLog runId={r.id} live={r.status === 'running'} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

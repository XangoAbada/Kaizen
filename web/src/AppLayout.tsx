import { Link, Outlet } from 'react-router-dom';
import { useQueue } from './api/hooks';

export function AppLayout() {
  const { data: queue } = useQueue();
  const runningCount = queue?.running.length ?? 0;
  const queuedCount = queue?.queued.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-6 py-3">
        <Link to="/" className="text-lg font-semibold tracking-wide">
          <span className="text-emerald-400">改善</span> Kaizen
        </Link>
        <div className="text-sm text-neutral-400">
          {runningCount > 0 && (
            <span className="mr-3 inline-flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              {runningCount} running
            </span>
          )}
          {queuedCount > 0 && <span>{queuedCount} queued</span>}
          {runningCount === 0 && queuedCount === 0 && <span>idle</span>}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

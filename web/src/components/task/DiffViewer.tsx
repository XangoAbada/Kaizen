import { useTaskDiff } from '../../api/hooks';

export function DiffViewer({ taskId, isGit }: { taskId: string; isGit: boolean }) {
  const { data: diff, isLoading, error } = useTaskDiff(taskId, isGit);

  if (!isGit) {
    return <p className="text-sm text-amber-400">This project is not a git repository — no diff available.</p>;
  }
  if (isLoading) return <p className="text-sm text-neutral-500">Loading diff…</p>;
  if (error) return <p className="text-sm text-red-400">{String(error)}</p>;
  if (!diff?.trim()) return <p className="text-sm text-neutral-500">No changes.</p>;

  return (
    <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs leading-relaxed">
      {diff.split('\n').map((line, i) => (
        <div key={i} className={lineClass(line)}>
          {line || ' '}
        </div>
      ))}
    </pre>
  );
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-neutral-400 font-semibold';
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'text-neutral-500 mt-2';
  if (line.startsWith('@@')) return 'text-sky-400';
  if (line.startsWith('+')) return 'text-emerald-400 bg-emerald-950/40';
  if (line.startsWith('-')) return 'text-red-400 bg-red-950/30';
  return 'text-neutral-300';
}

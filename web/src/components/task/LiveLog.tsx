import { useEffect, useRef, useState } from 'react';
import type { RunOutputEntry } from '@kaizen/shared';
import { useRunLogStore } from '../../stores/runLogStore';
import { useRunTranscript } from '../../api/hooks';

export function LiveLog({ runId, live }: { runId: string | null; live: boolean }) {
  const liveEntries = useRunLogStore((s) => (runId ? s.logs[runId] : undefined));
  const { data: storedEntries } = useRunTranscript(live ? null : runId);
  const entries: RunOutputEntry[] = live ? (liveEntries ?? []) : (storedEntries ?? liveEntries ?? []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length, autoScroll]);

  if (!runId) return <p className="text-sm text-neutral-500">No run for this task yet.</p>;

  return (
    <div
      ref={containerRef}
      onScroll={() => {
        const el = containerRef.current;
        if (!el) return;
        setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
      }}
      className="h-full space-y-2 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs"
    >
      {entries.length === 0 && <p className="text-neutral-500">{live ? 'Waiting for output…' : 'No transcript.'}</p>}
      {entries.map((e, i) => (
        <LogEntry key={i} entry={e} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function LogEntry({ entry }: { entry: RunOutputEntry }) {
  switch (entry.kind) {
    case 'assistant_text':
      return <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-200">{entry.text}</p>;
    case 'tool_use':
      return <p className="text-sky-400">⚙ {entry.text}</p>;
    case 'tool_result':
      return <p className="truncate text-neutral-600">↳ {entry.text}</p>;
    case 'system':
      return <p className="text-neutral-500">· {entry.text}</p>;
    case 'result':
      return <p className="whitespace-pre-wrap border-t border-neutral-800 pt-2 text-emerald-300">{entry.text}</p>;
    case 'stderr':
      return <p className="text-red-400">{entry.text}</p>;
    default:
      return null;
  }
}

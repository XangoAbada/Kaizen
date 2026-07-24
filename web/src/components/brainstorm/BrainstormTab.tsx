import { useState } from 'react';
import type { Project } from '@kaizen/shared';
import {
  useBrainstorm,
  useSendBrainstorm,
  useGenerateBrainstormTasks,
  useQueue,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import { LiveLog } from '../task/LiveLog';

export function BrainstormTab({ project }: { project: Project }) {
  const { data: messages } = useBrainstorm(project.id);
  const { data: queue } = useQueue();
  const send = useSendBrainstorm(project.id);
  const generate = useGenerateBrainstormTasks(project.id);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  const activeRun =
    queue && [...queue.running, ...queue.queued].find((r) => r.projectId === project.id && r.role === 'brainstormer');
  const busy = !!activeRun || send.isPending;

  const hasMessages = (messages?.length ?? 0) > 0;

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    send.mutate(text, {
      onSuccess: () => setInput(''),
      onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
    });
  };

  const onGenerate = () => {
    setError(null);
    setGenerated(false);
    generate.mutate(undefined, {
      onSuccess: () => setGenerated(true),
      onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
    });
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Brainstorm</h2>
          <p className="text-sm text-neutral-500">
            Describe your idea. Each round the AI turns the conversation into a structured knowledge base (see the
            Knowledge tab).
          </p>
        </div>
        <button
          onClick={onGenerate}
          disabled={!hasMessages || generate.isPending || busy}
          className="shrink-0 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-600/10 disabled:opacity-40"
          title="Turn the current knowledge base into build tasks"
        >
          {generate.isPending ? 'Generating…' : '⚑ Generate tasks from brainstorm'}
        </button>
      </div>

      {generated && (
        <p className="mb-3 rounded-lg border border-emerald-800 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">
          Generating build tasks — they'll appear in the <span className="font-medium">Suggestions</span> tab shortly.
        </p>
      )}
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {!hasMessages && !busy && (
          <div className="rounded-xl border border-dashed border-neutral-700 p-8 text-center text-neutral-400">
            <p className="mb-1 text-lg">Nothing yet</p>
            <p className="text-sm">
              Start with a sentence or two about the app you want to build — the problem, who it's for, the core idea.
            </p>
          </div>
        )}

        {messages?.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-emerald-600/20 text-emerald-100'
                  : 'border border-neutral-800 bg-neutral-900 text-neutral-200'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {activeRun && (
          <div>
            <p className="mb-1 inline-flex items-center gap-2 text-xs text-sky-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" /> brainstorming…
            </p>
            <div className="h-72 overflow-hidden rounded-lg border border-neutral-800">
              <LiveLog runId={activeRun.runId} live />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={3}
          disabled={busy}
          placeholder={
            hasMessages ? 'Add a note, correction or new direction…' : 'e.g. A mobile-first habit tracker for busy professionals'
          }
          className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-neutral-500">⌘/Ctrl + Enter to send</span>
          <button
            onClick={submit}
            disabled={!input.trim() || busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

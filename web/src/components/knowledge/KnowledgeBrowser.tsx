import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import {
  KNOWLEDGE_FILENAMES,
  KNOWLEDGE_SECTIONS,
  type KnowledgeDoc,
  type KnowledgeSection,
  type Project,
} from '@kaizen/shared';
import { useKnowledge, useKnowledgeDoc, useQueue, useSaveKnowledgeDoc } from '../../api/hooks';
import { api, ApiError } from '../../api/client';
import { LiveLog } from '../task/LiveLog';
import { ConfirmDialog } from '../ConfirmDialog';

export function KnowledgeBrowser({ project }: { project: Project }) {
  const { data: queue } = useQueue();
  const analyzerRun =
    queue && [...queue.running, ...queue.queued].find((r) => r.projectId === project.id && r.role === 'analyzer');
  // Poll while an agent is writing, so finished sections show up mid-run instead of only at the end.
  const { data: docs } = useKnowledge(project.id, analyzerRun ? 4000 : undefined);
  const qc = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [genFor, setGenFor] = useState<string | null>(null);
  const [deleteFile, setDeleteFile] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const saveDoc = useSaveKnowledgeDoc(project.id);

  const docFor = (filename: string): KnowledgeDoc | null =>
    docs?.find((d) => d.filename === filename) ?? null;
  const selectedDoc = selectedFile ? docFor(selectedFile) : null;
  // While an agent may be rewriting the open file, keep its content fresh too — but not while editing.
  const { data: doc } = useKnowledgeDoc(selectedDoc?.id ?? null, analyzerRun && !editing ? 4000 : undefined);

  // Leave edit mode whenever a different document is opened.
  useEffect(() => {
    setEditing(false);
  }, [selectedFile]);

  // A full rebuild touches every section; a task-triggered update picks its own, so it spins nothing.
  const fullAnalysis = !!analyzerRun && analyzerRun.target === null && analyzerRun.taskId === null;
  const sectionBusy = (filename: string) => fullAnalysis || analyzerRun?.target === filename;

  const startAnalysis = async (body: { refresh?: boolean; file?: string; instruction?: string }) => {
    setError(null);
    try {
      await api.post<{ runId: string }>(`/api/projects/${project.id}/analyze`, body);
      // Don't wait for the SSE push to show the run — the spinners come from the queue query.
      void qc.invalidateQueries({ queryKey: ['queue'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const removeDoc = async (filename: string) => {
    setError(null);
    try {
      await api.delete(`/api/knowledge/project/${project.id}/${encodeURIComponent(filename)}`);
      if (selectedFile === filename) setSelectedFile(null);
      void qc.invalidateQueries({ queryKey: ['knowledge', project.id] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const startEdit = () => {
    if (!doc) return;
    setDraft(doc.content);
    setEditing(true);
  };

  const save = () => {
    if (!doc) return;
    setError(null);
    saveDoc.mutate(
      { docId: doc.meta.id, filename: doc.meta.filename, content: draft },
      {
        onSuccess: () => setEditing(false),
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  const extras = (docs ?? []).filter((d) => !KNOWLEDGE_FILENAMES.includes(d.filename));
  const genSection = KNOWLEDGE_SECTIONS.find((s) => s.filename === genFor) ?? null;
  // The log is the "nothing selected" view — a run must never block reading a finished document.
  const showLog = !!analyzerRun && !selectedFile;

  return (
    <div className="flex h-full">
      {confirmRefresh && (
        <ConfirmDialog
          title="Rebuild the whole knowledge base"
          message="This re-explores the project and rewrites every section. Continue?"
          confirmLabel="Rebuild"
          onCancel={() => setConfirmRefresh(false)}
          onConfirm={() => {
            setConfirmRefresh(false);
            void startAnalysis({ refresh: true });
          }}
        />
      )}
      {deleteFile && (
        <ConfirmDialog
          title="Delete document?"
          message={
            <>
              This permanently deletes <span className="font-medium text-neutral-100">{deleteFile}</span> from the
              knowledge base.{' '}
              {KNOWLEDGE_FILENAMES.includes(deleteFile)
                ? 'The section stays in the list and can be generated again.'
                : 'It is not one of the standard sections, so it will disappear from the list.'}
            </>
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            void removeDoc(deleteFile);
            setDeleteFile(null);
          }}
          onCancel={() => setDeleteFile(null)}
        />
      )}
      {genSection && (
        <GenerateSectionDialog
          section={genSection}
          hasContent={!!docFor(genSection.filename)}
          onClose={() => setGenFor(null)}
          onStart={(instruction) => {
            setGenFor(null);
            setSelectedFile(genSection.filename);
            void startAnalysis({ file: genSection.filename, instruction });
          }}
        />
      )}

      <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-400">Knowledge base</h2>
          <button
            onClick={() => (docs?.length ? setConfirmRefresh(true) : void startAnalysis({}))}
            disabled={!!analyzerRun}
            className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
            title="Analyze the project and write every section"
          >
            {docs?.length ? '⟳ Rebuild all' : '🔍 Analyze all'}
          </button>
        </div>
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        {analyzerRun && (
          <button
            onClick={() => setSelectedFile(null)}
            title="Show the live log"
            className={`mb-2 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-sky-300 hover:bg-neutral-800 ${
              selectedFile === null ? 'bg-neutral-800/60' : ''
            }`}
          >
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400" />
            <span className="truncate">
              {analyzerRun.target
                ? `updating ${analyzerRun.target}…`
                : analyzerRun.taskId
                  ? 'folding the finished task into the knowledge base…'
                  : 'analyzing the whole project…'}
            </span>
          </button>
        )}

        <ul className="space-y-1">
          {KNOWLEDGE_SECTIONS.map((s) => {
            const d = docFor(s.filename);
            const busy = sectionBusy(s.filename);
            return (
              <li key={s.filename} className="group relative">
                <button
                  onClick={() => setSelectedFile(s.filename)}
                  className={`w-full rounded-lg px-3 py-2 pr-16 text-left text-sm ${
                    selectedFile === s.filename ? 'bg-neutral-800 text-emerald-400' : 'hover:bg-neutral-800/60'
                  } ${d ? '' : 'text-neutral-500'}`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {busy && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400" />}
                    <span className="truncate">{d?.title || s.title}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                    {d ? d.summary || s.brief : `Not generated yet — ${s.brief}`}
                  </div>
                </button>
                <div className="absolute right-1 top-1.5 flex gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    onClick={() => setGenFor(s.filename)}
                    disabled={!!analyzerRun}
                    title={d ? 'Update this section' : 'Generate this section'}
                    className="rounded px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-30"
                  >
                    ⟳
                  </button>
                  {d && (
                    <button
                      onClick={() => setDeleteFile(s.filename)}
                      title="Delete this document"
                      className="rounded px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-700 hover:text-red-400"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {extras.length > 0 && (
          <>
            <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-600">Other files</h3>
            <ul className="space-y-1">
              {extras.map((d) => (
                <li key={d.id} className="group relative">
                  <button
                    onClick={() => setSelectedFile(d.filename)}
                    className={`w-full rounded-lg px-3 py-2 pr-9 text-left text-sm ${
                      selectedFile === d.filename ? 'bg-neutral-800 text-emerald-400' : 'hover:bg-neutral-800/60'
                    }`}
                  >
                    <div className="truncate font-medium">{d.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{d.summary || d.filename}</div>
                  </button>
                  <button
                    onClick={() => setDeleteFile(d.filename)}
                    title="Delete this document"
                    className="absolute right-1 top-1.5 rounded px-1.5 py-1 text-xs text-neutral-500 opacity-0 hover:bg-neutral-700 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {showLog ? (
          <div className="h-full">
            <LiveLog runId={analyzerRun.runId} live />
          </div>
        ) : doc ? (
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center justify-end gap-2">
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saveDoc.isPending}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {saveDoc.isPending ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setGenFor(doc.meta.filename)}
                    disabled={!!analyzerRun || !KNOWLEDGE_FILENAMES.includes(doc.meta.filename)}
                    className="rounded px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    ⟳ Update
                  </button>
                  <button
                    onClick={startEdit}
                    className="rounded px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
                  >
                    ✎ Edit
                  </button>
                  <button
                    onClick={() => setDeleteFile(doc.meta.filename)}
                    className="rounded px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-red-400"
                  >
                    🗑 Delete
                  </button>
                </>
              )}
            </div>
            {editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-[70vh] w-full resize-none rounded-lg border border-neutral-700 bg-neutral-900 p-4 font-mono text-xs text-neutral-200 outline-none focus:border-emerald-500"
              />
            ) : (
              <article className="prose prose-invert prose-sm [&_code]:text-emerald-300 prose-pre:bg-neutral-900 prose-pre:border prose-pre:border-neutral-800 prose-headings:scroll-mt-4 prose-a:text-sky-400">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {doc.content.replace(/^---[\s\S]*?---\s*/, '')}
                </ReactMarkdown>
              </article>
            )}
          </div>
        ) : selectedFile ? (
          <EmptySection
            filename={selectedFile}
            disabled={!!analyzerRun}
            onGenerate={() => setGenFor(selectedFile)}
          />
        ) : (
          <p className="text-sm text-neutral-500">Select a section.</p>
        )}
      </div>
    </div>
  );
}

function EmptySection({
  filename,
  disabled,
  onGenerate,
}: {
  filename: string;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const section = KNOWLEDGE_SECTIONS.find((s) => s.filename === filename);
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-dashed border-neutral-700 p-8 text-center">
      <h3 className="mb-1 font-medium">{section?.title ?? filename}</h3>
      <p className="mb-4 text-sm text-neutral-500">{section?.brief}</p>
      <button
        onClick={onGenerate}
        disabled={disabled}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
      >
        Generate this section
      </button>
      {disabled && <p className="mt-3 text-xs text-neutral-600">An analysis is already running for this project.</p>}
    </div>
  );
}

function GenerateSectionDialog({
  section,
  hasContent,
  onClose,
  onStart,
}: {
  section: KnowledgeSection;
  hasContent: boolean;
  onClose: () => void;
  onStart: (instruction?: string) => void;
}) {
  const [instruction, setInstruction] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold">
          {hasContent ? 'Update' : 'Generate'} — {section.title}
        </h2>
        <p className="mb-4 text-xs text-neutral-500">
          <code>{section.filename}</code> · {section.brief}
        </p>
        <p className="mb-4 text-sm text-neutral-400">
          {hasContent
            ? 'The agent re-checks this section against the code: it keeps what is still true, adds what is missing and removes what no longer holds.'
            : 'The agent explores the project and writes this section from scratch.'}
        </p>
        <label className="mb-1 block text-sm text-neutral-400">Instruction (optional)</label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          placeholder="e.g. drop the part about the old export flow, it was removed; document the new bulk actions"
          className="mb-4 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={() => onStart(instruction.trim() || undefined)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            {hasContent ? 'Update' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

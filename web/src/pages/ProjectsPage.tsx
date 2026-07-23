import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects, useCreateProject, useDeleteProject } from '../api/hooks';
import { ApiError } from '../api/client';

export function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
        >
          + Add project
        </button>
      </div>

      {isLoading && <p className="text-neutral-400">Loading…</p>}

      {projects?.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-700 p-12 text-center text-neutral-400">
          <p className="mb-2 text-lg">No projects yet</p>
          <p className="text-sm">Add a local application folder to start improving it.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {projects?.map((p) => (
          <ProjectCard key={p.id} id={p.id} />
        ))}
      </div>

      {showAdd && <AddProjectDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function ProjectCard({ id }: { id: string }) {
  const { data: projects } = useProjects();
  const del = useDeleteProject();
  const p = projects?.find((x) => x.id === id);
  if (!p) return null;

  return (
    <div className="group relative rounded-xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-neutral-600">
      <Link to={`/projects/${p.id}`} className="block">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-lg font-medium">{p.name}</span>
          {p.status === 'analyzing' && (
            <span className="rounded bg-sky-900/60 px-2 py-0.5 text-xs text-sky-300">analyzing…</span>
          )}
          {p.isGit ? (
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">git</span>
          ) : (
            <span className="rounded bg-amber-900/50 px-2 py-0.5 text-xs text-amber-400">no git</span>
          )}
        </div>
        <p className="truncate text-sm text-neutral-500">{p.path}</p>
        <p className="mt-2 text-xs text-neutral-500">
          {p.lastAnalyzedAt
            ? `Analyzed ${new Date(p.lastAnalyzedAt).toLocaleString()}`
            : 'Not analyzed yet'}
        </p>
      </Link>
      <button
        onClick={() => {
          if (confirm(`Remove project "${p.name}" from Kaizen? (Files on disk are not touched.)`)) {
            del.mutate(p.id);
          }
        }}
        className="absolute right-3 top-3 hidden rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-red-400 group-hover:block"
      >
        remove
      </button>
    </div>
  );
}

function AddProjectDialog({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateProject();

  const submit = () => {
    setError(null);
    create.mutate(
      { path: path.trim(), name: name.trim() || undefined },
      {
        onSuccess: () => onClose(),
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Add project</h2>
        <label className="mb-1 block text-sm text-neutral-400">Local folder path</label>
        <input
          autoFocus
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="C:\projects\MyApp"
          className="mb-3 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <label className="mb-1 block text-sm text-neutral-400">Name (optional — defaults to folder name)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!path.trim() || create.isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {create.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

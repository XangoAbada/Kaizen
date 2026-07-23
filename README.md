# 改善 Kaizen

Locally-run web app that continuously improves your other local applications using the **Claude Code CLI** (your Anthropic subscription — no API key needed).

Each managed app is a **project** (a local folder). Kaizen can:

1. **Analyze** the project deeply and build a persistent knowledge base (`data/projects/<id>/knowledge/*.md`).
2. **Suggest** improvements and new features (optionally researching competitor apps via web search).
3. Manage work on a **Kanban board**: `TODO → In Progress → AI Review → User Review → Done`.
   - Dragging a task to *In Progress* spawns a headless `claude -p` session in the target project's folder with full task context.
   - After implementation an **AI reviewer** (read-only) inspects the diff; material problems loop back for bounded retries.
   - You do the final review with a diff view, then approve or reject with feedback.

## Requirements

- Node.js ≥ 20
- Claude Code CLI installed and logged in (`claude --version` works)
- git (recommended for target projects — enables diffs and reviews)

## Development

```sh
npm install
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:4400 (health check: `/api/health`)

## Production-ish

```sh
npm run build
npm start        # serves the built UI from the server on :4400
```

## Configuration (env vars)

| Variable | Default | Description |
|---|---|---|
| `KAIZEN_PORT` | `4400` | API server port |
| `KAIZEN_DATA_DIR` | `server/data` | SQLite DB, knowledge bases, run transcripts |
| `KAIZEN_CLAUDE_CMD` | auto-resolved | Path to the claude executable |
| `KAIZEN_MAX_CONCURRENT` | `2` | Global cap of concurrently running claude sessions (always max 1 per project) |

Per-project settings (permission mode, max review retries) are editable via `PATCH /api/projects/:id`.

## Safety notes

- Default permission mode is `acceptEdits`. Enabling `bypassPermissions` per project gives agents free rein to run commands in that project — use consciously.
- Kaizen never commits; changes stay in the working tree and are diffed against the commit recorded when the task started. You own the git state.
- Avoid editing a project manually while a Kaizen run is active on it.

## Architecture (short)

npm workspaces: `shared` (types + task state machine), `server` (Express 5 + better-sqlite3 + SSE + claude CLI runner/queue/orchestrator), `web` (React + Vite + TanStack Query + dnd-kit + Tailwind).

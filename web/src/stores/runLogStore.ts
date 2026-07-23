import { create } from 'zustand';
import type { RunOutputEntry } from '@kaizen/shared';

interface RunLogState {
  logs: Record<string, RunOutputEntry[]>;
  append: (runId: string, entry: RunOutputEntry) => void;
  clear: (runId: string) => void;
}

const MAX_ENTRIES_PER_RUN = 2000;

export const useRunLogStore = create<RunLogState>((set) => ({
  logs: {},
  append: (runId, entry) =>
    set((state) => {
      const existing = state.logs[runId] ?? [];
      const next = existing.length >= MAX_ENTRIES_PER_RUN ? existing.slice(-MAX_ENTRIES_PER_RUN + 1) : existing;
      return { logs: { ...state.logs, [runId]: [...next, entry] } };
    }),
  clear: (runId) =>
    set((state) => {
      const { [runId]: _, ...rest } = state.logs;
      return { logs: rest };
    }),
}));

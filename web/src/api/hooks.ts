import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppSettings,
  BrainstormMessage,
  DirListing,
  KnowledgeDoc,
  Project,
  ProjectSettings,
  QueueState,
  RunOutputEntry,
  Suggestion,
  Task,
  TaskEvent,
  TaskRun,
  TaskStatus,
} from '@kaizen/shared';
import { api } from './client';

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api.get<Project[]>('/api/projects') });
}

export function useProject(id: string) {
  return useQuery({ queryKey: ['projects', id], queryFn: () => api.get<Project>(`/api/projects/${id}`) });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; name?: string; create?: boolean; initGit?: boolean }) =>
      api.post<Project>('/api/projects', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name?: string; settings?: ProjectSettings }) =>
      api.patch<Project>(`/api/projects/${id}`, patch),
    onSuccess: (p) => {
      qc.setQueryData(['projects', id], p);
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useBrowseDir(path: string | null) {
  return useQuery({
    queryKey: ['fs', path],
    queryFn: () =>
      api.get<DirListing>(`/api/fs/list${path ? `?path=${encodeURIComponent(path)}` : ''}`),
    staleTime: 30_000,
  });
}

export function useTasks(projectId: string) {
  return useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.get<Task[]>(`/api/tasks/project/${projectId}`),
  });
}

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.get<{ task: Task; runs: TaskRun[]; events: TaskEvent[] }>(`/api/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; description?: string }) =>
      api.post<Task>('/api/tasks', { ...input, projectId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; userPrompt?: string; title?: string; description?: string }) => {
      const { taskId, ...patch } = input;
      return api.patch<Task>(`/api/tasks/${taskId}`, patch);
    },
    onSuccess: (_t, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['task', v.taskId] });
    },
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.delete(`/api/tasks/${taskId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['archivedTasks', projectId] });
    },
  });
}

export function useArchiveTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.post<Task>(`/api/tasks/${taskId}/archive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['archivedTasks', projectId] });
    },
  });
}

export function useUnarchiveTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.post<Task>(`/api/tasks/${taskId}/unarchive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['archivedTasks', projectId] });
    },
  });
}

export function useArchivedTasks(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['archivedTasks', projectId],
    queryFn: () => api.get<Task[]>(`/api/tasks/project/${projectId}?archived=1`),
    enabled,
  });
}

export function useTransitionTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; to: TaskStatus; feedback?: string }) =>
      api.post<{ task: Task; warning?: string }>(`/api/tasks/${input.taskId}/transition`, {
        to: input.to,
        feedback: input.feedback,
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['task'] });
    },
  });
}

export function useReplanTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; feedback?: string }) =>
      api.post<Task>(`/api/tasks/${input.taskId}/replan`, { feedback: input.feedback }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['task'] });
    },
  });
}

export function useTaskDiff(taskId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['diff', taskId],
    queryFn: () => api.get<string>(`/api/tasks/${taskId}/diff`),
    enabled: !!taskId && enabled,
    staleTime: 0,
  });
}

export function useSuggestions(projectId: string) {
  return useQuery({
    queryKey: ['suggestions', projectId],
    queryFn: () => api.get<Suggestion[]>(`/api/suggestions/project/${projectId}`),
  });
}

export function useArchiveSuggestion(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Suggestion>(`/api/suggestions/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions', projectId] }),
  });
}

export function useUnarchiveSuggestion(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Suggestion>(`/api/suggestions/${id}/unarchive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions', projectId] }),
  });
}

export function useDeleteSuggestion(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/suggestions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions', projectId] }),
  });
}

/** `pollMs` keeps the section list fresh while an agent is writing files (the GET re-indexes the dir). */
export function useKnowledge(projectId: string, pollMs?: number) {
  return useQuery({
    queryKey: ['knowledge', projectId],
    queryFn: () => api.get<KnowledgeDoc[]>(`/api/knowledge/project/${projectId}`),
    refetchInterval: pollMs,
  });
}

export function useKnowledgeDoc(docId: string | null, pollMs?: number) {
  return useQuery({
    queryKey: ['knowledgeDoc', docId],
    queryFn: () => api.get<{ meta: KnowledgeDoc; content: string }>(`/api/knowledge/${docId}`),
    enabled: !!docId,
    refetchInterval: pollMs,
  });
}

export function useSaveKnowledgeDoc(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { docId: string; filename: string; content: string }) =>
      api.put<KnowledgeDoc | null>(
        `/api/knowledge/project/${projectId}/${encodeURIComponent(input.filename)}`,
        { content: input.content },
      ),
    onSuccess: (_m, v) => {
      qc.invalidateQueries({ queryKey: ['knowledge', projectId] });
      qc.invalidateQueries({ queryKey: ['knowledgeDoc', v.docId] });
    },
  });
}

export function useBrainstorm(projectId: string) {
  return useQuery({
    queryKey: ['brainstorm', projectId],
    queryFn: () => api.get<BrainstormMessage[]>(`/api/brainstorm/project/${projectId}`),
  });
}

export function useSendBrainstorm(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string) =>
      api.post<{ runId: string }>(`/api/brainstorm/project/${projectId}`, { input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brainstorm', projectId] }),
  });
}

export function useGenerateBrainstormTasks(projectId: string) {
  return useMutation({
    mutationFn: () => api.post<{ runId: string }>(`/api/projects/${projectId}/suggest`, { greenfield: true }),
  });
}

export function useProjectRuns(projectId: string) {
  return useQuery({
    queryKey: ['runs', projectId],
    queryFn: () => api.get<TaskRun[]>(`/api/projects/${projectId}/runs`),
  });
}

export function useRunTranscript(runId: string | null) {
  return useQuery({
    queryKey: ['transcript', runId],
    queryFn: () => api.get<RunOutputEntry[]>(`/api/runs/${runId}/transcript`),
    enabled: !!runId,
  });
}

export function useQueue() {
  return useQuery({ queryKey: ['queue'], queryFn: () => api.get<QueueState>('/api/runs/queue') });
}

export function useAppSettings() {
  return useQuery({ queryKey: ['appSettings'], queryFn: () => api.get<AppSettings>('/api/settings') });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api.patch<AppSettings>('/api/settings', patch),
    onSuccess: (s) => qc.setQueryData(['appSettings'], s),
  });
}

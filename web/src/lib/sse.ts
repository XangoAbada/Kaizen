import type { QueryClient } from '@tanstack/react-query';
import type { KaizenEvent } from '@kaizen/shared';
import { useRunLogStore } from '../stores/runLogStore';

/** Single global EventSource. Reconnects automatically (native EventSource behavior). */
export function connectSse(queryClient: QueryClient): void {
  const source = new EventSource('/api/events');

  source.onmessage = (msg) => {
    let event: KaizenEvent;
    try {
      event = JSON.parse(msg.data);
    } catch {
      return;
    }

    switch (event.type) {
      case 'run.output':
        useRunLogStore.getState().append(event.runId, event.entry);
        break;
      case 'run.started':
        queryClient.invalidateQueries({ queryKey: ['runs', event.projectId] });
        queryClient.invalidateQueries({ queryKey: ['task'] });
        break;
      case 'run.finished':
        queryClient.invalidateQueries({ queryKey: ['runs', event.projectId] });
        queryClient.invalidateQueries({ queryKey: ['task'] });
        queryClient.invalidateQueries({ queryKey: ['diff'] });
        break;
      case 'task.updated':
        queryClient.invalidateQueries({ queryKey: ['tasks', event.task.projectId] });
        queryClient.invalidateQueries({ queryKey: ['task', event.task.id] });
        break;
      case 'suggestion.created':
        queryClient.invalidateQueries({ queryKey: ['suggestions', event.suggestion.projectId] });
        break;
      case 'knowledge.updated':
        queryClient.invalidateQueries({ queryKey: ['knowledge', event.projectId] });
        break;
      case 'project.updated':
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        break;
      case 'queue.updated':
        queryClient.setQueryData(['queue'], event.queue);
        break;
    }
  };
}

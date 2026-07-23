import { EventEmitter } from 'node:events';
import type { KaizenEvent } from '@kaizen/shared';

class Bus extends EventEmitter {
  publish(event: KaizenEvent): void {
    this.emit('event', event);
  }

  subscribe(handler: (event: KaizenEvent) => void): () => void {
    this.on('event', handler);
    return () => this.off('event', handler);
  }
}

export const bus = new Bus();
bus.setMaxListeners(100);

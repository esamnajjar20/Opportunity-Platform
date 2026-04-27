import { EventEmitter } from 'events';
import { AppEvents } from './event.types';
import { logger } from '../utils/logger';

type EventHandler<T> = (payload: T) => void | Promise<void>;

class TypedEventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>): void {
    this.emitter.on(event as string, async (payload: AppEvents[K]) => {
      try {
        await handler(payload);
      } catch (error) {
        logger.error(`Error in event handler for "${String(event)}":`, error);
      }
    });
  }

  once<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>): void {
    this.emitter.once(event as string, async (payload: AppEvents[K]) => {
      try {
        await handler(payload);
      } catch (error) {
        logger.error(`Error in once-handler for "${String(event)}":`, error);
      }
    });
  }

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    logger.debug(`Event emitted: ${String(event)}`, { payload });
    this.emitter.emit(event as string, payload);
  }

  off<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>): void {
    this.emitter.off(event as string, handler as (...args: unknown[]) => void);
  }

  removeAllListeners<K extends keyof AppEvents>(event?: K): void {
    this.emitter.removeAllListeners(event as string | undefined);
  }
}

// Singleton
export const eventBus = new TypedEventBus();

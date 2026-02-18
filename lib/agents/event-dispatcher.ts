// Event Dispatcher
// Typed, in-process event emitter for Voyager.
//
// Not a message queue. A simple pub/sub that routes typed events
// to registered handlers. Handlers are fire-and-forget — errors
// are logged but never propagate to the emitter.
//
// Registration happens at module level via import side-effects.
// No "app startup" in Next.js serverless — first import wires everything.

import { log } from '@/lib/debug/logger'

// =============================================================================
// Event Types (discriminated union)
// =============================================================================

export type VoyagerEvent =
  | {
      type: 'conversation.ended'
      payload: { conversationId: string; userId: string; voyageSlug?: string }
    }
  | {
      type: 'background.completed'
      payload: { taskId: string; conversationId: string; userId: string }
    }

// =============================================================================
// Dispatcher
// =============================================================================

type EventHandler<T extends VoyagerEvent['type']> = (
  payload: Extract<VoyagerEvent, { type: T }>['payload']
) => void | Promise<void>

interface EventDispatcher {
  on: <T extends VoyagerEvent['type']>(type: T, handler: EventHandler<T>) => void
  emit: <T extends VoyagerEvent['type']>(
    type: T,
    payload: Extract<VoyagerEvent, { type: T }>['payload']
  ) => void
}

export const createEventDispatcher = (): EventDispatcher => {
  const handlers = new Map<string, Array<(payload: unknown) => void | Promise<void>>>()

  return {
    on(type, handler) {
      const list = handlers.get(type) ?? []
      list.push(handler as (payload: unknown) => void | Promise<void>)
      handlers.set(type, list)
      log.agent(`Handler registered for ${type}`, undefined, 'debug')
    },

    emit(type, payload) {
      const list = handlers.get(type)
      if (!list || list.length === 0) {
        log.agent(`No handlers for ${type}`, undefined, 'warn')
        return
      }

      log.agent(`Emitting ${type}`, { payload: payload as Record<string, unknown> })

      for (const handler of list) {
        try {
          const result = handler(payload)
          if (result instanceof Promise) {
            result.catch((err) => {
              log.agent(`Handler error for ${type}`, {
                error: err instanceof Error ? err.message : String(err),
              }, 'error')
            })
          }
        } catch (err) {
          log.agent(`Handler error for ${type}`, {
            error: err instanceof Error ? err.message : String(err),
          }, 'error')
        }
      }
    },
  }
}

// =============================================================================
// Singleton (module-level, serverless-safe)
// =============================================================================

export const dispatcher = createEventDispatcher()

// =============================================================================
// Handler Registration (module-level, fires on first import)
// =============================================================================

// Note: Cartographer is no longer triggered by conversation.ended.
// It fires via count-based check in the chat route's onFinish handler.

dispatcher.on('background.completed', (payload) => {
  log.agent('Background task completed', payload as Record<string, unknown>)
})

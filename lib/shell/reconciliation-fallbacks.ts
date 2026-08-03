import { log } from '@/lib/debug'
import { createMessageEvent } from '@/lib/knowledge/events'
import { fanOutDeliveries } from '@/lib/messaging/deliveries'
import { getVoyageBySlug } from '@/lib/voyage/core'
import { getVoyageMembers } from '@/lib/voyage/members'
import type { ActionIntent } from './types'

export interface ReconcileContext {
  userId: string
  voyageSlug?: string
  conversationId?: string
}

const executeTellFallback = async (
  intent: ActionIntent,
  ctx: ReconcileContext,
): Promise<string | null> => {
  if (!intent.target || !ctx.voyageSlug) {
    log.shell(`tell fallback skipped: ${!intent.target ? 'no target' : 'no voyage context'}`)
    return null
  }

  try {
    const voyage = await getVoyageBySlug(ctx.voyageSlug)
    if (!voyage) {
      log.shell('[SHELL] tell fallback: voyage not found', undefined, 'warn')
      return null
    }

    const members = await getVoyageMembers(voyage.id)
    const targetLower = intent.target.toLowerCase().trim()
    const usernameMatches = members.filter(
      (member) => member.username?.toLowerCase() === targetLower,
    )
    const match = usernameMatches.length === 1
      ? usernameMatches[0]
      : members.find((member) => {
        const displayName = member.displayName?.toLowerCase() ?? ''
        const nickname = member.nickname?.toLowerCase() ?? ''
        return displayName === targetLower
          || displayName.startsWith(`${targetLower} `)
          || displayName.split(' ').some((part) => part === targetLower)
          || (nickname && nickname === targetLower)
      })

    if (!match) {
      log.shell(`tell fallback: member "${intent.target}" not found in voyage`)
      return null
    }
    if (match.userId === ctx.userId) {
      log.shell('[SHELL] tell fallback: target is sender, skipping')
      return null
    }

    const senderMember = members.find((member) => member.userId === ctx.userId)
    const senderDisplayName = senderMember?.displayName ?? senderMember?.email ?? 'Unknown'
    const content = intent.payload ?? intent.source
    const eventId = await createMessageEvent(
      ctx.conversationId ?? 'shell-reconciler',
      'user',
      content,
      {
        userId: ctx.userId,
        voyageSlug: ctx.voyageSlug,
        participants: [ctx.userId, match.userId],
        addressedTo: [match.userId],
        source: 'mention',
        senderDisplayName,
        senderUserId: ctx.userId,
      },
    )

    if (eventId) {
      await fanOutDeliveries(eventId, [match.userId])
    }

    log.shell(`tell fallback executed: message to ${match.displayName}`)
    return 'createMessageEvent'
  } catch (error) {
    log.shell(`tell fallback error: ${String(error)}`, undefined, 'error')
    return null
  }
}

const executeRememberFallback = async (
  intent: ActionIntent,
  ctx: ReconcileContext,
): Promise<string | null> => {
  if (!intent.payload) {
    log.shell('remember fallback skipped: no payload to save')
    return null
  }

  try {
    const eventId = await createMessageEvent(ctx.conversationId ?? 'shell-reconciler', 'user', intent.payload, {
      userId: ctx.userId,
      voyageSlug: ctx.voyageSlug,
      classifications: ['preference'],
      eventType: 'message',
    })

    if (!eventId) {
      log.shell('remember fallback: createMessageEvent returned null', undefined, 'warn')
      return null
    }

    log.shell(`remember fallback executed: saved "${intent.payload.slice(0, 40)}"`)
    return 'createMessageEvent'
  } catch (error) {
    log.shell(`remember fallback error: ${String(error)}`, undefined, 'error')
    return null
  }
}

export const executeFallback = async (
  intent: ActionIntent,
  ctx: ReconcileContext,
): Promise<string | null> => {
  switch (intent.verb) {
    case 'tell':
      return executeTellFallback(intent, ctx)
    case 'remember':
      return executeRememberFallback(intent, ctx)
    default:
      return null
  }
}

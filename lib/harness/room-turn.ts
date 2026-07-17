import { createMessageEvent } from '@/lib/knowledge'
import { fanOutDeliveries } from '@/lib/messaging/deliveries'
import { deliverRoomInvite, inviteToRoom } from '@/lib/messaging/invites'
import { getRoom, parseRoomCommand, removeRoomPerson, setAiPresent } from '@/lib/messaging/room'
import { getVoyageBySlug, getVoyageMembers, resolveMemberByName } from '@/lib/voyage'
import type { HarnessHost, TurnContext, TurnResult } from './types'

interface RoomTurnInput {
  ctx: TurnContext
  host: HarnessHost
  queryText: string
  voyagerAside: boolean
}

const deferUserPersistence = (
  { userId, conversationId, voyageSlug }: TurnContext,
  host: HarnessHost,
  queryText: string,
  emitConversationEvent: boolean,
  source?: string,
) => {
  if (!conversationId) return

  if (emitConversationEvent) {
    host.defer(createMessageEvent(conversationId, 'user', queryText, {
      userId,
      voyageSlug: voyageSlug ?? undefined,
      participants: [userId],
      eventType: 'conversation',
      source,
    }).then(() => undefined).catch((error) => {
      console.error('[Knowledge] emitMessageEvent error (non-blocking):', error)
    }))
  }
}

export const runRoomTurn = async ({
  ctx,
  host,
  queryText,
  voyagerAside,
}: RoomTurnInput): Promise<TurnResult | null> => {
  const { userId, conversationId, voyageSlug, autoSent } = ctx
  const room = conversationId
    ? await getRoom(conversationId)
    : { roomPeople: [], aiPresent: true }
  const voyage = voyageSlug ? await getVoyageBySlug(voyageSlug) : null
  const voyageMembers = voyage ? await getVoyageMembers(voyage.id) : []

  // Deterministic +/- grammar is ephemeral and runs before persistence.
  const roomCmd = queryText ? parseRoomCommand(queryText) : null
  if (roomCmd && conversationId) {
    let confirmation: string | null = null
    if (roomCmd.op === 'voyager-in') {
      await setAiPresent(conversationId, true)
      confirmation = 'Back in the room.'
    } else if (roomCmd.op === 'voyager-out') {
      await setAiPresent(conversationId, false)
      confirmation = 'Stepped out — just you and whoever else is here. Say +voyager to bring me back.'
    } else if (voyageSlug && (roomCmd.op === 'add' || roomCmd.op === 'remove')) {
      const match = resolveMemberByName(voyageMembers, roomCmd.name)
      if (match && match.userId !== userId) {
        if (roomCmd.op === 'add') {
          const invite = await inviteToRoom(conversationId, match.userId)
          if (invite.state === 'invited') {
            const me = voyageMembers.find((member) => member.userId === userId)
            const senderName = me?.displayName ?? me?.email ?? 'Someone'
            await deliverRoomInvite(
              conversationId,
              { userId, displayName: senderName },
              match.userId,
              voyageSlug,
            )
            confirmation = `Invited ${match.displayName} — they can hop in by replying to the invite.`
          } else {
            confirmation = `Added ${match.displayName} — they'll get what you type here.`
          }
        } else {
          await removeRoomPerson(conversationId, match.userId)
          confirmation = `Removed ${match.displayName} from the room.`
        }
      }
    }
    if (confirmation !== null) return { kind: 'text', text: confirmation }
  }

  if (conversationId && queryText && !autoSent) {
    deferUserPersistence(
      ctx,
      host,
      queryText,
      room.roomPeople.length === 0 || voyagerAside,
      voyagerAside && room.roomPeople.length > 0 ? 'aside' : undefined,
    )
  }

  if (conversationId && queryText && room.roomPeople.length > 0 && !voyagerAside) {
    const currentIds = new Set(voyageMembers.map((member) => member.userId))
    const recipients = room.roomPeople.filter((id) => id !== userId && currentIds.has(id))
    if (recipients.length > 0) {
      const me = voyageMembers.find((member) => member.userId === userId)
      const senderName = me?.displayName ?? me?.email ?? 'Someone'
      const eventId = await createMessageEvent(conversationId, 'user', queryText, {
        userId,
        voyageSlug: voyageSlug ?? undefined,
        participants: [userId, ...recipients],
        addressedTo: recipients,
        source: 'room',
        senderDisplayName: senderName,
        senderUserId: userId,
        attentionScore: 0.85,
        contextSnippet: `${senderName} in room: ${queryText.slice(0, 60)}`,
      })
      if (eventId) void fanOutDeliveries(eventId, recipients)
    }
  }

  const addressed = voyagerAside || /^(hey |hi |ok |okay )?voyager\b/i.test(queryText.trim())
  if (room.roomPeople.length > 0 && !voyagerAside && (!addressed || room.aiPresent === false)) {
    return { kind: 'empty' }
  }

  return null
}

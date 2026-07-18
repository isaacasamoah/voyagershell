import { createMessageEvent } from '@/lib/knowledge'
import { fanOutDeliveries } from '@/lib/messaging/deliveries'
import { deliverRoomInvite, inviteToRoom } from '@/lib/messaging/invites'
import { getRoom, parseRoomCommand, removeRoomPerson, setAiPresent } from '@/lib/messaging/room'
import { getVoyageBySlug, getVoyageMembers, resolveMemberByName } from '@/lib/voyage'
import type { AddressResult } from '@/lib/messaging/address'
import type { HarnessHost, TurnContext, TurnResult } from './types'

interface RoomTurnInput {
  ctx: TurnContext
  host: HarnessHost
  queryText: string
  address: AddressResult
}

// `@`-ing another member's voyager NEVER opens a private channel (C1). The
// message already flows through public room semantics above; this gentle line
// nudges the asker toward the right address without a cross-owner private line.
const redirectLine = (address: AddressResult): string => {
  const owner = address.targetOwnerName ?? 'someone else'
  const name = address.targetHandle ?? 'that voyager'
  return `${name} is ${owner}'s Voyager — @ only reaches your own. Say "${name}, …" to summon them into the room.`
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
  address,
}: RoomTurnInput): Promise<TurnResult | null> => {
  const isAside = address.mode === 'aside'
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
      room.roomPeople.length === 0 || isAside,
      isAside && room.roomPeople.length > 0 ? 'aside' : undefined,
    )
  }

  if (conversationId && queryText && room.roomPeople.length > 0 && !isAside) {
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

  // `@other-voyager`: public semantics already ran (fan-out above); nudge the
  // asker toward the right address instead of opening a private channel. Cross-
  // owner summon EXECUTION is deferred to cut ④ — parsed here, not run.
  if (address.mode === 'redirect') {
    return { kind: 'text', text: redirectLine(address) }
  }

  // The voyager fires for an aside (own) or a summon (own or another's handle);
  // a mid-sentence mention or plain chatter is NOT addressed.
  const addressed = isAside || address.mode === 'summon'
  if (room.roomPeople.length > 0 && !isAside && (!addressed || room.aiPresent === false)) {
    return { kind: 'empty' }
  }

  return null
}

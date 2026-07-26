import { deliverRoomInvite, inviteToRoom } from '@/lib/messaging/invites'
import { getRoom, removeRoomPerson, setAiPresent, type RoomState } from '@/lib/messaging/room'
import { parseRoomCommand } from '@/lib/messaging/room-command'
import { getVoyageBySlug } from '@/lib/voyage/core'
import { getVoyageMembers, resolveMemberByName } from '@/lib/voyage/members'
import type { AddressResult } from '@/lib/messaging/address'
import type { IngressMember } from '@/lib/messaging/ingress'
import type { TurnContext, TurnResult } from './types'

interface RoomGateInput {
  ctx: TurnContext
  queryText: string
  address: AddressResult
}

export interface RoomGate {
  /** A terminal reply the gate produced. When set, the turn is over: nothing
   *  was written and nothing may be. */
  result: TurnResult | null
  room: RoomState
  voyageMembers: IngressMember[]
  senderDisplayName: string
}

// The token-less form of the held notice. The resolver always attaches a
// per-token `address.notice`; this is the generic line used only if a held
// result ever arrives without one, so the gate never emits an empty message
// on the confidentiality path.
const HELD_NOTICE_FALLBACK =
  'Only your Voyager can be invoked here. Remove @ to send ordinary room text.'

/**
 * Everything that must be decided BEFORE the ingress claim.
 *
 * Two paths end a turn without ever writing anything, and both are deliberate:
 * the deterministic `+name` / `-name` room grammar, which is an instruction
 * rather than a message, and a leading `@token` naming no reachable voyager,
 * which is HELD so the words never reach the room. Neither may reach the ledger,
 * so both run ahead of the claim rather than being undone after it.
 */
export const runRoomGate = async ({
  ctx,
  queryText,
  address,
}: RoomGateInput): Promise<RoomGate> => {
  const { userId, conversationId, voyageSlug } = ctx
  const room = conversationId
    ? await getRoom(conversationId, userId)
    : { roomPeople: [], aiPresent: true, spaceId: null }
  const voyage = voyageSlug ? await getVoyageBySlug(voyageSlug) : null
  const voyageMembers = voyage ? await getVoyageMembers(voyage.id) : []
  const me = voyageMembers.find((member) => member.userId === userId)
  const senderDisplayName = me?.displayName ?? me?.email ?? 'Someone'
  const gate = (result: TurnResult | null): RoomGate =>
    ({ result, room, voyageMembers, senderDisplayName })

  const roomCmd = queryText ? parseRoomCommand(queryText) : null
  if (roomCmd && conversationId) {
    let confirmation: string | null = null
    if (roomCmd.op === 'voyager-in') {
      confirmation = await setAiPresent(conversationId, userId, true)
        ? 'Back in the room.'
        : "You can't change this room because you're no longer in it."
    } else if (roomCmd.op === 'voyager-out') {
      confirmation = await setAiPresent(conversationId, userId, false)
        ? 'Stepped out — just you and whoever else is here. Say +voyager to bring me back.'
        : "You can't change this room because you're no longer in it."
    } else if (voyageSlug && (roomCmd.op === 'add' || roomCmd.op === 'remove')) {
      const match = resolveMemberByName(voyageMembers, roomCmd.name)
      if (match && match.userId !== userId) {
        if (roomCmd.op === 'add') {
          const invite = await inviteToRoom(conversationId, userId, match.userId)
          if (invite.state === 'invited') {
            await deliverRoomInvite(
              conversationId,
              { userId, displayName: senderDisplayName },
              match.userId,
              invite.spaceId,
              voyageSlug,
            )
            confirmation = `Invited ${match.displayName} — they can hop in by replying to the invite.`
          } else if (invite.state === 'active') {
            confirmation = `Added ${match.displayName} — they'll get what you type here.`
          } else {
            confirmation = `Could not invite ${match.displayName} — you're no longer active in this room.`
          }
        } else {
          const result = await removeRoomPerson(conversationId, userId, match.userId)
          confirmation = result.removed
            ? `Removed ${match.displayName} from the room.`
            : `Could not remove ${match.displayName} — you're no longer active in this room.`
        }
      }
    }
    if (confirmation !== null) return gate({ kind: 'text', text: confirmation })
  }

  if (address.mode === 'held') {
    return gate({ kind: 'text', text: address.notice ?? HELD_NOTICE_FALLBACK })
  }

  return gate(null)
}

/**
 * What a populated room does with a turn once its message has been committed.
 *
 * In a populated room only the owner's explicit private aside reaches their
 * Voyager. Every plain utterance — including a leading Voyager name — remains
 * human room text: it is on the ledger and in the recipients' outbox, and it
 * ends here. There is no public-generation or cross-owner path.
 */
export const runRoomTurn = (
  room: RoomState,
  address: AddressResult,
): TurnResult | null => (
  room.roomPeople.length > 0 && address.mode !== 'aside' ? { kind: 'empty' } : null
)

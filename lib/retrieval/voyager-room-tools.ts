import { tool } from 'ai'
import { z } from 'zod'
import {
  deliverRoomInvite,
  enterActiveRoom,
  inviteToRoom,
  respondToRoomInvite,
} from '@/lib/messaging/invites'
import { removeRoomPerson, setAiPresent } from '@/lib/messaging/room'
import { getVoyageBySlug, getVoyageMembers } from '@/lib/voyage'
import { resolveOneMember } from './tool-helpers'
import type { ToolContext } from './tool-types'

export const createVoyagerRoomTools = (ctx: ToolContext) => ({
  add_to_room: tool({
    description: `INVITE a person to THIS conversation (the room). They get a knock and join only when they accept — they are NOT in the room until then. Use for "+vanessa", "add vanessa", "bring tom in", "invite sarah here".`,
    inputSchema: z.object({ name: z.string().describe('The person to invite') }),
    execute: async ({ name }) => {
      if (!ctx.conversationId) return "I can't manage this room — no active conversation."
      const member = await resolveOneMember(ctx, name)
      if ('error' in member) return member.error
      const invite = await inviteToRoom(ctx.conversationId, member.userId)
      if (invite.state === 'invited') {
        const voyage = ctx.voyageSlug ? await getVoyageBySlug(ctx.voyageSlug) : null
        const members = voyage ? await getVoyageMembers(voyage.id) : []
        const me = members.find((candidate) => candidate.userId === ctx.userId)
        await deliverRoomInvite(
          ctx.conversationId,
          { userId: ctx.userId, displayName: me?.displayName ?? me?.email ?? 'Someone' },
          member.userId,
          ctx.voyageSlug,
        )
        return `${member.displayName} has been INVITED — they are NOT in the room yet and cannot see these messages. They received a knock and will join only if they accept. Tell the user exactly this; do not claim they were added.`
      }
      if (invite.state === 'active') {
        return `${member.displayName} is in the room — they'll receive what's typed here.`
      }
      return `You can't invite ${member.displayName} because you're no longer active in this room.`
    },
  }),

  respond_to_room_invite: tool({
    description: `Respond to a pending room invitation on the user's behalf. Call when the user engages with an invite — "join", "sure, add me", "yes" (accept:true) or "no thanks", "not now", "decline" (accept:false). Also call with accept:true when the user wants to hop back into a room they're already a member of from a new session.`,
    inputSchema: z.object({
      accept: z.boolean().describe('true = join the room, false = decline'),
    }),
    execute: async ({ accept }) => {
      if (!ctx.conversationId) return 'No pending room invite.'
      const response = await respondToRoomInvite(ctx.conversationId, ctx.userId, accept)
      if (response.responded) return JSON.stringify(response)
      if (accept) {
        const entered = await enterActiveRoom(ctx.conversationId, ctx.userId)
        if (entered.entered) return JSON.stringify(entered)
      }
      return 'No pending room invite.'
    },
  }),

  remove_from_room: tool({
    description: `Remove a person from THIS conversation (the room). Use for "-vanessa", "remove vanessa", "just us again".`,
    inputSchema: z.object({ name: z.string().describe('The person to remove') }),
    execute: async ({ name }) => {
      if (!ctx.conversationId) return "I can't manage this room — no active conversation."
      const member = await resolveOneMember(ctx, name)
      if ('error' in member) return member.error
      const result = await removeRoomPerson(ctx.conversationId, member.userId)
      return JSON.stringify({
        status: result.removed ? 'removed' : 'not_active_in_room',
        person: member.displayName,
      })
    },
  }),

  set_voyager_presence: tool({
    description: `Toggle whether Voyager (you) is in the room and responds. "+voyager" / "voyager join" → present=true; "-voyager" / "make this private" / "just us humans" → present=false (you go quiet, humans still receive each other's messages).`,
    inputSchema: z.object({
      present: z.boolean().describe('true = Voyager in the room; false = step out'),
    }),
    execute: async ({ present }) => {
      if (!ctx.conversationId) return 'No active conversation.'
      const changed = await setAiPresent(ctx.conversationId, present)
      return JSON.stringify({
        status: changed
          ? (present ? 'voyager_present' : 'voyager_stepped_out')
          : 'not_active_in_room',
      })
    },
  }),
})

import { tool } from 'ai'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { createVoyage } from '@/lib/voyage/core'
import { sendVoyageInvite } from '@/lib/voyage/invitations'
import { isCaptain } from '@/lib/voyage/members'
import { generateSlug, isSlugAvailable } from '@/lib/voyage/session'
import type { ToolContext } from './tool-types'

export const createVoyagerVoyageTools = (ctx: ToolContext) => ({
  create_voyage: tool({
    description: `Create a new voyage (community space). The user becomes captain. Returns the voyage details and invite code for sharing. Use when the user says "create a voyage", "start a new voyage", "make a group called X", etc.`,
    inputSchema: z.object({
      name: z.string().min(1).max(100).describe('Name for the voyage'),
      description: z.string().max(500).optional().describe('Optional description'),
    }),
    execute: async ({ name, description }) => {
      const slug = generateSlug(name)
      if (!(await isSlugAvailable(slug))) {
        return `A voyage with a similar name already exists (slug: "${slug}"). Try a different name.`
      }
      const voyage = await createVoyage({ name, slug, description }, ctx.userId)
      if (!voyage) return 'Failed to create voyage. Please try again.'
      return JSON.stringify({
        created: true,
        name: voyage.name,
        slug: voyage.slug,
        inviteCode: voyage.inviteCode,
      })
    },
  }),

  invite_to_voyage: tool({
    description: `Invite someone to the current voyage by email. Sends them a magic link that authenticates and joins them in one click. Captain-only — crew members cannot invite. Always confirm with the user before sending. Use when the captain says "invite X to Y", "add X to the voyage", "send X an invite", etc.`,
    inputSchema: z.object({
      email: z.string().describe('Email address to invite'),
      voyage_name: z.string().optional().describe('Voyage name for disambiguation'),
    }),
    execute: async ({ email }) => {
      if (!ctx.voyageSlug) {
        return 'You need to be in a voyage to send invites. Switch to a voyage first.'
      }
      if (!(await isCaptain(ctx.voyageSlug, ctx.userId))) {
        return 'Only the captain can send invites. Ask your captain to invite them.'
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return "That doesn't look like a valid email address."
      }
      const { data: profile } = await getAdminClient()
        .from('profiles')
        .select('display_name')
        .eq('id', ctx.userId)
        .maybeSingle()
      const inviterName = (profile as { display_name: string | null } | null)?.display_name || 'Someone'
      const result = await sendVoyageInvite({
        email,
        voyageSlug: ctx.voyageSlug,
        invitedBy: ctx.userId,
        inviterDisplayName: inviterName,
      })
      if (result.alreadyInvited) return `${email} already has a pending invite to this voyage.`
      if (!result.success) return result.error || 'Failed to send invite.'
      return `Invite sent to ${email}. They'll receive a magic link to join.`
    },
  }),
})

import { tool } from 'ai'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { formatTimeAgo, parseRelativeDate } from './tool-helpers'
import type { ToolContext } from './tool-types'

const getMessagesSchema = z.object({
  channel: z.string().optional().describe('Channel name to query. Omit for direct mentions.'),
  since: z.string().optional().describe('ISO timestamp or relative date. Default: last 24 hours.'),
})

export const createVoyagerMessageQueryTools = (ctx: ToolContext) => ({
  get_messages: tool({
    description: `Check messages in the current voyage. Default: shows messages where you were specifically mentioned (@you). With channel param: shows activity in that channel. Covers: "do I have messages?", "what's been sent to me?", "check my messages", "anything I missed?", "what happened in #channel?"`,
    inputSchema: getMessagesSchema,
    execute: async ({ channel, since }) => {
      if (!ctx.voyageSlug) {
        return "Messages live in voyages. You're in personal space — switch to a voyage to check messages."
      }
      const sinceDate = since
        ? parseRelativeDate(since)
        : new Date(Date.now() - 24 * 60 * 60 * 1000)
      let query = getAdminClient()
        .from('knowledge_current')
        .select('event_id, content, source_created_at, sender_display_name, sender_user_id, addressed_to, participants')
        .eq('event_type', 'message')
        .eq('voyage_slug', ctx.voyageSlug)
        .gte('source_created_at', sinceDate.toISOString())
        .order('source_created_at', { ascending: false })
        .limit(20)
      query = channel
        ? query.or(`participants.is.null,participants.cs.{${ctx.userId}}`)
        : query.contains('addressed_to', [ctx.userId])
      const { data, error } = await query
      if (error) {
        console.error('[get_messages] Query error:', error)
        return 'Error checking messages.'
      }
      const filtered = (data ?? []).filter((row) => row.sender_user_id !== ctx.userId)
      if (filtered.length === 0) {
        return channel ? `Nothing new in #${channel}.` : 'No one has mentioned you recently.'
      }
      return filtered.map((row) => {
        const sender = row.sender_display_name ?? 'Someone'
        const time = formatTimeAgo(new Date(row.source_created_at))
        return `${sender} (${time}): ${row.content.slice(0, 100)}`
      }).join('\n\n')
    },
  }),
})

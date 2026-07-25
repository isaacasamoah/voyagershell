import { tool } from 'ai'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { formatTimeAgo, parseRelativeDate } from './tool-helpers'
import type { ToolContext } from './tool-types'

const getMessagesSchema = z.object({
  since: z.string().optional().describe('ISO timestamp or relative date. Default: last 24 hours.'),
}).strict()

export const createVoyagerMessageQueryTools = (ctx: ToolContext) => ({
  get_messages: tool({
    description: `Check direct mentions in the current voyage. Covers: "do I have messages?", "what's been sent to me?", "check my messages", and "anything I missed?"`,
    inputSchema: getMessagesSchema,
    execute: async ({ since }) => {
      if (!ctx.voyageSlug) {
        return "Messages live in voyages. You're in personal space — switch to a voyage to check messages."
      }
      const sinceDate = since
        ? parseRelativeDate(since)
        : new Date(Date.now() - 24 * 60 * 60 * 1000)
      const { data, error } = await getAdminClient().rpc('get_voyage_messages', {
        p_user_id: ctx.userId,
        p_voyage_slug: ctx.voyageSlug,
        p_since: sinceDate.toISOString(),
        p_max_count: 20,
      })
      if (error) {
        console.error('[get_messages] Query error:', error)
        return 'Error checking messages.'
      }
      if (!data?.length) return 'No one has mentioned you recently.'
      return data.map((row) => {
        const sender = row.sender_display_name ?? 'Someone'
        const time = formatTimeAgo(new Date(row.source_created_at))
        return `${sender} (${time}): ${row.content.slice(0, 100)}`
      }).join('\n\n')
    },
  }),
})

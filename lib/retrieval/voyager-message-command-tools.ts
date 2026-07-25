import { tool } from 'ai'
import { z } from 'zod'
import { createExplicitEvent, createMessageEvent } from '@/lib/knowledge/events'
import { fanOutDeliveries } from '@/lib/messaging/deliveries'
import { getVoyageBySlug } from '@/lib/voyage/core'
import { getVoyageMembers } from '@/lib/voyage/members'
import type { ToolContext } from './tool-types'

export const createVoyagerMessageCommandTools = (ctx: ToolContext) => ({
  send_message: tool({
    description: `Send a message to voyage members. Resolves @mentions or natural-language routing, then creates a participant-scoped message event and fans out delivery. Covers both @name syntax ("@tom fix is ready") and natural language ("tell tom the fix is ready", "ask sarah about the pricing deck", "message tom about X"). Call this whenever someone is addressed or a message needs routing to specific people.`,
    inputSchema: z.object({
      names: z.array(z.string()).min(1).describe('Names to resolve from mentions or natural language'),
      message: z.string().describe('The message content to deliver'),
    }),
    execute: async ({ names, message }) => {
      if (!ctx.voyageSlug) {
        return "Messaging requires a shared voyage. You're in personal space — to send messages, switch to a voyage first."
      }
      const voyage = await getVoyageBySlug(ctx.voyageSlug)
      if (!voyage) return 'Could not find the current voyage.'
      const members = await getVoyageMembers(voyage.id)
      const resolved: Array<{ userId: string; displayName: string }> = []
      const ambiguous: Array<{
        name: string
        matches: Array<{ userId: string; displayName: string; email?: string }>
      }> = []
      const notFound: string[] = []

      for (const name of names) {
        const lower = name.toLowerCase().trim()
        const usernameMatches = members.filter((member) => member.username?.toLowerCase() === lower)
        if (usernameMatches.length === 1) {
          const match = usernameMatches[0]
          if (match.userId === ctx.userId) return `That's you! No need to send a message to yourself.`
          resolved.push({
            userId: match.userId,
            displayName: match.displayName ?? match.email ?? 'unknown',
          })
          continue
        }
        const matches = members.filter((member) => {
          const displayName = member.displayName?.toLowerCase() ?? ''
          const nickname = member.nickname?.toLowerCase() ?? ''
          return displayName === lower
            || displayName.startsWith(`${lower} `)
            || displayName.split(' ').some((part) => part === lower)
            || Boolean(nickname && nickname === lower)
        })
        if (matches.length === 1) {
          if (matches[0].userId === ctx.userId) {
            return `That's you! No need to send a message to yourself.`
          }
          resolved.push({
            userId: matches[0].userId,
            displayName: matches[0].displayName ?? matches[0].email ?? 'unknown',
          })
        } else if (matches.length > 1) {
          ambiguous.push({
            name,
            matches: matches.map((match) => ({
              userId: match.userId,
              displayName: match.displayName ?? 'unknown',
              email: match.email,
            })),
          })
        } else {
          notFound.push(name)
        }
      }

      if (ambiguous.length > 0) {
        const detail = ambiguous.map((item) =>
          `"${item.name}" matches: ${item.matches.map((match) =>
            `${match.displayName} (${match.email ?? 'no email'})`).join(', ')}`,
        ).join('; ')
        return `Multiple people match: ${detail}. Which one did you mean?`
      }
      if (notFound.length > 0) {
        const missingNames = notFound.length === 1
          ? notFound[0]
          : `${notFound.slice(0, -1).join(', ')} or ${notFound[notFound.length - 1]}`
        return `I don't see anyone called ${missingNames} in this voyage.`
      }

      const mentionedIds = resolved.map((member) => member.userId)
      const sender = members.find((member) => member.userId === ctx.userId)
      const senderDisplayName = sender?.displayName ?? sender?.email ?? 'Unknown'
      const recipientNames = resolved.map((member) => member.displayName)
      const contextSnippet = `${senderDisplayName} to ${recipientNames.join(', ')}: ${message.slice(0, 60)}`
      const eventId = await createMessageEvent(
        ctx.conversationId ?? 'mention',
        'user',
        message,
        {
          userId: ctx.userId,
          voyageSlug: ctx.voyageSlug,
          participants: [ctx.userId, ...mentionedIds],
          addressedTo: mentionedIds,
          source: 'mention',
          senderDisplayName,
          senderUserId: ctx.userId,
          attentionScore: 0.85,
          contextSnippet,
        },
      )
      if (eventId) {
        if (ctx.waitUntil) ctx.waitUntil(fanOutDeliveries(eventId, mentionedIds))
        else await fanOutDeliveries(eventId, mentionedIds)
      }
      return JSON.stringify({ status: 'sent', recipients: recipientNames, message })
    },
  }),

  remember_knowledge: tool({
    description: `Save knowledge explicitly. Use when the user says "remember this", "save this", "note that", "keep in mind", etc. Creates a persistent knowledge event that Voyager will recall in future conversations.`,
    inputSchema: z.object({
      content: z.string().describe('The knowledge to remember'),
      classifications: z.array(
        z.enum(['fact', 'preference', 'decision', 'procedure', 'insight', 'entity']),
      ).optional().describe('Knowledge types. Defaults to preference.'),
    }),
    execute: async ({ content, classifications: requestedClassifications }) => {
      const classifications = requestedClassifications ?? ['preference']
      const eventId = await createExplicitEvent(content, {
        userId: ctx.userId,
        voyageSlug: ctx.voyageSlug,
        classifications,
        sessionId: ctx.conversationId,
      })
      if (!eventId) return 'Failed to save knowledge. Please try again.'
      return `Saved as ${classifications.join(', ')} knowledge.`
    },
  }),
})

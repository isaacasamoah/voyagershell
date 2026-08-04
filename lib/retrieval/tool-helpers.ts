import { getVoyageBySlug } from '@/lib/voyage/core'
import { getVoyageMembers, resolveMemberByName } from '@/lib/voyage/members'
import type { ToolContext } from './tool-types'

export const resolveOneMember = async (
  ctx: ToolContext,
  name: string,
): Promise<{ userId: string; displayName: string } | { error: string }> => {
  if (!ctx.voyageSlug) {
    return { error: "Rooms live in voyages. You're in personal space — switch to a voyage first." }
  }
  const voyage = await getVoyageBySlug(ctx.voyageSlug)
  if (!voyage) return { error: 'Could not find the current voyage.' }
  const match = resolveMemberByName(await getVoyageMembers(voyage.id), name)
  if (!match) return { error: `I don't see anyone called ${name} in this voyage.` }
  if (match.userId === ctx.userId) return { error: "That's you — you're already here." }
  return match
}

export const parseRelativeDate = (input: string): Date => {
  const now = new Date()
  const lower = input.toLowerCase().trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(lower)) return new Date(input)
  if (lower === 'today') return new Date(now.setHours(0, 0, 0, 0))
  if (lower === 'yesterday') return new Date(now.setDate(now.getDate() - 1))
  if (lower === 'last week') return new Date(now.setDate(now.getDate() - 7))
  if (lower === 'last month') return new Date(now.setMonth(now.getMonth() - 1))

  const agoMatch = lower.match(/(\d+)\s*(day|week|month|hour)s?\s*ago/)
  if (!agoMatch) return new Date(now.setDate(now.getDate() - 7))
  const amount = parseInt(agoMatch[1])
  const unit = agoMatch[2]
  if (unit === 'day') return new Date(now.setDate(now.getDate() - amount))
  if (unit === 'week') return new Date(now.setDate(now.getDate() - amount * 7))
  if (unit === 'month') return new Date(now.setMonth(now.getMonth() - amount))
  return new Date(now.setHours(now.getHours() - amount))
}

export const formatTimeAgo = (date: Date): string => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

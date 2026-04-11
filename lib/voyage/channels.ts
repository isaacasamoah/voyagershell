// Slice 5D: Voyage Channels
//
// Voyage-scoped channel branches. A channel is a session row with
// branch_type = 'channel' and branch_metadata = { kind: 'channel', channelName }.
// Channels are voyage-public -- any member can create (by mentioning #name) and
// any member can participate. No private channels.

import { getAdminClient } from '@/lib/supabase/admin'
import {
  createChannelBranch,
  type BranchSession,
} from '@/lib/conversation/branches'

export interface VoyageChannelSummary {
  sessionId: string
  channelName: string
  createdAt: Date
}

interface ChannelRow {
  id: string
  branch_metadata: unknown
  created_at: string | null
}

const parseChannelName = (raw: unknown): string | null => {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (obj.kind === 'channel' && typeof obj.channelName === 'string') {
    return obj.channelName
  }
  return null
}

/**
 * List existing channels for a voyage. Returns the session id of the channel
 * branch plus its display name and creation time.
 */
export const listVoyageChannels = async (
  voyageSlug: string
): Promise<VoyageChannelSummary[]> => {
  const supabase = getAdminClient()

  const { data, error } = await (supabase as any)
    .from('sessions')
    .select('id, branch_metadata, created_at')
    .eq('voyage_slug', voyageSlug)
    .eq('branch_type', 'channel')
    .order('created_at', { ascending: true })

  if (error || !data) {
    if (error) console.error('[channels] listVoyageChannels error:', error)
    return []
  }

  const out: VoyageChannelSummary[] = []
  for (const row of data as ChannelRow[]) {
    const name = parseChannelName(row.branch_metadata)
    if (!name) continue
    out.push({
      sessionId: row.id,
      channelName: name,
      createdAt: new Date(row.created_at ?? Date.now()),
    })
  }
  return out
}

/**
 * Normalize a channel name. Strips a leading '#', lowercases, and collapses
 * runs of non-alphanumerics into single hyphens.
 */
const normalizeChannelName = (raw: string): string => {
  return raw
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Find or create a channel branch for (voyageSlug, channelName). Idempotent --
 * if a channel with that normalized name already exists for the voyage, the
 * existing session is returned.
 */
export const findOrCreateChannel = async (params: {
  voyageSlug: string
  channelName: string
  userId: string
  parentSessionId?: string | null
}): Promise<BranchSession | null> => {
  const supabase = getAdminClient()
  const normalized = normalizeChannelName(params.channelName)
  if (!normalized) return null

  // Try to find existing channel.
  const { data: existing } = await (supabase as any)
    .from('sessions')
    .select('*')
    .eq('voyage_slug', params.voyageSlug)
    .eq('branch_type', 'channel')
    .contains('branch_metadata', { kind: 'channel', channelName: normalized })
    .maybeSingle()

  if (existing) {
    const row = existing as {
      id: string
      user_id: string | null
      parent_session_id: string | null
      voyage_slug: string | null
      branch_metadata: unknown
      title: string | null
      created_at: string | null
      updated_at: string | null
    }
    return {
      id: row.id,
      userId: row.user_id,
      parentSessionId: row.parent_session_id,
      branchType: 'channel',
      voyageSlug: row.voyage_slug,
      title: row.title,
      metadata: { kind: 'channel', channelName: normalized },
      createdAt: new Date(row.created_at ?? Date.now()),
      updatedAt: new Date(row.updated_at ?? Date.now()),
    }
  }

  // Create new channel branch.
  return createChannelBranch({
    parentSessionId: params.parentSessionId ?? null,
    userId: params.userId,
    voyageSlug: params.voyageSlug,
    channelName: normalized,
  })
}

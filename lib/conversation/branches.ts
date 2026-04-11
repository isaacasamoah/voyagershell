// Slice 5: Conversation Branches
//
// Branches are sessions with branch_type set. They extend the `sessions` table
// additively -- a branch row IS a session, and its messages live in the
// existing public.messages table keyed by session_id. There is no separate
// "branch messages" table.
//
// Three branch types:
//   * 'tell'    -- reserved but unused. Tell mode is fire-and-forget on the
//                  sender's main thread via resolve_mention's existing one-off
//                  event path. We do NOT create tell branches.
//   * 'person'  -- @mention branch. Two (or more) participants. Plain text
//                  forwards to the other participant; a message prefixed with
//                  "voyager ..." is private counsel (LLM-only, not forwarded).
//   * 'channel' -- #channel branch. Voyage-wide. No private channels (by
//                  review ruling -- voyage-public only).
//
// The new session columns (parent_session_id, branch_type, voyage_slug,
// branch_metadata) are not yet in the generated Supabase types until the
// regeneration that runs after migration 036 is applied. We therefore use
// `(supabase as any)` casts on any row read/write that touches those columns,
// matching the pattern used for 033/034/035 in this repo.

import { getAdminClient } from '@/lib/supabase/admin'
import { loadConversationMessages, type ConversationMessage } from '@/lib/conversation'

// =============================================================================
// Types
// =============================================================================

export type BranchType = 'tell' | 'person' | 'channel'

export type BranchMetadata =
  | { kind: 'person'; participantUserIds: string[] }
  | { kind: 'channel'; channelName: string }

export interface BranchSession {
  id: string
  userId: string | null
  parentSessionId: string | null
  branchType: BranchType
  voyageSlug: string | null
  title: string | null
  metadata: BranchMetadata
  createdAt: Date
  updatedAt: Date
}

/** Runtime view of the branch context for the chat route. */
export interface BranchContext {
  sessionId: string
  branchType: BranchType
  parentSessionId: string | null
  voyageSlug: string | null
  metadata: BranchMetadata
  participantUserIds?: string[]
  channelName?: string
}

// =============================================================================
// Row helpers
// =============================================================================

interface BranchRow {
  id: string
  user_id: string | null
  parent_session_id: string | null
  branch_type: BranchType | null
  voyage_slug: string | null
  branch_metadata: unknown
  title: string | null
  created_at: string | null
  updated_at: string | null
}

const parseBranchMetadata = (raw: unknown): BranchMetadata | null => {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (obj.kind === 'person' && Array.isArray(obj.participantUserIds)) {
    return {
      kind: 'person',
      participantUserIds: obj.participantUserIds.filter(
        (x): x is string => typeof x === 'string'
      ),
    }
  }
  if (obj.kind === 'channel' && typeof obj.channelName === 'string') {
    return { kind: 'channel', channelName: obj.channelName }
  }
  return null
}

const transformBranchRow = (row: BranchRow): BranchSession | null => {
  if (!row.branch_type) return null
  const metadata = parseBranchMetadata(row.branch_metadata)
  if (!metadata) return null
  return {
    id: row.id,
    userId: row.user_id,
    parentSessionId: row.parent_session_id,
    branchType: row.branch_type,
    voyageSlug: row.voyage_slug,
    title: row.title,
    metadata,
    createdAt: new Date(row.created_at ?? Date.now()),
    updatedAt: new Date(row.updated_at ?? Date.now()),
  }
}

// =============================================================================
// Create
// =============================================================================

export interface CreatePersonBranchInput {
  parentSessionId: string
  userId: string
  voyageSlug: string | null
  participantUserIds: string[]
  title?: string
}

export interface CreateChannelBranchInput {
  parentSessionId: string | null
  userId: string
  voyageSlug: string
  channelName: string
  title?: string
}

export type CreateBranchInput =
  | ({ kind: 'person' } & CreatePersonBranchInput)
  | ({ kind: 'channel' } & CreateChannelBranchInput)

/**
 * Create a person branch session. The branch inherits its voyage scope from
 * the parent (voyageSlug may be null for personal-space branches).
 */
export const createPersonBranch = async (
  input: CreatePersonBranchInput
): Promise<BranchSession | null> => {
  const supabase = getAdminClient()

  // Ensure the creator is always in the participant list (idempotent).
  const uniqueParticipants = Array.from(
    new Set([input.userId, ...input.participantUserIds])
  )

  const insertRow = {
    user_id: input.userId,
    title: input.title ?? null,
    parent_session_id: input.parentSessionId,
    branch_type: 'person' as const,
    voyage_slug: input.voyageSlug,
    branch_metadata: {
      kind: 'person',
      participantUserIds: uniqueParticipants,
    },
  }

  const { data, error } = await (supabase as any)
    .from('sessions')
    .insert(insertRow)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[branches] createPersonBranch error:', error)
    return null
  }

  return transformBranchRow(data as BranchRow)
}

/**
 * Create a channel branch session. Channels are always voyage-scoped; callers
 * must supply a non-empty voyageSlug or this function returns null.
 */
export const createChannelBranch = async (
  input: CreateChannelBranchInput
): Promise<BranchSession | null> => {
  if (!input.voyageSlug) {
    console.error('[branches] createChannelBranch requires voyageSlug')
    return null
  }
  const supabase = getAdminClient()

  const insertRow = {
    user_id: input.userId,
    title: input.title ?? `#${input.channelName}`,
    parent_session_id: input.parentSessionId,
    branch_type: 'channel' as const,
    voyage_slug: input.voyageSlug,
    branch_metadata: {
      kind: 'channel',
      channelName: input.channelName,
    },
  }

  const { data, error } = await (supabase as any)
    .from('sessions')
    .insert(insertRow)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[branches] createChannelBranch error:', error)
    return null
  }

  return transformBranchRow(data as BranchRow)
}

/** Router that dispatches to the correct branch creator. */
export const createBranch = async (
  input: CreateBranchInput
): Promise<BranchSession | null> => {
  if (input.kind === 'person') {
    return createPersonBranch(input)
  }
  return createChannelBranch(input)
}

// =============================================================================
// Close
// =============================================================================

/**
 * Close a branch. We intentionally do NOT flip branch_type or delete rows --
 * branches persist forever (per spec's "attention decay" direction). Closing
 * simply triggers Cartographer enrichment over the branch's knowledge events
 * so any decisions / facts surfaced in the branch get promoted into the graph.
 *
 * The caller is expected to wrap this in waitUntil(); we do the enrichment
 * inline so callers with a platform-native waitUntil can fire-and-forget.
 */
export const closeBranch = async (params: {
  sessionId: string
  userId: string
  voyageSlug?: string | null
}): Promise<void> => {
  // Dynamic import to keep branches.ts free of the cartographer dependency
  // chain at module load (runCartographer pulls in the model router etc.).
  const { runCartographer } = await import('@/lib/agents/cartographer')
  try {
    await runCartographer({
      sessionId: params.sessionId,
      userId: params.userId,
      voyageSlug: params.voyageSlug ?? undefined,
    })
  } catch (error) {
    console.error('[branches] closeBranch cartographer error:', error)
  }
}

// =============================================================================
// Read
// =============================================================================

/**
 * Fetch the branch context for a session, or null if the session is not a
 * branch. Called by the chat route to decide whether to inject branch
 * metadata into the dynamic system prompt.
 */
export const getBranchContext = async (
  sessionId: string
): Promise<BranchContext | null> => {
  const supabase = getAdminClient()

  const { data, error } = await (supabase as any)
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[branches] getBranchContext error:', error)
    return null
  }

  const row = data as BranchRow
  if (!row.branch_type) return null
  const metadata = parseBranchMetadata(row.branch_metadata)
  if (!metadata) return null

  const ctx: BranchContext = {
    sessionId: row.id,
    branchType: row.branch_type,
    parentSessionId: row.parent_session_id,
    voyageSlug: row.voyage_slug,
    metadata,
  }
  if (metadata.kind === 'person') {
    ctx.participantUserIds = metadata.participantUserIds
  } else {
    ctx.channelName = metadata.channelName
  }
  return ctx
}

/**
 * Return all messages for a branch session. Thin passthrough to
 * loadConversationMessages so the chat route has a branch-aware entry point
 * that can be extended later (e.g. to filter private_counsel messages out of
 * the other participant's view).
 */
export const getBranchMessages = async (params: {
  sessionId: string
  userId: string
}): Promise<ConversationMessage[]> => {
  return loadConversationMessages(params.sessionId)
}

// =============================================================================
// Routing
// =============================================================================

export type BranchRoute = 'other_person' | 'private_counsel' | 'channel'

/**
 * Pure router for a user message posted inside a branch.
 *
 * Person branch rules:
 *   * Message starting with "voyager " (case-insensitive, optional leading
 *     whitespace)      → 'private_counsel' (LLM responds, peer does not see).
 *   * Anything else    → 'other_person'    (forward to the peer, no LLM turn).
 *
 * Channel branch rules:
 *   * Everything       → 'channel' (broadcast to voyage members).
 */
export const routeBranchMessage = (params: {
  branchSession: BranchSession | BranchContext
  senderUserId: string
  content: string
}): BranchRoute => {
  const { branchSession, content } = params
  if (branchSession.branchType === 'channel') {
    return 'channel'
  }
  if (branchSession.branchType === 'person') {
    const trimmed = content.replace(/^\s+/, '')
    if (/^voyager\b/i.test(trimmed)) {
      return 'private_counsel'
    }
    return 'other_person'
  }
  // 'tell' type should never get here in practice, but fall through to
  // counsel so the LLM still gets a chance to respond if it ever does.
  return 'private_counsel'
}

// =============================================================================
// Intent detection helpers
// =============================================================================

/**
 * Detect whether a message is a "tell"-intent one-off (should NOT branch).
 * Examples:
 *   "tell tom the fix is ready"
 *   "let sarah know we're good"
 *   "message tom: deploy is done"
 *
 * Returns true when the sender wants fire-and-forget delivery. The caller
 * (resolve_mention) uses this to take the existing one-off path explicitly
 * rather than ever routing a tell through the branch creator.
 */
export const isTellIntent = (message: string): boolean => {
  const trimmed = message.trim().toLowerCase()
  if (!trimmed) return false
  // "tell <name>" / "tell everyone"
  if (/^tell\s+\S+/i.test(trimmed)) return true
  // "let <name> know"
  if (/^let\s+\S+\s+know\b/i.test(trimmed)) return true
  // "message <name>" (short form)
  if (/^message\s+\S+/i.test(trimmed)) return true
  return false
}

/**
 * Detect whether a message is a branch-invitation @mention (as opposed to a
 * one-off announcement).
 *
 * HEURISTIC: a message that starts with "@<name>" is treated as a branch
 * invitation when it either ends with a question mark OR contains multiple
 * sentences. The reasoning is that a branch is for ongoing dialogue -- so
 * either the sender is asking something (expecting a reply) or has enough
 * to say that it warrants a threaded conversation. A single declarative
 * sentence is still a tell-style one-off.
 *
 * Isaac: tune this rule freely; the call site prints a HEURISTIC comment.
 */
export const isBranchInviteMention = (message: string): boolean => {
  const trimmed = message.trim()
  if (!trimmed.startsWith('@')) return false
  if (/\?\s*$/.test(trimmed)) return true
  // Multiple sentences = threaded dialogue intent.
  const sentenceTerminators = trimmed.match(/[.!?](\s|$)/g)
  if (sentenceTerminators && sentenceTerminators.length >= 2) return true
  return false
}

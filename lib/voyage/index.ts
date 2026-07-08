// Voyage service for Slice 4: First Community
// Manages voyages (communities), membership, and configuration

import { getAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/debug';
import type { VoyageConfig } from '@/lib/prompts/types';
import type {
  Voyage,
  VoyageMember,
  VoyageMembership,
  VoyageRole,
  CreateVoyageInput,
  UpdateVoyageInput,
  VoyageRow,
  VoyageMemberRow,
  UserVoyageRow,
} from './types';

// Re-export types
export * from './types';

// Admin client for voyage operations (team management, cross-user queries)
// Note: User membership checks use userId in params
const getAdminSupabase = () => getAdminClient();

// =============================================================================
// TRANSFORM FUNCTIONS
// =============================================================================

const transformVoyage = (row: VoyageRow): Voyage => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  isPublic: row.is_public,
  inviteCode: row.invite_code,
  config: row.settings as VoyageConfig | null,
  createdBy: row.created_by,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const transformMember = (row: VoyageMemberRow & { profiles?: { email?: string; display_name?: string } }): VoyageMember => ({
  id: row.id,
  voyageId: row.voyage_id,
  userId: row.user_id,
  role: row.role,
  nickname: row.nickname ?? undefined,
  notificationsEnabled: row.notifications_enabled,
  joinedAt: new Date(row.joined_at),
  email: row.profiles?.email,
  displayName: row.profiles?.display_name,
});

const transformMembership = (row: UserVoyageRow): VoyageMembership => ({
  voyageId: row.voyage_id,
  slug: row.slug,
  name: row.name,
  role: row.role,
  joinedAt: new Date(row.joined_at),
});

// =============================================================================
// VOYAGE CRUD
// =============================================================================

/**
 * Create a new voyage with the creator as captain.
 */
export const createVoyage = async (
  input: CreateVoyageInput,
  userId: string
): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  log.voyage('Creating voyage', { name: input.name, userId });

  try {
    // Use the database function that creates voyage + adds captain

    const { data: voyageId, error: createError } = await supabase.rpc(
      'create_voyage_with_captain',
      {
        p_name: input.name,
        p_slug: input.slug,
        p_description: input.description || '',
        p_user_id: userId,
      }
    );

    if (createError) {
      log.voyage('Create voyage error', { error: createError.message }, 'error');
      return null;
    }

    if (!voyageId) {
      log.voyage('No voyage ID returned', undefined, 'error');
      return null;
    }

    // Fetch the created voyage
    return getVoyageById(voyageId);
  } catch (error) {
    log.voyage('createVoyage error', { error: String(error) }, 'error');
    return null;
  }
};

/**
 * Get a voyage by its ID.
 */
export const getVoyageById = async (voyageId: string): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();

  try {

    const { data, error } = await supabase
      .from('voyages')
      .select('*')
      .eq('id', voyageId)
      .single();

    if (error) {
      log.voyage('getVoyageById error', { error: error.message, voyageId }, 'error');
      return null;
    }

    return transformVoyage(data as VoyageRow);
  } catch (error) {
    log.voyage('getVoyageById error', { error: String(error), voyageId }, 'error');
    return null;
  }
};

/**
 * Get a voyage by its slug.
 */
export const getVoyageBySlug = async (slug: string): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  log.voyage('Getting voyage by slug', { slug });

  try {

    const { data, error } = await supabase
      .from('voyages')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      log.voyage('getVoyageBySlug error', { error: error.message, slug }, 'error');
      return null;
    }

    return transformVoyage(data as VoyageRow);
  } catch (error) {
    log.voyage('getVoyageBySlug error', { error: String(error), slug }, 'error');
    return null;
  }
};

/**
 * Update a voyage's settings.
 */
export const updateVoyage = async (
  voyageId: string,
  input: UpdateVoyageInput
): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  log.voyage('Updating voyage', { voyageId });

  try {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isPublic !== undefined) updates.is_public = input.isPublic;
    if (input.config !== undefined) {
      // Merge with existing config
      const current = await getVoyageById(voyageId);
      updates.settings = { ...current?.config, ...input.config };
    }

    const { data, error } = await supabase
      .from('voyages')
      .update(updates)
      .eq('id', voyageId)
      .select()
      .single();

    if (error) {
      log.voyage('updateVoyage error', { error: error.message, voyageId }, 'error');
      return null;
    }

    return transformVoyage(data as VoyageRow);
  } catch (error) {
    log.voyage('updateVoyage error', { error: String(error), voyageId }, 'error');
    return null;
  }
};

// =============================================================================
// USER VOYAGES
// =============================================================================

/**
 * Get all voyages a user is a member of.
 */
/**
 * The slug of the voyage the user was MOST RECENTLY active in (or null for
 * personal / no active session). Powers "resume where I was" — resolved in the
 * voyage-context layer so the conversation-load path stays untouched.
 */
export const getLastActiveVoyageSlug = async (userId: string): Promise<string | null> => {
  const supabase = getAdminSupabase()
  const { data: session } = await supabase
    .from('sessions')
    .select('voyage_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const voyageId = (session as { voyage_id: string | null } | null)?.voyage_id
  if (!voyageId) return null
  const { data: v } = await supabase.from('voyages').select('slug').eq('id', voyageId).maybeSingle()
  return (v as { slug: string } | null)?.slug ?? null
}

export const getUserVoyages = async (userId: string): Promise<VoyageMembership[]> => {
  const supabase = getAdminSupabase();
  log.voyage('Getting voyages for user', { userId });

  try {

    const { data, error } = await supabase.rpc('get_user_voyages', {
      p_user_id: userId,
    });

    if (error) {
      log.voyage('getUserVoyages error', { error: error.message, userId }, 'error');
      return [];
    }

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return (data as UserVoyageRow[]).map(transformMembership);
  } catch (error) {
    log.voyage('getUserVoyages error', { error: String(error), userId }, 'error');
    return [];
  }
};

// =============================================================================
// ROLE QUERIES
// =============================================================================

/**
 * Get a user's role in a voyage.
 */
export const getUserRole = async (
  voyageSlug: string,
  userId: string
): Promise<VoyageRole | null> => {
  const supabase = getAdminSupabase();

  try {

    const { data, error } = await supabase.rpc('get_voyage_role', {
      p_voyage_slug: voyageSlug,
      p_user_id: userId,
    });

    if (error) {
      log.voyage('getUserRole error', { error: error.message, voyageSlug, userId }, 'error');
      return null;
    }

    return data as VoyageRole | null;
  } catch (error) {
    log.voyage('getUserRole error', { error: String(error), voyageSlug, userId }, 'error');
    return null;
  }
};

/**
 * Check if user is captain of a voyage.
 */
export const isCaptain = async (voyageSlug: string, userId: string): Promise<boolean> => {
  const supabase = getAdminSupabase();

  try {

    const { data, error } = await supabase.rpc('is_voyage_captain', {
      p_voyage_slug: voyageSlug,
      p_user_id: userId,
    });

    if (error) {
      log.voyage('isCaptain error', { error: error.message, voyageSlug, userId }, 'error');
      return false;
    }

    return data === true;
  } catch (error) {
    log.voyage('isCaptain error', { error: String(error), voyageSlug, userId }, 'error');
    return false;
  }
};

// =============================================================================
// MEMBERSHIP
// =============================================================================

/**
 * Get all members of a voyage.
 */
/**
 * Resolve a name to a single voyage member (case-insensitive display_name /
 * nickname match). ONE implementation — shared by send_message, the room tools,
 * and the deterministic +/- handler so the matching never drifts. Returns the
 * member, or null (not found / ambiguous / self — caller decides messaging).
 */
export const resolveMemberByName = (
  members: Array<{ userId: string; displayName?: string | null; nickname?: string | null; email?: string | null }>,
  name: string
): { userId: string; displayName: string } | null => {
  const lower = name.toLowerCase().trim()
  const matches = members.filter((m) => {
    const dn = m.displayName?.toLowerCase() ?? ''
    const nn = m.nickname?.toLowerCase() ?? ''
    if (dn === lower || dn.startsWith(lower + ' ') || dn.split(' ').some((part) => part === lower)) return true
    if (nn && nn === lower) return true
    return false
  })
  if (matches.length !== 1) return null
  return { userId: matches[0].userId, displayName: matches[0].displayName ?? matches[0].email ?? name }
}

export const getVoyageMembers = async (voyageId: string): Promise<VoyageMember[]> => {
  const supabase = getAdminSupabase();
  log.voyage('Getting members for voyage', { voyageId });

  try {

    const { data, error } = await supabase
      .from('voyage_members')
      .select(`
        *,
        profiles:user_id (
          email,
          display_name
        )
      `)
      .eq('voyage_id', voyageId)
      .order('joined_at', { ascending: true });

    if (error) {
      log.voyage('getVoyageMembers error', { error: error.message, voyageId }, 'error');
      return [];
    }

    return (data as (VoyageMemberRow & { profiles: { email: string; display_name: string } })[])
      .map(transformMember);
  } catch (error) {
    log.voyage('getVoyageMembers error', { error: String(error), voyageId }, 'error');
    return [];
  }
};
// =============================================================================
// INVITE MANAGEMENT
// =============================================================================
/**
 * Regenerate a voyage's invite code (captain only).
 */
export const regenerateInviteCode = async (
  voyageId: string,
  userId: string
): Promise<string | null> => {
  const supabase = getAdminSupabase();
  log.voyage('Regenerating invite code', { voyageId });

  try {

    const { data, error } = await supabase.rpc('regenerate_voyage_invite', {
      p_voyage_id: voyageId,
      p_user_id: userId,
    });

    if (error) {
      log.voyage('regenerateInviteCode error', { error: error.message, voyageId }, 'error');
      return null;
    }

    return data as string | null;
  } catch (error) {
    log.voyage('regenerateInviteCode error', { error: String(error), voyageId }, 'error');
    return null;
  }
};

// =============================================================================
// VOYAGE INVITES (Invite-as-Magic-Link)
// =============================================================================

export interface SendVoyageInviteInput {
  email: string
  voyageSlug: string
  invitedBy: string
  inviterDisplayName: string
}

export interface SendVoyageInviteResult {
  success: boolean
  error?: string
  alreadyInvited?: boolean
}

/**
 * Send a voyage invite: generate magic link, send branded email, create invite record.
 * Tool does auth/validation, this function does execution.
 */
export const sendVoyageInvite = async (input: SendVoyageInviteInput): Promise<SendVoyageInviteResult> => {
  const { email, voyageSlug, invitedBy, inviterDisplayName } = input
  const normalizedEmail = email.trim().toLowerCase()
  const supabase = getAdminSupabase()

  try {
    // Resolve voyage
    const voyage = await getVoyageBySlug(voyageSlug)
    if (!voyage) {
      return { success: false, error: 'Voyage not found' }
    }

    // Check for existing pending invite (idempotent)
    // Cast: voyage_invites not in generated types until migration runs + types regen
    const { data: existing } = await (supabase as any)
      .from('voyage_invites')
      .select('id')
      .eq('voyage_id', voyage.id)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      return { success: true, alreadyInvited: true }
    }

    // Generate magic link token via Supabase admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      log.voyage('generateLink error for invite', { error: linkError?.message }, 'error')
      return { success: false, error: 'Failed to generate magic link' }
    }

    // Build callback URL with voyage as direct query param
    const { getBaseUrl } = await import('@/lib/auth')
    const baseUrl = getBaseUrl()
    const callbackUrl = `${baseUrl}/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink&voyage=${encodeURIComponent(voyageSlug)}`

    // Send branded invite email via Resend
    const { inviteEmailHtml, inviteEmailText } = await import('@/emails/magic-link')

    if (!process.env.RESEND_API_KEY) {
      log.voyage('Invite link (dev mode — no Resend key)', { callbackUrl })
      // Still create the invite record in dev
    } else {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'Voyager Shell <onboarding@resend.dev>',
        to: normalizedEmail,
        subject: `${inviterDisplayName} invited you to ${voyage.name}`,
        html: inviteEmailHtml(callbackUrl, voyage.name, inviterDisplayName),
        text: inviteEmailText(callbackUrl, voyage.name, inviterDisplayName),
      })

      if (sendError) {
        log.voyage('Resend invite error', { error: String(sendError) }, 'error')
        return { success: false, error: 'Failed to send invite email' }
      }
    }

    // Create invite record
    const { error: insertError } = await (supabase as any)
      .from('voyage_invites')
      .insert({
        voyage_id: voyage.id,
        email: normalizedEmail,
        invited_by: invitedBy,
        status: 'pending',
      })

    if (insertError) {
      log.voyage('Insert invite error', { error: insertError.message }, 'error')
      return { success: false, error: 'Failed to record invite' }
    }

    log.voyage('Voyage invite sent', { email: normalizedEmail, voyage: voyageSlug })
    return { success: true }
  } catch (error) {
    log.voyage('sendVoyageInvite error', { error: String(error) }, 'error')
    return { success: false, error: 'Failed to send invite' }
  }
}

/**
 * Accept a voyage invite: join the voyage and mark invite accepted.
 * Called from auth callback when voyage param is present.
 */
export const acceptVoyageInvite = async (
  userEmail: string,
  userId: string,
  voyageSlug: string
): Promise<{ joined: boolean; alreadyMember: boolean }> => {
  const normalizedEmail = userEmail.trim().toLowerCase()
  const supabase = getAdminSupabase()

  try {
    // Resolve voyage
    const voyage = await getVoyageBySlug(voyageSlug)
    if (!voyage) {
      log.voyage('acceptVoyageInvite: voyage not found', { voyageSlug })
      return { joined: false, alreadyMember: false }
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('voyage_members')
      .select('id')
      .eq('voyage_id', voyage.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingMember) {
      return { joined: false, alreadyMember: true }
    }

    // Look up pending invite
    // Cast: voyage_invites not in generated types until migration runs + types regen
    const { data: invite } = await (supabase as any)
      .from('voyage_invites')
      .select('id')
      .eq('voyage_id', voyage.id)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle()

    if (!invite) {
      log.voyage('acceptVoyageInvite: no pending invite found', { email: normalizedEmail, voyageSlug })
      return { joined: false, alreadyMember: false }
    }

    // Join voyage as crew
    const { error: joinError } = await supabase
      .from('voyage_members')
      .insert({
        voyage_id: voyage.id,
        user_id: userId,
        role: 'crew',
      })

    if (joinError) {
      log.voyage('acceptVoyageInvite: join error', { error: joinError.message }, 'error')
      return { joined: false, alreadyMember: false }
    }

    // Mark invite accepted
    await (supabase as any)
      .from('voyage_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    log.voyage('Voyage invite accepted', { email: normalizedEmail, voyageSlug, userId })
    return { joined: true, alreadyMember: false }
  } catch (error) {
    log.voyage('acceptVoyageInvite error', { error: String(error) }, 'error')
    return { joined: false, alreadyMember: false }
  }
}

// =============================================================================
// VOYAGE CONTEXT (for system prompt — F1: Membership Awareness)
// =============================================================================

export interface VoyageContextMember {
  displayName: string
  role: VoyageRole
  isCurrentUser: boolean
  lastActive: string // "2h ago", "new", etc.
}

export interface VoyageContext {
  name: string
  members: VoyageContextMember[]
  totalMembers: number
}

/** Relative time formatting for activity pulse */
const formatActivityAge = (date: Date | null): string => {
  if (!date) return 'new'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Load voyage context for the system prompt.
 * Fetches voyage metadata, members, and per-member activity pulse in parallel.
 * Returns null if voyage not found.
 *
 * Activity pulse: MAX(created_at) on knowledge_events per member in the voyage.
 * Token budget: <= 150 tokens for <= 10 members.
 */

/**
 * Load voyage context for the system prompt.
 * Fetches voyage metadata, members, and per-member activity pulse in parallel.
 * Returns null if voyage not found.
 *
 * Activity pulse: MAX(created_at) on knowledge_events per member in the voyage.
 * Token budget: <= 150 tokens for <= 10 members.
 */
export const loadVoyageContext = async (
  voyageSlug: string,
  currentUserId: string
): Promise<VoyageContext | null> => {
  const supabase = getAdminSupabase()

  // Step 1: Get voyage by slug
  const voyage = await getVoyageBySlug(voyageSlug)
  if (!voyage) return null

  // Step 2: Get members + activity pulse in parallel
  // Activity pulse: fetch recent events (capped at 200 rows) and dedup client-side.
  // With DESC order, the first row per user_id is their most recent activity.
  const [members, activityData] = await Promise.all([
    getVoyageMembers(voyage.id),
    supabase
      .from('knowledge_events')
      .select('user_id, created_at')
      .eq('voyage_slug', voyageSlug)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  // Build activity map: user_id → most recent created_at
  const activityMap = new Map<string, Date>()
  if (activityData.data) {
    for (const row of activityData.data) {
      const uid = row.user_id as string
      if (!activityMap.has(uid)) {
        activityMap.set(uid, new Date(row.created_at as string))
      }
    }
  }

  // Sort members: by role (captain first), then join date
  const sorted = [...members].sort((a, b) => {
    if (a.role === 'captain' && b.role !== 'captain') return -1
    if (a.role !== 'captain' && b.role === 'captain') return 1
    return a.joinedAt.getTime() - b.joinedAt.getTime()
  })

  // Truncate to 10 members for token budget
  const displayed = sorted.slice(0, 10)
  const totalMembers = members.length

  const contextMembers: VoyageContextMember[] = displayed.map(m => {
    // Display name fallback: display_name → email prefix → "Unknown"
    let displayName = m.displayName ?? ''
    if (!displayName && m.email) {
      displayName = m.email.split('@')[0]
    }
    if (!displayName) {
      displayName = 'Unknown'
    }

    return {
      displayName,
      role: m.role,
      isCurrentUser: m.userId === currentUserId,
      lastActive: formatActivityAge(activityMap.get(m.userId) ?? null),
    }
  })

  return {
    name: voyage.name,
    members: contextMembers,
    totalMembers,
  }
}

/**
 * Format VoyageContext into a compact prompt section.
 * Target: <= 150 tokens for <= 10 members.
 */
export const formatVoyageContextSection = (ctx: VoyageContext): string => {
  const lines = [`# Current Voyage`, `**${ctx.name}**`, '']

  for (const m of ctx.members) {
    const youMarker = m.isCurrentUser ? ' (you)' : ''
    lines.push(`- ${m.displayName} (${m.role})${youMarker} — ${m.lastActive}`)
  }

  if (ctx.totalMembers > ctx.members.length) {
    const remaining = ctx.totalMembers - ctx.members.length
    lines.push(`- +${remaining} others`)
  }

  return lines.join('\n')
}

// =============================================================================
// SERVER-AUTHORITATIVE MEMBERSHIP VERIFICATION
// =============================================================================

/**
 * Error thrown when a conversation does not belong to the claimed voyage,
 * or when the user is not a member of the claimed voyage.
 * Callers should return HTTP 403.
 */
/**
 * Assert that `userId` is a member of the voyage identified by `slug`,
 * and (when `conversationId` is provided) that the conversation belongs
 * to that voyage.
 *
 * Returns the voyage's UUID (voyageId) on success.
 * (superseded by resolveSessionVoyage in messaging v2)
 *
 * Design: uses get_voyage_role RPC (returns NULL for non-members) to
 * verify membership, then optionally validates the session's voyage_id.
 */
/**
 * SessionAccessError — the caller's conversationId points at a session they
 * don't own. A hard 403 (security), distinct from "personal space".
 */
export class SessionAccessError extends Error {
  constructor() {
    super('session_access_denied')
    this.name = 'SessionAccessError'
  }
}

/**
 * Messaging v2 — the session IS the context. Resolve a turn's voyage from the
 * session it belongs to, not from a client-supplied field. One source of
 * truth: the session's voyage_id. Returns the voyage slug, or null for
 * personal space. Throws SessionAccessError if the session isn't the caller's.
 */
export const resolveSessionVoyage = async (
  conversationId: string | undefined,
  userId: string
): Promise<string | null> => {
  if (!conversationId) return null // no session yet → personal

  const supabase = getAdminSupabase()
  const { data: session, error } = await supabase
    .from('sessions')
    .select('user_id, voyage_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (error) {
    // A DB/transport error is a 500, not a 403 — don't misreport it as an
    // access denial (correctness review P3). Fail loud, not fail-closed-wrong.
    log.voyage('resolveSessionVoyage: lookup error', { error: error.message, conversationId }, 'error')
    throw new Error(`resolveSessionVoyage lookup failed: ${error.message}`)
  }
  // A supplied-but-unknown session id is rejected, not silently treated as
  // personal — otherwise the route would emit an orphan knowledge event
  // against a bogus session (codex review). Legit clients always hold a real
  // conversationId from /api/conversation before sending.
  if (!session) {
    log.voyage('resolveSessionVoyage: unknown session', { conversationId }, 'warn')
    throw new SessionAccessError()
  }

  const row = session as { user_id: string | null; voyage_id: string | null }
  if (row.user_id !== userId) {
    log.voyage('resolveSessionVoyage: ownership mismatch', { conversationId, sessionUser: row.user_id, caller: userId }, 'warn')
    throw new SessionAccessError()
  }
  if (!row.voyage_id) return null // personal session

  const { data: voyage } = await supabase
    .from('voyages')
    .select('slug')
    .eq('id', row.voyage_id)
    .maybeSingle()
  const slug = (voyage as { slug: string } | null)?.slug ?? null
  if (!slug) return null // dangling voyage_id → degrade to personal, safe

  // Membership check — session creation does NOT verify membership (RLS only
  // gates user_id), so a user could bind a session to a voyage they're not in.
  // Verify per turn, as the old assertVoyageMembership did, before trusting the
  // voyage for scoped context/writes (codex review, security).
  const { data: role, error: roleError } = await supabase.rpc('get_voyage_role', {
    p_voyage_slug: slug,
    p_user_id: userId,
  })
  if (roleError) {
    log.voyage('resolveSessionVoyage: role check failed', { error: roleError.message, slug }, 'error')
    throw new Error(`resolveSessionVoyage role check failed: ${roleError.message}`)
  }
  if (!role) {
    log.voyage('resolveSessionVoyage: not a voyage member', { conversationId, slug, userId }, 'warn')
    throw new SessionAccessError()
  }
  return slug
}

/**
 * Generate a URL-friendly slug from a name.
 */
export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
};

/**
 * Check if a slug is available.
 */
export const isSlugAvailable = async (slug: string): Promise<boolean> => {
  const voyage = await getVoyageBySlug(slug);
  return voyage === null;
};

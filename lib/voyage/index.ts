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

/**
 * Update a member's role in a voyage.
 */
export const updateMemberRole = async (
  voyageId: string,
  userId: string,
  newRole: VoyageRole
): Promise<boolean> => {
  const supabase = getAdminSupabase();
  log.voyage('Updating member role', { voyageId, userId, newRole });

  try {

    const { error } = await supabase
      .from('voyage_members')
      .update({ role: newRole })
      .eq('voyage_id', voyageId)
      .eq('user_id', userId);

    if (error) {
      log.voyage('updateMemberRole error', { error: error.message, voyageId, userId }, 'error');
      return false;
    }

    return true;
  } catch (error) {
    log.voyage('updateMemberRole error', { error: String(error), voyageId, userId }, 'error');
    return false;
  }
};

/**
 * Delete a voyage.
 */
export const deleteVoyage = async (voyageId: string): Promise<boolean> => {
  const supabase = getAdminSupabase();

  try {
    const { error } = await supabase
      .from('voyages')
      .delete()
      .eq('id', voyageId);

    if (error) {
      log.voyage('deleteVoyage error', { error: error.message, voyageId }, 'error');
      return false;
    }

    return true;
  } catch (error) {
    log.voyage('deleteVoyage error', { error: String(error), voyageId }, 'error');
    return false;
  }
};

/**
 * Leave a voyage (remove own membership).
 */
export const leaveVoyage = async (voyageId: string, userId: string): Promise<boolean> => {
  const supabase = getAdminSupabase();

  try {
    const { error } = await supabase
      .from('voyage_members')
      .delete()
      .eq('voyage_id', voyageId)
      .eq('user_id', userId);

    if (error) {
      log.voyage('leaveVoyage error', { error: error.message, voyageId, userId }, 'error');
      return false;
    }

    return true;
  } catch (error) {
    log.voyage('leaveVoyage error', { error: String(error), voyageId, userId }, 'error');
    return false;
  }
};

// =============================================================================
// INVITE MANAGEMENT
// =============================================================================

/**
 * Join a voyage using an invite code.
 */
export const joinVoyageByCode = async (
  inviteCode: string,
  userId: string
): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  log.voyage('Joining voyage with code', { inviteCode });

  try {
    // Use the database function

    const { data: voyageId, error } = await supabase.rpc('join_voyage_by_code', {
      p_invite_code: inviteCode,
      p_user_id: userId,
    });

    if (error) {
      log.voyage('joinVoyageByCode error', { error: error.message, inviteCode }, 'error');
      return null;
    }

    if (!voyageId) {
      log.voyage('Invalid invite code', { inviteCode });
      return null;
    }

    // Fetch the voyage
    return getVoyageById(voyageId);
  } catch (error) {
    log.voyage('joinVoyageByCode error', { error: String(error), inviteCode }, 'error');
    return null;
  }
};

/**
 * Get voyage by invite code (for preview before joining).
 */
export const getVoyageByInviteCode = async (inviteCode: string): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  log.voyage('Looking up voyage by invite code', { inviteCode });

  try {

    const { data, error } = await supabase
      .from('voyages')
      .select('*')
      .eq('invite_code', inviteCode)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      log.voyage('getVoyageByInviteCode error', { error: error.message, inviteCode }, 'error');
      return null;
    }

    return transformVoyage(data as VoyageRow);
  } catch (error) {
    log.voyage('getVoyageByInviteCode error', { error: String(error), inviteCode }, 'error');
    return null;
  }
};

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
// DELIVERY MARKING (Sentinel)
// =============================================================================

/**
 * Mark awareness items as delivered after they've been surfaced in a turn.
 * Updates delivery_status from 'pending' to 'delivered' — these items
 * will never re-appear in loadAwareness().
 *
 * Called in onFinish (after assistant response) — fire-and-forget via waitUntil.
 * Only marks items that were loaded for this turn (not all pending).
 */
export const markDelivered = async (
  userId: string,
  voyageSlug: string,
  awarenessItems: Array<{ eventId: string }>
): Promise<void> => {
  if (awarenessItems.length === 0) return

  const supabase = getAdminSupabase()
  const eventIds = awarenessItems.map(item => item.eventId)

  const { error } = await supabase
    .from('knowledge_current')
    .update({ delivery_status: 'delivered' })
    .in('event_id', eventIds)
    .eq('delivery_status', 'pending')

  if (error) {
    log.voyage('markDelivered error', { error: error.message }, 'error')
  }
}

// =============================================================================
// LAST SEEN TRACKING
// =============================================================================

/**
 * Update last_seen_at for a user in a voyage.
 * Called in onFinish (after assistant response) — fire-and-forget via waitUntil.
 * Messages surfaced THIS turn remain "pending" until Voyager has responded.
 */
export const updateLastSeen = async (userId: string, voyageSlug: string): Promise<void> => {
  const supabase = getAdminSupabase();
  try {
    // Resolve voyage_id from slug
    const { data: voyage, error: voyageError } = await supabase
      .from('voyages')
      .select('id')
      .eq('slug', voyageSlug)
      .single();

    if (voyageError || !voyage) return;

    const { error } = await supabase
      .from('voyage_members')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('voyage_id', voyage.id);

    if (error) {
      log.voyage('updateLastSeen error', { error: error.message, userId, voyageSlug }, 'error');
    }
  } catch (error) {
    log.voyage('updateLastSeen error', { error: String(error), userId, voyageSlug }, 'error');
  }
};

// =============================================================================
// SLUG UTILITIES
// =============================================================================

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

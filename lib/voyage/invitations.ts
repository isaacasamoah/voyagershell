import { log } from '@/lib/debug'
import { getAdminClient } from '@/lib/supabase/admin'
import { getVoyageBySlug } from './core'

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

export const sendVoyageInvite = async (
  input: SendVoyageInviteInput,
): Promise<SendVoyageInviteResult> => {
  const { email, voyageSlug, invitedBy, inviterDisplayName } = input
  const normalizedEmail = email.trim().toLowerCase()
  const admin = getAdminClient()
  try {
    const voyage = await getVoyageBySlug(voyageSlug)
    if (!voyage) return { success: false, error: 'Voyage not found' }

    const { data: existing } = await admin.from('voyage_invites')
      .select('id').eq('voyage_id', voyage.id).eq('email', normalizedEmail)
      .eq('status', 'pending').maybeSingle()
    if (existing) return { success: true, alreadyInvited: true }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    })
    if (linkError || !linkData?.properties?.hashed_token) {
      log.voyage('generateLink error for invite', { error: linkError?.message }, 'error')
      return { success: false, error: 'Failed to generate magic link' }
    }

    const { getBaseUrl } = await import('@/lib/auth')
    const baseUrl = getBaseUrl()
    const callbackUrl = `${baseUrl}/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink&voyage=${encodeURIComponent(voyageSlug)}`
    const { inviteEmailHtml, inviteEmailText } = await import('@/emails/magic-link')
    if (!process.env.RESEND_API_KEY) {
      log.voyage('Invite link (dev mode — no Resend key)', { callbackUrl })
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

    const { error: insertError } = await admin.from('voyage_invites').insert({
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

export const acceptVoyageInvite = async (
  userEmail: string,
  userId: string,
  voyageSlug: string,
): Promise<{ joined: boolean; alreadyMember: boolean }> => {
  const normalizedEmail = userEmail.trim().toLowerCase()
  const admin = getAdminClient()
  try {
    const voyage = await getVoyageBySlug(voyageSlug)
    if (!voyage) return { joined: false, alreadyMember: false }

    const { data: existingMember } = await admin.from('voyage_members')
      .select('id, state').eq('voyage_id', voyage.id).eq('user_id', userId).maybeSingle()
    if ((existingMember as { state?: string } | null)?.state === 'active') {
      return { joined: false, alreadyMember: true }
    }
    const { data: invite } = await admin.from('voyage_invites')
      .select('id').eq('voyage_id', voyage.id).eq('email', normalizedEmail)
      .eq('status', 'pending').maybeSingle()
    if (!invite) {
      log.voyage('acceptVoyageInvite: no pending invite found', { email: normalizedEmail, voyageSlug })
      return { joined: false, alreadyMember: false }
    }

    const membershipWrite = existingMember
      ? admin.from('voyage_members').update({ state: 'active', role: 'crew' }).eq('id', existingMember.id)
      : admin.from('voyage_members').insert({ voyage_id: voyage.id, user_id: userId, role: 'crew' })
    const { error: joinError } = await membershipWrite
    if (joinError) {
      log.voyage('acceptVoyageInvite: join error', { error: joinError.message }, 'error')
      return { joined: false, alreadyMember: false }
    }
    await admin.from('voyage_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', invite.id)
    log.voyage('Voyage invite accepted', { email: normalizedEmail, voyageSlug, userId })
    return { joined: true, alreadyMember: false }
  } catch (error) {
    log.voyage('acceptVoyageInvite error', { error: String(error) }, 'error')
    return { joined: false, alreadyMember: false }
  }
}

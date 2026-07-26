import { log } from '@/lib/debug'
import { getAdminClient } from '@/lib/supabase/admin'
import { transformVoyage } from './transforms'
import type { CreateVoyageInput, UpdateVoyageInput, Voyage, VoyageRow } from './types'

export const createVoyage = async (
  input: CreateVoyageInput,
  userId: string,
): Promise<Voyage | null> => {
  const admin = getAdminClient()
  log.voyage('Creating voyage', { name: input.name, userId })
  try {
    const { data: voyageId, error } = await admin.rpc('create_voyage_with_captain', {
      p_name: input.name,
      p_slug: input.slug,
      p_description: input.description || '',
      p_user_id: userId,
    })
    if (error || !voyageId) {
      log.voyage('Create voyage error', { error: error?.message }, 'error')
      return null
    }
    return getVoyageById(voyageId)
  } catch (error) {
    log.voyage('createVoyage error', { error: String(error) }, 'error')
    return null
  }
}

export const getVoyageById = async (voyageId: string): Promise<Voyage | null> => {
  try {
    const { data, error } = await getAdminClient().from('voyages')
      .select('*').eq('id', voyageId).single()
    if (error) {
      log.voyage('getVoyageById error', { error: error.message, voyageId }, 'error')
      return null
    }
    return transformVoyage(data as VoyageRow)
  } catch (error) {
    log.voyage('getVoyageById error', { error: String(error), voyageId }, 'error')
    return null
  }
}

export const getVoyageBySlug = async (slug: string): Promise<Voyage | null> => {
  log.voyage('Getting voyage by slug', { slug })
  try {
    const { data, error } = await getAdminClient().from('voyages')
      .select('*').eq('slug', slug).single()
    if (error) {
      if (error.code === 'PGRST116') return null
      log.voyage('getVoyageBySlug error', { error: error.message, slug }, 'error')
      return null
    }
    return transformVoyage(data as VoyageRow)
  } catch (error) {
    log.voyage('getVoyageBySlug error', { error: String(error), slug }, 'error')
    return null
  }
}

export const updateVoyage = async (
  voyageId: string,
  input: UpdateVoyageInput,
): Promise<Voyage | null> => {
  const admin = getAdminClient()
  log.voyage('Updating voyage', { voyageId })
  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) updates.name = input.name
    if (input.description !== undefined) updates.description = input.description
    if (input.isPublic !== undefined) updates.is_public = input.isPublic
    if (input.config !== undefined) {
      const current = await getVoyageById(voyageId)
      updates.settings = { ...current?.config, ...input.config }
    }
    const { data, error } = await admin.from('voyages').update(updates)
      .eq('id', voyageId).select().single()
    if (error) {
      log.voyage('updateVoyage error', { error: error.message, voyageId }, 'error')
      return null
    }
    return transformVoyage(data as VoyageRow)
  } catch (error) {
    log.voyage('updateVoyage error', { error: String(error), voyageId }, 'error')
    return null
  }
}

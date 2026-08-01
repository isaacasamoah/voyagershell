import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/053_atomic_private_reply_promotions.sql'),
  'utf8',
)
const proof = readFileSync(
  resolve(process.cwd(), 'recipes/sql/private-reply-promotion-proof.sql'),
  'utf8',
)

describe('migration 053 atomic private-reply promotion contract', () => {
  it('has one destination-scoped idempotency key and a deferred event FK', () => {
    expect(migration).toContain(
      'PRIMARY KEY (source_event_id, sharer_user_id, destination_space_id)',
    )
    expect(migration).toContain('shared_event_id UUID NOT NULL UNIQUE')
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED')
    expect(migration).toContain(
      'ON CONFLICT (source_event_id, sharer_user_id, destination_space_id) DO NOTHING',
    )
  })

  it('keeps mapping and RPC service-role only', () => {
    expect(migration).toContain(
      'ALTER TABLE public.private_reply_promotions ENABLE ROW LEVEL SECURITY',
    )
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.promote_private_voyager_reply(UUID, UUID, UUID) FROM authenticated',
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.promote_private_voyager_reply(UUID, UUID, UUID) TO service_role',
    )
    expect(migration).toContain('SECURITY DEFINER')
  })

  it('validates source/session before replay and audience only for creation', () => {
    const sourceGate = migration.indexOf("ke.event_type = 'conversation'")
    const replayGate = migration.indexOf("'replayed'::TEXT")
    const activeGate = migration.indexOf('Only a currently active member can create a NEW publication')
    expect(sourceGate).toBeGreaterThan(0)
    expect(replayGate).toBeGreaterThan(sourceGate)
    expect(activeGate).toBeGreaterThan(replayGate)
    expect(migration).toContain('FROM public.voyage_members voyage_member')
    expect(migration).toContain('ke.participants = ARRAY[p_user_id]::UUID[]')
  })

  it('publishes event, current-state enrichment, and recipient deliveries together', () => {
    expect(migration).toContain('INSERT INTO public.knowledge_events')
    expect(migration).toContain('UPDATE public.knowledge_current')
    expect(migration).toContain('INSERT INTO public.message_deliveries')
    expect(migration).toContain("'source', 'shared-voyager'")

    const metadataStart = migration.indexOf('JSONB_BUILD_OBJECT(')
    const metadataEnd = migration.indexOf("    'conversation',", metadataStart)
    const publicMetadata = migration.slice(metadataStart, metadataEnd)
    expect(publicMetadata).not.toContain('source_event_id')
    expect(publicMetadata).not.toContain('session_id')
    expect(migration.slice(metadataEnd, metadataEnd + 80)).toContain('NULL')
  })

  it('ships an executable create/replay proof that always rolls back', () => {
    expect(proof).toContain('BEGIN;')
    expect(proof).toContain("v_created.status <> 'created'")
    expect(proof).toContain("v_replayed.status <> 'replayed'")
    expect(proof).toContain('expected one promotion mapping')
    expect(proof).toContain('expected exactly one recipient delivery')
    expect(proof).toContain('foreign caller was unexpectedly accepted')
    expect(proof).toContain('wrong-session source was unexpectedly accepted')
    expect(proof).toContain('already-public source was unexpectedly accepted')
    expect(proof).toContain('solo destination was unexpectedly accepted')
    expect(proof.trimEnd().endsWith('ROLLBACK;')).toBe(true)
  })
})

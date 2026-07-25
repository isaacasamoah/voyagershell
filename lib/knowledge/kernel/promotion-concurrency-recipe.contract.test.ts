import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const recipe = readFileSync(resolve(process.cwd(),
  'recipes/private-reply-promotion-concurrency.sh'), 'utf8')
const migration = readFileSync(resolve(process.cwd(),
  'supabase/migrations/058_private_reply_promotion_authority.sql'), 'utf8')
const seed = readFileSync(resolve(process.cwd(),
  'recipes/sql/private-reply-promotion-concurrency-seed.sql'), 'utf8')

describe('private reply promotion concurrency recipe', () => {
  it('uses exact rollback-candidate authority and promotion SQL in one disposable database', () => {
    for (const file of ['054_active_membership', '058_private_reply_promotion']) {
      expect(recipe).toContain(file)
    }
    expect(recipe).not.toContain('knowledge_graph_schema.sql')
    expect(recipe).toContain('--pull=never')
    expect(recipe).toContain('--network none')
    expect(recipe).toContain('docker_proof_cleanup "$CONTAINER_NAME" "$PIDS"')
    expect(recipe).toContain('docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE"')
    expect(recipe).toContain("|| fail 'PostgreSQL readiness timeout'")
  })

  it('authorizes under the established lock order before returning a replay', () => {
    const sessionLock = migration.indexOf('FOR SHARE OF session, space')
    const parentAuth = migration.indexOf('IF v_voyage_id IS NOT NULL AND NOT EXISTS')
    const sourceLock = migration.indexOf('FOR SHARE;')
    const roomSnapshot = migration.indexOf(
      'SELECT array_agg(effective_member.user_id ORDER BY effective_member.user_id)',
    )
    const effectiveLock = migration.indexOf('FOR UPDATE OF parent, child')
    const selfGate = migration.indexOf('IF NOT p_user_id = ANY(coalesce(v_participants')
    const replayLookup = migration.indexOf('SELECT promotion.shared_event_id')
    const replayReturn = migration.indexOf(
      "RETURN QUERY SELECT v_existing, 'replayed'::text, v_source_content",
    )
    expect([sessionLock, parentAuth, sourceLock, roomSnapshot, effectiveLock, selfGate,
      replayLookup, replayReturn].every(index => index >= 0)).toBe(true)
    expect(sessionLock).toBeLessThan(parentAuth)
    expect(parentAuth).toBeLessThan(sourceLock)
    expect(sourceLock).toBeLessThan(roomSnapshot)
    expect(roomSnapshot).toBeLessThan(effectiveLock)
    expect(effectiveLock).toBeLessThan(selfGate)
    expect(selfGate).toBeLessThan(replayLookup)
    expect(replayLookup).toBeLessThan(replayReturn)
    expect(migration).not.toContain('PERFORM member.id')
    expect(migration.slice(0, sourceLock)).not.toContain('FOR UPDATE OF parent')
    expect(migration.match(/SELECT array_agg\(effective_member\.user_id/g)).toHaveLength(2)
    expect(migration).toContain("AND parent.state = 'active'")
    expect(migration).toContain("AND child.state = 'active'")
  })

  it('proves snapshot activation and revocation interleavings with real psql sessions', () => {
    for (const app of ['pre-snapshot-source-gate', 'invite-activation-between',
      'publication-first',
      'late-recipient-revocation', 'revocation-second', 'revocation-first',
      'publication-second', 'room-revocation-first', 'publication-third']) {
      expect(recipe).toContain(`PGAPPNAME=${app}`)
    }
    expect(seed).toContain("'10000000-0000-4000-8000-000000000023', 'invited'")
    expect(recipe).toContain('publication preliminary authorization passed')
    expect(recipe).toContain('late recipient revocation waiter')
    expect(recipe).toContain("wait_event_type='Lock'")
    expect(recipe).toContain('pg_blocking_pids')
    const publication = recipe.slice(recipe.indexOf('PGAPPNAME=publication-first'),
      recipe.indexOf('PGAPPNAME=revocation-second'))
    expect(publication.indexOf('promote_private_voyager_reply')).toBeLessThan(
      publication.indexOf('SELECT pg_sleep(4)'),
    )
    expect(publication).not.toMatch(/SELECT id FROM public\.(voyage_members|space_members)/)
    expect(recipe).toContain("if wait \"$denied\"; then fail 'post-revocation publication committed'; fi")
    expect(recipe).toContain("if wait \"$room_denied\"; then fail 'post-room-revocation publication committed'; fi")
  })

  it('denies replay of the promoted source after room revocation without side effects', () => {
    const denial = recipe.slice(recipe.indexOf('replay_before="$(state_fingerprint)"'),
      recipe.indexOf('verdict='))
    expect(denial).toContain('61000000-0000-4000-8000-000000000021')
    expect(denial).toContain('post_room_revocation_replay_committed')
    expect(denial).toContain("SQLERRM <> 'share_not_active_in_room'")
    expect(denial).toContain('replay_before="$(state_fingerprint)"')
    expect(denial).toContain('replay_after="$(state_fingerprint)"')
    expect(recipe).toContain("'events',(SELECT jsonb_agg")
    expect(recipe).toContain("'promotions',(SELECT jsonb_agg")
    expect(recipe).toContain("'deliveries',(SELECT jsonb_agg")
    expect(recipe).toContain("'embedding_state',(SELECT jsonb_agg")
    expect(recipe).toContain('revoked replay changed publication or embedding state')
  })

  it('commits active state before each revocation-first overlap', () => {
    const reactivation = recipe.slice(recipe.indexOf('reactivate_publisher()'),
      recipe.indexOf('PGAPPNAME=publication-first'))
    expect(reactivation).toContain('BEGIN;')
    expect(reactivation).toContain("voyage_members SET state='active'")
    expect(reactivation).toContain("space_members SET state='active'")
    expect(reactivation).toContain('COMMIT;')
    expect(recipe.match(/^reactivate_publisher$/gm)).toHaveLength(2)
    const voyageRevocation = recipe.slice(recipe.indexOf('PGAPPNAME=revocation-first'),
      recipe.indexOf('PGAPPNAME=publication-second'))
    expect(voyageRevocation).not.toContain("SET state='active'")
    const roomRevocation = recipe.slice(recipe.indexOf('PGAPPNAME=room-revocation-first'),
      recipe.indexOf('PGAPPNAME=publication-third'))
    expect(roomRevocation).toContain("UPDATE public.space_members SET state='left'")
    expect(roomRevocation).not.toContain('UPDATE public.voyage_members')
  })

  it('requires exact allowed and denied event, promotion, delivery, and retained-row state', () => {
    expect(recipe).toContain(
      "count(*) FROM knowledge_events WHERE user_id='10000000-0000-4000-8000-000000000021')=4",
    )
    expect(recipe).toContain("event_type='conversation')=3")
    expect(recipe).toContain("event_type='message')=1")
    expect(recipe).toContain(
      "count(*) FROM private_reply_promotions WHERE sharer_user_id='10000000-0000-4000-8000-000000000021')=1",
    )
    expect(recipe).toContain(
      "promotion.sharer_user_id='10000000-0000-4000-8000-000000000021')=2",
    )
    expect(recipe).toContain("source_event_id='61000000-0000-4000-8000-000000000023')=0")
    expect(recipe).toContain("participants=ARRAY['10000000-0000-4000-8000-000000000021'::uuid")
    expect(recipe).toContain("state='left' AND revision=3 FROM space_members")
    for (const label of ['publication-first state/count mismatch',
      'parent-revocation state/count mismatch', 'room-revocation state/count mismatch']) {
      expect(recipe).toContain(label)
    }
    expect(recipe).toContain("state='left' AND revision=4 FROM voyage_members")
    expect(recipe).toContain("state='left' AND revision=4 FROM space_members")
    expect(recipe).toContain("state='active' AND revision=5 FROM voyage_members")
    expect(recipe).toContain("state='left' AND revision=6 FROM space_members")
    expect(recipe).toContain('PRIVATE_REPLY_PROMOTION_CONCURRENCY_GREEN')
    expect(recipe).not.toContain('docker pull')
  })
})

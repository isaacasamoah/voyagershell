import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const recipe = readFileSync(resolve(process.cwd(),
  'recipes/private-reply-promotion-integrity.sh'), 'utf8')
const authorityMigration = readFileSync(resolve(process.cwd(),
  'supabase/migrations/054_active_membership_authority.sql'), 'utf8')

describe('private reply promotion integrity recipe', () => {
  it('seeds legacy mismatches before installing the authority boundary', () => {
    const markers = [
      '# PROOF_PHASE: PRE_BOUNDARY_FIXTURE',
      '# PROOF_PHASE: LEGACY_BAD_POINTER_SEED',
      '# PROOF_PHASE: INSTALL_AUTHORITY_BOUNDARY_054',
      '# PROOF_PHASE: INSTALL_PRIVATE_REPLY_PROMOTION_058',
      '# PROOF_PHASE: POST_BOUNDARY_ASSERTIONS',
    ]
    const indexes = markers.map(marker => recipe.indexOf(marker))
    expect(indexes.every(index => index >= 0)).toBe(true)
    for (const marker of markers) expect(recipe.split(marker)).toHaveLength(2)
    for (let index = 1; index < indexes.length; index += 1) {
      expect(indexes[index - 1]).toBeLessThan(indexes[index])
    }
    const legacySeed = recipe.slice(indexes[1], indexes[2])
    const authorityInstall = recipe.slice(indexes[2], indexes[3])
    const transitionInstall = recipe.slice(indexes[3], indexes[4])
    expect(legacySeed).toContain('INSERT INTO sessions')
    expect(legacySeed).not.toContain('054_active_membership_authority.sql')
    expect(authorityInstall).toContain('054_active_membership_authority.sql')
    expect(transitionInstall).toContain('058_private_reply_promotion_authority.sql')
    expect(recipe.split('054_active_membership_authority.sql')).toHaveLength(2)
    expect(recipe.split('058_private_reply_promotion_authority.sql')).toHaveLength(2)
  })

  it('proves every session authority mismatch has no durable or sequence side effect', () => {
    for (const text of ['cross mismatch', 'null parent mismatch', 'standalone mismatch']) {
      expect(recipe).toContain(text)
    }
    expect(recipe).toContain('mismatch_advanced_sequence')
    expect(recipe).toContain('mismatch_side_effect')
    expect(recipe).toContain('(SELECT count(*) FROM knowledge_events)<>5')
  })

  it('closes authenticated insert and update authority tampering at the row boundary', () => {
    expect(authorityMigration).toContain("TG_OP = 'INSERT'")
    expect(authorityMigration).toContain('session_space_voyage_mismatch')
    expect(authorityMigration).toContain('trg_sessions_authority_insert')
    expect(recipe).toContain('SET ROLE authenticated')
    expect(recipe).toContain('post_boundary_mismatch_insert_accepted')
    expect(recipe).toContain('post_boundary_mismatch_update_accepted')
    expect(recipe).toContain('post_boundary_guard_side_effect')
    expect(recipe).toContain('direct_authority_insert_accepted')
    expect(recipe).toContain('direct_authority_update_accepted')
  })

  it('asserts exact 053 FK metadata and both overlapping deletion orders', () => {
    expect(recipe).toContain('private_reply_promotions_shared_event_fkey')
    expect(recipe).toContain("confdeltype='r' AND condeferrable AND condeferred")
    for (const fragment of [
      "source_event_id_fkey' AND confdeltype='r'",
      "sharer_user_id_fkey' AND confdeltype='c'",
      "destination_space_id_fkey' AND confdeltype='c'",
      "shared_event_fkey' AND confdeltype='r'",
    ]) expect(recipe).toContain(fragment)
    for (const app of ['promotion-before-delete', 'delete-after-promotion',
      'delete-before-promotion', 'promotion-after-delete']) expect(recipe).toContain(app)
    expect(recipe).toContain("wait_event_type='Lock'")
    expect(recipe).toContain('post_delete_promotion_committed')
    expect(recipe).toContain("SQLERRM <> 'share_session_access_denied'")
    expect(recipe).toContain("wait \"$p4\" || fail 'post-delete promotion denial failed'")
    expect(recipe).toContain('PRIVATE_REPLY_PROMOTION_INTEGRITY_GREEN')
    expect(recipe).toContain('--pull=never')
    expect(recipe).toContain('--network none')
  })
})

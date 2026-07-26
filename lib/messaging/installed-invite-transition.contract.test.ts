import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const baseline = read('recipes/sql/installed-pre-054-baseline.sql')
const seed = read('recipes/sql/installed-pre-054/invites.sql')
const migration = read('supabase/migrations/057_room_invite_transition.sql')
const assertions = read('recipes/sql/installed-invite-transition-assertions.sql')
const recipe = read('recipes/installed-schema-authority.sh')
const sharedRecipes = [
  'recipes/authority-projection-concurrency.sh',
  'recipes/knowledge-graph-cutover-concurrency.sh',
  'recipes/knowledge-graph-local-proof.sh',
  'recipes/private-reply-promotion-concurrency.sh',
  'recipes/private-reply-promotion-integrity.sh',
  'recipes/room-invite-authority-concurrency.sh',
  'recipes/session-authority-concurrency.sh',
].map(read)

describe('installed room invite transition', () => {
  it('seeds an ambiguous invite before installing 054-059', () => {
    const baselineInstall = recipe.indexOf('docker_proof_install_pre054')
    const inviteInstall = recipe.indexOf('-f "/workspace/$INVITE_FIXTURE"')
    const migrationInstall = recipe.indexOf('for migration in "${MIGRATIONS[@]}"')

    expect(baseline).not.toContain('installed-pre-054/invites.sql')
    expect(recipe).toContain(
      'INVITE_FIXTURE=recipes/sql/installed-pre-054/invites.sql',
    )
    expect(seed).toContain("'invited'")
    expect(seed).toContain('"source":"invite"')
    expect(seed).not.toContain('"space_id"')
    expect(baselineInstall).toBeLessThan(inviteInstall)
    expect(inviteInstall).toBeLessThan(migrationInstall)
  })

  it('keeps the canonical shared baseline free of invite-specific facts', () => {
    expect(baseline).not.toContain('installed-invite')
    for (const unrelatedRecipe of sharedRecipes) {
      expect(unrelatedRecipe).not.toContain('installed-pre-054/invites.sql')
      expect(unrelatedRecipe).not.toContain('INVITE_FIXTURE')
    }
  })

  it('retires all pending rows without rewriting the immutable ledger', () => {
    expect(migration).toMatch(
      /UPDATE public\.space_members\s+SET state = 'left'\s+WHERE state = 'invited'/,
    )
    expect(migration).not.toMatch(/UPDATE public\.knowledge_events/)
    expect(assertions).toContain('installed_legacy_pending_invite_not_retired')
    expect(assertions).toContain('installed_legacy_invite_ledger_changed')
    expect(assertions).toContain("metadata ? 'space_id'")
  })

  it('proves old history is inert and a fresh exact-space knock is actionable', () => {
    expect(assertions).toContain('installed_legacy_invite_remained_actionable')
    expect(assertions).toContain("'no_pending_invite'")
    expect(assertions).toContain("'space_id', fresh_invite.invite_space_id")
    expect(assertions).toContain('fresh_event_space')
    expect(assertions).toContain('installed_fresh_exact_invite_not_actionable')
    expect(recipe).toContain('INSTALLED_INVITE_TRANSITION_GREEN')
  })
})

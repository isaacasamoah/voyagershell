import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const migration = (): string => read('supabase/migrations/060_source_intent.sql')

describe('K2 source intent — exactly-once ingress claim (C7)', () => {
  // The whole falsification turns on this. If payload_hash joined the key, the
  // same key carrying a DIFFERENT payload would insert a second row and
  // succeed — which is the case C7 requires to fail.
  it('keys the claim on actor + transport + client message id, never the payload', () => {
    const sql = migration()
    expect(sql).toContain('PRIMARY KEY (actor_id, transport, client_message_id)')
    expect(sql).not.toMatch(/PRIMARY KEY \([^)]*payload_hash/)
    expect(sql).toContain('ON CONFLICT (actor_id, transport, client_message_id) DO NOTHING')
  })

  it('replays an identical payload and raises on a divergent one', () => {
    const sql = migration()
    expect(sql).toContain("RETURN QUERY SELECT v_existing_event, 'replayed'::text")
    expect(sql).toMatch(
      /v_existing_hash IS DISTINCT FROM p_payload_hash THEN\s+RAISE EXCEPTION 'source_intent_payload_conflict'/,
    )
    expect(sql).toContain('FOR SHARE')
  })

  // The claim is taken BEFORE the event exists, so the FK must be deferred —
  // the ordering migration 053 already proved for share promotion.
  it('claims before the event exists without ever committing an orphan', () => {
    const sql = migration()
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED')
    expect(sql).toContain('event_id uuid NOT NULL UNIQUE')
    expect(sql).toMatch(/octet_length\(payload_hash\) = 32/)
  })

  it('keeps the claim service-only', () => {
    const sql = migration()
    expect(sql).toContain('REVOKE ALL ON TABLE public.knowledge_source_intents FROM PUBLIC, anon, authenticated')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*?claim_source_intent[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*?claim_source_intent[\s\S]*?TO service_role/)
  })

  it('drives the falsification at the concurrency the claim names', () => {
    const recipe = read('recipes/source-intent-exactly-once.sh')
    expect(recipe).toContain('CONCURRENCY=25')
    expect(recipe).toContain('SOURCE_INTENT_EXACTLY_ONCE_GREEN')
    expect(recipe).toContain("[ \"$created\" -eq 1 ]")
    expect(recipe).toContain('same-key/different-payload was not rejected')
    // Disposable, offline, never pulls — the standing rule for every recipe.
    expect(recipe).toContain('--pull=never')
    expect(recipe).toContain('--network none')
  })
})

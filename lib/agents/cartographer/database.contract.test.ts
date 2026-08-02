import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const migration = read('supabase/migrations/072_event_driven_cartographer.sql')
const currentCompletion = read('supabase/migrations/076_topic_identity_hardening.sql')
const localProof = read('recipes/cartographer-k3-local-proof.sh')
const hostedProof = read('recipes/hosted/rollback/knowledge-graph-poc.sh')
const hostedTransaction = read('recipes/lib/knowledge-graph-transaction.sh')
const targetCatalog = read('recipes/sql/knowledge-graph/catalog-targets.sql')

describe('K3 database-owned extraction contract', () => {
  it('keeps K2 ingress unchanged and makes eligibility an after-insert fact', () => {
    expect(migration).toContain('CREATE TRIGGER trg_enqueue_human_knowledge_extraction')
    expect(migration).toContain('AFTER INSERT ON public.knowledge_events')
    expect(migration).toContain("NEW.actor_type = 'user'")
    expect(migration).toContain("NEW.event_type IN ('conversation', 'message')")
    expect(migration).toContain('knowledge_extractor_contracts_one_active')
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.claim_source_message_ingress')
    expect(migration).not.toMatch(/cron|schedule|threshold/i)
  })

  it('separates mutable jobs from immutable starts and outcomes', () => {
    for (const table of [
      'knowledge_extraction_jobs',
      'knowledge_extraction_attempts',
      'knowledge_extraction_attempt_outcomes',
    ]) expect(migration).toContain(`CREATE TABLE public.${table}`)
    expect(migration).toContain('trg_knowledge_extraction_attempt_immutable')
    expect(migration).toContain('trg_knowledge_extraction_outcome_immutable')
    expect(migration).toContain("'expired', 'lease_expired'")
    expect(migration).toContain('FOR UPDATE OF job SKIP LOCKED')
    expect(migration).toContain('p_requesting_user_id = ANY(audience.member_profile_ids)')
  })

  it('derives audience and graph provenance without caller-supplied scope', () => {
    const completionSignature = currentCompletion.match(
      /CREATE OR REPLACE FUNCTION public\.complete_knowledge_extraction_attempt\(([\s\S]*?\n)\) RETURNS/,
    )?.[1] ?? ''
    expect(completionSignature).not.toMatch(/audience|edge_kind|extractor_version/)
    expect(completionSignature).toContain('p_topic_inputs jsonb DEFAULT NULL')
    expect(completionSignature).toContain('p_output_tokens integer DEFAULT NULL')
    expect(migration).toMatch(/v_edge,\s*v_unit_node,\s*v_event_node,\s*'derived_from'/)
    expect(migration).toMatch(/v_edge,\s*v_unit_node,\s*v_person_node\.id,\s*'about'/)
    expect(migration).toContain("'edge_evidence'")
    expect(migration).toContain("v_final := 'commit_rejected'; v_error := 'claim_key_conflict'")
    expect(migration).toContain('DROP FUNCTION public.')
  })

  it('keeps raw output service-only and every write behind restricted functions', () => {
    expect(migration).toContain('raw_output jsonb')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(migration).toContain('GRANT SELECT ON public.knowledge_extractor_contracts')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.begin_knowledge_extraction_attempt')
    expect(migration).toContain('TO service_role')
  })

  it('removes the projection-batch and two-stage runtime completely', () => {
    for (const path of [
      'lib/agents/cartographer/source.ts',
      'lib/agents/cartographer/stage1.ts',
      'lib/agents/cartographer/stage2.ts',
      'lib/agents/cartographer/window.ts',
      'lib/knowledge/kernel/graph-edge-writer.ts',
    ]) expect(existsSync(resolve(process.cwd(), path))).toBe(false)
  })
})

describe('K3 disposable structural proof', () => {
  it('uses the exact no-network candidate and real concurrency', () => {
    expect(localProof).toContain('--pull=never')
    expect(localProof).toContain('--network none')
    expect(localProof).toContain('supabase/migrations/{061,062,063,064,065,066,067,068,069,070,071,072}_*.sql')
    expect(localProof).toContain('for index in $(seq 1 25)')
    expect(localProof).toContain("sleep 2")
    expect(localProof).toContain('CARTOGRAPHER_K3_LOCAL_GREEN')
    expect(localProof).not.toContain('docker pull')
  })

  it('keeps the whole graph proof on the post-transition schema', () => {
    expect(hostedProof).toContain(
      'CARTOGRAPHER="$REPO_ROOT/supabase/migrations/072_event_driven_cartographer.sql"',
    )
    expect(hostedTransaction.indexOf('"$CARTOGRAPHER"'))
      .toBeLessThan(hostedTransaction.indexOf('generated-proof.sql'))
    for (const target of [
      "'knowledge_extraction_jobs'",
      "'knowledge_extraction_attempts'",
      "'knowledge_extraction_attempt_outcomes'",
      "'begin_knowledge_extraction_attempt'",
      "'complete_knowledge_extraction_attempt'",
      "'trg_enqueue_human_knowledge_extraction'",
    ]) expect(targetCatalog).toContain(target)
    expect(targetCatalog).not.toContain("'write_knowledge_graph_edge'")
  })
})

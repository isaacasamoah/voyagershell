import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import relationContract from './relation-conflict-contract.json'
import {
  RELATION_CANDIDATE_LIMIT,
  RELATION_CONTRACT_VERSION,
  RELATION_STAGE1_PROMPT,
  RELATION_STAGE2_PROMPT,
} from './relation-contract'
import { RELATION_WRITE_MAX_ATTEMPTS } from './relation-retry'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')
const migration = read('supabase/migrations/077_relation_conflict_ledger.sql')
const hardening = read('supabase/migrations/076_topic_identity_hardening.sql')
const pipeline = read('lib/agents/cartographer/relation-pipeline.ts')
const judge = read('lib/agents/cartographer/relation-judge.ts')
const relationJobs = read('lib/agents/cartographer/relation-jobs.ts')
const recipe = read('recipes/cartographer-k4c-local-proof.sh')
const assertions = read('recipes/sql/cartographer-k4c-assertions.sql')
const fullSuite = read('recipes/full-suite.sh')
const proof = read(
  'docs/testing/receipts/memory/k4c-conflict-local-proof-2026-08-01.md',
)

describe('K4c relation conflict contract', () => {
  it('pins the measured two-call asymmetric contract without examples', () => {
    expect(RELATION_CONTRACT_VERSION).toBe('relation-conflict-v2')
    expect(RELATION_CANDIDATE_LIMIT).toBe(16)
    expect(relationContract.judgment.providerCallsPerJob).toBe(2)
    expect(relationContract.judgment.stage2Default).toBe('contradicts')
    expect(migration).toContain(relationContract.description)
    expect(RELATION_STAGE1_PROMPT).toContain('user-consequence question')
    expect(RELATION_STAGE2_PROMPT).toContain('DEFAULT TO CONTRADICTS')
    expect(`${RELATION_STAGE1_PROMPT}\n${RELATION_STAGE2_PROMPT}`).not.toMatch(
      /worked examples|few[- ]shot/i,
    )
  })

  it('uses the pointer barrier and persists ordered authorized candidates pre-call', () => {
    expect(migration).toContain(
      'CREATE TABLE public.knowledge_relation_contracts',
    )
    expect(migration).toContain(
      'CREATE TABLE public.knowledge_relation_contract_active',
    )
    expect(migration).toContain('WHERE singleton\n  FOR SHARE')
    expect(migration).toContain(
      'PRIMARY KEY (unit_id, person_id, contract_version)',
    )
    const begin =
      migration.match(
        /CREATE FUNCTION public\.begin_relation_attempt[\s\S]*?END\n\$\$;/,
      )?.[0] ?? ''
    const candidates = begin.indexOf('INTO v_candidate_ids, v_candidates')
    const attempt = begin.indexOf(
      'INSERT INTO public.knowledge_relation_attempts',
    )
    const returned = begin.indexOf('RETURN QUERY SELECT')
    expect(candidates).toBeGreaterThan(-1)
    expect(candidates).toBeLessThan(attempt)
    expect(attempt).toBeLessThan(returned)
    expect(begin).toContain('candidate_unit_ids')
    expect(begin).toContain('public.viewer_has_graph_node_grant')
    expect(begin).toContain("v_contract.blocking_spec->>'candidateLimit'")
    expect(begin).toContain('v_contract.stage1_instruction')
    expect(begin).toContain('v_contract.stage2_instruction')
    expect(begin).toContain('v_contract.verdicts')
    expect(relationJobs).toContain('candidateLimit: row.candidate_limit')
    expect(judge).toContain('system: attempt.stage1Instruction')
    expect(judge).toContain('system: attempt.stage2Instruction')
    expect(pipeline).toContain(
      'attempt.contractVersion === RELATION_CONTRACT_VERSION',
    )
  })

  it('keeps attempts and outcomes immutable and exhausts jobs without a lease', () => {
    expect(migration).toContain('trg_knowledge_relation_attempt_immutable')
    expect(migration).toContain('trg_knowledge_relation_outcome_immutable')
    expect(migration).toContain(
      "v_final IN ('provider_failed', 'malformed_output', 'expired')",
    )
    expect(migration).toContain(
      "v_error = 'relation_candidate_authorization_changed'",
    )
    expect(migration).toContain("ELSE 'completed'")
    expect(migration).toContain('active_attempt_id = NULL')
    expect(RELATION_WRITE_MAX_ATTEMPTS).toBe(3)
    expect(pipeline).toContain('RELATION_WRITE_RETRY_EXHAUSTED_ERROR_CLASS')
    expect(pipeline).toContain("result: 'provider_failed'")
    expect(migration).toContain(
      'v_existing.input_tokens IS DISTINCT FROM p_input_tokens',
    )
    expect(migration).toContain(
      'v_existing.submitted_result IS DISTINCT FROM p_result',
    )
    expect(migration).toContain(
      'v_existing.submitted_error_class IS DISTINCT FROM p_error_class',
    )
  })

  it('gives the writer only relation edges, evidence, and assertion rows', () => {
    const writer =
      migration.match(
        /CREATE FUNCTION public\.complete_relation_attempt[\s\S]*?END\n\$\$;/,
      )?.[0] ?? ''
    expect(writer).toContain(
      "item->>'kind' NOT IN ('contradicts', 'supersedes')",
    )
    expect(writer).toContain('relation_grant_write_forbidden')
    expect(writer).toContain('INSERT INTO public.graph_edges')
    expect(writer).toContain('INSERT INTO public.graph_edge_evidence')
    expect(writer).toContain('INSERT INTO public.knowledge_relation_assertions')
    expect(writer).not.toContain('INSERT INTO public.graph_node_grants')
    for (const kind of [
      'authored_by',
      'about',
      'supports',
      'elaborates',
      'relates_to',
    ]) {
      expect(assertions).toContain(`'${kind}'`)
    }
    expect(assertions).toContain('relation_grant_write_forbidden')
  })

  it('gates only relation hops on every assertion input', () => {
    const neighbors =
      migration.match(
        /CREATE OR REPLACE FUNCTION public\.authorized_graph_neighbors[\s\S]*?\n\$\$;/,
      )?.[0] ?? ''
    expect(neighbors).toContain(
      "edge.kind NOT IN ('contradicts', 'supersedes')",
    )
    expect(neighbors).toContain("edge.kind IN ('contradicts', 'supersedes')")
    expect(neighbors).toContain('unnest(assertion.input_unit_ids)')
    expect(neighbors).toContain('public.viewer_has_graph_node_grant')
    expect(neighbors).toContain('FROM public.graph_authority_edges edge')
    expect(assertions).toContain('all-input relation assertion leaked')
  })

  it('keeps dormant kinds writerless and uses the existing HNSW claim scan', () => {
    expect(migration).not.toMatch(/ALTER TYPE public\.graph_edge_kind/)
    expect(hardening).toContain(
      'CREATE INDEX knowledge_units_embedding_hnsw ON public.knowledge_units',
    )
    expect(hardening).toContain('USING hnsw (embedding vector_cosine_ops)')
    expect(migration).toContain('candidate.embedding <=> focus.embedding')
    expect(migration).not.toMatch(
      /INSERT INTO public\.graph_edges[\s\S]{0,300}'(?:supports|elaborates|relates_to)'/,
    )
    expect(migration).not.toContain('CREATE INDEX knowledge_relation_assertions_edge')
  })

  it('hardens the install before a bounded backfill that records over-cap skips', () => {
    const acl = migration.indexOf(
      'REVOKE ALL ON public.knowledge_relation_contracts',
    )
    const backfill = migration.indexOf('DO $relation_backfill$')
    expect(acl).toBeGreaterThan(-1)
    expect(backfill).toBeGreaterThan(acl)
    expect(migration).toContain('knowledge_relation_backfill_runs')
    expect(migration).toContain("'skipped_over_limit'")
    expect(migration).toContain(
      "RAISE WARNING 'knowledge_relation_backfill_skipped_over_limit:%:%'",
    )
    expect(migration).not.toContain(
      "RAISE EXCEPTION 'knowledge_relation_backfill_limit_exceeded:%:%'",
    )
    const serviceGrants = migration.slice(
      migration.indexOf('GRANT EXECUTE ON FUNCTION public.begin_relation_attempt'),
      backfill,
    )
    expect(serviceGrants).not.toContain('authorized_graph_neighbors')
  })

  it('runs the disposable structural battery in the cumulative suite', () => {
    expect(recipe).toContain('docker exec -i')
    expect(recipe).not.toMatch(/psql[\s\S]{0,120}\s-c\s/)
    expect(recipe).toContain('cleanup_status=$?')
    expect(recipe).toContain('CARTOGRAPHER_K4C_LOCAL_GREEN')
    expect(fullSuite).toContain('./recipes/cartographer-k4c-local-proof.sh')
    expect(proof).toContain('CARTOGRAPHER_K4C_LOCAL_GREEN')
  })
})

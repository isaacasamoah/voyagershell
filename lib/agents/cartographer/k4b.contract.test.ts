import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CARTOGRAPHER_EXTRACTOR_VERSION,
  TOPIC_CANDIDATE_FLOOR,
  TOPIC_CANDIDATE_LIMIT,
  TOPIC_MATCHER_PROMPT,
  TOPIC_MATCHER_VERSION,
  extractionSchema,
  topicMatcherSchema,
  v3ExtractionSchema,
} from './contract'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const structural = read('supabase/migrations/074_topic_nodes.sql')
const rework = read('supabase/migrations/075_topic_identity_matcher.sql')
const enqueue = read('supabase/migrations/073_graph_memory_read.sql')
const proof = read('recipes/cartographer-k4b-local-proof.sh')
const assertions = read('recipes/sql/cartographer-k4b-assertions.sql')
const backfill = read('lib/agents/cartographer/backfill.ts')
const architecture = read('ARCHITECTURE.md')

describe('K4b topic identity contract', () => {
  it('versions extraction and matching separately with conservative structured output', () => {
    expect(CARTOGRAPHER_EXTRACTOR_VERSION).toBe('cartographer-single-claim-v4')
    expect(TOPIC_MATCHER_VERSION).toBe('topic-retrieval-v4')
    expect(TOPIC_CANDIDATE_FLOOR).toBe(0.2)
    expect(TOPIC_CANDIDATE_LIMIT).toBe(8)
    expect(TOPIC_MATCHER_PROMPT).toContain('Precision matters more than recall')
    expect(TOPIC_MATCHER_PROMPT).not.toMatch(/worked examples|few[- ]shot/i)
    const base = {
      claim: 'Quantum engines are stable.',
      aboutPersonId: null,
      knowledgeType: 'domain' as const,
      attentionScore: 0.8,
      contextSnippet: 'Quantum engines.',
    }
    expect(extractionSchema.safeParse(base).success).toBe(true)
    expect(extractionSchema.safeParse({ ...base, topics: [] }).success).toBe(false)
    expect(v3ExtractionSchema.safeParse({ ...base, topics: ['quantum engines'] }).success)
      .toBe(true)
    expect(topicMatcherSchema.safeParse({
      topics: [{ kind: 'new', label: 'quantum engines' }],
    }).success).toBe(true)
  })

  it('uses claim embeddings only to retrieve a floor-and-window candidate set', () => {
    const resolver = rework.match(
      /CREATE FUNCTION public\.resolve_knowledge_topic\([\s\S]*?END \$\$;/,
    )?.[0] ?? ''
    expect(resolver).toContain('unit.embedding <=> p_embedding')
    expect(resolver).toContain('scored.score >= v_floor')
    expect(resolver).toContain('LIMIT v_limit')
    expect(resolver).toContain('unit.id IS DISTINCT FROM p_exclude_unit_id')
    expect(rework).toContain("0.2, 8, 'topic-retrieval-v4'")
    expect(rework).toContain('DROP FUNCTION public.find_knowledge_topic_candidates')
    expect(rework).not.toContain('embedTopicInputs')
  })

  it('keeps identity with the model and every write with the server', () => {
    const writer = rework.match(
      /CREATE FUNCTION public\.write_v4_knowledge_unit_topics[\s\S]*?END \$\$;/,
    )?.[0] ?? ''
    const lock = writer.indexOf('pg_advisory_xact_lock(861319074)')
    const stale = writer.indexOf('knowledge_topic_candidates_stale')
    const mint = writer.indexOf('INSERT INTO public.knowledge_topics')
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(stale)
    expect(stale).toBeLessThan(mint)
    expect(writer).toContain('knowledge_topic_candidate_not_authorized')
    expect(writer).not.toMatch(/<=>.*(RETURN|v_topic)|similarity.*INSERT/i)
    expect(rework).toContain('complete_v4_knowledge_extraction_attempt')
    expect(rework).toContain('write_v4_knowledge_unit_topics')
  })

  it('preserves topic authority and the K4-C3 evidence/grant shape', () => {
    expect(structural).toContain('CREATE TABLE public.knowledge_topics')
    expect(structural).toContain("WHEN 'topic' THEN EXISTS")
    expect(rework).toContain("v_unit_node, v_topic_node, 'about'")
    expect(rework).toContain("'edge_evidence', v_edge, 1")
    expect(rework).toContain('p_audience_id')
    expect(assertions).toContain('k4b_private_only_topic_leaked')
    expect(proof).toContain('outsider could inspect the private-only topic table count')
    expect(architecture).toContain('Topic nodes are shared hubs.')
  })

  it('orders v4 activation, old-job drain, re-derivation, and zero-residue assertion', () => {
    expect(enqueue).toContain(
      'FROM public.knowledge_extractor_contract_active WHERE singleton FOR SHARE',
    )
    const activate = backfill.indexOf('await activateCurrentContract()')
    const jobs = backfill.indexOf('await listOldJobs()')
    const units = backfill.indexOf('await listUnits()')
    const assertion = backfill.indexOf("rpc('assert_knowledge_topic_backfill_complete')")
    expect(activate).toBeLessThan(jobs)
    expect(jobs).toBeLessThan(units)
    expect(units).toBeLessThan(assertion)
    expect(rework).toContain('knowledge_topic_identity_outcomes')
    expect(rework).toContain("'orphanTopics',v_orphans")
    expect(proof).toContain('enqueue-first activation did not wait')
    expect(proof).toContain('activation-first enqueue did not wait')
  })

  it('proves stale-race recovery and keeps K4c absent', () => {
    expect(proof).toContain("wait_event_type='Lock'")
    expect(proof).toContain('paraphrase commits were not concurrently blocked')
    expect(proof).toContain('knowledge_topic_candidates_stale')
    expect(proof).toContain('concurrent paraphrases minted sibling topics')
    for (const source of [structural, rework, proof, backfill]) {
      expect(source).not.toMatch(/knowledge_relationship|relationship_(jobs|attempts|assertions)/)
    }
  })
})

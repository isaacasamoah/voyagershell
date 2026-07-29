import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CARTOGRAPHER_EXTRACTOR_VERSION,
  TOPIC_SIMILARITY_THRESHOLD,
  extractionSchema,
  historicalExtractionSchema,
} from './contract'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const migration = read('supabase/migrations/074_topic_nodes.sql')
const enqueueMigration = read('supabase/migrations/073_graph_memory_read.sql')
const proof = read('recipes/cartographer-k4b-local-proof.sh')
const assertions = read('recipes/sql/cartographer-k4b-assertions.sql')
const backfill = read('lib/agents/cartographer/backfill.ts')
const architecture = read('ARCHITECTURE.md')

describe('K4b topic contract', () => {
  it('mints v3 with bounded topic proposals and keeps pinned history explicit', () => {
    expect(CARTOGRAPHER_EXTRACTOR_VERSION).toBe('cartographer-single-claim-v3')
    expect(TOPIC_SIMILARITY_THRESHOLD).toBe(0.7)
    const base = {
      claim: 'Quantum engines are stable.',
      aboutPersonId: null,
      knowledgeType: 'domain' as const,
      attentionScore: 0.8,
      contextSnippet: 'Quantum engines.',
    }
    expect(extractionSchema.safeParse({ ...base, topics: ['quantum engines'] }).success)
      .toBe(true)
    expect(extractionSchema.safeParse({
      ...base,
      topics: ['one', 'two', 'three', 'four'],
    }).success).toBe(false)
    expect(extractionSchema.safeParse({ ...base, claim: null, topics: ['quantum'] }).success)
      .toBe(false)
    expect(extractionSchema.safeParse({
      ...base,
      claim: ['Quantum engines are stable.', 'Quantum engines are fast.'],
      topics: [],
    }).success).toBe(false)
    expect(extractionSchema.safeParse({
      ...base,
      secondClaim: 'Quantum engines are fast.',
      topics: [],
    }).success).toBe(false)
    expect(extractionSchema.safeParse({
      ...base,
      claim: null,
      aboutPersonId: '11111111-1111-4111-8111-111111111111',
      topics: [],
    }).success).toBe(false)
    expect(historicalExtractionSchema.safeParse(base).success).toBe(true)
  })

  it('uses one global mint lock with an unlocked match and locked recheck', () => {
    const resolver = migration.match(
      /CREATE FUNCTION public\.resolve_knowledge_topic[\s\S]*?END \$\$;/,
    )?.[0] ?? ''
    const firstMatch = resolver.indexOf('SELECT * INTO v_topic')
    const lock = resolver.indexOf('pg_advisory_xact_lock(861319074)')
    const secondMatch = resolver.indexOf('SELECT * INTO v_topic', firstMatch + 1)
    expect(firstMatch).toBeGreaterThan(-1)
    expect(firstMatch).toBeLessThan(lock)
    expect(lock).toBeLessThan(secondMatch)
    expect(resolver).not.toMatch(/hashtext|p_label.*lock|advisory.*v_label/i)
    expect(migration).toContain('topic_similarity_threshold')
    expect(migration).toContain("'cartographer-single-claim-v3', 'text-embedding-3-small', 1536, 0.7")
    expect(migration).toContain("node.kind::text = 'topic'")
    expect(migration).not.toContain("node.kind = 'topic'")
    expect(proof).toContain("read -r -d '' K4B_MIGRATION_PAYLOAD")
    expect(proof).toContain('-c "$K4B_MIGRATION_PAYLOAD"')
  })

  it('binds topic authority, evidence, and one exact source-audience grant', () => {
    expect(migration).toContain('CREATE TABLE public.knowledge_topics')
    expect(migration).toContain("WHEN 'topic' THEN EXISTS")
    expect(migration).toContain("v_unit_node, v_topic_node, 'about'")
    expect(migration).toContain("'edge_evidence', v_edge, 1")
    expect(migration).toContain('v_attempt.knowledge_audience_id')
    expect(migration).toContain('trg_knowledge_topics_immutable')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
  })

  it('orders activation, old-job drain, re-derivation, then assertion', () => {
    expect(enqueueMigration).toContain(
      'FROM public.knowledge_extractor_contract_active WHERE singleton FOR SHARE',
    )
    const activate = backfill.indexOf('await activateV3()')
    const jobs = backfill.indexOf('await listOldJobs()')
    const units = backfill.indexOf('await listUnits()')
    const assertion = backfill.indexOf("rpc('assert_knowledge_topic_backfill_complete')")
    expect(activate).toBeLessThan(jobs)
    expect(jobs).toBeLessThan(units)
    expect(units).toBeLessThan(assertion)
    expect(proof).toContain('enqueue-first activation did not wait')
    expect(proof).toContain('activation-first enqueue did not wait')
  })

  it('proves real paraphrase concurrency and keeps K4c absent', () => {
    expect(proof).toContain("wait_event_type='Lock'")
    expect(proof).toContain('paraphrase commits were not concurrently blocked')
    expect(proof).toContain('concurrent paraphrases minted sibling topics')
    for (const source of [migration, proof, backfill]) {
      expect(source).not.toMatch(/knowledge_relationship|relationship_(jobs|attempts|assertions)/)
    }
  })

  it('keeps private-only and mixed topic proof distinct in current architecture', () => {
    expect(assertions).toContain('k4b_private_only_topic_leaked')
    expect(proof).toContain('outsider could inspect the private-only topic table count')
    expect(architecture).toContain('The seven kinds are Person, Voyager, Voyage, Space')
    expect(architecture).toContain('`knowledge_topics` is the immutable authority table')
    expect(architecture).toContain('Topic nodes are shared hubs.')
  })
})

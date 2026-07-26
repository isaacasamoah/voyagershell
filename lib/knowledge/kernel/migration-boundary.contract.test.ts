import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')
const promoted = ['061_knowledge_graph_schema.sql',
  '062_knowledge_graph_authorization.sql', '063_knowledge_graph_retrieval.sql']
const cutover = ['064_knowledge_graph_cutover.sql',
  '065_knowledge_graph_authority_projection.sql',
  '066_knowledge_graph_membership_projection.sql',
  '067_knowledge_graph_projection_activation.sql']

describe('the complete graph migration boundary', () => {
  it('lands the whole cutover and leaves no legacy graph', () => {
    const discovered = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
      .filter((name) => /^\d{3}.*\.sql$/.test(name)).sort()
    const atOrAbove = (floor: number): string[] =>
      discovered.filter((name) => Number(name.slice(0, 3)) >= floor)
    expect(Math.max(...discovered.map((name) => Number(name.slice(0, 3))))).toBe(72)
    expect(atOrAbove(60)).toEqual(['060_source_intent.sql', ...promoted,
      ...cutover, '068_atomic_source_ingress.sql',
      '069_deployment_gap_recovery.sql',
      '070_private_voyager_response_ingress.sql',
      '071_voyager_response_gap_recovery.sql',
      '072_event_driven_cartographer.sql'])
    expect(readdirSync(resolve(process.cwd(), 'recipes/sql/knowledge-graph'))
      .filter((name) => /^\d{3}_/.test(name))).toEqual([])

    const sql = atOrAbove(60)
      .map((name) => read(`supabase/migrations/${name}`)).join('\n')
    for (const required of [
      'knowledge_graph_backfill_rejections',
      'knowledge_extraction_attempt_outcomes',
      'begin_knowledge_extraction_attempt',
      'complete_knowledge_extraction_attempt',
      'ensure_authority_audience',
      'project_graph_authority_trigger',
      'DROP TABLE public.knowledge_edges',
      'DROP FUNCTION IF EXISTS public.graph_traverse',
      'claim_source_message_ingress',
      'recover_knowledge_graph_deployment_gap',
    ]) expect(sql).toContain(required)
    expect(read('supabase/migrations/069_deployment_gap_recovery.sql'))
      .toContain('public.classify_knowledge_event_authority(')

    const response = read(
      'supabase/migrations/070_private_voyager_response_ingress.sql')
    expect(response).toContain("p_actor_type = 'voyager'")
    expect(response).toContain("p_metadata->>'reply_to_event_id'")
    expect(response).toContain("event.actor_type = 'user'")
    expect(response).toContain("'generated_by'")
    expect(response).toContain("format('reply:%s', v_reply_to)")
    expect(response).toContain("format('welcome:%s', p_metadata->>'session_id')")
    expect(read('supabase/migrations/071_voyager_response_gap_recovery.sql'))
      .toContain("v_row.actor_type = 'voyager'")
    expect(read('supabase/migrations/072_event_driven_cartographer.sql'))
      .toContain('DROP FUNCTION public.')
  })
})

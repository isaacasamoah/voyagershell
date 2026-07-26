import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// A dropped table with a live caller is worse than no drop at all, so the K2
// deletion is proved exhaustive rather than asserted. These are every place a
// live runtime could still reach the graph the cutover removed.
const liveRuntimePaths = ['lib/retrieval/knowledge-retrieval-tools.ts',
  'lib/retrieval/voyager-tools.ts', 'lib/agents/cartographer/apply.ts',
  'lib/knowledge/index.ts',
  'lib/supabase/schema/functions.ts', 'lib/supabase/schema/knowledge-tables.ts',
  'lib/supabase/schema/base.ts'] as const
const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('legacy graph residue after the K2 cutover', () => {
  // The claim precedes every effect it commits, inside one function. If an
  // effect ever moves above the claim, a retry produces it twice.
  it('takes the ingress claim before any effect it commits', () => {
    const ingress = readRepoFile('supabase/migrations/068_atomic_source_ingress.sql')
    const claimAt = ingress.indexOf('public.claim_source_intent(')
    expect(claimAt).toBeGreaterThan(-1)
    for (const effect of ['INSERT INTO public.knowledge_events',
      'INSERT INTO public.graph_nodes', 'INSERT INTO public.message_deliveries',
      "PERFORM public.attest_ingress_structural_edge",
    ]) expect(ingress.indexOf(effect)).toBeGreaterThan(claimAt)
  })

  it('leaves no legacy graph reader, writer, table, RPC or caller in live source', () => {
    expect(existsSync(resolve(process.cwd(), 'lib/knowledge/edges.ts'))).toBe(false)
    const live = liveRuntimePaths.map(readRepoFile).join('\n')
    for (const residue of ['knowledge_edges', 'graph_traverse', 'createEdge',
      'EdgeType', 'LegacyEdgeType']) expect(live).not.toContain(residue)
  })
})

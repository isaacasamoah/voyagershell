import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GRAPH_NODE_KINDS, type GraphNodeKind } from '@/lib/knowledge/kernel/contract'

const { retrieveKnowledgeGraphClaimsMock } = vi.hoisted(() => ({
  retrieveKnowledgeGraphClaimsMock: vi.fn(),
}))

vi.mock('ai', () => ({ tool: (definition: unknown) => definition }))
vi.mock('@/lib/knowledge/kernel/boundary', () => ({
  retrieveKnowledgeGraphClaims: retrieveKnowledgeGraphClaimsMock,
}))
vi.mock('@/lib/knowledge', () => ({
  keywordGrep: vi.fn(),
  personAnchoredSearch: vi.fn(),
  getKnowledgeByIds: vi.fn(),
}))
vi.mock('@/lib/knowledge/hybrid', () => ({ hybridSearch: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
vi.mock('@/lib/agents/queue', () => ({
  completeTask: vi.fn(),
  enqueueAgentTask: vi.fn(),
  runGuardedBackgroundTask: vi.fn(),
}))
vi.mock('@/lib/knowledge/events', () => ({ createMessageEvent: vi.fn() }))
vi.mock('@/lib/voyage', () => ({
  getVoyageBySlug: vi.fn(),
  getVoyageMembers: vi.fn(),
  resolveMemberByName: vi.fn(),
}))

import { createRetrievalTools } from './tools'

interface GraphInput {
  root: { kind: GraphNodeKind; authorityId: string }
  graphEnabled?: boolean
  maxDepth?: number
}

interface GraphTool {
  inputSchema: { safeParse: (input: unknown) => { success: boolean } }
  execute: (input: GraphInput) => Promise<string>
}

const AUTHORITY_IDS = GRAPH_NODE_KINDS.map((_, index) =>
  `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
)
const KNOWLEDGE_UNIT_ID = '20000000-0000-4000-8000-000000000001'
const SOURCE_EVENT_ID = '30000000-0000-4000-8000-000000000001'
const CLAIM = 'Vanessa keeps the amber notebook behind the blue atlas.'
const SOURCE = 'I left the amber notebook behind the blue atlas.'
const AUTHORIZED_RESULT = {
  knowledgeUnitId: KNOWLEDGE_UNIT_ID,
  claim: CLAIM,
  sourceEventId: SOURCE_EVENT_ID,
  sourceContent: SOURCE,
  edgeKind: 'derived_from',
  path: ['private-bridge'],
  resultCount: 1,
  elapsedMs: 4,
}

const graphTool = (): GraphTool =>
  createRetrievalTools({ userId: 'viewer-1' }).graph as unknown as GraphTool

describe('K1 graph retrieval tool cutover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    retrieveKnowledgeGraphClaimsMock.mockResolvedValue([AUTHORIZED_RESULT])
  })

  it('accepts and dispatches all six final graph root kinds', async () => {
    const graph = graphTool()
    for (let index = 0; index < GRAPH_NODE_KINDS.length; index++) {
      const kind = GRAPH_NODE_KINDS[index]
      const root = { kind, authorityId: AUTHORITY_IDS[index] }
      expect(graph.inputSchema.safeParse({ root }).success).toBe(true)
      await graph.execute({ root, graphEnabled: true, maxDepth: 4 })
      expect(retrieveKnowledgeGraphClaimsMock).toHaveBeenLastCalledWith(root, {
        graphEnabled: true,
        maxDepth: 4,
      })
    }
    expect(retrieveKnowledgeGraphClaimsMock).toHaveBeenCalledTimes(6)
  })

  it('rejects the removed event-only graph input shape', () => {
    expect(graphTool().inputSchema.safeParse({
      nodeId: SOURCE_EVENT_ID,
      edge_type: 'supports',
      direction: 'both',
      depth: 2,
    }).success).toBe(false)
  })

  it('passes graph on and graph off through the same boundary', async () => {
    const graph = graphTool()
    const root = { kind: 'person' as const, authorityId: AUTHORITY_IDS[0] }
    await graph.execute({ root, graphEnabled: true, maxDepth: 8 })
    await graph.execute({ root, graphEnabled: false, maxDepth: 0 })
    expect(retrieveKnowledgeGraphClaimsMock.mock.calls).toEqual([
      [root, { graphEnabled: true, maxDepth: 8 }],
      [root, { graphEnabled: false, maxDepth: 0 }],
    ])
  })

  it('formats only the four authorized claim and source fields exactly', async () => {
    const output = await graphTool().execute({
      root: { kind: 'knowledge_unit', authorityId: KNOWLEDGE_UNIT_ID },
    })
    expect(output).toBe(
      `Knowledge unit: ${KNOWLEDGE_UNIT_ID}\nClaim: ${CLAIM}\nSource event: ${SOURCE_EVENT_ID}\nSource: ${SOURCE}`,
    )
    expect(output).not.toContain('derived_from')
    expect(output).not.toContain('private-bridge')
    expect(output).not.toContain('resultCount')
    expect(output).not.toContain('elapsedMs')
  })

  it('makes denied, absent, and error outcomes the same empty string', async () => {
    retrieveKnowledgeGraphClaimsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('private edge path failed after 4ms'))
    const input = {
      root: { kind: 'message_event' as const, authorityId: SOURCE_EVENT_ID },
      graphEnabled: true,
      maxDepth: 4,
    }
    const outputs = await Promise.all([
      graphTool().execute(input),
      graphTool().execute(input),
      graphTool().execute(input),
    ])
    expect(outputs).toEqual(['', '', ''])
    outputs.forEach((output) => {
      expect(output).not.toContain('private')
      expect(output).not.toContain('edge')
      expect(output).not.toContain('4ms')
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
const adminRpc = vi.fn()
const loadCuratorModule = async () => {
  vi.resetModules()
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminClient: () => ({ rpc: adminRpc }),
  }))
  vi.doMock('@/lib/conversation/window', () => ({
    estimateTokens: () => 1,
  }))
  vi.doMock('./kernel/boundary', () => ({
    retrieveKnowledgeGraphClaims: vi.fn().mockResolvedValue({
      outcome: 'success', claims: [], truncated: false,
    }),
  }))
  return import('./curator')
}
const loadToolsModule = async () => {
  vi.resetModules()
  vi.doMock('ai', () => ({ tool: (definition: unknown) => definition }))
  vi.doMock('@/lib/messaging/deliveries', () => ({
    fanOutDeliveries: vi.fn(),
  }))
  vi.doMock('@/lib/messaging/room', () => ({
    getRoom: vi.fn(),
    removeRoomPerson: vi.fn(),
    setAiPresent: vi.fn(),
  }))
  vi.doMock('@/lib/messaging/invites', () => ({
    inviteToRoom: vi.fn(),
  }))
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminClient: () => ({ rpc: adminRpc }),
  }))
  vi.doMock('@/lib/knowledge/lifecycle/citations', () => ({
    recordKnowledgeUnitCitations: vi.fn().mockResolvedValue({
      outcome: 'recorded', inserted: 1,
    }),
  }))
  vi.doMock('@/lib/agents/queue', () => ({
    enqueueAgentTask: vi.fn(),
    completeTask: vi.fn(),
    failTask: vi.fn(),
  }))
  vi.doMock('@/lib/tools/captain', () => ({
    createCaptainTools: () => ({}),
  }))
  vi.doMock('@/lib/voyage/core', () => ({
    createVoyage: vi.fn(),
    getVoyageBySlug: vi.fn(),
  }))
  vi.doMock('@/lib/voyage/session', () => ({
    generateSlug: vi.fn(),
    isSlugAvailable: vi.fn(),
  }))
  vi.doMock('@/lib/voyage/members', () => ({
    getVoyageMembers: vi.fn(),
    isCaptain: vi.fn(),
    getUserVoyages: vi.fn(),
    resolveMemberByName: vi.fn(),
  }))
  vi.doMock('@/lib/voyage/invitations', () => ({ sendVoyageInvite: vi.fn() }))
  vi.doMock('@/lib/knowledge/events', () => ({ createMessageEvent: vi.fn() }))
  return import('../retrieval/retrieval-tools')
}
describe('knowledge scope RPC routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminRpc.mockResolvedValue({ data: [], error: null })
  })

  it('routes curator windows through the unit-native graph read', async () => {
    const { curatePromptWindow } = await loadCuratorModule()

    await curatePromptWindow('user-1', 'fambam')
    expect(adminRpc).not.toHaveBeenCalledWith('scoped_knowledge_fetch', expect.anything())

    await curatePromptWindow('user-1')
    expect(adminRpc).not.toHaveBeenCalledWith('scoped_knowledge_fetch', expect.anything())
  })

  it('routes time-range retrieval through unit search with source-time filters', async () => {
    const { createRetrievalTools } = await loadToolsModule()
    const tools = createRetrievalTools({ userId: 'user-1', voyageSlug: 'fambam' }) as unknown as {
      search_by_time: {
        execute: (input: { since: string; until: string; limit: number }) => Promise<string>
      }
    }

    await tools.search_by_time.execute({
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-09T12:30:00.000Z',
      limit: 44,
    })

    expect(adminRpc).toHaveBeenCalledWith('search_knowledge_units', {
      p_viewer_profile_id: 'user-1',
      p_query_embedding: null,
      p_anchor_person_id: undefined,
      p_since: '2026-07-01T00:00:00.000Z',
      p_until: '2026-07-09T12:30:00.000Z',
      p_match_count: 30,
      p_unit_ids: undefined,
    })
  })

  it('keeps unit and source UUIDs across search and exact hydration', async () => {
    const unitId = '59eec620-1a4e-4c8a-9f57-08e5f8321660'
    const eventId = '69eec620-1a4e-4c8a-9f57-08e5f8321660'
    const row = {
      unit_id: unitId,
      claim: 'Isaac is the captain.',
      source_event_id: eventId,
      source_content: 'Isaac is the captain.',
      source_created_at: '2026-08-02T00:00:00Z',
      knowledge_type: 'domain',
      effective_attention: 0.8,
      rank_score: 0.7,
      similarity: null,
    }
    adminRpc.mockImplementation(async (name: string) => ({
      data: name === 'keyword_search_units' || name === 'search_knowledge_units'
        ? [row]
        : [],
      error: null,
    }))

    const { createRetrievalTools } = await loadToolsModule()
    const tools = createRetrievalTools({
      userId: 'user-1', voyageSlug: 'fambam', conversationId: 'session-1',
    }) as unknown as {
      keyword_grep: {
        execute: (input: { pattern: string; limit: number }) => Promise<string>
      }
      get_nodes: {
        inputSchema: { safeParse: (input: unknown) => { success: boolean } }
        execute: (input: { nodeIds: string[] }) => Promise<string>
      }
    }

    const searchResult = await tools.keyword_grep.execute({
      pattern: 'isaac',
      limit: 10,
    })
    expect(searchResult).toContain(`id:${unitId}`)
    expect(searchResult).toContain(`source:${eventId}`)
    expect(searchResult).not.toContain('id:59eec620\n')

    expect(tools.get_nodes.inputSchema.safeParse({ nodeIds: ['59eec620'] }).success).toBe(false)
    expect(tools.get_nodes.inputSchema.safeParse({ nodeIds: [unitId] }).success).toBe(true)

    const hydrated = await tools.get_nodes.execute({ nodeIds: [unitId] })
    expect(adminRpc).toHaveBeenCalledWith('search_knowledge_units',
      expect.objectContaining({ p_unit_ids: [unitId] }))
    expect(hydrated).toContain(`id:${unitId}`)
  })
})

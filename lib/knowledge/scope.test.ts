import { beforeEach, describe, expect, it, vi } from 'vitest'
const authenticatedRpc = vi.fn()
const adminRpc = vi.fn()
const keywordGrepTool = vi.fn()
const getKnowledgeByIdsTool = vi.fn()
const hybridSearchTool = vi.fn()
const sampleKnowledgeRow = {
  event_id: 'event-1',
  content: 'React 19 was discussed in the pricing thread.',
  source_created_at: '2026-07-09T00:00:00.000Z',
  classifications: ['fact'],
  entities: [],
  topics: [],
  knowledge_type: 'domain',
  attention_score: 0.9,
  context_snippet: null,
  sender_display_name: null,
  sender_user_id: null,
  event_type: 'explicit',
  session_id: null,
  promotion_count: 0,
}
const mockOpenAI = () => {
  vi.doMock('openai', () => ({
    default: class FakeOpenAI {
      embeddings = { create: vi.fn() }
    },
  }))
}
const installSearchMocks = () => {
  vi.resetModules()
  mockOpenAI()
  vi.doMock('@/lib/supabase/authenticated', () => ({
    getClientForContext: () => ({ rpc: authenticatedRpc }),
  }))
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminClient: () => ({ rpc: adminRpc }),
  }))
  vi.doMock('@/lib/knowledge/lifecycle/citations', () => ({
    recordKnowledgeUnitCitations: vi.fn().mockResolvedValue({
      outcome: 'recorded',
      inserted: 1,
    }),
  }))
}
const loadScopedSearchModule = async () => {
  installSearchMocks()
  return import('./scoped-search')
}
const loadSemanticSearchModule = async () => {
  installSearchMocks()
  return import('./search')
}
const loadCuratorModule = async () => {
  vi.resetModules()
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminClient: () => ({ rpc: adminRpc }),
  }))
  vi.doMock('@/lib/conversation/window', () => ({
    estimateTokens: () => 1,
  }))
  return import('./curator')
}
const loadToolsModule = async () => {
  vi.resetModules()
  vi.doMock('ai', () => ({ tool: (definition: unknown) => definition }))
  vi.doMock('@/lib/knowledge', () => ({
    searchKnowledge: vi.fn(),
    keywordGrep: keywordGrepTool,
    personAnchoredSearch: vi.fn(),
    getKnowledgeByIds: getKnowledgeByIdsTool,
  }))
  vi.doMock('@/lib/knowledge/hybrid', () => ({
    hybridSearch: hybridSearchTool,
  }))
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
  vi.doMock('@/lib/knowledge/events', () => ({
    createMessageEvent: vi.fn(),
    createExplicitEvent: vi.fn(),
  }))
  return import('../retrieval/retrieval-tools')
}
describe('knowledge scope RPC routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticatedRpc.mockResolvedValue({ data: [], error: null })
    adminRpc.mockResolvedValue({ data: [], error: null })
    keywordGrepTool.mockResolvedValue([])
    getKnowledgeByIdsTool.mockResolvedValue([])
    hybridSearchTool.mockResolvedValue([])
  })
  it('routes keywordGrep through scoped_knowledge_fetch with grep filters', async () => {
    authenticatedRpc.mockResolvedValue({ data: [sampleKnowledgeRow], error: null })
    const { keywordGrep } = await loadScopedSearchModule()

    const results = await keywordGrep('user-1', 'React', {
      scope: 'voyage',
      voyageSlug: 'fambam',
      caseSensitive: true,
      minAttention: 0.42,
      limit: 7,
    })

    expect(results).toHaveLength(1)
    expect(authenticatedRpc).toHaveBeenCalledWith('scoped_knowledge_fetch', {
      p_user_id: 'user-1',
      p_voyage_slug: 'fambam',
      p_scope: 'voyage',
      p_content_match: '%React%',
      p_case_sensitive: true,
      p_min_attention: 0.42,
      p_match_count: 7,
    })
  })
  it('hydrates exact IDs only through the mandatory caller-scoped RPC', async () => {
    adminRpc.mockResolvedValue({ data: [sampleKnowledgeRow], error: null })
    const { getKnowledgeByIds } = await loadSemanticSearchModule()

    await expect(getKnowledgeByIds(
      ['59eec620-1a4e-4c8a-9f57-08e5f8321660'],
      'user-1',
      'fambam',
    )).resolves.toHaveLength(1)
    expect(adminRpc).toHaveBeenCalledWith('get_knowledge_by_ids', {
      p_event_ids: ['59eec620-1a4e-4c8a-9f57-08e5f8321660'],
      p_user_id: 'user-1',
      p_voyage_slug: 'fambam',
    })
  })

  it('routes curator windows through scoped_knowledge_fetch with voyage and personal scopes', async () => {
    const { curatePromptWindow } = await loadCuratorModule()

    await curatePromptWindow('user-1', 'fambam')
    expect(adminRpc).toHaveBeenLastCalledWith('scoped_knowledge_fetch', {
      p_user_id: 'user-1',
      p_voyage_slug: 'fambam',
      p_scope: 'all',
      p_min_attention: 0.3,
      p_match_count: 500,
    })

    await curatePromptWindow('user-1')
    expect(adminRpc).toHaveBeenLastCalledWith('scoped_knowledge_fetch', {
      p_user_id: 'user-1',
      p_voyage_slug: undefined,
      p_scope: 'personal',
      p_min_attention: 0.3,
      p_match_count: 500,
    })
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

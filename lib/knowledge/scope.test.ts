import { beforeEach, describe, expect, it, vi } from 'vitest'

const authenticatedRpc = vi.fn()
const adminRpc = vi.fn()

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

const loadSearchModule = async () => {
  vi.resetModules()
  mockOpenAI()
  vi.doMock('@/lib/supabase/authenticated', () => ({
    getClientForContext: () => ({ rpc: authenticatedRpc }),
  }))
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminClient: () => ({ rpc: adminRpc }),
  }))
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
    keywordGrep: vi.fn(),
    getKnowledgeByIds: vi.fn(),
  }))
  vi.doMock('@/lib/knowledge/hybrid', () => ({
    hybridSearch: vi.fn(),
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
  vi.doMock('@/lib/agents/queue', () => ({
    enqueueAgentTask: vi.fn(),
    completeTask: vi.fn(),
    failTask: vi.fn(),
  }))
  vi.doMock('@/lib/tools/captain', () => ({
    createCaptainTools: () => ({}),
  }))
  vi.doMock('@/lib/voyage', () => ({
    createVoyage: vi.fn(),
    generateSlug: vi.fn(),
    isSlugAvailable: vi.fn(),
    getVoyageBySlug: vi.fn(),
    getVoyageMembers: vi.fn(),
    isCaptain: vi.fn(),
    sendVoyageInvite: vi.fn(),
    getUserVoyages: vi.fn(),
    resolveMemberByName: vi.fn(),
  }))
  vi.doMock('@/lib/knowledge/events', () => ({
    createMessageEvent: vi.fn(),
    createExplicitEvent: vi.fn(),
  }))
  return import('../retrieval/tools')
}

describe('knowledge scope RPC routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticatedRpc.mockResolvedValue({ data: [], error: null })
    adminRpc.mockResolvedValue({ data: [], error: null })
  })

  it('routes keywordGrep through scoped_knowledge_fetch with grep filters', async () => {
    authenticatedRpc.mockResolvedValue({ data: [sampleKnowledgeRow], error: null })
    const { keywordGrep } = await loadSearchModule()

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
      p_participants: ['user-1'],
      p_scope: 'voyage',
      p_content_match: '%React%',
      p_case_sensitive: true,
      p_min_attention: 0.42,
      p_match_count: 7,
    })
  })

  it('routes curator windows through scoped_knowledge_fetch with voyage and personal scopes', async () => {
    const { curatePromptWindow } = await loadCuratorModule()

    await curatePromptWindow('user-1', 'fambam')
    expect(adminRpc).toHaveBeenLastCalledWith('scoped_knowledge_fetch', {
      p_user_id: 'user-1',
      p_voyage_slug: 'fambam',
      p_participants: ['user-1'],
      p_scope: 'all',
      p_min_attention: 0.3,
      p_match_count: 500,
    })

    await curatePromptWindow('user-1')
    expect(adminRpc).toHaveBeenLastCalledWith('scoped_knowledge_fetch', {
      p_user_id: 'user-1',
      p_voyage_slug: undefined,
      p_participants: ['user-1'],
      p_scope: 'personal',
      p_min_attention: 0.3,
      p_match_count: 500,
    })
  })

  it('routes time-range retrieval through scoped_knowledge_fetch with time filters', async () => {
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

    expect(adminRpc).toHaveBeenCalledWith('scoped_knowledge_fetch', {
      p_user_id: 'user-1',
      p_voyage_slug: 'fambam',
      p_participants: ['user-1'],
      p_scope: 'all',
      p_since: '2026-07-01T00:00:00.000Z',
      p_until: '2026-07-09T12:30:00.000Z',
      p_min_attention: 0.1,
      p_match_count: 30,
    })
  })
})

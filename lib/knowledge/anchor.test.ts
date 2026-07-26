import { beforeEach, describe, expect, it, vi } from 'vitest'

const authenticatedRpc = vi.fn()
const adminRpc = vi.fn()

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
  return import('./scoped-search')
}

describe('personAnchoredSearch RPC routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticatedRpc.mockResolvedValue({ data: [], error: null })
    adminRpc.mockResolvedValue({ data: [], error: null })
  })

  it('routes anchor search through scoped_knowledge_fetch with caller scope and sender anchor', async () => {
    const { personAnchoredSearch } = await loadSearchModule()

    await personAnchoredSearch('caller-user', 'sender-user', {
      voyageSlug: 'fambam',
      query: 'almond',
    })

    expect(authenticatedRpc).toHaveBeenCalledWith('scoped_knowledge_fetch', {
      p_user_id: 'caller-user',
      p_voyage_slug: 'fambam',
      p_scope: 'all',
      p_content_match: '%almond%',
      p_case_sensitive: false,
      p_min_attention: 0.0,
      p_match_count: 20,
      p_sender_user_id: 'sender-user',
    })
  })

  it('passes null content match when no query is provided', async () => {
    const { personAnchoredSearch } = await loadSearchModule()

    await personAnchoredSearch('caller-user', 'sender-user', {
      voyageSlug: 'fambam',
    })

    expect(authenticatedRpc).toHaveBeenCalledWith('scoped_knowledge_fetch', {
      p_user_id: 'caller-user',
      p_voyage_slug: 'fambam',
      p_scope: 'all',
      p_content_match: null,
      p_case_sensitive: false,
      p_min_attention: 0.0,
      p_match_count: 20,
      p_sender_user_id: 'sender-user',
    })
  })

  it('keeps privacy scope on the caller and uses sender only as the anchor filter', async () => {
    const { personAnchoredSearch } = await loadSearchModule()

    await personAnchoredSearch('caller-user', 'sender-user', {
      limit: 9,
    })

    expect(authenticatedRpc).toHaveBeenCalledWith('scoped_knowledge_fetch', {
      p_user_id: 'caller-user',
      p_voyage_slug: null,
      p_scope: 'personal',
      p_content_match: null,
      p_case_sensitive: false,
      p_min_attention: 0.0,
      p_match_count: 9,
      p_sender_user_id: 'sender-user',
    })
  })
})

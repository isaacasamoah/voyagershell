import { getClientForContext } from '@/lib/supabase/authenticated'
import type { GrepOptions, GrepResult, KnowledgeNodeInput } from './search-types'

const getClientForUser = (userId: string) => getClientForContext({ userId })

const toGrepResult = (
  row: KnowledgeNodeInput,
  highlight: string,
  matchStart: number,
): GrepResult => ({
  eventId: row.event_id,
  content: row.content,
  classifications: row.classifications ?? [],
  entities: row.entities ?? [],
  topics: row.topics ?? [],
  createdAt: new Date(row.source_created_at),
  knowledgeType: row.knowledge_type ?? null,
  attentionScore: row.attention_score ?? 0.5,
  contextSnippet: row.context_snippet ?? null,
  highlight,
  matchStart,
})

const highlightMatch = (content: string, pattern: string, caseSensitive: boolean) => {
  const searchable = caseSensitive ? content : content.toLowerCase()
  const needle = caseSensitive ? pattern : pattern.toLowerCase()
  const matchStart = searchable.indexOf(needle)
  const start = Math.max(0, matchStart - 50)
  const end = Math.min(content.length, matchStart + pattern.length + 50)
  let highlight = content.slice(start, end)
  if (start > 0) highlight = `...${highlight}`
  if (end < content.length) highlight = `${highlight}...`
  return { highlight, matchStart }
}

export const keywordGrep = async (
  userId: string,
  pattern: string,
  options: GrepOptions = {},
): Promise<GrepResult[]> => {
  const { scope = 'all', caseSensitive = false, limit = 20, voyageSlug, minAttention = 0.3 } = options
  if (!pattern.trim()) return []
  try {
    console.log(
      `[Knowledge] Grep: "${pattern}" scope: ${scope}, case: ${caseSensitive}, limit: ${limit}, minAttention: ${minAttention}`,
    )
    const { data, error } = await getClientForUser(userId).rpc('scoped_knowledge_fetch', {
      p_user_id: userId,
      p_voyage_slug: voyageSlug,
      p_scope: scope,
      p_content_match: `%${pattern}%`,
      p_case_sensitive: caseSensitive,
      p_min_attention: minAttention,
      p_match_count: limit,
    })
    if (error) {
      console.error('[Knowledge] Grep error:', error)
      return []
    }
    const results: KnowledgeNodeInput[] = data ?? []
    console.log(`[Knowledge] Grep found ${results.length} matches`)
    return results.map((row) => {
      const { highlight, matchStart } = highlightMatch(row.content, pattern, caseSensitive)
      return toGrepResult(row, highlight, matchStart)
    })
  } catch (error) {
    console.error('[Knowledge] keywordGrep error:', error)
    return []
  }
}

export const personAnchoredSearch = async (
  callerUserId: string,
  senderUserId: string,
  options: { voyageSlug?: string; query?: string; limit?: number } = {},
): Promise<GrepResult[]> => {
  try {
    const query = options.query
    const { data, error } = await getClientForUser(callerUserId).rpc('scoped_knowledge_fetch', {
      p_user_id: callerUserId,
      p_voyage_slug: options.voyageSlug ?? null,
      p_scope: options.voyageSlug ? 'all' : 'personal',
      p_content_match: query ? `%${query}%` : null,
      p_case_sensitive: false,
      p_min_attention: 0.0,
      p_match_count: options.limit ?? 20,
      p_sender_user_id: senderUserId,
    })
    if (error) {
      console.error('[Knowledge] personAnchoredSearch error:', error)
      return []
    }
    const rows: KnowledgeNodeInput[] = data ?? []
    return rows.map((row) => {
      const rawMatchStart = query ? row.content.toLowerCase().indexOf(query.toLowerCase()) : -1
      if (query && rawMatchStart >= 0) {
        const { highlight } = highlightMatch(row.content, query, false)
        return toGrepResult(row, highlight, rawMatchStart)
      }
      const highlight = row.content.length > 120 ? `${row.content.slice(0, 120)}...` : row.content
      return toGrepResult(row, highlight, 0)
    })
  } catch (error) {
    console.error('[Knowledge] personAnchoredSearch error:', error)
    return []
  }
}

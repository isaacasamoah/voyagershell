import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8')
const sourceFiles = (directory: string): string[] => readdirSync(resolve(root, directory))
  .flatMap((name) => {
    const path = `${directory}/${name}`
    return statSync(resolve(root, path)).isDirectory() ? sourceFiles(path) : [path]
  })
  .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))

describe('registered installed retrieval boundary', () => {
  it('has no direct admin-table knowledge hydration or message read', () => {
    const retrieval = sourceFiles('lib/retrieval')
      .map((path) => `${path}\n${read(path)}`)
      .join('\n')
    expect(retrieval).not.toContain(".from('knowledge_current')")
    expect(read('lib/knowledge/search.ts')).not.toContain(".from('knowledge_current')")
    expect(read('lib/knowledge/search.ts')).toContain("rpc('get_knowledge_by_ids'")
    expect(read('lib/retrieval/voyager-message-query-tools.ts'))
      .toContain("rpc('get_voyage_messages'")
  })

  it('registers only the authorized graph-memory product reader', () => {
    const catalogue = [
      read('lib/retrieval/voyager-tools.ts'),
      read('lib/retrieval/knowledge-retrieval-tools.ts'),
      read('lib/retrieval/voyager-message-query-tools.ts'),
    ].join('\n')
    expect(catalogue).toContain("name: 'graph_memory'")
    expect(catalogue).toContain('retrieveKnowledgeGraphClaims')
    expect(catalogue).not.toContain('graph_traverse')
    expect(catalogue).not.toContain("name: 'graph'")
    expect(catalogue).not.toContain('edge_type')
  })

  it('has one exact installed contract for retained and replacement RPCs', () => {
    const types = read('lib/supabase/schema/functions.ts')
    for (const name of [
      'get_knowledge_by_ids', 'get_voyage_messages', 'claim_source_message_ingress',
      'get_or_create_active_session', 'get_resumable_sessions',
      'get_session_scope', 'resume_session', 'archive_session',
      'touch_session_activity', 'get_last_active_voyage_slug',
      'set_session_ai_presence', 'remove_session_room_member',
      'update_knowledge_embedding',
    ]) expect(types).toContain(`${name}:`)
    for (const name of [
      'create_knowledge_event', 'get_knowledge_pending_embedding',
      'mark_session_extracted', 'pin_knowledge', 'quiet_knowledge',
      'search_memories', 'set_session_title', 'supersede_memory', 'transition_session',
    ]) expect(types).not.toContain(`${name}:`)
  })
})

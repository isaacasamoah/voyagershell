import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const docs = [
  'README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', '.claude/skills/patterns/SKILL.md',
  '.claude/plans/agentic-retrieval.md', '.claude/agents/anchor.md',
] as const

describe('tracked graph contributor truth', () => {
  it('contains only the final graph vocabulary', () => {
    const text = docs.map(read).join('\n')
    expect(text).not.toMatch(/\bget_connected\b|\bconnected_to\b/)
    for (const term of [
      'scope-neutral', 'knowledge_audiences', 'graph_node_grants',
      'graph_edge_evidence', 'graph_authority_edges', 'per-hop',
    ]) expect(text).toContain(term)
  })

  // After the cutover there is exactly one graph, and no tool reads the old one.
  it('registers no legacy graph reader anywhere in the live retrieval surface', () => {
    const knowledgeTools = read('lib/retrieval/knowledge-retrieval-tools.ts')
    const registry = read('lib/retrieval/voyager-tools.ts')
    expect(knowledgeTools).not.toContain('graph: tool({')
    expect(knowledgeTools).not.toContain("rpc('graph_traverse'")
    expect(read('lib/knowledge/kernel/boundary.ts')).toContain('getKnowledgeGraphCandidateClient')
    expect(registry).not.toContain("name: 'graph'")
    expect(registry).not.toContain('tool: retrieval.graph,')
    expect(registry).toContain('tool: retrieval.graph_memory')
  })

  // The first browser run failed on a helper that was unit-tested and simply
  // never called: composerAsideBadge existed, passed its own tests, and the
  // composer rendered the generic audience label instead. A green helper test
  // says nothing about whether the interface reaches it, so pin the wiring.
  it('renders the private-aside cue from the one shared resolver', () => {
    const controller = read('components/ui/VoyagerInterface.tsx')
    const composer = read('components/ui/VoyagerComposer.tsx')
    expect(controller).toContain('composerAsideBadge')
    expect(controller).toContain('composerAsideBadge(')
    expect(composer).toContain('{composerAsideCue ?? composerAudience.label}')
    expect(read('lib/messaging/address.ts')).toContain('→ private aside to ')
  })

  it('states the browser contract as a gate rather than optional human work', () => {
    const recipes = read('recipes/README.md')
    expect(recipes).not.toMatch(/optional for Isaac/i)
    expect(recipes).toContain('a gate, not a residual')
    expect(recipes).toContain('explicitly authorized development')
    expect(recipes).toContain('127.0.0.1')
    expect(recipes).toContain('390 × 844')
  })

  it('documents each disposable local concurrency and exact-candidate proof', () => {
    const recipes = read('recipes/README.md')
    for (const name of [
      'authority-projection-concurrency.sh', 'knowledge-graph-cutover-concurrency.sh',
      'private-reply-promotion-concurrency.sh', 'private-reply-promotion-integrity.sh',
      'room-invite-authority-concurrency.sh', 'knowledge-graph-local-proof.sh',
      'installed-schema-authority.sh', 'installed-precondition-live.sh',
    ]) expect(recipes).toContain(name)
    expect(recipes).toContain('never pulls, publishes a host port, or joins a network')
    expect(recipes).toContain('pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee')
    expect(recipes).toContain('docker pull pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee')
    expect(recipes).toContain('VOYAGER_SUPABASE_ACCESS_TOKEN')
    expect(recipes).toContain('VOYAGER_SUPABASE_PROJECT_REF')
    expect(recipes).toMatch(/remote\s+CI never requires personal secrets/)
    expect(recipes).not.toMatch(/Exact 001.?056 replay|replays every standard migration/i)
  })

  // After the cutover the docs must describe ONE graph. A document still telling
  // a contributor to reach for the deployed event-only surface is a live caller
  // waiting to happen.
  it('describes one graph and the single release boundary that made it', () => {
    const text = docs.map(read).join('\n')
    expect(text).not.toContain('deployed event-only')
    expect(text).not.toContain('057–063')
    expect(text).toContain('060–071')
    expect(text).toContain('054–059')
    expect(text).toMatch(/no registered tool traverses the graph/i)
    expect(text).not.toMatch(/registered `graph` tool accepts (?:any|one) of the six/i)
  })

  it('keeps the K2 atomic-ingress boundary explicit and deletes the dead reset path', () => {
    const text = docs.map(read).join('\n')
    expect(text).toContain('one release boundary')
    expect(text).toContain('deployment-gap events')
    expect(text).toContain('NULL -> UUID')
    expect(existsSync(resolve(process.cwd(), 'supabase/scripts/reset-test-data.sql'))).toBe(false)
  })

  it('keeps npm, the frozen lock, and executable CI gates canonical', () => {
    const guidance = [read('README.md'), read('CONTRIBUTING.md')].join('\n')
    const workflow = read('.github/workflows/ci.yml')
    expect(existsSync(resolve(process.cwd(), 'package-lock.json'))).toBe(true)
    expect(guidance).toContain('npm ci')
    expect(guidance).not.toMatch(/\bpnpm\b/)
    expect(workflow).toContain('run: npm ci')
    expect(workflow).toContain('run: npm run test:run')
    expect(workflow).toContain(
      "find recipes -type f -name '*.sh' -print0 | xargs -0 bash -n",
    )
    expect(workflow.indexOf('docker pull pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee'))
      .toBeLessThan(workflow.indexOf('./recipes/installed-schema-authority.sh'))
    expect(workflow).not.toContain('TODO')
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createK1FixtureSeed } from './k1-fixture-seed'
import {
  renderK1HistoricalAssertionsSql,
  renderK1HistoricalSetupSql,
} from './k1-historical-sql'

const authorization = readFileSync(resolve(process.cwd(),
  'supabase/migrations/062_knowledge_graph_authorization.sql'), 'utf8')
const seed = createK1FixtureSeed('historical-membership-contract')
const setup = renderK1HistoricalSetupSql(seed)
const assertions = renderK1HistoricalAssertionsSql(seed)

describe('K1 immutable event-time space audiences', () => {
  it('does not revalidate historical source grants through mutable current membership', () => {
    const validator = authorization.match(/CREATE FUNCTION public\.validate_knowledge_audience\(\)[\s\S]*?\$\$;\n/)?.[0]
    expect(validator).toBeDefined()
    const authorityOnly = validator?.indexOf("NEW.purpose = 'authority'") ?? -1
    expect(authorityOnly).toBeGreaterThan(0)
    expect(authorization).not.toContain('knowledge_source_space_audience_not_effective')
    expect(validator?.slice(0, authorityOnly)).not.toContain('is_effective_space_member')
  })

  it('seeds distinct child-left, parent-left, and later-member cases before cutover', () => {
    expect(setup).toContain(seed.childHistoricalEventId)
    expect(setup).toContain(seed.parentHistoricalEventId)
    expect(setup).toContain(`WHERE id = '${seed.childFormerSpaceMemberId}'::uuid`)
    expect(setup).toContain(`WHERE id = '${seed.parentFormerVoyageMemberId}'::uuid`)
    expect(setup).toContain(seed.laterMemberId)
    expect(setup).not.toMatch(/knowledge_events[\s\S]*sequence_num\)[\s\S]*VALUES[\s\S]*\bDEFAULT\b/)
  })

  it('proves former-member retrieval and later-member denial through final RPCs', () => {
    expect(assertions).toContain('knowledge_graph_former_member_historical_source_missing')
    expect(assertions).toContain('knowledge_graph_later_member_gained_historical_source')
    expect(assertions).toContain("public.write_knowledge_graph_edge('knowledge_unit'")
    expect(assertions).toContain('public.retrieve_knowledge_graph_claims')
    expect(assertions).toContain('normalize_knowledge_audience_members')
  })
})

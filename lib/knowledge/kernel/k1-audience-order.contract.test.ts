import { describe, expect, it } from 'vitest'
import { canonicalKnowledgeAudienceId } from './canonical-ids'
import { createK1FixtureSeed } from './k1-fixture-seed'
import { renderK1CutoverAssertionsSql } from './k1-cutover-assertions-sql'
import { renderK1LegacySetupSql } from './k1-legacy-setup-sql'

const ownerFirst = createK1FixtureSeed('audience-order-0')
const recipientFirst = createK1FixtureSeed('audience-order-3')

describe('K1 audience ordering contract', () => {
  it('normalizes exact audience assertions for either generated UUID ordering', () => {
    expect(ownerFirst.ownerId < ownerFirst.recipientId).toBe(true)
    expect(recipientFirst.recipientId < recipientFirst.ownerId).toBe(true)

    for (const seed of [ownerFirst, recipientFirst]) {
      const pair = [seed.ownerId, seed.recipientId]
      const expected = `public.normalize_knowledge_audience_members(ARRAY[`
        + `'${seed.ownerId}'::uuid, '${seed.recipientId}'::uuid])`
      const assertions = renderK1CutoverAssertionsSql(seed)
      expect(renderK1LegacySetupSql(seed)).toContain(
        `ARRAY['${seed.ownerId}'::uuid, '${seed.recipientId}'::uuid]`,
      )
      expect(assertions.split(expected)).toHaveLength(4)
      expect(assertions.match(/audience\.member_profile_ids = public\.normalize_knowledge_audience_members/g))
        .toHaveLength(4)
      expect(assertions).not.toMatch(/audience\.member_profile_ids = ARRAY\[/)
      expect(canonicalKnowledgeAudienceId('source', 'voyage', seed.voyageId, pair))
        .toBe(canonicalKnowledgeAudienceId('source', 'voyage', seed.voyageId, [...pair].reverse()))
    }
  })
})

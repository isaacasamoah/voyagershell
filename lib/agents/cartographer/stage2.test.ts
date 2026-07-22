import { describe, expect, it } from 'vitest'
import { GRAPH_EDGE_KINDS } from '@/lib/knowledge/kernel/contract'
import {
  CARTOGRAPHER_EDGE_KINDS,
  parseStage2Connections,
  STAGE2_PROMPT,
} from './stage2'

const SOURCE_ID = '71000000-0000-4000-8000-000000000001'
const TARGET_ID = '71000000-0000-4000-8000-000000000002'

describe('Cartographer Stage 2 graph output', () => {
  it('parses final graph-node references and edge kind', () => {
    expect(parseStage2Connections(`CONNECTIONS:
      [{
        "source": { "kind": "knowledge_unit", "authorityId": "${SOURCE_ID}" },
        "target": { "kind": "knowledge_unit", "authorityId": "${TARGET_ID}" },
        "kind": "supports"
      }]
    `)).toEqual([{
      source: { kind: 'knowledge_unit', authorityId: SOURCE_ID },
      target: { kind: 'knowledge_unit', authorityId: TARGET_ID },
      kind: 'supports',
    }])
  })

  it('rejects the retired event-edge shape instead of translating it', () => {
    expect(parseStage2Connections(`CONNECTIONS:
      [{ "fromEventId": "event-1", "toEventId": "event-2", "edgeType": "supports" }]
    `)).toEqual([])
  })

  it('exposes the complete final vocabulary without triggered_by', () => {
    for (const kind of GRAPH_EDGE_KINDS) expect(STAGE2_PROMPT).toContain(kind)
    expect(CARTOGRAPHER_EDGE_KINDS).toHaveLength(8)
    expect(STAGE2_PROMPT).not.toContain('triggered_by')
    expect(parseStage2Connections(`CONNECTIONS:
      [{
        "source": { "kind": "knowledge_unit", "authorityId": "${SOURCE_ID}" },
        "target": { "kind": "knowledge_unit", "authorityId": "${TARGET_ID}" },
        "kind": "triggered_by"
      }]
    `)).toEqual([])
  })

  it('rejects non-UUID identities, structural edges, and invalid semantic endpoints', () => {
    expect(parseStage2Connections(`CONNECTIONS: [{
      "source": { "kind": "message_event", "authorityId": "not-a-uuid" },
      "target": { "kind": "person", "authorityId": "${TARGET_ID}" },
      "kind": "about"
    }]`)).toEqual([])
    expect(parseStage2Connections(`CONNECTIONS: [{
      "source": { "kind": "message_event", "authorityId": "${SOURCE_ID}" },
      "target": { "kind": "person", "authorityId": "${TARGET_ID}" },
      "kind": "authored_by"
    }]`)).toEqual([])
    expect(parseStage2Connections(`CONNECTIONS: [{
      "source": { "kind": "message_event", "authorityId": "${SOURCE_ID}" },
      "target": { "kind": "knowledge_unit", "authorityId": "${TARGET_ID}" },
      "kind": "supports"
    }]`)).toEqual([])
    expect(parseStage2Connections(`CONNECTIONS: [{
      "source": { "kind": "knowledge_unit", "authorityId": "${SOURCE_ID}" },
      "target": { "kind": "knowledge_unit", "authorityId": "${SOURCE_ID}" },
      "kind": "relates_to"
    }]`)).toEqual([])
  })
})

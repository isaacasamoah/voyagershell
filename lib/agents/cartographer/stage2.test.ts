import { describe, expect, it } from 'vitest'
import {
  CARTOGRAPHER_EDGE_KINDS,
  parseStage2Connections,
  STAGE2_PROMPT,
} from './stage2'

const SOURCE_ID = '71000000-0000-4000-8000-000000000001'
const TARGET_ID = '71000000-0000-4000-8000-000000000002'

describe('Cartographer Stage 2 graph output', () => {
  it('parses the deployed event-edge contract', () => {
    expect(parseStage2Connections(`CONNECTIONS:
      [{
        "fromEventId": "${SOURCE_ID}",
        "toEventId": "${TARGET_ID}",
        "edgeType": "supports"
      }]
    `)).toEqual([{
      fromEventId: SOURCE_ID,
      toEventId: TARGET_ID,
      edgeType: 'supports',
    }])
  })

  it('rejects the uninstalled heterogeneous candidate shape', () => {
    expect(parseStage2Connections(`CONNECTIONS:
      [{ "source": { "kind": "message_event", "authorityId": "${SOURCE_ID}" },
         "target": { "kind": "message_event", "authorityId": "${TARGET_ID}" }, "kind": "supports" }]
    `)).toEqual([])
  })

  it('exposes exactly the deployed eight-edge vocabulary', () => {
    for (const kind of CARTOGRAPHER_EDGE_KINDS) expect(STAGE2_PROMPT).toContain(kind)
    expect(CARTOGRAPHER_EDGE_KINDS).toHaveLength(8)
    expect(STAGE2_PROMPT).toContain('triggered_by')
    expect(STAGE2_PROMPT).not.toContain('authored_by')
  })

  it('rejects non-UUID identities, self edges, and candidate-only kinds', () => {
    expect(parseStage2Connections(`CONNECTIONS: [{
      "fromEventId": "not-a-uuid", "toEventId": "${TARGET_ID}", "edgeType": "supports"
    }]`)).toEqual([])
    expect(parseStage2Connections(`CONNECTIONS: [{
      "fromEventId": "${SOURCE_ID}", "toEventId": "${SOURCE_ID}", "edgeType": "relates_to"
    }]`)).toEqual([])
    expect(parseStage2Connections(`CONNECTIONS: [{
      "fromEventId": "${SOURCE_ID}", "toEventId": "${TARGET_ID}", "edgeType": "about"
    }]`)).toEqual([])
  })
})

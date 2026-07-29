import { beforeEach, describe, expect, it } from 'vitest'
import type { KnowledgeGraphClaim } from '@/lib/knowledge/kernel/boundary'
import { createKnowledgeRetrievalTools } from '@/lib/retrieval/knowledge-retrieval-tools'
import {
  context,
  loadRunTurn,
  resetRunTurnFixture,
  runTurnMocks,
  streamResult,
  stubHost,
} from './run-turn-test-fixture'

const WORKING_MEMORY_UNIT_ID = '71000000-0000-4000-6000-000000000001'
const RETRIEVABLE_UNIT_ID = '71000000-0000-4000-6000-000000000002'
const graphClaim = (knowledgeUnitId: string): KnowledgeGraphClaim => ({
  knowledgeUnitId,
  claim: `Claim for ${knowledgeUnitId}`,
  sourceEventId: '71000000-0000-4000-8000-000000000003',
  sourceContent: `Source for ${knowledgeUnitId}`,
  knowledgeType: 'operational',
  attentionScore: 0.85,
})

describe('runTurn graph memory', () => {
  beforeEach(resetRunTurnFixture)

  it('excludes composed graph memory through the registered handler', async () => {
    runTurnMocks.composeSystemPrompt.mockResolvedValue({
      staticPrompt: 'STATIC',
      dynamicPrompt: 'DYNAMIC',
      retrieval: {
        knowledge: [],
        tokenEstimate: 0,
        metadata: {
          threshold: 0,
          pinnedCount: 0,
          searchCount: 0,
          latencyMs: 1,
        },
      },
      workingMemoryUnitIds: [WORKING_MEMORY_UNIT_ID],
    })
    let observedExclusions: readonly string[] = []
    let toolInvocation: Promise<unknown> | undefined
    runTurnMocks.createVoyagerTools.mockImplementation((toolContext) => {
      const graph_memory = createKnowledgeRetrievalTools(
        toolContext,
        async (_root, options) => {
          observedExclusions = options?.excludeUnitIds ?? []
          const claims = [
            graphClaim(WORKING_MEMORY_UNIT_ID),
            graphClaim(RETRIEVABLE_UNIT_ID),
          ].filter((claim) => !observedExclusions.includes(claim.knowledgeUnitId))
          return { outcome: 'success', claims, truncated: false }
        },
      ).graph_memory
      return {
        tools: { graph_memory },
        registrations: [{
          name: 'graph_memory',
          tool: graph_memory,
          strategyHint: 'test',
        }],
      }
    })
    runTurnMocks.streamText.mockImplementation(({ tools }) => {
      toolInvocation = tools.graph_memory.execute(
        { maxDepth: 4, nodeBudget: 512, frontierBudget: 128 },
        { toolCallId: 'graph-memory-working-window', messages: [] },
      )
      return streamResult
    })
    const { runTurn } = await loadRunTurn()

    await runTurn(context(), stubHost().host)
    const result = await toolInvocation

    expect(observedExclusions).toEqual([WORKING_MEMORY_UNIT_ID])
    expect(result).toMatchObject({
      claims: [{ unitId: RETRIEVABLE_UNIT_ID }],
    })
    expect(result).not.toEqual(
      expect.objectContaining({
        claims: expect.arrayContaining([
          expect.objectContaining({ unitId: WORKING_MEMORY_UNIT_ID }),
        ]),
      }),
    )
  })
})

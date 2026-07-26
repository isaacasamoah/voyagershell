import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  context,
  loadRunTurnWithRealStreamText,
  resetRunTurnFixture,
  runTurnMocks,
  stubHost,
} from './run-turn-test-fixture'

const { claimVoyagerResponseIngress, resolveUserModelWithMeta } = runTurnMocks

// The provider stream-part union, taken from the SDK rather than restated.
type StreamPart = Awaited<ReturnType<MockLanguageModelV3['doStream']>> extends
  { stream: ReadableStream<infer Part> } ? Part : never

const REPLY = 'The first half of the answer, and the second half that follows it.'

// Split so a reader can take a chunk and walk away with the rest unsent — the
// browser reloading a page it was halfway through rendering.
const replyChunks = ['The first half of the answer, ', 'and the second half that follows it.']

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
  totalTokens: { total: 30 },
}

const streamingParts: StreamPart[] = [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 'text-1' },
  ...replyChunks.map((delta) => ({ type: 'text-delta' as const, id: 'text-1', delta })),
  { type: 'text-end', id: 'text-1' },
  { type: 'finish', finishReason: { unified: 'stop', raw: 'end_turn' }, usage },
]

const streamingModel = () => new MockLanguageModelV3({
  doStream: async () => ({
    stream: simulateReadableStream({ chunks: streamingParts, chunkDelayInMs: 1 }),
  }),
})

// A generation that dies partway: two deltas land, then the provider stream
// fails outright. There is no clean finish, so there is nothing complete to
// store.
const failingModel = () => new MockLanguageModelV3({
  doStream: async () => ({
    stream: new ReadableStream<StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] })
        controller.enqueue({ type: 'text-start', id: 'text-1' })
        controller.enqueue({ type: 'text-delta', id: 'text-1', delta: replyChunks[0] })
        controller.error(new Error('provider stream collapsed'))
      },
    }),
  }),
})

const assistantWrites = () => claimVoyagerResponseIngress.mock.calls

const startTurn = async (model: MockLanguageModelV3) => {
  resolveUserModelWithMeta.mockResolvedValue({
    model,
    label: 'claude-sonnet',
    viaConnection: false,
  })
  const { runTurn } = await loadRunTurnWithRealStreamText()
  const { host, deferred } = stubHost()
  const turn = await runTurn(context(), host)
  if (turn.kind !== 'stream') throw new Error(`expected a streamed turn, got ${turn.kind}`)
  return { turn, deferred }
}

describe('a turn interrupted by the client', () => {
  beforeEach(resetRunTurnFixture)

  it('persists the whole reply after the browser cancels the response mid-stream', async () => {
    const { turn, deferred } = await startTurn(streamingModel())
    const response = turn.result.toUIMessageStreamResponse()

    // Render a little, then reload the page.
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel()

    await Promise.all(deferred)

    expect(assistantWrites()).toHaveLength(1)
    expect(claimVoyagerResponseIngress).toHaveBeenCalledWith({
      content: REPLY,
      sessionId: 'conversation-1',
      sourceEventId: 'event-1',
      userId: 'user-1',
      voyageSlug: null,
    })
  })

  it('persists the whole reply when the response body is never read at all', async () => {
    // Closing the tab before the first token: the response exists and nothing
    // ever pulls it.
    const { turn, deferred } = await startTurn(streamingModel())
    await turn.result.toUIMessageStreamResponse().body!.cancel()

    await Promise.all(deferred)

    expect(assistantWrites()).toHaveLength(1)
    expect(assistantWrites()[0][0].content).toBe(REPLY)
  })

  it('writes the assistant row exactly once when the client reads to the end', async () => {
    // The drain and the browser read the same turn. Guards the fix itself:
    // two consumers must not become two rows.
    const { turn, deferred } = await startTurn(streamingModel())
    const response = turn.result.toUIMessageStreamResponse()
    await new Response(response.body).text()

    await Promise.all(deferred)

    expect(assistantWrites()).toHaveLength(1)
    expect(assistantWrites()[0][0].content).toBe(REPLY)
  })

  it('stores nothing when the generation itself fails partway through', async () => {
    // The alternative fix — snapshotting whatever had streamed when the client
    // left — would file this half-sentence away as a finished answer.
    const { turn, deferred } = await startTurn(failingModel())
    await turn.result.toUIMessageStreamResponse().body!.cancel()

    await Promise.all(deferred)

    expect(assistantWrites()).toHaveLength(0)
  })
})

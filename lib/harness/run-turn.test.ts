import { beforeEach, describe, expect, it } from 'vitest'
import {
  context,
  loadRunTurn,
  resetRunTurnFixture,
  runTurnMocks,
  streamResult,
  stubHost,
} from './run-turn-test-fixture'

const {
  claimSourceIngress,
  composeSystemPrompt,
  deliverRoomInvite,
  estimateCost,
  getOwnVoyagerIdentity,
  getRoom,
  getVoyageBySlug,
  getVoyageMembers,
  inviteToRoom,
  parseRoomCommand,
  resolveMemberByName,
  resolveUserModelWithMeta,
  streamText,
} = runTurnMocks

describe('runTurn', () => {
  beforeEach(resetRunTurnFixture)

  // Loop guard (the hard rule): a turn may begin ONLY on human-authored
  // input. A synthetic voyager-originated turn — the shape a future realtime→turn
  // bridge would produce — must be refused before any model call, so two named
  // Voyagers can never answer each other unbidden.
  it('refuses a voyager-originated turn (loop guard) — no model call, returns empty', async () => {
    const { runTurn } = await loadRunTurn()
    const result = await runTurn(context({ originatorActorType: 'voyager' }), stubHost().host)

    expect(result).toEqual({ kind: 'empty' })
    expect(streamText).not.toHaveBeenCalled()
    expect(claimSourceIngress).not.toHaveBeenCalled()
  })

  it('claims the ingress before the model runs, then streams', async () => {
    const { runTurn } = await loadRunTurn()
    const { host, deferred } = stubHost()

    const result = await runTurn(context(), host)

    expect(result).toEqual({ kind: 'stream', result: streamResult })
    expect(streamText).toHaveBeenCalledOnce()
    expect(claimSourceIngress).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', sessionId: 'conversation-1', content: 'Hello Voyager', isAside: false,
    }))
    // The claim is taken before the model call, not alongside it.
    expect(claimSourceIngress.mock.invocationCallOrder[0])
      .toBeLessThan(streamText.mock.invocationCallOrder[0])
    // reap + post-claim enrichment + the server-side stream drain
    expect(deferred).toHaveLength(3)
    await Promise.all(deferred)
  })

  it('refuses the turn when the same key arrives with different words', async () => {
    const { runTurn } = await loadRunTurn()
    const { IngressConflictError } = await import('@/lib/messaging/ingress')
    claimSourceIngress.mockRejectedValue(new IngressConflictError('source_intent_payload_conflict'))

    const result = await runTurn(context(), stubHost().host)

    expect(result.kind).toBe('text')
    expect(streamText).not.toHaveBeenCalled()
  })

  it('does not run the model again when the source ingress is a replay', async () => {
    claimSourceIngress.mockResolvedValue({
      eventId: 'event-1', status: 'replayed', recipients: [],
    })
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context(), stubHost().host)

    expect(result).toEqual({ kind: 'empty' })
    expect(streamText).not.toHaveBeenCalled()
  })

  it('resolves +name as a deterministic room invitation without a model turn', async () => {
    parseRoomCommand.mockReturnValue({ op: 'add', name: 'vanessa' })
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-1', displayName: 'Isaac' },
      { userId: 'user-2', displayName: 'Vanessa' },
    ])
    resolveMemberByName.mockReturnValue({ userId: 'user-2', displayName: 'Vanessa' })
    inviteToRoom.mockResolvedValue({ state: 'invited', spaceId: 'space-1' })
    deliverRoomInvite.mockResolvedValue(undefined)
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context({
      voyageSlug: 'launch',
      newMessage: '+vanessa',
    }), stubHost().host)

    expect(result).toEqual({
      kind: 'text',
      text: 'Invited Vanessa — they can hop in by replying to the invite.',
    })
    expect(deliverRoomInvite).toHaveBeenCalledWith(
      'conversation-1',
      { userId: 'user-1', displayName: 'Isaac' },
      'user-2',
      'space-1',
      'launch',
    )
    expect(streamText).not.toHaveBeenCalled()
  })

  it('claims an unaddressed room message with its room audience and returns empty', async () => {
    getRoom.mockResolvedValue({ roomPeople: ['user-2'], aiPresent: true, spaceId: 'space-1' })
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-1', displayName: 'Isaac' },
      { userId: 'user-2', displayName: 'Vanessa' },
    ])
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context({
      voyageSlug: 'launch',
      newMessage: 'The fix is ready',
    }), stubHost().host)

    expect(result).toEqual({ kind: 'empty' })
    expect(claimSourceIngress).toHaveBeenCalledWith(expect.objectContaining({
      content: 'The fix is ready', isAside: false,
      room: { roomPeople: ['user-2'], aiPresent: true, spaceId: 'space-1' },
    }))
    expect(streamText).not.toHaveBeenCalled()
  })

  it('treats an @voyager room aside as a private model turn', async () => {
    getRoom.mockResolvedValue({ roomPeople: ['user-2'], aiPresent: false, spaceId: 'space-1' })
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-1', displayName: 'Isaac' },
      { userId: 'user-2', displayName: 'Vanessa' },
    ])
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context({
      voyageSlug: 'launch',
      newMessage: '@voyager help me think',
    }), stubHost().host)

    expect(result.kind).toBe('stream')
    expect(streamText).toHaveBeenCalledOnce()
    expect(claimSourceIngress).toHaveBeenCalledWith(expect.objectContaining({
      content: 'help me think', isAside: true,
    }))
    expect(runTurnMocks.renderMessagesForModel).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'in-flight-user-message',
          content: 'help me think',
          isPrivate: true,
        }),
      ]),
    )
  })

  it('uses the resolved default model label for cost estimation', async () => {
    const { runTurn } = await loadRunTurn()
    await runTurn(context(), stubHost().host)
    const onFinish = streamText.mock.calls[0][0].onFinish

    await onFinish({
      text: '',
      steps: [],
      finishReason: 'stop',
      usage: { inputTokens: 120, outputTokens: 30 },
      providerMetadata: {},
    })

    expect(estimateCost).toHaveBeenCalledWith('claude-sonnet', 120, 30)
  })

  it('a leading Voyager name is ordinary human room text, never an invocation', async () => {
    getRoom.mockResolvedValue({ roomPeople: ['user-1'], aiPresent: true, spaceId: 'space-1' })
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-1', displayName: 'Isaac' },
      { userId: 'user-2', displayName: 'Elisheya' },
    ])
    getOwnVoyagerIdentity.mockResolvedValue({ handle: 'hermes', displayName: 'Hermes' })
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context({
      userId: 'user-2',
      displayName: 'Elisheya',
      voyageSlug: 'launch',
      newMessage: 'wren, what did we decide?',
    }), stubHost().host)

    expect(result).toEqual({ kind: 'empty' })
    expect(streamText).not.toHaveBeenCalled()
    expect(resolveUserModelWithMeta).not.toHaveBeenCalled()
    expect(claimSourceIngress).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-2', content: 'wren, what did we decide?', isAside: false,
    }))
  })

  it('passes the canonical current handle/display pair into the prompt', async () => {
    getOwnVoyagerIdentity.mockResolvedValue({ handle: 'wren', displayName: 'Wren' })
    const { runTurn } = await loadRunTurn()

    await runTurn(context({ newMessage: '@wren think with me' }), stubHost().host)

    expect(composeSystemPrompt).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        voyagerIdentity: { handle: 'wren', displayName: 'Wren' },
      }),
    )
  })
})

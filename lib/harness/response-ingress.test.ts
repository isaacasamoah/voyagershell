import { beforeEach, describe, expect, it } from 'vitest'
import {
  context,
  loadRunTurn,
  resetRunTurnFixture,
  runTurnMocks,
  stubHost,
} from './run-turn-test-fixture'

const {
  claimSourceIngress,
  claimVoyagerResponseIngress,
  getOwnVoyagerIdentity,
  getRoom,
  getVoyageBySlug,
  getVoyageMembers,
  streamText,
} = runTurnMocks

describe('Voyager response ingress', () => {
  beforeEach(resetRunTurnFixture)

  it('does not run or persist an empty private aside', async () => {
    getOwnVoyagerIdentity.mockResolvedValue({ handle: 'wren', displayName: 'Wren' })
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context({ newMessage: '@wren' }), stubHost().host)

    expect(result).toEqual({ kind: 'empty' })
    expect(streamText).not.toHaveBeenCalled()
    expect(claimSourceIngress).not.toHaveBeenCalled()
    expect(claimVoyagerResponseIngress).not.toHaveBeenCalled()
  })

  it('stores a synthetic welcome privately without a synthetic human source', async () => {
    const { runTurn } = await loadRunTurn()
    const result = await runTurn(context({
      autoSent: true,
      newMessage: 'good morning',
    }), stubHost().host)

    expect(result.kind).toBe('stream')
    expect(claimSourceIngress).not.toHaveBeenCalled()
    const onFinish = streamText.mock.calls[0][0].onFinish
    await onFinish({
      text: 'Welcome to VoyagerShell.',
      steps: [],
      finishReason: 'stop',
      usage: null,
      providerMetadata: {},
    })
    expect(claimVoyagerResponseIngress).toHaveBeenCalledWith({
      content: 'Welcome to VoyagerShell.',
      sessionId: 'conversation-1',
      sourceEventId: null,
      userId: 'user-1',
      voyageSlug: null,
    })
  })

  it('persists an owner Voyager reply as private conversation data only', async () => {
    getRoom.mockResolvedValue({ roomPeople: ['user-2'], aiPresent: true, spaceId: 'space-1' })
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-1', displayName: 'Isaac' },
      { userId: 'user-2', displayName: 'Elisheya' },
    ])
    getOwnVoyagerIdentity.mockResolvedValue({ handle: 'wren', displayName: 'Wren' })
    const { runTurn } = await loadRunTurn()

    await runTurn(context({
      voyageSlug: 'launch',
      newMessage: '@wren think with me',
    }), stubHost().host)
    const onFinish = streamText.mock.calls[0][0].onFinish
    await onFinish({
      text: 'A private answer.',
      steps: [],
      finishReason: 'stop',
      usage: null,
      providerMetadata: {},
    })

    expect(claimVoyagerResponseIngress).toHaveBeenCalledWith({
      content: 'A private answer.',
      sessionId: 'conversation-1',
      sourceEventId: 'event-1',
      userId: 'user-1',
      voyageSlug: 'launch',
    })
    expect(runTurnMocks.enrichVoyagerResponseIngress).toHaveBeenCalledWith(
      {
        content: 'A private answer.',
        sessionId: 'conversation-1',
        sourceEventId: 'event-1',
        userId: 'user-1',
      },
      {
        eventId: 'assistant-event-1',
        status: 'created',
        recipients: [],
      },
    )
  })
})

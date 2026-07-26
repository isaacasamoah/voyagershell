import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  composeContextFromStream: vi.fn(),
  renderMessagesForModel: vi.fn((messages: Array<{
    content: string
    authorDisplayName?: string | null
    isPrivate?: boolean
  }>) => (
    messages.map((message) => ({
      ...message,
      content: message.isPrivate
        ? `[PRIVATE]: ${message.content}`
        : message.authorDisplayName
          ? `[${message.authorDisplayName}]: ${message.content}`
          : message.content,
    }))
  )),
}))

vi.mock('@/lib/conversation/stream-context', () => ({
  composeContextFromStream: mocks.composeContextFromStream,
  renderMessagesForModel: mocks.renderMessagesForModel,
}))

import { buildEnrichmentWindow } from './cartographer/window'

describe('buildEnrichmentWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('formats the cartographer model window with stream attribution', async () => {
    mocks.composeContextFromStream.mockResolvedValue([
      {
        id: 'message-1',
        conversationId: 'conversation-1',
        role: 'user',
        content: 'the deploy is ready',
        createdAt: new Date('2026-07-17T00:00:00.000Z'),
        authorDisplayName: 'Vanessa',
        authorUserId: 'user-2',
        isPrivate: false,
      },
      {
        id: 'message-2',
        conversationId: 'conversation-1',
        role: 'user',
        content: 'hold this back for now',
        createdAt: new Date('2026-07-17T00:00:01.000Z'),
        authorUserId: 'user-1',
        isPrivate: true,
      },
    ])

    const transcript = await buildEnrichmentWindow(
      'conversation-1',
      '2026-07-17T00:00:00.000Z',
      'user-1',
      'voyage-1',
    )

    expect(mocks.composeContextFromStream).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      'voyage-1',
      500,
    )
    expect(mocks.renderMessagesForModel).toHaveBeenCalled()
    expect(transcript).toContain('user: [Vanessa]: the deploy is ready')
    expect(transcript).toContain('user: [PRIVATE]: hold this back for now')
  })
})

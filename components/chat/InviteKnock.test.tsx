// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InviteKnock } from './InviteKnock'

const conversationId = '10000000-0000-4000-8000-000000000001'
const spaceId = '20000000-0000-4000-8000-000000000001'
const inviteState = { membership: 'invited' as const, spaceId }

const renderKnock = () => render(
  <InviteKnock
    content="Isaac invited you to a room."
    senderName="Isaac"
    timestamp="2026-07-24T00:00:00.000Z"
    inviteState={inviteState}
    conversationId={conversationId}
  />,
)

describe('InviteKnock response authority', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('sends the exact displayed room identity and renders only a committed transition', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responded: true }),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderKnock()

    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(screen.getByText('✓ You joined the room')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith('/api/room/invite/respond', expect.objectContaining({
      body: JSON.stringify({ conversationId, spaceId, accept: true }),
    }))
  })

  it('does not invent success when the authority reports no transition', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responded: false }),
    }))
    renderKnock()

    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(screen.getByText("Couldn't respond — try again.")).toBeTruthy())
    expect(screen.queryByText('✓ You joined the room')).toBeNull()
  })

  it('renders a legacy knock as honest history without response controls', () => {
    render(
      <InviteKnock
        content="Isaac invited you to a room — reply to join."
        senderName="Isaac"
        timestamp="2026-07-24T00:00:00.000Z"
        inviteState={null}
        conversationId={conversationId}
      />,
    )

    expect(screen.getByText(
      'This older invitation can’t be joined. Ask Isaac to send it again.',
    )).toBeTruthy()
    expect(screen.queryByText('Isaac invited you to a room — reply to join.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull()
  })
})

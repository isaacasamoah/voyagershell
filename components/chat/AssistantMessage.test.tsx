// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AssistantMessage } from './AssistantMessage'

describe('AssistantMessage share authority', () => {
  it('renders durable shared state from the server prop', () => {
    render(
      <AssistantMessage
        content="The exact answer."
        shareTarget="this room"
        shared
        onShare={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Shared to this room' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not invent shared state after a successful callback', async () => {
    const onShare = vi.fn().mockResolvedValue(undefined)
    render(
      <AssistantMessage
        content="The exact answer."
        shareTarget="this room"
        shared={false}
        onShare={onShare}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share to this room' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm share' }))
    await waitFor(() => expect(onShare).toHaveBeenCalledTimes(1))

    // The callback reloads the feed. Until the server returns shared=true, the
    // component remains unshared rather than remembering local success.
    expect((screen.getByRole('button', { name: 'Share to this room' }) as HTMLButtonElement).disabled)
      .toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { composePrompt } from './compose'

// G5: the Voyager knows its own name + owner in the cacheable static prefix.
// composePrompt's systemPrompt IS the static (cacheable) layer — the identity
// line must land here, never in the per-turn dynamic suffix.

describe('composePrompt identity layer', () => {
  it('injects "You are <Name>, <Owner>\'s Voyager" into the static prompt when named', () => {
    const composed = composePrompt({
      userId: 'u1',
      voyagerIdentity: { handle: 'wren', displayName: 'Wren' },
      ownerName: 'Isaac',
    })
    expect(composed.systemPrompt).toContain("You are Wren, Isaac's Voyager")
    expect(composed.systemPrompt).toContain('"@wren …"')
  })

  it('renders the identity as its own cacheable layer, after core', () => {
    const composed = composePrompt({
      userId: 'u1',
      voyagerIdentity: { handle: 'wren', displayName: 'Wren' },
      ownerName: 'Isaac',
    })
    const names = composed.layers.map((l) => l.name)
    expect(names).toContain('identity')
    expect(names.indexOf('identity')).toBe(names.indexOf('core') + 1)
  })

  it('omits the identity line entirely when the Voyager is unnamed', () => {
    const composed = composePrompt({ userId: 'u1' })
    expect(composed.layers.map((l) => l.name)).not.toContain('identity')
    expect(composed.systemPrompt).not.toContain("'s Voyager")
  })
})

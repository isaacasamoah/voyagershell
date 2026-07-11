import { describe, expect, it } from 'vitest'
import { detectReferenceSignals } from '@/lib/conversation/continuity'
import { detectActionIntent } from './intent'

// R2 deleted the deterministic retrieval-dispatch plane (signals.ts is gone
// entirely). These are the cooperative prompt-shaping signals that stay.
describe('cooperative shell signals', () => {
  it('keeps action intent detection', () => {
    expect(detectActionIntent('tell tom the deadline moved')).toMatchObject({
      verb: 'tell',
      target: 'tom',
      payload: 'the deadline moved',
    })
  })

  it('keeps reference signal detection', () => {
    expect(detectReferenceSignals('Remember when we discussed the launch?')).toContainEqual(
      expect.objectContaining({ type: 'cross-session', trigger: 'Remember when' }),
    )
  })
})

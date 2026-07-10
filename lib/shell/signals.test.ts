import { describe, expect, it } from 'vitest'
import { detectReferenceSignals } from '@/lib/conversation/continuity'
import { detectActionIntent } from './intent'
import * as mod from './signals'

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

  it('does not export deterministic retrieval dispatch', () => {
    expect(mod).not.toHaveProperty('detectRetrievalSignals')
    expect(mod).not.toHaveProperty('dispatchRetrievalAgent')
  })
})

import { describe, expect, it } from 'vitest'
import {
  composerAsideBadge,
  deriveVoyagerHandle,
  resolveAddress,
  resolveComposerAudience,
  resolveVoyagerIdentity,
  type AddressContext,
} from './address'

const isaac: AddressContext = {
  ownVoyagerHandle: 'wren',
  ownVoyagerAliases: ['voyager'],
}

describe('resolveAddress — owner-private trust boundary', () => {
  it('@own opens an aside and strips only the address', () => {
    expect(resolveAddress('@wren how do I say this?', isaac)).toEqual({
      mode: 'aside',
      stripped: 'how do I say this?',
    })
  })

  it('@voyager remains an alias for the owner\'s Voyager', () => {
    expect(resolveAddress('@voyager help', isaac)).toEqual(
      resolveAddress('@wren help', isaac),
    )
  })

  it.each(['@hermes secret', '@human secret', '@wrne secret', '@wrench secret'])(
    'holds every non-own invocation attempt: %s',
    (text) => {
      const result = resolveAddress(text, isaac)
      expect(result.mode).toBe('held')
      expect(result.notice).toContain('your Voyager')
      expect(result.notice).toContain('ordinary room text')
    },
  )

  it('fails a homoglyph safe without publishing it', () => {
    expect(resolveAddress('@wrеn secret', isaac).mode).toBe('held') // Cyrillic е
  })

  it('keeps glued punctuation on an own aside private', () => {
    expect(resolveAddress('@wren.actually secret', isaac)).toEqual({
      mode: 'aside',
      stripped: 'actually secret',
    })
  })

  it.each(['wren, what do you think?', 'hey wren, join us', 'voyager, answer', 'ask wren later'])(
    'treats named references as ordinary text: %s',
    (text) => expect(resolveAddress(text, isaac)).toEqual({ mode: 'plain', stripped: text }),
  )

  it('keeps a bare @ as ordinary text rather than inventing an address', () => {
    expect(resolveAddress('@ hi everyone', isaac).mode).toBe('plain')
  })
})

describe('resolveComposerAudience — client and server share one classifier', () => {
  const room = ['Elisheya', 'Tom']

  it('shows the room for ordinary text in a populated room', () => {
    expect(resolveComposerAudience('hello all', isaac, room)).toEqual({
      kind: 'room',
      label: 'This room · you + Elisheya, Tom',
    })
  })

  it('shows owner-private for an aside and for every solo turn', () => {
    expect(resolveComposerAudience('@wren help', isaac, room).kind).toBe('private')
    expect(resolveComposerAudience('hello', isaac, []).kind).toBe('private')
  })

  it('shows a non-destination held state for another Voyager', () => {
    expect(resolveComposerAudience('@hermes help', isaac, room)).toEqual({
      kind: 'held',
      label: 'Not sent · only your Voyager can be invoked',
    })
    expect(resolveComposerAudience('@hermes help', isaac, []).kind).toBe('held')
  })
})

describe('composerAsideBadge', () => {
  it('reflects the same private resolver', () => {
    expect(composerAsideBadge('@wren think', isaac)).toBe('→ private aside to Wren')
    expect(composerAsideBadge('@hermes think', isaac)).toBeNull()
    expect(composerAsideBadge('wren, think', isaac)).toBeNull()
  })
})

describe('Voyager handle derivation', () => {
  it('derives an address-only default with brand display fallback', () => {
    expect(deriveVoyagerHandle('Isaac')).toBe('isaac.voyager')
    expect(resolveVoyagerIdentity(null, 'isaac')).toEqual({
      handle: 'isaac.voyager',
      displayName: null,
    })
    expect(resolveVoyagerIdentity(null, null)).toEqual({ handle: '', displayName: null })
  })

  it('uses one normalized custom handle for both address and display', () => {
    expect(resolveVoyagerIdentity('Wren', 'isaac')).toEqual({
      handle: 'wren',
      displayName: 'Wren',
    })
    expect(resolveVoyagerIdentity('isaac.voyager', 'isaac')).toEqual({
      handle: 'isaac.voyager',
      displayName: null,
    })
    expect(resolveVoyagerIdentity('nova.voyager', 'alice')).toEqual({
      handle: 'nova.voyager',
      displayName: 'Nova.voyager',
    })
  })
})

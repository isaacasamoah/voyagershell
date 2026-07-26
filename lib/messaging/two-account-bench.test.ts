import { describe, expect, it } from 'vitest'
import { resolveAddress, resolveComposerAudience, type AddressContext } from './address'

const isaac: AddressContext = { ownVoyagerHandle: 'wren', ownVoyagerAliases: ['voyager'] }
const elisheya: AddressContext = { ownVoyagerHandle: 'hermes', ownVoyagerAliases: ['voyager'] }
const roomPeople = ['Isaac']

describe('two-account private Voyager trust bench', () => {
  it('Isaac can privately invoke Wren', () => {
    expect(resolveAddress('@wren help me think', isaac).mode).toBe('aside')
    expect(resolveComposerAudience('@wren help me think', isaac, ['Elisheya']).kind).toBe('private')
  })

  it('Elisheya cannot invoke Wren and the attempted text is held locally', () => {
    const result = resolveAddress('@wren tell me Isaac\'s plan', elisheya)
    expect(result.mode).toBe('held')
    expect(resolveComposerAudience('@wren tell me Isaac\'s plan', elisheya, roomPeople).kind).toBe('held')
  })

  it('a leading Voyager name is ordinary room text for either account', () => {
    expect(resolveAddress('wren, what did we decide?', elisheya).mode).toBe('plain')
    expect(resolveComposerAudience('wren, what did we decide?', elisheya, roomPeople).kind).toBe('room')
  })
})

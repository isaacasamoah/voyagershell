import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressResult } from '@/lib/messaging/address'
import type { HarnessHost, TurnContext } from './types'

// The G3 wiring contract: the reply/summon gate acts on the resolver's mode,
// never on a literal regex. redirect → gentle line (no private channel); aside
// & summon → fall through to the model; plain in a room with people → empty.

const getRoom = vi.fn()
const parseRoomCommand = vi.fn()
const createMessageEvent = vi.fn()
const fanOutDeliveries = vi.fn()
const getVoyageBySlug = vi.fn()
const getVoyageMembers = vi.fn()

const loadRoomTurn = async () => {
  vi.resetModules()
  vi.doMock('@/lib/knowledge', () => ({ createMessageEvent }))
  vi.doMock('@/lib/messaging/deliveries', () => ({ fanOutDeliveries }))
  vi.doMock('@/lib/messaging/invites', () => ({
    deliverRoomInvite: vi.fn(),
    inviteToRoom: vi.fn(),
  }))
  vi.doMock('@/lib/messaging/room', () => ({
    getRoom,
    parseRoomCommand,
    removeRoomPerson: vi.fn(),
    setAiPresent: vi.fn(),
  }))
  vi.doMock('@/lib/voyage', () => ({
    getVoyageBySlug,
    getVoyageMembers,
    resolveMemberByName: vi.fn(),
  }))
  return import('./room-turn')
}

const ctx = (overrides: Partial<TurnContext> = {}): TurnContext => ({
  userId: 'user-isaac',
  conversationId: 'conversation-1',
  voyageSlug: 'launch',
  authState: 'authenticated',
  autoSent: false,
  newMessage: '',
  displayName: 'Isaac',
  ...overrides,
})

const host = (): HarnessHost => ({ defer: vi.fn(), now: () => new Date('2026-07-11T00:00:00.000Z') })

const addr = (over: Partial<AddressResult>): AddressResult => ({ mode: 'plain', stripped: '', ...over })

describe('runRoomTurn — the resolver mode drives the gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRoom.mockResolvedValue({ roomPeople: ['user-elisheya'], aiPresent: true })
    parseRoomCommand.mockReturnValue(null)
    createMessageEvent.mockResolvedValue('event-1')
    fanOutDeliveries.mockResolvedValue(undefined)
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-isaac', displayName: 'Isaac' },
      { userId: 'user-elisheya', displayName: 'Elisheya' },
    ])
  })

  it('@other → a gentle redirect line, never a private channel', async () => {
    const { runRoomTurn } = await loadRoomTurn()
    const result = await runRoomTurn({
      ctx: ctx({ newMessage: '@wren help me' }),
      host: host(),
      queryText: '@wren help me',
      address: addr({ mode: 'redirect', targetHandle: 'wren', targetOwnerName: 'Isaac', stripped: '@wren help me' }),
    })
    expect(result?.kind).toBe('text')
    expect(result && 'text' in result ? result.text : '').toContain("Isaac's Voyager")
    expect(result && 'text' in result ? result.text : '').toContain('wren')
  })

  it('@own aside → falls through to the model turn (null), persisted private', async () => {
    const { runRoomTurn } = await loadRoomTurn()
    const result = await runRoomTurn({
      ctx: ctx({ newMessage: '@wren think with me' }),
      host: host(),
      queryText: 'think with me',
      address: addr({ mode: 'aside', stripped: 'think with me' }),
    })
    expect(result).toBeNull()
    expect(fanOutDeliveries).not.toHaveBeenCalled()
  })

  it('leading-name summon → falls through to the model turn (null)', async () => {
    const { runRoomTurn } = await loadRoomTurn()
    const result = await runRoomTurn({
      ctx: ctx({ newMessage: 'wren, help me' }),
      host: host(),
      queryText: 'wren, help me',
      address: addr({ mode: 'summon', targetHandle: 'wren', stripped: 'help me' }),
    })
    expect(result).toBeNull()
  })

  it('mid-sentence / plain chatter in a room with people → empty (voyager stays out)', async () => {
    const { runRoomTurn } = await loadRoomTurn()
    const result = await runRoomTurn({
      ctx: ctx({ newMessage: 'ask wren about the tree' }),
      host: host(),
      queryText: 'ask wren about the tree',
      address: addr({ mode: 'plain', stripped: 'ask wren about the tree' }),
    })
    expect(result?.kind).toBe('empty')
    expect(fanOutDeliveries).toHaveBeenCalledWith('event-1', ['user-elisheya'])
  })

  it('held (@unknown token) → private notice to the sender, NEVER fanned out or persisted', async () => {
    // The Test Gate regression: `@wren <secret>` typed before `wren` existed
    // reached the other member. Held must return the notice to the sender only,
    // touching neither the room fan-out nor the persisted stream.
    const { runRoomTurn } = await loadRoomTurn()
    const result = await runRoomTurn({
      ctx: ctx({ newMessage: '@wren the code is 4321' }),
      host: host(),
      queryText: '@wren the code is 4321',
      address: addr({
        mode: 'held',
        notice: 'No one called "wren" is here — say it without the @ to send it to the room.',
        stripped: '@wren the code is 4321',
      }),
    })
    expect(result?.kind).toBe('text')
    expect(result && 'text' in result ? result.text : '').toContain('without the @')
    expect(fanOutDeliveries).not.toHaveBeenCalled()
    expect(createMessageEvent).not.toHaveBeenCalled()
  })
})

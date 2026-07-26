import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressResult } from '@/lib/messaging/address'
import type { RoomState } from '@/lib/messaging/room'
import type { TurnContext } from './types'

const getRoom = vi.fn()
const parseRoomCommand = vi.fn()
const getVoyageBySlug = vi.fn()
const getVoyageMembers = vi.fn()

const loadRoomTurn = async () => {
  vi.resetModules()
  vi.doMock('@/lib/messaging/invites', () => ({ deliverRoomInvite: vi.fn(), inviteToRoom: vi.fn() }))
  vi.doMock('@/lib/messaging/room', () => ({
    getRoom,
    removeRoomPerson: vi.fn(),
    setAiPresent: vi.fn(),
  }))
  vi.doMock('@/lib/messaging/room-command', () => ({ parseRoomCommand }))
  vi.doMock('@/lib/voyage/core', () => ({ getVoyageBySlug }))
  vi.doMock('@/lib/voyage/members', () => ({ getVoyageMembers, resolveMemberByName: vi.fn() }))
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
const addr = (over: Partial<AddressResult>): AddressResult => ({ mode: 'plain', stripped: '', ...over })
const populated: RoomState = { roomPeople: ['user-elisheya'], aiPresent: true, spaceId: 'space-1' }

describe('the room gate — everything decided before anything is written', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRoom.mockResolvedValue(populated)
    parseRoomCommand.mockReturnValue(null)
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-isaac', displayName: 'Isaac' },
      { userId: 'user-elisheya', displayName: 'Elisheya' },
    ])
  })

  it('passes an ordinary send through, carrying the room it resolved', async () => {
    const { runRoomGate } = await loadRoomTurn()
    const gate = await runRoomGate({
      ctx: ctx({ newMessage: 'wren, help me' }),
      queryText: 'wren, help me',
      address: addr({ mode: 'plain', stripped: 'wren, help me' }),
    })
    expect(gate.result).toBeNull()
    expect(gate.room).toEqual(populated)
    expect(gate.senderDisplayName).toBe('Isaac')
  })

  it('holds a non-own @ attempt, so the claim is never reached', async () => {
    const { runRoomGate } = await loadRoomTurn()
    const gate = await runRoomGate({
      ctx: ctx({ newMessage: '@hermes private' }),
      queryText: '@hermes private',
      address: addr({
        mode: 'held',
        notice: 'Only your Voyager can be invoked here.',
        stripped: '@hermes private',
      }),
    })
    expect(gate.result).toEqual({
      kind: 'text',
      text: 'Only your Voyager can be invoked here.',
    })
  })
})

describe('runRoomTurn — private Voyager, ordinary room', () => {
  it('@own falls through to the private model turn', async () => {
    const { runRoomTurn } = await loadRoomTurn()
    expect(runRoomTurn(populated, addr({ mode: 'aside', stripped: 'think with me' }))).toBeNull()
  })

  it('leading-name text stays human room text and never opens a model turn', async () => {
    const { runRoomTurn } = await loadRoomTurn()
    expect(runRoomTurn(populated, addr({ mode: 'plain', stripped: 'wren, help me' })))
      .toEqual({ kind: 'empty' })
  })

  it('an empty room always reaches the Voyager', async () => {
    const { runRoomTurn } = await loadRoomTurn()
    expect(runRoomTurn({ roomPeople: [], aiPresent: true, spaceId: null },
      addr({ mode: 'plain', stripped: 'hello' }))).toBeNull()
  })
})

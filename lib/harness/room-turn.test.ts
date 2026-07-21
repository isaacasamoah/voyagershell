import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressResult } from '@/lib/messaging/address'
import type { HarnessHost, TurnContext } from './types'

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
  vi.doMock('@/lib/messaging/invites', () => ({ deliverRoomInvite: vi.fn(), inviteToRoom: vi.fn() }))
  vi.doMock('@/lib/messaging/room', () => ({ getRoom, parseRoomCommand, removeRoomPerson: vi.fn(), setAiPresent: vi.fn() }))
  vi.doMock('@/lib/voyage', () => ({ getVoyageBySlug, getVoyageMembers, resolveMemberByName: vi.fn() }))
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

describe('runRoomTurn — private Voyager, ordinary room', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRoom.mockResolvedValue({ roomPeople: ['user-elisheya'], aiPresent: true })
    parseRoomCommand.mockReturnValue(null)
    createMessageEvent.mockResolvedValue('event-1')
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-isaac', displayName: 'Isaac' },
      { userId: 'user-elisheya', displayName: 'Elisheya' },
    ])
  })

  it('@own falls through to the private model turn without fan-out', async () => {
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

  it('leading-name text stays human room text and never opens a model turn', async () => {
    const { runRoomTurn } = await loadRoomTurn()
    const result = await runRoomTurn({
      ctx: ctx({ newMessage: 'wren, help me' }),
      host: host(),
      queryText: 'wren, help me',
      address: addr({ mode: 'plain', stripped: 'wren, help me' }),
    })
    expect(result).toEqual({ kind: 'empty' })
    expect(createMessageEvent).toHaveBeenCalledWith(
      'conversation-1',
      'user',
      'wren, help me',
      expect.objectContaining({ source: 'room' }),
    )
    expect(fanOutDeliveries).toHaveBeenCalledWith('event-1', ['user-elisheya'])
  })

  it('holds a non-own @ attempt before persistence or delivery', async () => {
    const { runRoomTurn } = await loadRoomTurn()
    const result = await runRoomTurn({
      ctx: ctx({ newMessage: '@hermes private' }),
      host: host(),
      queryText: '@hermes private',
      address: addr({ mode: 'held', notice: 'Only your Voyager can be invoked here.', stripped: '@hermes private' }),
    })
    expect(result).toEqual({ kind: 'text', text: 'Only your Voyager can be invoked here.' })
    expect(createMessageEvent).not.toHaveBeenCalled()
    expect(fanOutDeliveries).not.toHaveBeenCalled()
  })
})

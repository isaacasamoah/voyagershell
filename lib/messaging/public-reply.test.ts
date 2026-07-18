import { describe, expect, it } from 'vitest'
import { planPublicReply, isHumanTurnInput, type PublicReplyPlan } from './public-reply'
import { composeContextRows } from '@/lib/conversation/stream-context'
import type { FeedEventRow } from '@/lib/messaging/feed'

// ── The public-voice proof-of-concept bench (cut ④) ──────────────────────────
// Exercises the RISKIEST claim — owner-anchored attribution (§6.5) — end to end
// against REAL code: the plan feeds a synthetic-but-faithful reply row through the
// SHIPPED stream-context mapper and asserts the trust boundary holds. Plus the
// center of intent (fan-out shape) and the loop guard. Deterministic, no DB, no
// browser — the human-ritual browser bench is the primary Test-gate recipe.

const ISAAC = 'user-isaac' // owner of "wren"
const ELISHEYA = 'user-elisheya' // summoner in the cross-owner case
const NOMAD = 'user-nomad' // a third, silent room member
const CONV = 'conv-fambam'

const wrenInput = {
  voyagerOwnerUserId: ISAAC,
  voyagerName: 'Wren',
  voyagerOwnerName: 'Isaac',
}

// Build the knowledge_events row cut ④ persists FROM a fan-out plan — the exact
// shape stream-context reads, so the mapping assertions run on real code.
const rowFromPlan = (plan: PublicReplyPlan, content: string): FeedEventRow => ({
  id: 'evt-wren-reply',
  event_type: plan.eventType,
  content,
  created_at: '2026-07-18T09:00:00.000Z',
  metadata: {
    session_id: CONV,
    source: plan.source ?? null,
    sender_display_name: plan.senderDisplayName ?? null,
    sender_user_id: plan.userId,
  },
  source_ref: { conversation_id: CONV, role: plan.role },
  actor_type: 'voyager', // createMessageEvent derives this from role='assistant'
  user_id: plan.userId,
  participants: plan.participants,
  voyage_slug: null,
})

describe('cut ④ · fan-out plan — the center of intent (the whole family sees it)', () => {
  it('cross-owner public summon fans to the room, under the OWNER, attributed', () => {
    // Elisheya summons Isaac's Wren; room = {Isaac, Elisheya, Nomad}.
    const plan = planPublicReply({
      ...wrenInput,
      mode: 'summon',
      summonerUserId: ELISHEYA,
      activeMemberIds: [ISAAC, ELISHEYA, NOMAD],
    })
    expect(plan.fanOut).toBe(true)
    expect(plan.eventType).toBe('message') // NOT 'conversation' — the §6.5 pin
    expect(plan.userId).toBe(ISAAC) // owner is the identity of record, NOT the summoner
    expect(plan.participants.sort()).toEqual([ELISHEYA, ISAAC, NOMAD].sort()) // all active see it
    expect(plan.recipients.sort()).toEqual([ELISHEYA, NOMAD].sort()) // delivery to all but owner
    expect(plan.senderDisplayName).toBe('Wren')
    expect(plan.ownerDisplayName).toBe('Isaac')
    expect(plan.source).toBe('room')
  })

  it('self-summon in a populated room still fans out under the owner (=summoner)', () => {
    const plan = planPublicReply({
      ...wrenInput,
      mode: 'summon',
      summonerUserId: ISAAC,
      activeMemberIds: [ISAAC, ELISHEYA],
    })
    expect(plan.fanOut).toBe(true)
    expect(plan.userId).toBe(ISAAC)
    expect(plan.recipients).toEqual([ELISHEYA]) // owner (=summoner) excluded from delivery
    expect(plan.participants.sort()).toEqual([ELISHEYA, ISAAC].sort())
  })

  it('recipients are FRESH — a member who left before reply time is not fanned', () => {
    // Nomad left during the stream: activeMemberIds recomputed at turn-end omits them.
    const plan = planPublicReply({
      ...wrenInput,
      mode: 'summon',
      summonerUserId: ELISHEYA,
      activeMemberIds: [ISAAC, ELISHEYA],
    })
    expect(plan.recipients).not.toContain(NOMAD)
    expect(plan.participants).not.toContain(NOMAD)
  })
})

describe('cut ④ · aside/solo stay PRIVATE — no fan-out (regression guard)', () => {
  it('an @wren aside is never fanned — stays participants=[asker]', () => {
    const plan = planPublicReply({
      ...wrenInput,
      mode: 'aside',
      summonerUserId: ISAAC,
      activeMemberIds: [ISAAC, ELISHEYA],
    })
    expect(plan.fanOut).toBe(false)
    expect(plan.eventType).toBe('conversation')
    expect(plan.participants).toEqual([ISAAC])
    expect(plan.recipients).toEqual([])
    expect(plan.senderDisplayName).toBeUndefined() // stays the flat "Voyager"
  })

  it('a solo turn (no other members) is not fanned even on a summon', () => {
    const plan = planPublicReply({
      ...wrenInput,
      mode: 'summon',
      summonerUserId: ISAAC,
      activeMemberIds: [ISAAC],
    })
    expect(plan.fanOut).toBe(false)
    expect(plan.participants).toEqual([ISAAC])
  })
})

describe('cut ④ · RISKIEST claim — owner-anchored attribution, verified on REAL stream-context', () => {
  const plan = planPublicReply({
    ...wrenInput,
    mode: 'summon',
    summonerUserId: ELISHEYA,
    activeMemberIds: [ISAAC, ELISHEYA, NOMAD],
  })
  const row = rowFromPlan(plan, 'You both landed on the same tradeoff.')

  it("the OWNER reads Wren's reply as role=assistant (her own Voyager spoke)", () => {
    const [msg] = composeContextRows([row], ISAAC, CONV)
    expect(msg.role).toBe('assistant')
    expect(msg.authorDisplayName ?? null).toBeNull() // no [Wren] prefix for the owner
  })

  it("the SUMMONER reads it as an attributed [Wren] line — NEVER as her own turn", () => {
    // This is the §6.5 boundary: Elisheya summoned Wren, but Wren's words must NOT
    // enter Elisheya's model as role=assistant. If this flips, Wren's voice becomes
    // Elisheya's own — the exact inversion bug.
    const [msg] = composeContextRows([row], ELISHEYA, CONV)
    expect(msg.role).toBe('user')
    expect(msg.authorDisplayName).toBe('Wren')
  })

  it('a silent bystander also reads it attributed, never as their own', () => {
    const [msg] = composeContextRows([row], NOMAD, CONV)
    expect(msg.role).toBe('user')
    expect(msg.authorDisplayName).toBe('Wren')
  })

  it("an UNNAMED voyager's fan-out still attributes as [Voyager] — never bare text", () => {
    // BUG-2 regression. A voyager its owner hasn't named yet arrives as
    // voyagerName='' upstream (finishTurn coerces the nullable name). The plan
    // must persist NO sender_display_name — undefined, not '' — so stream-context's
    // `?? 'Voyager'` fallback fires. A persisted '' is not nullish, so it would
    // survive the coalesce, strip the attribution, and a bystander would ingest
    // the voyager's words as their OWN turn (the §6.5 inversion, unnamed path).
    const unnamed = planPublicReply({
      ...wrenInput,
      voyagerName: '',
      mode: 'summon',
      summonerUserId: ELISHEYA,
      activeMemberIds: [ISAAC, ELISHEYA, NOMAD],
    })
    expect(unnamed.senderDisplayName).toBeUndefined()
    expect(unnamed.ownerDisplayName).toBeUndefined() // no owner line without a name
    const [msg] = composeContextRows([rowFromPlan(unnamed, 'The budget looks tight.')], NOMAD, CONV)
    expect(msg.role).toBe('user')
    expect(msg.authorDisplayName).toBe('Voyager') // attributed, NOT '' / bare text
  })

  it('CONTROL — persisting the same reply as a conversation event WOULD invert it', () => {
    // Documents WHY the plan uses event_type='message' + user_id=owner. A
    // 'conversation' assistant row maps to role=assistant for EVERY viewer, so a
    // non-owner would ingest Wren's words as their own. The plan structurally
    // refuses this shape.
    const inverted: FeedEventRow = { ...row, event_type: 'conversation' }
    const [msg] = composeContextRows([inverted], ELISHEYA, CONV)
    expect(msg.role).toBe('assistant') // the bug — which is why plan.eventType is 'message'
  })
})

describe('cut ④ · loop guard — actor=voyager never triggers a turn (the hard rule)', () => {
  it('only human-authored input may open a turn', () => {
    expect(isHumanTurnInput('user')).toBe(true)
    expect(isHumanTurnInput('voyager')).toBe(false)
    expect(isHumanTurnInput('system')).toBe(false)
  })

  it('every fanned reply is stamped actor=voyager, so it can never pass the guard', () => {
    const plan = planPublicReply({
      ...wrenInput,
      mode: 'summon',
      summonerUserId: ELISHEYA,
      activeMemberIds: [ISAAC, ELISHEYA],
    })
    const row = rowFromPlan(plan, 'hermes, what do you reckon?') // even name-leading text
    // The reply is data (actor=voyager), never re-POSTed — the guard rejects it.
    expect(row.actor_type).toBe('voyager')
    expect(isHumanTurnInput(row.actor_type)).toBe(false)
  })
})

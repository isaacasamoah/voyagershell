import type { KnowledgeType } from '@/lib/knowledge/event-types'

export interface EffectiveAttentionInput {
  birthAttention: number
  knowledgeType: KnowledgeType
  sessionDistance: number
  windowedReachCitations: number
  retired?: boolean
}

const DECAY_CURVE: Record<number, number> = {
  0: 1,
  1: 0.9,
  2: 0.75,
  3: 0.5,
  4: 0.4,
  5: 0.3,
}

const roundToHundredth = (value: number): number =>
  Math.round(value * 100) / 100

const decayFactor = (distance: number): number => {
  if (distance <= 0) return DECAY_CURVE[0]
  if (distance >= 5) return DECAY_CURVE[5]
  return DECAY_CURVE[distance] ?? DECAY_CURVE[5]
}

export const calculateEffectiveAttention = (
  input: EffectiveAttentionInput,
): number => {
  const {
    birthAttention,
    knowledgeType,
    sessionDistance,
    windowedReachCitations,
    retired = false,
  } = input
  if (!Number.isFinite(birthAttention) || birthAttention < 0 || birthAttention > 1)
    throw new Error('knowledge_unit_birth_attention_invalid')
  if (!Number.isInteger(sessionDistance) || sessionDistance < 0)
    throw new Error('knowledge_unit_session_distance_invalid')
  if (!Number.isInteger(windowedReachCitations) || windowedReachCitations < 0)
    throw new Error('knowledge_unit_citation_count_invalid')
  if (retired) return 0

  let decayed = birthAttention
  if (knowledgeType !== 'preference') {
    const rawFactor = decayFactor(sessionDistance)
    const typeFactor = knowledgeType === 'domain'
      ? 1 - (1 - rawFactor) * 0.5
      : rawFactor
    decayed = roundToHundredth(birthAttention * typeFactor)
    if (
      knowledgeType === 'domain'
      && sessionDistance >= 5
      && windowedReachCitations === 0
    ) {
      decayed = Math.max(
        0,
        roundToHundredth(decayed - (sessionDistance - 5 + 1) * 0.1),
      )
    }
  }
  return Math.min(decayed + 0.05 * windowedReachCitations, 1)
}

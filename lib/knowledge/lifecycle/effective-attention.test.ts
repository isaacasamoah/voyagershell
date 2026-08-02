import { describe, expect, it } from 'vitest'
import { calculateEffectiveAttention } from './effective-attention'

describe('computed effective attention', () => {
  it.each([
    [0.8, 'operational', 0, 0, false, 0.8],
    [0.8, 'operational', 1, 0, false, 0.72],
    [0.8, 'operational', 2, 2, false, 0.7],
    [0.8, 'domain', 1, 0, false, 0.76],
    [0.8, 'domain', 5, 0, false, 0.42],
    [0.8, 'domain', 5, 2, false, 0.62],
    [0.8, 'preference', 5, 2, false, 0.9],
    [0.95, 'preference', 0, 10, false, 1],
    [0.8, 'domain', 0, 2, true, 0],
  ] as const)(
    'computes birth=%s type=%s distance=%s citations=%s retired=%s',
    (birthAttention, knowledgeType, sessionDistance,
      windowedReachCitations, retired, expected) => {
      expect(calculateEffectiveAttention({
        birthAttention,
        knowledgeType,
        sessionDistance,
        windowedReachCitations,
        retired,
      })).toBeCloseTo(expected)
    },
  )

  it('names terminal zero as an act-backed divergence', () => {
    const fixture = {
      birthAttention: 0.6,
      knowledgeType: 'operational' as const,
      sessionDistance: 6,
      windowedReachCitations: 0,
    }
    expect(calculateEffectiveAttention(fixture)).toBeGreaterThan(0)
    expect(calculateEffectiveAttention({ ...fixture, retired: true })).toBe(0)
  })

  it.each([
    { birthAttention: -0.1, sessionDistance: 0, windowedReachCitations: 0 },
    { birthAttention: 0.5, sessionDistance: -1, windowedReachCitations: 0 },
    { birthAttention: 0.5, sessionDistance: 0, windowedReachCitations: 0.5 },
  ])('rejects invalid arithmetic input %#', (invalid) => {
    expect(() => calculateEffectiveAttention({
      knowledgeType: 'domain',
      ...invalid,
    })).toThrow()
  })
})

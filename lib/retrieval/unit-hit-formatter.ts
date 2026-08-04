import type { KnowledgeUnitHit } from '@/lib/knowledge/unit-search'

export const formatKnowledgeUnitHit = (
  hit: KnowledgeUnitHit,
  index: number,
  includeSourceContent = false,
): string => {
  const retired = hit.retired ? ' [RETRACTED]' : ''
  const pinned = hit.effectiveAttention >= 0.9 ? ' [PINNED]' : ''
  const score = hit.score === null ? '' : ` (${hit.score.toFixed(3)})`
  const source = includeSourceContent
    ? `\nSource content:\n${hit.sourceContent}`
    : ''
  return `[${index + 1}] id:${hit.unitId} source:${hit.sourceEventId}${retired}${pinned}${score}\n${hit.claim}${source}`
}

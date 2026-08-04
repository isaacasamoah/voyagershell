import type { KnowledgeGraphResult } from './boundary'

export interface KnowledgeGraphBoundaryTiming {
  readonly outcome: KnowledgeGraphResult['outcome']
  readonly authMs: number
  readonly clientAcquisitionMs: number
  readonly transportMs: number
  readonly parseMs: number
  readonly beforeFloorMs: number
  readonly floorWaitMs: number
  readonly totalMs: number
}

const BOUNDARY_TIMING_ENABLED = process.env.K5A_BOUNDARY_TIMING === '1'
const BOUNDARY_TIMING_MARK = 'voyager.knowledge-graph-boundary'

export const markKnowledgeGraphBoundaryTiming = (
  timing: KnowledgeGraphBoundaryTiming,
): void => {
  if (!BOUNDARY_TIMING_ENABLED) return
  try {
    performance.mark(BOUNDARY_TIMING_MARK, { detail: timing })
  } catch {
    // Diagnostics cannot change the retrieval result.
  }
}

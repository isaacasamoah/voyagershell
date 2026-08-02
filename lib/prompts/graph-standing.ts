import type { CuratedWindow, KnowledgeNode } from "@/lib/knowledge";
import type {
  KnowledgeGraphClaim,
  KnowledgeGraphResult,
} from "@/lib/knowledge/kernel/boundary";

export const graphMemoryReachWarning = (
  graphMemory: KnowledgeGraphResult,
): string | null =>
  graphMemory.outcome !== "success"
    ? `# Memory reach\nGraph memory reach was cut short (${graphMemory.outcome}). Do not infer that no graph memory exists.`
    : graphMemory.truncated
      ? "# Memory reach\nGraph memory reach was partial because a traversal budget was reached. Do not treat it as a complete memory search."
      : null;

export const selectGraphStandingClaims = (
  graphMemory: KnowledgeGraphResult,
): KnowledgeGraphClaim[] => graphMemory.claims.filter(
  (claim) =>
    claim.knowledgeType === "preference" && claim.attentionScore >= 0.5,
);

export const selectGraphStandingPreferences = (
  curatedWindow: CuratedWindow,
  graphMemory: KnowledgeGraphResult,
): KnowledgeGraphClaim[] => {
  const projectedEventIds = new Set(
    curatedWindow.preferences.map((item) => item.eventId),
  );
  return selectGraphStandingClaims(graphMemory).filter(
    (claim) => !projectedEventIds.has(claim.sourceEventId),
  );
};

export const mergeGraphStandingPreferences = (
  curatedWindow: CuratedWindow,
  graphMemory: KnowledgeGraphResult,
): CuratedWindow => {
  const graphPreferences: KnowledgeNode[] = selectGraphStandingPreferences(
    curatedWindow,
    graphMemory,
  )
    .map((claim) => ({
      eventId: claim.sourceEventId,
      content: claim.claim,
      classifications: [],
      entities: [],
      topics: [],
      createdAt: new Date(),
      knowledgeType: claim.knowledgeType,
      attentionScore: claim.attentionScore,
      contextSnippet: claim.claim,
    }));
  return {
    ...curatedWindow,
    preferences: [...curatedWindow.preferences, ...graphPreferences],
  };
};

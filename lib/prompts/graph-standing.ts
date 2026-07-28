import type { CuratedWindow, KnowledgeNode } from "@/lib/knowledge";
import type { KnowledgeGraphResult } from "@/lib/knowledge/kernel/boundary";

export const mergeGraphStandingPreferences = (
  curatedWindow: CuratedWindow,
  graphMemory: KnowledgeGraphResult,
): CuratedWindow => {
  const projectedEventIds = new Set(
    curatedWindow.preferences.map((item) => item.eventId),
  );
  const graphPreferences: KnowledgeNode[] = graphMemory.claims
    .filter(
      (claim) =>
        claim.knowledgeType === "preference" &&
        claim.attentionScore >= 0.5 &&
        !projectedEventIds.has(claim.sourceEventId),
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

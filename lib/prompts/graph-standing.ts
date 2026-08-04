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

export const selectGraphStandingDeliveryClaims = (
  graphMemory: KnowledgeGraphResult,
): KnowledgeGraphClaim[] => {
  const claimsByUnitId = new Map(
    graphMemory.claims.map((claim) => [claim.knowledgeUnitId, claim]),
  );
  const delivered = new Map<string, KnowledgeGraphClaim>();
  for (const claim of selectGraphStandingClaims(graphMemory)) {
    delivered.set(claim.knowledgeUnitId, claim);
    for (const tension of claim.tensions) {
      const partner = claimsByUnitId.get(tension.withUnitId);
      if (partner) delivered.set(partner.knowledgeUnitId, partner);
    }
  }
  return Array.from(delivered.values());
};

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
  const claimsByUnitId = new Map(
    graphMemory.claims.map((claim) => [claim.knowledgeUnitId, claim]),
  );
  const tensionLabel = (claim: KnowledgeGraphClaim): string =>
    claim.tensions.length === 0
      ? ""
      : ` [Memory tension: ${claim.tensions.map((tension) => {
          const partner = claimsByUnitId.get(tension.withUnitId);
          const partnerLabel = partner
            ? `"${partner.claim}"`
            : "another viewer-visible memory";
          return `this claim is ${tension.relativeRecency} than ${partnerLabel}`;
        }).join("; ")}.]`;
  const standingByEventId = new Map(
    selectGraphStandingClaims(graphMemory).map(
      (claim) => [claim.sourceEventId, claim],
    ),
  );
  const projectedPreferences = curatedWindow.preferences.map((item) => {
    const standing = standingByEventId.get(item.eventId);
    const label = standing ? tensionLabel(standing) : "";
    return label ? { ...item, content: `${item.content}${label}` } : item;
  });
  const graphPreferences: KnowledgeNode[] = selectGraphStandingPreferences(
    curatedWindow,
    graphMemory,
  )
    .map((claim) => {
      return {
        eventId: claim.sourceEventId,
        content: `${claim.claim}${tensionLabel(claim)}`,
        classifications: [],
        entities: [],
        topics: [],
        createdAt: new Date(),
        knowledgeType: claim.knowledgeType,
        attentionScore: claim.attentionScore,
        contextSnippet: claim.claim,
      };
    });
  return {
    ...curatedWindow,
    preferences: [...projectedPreferences, ...graphPreferences],
  };
};

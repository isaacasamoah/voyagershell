import { curatePromptWindow } from "@/lib/knowledge";
import type { KnowledgeGraphResult } from "@/lib/knowledge/kernel/boundary";
import { retrieveKnowledgeGraphClaims } from "@/lib/knowledge/kernel/boundary";
import { recordKnowledgeUnitCitations } from "@/lib/knowledge/lifecycle/citations";
import { upsertPersonSessionIndex } from "@/lib/knowledge/lifecycle/session-index";
import { loadVoyageContext } from "@/lib/voyage/context";
import {
  mergeGraphStandingPreferences,
  selectGraphStandingDeliveryClaims,
} from "./graph-standing";

export const loadSystemPromptMemory = async (
  userId: string,
  voyageSlug?: string,
  sessionId?: string,
) => {
  // A graph claim cannot enter working memory without a durable per-person
  // session identity. The event count is incremented later by Cartographer.
  const sessionIndexed = sessionId
    ? await upsertPersonSessionIndex(userId, sessionId, 0)
    : false;

  // Message awareness is delivered on the wire and retrieved on demand, not
  // re-narrated into the prompt alongside this curated memory.
  const [voyageContext, graphMemory] = await Promise.all([
    voyageSlug
      ? loadVoyageContext(voyageSlug, userId).catch((error) => {
          console.warn("[Prompts] Failed to load voyage context:", error);
          return null;
        })
      : Promise.resolve(null),
    sessionIndexed
      ? retrieveKnowledgeGraphClaims(
          { kind: "person", authorityId: userId },
          { claimBudget: 64, nodeBudget: 512 },
        ).catch(() => ({
          outcome: "exception" as const,
          claims: [] as const,
          truncated: false as const,
        }))
      : Promise.resolve({
          outcome: "skipped" as const,
          claims: [] as const,
          truncated: false as const,
        }),
  ]);
  const projectedWindow = await curatePromptWindow(
    userId,
    graphMemory,
    voyageSlug,
    undefined,
    sessionId,
  ).catch((error) => {
    console.warn("[Prompts] Failed to curate prompt window:", error);
    return {
      preferences: [],
      operational: [],
      domainHeadlines: [],
      totalTokens: 0,
      evictedCount: 0,
    };
  });

  const standingDeliveryClaims = selectGraphStandingDeliveryClaims(graphMemory);
  const standingCitation = sessionId
    ? await recordKnowledgeUnitCitations({
        personId: userId,
        sessionId,
        channel: "standing",
        knowledgeUnitIds: standingDeliveryClaims.map(
          (claim) => claim.knowledgeUnitId,
        ),
      })
    : { outcome: "failed" as const, inserted: 0 as const };
  const standingCitationFailed = standingCitation.outcome === "failed";
  const withheldEventIds = new Set(
    standingDeliveryClaims.map((claim) => claim.sourceEventId),
  );
  const withheldUnitIds = new Set(
    standingDeliveryClaims.map((claim) => claim.knowledgeUnitId),
  );
  const deliveredProjectedWindow = standingCitationFailed
    ? {
        ...projectedWindow,
        preferences: projectedWindow.preferences.filter(
          (item) => !withheldEventIds.has(item.eventId),
        ),
      }
    : projectedWindow;
  const deliveredGraphMemory: KnowledgeGraphResult = standingCitationFailed
    ? {
        outcome: "success",
        claims: graphMemory.claims.filter(
          (claim) => !withheldUnitIds.has(claim.knowledgeUnitId),
        ),
        truncated: graphMemory.truncated,
      }
    : graphMemory;

  return {
    voyageContext,
    graphMemory,
    curatedWindow: mergeGraphStandingPreferences(
      deliveredProjectedWindow,
      deliveredGraphMemory,
    ),
    standingDeliveryClaims,
    standingCitationFailed,
  };
};

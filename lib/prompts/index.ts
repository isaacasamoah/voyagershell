// Modular prompt composition service
// Layered system: Core → Voyage → User → Tools → Context
// DSPy-compatible: pure functions, structured data

import type { RetrievalResult } from "@/lib/retrieval";
import { curatePromptWindow } from "@/lib/knowledge";
import {
  loadVoyageContext,
  formatVoyageContextSection,
} from "@/lib/voyage/context";
import type { VoyagerIdentity } from "@/lib/messaging/address";
import { formatCuratedWindow } from "./format/user";
import { retrieveKnowledgeGraphClaims } from "@/lib/knowledge/kernel/boundary";
import type { KnowledgeGraphResult } from "@/lib/knowledge/kernel/boundary";
import { recordKnowledgeUnitCitations } from "@/lib/knowledge/lifecycle/citations";
import { upsertPersonSessionIndex } from "@/lib/knowledge/lifecycle/session-index";
import {
  graphMemoryReachWarning,
  mergeGraphStandingPreferences,
  selectGraphStandingDeliveryClaims,
} from "./graph-standing";

export * from "./types";
export { CORE_PROMPT, CORE_PROMPT_TOKENS } from "./core";
export {
  DEFAULT_VOYAGE_CONFIG,
  DEFAULT_USER_PROFILE,
  DEFAULT_COMPOSER_OPTIONS,
  VOYAGE_PRESET_ENGINEERING,
  VOYAGE_PRESET_CREATIVE,
  VOYAGE_PRESET_ENTERPRISE,
  mergeVoyageConfig,
  mergeUserProfile,
} from "./defaults";
export * from "./format";
export { mergeGraphStandingPreferences } from "./graph-standing";
export { composePrompt, type ComposeInput } from "./compose";

// Imports for main prompt composition
import { composePrompt } from "./compose";
import { CORE_PROMPT } from "./core";
import { mergeUserProfile } from "./defaults";

// ============================================================================
// PROMPT COMPOSITION — Main entry point for chat routes
// ============================================================================

// Chat route user profile — simplified shape from auth context.
// Mapped to the canonical UserProfile from ./types in composeSystemPrompt().
export interface ChatUserProfile {
  id: string;
  displayName?: string;
  personalization?: {
    tone?: "concise" | "detailed" | "casual";
    density?: "minimal" | "balanced" | "comprehensive";
  };
}

export type AuthState =
  | "unauthenticated"
  | "authenticated"
  | "just-authenticated";

interface ComposeOptions {
  profile?: ChatUserProfile;
  voyageSlug?: string;
  sessionId?: string; // Current session ID for operational tier recency filtering
  continuityContext?: string | null; // Retrieved context from conversation history
  authState?: AuthState;
  voyagerIdentity?: VoyagerIdentity; // Canonical current name + address; omitted when unnamed
  ownerName?: string; // The human owner's display name, for the identity line
}

/**
 * Compose a full system prompt with preferences and pinned knowledge.
 * Primary entry point used by chat routes.
 *
 * Returns staticPrompt (cacheable: identity + preferences + pinned),
 * dynamicPrompt (per-turn: auth state, continuity context).
 * The chat route places these in separate system messages for prompt caching.
 */
export const composeSystemPrompt = async (
  userId: string,
  options?: ComposeOptions,
): Promise<{
  staticPrompt: string;
  dynamicPrompt: string;
  retrieval: RetrievalResult;
  workingMemoryUnitIds: string[];
}> => {
  const {
    profile,
    voyageSlug,
    sessionId,
    continuityContext,
    authState,
    voyagerIdentity,
    ownerName,
  } = options ?? {};
  const startTime = Date.now();

  // A graph claim cannot enter working memory without a durable per-person
  // session identity. The event count is incremented later by Cartographer.
  const sessionIndexed = sessionId
    ? await upsertPersonSessionIndex(userId, sessionId, 0)
    : false;

  // Load curated knowledge window + voyage context in parallel. Message
  // awareness is no longer woven into the prompt (v2) — messages are
  // delivered on the wire and retrieved on demand, not re-narrated here.
  const [voyageContext, graphMemory] = await Promise.all([
    voyageSlug
      ? loadVoyageContext(voyageSlug, userId).catch((error) => {
          console.warn("[Prompts] Failed to load voyage context:", error);
          return null;
        })
      : Promise.resolve(null),
    sessionIndexed
      ? retrieveKnowledgeGraphClaims({ kind: "person", authorityId: userId }).catch(
          () => ({
            outcome: "exception" as const,
            claims: [] as const,
            truncated: false as const,
          }),
        )
      : Promise.resolve({
          outcome: "exception" as const,
          claims: [] as const,
          truncated: false as const,
        }),
  ]);
  const projectedWindow = await curatePromptWindow(
    userId, voyageSlug, undefined, sessionId, graphMemory,
  ).catch((error) => {
    console.warn("[Prompts] Failed to curate prompt window:", error);
    return { preferences: [], operational: [], domainHeadlines: [], totalTokens: 0, evictedCount: 0 };
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
  const curatedWindow = mergeGraphStandingPreferences(
    deliveredProjectedWindow,
    deliveredGraphMemory,
  );

  // Preferences render exactly once, via formatCuratedWindow below ("What I
  // Know About You"). composePrompt no longer re-renders them (the old shim
  // narrated the same preferences 2-3x per system prompt). `pinned` is kept
  // only for the return metadata / logging.
  const pinned = curatedWindow.preferences;

  // Build user profile in new format
  const userProfile = profile
    ? mergeUserProfile(profile.id, {
        displayName: profile.displayName,
        communication: {
          verbosity:
            profile.personalization?.tone === "concise"
              ? "terse"
              : profile.personalization?.tone === "detailed"
                ? "detailed"
                : "balanced",
          directness: "balanced",
          technicalLevel: "intermediate",
        },
        interaction: {
          confirmActions: true,
          proactiveHelp: true,
          showReasoning: false,
        },
        context: {},
      })
    : undefined;

  // Compose using new modular system
  const composed = composePrompt({
    userId,
    userProfile,
    pinnedKnowledge: [],
    retrievedContext: { items: [] },
    voyagerIdentity,
    ownerName,
  });

  // Build curated knowledge section (stable across turns — cacheable)
  // Three tiers: "What I Know About You", "What's Happening Now", "Domain Context"
  const knowledgeSection = formatCuratedWindow(curatedWindow);
  const knowledgeSuffix = knowledgeSection
    ? `\n\n---\n\n${knowledgeSection}`
    : "";

  // Static prompt: identity + curated knowledge (cacheable)
  const staticPrompt = composed.systemPrompt + knowledgeSuffix;

  // Dynamic prompt: per-turn data that changes every request (not cached)
  const dynamicParts: string[] = [];
  const graphWarning = graphMemoryReachWarning(graphMemory);
  if (graphWarning) dynamicParts.push(graphWarning);
  if (standingCitationFailed && standingDeliveryClaims.length > 0) {
    dynamicParts.push(
      "# Memory delivery\nSome standing graph memory was withheld because its delivery could not be recorded. Do not infer that no additional memory exists.",
    );
  }

  // Auth state flag — identity handles the behavior (see First Contact in core.ts)
  if (authState === "unauthenticated") {
    dynamicParts.push(
      "# Auth: Not signed in — sign-in UI is rendered by the client. Do not offer sign-in or mention email.",
    );
  } else if (authState === "just-authenticated") {
    dynamicParts.push("# Auth: Just signed in");
  }

  // First-turn display name capture — only when user has no display name
  if (profile && !profile.displayName) {
    dynamicParts.push(
      '# Display Name\nThis user has no display name yet. On your first response, naturally ask what you should call them. When they tell you, use the set_display_name tool. Keep it conversational — "What should I call you?" not a form.',
    );
  }

  // Voyage context (membership, roles, activity pulse)
  if (voyageContext) {
    dynamicParts.push(formatVoyageContextSection(voyageContext));
  }

  // Continuity context (changes per turn based on reference signals)
  if (continuityContext) {
    dynamicParts.push(
      `# Conversation Context (from earlier)\n${continuityContext}`,
    );
  }

  const dynamicPrompt =
    dynamicParts.length > 0 ? dynamicParts.join("\n\n---\n\n") : "";

  const latencyMs = Date.now() - startTime;

  // Return metadata for logging (derived from pinned + preferences only)
  const retrieval: RetrievalResult = {
    knowledge: pinned,
    context: "",
    tokenEstimate: 0,
    metadata: {
      threshold: 0,
      pinnedCount: pinned.length,
      searchCount: 0,
      latencyMs,
    },
  };

  return {
    staticPrompt,
    dynamicPrompt,
    retrieval,
    workingMemoryUnitIds: standingCitationFailed
      ? []
      : standingDeliveryClaims.map((claim) => claim.knowledgeUnitId),
  };
};

/**
 * Returns the core identity prompt (no context/preferences).
 * Used as fallback when full composition fails.
 */
export const getBasePrompt = (): string => {
  return CORE_PROMPT;
};

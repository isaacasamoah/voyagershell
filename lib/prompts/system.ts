import type { VoyagerIdentity } from "@/lib/messaging/address";
import type { RetrievalResult } from "@/lib/retrieval";
import { formatVoyageContextSection } from "@/lib/voyage/context";
import { composePrompt } from "./compose";
import { CORE_PROMPT } from "./core";
import { mergeUserProfile } from "./defaults";
import { formatCuratedWindow } from "./format/user";
import { graphMemoryReachWarning } from "./graph-standing";
import { loadSystemPromptMemory } from "./system-memory";

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
  sessionId?: string;
  continuityContext?: string | null;
  authState?: AuthState;
  voyagerIdentity?: VoyagerIdentity;
  ownerName?: string;
}

/**
 * Compose a full system prompt with preferences and pinned knowledge.
 * Returns a cacheable static prompt and per-turn dynamic prompt.
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
  const {
    voyageContext,
    graphMemory,
    curatedWindow,
    standingDeliveryClaims,
    standingCitationFailed,
  } = await loadSystemPromptMemory(userId, voyageSlug, sessionId);

  // Preferences render exactly once below. composePrompt no longer re-renders
  // them; pinned is retained only for return metadata and logging.
  const pinned = curatedWindow.preferences;
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
  const composed = composePrompt({
    userId,
    userProfile,
    pinnedKnowledge: [],
    retrievedContext: { items: [] },
    voyagerIdentity,
    ownerName,
  });
  const knowledgeSection = formatCuratedWindow(curatedWindow);
  const staticPrompt =
    composed.systemPrompt +
    (knowledgeSection ? `\n\n---\n\n${knowledgeSection}` : "");

  const dynamicParts: string[] = [];
  const graphWarning = graphMemoryReachWarning(graphMemory);
  if (graphWarning) dynamicParts.push(graphWarning);
  if (standingCitationFailed && standingDeliveryClaims.length > 0) {
    dynamicParts.push(
      "# Memory delivery\nSome standing graph memory was withheld because its delivery could not be recorded. Do not infer that no additional memory exists.",
    );
  }
  if (authState === "unauthenticated") {
    dynamicParts.push(
      "# Auth: Not signed in — sign-in UI is rendered by the client. Do not offer sign-in or mention email.",
    );
  } else if (authState === "just-authenticated") {
    dynamicParts.push("# Auth: Just signed in");
  }
  if (profile && !profile.displayName) {
    dynamicParts.push(
      '# Display Name\nThis user has no display name yet. On your first response, naturally ask what you should call them. When they tell you, use the set_display_name tool. Keep it conversational — "What should I call you?" not a form.',
    );
  }
  if (voyageContext) {
    dynamicParts.push(formatVoyageContextSection(voyageContext));
  }
  if (continuityContext) {
    dynamicParts.push(
      `# Conversation Context (from earlier)\n${continuityContext}`,
    );
  }

  return {
    staticPrompt,
    dynamicPrompt: dynamicParts.join("\n\n---\n\n"),
    retrieval: {
      knowledge: pinned,
      context: "",
      tokenEstimate: 0,
      metadata: {
        threshold: 0,
        pinnedCount: pinned.length,
        searchCount: 0,
        latencyMs: Date.now() - startTime,
      },
    },
    workingMemoryUnitIds: standingCitationFailed
      ? []
      : standingDeliveryClaims.map((claim) => claim.knowledgeUnitId),
  };
};

/** Returns the core identity prompt without context or preferences. */
export const getBasePrompt = (): string => CORE_PROMPT;

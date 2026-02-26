// Modular prompt composition service
// Layered system: Core → Voyage → User → Tools → Context
// DSPy-compatible: pure functions, structured data

import type { RetrievalResult } from '@/lib/retrieval';
import { getPinnedKnowledge, loadPreferences, loadAwareness, type KnowledgeNode, type AwarenessItem } from '@/lib/knowledge';

// Re-export types
export * from './types';

// Re-export core prompt
export { CORE_PROMPT, CORE_PROMPT_TOKENS } from './core';

// Re-export defaults
export {
  DEFAULT_VOYAGE_CONFIG,
  DEFAULT_USER_PROFILE,
  DEFAULT_COMPOSER_OPTIONS,
  VOYAGE_PRESET_ENGINEERING,
  VOYAGE_PRESET_CREATIVE,
  VOYAGE_PRESET_ENTERPRISE,
  mergeVoyageConfig,
  mergeUserProfile,
} from './defaults';

// Re-export formatters
export * from './format';

// Re-export composer
export {
  composePrompt,
  composeMinimalPrompt,
  composeFromDb,
  debugPrompt,
  type ComposeInput,
  type ComposeFromDbInput,
} from './compose';

// Imports for main prompt composition
import { composePrompt } from './compose';
import { CORE_PROMPT } from './core';
import { mergeUserProfile } from './defaults';
import type { KnowledgeItem, RetrievedContext } from './types';

// ============================================================================
// PROMPT COMPOSITION — Main entry point for chat routes
// ============================================================================

// Chat route user profile — simplified shape from auth context.
// Mapped to the canonical UserProfile from ./types in composeSystemPrompt().
export interface ChatUserProfile {
  id: string;
  displayName?: string;
  personalization?: {
    tone?: 'concise' | 'detailed' | 'casual';
    density?: 'minimal' | 'balanced' | 'comprehensive';
  };
}

export type AuthState = 'unauthenticated' | 'authenticated' | 'just-authenticated';

interface ComposeOptions {
  profile?: ChatUserProfile;
  voyageSlug?: string;
  continuityContext?: string | null;  // Retrieved context from conversation history
  authState?: AuthState;
}


/**
 * Compose a full system prompt with preferences and pinned knowledge.
 * Primary entry point used by chat routes.
 *
 * Returns staticPrompt (cacheable: identity + preferences + pinned),
 * dynamicPrompt (per-turn: auth state, continuity context, awareness),
 * and awarenessItems (for delivery marking in onFinish).
 * The chat route places these in separate system messages for prompt caching.
 */
export const composeSystemPrompt = async (
  userId: string,
  options?: ComposeOptions
): Promise<{ staticPrompt: string; dynamicPrompt: string; retrieval: RetrievalResult; awarenessItems: AwarenessItem[] }> => {
  const { profile, voyageSlug, continuityContext, authState } = options ?? {};
  const startTime = Date.now();

  // Load preferences, pinned knowledge, and awareness items in parallel
  const [preferences, pinned, awarenessItems] = await Promise.all([
    loadPreferences(userId, voyageSlug).catch((error) => {
      console.warn('[Prompts] Failed to load preferences:', error);
      return [] as KnowledgeNode[];
    }),
    getPinnedKnowledge(userId, voyageSlug).catch((error) => {
      console.warn('[Prompts] Failed to get pinned knowledge:', error);
      return [] as KnowledgeNode[];
    }),
    loadAwareness(userId, voyageSlug).catch((error) => {
      console.warn('[Prompts] Failed to load awareness:', error);
      return [] as AwarenessItem[];
    }),
  ]);

  const pinnedKnowledge: KnowledgeItem[] = pinned.map((k: KnowledgeNode) => ({
    id: k.eventId,
    content: k.content,
    source: 'pinned' as const,
    relevance: 1.0,
  }));

  // Build context items from pinned knowledge only (no pre-retrieval)
  const contextItems: KnowledgeItem[] = [...pinnedKnowledge];

  const retrievedContext: RetrievedContext = {
    items: contextItems,
  };

  // Build user profile in new format
  const userProfile = profile
    ? mergeUserProfile(profile.id, {
        displayName: profile.displayName,
        communication: {
          verbosity: profile.personalization?.tone === 'concise'
            ? 'terse'
            : profile.personalization?.tone === 'detailed'
              ? 'detailed'
              : 'balanced',
          directness: 'balanced',
          technicalLevel: 'intermediate',
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
    pinnedKnowledge,
    retrievedContext,
  });

  // Build preference section (stable across turns — cacheable)
  let preferencesSection = '';
  if (preferences.length > 0) {
    const prefLines = preferences.map((p) => `- ${p.content}`).join('\n');
    preferencesSection = `\n\n---\n\n# Who You Are To Me (Preferences)\n${prefLines}`;
  }

  // Static prompt: identity + preferences + pinned knowledge (cacheable)
  const staticPrompt = composed.systemPrompt + preferencesSection;

  // Dynamic prompt: per-turn data that changes every request (not cached)
  const dynamicParts: string[] = [];

  // Auth state flag — identity handles the behavior (see First Contact in core.ts)
  if (authState === 'unauthenticated') {
    dynamicParts.push('# Auth: Not signed in — sign-in UI is rendered by the client. Do not offer sign-in or mention email.');
  } else if (authState === 'just-authenticated') {
    dynamicParts.push('# Auth: Just signed in');
  }

  // Continuity context (changes per turn based on reference signals)
  if (continuityContext) {
    dynamicParts.push(`# Conversation Context (from earlier)\n${continuityContext}`);
  }

  // Awareness items (Sentinel-classified messages, delivery_status = 'pending')
  if (awarenessItems.length > 0) {
    const lines = awarenessItems.map(item => {
      const prefix = item.tier === 'interrupt' ? 'URGENT:' : 'Also:'
      return `${prefix} ${item.senderName} (${item.timeAgo}): ${item.content}`
    })
    dynamicParts.push('# Awareness\n' + lines.join('\n'))
  }

  const dynamicPrompt = dynamicParts.length > 0
    ? dynamicParts.join('\n\n---\n\n')
    : '';

  const latencyMs = Date.now() - startTime;

  // Return metadata for logging (derived from pinned + preferences only)
  const retrieval: RetrievalResult = {
    knowledge: pinned,
    context: '',
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
    awarenessItems,
  };
};

/**
 * Returns the core identity prompt (no context/preferences).
 * Used as fallback when full composition fails.
 */
export const getBasePrompt = (): string => {
  return CORE_PROMPT;
};

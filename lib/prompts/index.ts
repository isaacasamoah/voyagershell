// Modular prompt composition service
// Layered system: Core → Voyage → User → Tools → Context
// DSPy-compatible: pure functions, structured data

import { retrieveContext, type RetrievalResult } from '@/lib/retrieval';
import { getPinnedKnowledge, loadPreferences, type KnowledgeNode } from '@/lib/knowledge';

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

export interface UserProfile {
  id: string;
  displayName?: string;
  personalization?: {
    tone?: 'concise' | 'detailed' | 'casual';
    density?: 'minimal' | 'balanced' | 'comprehensive';
  };
}

export type AuthState = 'unauthenticated' | 'authenticated' | 'just-authenticated';

interface ComposeOptions {
  profile?: UserProfile;
  voyageSlug?: string;
  continuityContext?: string | null;  // Retrieved context from conversation history
  authState?: AuthState;
}

/**
 * Compose a full system prompt with context retrieval, preferences, and pinned knowledge.
 * Primary entry point used by chat routes.
 */
export const composeSystemPrompt = async (
  userId: string,
  query: string,
  options?: ComposeOptions
): Promise<{ systemPrompt: string; retrieval: RetrievalResult }> => {
  const { profile, voyageSlug, continuityContext, authState } = options ?? {};

  // Load preferences and retrieval in parallel
  const [preferences, retrieval] = await Promise.all([
    loadPreferences(userId, voyageSlug).catch((error) => {
      console.warn('[Prompts] Failed to load preferences:', error);
      return [] as KnowledgeNode[];
    }),
    retrieveContext(userId, query, { voyageSlug }),
  ]);

  // Get pinned knowledge
  let pinnedKnowledge: KnowledgeItem[] = [];
  try {
    const pinned = await getPinnedKnowledge(userId, voyageSlug);
    pinnedKnowledge = pinned.map((k: KnowledgeNode) => ({
      id: k.eventId,
      content: k.content,
      source: 'pinned' as const,
      relevance: 1.0,
    }));
  } catch (error) {
    console.warn('[Prompts] Failed to get pinned knowledge:', error);
  }

  // Convert retrieval to new format
  const contextItems: KnowledgeItem[] = retrieval.knowledge.map((k) => ({
    id: k.eventId,
    content: k.content,
    source: 'personal' as const,
    relevance: k.attentionScore ?? 0.5,
  }));

  // Add continuity context as high-priority item if present
  // This is context retrieved from earlier in the conversation (beyond the window)
  if (continuityContext) {
    contextItems.unshift({
      id: 'continuity-context',
      content: continuityContext,
      source: 'personal' as const, // Treat as personal context
      relevance: 1.0, // High priority - user explicitly referenced this
    });
  }

  const retrievedContext: RetrievedContext = {
    items: contextItems,
    query,
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

  // Build preference section (injected BEFORE retrieved knowledge)
  let preferencesSection = '';
  if (preferences.length > 0) {
    const prefLines = preferences.map((p) => `- ${p.content}`).join('\n');
    preferencesSection = `\n\n---\n\n# Who You Are To Me (Preferences)\n${prefLines}`;
  }

  // Build auth state directive
  let authSection = '';
  if (authState === 'unauthenticated') {
    authSection = `\n\n---\n\n# Auth State: Unauthenticated\nThe user is not authenticated. Your first message should welcome them warmly and use the ask_captain tool to render an email_input component so they can sign in. Keep it short and natural — one or two sentences, then the tool call.`;
  } else if (authState === 'just-authenticated') {
    authSection = `\n\n---\n\n# Auth State: Just Authenticated\nThe user just authenticated successfully. Welcome them briefly — they're ready to go. One sentence is enough.`;
  }

  // Inject preferences and auth state into the system prompt
  const systemPrompt = composed.systemPrompt + preferencesSection + authSection;

  return {
    systemPrompt,
    retrieval,
  };
};

/**
 * Returns the core identity prompt (no context/preferences).
 * Used as fallback when full composition fails.
 */
export const getBasePrompt = (): string => {
  return CORE_PROMPT;
};

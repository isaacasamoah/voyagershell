// Prompt composer
// Brings all layers together into a composed system prompt
// Handles token budgets and layer ordering

import type {
  VoyageConfig,
  UserProfile,
  ToolDefinition,
  RetrievedContext,
  KnowledgeItem,
  ComposedPrompt,
  PromptLayer,
  ComposerOptions,
} from './types';

import { CORE_PROMPT, CORE_PROMPT_TOKENS } from './core';
import { DEFAULT_COMPOSER_OPTIONS } from './defaults';
import { formatVoyage, estimateVoyageTokens } from './format/voyage';
import { formatUser, estimateUserTokens } from './format/user';
import { formatContext, estimateContextTokens } from './format/context';
import { formatTools, formatToolsSummary, estimateToolsTokens } from './format/tools';
import type { VoyagerIdentity } from '@/lib/messaging/address';

// ============================================================================
// MAIN COMPOSER
// ============================================================================

export interface ComposeInput {
  userId: string;
  voyageName?: string;
  voyageConfig?: VoyageConfig;
  userProfile?: UserProfile;
  pinnedKnowledge?: KnowledgeItem[];
  retrievedContext?: RetrievedContext;
  tools?: ToolDefinition[];
  options?: ComposerOptions;
  /** Canonical current Voyager identity — omitted when unnamed. */
  voyagerIdentity?: VoyagerIdentity;
  /** The human owner's display name, for the identity line. */
  ownerName?: string;
}

// The identity line — the Voyager knows its own name + owner. Lives in the
// cacheable static prefix (right after core, stable across a user's turns) so
// the model consumes it but never has to decide it. Only rendered when named.
const formatIdentity = (identity: VoyagerIdentity, ownerName?: string): string => {
  const display = identity.displayName ?? 'Voyager';
  const owner = ownerName?.trim() || 'your';
  const owned = ownerName?.trim() ? `${owner}'s` : 'your own';
  return `## Your Name\n\nYou are ${display}, ${owned} Voyager. When ${owner} writes "@${identity.handle} …", only you and ${owner} can see the exchange. Your name is identity, not permission for anyone else to invoke you.`;
};

/**
 * Composes a complete system prompt from all layers.
 *
 * Layer order (top to bottom):
 * 1. Core (invariant identity, capabilities, principles)
 * 2. Voyage (community character, norms, knowledge framing)
 * 3. User (personal preferences, pinned knowledge)
 * 4. Tools (available tool descriptions)
 * 5. Context (retrieved knowledge for this turn)
 *
 * Each layer adds to the prompt. Later layers can refine but not contradict
 * earlier layers. Token budget is respected, truncating context if needed.
 */
export const composePrompt = (input: ComposeInput): ComposedPrompt => {
  const options = { ...DEFAULT_COMPOSER_OPTIONS, ...input.options };
  const layers: PromptLayer[] = [];
  let runningTokens = 0;

  // Layer 1: Core (always included)
  layers.push({
    name: 'core',
    content: CORE_PROMPT,
    tokenEstimate: CORE_PROMPT_TOKENS,
  });
  runningTokens += CORE_PROMPT_TOKENS;

  // Layer 1b: Identity (if the Voyager is named) — cacheable, stable per user.
  if (input.voyagerIdentity?.displayName) {
    const identityContent = formatIdentity(input.voyagerIdentity, input.ownerName);
    const identityTokens = Math.ceil(identityContent.split(/\s+/).length * 0.75);
    layers.push({
      name: 'identity',
      content: identityContent,
      tokenEstimate: identityTokens,
    });
    runningTokens += identityTokens;
  }

  // Layer 2: Voyage (if provided)
  if (input.voyageConfig && input.voyageName) {
    const voyageContent = formatVoyage(input.voyageConfig, input.voyageName);
    const voyageTokens = estimateVoyageTokens(input.voyageConfig, input.voyageName);
    layers.push({
      name: 'voyage',
      content: voyageContent,
      tokenEstimate: voyageTokens,
    });
    runningTokens += voyageTokens;
  }

  // Layer 3: User (if provided)
  if (input.userProfile) {
    const userContent = formatUser(input.userProfile, input.pinnedKnowledge);
    const userTokens = estimateUserTokens(input.userProfile, input.pinnedKnowledge);
    layers.push({
      name: 'user',
      content: userContent,
      tokenEstimate: userTokens,
    });
    runningTokens += userTokens;
  }

  // Layer 4: Tools (if provided and enabled)
  if (options.includeTools && input.tools?.length) {
    const toolsTokens = estimateToolsTokens(input.tools);

    // Use summary format if tools would exceed budget
    const remainingBudget = options.maxTotalTokens - runningTokens - options.maxContextTokens;
    const toolsContent = toolsTokens > remainingBudget
      ? formatToolsSummary(input.tools)
      : formatTools(input.tools);

    const actualTokens = toolsTokens > remainingBudget
      ? Math.ceil(formatToolsSummary(input.tools).split(/\s+/).length * 0.75)
      : toolsTokens;

    layers.push({
      name: 'tools',
      content: toolsContent,
      tokenEstimate: actualTokens,
    });
    runningTokens += actualTokens;
  }

  // Layer 5: Context (if provided, respects max context tokens)
  if (input.retrievedContext?.items.length) {
    const availableContextTokens = Math.min(
      options.maxContextTokens,
      options.maxTotalTokens - runningTokens
    );

    const contextContent = formatContext(input.retrievedContext, availableContextTokens);
    const contextTokens = Math.min(
      estimateContextTokens(input.retrievedContext),
      availableContextTokens
    );

    layers.push({
      name: 'context',
      content: contextContent,
      tokenEstimate: contextTokens,
    });
    runningTokens += contextTokens;
  }

  // Compose final prompt
  const systemPrompt = layers.map((l) => l.content).join('\n\n---\n\n');

  return {
    layers,
    systemPrompt,
    totalTokens: runningTokens,
    metadata: {
      voyageSlug: input.voyageName,
      userId: input.userId,
      timestamp: new Date().toISOString(),
    },
  };
};

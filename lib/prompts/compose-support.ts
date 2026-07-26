import type {
  ComposedPrompt,
  ComposerOptions,
  KnowledgeItem,
  RetrievedContext,
  ToolDefinition,
  UserProfile,
  VoyageConfig,
} from './types'
import { mergeUserProfile, mergeVoyageConfig } from './defaults'
import { composePrompt } from './compose'

export const composeMinimalPrompt = (
  userId: string,
  context?: RetrievedContext,
): ComposedPrompt => (
  composePrompt({
    userId,
    retrievedContext: context,
    options: { includeTools: false },
  })
)

export interface ComposeFromDbInput {
  userId: string
  voyageSlug?: string
  voyageSettings?: Record<string, unknown>
  userSettings?: Record<string, unknown>
  pinnedKnowledge?: KnowledgeItem[]
  retrievedContext?: RetrievedContext
  tools?: ToolDefinition[]
  options?: ComposerOptions
}

const parseVoyageConfig = (settings: Record<string, unknown>): VoyageConfig => (
  mergeVoyageConfig(settings as Partial<VoyageConfig>)
)

const parseUserProfile = (
  userId: string,
  settings: Record<string, unknown>,
): UserProfile => {
  const displayName = typeof settings.displayName === 'string'
    ? settings.displayName
    : undefined
  return mergeUserProfile(userId, {
    displayName,
    ...(settings as Partial<Omit<UserProfile, 'id'>>),
  })
}

export const composeFromDb = (input: ComposeFromDbInput): ComposedPrompt => (
  composePrompt({
    userId: input.userId,
    voyageName: input.voyageSlug,
    voyageConfig: input.voyageSettings
      ? parseVoyageConfig(input.voyageSettings)
      : undefined,
    userProfile: input.userSettings
      ? parseUserProfile(input.userId, input.userSettings)
      : undefined,
    pinnedKnowledge: input.pinnedKnowledge,
    retrievedContext: input.retrievedContext,
    tools: input.tools,
    options: input.options,
  })
)

export const debugPrompt = (composed: ComposedPrompt): string => {
  const lines = [
    '=== PROMPT DEBUG ===',
    `Total tokens: ${composed.totalTokens}`,
    `Timestamp: ${composed.metadata.timestamp}`,
    '',
    '=== LAYER BREAKDOWN ===',
  ]
  composed.layers.forEach((layer) => {
    lines.push(`${layer.name}: ${layer.tokenEstimate} tokens`)
  })
  lines.push('', '=== FULL PROMPT ===', composed.systemPrompt)
  return lines.join('\n')
}

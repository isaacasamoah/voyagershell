// Model Router
// Abstracts model selection based on task requirements.
//
// Slice 1 change: multi-provider BYO keys.
// - When a `resolvedKey` is supplied, we instantiate the per-provider AI SDK
//   factory with that user's key (and baseUrl for openai / custom).
// - When no resolvedKey is supplied, we fall back to the process-level
//   default `anthropic` / `openai` instances -- this path is used by
//   system-owned callers (sentinel, followup, welcome) that still use
//   env fallback until a future slice BYO-ifies them.
//
// Known type gotcha: @openrouter/ai-sdk-provider and @ai-sdk/google ship
// nested copies of @ai-sdk/provider which produce structural LanguageModelV2
// mismatches against the `ai` package. We cast at the factory call sites
// via `as unknown as LanguageModel`. Do not "fix" this by downgrading the
// AI SDK.

import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { openai, createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import {
  DEFAULT_PROVIDERS,
  type ModelConfig,
  type ModelProvider,
  type ModelProviderId,
} from './providers'
import type { ResolvedApiKey } from '@/lib/keys/types'

export interface ModelRequirements {
  task: 'chat' | 'decision' | 'code' | 'embedding' | 'synthesis' | 'classification'
  maxLatencyMs?: number
  quality?: 'fast' | 'balanced' | 'best'
  maxTokens?: number
  streaming?: boolean
  toolUse?: boolean
  /** BYO resolved key -- when present, the router will only consider models
   * from this provider and instantiate them with the user's key. */
  resolvedKey?: ResolvedApiKey
  /** Optional explicit provider override (used by tests / admin flows).
   * Ignored if `resolvedKey` is set (resolvedKey.provider wins). */
  provider?: ModelProviderId
}

export interface ModelRouter {
  select(requirements: ModelRequirements): LanguageModel
  selectConfig(requirements: ModelRequirements): ModelConfig
  getConfig(modelId: string): ModelConfig | undefined
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): number
}

// -----------------------------------------------------------------------------
// Language model construction
// -----------------------------------------------------------------------------

const createLanguageModel = (
  config: ModelConfig,
  resolvedKey?: ResolvedApiKey
): LanguageModel => {
  // All factory results are cast to LanguageModel via `as unknown` to
  // sidestep the nested @ai-sdk/provider duplication -- see the comment at
  // the top of this file.

  // No resolvedKey = legacy env fallback path (sentinel, followup, welcome).
  // Only anthropic + openai are supported in this path since those are the
  // historical env-backed providers.
  if (!resolvedKey) {
    switch (config.provider) {
      case 'anthropic':
        return anthropic(config.modelId) as unknown as LanguageModel
      case 'openai':
        return openai(config.modelId) as unknown as LanguageModel
      default:
        throw new Error(
          `Provider ${config.provider} requires a resolvedKey (no server env fallback).`
        )
    }
  }

  // BYO path -- instantiate a per-provider factory with the user's key.
  switch (resolvedKey.provider) {
    case 'anthropic': {
      const provider = createAnthropic({ apiKey: resolvedKey.apiKey })
      return provider(config.modelId) as unknown as LanguageModel
    }
    case 'openai': {
      const provider = createOpenAI({
        apiKey: resolvedKey.apiKey,
        ...(resolvedKey.baseUrl ? { baseURL: resolvedKey.baseUrl } : {}),
      })
      return provider(config.modelId) as unknown as LanguageModel
    }
    case 'google': {
      const provider = createGoogleGenerativeAI({ apiKey: resolvedKey.apiKey })
      return provider(config.modelId) as unknown as LanguageModel
    }
    case 'openrouter': {
      const provider = createOpenRouter({ apiKey: resolvedKey.apiKey })
      return provider(config.modelId) as unknown as LanguageModel
    }
    case 'custom': {
      if (!resolvedKey.baseUrl) {
        throw new Error('Custom provider requires baseUrl on the resolved key.')
      }
      // Custom = OpenAI-compatible, use createOpenAI with the user's baseUrl.
      const provider = createOpenAI({
        apiKey: resolvedKey.apiKey,
        baseURL: resolvedKey.baseUrl,
      })
      return provider(config.modelId) as unknown as LanguageModel
    }
    default:
      throw new Error(`Unknown provider on resolvedKey: ${(resolvedKey as ResolvedApiKey).provider}`)
  }
}

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

export const createModelRouter = (options?: {
  providers?: ModelProvider[]
}): ModelRouter => {
  const providers = options?.providers ?? DEFAULT_PROVIDERS
  const allModels = providers.flatMap((p) => p.models)

  const selectModelConfig = (
    req: ModelRequirements,
    fromModels: ModelConfig[]
  ): ModelConfig => {
    // Filter by BYO provider first -- a user with only an OpenAI key must
    // never be handed a Claude config.
    const providerFilter = req.resolvedKey?.provider ?? req.provider
    let scope = fromModels
    if (providerFilter) {
      scope = scope.filter((m) => m.provider === providerFilter)
    }

    let candidates = scope.filter((m) => {
      if (req.toolUse && !m.capabilities.toolUse) return false
      if (req.streaming && !m.capabilities.streaming) return false
      if (req.maxLatencyMs && m.typicalLatencyMs > req.maxLatencyMs) return false
      return true
    })

    if (candidates.length === 0) {
      candidates = scope.length > 0 ? scope : fromModels
    }

    // Sort by quality preference
    if (req.quality === 'fast') {
      candidates.sort((a, b) => a.typicalLatencyMs - b.typicalLatencyMs)
    } else if (req.quality === 'best') {
      candidates.sort((a, b) => b.costPerMillion.output - a.costPerMillion.output)
    } else {
      // balanced -- prefer Sonnet when anthropic is in scope
      const sonnet = candidates.find((m) => m.id === 'claude-sonnet')
      if (sonnet) return sonnet
    }

    return candidates[0]
  }

  return {
    select(requirements: ModelRequirements): LanguageModel {
      const config = selectModelConfig(requirements, allModels)
      return createLanguageModel(config, requirements.resolvedKey)
    },

    selectConfig(requirements: ModelRequirements): ModelConfig {
      return selectModelConfig(requirements, allModels)
    },

    getConfig(modelId: string): ModelConfig | undefined {
      return allModels.find((m) => m.id === modelId || m.modelId === modelId)
    },

    estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
      const config = allModels.find((m) => m.id === modelId || m.modelId === modelId)
      if (!config) return 0
      return (
        (inputTokens / 1_000_000) * config.costPerMillion.input +
        (outputTokens / 1_000_000) * config.costPerMillion.output
      )
    },
  }
}

export const modelRouter = createModelRouter()

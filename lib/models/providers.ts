// Model providers and configurations
// Defines available models, their capabilities, and costs.
//
// Providers supported at launch (Slice 1):
//   anthropic | openai | google | openrouter | custom
//
// `custom` is a single catch-all entry for self-hosted OpenAI-compatible
// endpoints. The runtime `base_url` and concrete `modelId` come from the
// user's stored key -- the `modelId` below is a sensible default.

export type ModelProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'custom'

export interface ModelConfig {
  id: string
  provider: ModelProviderId
  modelId: string
  capabilities: {
    chat: boolean
    toolUse: boolean
    vision: boolean
    streaming: boolean
  }
  costPerMillion: { input: number; output: number }
  typicalLatencyMs: number
  contextWindow: number
}

export interface ModelProvider {
  id: ModelProviderId
  name: string
  models: ModelConfig[]
}

export const DEFAULT_PROVIDERS: ModelProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      {
        id: 'claude-sonnet',
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        capabilities: { chat: true, toolUse: true, vision: true, streaming: true },
        costPerMillion: { input: 3, output: 15 },
        typicalLatencyMs: 800,
        contextWindow: 200000,
      },
      {
        id: 'claude-haiku',
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        capabilities: { chat: true, toolUse: true, vision: false, streaming: true },
        costPerMillion: { input: 0.25, output: 1.25 },
        typicalLatencyMs: 400,
        contextWindow: 200000,
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      {
        id: 'gpt-4o',
        provider: 'openai',
        modelId: 'gpt-4o',
        capabilities: { chat: true, toolUse: true, vision: true, streaming: true },
        costPerMillion: { input: 2.5, output: 10 },
        typicalLatencyMs: 700,
        contextWindow: 128000,
      },
      {
        id: 'gpt-4o-mini',
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        capabilities: { chat: true, toolUse: true, vision: true, streaming: true },
        costPerMillion: { input: 0.15, output: 0.6 },
        typicalLatencyMs: 400,
        contextWindow: 128000,
      },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    models: [
      {
        id: 'gemini-flash',
        provider: 'google',
        modelId: 'gemini-2.5-flash',
        capabilities: { chat: true, toolUse: true, vision: true, streaming: true },
        costPerMillion: { input: 0.075, output: 0.3 },
        typicalLatencyMs: 300,
        contextWindow: 1000000,
      },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    models: [
      {
        id: 'openrouter-claude-sonnet',
        provider: 'openrouter',
        modelId: 'anthropic/claude-sonnet-4',
        capabilities: { chat: true, toolUse: true, vision: true, streaming: true },
        costPerMillion: { input: 3, output: 15 },
        typicalLatencyMs: 900,
        contextWindow: 200000,
      },
      {
        id: 'openrouter-gpt-4o-mini',
        provider: 'openrouter',
        modelId: 'openai/gpt-4o-mini',
        capabilities: { chat: true, toolUse: true, vision: true, streaming: true },
        costPerMillion: { input: 0.15, output: 0.6 },
        typicalLatencyMs: 500,
        contextWindow: 128000,
      },
    ],
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    models: [
      {
        id: 'custom-default',
        provider: 'custom',
        // Overridden at runtime by the user's saved model name (out of scope
        // for Slice 1 -- a sensible default that most OpenAI-compatible
        // servers recognise).
        modelId: 'gpt-4o-mini',
        capabilities: { chat: true, toolUse: true, vision: false, streaming: true },
        costPerMillion: { input: 0, output: 0 },
        typicalLatencyMs: 800,
        contextWindow: 32000,
      },
    ],
  },
]

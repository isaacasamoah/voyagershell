import { generateText, streamText } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import {
  classifyCodexError,
  createResilientCodexModel,
  isCodexAuthError,
  type CodexCredential,
} from '@/lib/models'

const credential = (suffix: string): CodexCredential => ({
  accessToken: `unmistakably-fake-access-${suffix}`,
  accountId: `unmistakably-fake-account-${suffix}`,
})

const result = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  },
  warnings: [],
})

interface FakeModel {
  specificationVersion: 'v3'
  provider: string
  modelId: string
  supportedUrls: Record<string, never>
  doGenerate: ReturnType<typeof vi.fn>
  doStream: ReturnType<typeof vi.fn>
}

const model = (
  invoke: () => Promise<ReturnType<typeof result>>,
): FakeModel => ({
  specificationVersion: 'v3',
  provider: 'fixture',
  modelId: 'fixture-model',
  supportedUrls: {},
  doGenerate: vi.fn(invoke),
  doStream: vi.fn(),
})

const streamModel = (
  invoke: () => Promise<{
    stream: ReadableStream<Record<string, unknown>>
  }>,
): FakeModel => ({
  specificationVersion: 'v3',
  provider: 'fixture',
  modelId: 'fixture-model',
  supportedUrls: {},
  doGenerate: vi.fn(),
  doStream: vi.fn(invoke),
})

const streamed = (text: string) => ({
  stream: new ReadableStream<Record<string, unknown>>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] })
      controller.enqueue({ type: 'text-start', id: 'text-1' })
      controller.enqueue({ type: 'text-delta', id: 'text-1', delta: text })
      controller.enqueue({ type: 'text-end', id: 'text-1' })
      controller.enqueue({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          ...result('').usage,
          totalTokens: { total: 2 },
        },
      })
      controller.close()
    },
  }),
})

describe('Codex connection recovery', () => {
  it('refreshes once, retries once, then falls back and marks attention', async () => {
    const initial = model(vi.fn().mockRejectedValue({ statusCode: 401 }))
    const retry = model(vi.fn().mockRejectedValue({ status: 401 }))
    const fallback = model(vi.fn().mockResolvedValue(result('fallback completed')))
    const refresh = vi.fn().mockResolvedValue(credential('refreshed'))
    const onFailure = vi.fn()

    const createModel = vi.fn()
      .mockReturnValueOnce(initial as never)
      .mockReturnValueOnce(retry as never)

    const resilient = createResilientCodexModel(credential('initial'), {
      refresh,
      fallback: fallback as never,
      onFailure,
      createModel,
    })
    const generated = await generateText({ model: resilient, prompt: 'fixture prompt' })

    expect(generated.text).toBe('fallback completed')
    expect(refresh).toHaveBeenCalledOnce()
    expect(retry.doGenerate).toHaveBeenCalledOnce()
    expect(fallback.doGenerate).toHaveBeenCalledOnce()
    expect(onFailure).toHaveBeenCalledOnce()

    const nextStep = await generateText({ model: resilient, prompt: 'later tool step' })
    expect(nextStep.text).toBe('fallback completed')
    expect(initial.doGenerate).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(retry.doGenerate).toHaveBeenCalledOnce()
    expect(fallback.doGenerate).toHaveBeenCalledTimes(2)
  })

  it('bounds refresh across later operations on the same turn model', async () => {
    const initial = model(vi.fn().mockRejectedValue({ statusCode: 401 }))
    const refreshed = model(vi.fn()
      .mockResolvedValueOnce(result('refresh recovered'))
      .mockRejectedValueOnce({ statusCode: 401 }))
    const fallback = model(vi.fn().mockResolvedValue(result('fallback latched')))
    const refresh = vi.fn().mockResolvedValue(credential('refreshed'))
    const onFailure = vi.fn()
    const createModel = vi.fn()
      .mockReturnValueOnce(initial as never)
      .mockReturnValueOnce(refreshed as never)
    const resilient = createResilientCodexModel(credential('initial'), {
      refresh,
      fallback: fallback as never,
      onFailure,
      createModel,
    })

    expect((await generateText({ model: resilient, prompt: 'first step' })).text)
      .toBe('refresh recovered')
    expect((await generateText({ model: resilient, prompt: 'later tool step' })).text)
      .toBe('fallback latched')
    expect((await generateText({ model: resilient, prompt: 'final tool step' })).text)
      .toBe('fallback latched')
    expect(initial.doGenerate).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(refreshed.doGenerate).toHaveBeenCalledTimes(2)
    expect(fallback.doGenerate).toHaveBeenCalledTimes(2)
    expect(onFailure).toHaveBeenCalledOnce()
  })

  it('applies refresh-retry and fallback to streaming startup failures', async () => {
    const initial = streamModel(vi.fn().mockRejectedValue({ statusCode: 401 }))
    const retry = streamModel(vi.fn().mockRejectedValue({ statusCode: 401 }))
    const fallback = streamModel(vi.fn().mockResolvedValue(streamed('stream fallback')))
    const refresh = vi.fn().mockResolvedValue(credential('refreshed'))
    const onFailure = vi.fn()
    const createModel = vi.fn()
      .mockReturnValueOnce(initial as never)
      .mockReturnValueOnce(retry as never)
    const resilient = createResilientCodexModel(credential('initial'), {
      refresh,
      fallback: fallback as never,
      onFailure,
      createModel,
    })

    const result = streamText({ model: resilient, prompt: 'fixture stream prompt' })
    expect(await result.text).toBe('stream fallback')
    expect(initial.doStream).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(retry.doStream).toHaveBeenCalledOnce()
    expect(fallback.doStream).toHaveBeenCalledOnce()
    expect(onFailure).toHaveBeenCalledOnce()
  })

  it('does not refresh or fall back for a non-authentication failure', async () => {
    const initial = model(vi.fn().mockRejectedValue(new Error('fixture network failure')))
    const refresh = vi.fn()
    const fallback = model(vi.fn().mockResolvedValue(result('should not run')))
    const createModel = vi.fn()
      .mockReturnValueOnce(initial as never)

    const resilient = createResilientCodexModel(credential('initial'), {
      refresh,
      fallback: fallback as never,
      onFailure: vi.fn(),
      createModel,
    })

    await expect(generateText({ model: resilient, prompt: 'fixture prompt' }))
      .rejects.toThrow('fixture network failure')
    expect(refresh).not.toHaveBeenCalled()
    expect(fallback.doGenerate).not.toHaveBeenCalled()
  })

  it('falls back without a duplicate attention write when refresh fails', async () => {
    const initial = model(vi.fn().mockRejectedValue({ statusCode: 401 }))
    const fallback = model(vi.fn().mockResolvedValue(result('fallback completed')))
    const refresh = vi.fn().mockRejectedValue(new Error('refresh already marked attention'))
    const onFailure = vi.fn()

    const resilient = createResilientCodexModel(credential('initial'), {
      refresh,
      fallback: fallback as never,
      onFailure,
      createModel: vi.fn().mockReturnValue(initial as never),
    })
    const generated = await generateText({ model: resilient, prompt: 'fixture prompt' })

    expect(generated.text).toBe('fallback completed')
    expect(refresh).toHaveBeenCalledOnce()
    expect(onFailure).not.toHaveBeenCalled()
    expect(fallback.doGenerate).toHaveBeenCalledOnce()
  })

  it('classifies errors without copying their payload', () => {
    const secretPayload = 'unmistakably-fake-secret-payload'
    const error = { statusCode: 401, message: secretPayload }
    expect(isCodexAuthError(error)).toBe(true)
    expect(classifyCodexError(error)).toBe('authentication_failed')
    expect(classifyCodexError(error)).not.toContain(secretPayload)
  })
})

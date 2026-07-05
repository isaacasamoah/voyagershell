// E2E: prove the REAL app path — @ai-sdk/openai responses provider → codex
// backend — streams text and executes a tool. Mirrors lib/models/codex.ts.
import { readFileSync } from 'node:fs'
import os from 'node:os'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText, tool, stepCountIs, wrapLanguageModel } from 'ai'
import { z } from 'zod'

const auth = JSON.parse(readFileSync(`${os.homedir()}/.codex/auth.json`, 'utf8'))
const access = auth.tokens.access_token
const claims = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString())
const accountId = auth.tokens.account_id || claims['https://api.openai.com/auth']?.chatgpt_account_id

const provider = createOpenAI({
  apiKey: access,
  baseURL: 'https://chatgpt.com/backend-api/codex',
  headers: {
    'chatgpt-account-id': accountId,
    'OpenAI-Beta': 'responses=experimental',
    originator: 'codex_cli_rs',
  },
})

const storeFalseMiddleware = {
  transformParams: async ({ params }) => ({
    ...params,
    providerOptions: { ...params.providerOptions, openai: { ...(params.providerOptions?.openai ?? {}), store: false } },
  }),
}
const model = wrapLanguageModel({ model: provider.responses('gpt-5.5'), middleware: storeFalseMiddleware })

const result = streamText({
  model,
  system: 'You are Voyager. Use tools when they apply.',
  messages: [{ role: 'user', content: "What's the weather in Brisbane? Use your tool, then tell me in one sentence." }],
  tools: {
    get_weather: tool({
      description: 'Get current weather for a city',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => {
        console.log(`  [tool] get_weather(${city})`)
        return { temp_c: 22, condition: 'sunny' }
      },
    }),
  },
  stopWhen: stepCountIs(5),
})

let streamed = ''
for await (const delta of result.textStream) { streamed += delta; process.stdout.write(delta) }
console.log('\n---')
const steps = await result.steps
const toolCalls = steps.flatMap((s) => s.toolCalls ?? [])
const usage = await result.usage
console.log(`steps=${steps.length} toolCalls=${toolCalls.map((t) => t.toolName).join(',') || 'none'}`)
console.log(`usage: in=${usage.inputTokens} out=${usage.outputTokens}`)
if (!toolCalls.length) { console.error('✗ FAIL: no tool call through the AI SDK path'); process.exit(1) }
if (!/22|sunny/i.test(streamed)) { console.error('✗ FAIL: final text did not use tool result'); process.exit(1) }
console.log('✅ AI SDK → codex backend: streaming + tool execution works.')

import { APICallError, createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { requireAuthResponse } from '@/lib/auth'
import { createVercelHost, runTurn, type TurnContext, type TurnResult } from '@/lib/harness'
import type { AuthState } from '@/lib/prompts'
import { resolveSessionVoyage, SessionAccessError } from '@/lib/voyage'
import { log } from '@/lib/debug'

export const maxDuration = 300

type IncomingRole = 'user' | 'assistant' | 'system'

interface IncomingMessage { role: IncomingRole; parts?: Array<{ type: string; text?: string }>; content?: string }

interface ChatBody { messages?: IncomingMessage[]; conversationId?: string; authState?: AuthState; autoSent?: boolean }

const getMessageText = (message: IncomingMessage): string => (
  Array.isArray(message.parts)
    ? message.parts
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('')
    : typeof message.content === 'string' ? message.content : ''
)

const getNewestUserMessage = (items: IncomingMessage[]): string => {
  for (let index = items.length - 1; index >= 0; index--) {
    const message = items[index]
    if (message.role !== 'user') continue
    const text = getMessageText(message)
    if (text.trim() !== '') return text
  }
  return ''
}

const jsonResponse = (status: number, body: Record<string, string>) => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
)

const adaptTurn = (turn: TurnResult): Response => {
  if (turn.kind === 'stream') return turn.result.toUIMessageStreamResponse()
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      if (turn.kind === 'empty') return
      const id = 'room-cmd'
      writer.write({ type: 'text-start', id })
      writer.write({ type: 'text-delta', id, delta: turn.text })
      writer.write({ type: 'text-end', id })
    },
  })
  return createUIMessageStreamResponse({ stream })
}

export const POST = async (req: Request) => {
  log.api('Chat request received')
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonResponse(500, { error: 'Configuration error', message: 'ANTHROPIC_API_KEY is not configured' })
  }

  try {
    const authResult = await requireAuthResponse()
    if (authResult instanceof Response) return authResult
    const userId = authResult
    const { messages, conversationId, authState, autoSent } = await req.json() as ChatBody

    let voyageSlug: string | null
    try {
      voyageSlug = await resolveSessionVoyage(conversationId || undefined, userId)
    } catch (error) {
      if (error instanceof SessionAccessError) {
        return jsonResponse(403, { error: 'session_access_denied' })
      }
      throw error
    }

    if (!Array.isArray(messages)) {
      return jsonResponse(400, { error: 'Invalid request', message: 'messages array is required' })
    }

    const { getAdminClient } = await import('@/lib/supabase/admin')
    const { data: userProfile } = await getAdminClient()
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle()
    const displayName = (userProfile as { display_name: string | null } | null)?.display_name ?? undefined
    const ctx: TurnContext = {
      userId,
      conversationId,
      voyageSlug,
      authState,
      autoSent,
      newMessage: getNewestUserMessage(messages),
      displayName,
      // This endpoint only ever carries a human's typed message — the loop guard
      // asserts it (a turn may begin ONLY on human-authored input).
      originatorActorType: 'user',
    }
    return adaptTurn(await runTurn(ctx, createVercelHost()))
  } catch (error) {
    if (error instanceof APICallError) {
      const status = error.statusCode ?? 500
      if (status === 429) {
        return jsonResponse(429, { error: 'Rate limited', message: 'Too many requests. Please try again in a moment.' })
      }
      if (status === 401) {
        return jsonResponse(401, { error: 'Authentication error', message: 'Invalid API key' })
      }
      return jsonResponse(status, { error: 'API error', message: error.message })
    }
    if (error instanceof SyntaxError) {
      return jsonResponse(400, { error: 'Invalid request', message: 'Invalid JSON in request body' })
    }
    log.api('Chat API error', { error: String(error) }, 'error')
    return jsonResponse(500, { error: 'Internal error', message: 'An unexpected error occurred' })
  }
}

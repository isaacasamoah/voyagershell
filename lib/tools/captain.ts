// ask_captain — Presentation tool for interactive UI
// Voyager calls this to render inline components in the chat stream.
// The user's selection feeds back as the next user message.
//
// Pattern: LLM decides WHEN to show UI → tool fetches data server-side →
// returns result with data → client renders component → user interacts →
// result becomes next message
//
// Server-side fetch: voyage_picker calls getUserVoyages() in execute (D1).
// LLM supplies type only — data comes from the server, not the LLM (D3).

import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from '@/lib/retrieval/tools'
import { getUserVoyages } from '@/lib/voyage'

// =============================================================================
// Schemas — Discriminated union on `type`
// =============================================================================

// Flat object schema — Anthropic API requires root `type: "object"` in input_schema.
// z.discriminatedUnion produces `{ oneOf: [...] }` without a root type, which fails validation.
// Flat schema with enum discriminator achieves the same LLM behavior.
const askCaptainSchema = z.object({
  type: z.enum(['email_input', 'conversation_picker', 'voyage_picker', 'confirmation'])
    .describe('Which UI component to render'),
  message: z.string().optional()
    .describe('Message to show (used by email_input and confirmation)'),
  confirmLabel: z.string().optional()
    .describe('Label for confirm button (confirmation only, default: Yes)'),
  cancelLabel: z.string().optional()
    .describe('Label for cancel button (confirmation only, default: No)'),
  conversations: z.array(z.object({
    id: z.string(),
    title: z.string(),
    preview: z.string().optional(),
    messageCount: z.number().optional(),
    lastMessageAt: z.string().optional(),
  })).optional().describe('Conversations to show (conversation_picker only)'),
})

export type AskCaptainInput = z.infer<typeof askCaptainSchema>

// =============================================================================
// Tool Definition
// =============================================================================

export const createCaptainTools = (ctx: ToolContext) => ({
  ask_captain: tool({
    description: `Render an interactive UI component inline in the chat for the user (the "captain") to interact with.
Use this when you need the user to make a selection or provide input that requires a structured UI element.

Types:
- email_input: Show an email field for authentication. Use when user needs to sign in or sign up.
- conversation_picker: Show a list of conversations to select from. Use when user wants to resume a conversation and there are multiple options.
- voyage_picker: Show voyages to switch between. Just call with type "voyage_picker" — voyages are fetched automatically. No need to supply voyage data.
- confirmation: Ask the user to confirm an action before proceeding.

The component renders inline in the chat. The user's response comes back as their next message. Do NOT ask the user to type their selection — the UI handles it.

Exception: email_input fires the magic link immediately on the client (no LLM round trip needed for sending).`,
    inputSchema: askCaptainSchema,
    execute: async (input) => {
      switch (input.type) {
        case 'email_input':
          return 'Email input component rendered. Awaiting captain\'s email. The magic link will be sent automatically when they submit.'
        case 'conversation_picker':
          return `Conversation picker rendered with ${input.conversations?.length ?? 0} option${input.conversations?.length === 1 ? '' : 's'}. Awaiting captain's selection.`
        case 'voyage_picker': {
          // Server-side fetch — LLM doesn't supply voyages (D1, D3)
          const memberships = await getUserVoyages(ctx.userId)

          if (memberships.length === 0) {
            return "You're not part of any voyages yet. Want to create one?"
          }

          return JSON.stringify({
            rendered: true,
            voyages: memberships.map(m => ({ slug: m.slug, name: m.name, role: m.role })),
            currentSlug: ctx.voyageSlug ?? null,
          })
        }
        case 'confirmation':
          return `Confirmation dialog rendered: "${input.message}". Awaiting captain's response.`
      }
    },
  }),
})

export type CaptainTools = ReturnType<typeof createCaptainTools>

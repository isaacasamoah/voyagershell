// ask_captain — Presentation tool for interactive UI
// Voyager calls this to render inline components in the chat stream.
// The user's selection feeds back as the next user message.
//
// Pattern: LLM decides WHEN to show UI → tool returns acknowledgment →
// client renders component → user interacts → result becomes next message

import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from '@/lib/retrieval/tools'

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
  voyages: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    role: z.string().optional(),
    memberCount: z.number().optional(),
  })).optional().describe('Voyages to show (voyage_picker only)'),
})

export type AskCaptainInput = z.infer<typeof askCaptainSchema>

// =============================================================================
// Tool Definition
// =============================================================================

export const createCaptainTools = (_ctx: ToolContext) => ({
  ask_captain: tool({
    description: `Render an interactive UI component inline in the chat for the user (the "captain") to interact with.
Use this when you need the user to make a selection or provide input that requires a structured UI element.

Types:
- email_input: Show an email field for authentication. Use when user needs to sign in or sign up.
- conversation_picker: Show a list of conversations to select from. Use when user wants to resume a conversation and there are multiple options.
- voyage_picker: Show a list of voyages to switch between. Use when user wants to see or switch their context.
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
        case 'voyage_picker':
          return `Voyage picker rendered with ${input.voyages?.length ?? 0} option${input.voyages?.length === 1 ? '' : 's'}. Awaiting captain's selection.`
        case 'confirmation':
          return `Confirmation dialog rendered: "${input.message}". Awaiting captain's response.`
      }
    },
  }),
})

export type CaptainTools = ReturnType<typeof createCaptainTools>

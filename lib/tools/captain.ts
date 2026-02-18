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

const emailInputSchema = z.object({
  type: z.literal('email_input'),
  message: z.string().optional().describe('Message to show above the email field'),
})

const conversationPickerSchema = z.object({
  type: z.literal('conversation_picker'),
  conversations: z.array(z.object({
    id: z.string(),
    title: z.string(),
    preview: z.string().optional(),
    messageCount: z.number().optional(),
    lastMessageAt: z.string().optional(),
  })).describe('Conversations to show in picker'),
})

const voyagePickerSchema = z.object({
  type: z.literal('voyage_picker'),
  voyages: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    role: z.string().optional(),
    memberCount: z.number().optional(),
  })).describe('Voyages to show in picker'),
})

const confirmationSchema = z.object({
  type: z.literal('confirmation'),
  message: z.string().describe('What to confirm with the user'),
  confirmLabel: z.string().optional().describe('Label for confirm button (default: Yes)'),
  cancelLabel: z.string().optional().describe('Label for cancel button (default: No)'),
})

const askCaptainSchema = z.discriminatedUnion('type', [
  emailInputSchema,
  conversationPickerSchema,
  voyagePickerSchema,
  confirmationSchema,
])

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
          return `Conversation picker rendered with ${input.conversations.length} option${input.conversations.length === 1 ? '' : 's'}. Awaiting captain's selection.`
        case 'voyage_picker':
          return `Voyage picker rendered with ${input.voyages.length} option${input.voyages.length === 1 ? '' : 's'}. Awaiting captain's selection.`
        case 'confirmation':
          return `Confirmation dialog rendered: "${input.message}". Awaiting captain's response.`
      }
    },
  }),
})

export type CaptainTools = ReturnType<typeof createCaptainTools>

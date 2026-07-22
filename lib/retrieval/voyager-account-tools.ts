import { tool } from 'ai'
import { z } from 'zod'
import { claimHandle, renameVoyagerHandle } from '@/lib/messaging/handles'
import { getAdminClient } from '@/lib/supabase/admin'
import { getUserVoyages } from '@/lib/voyage'
import { normalizeUsername } from '@/lib/voyage/username'
import type { ToolContext } from './tool-types'

export const createVoyagerAccountTools = (ctx: ToolContext) => ({
  sign_out: tool({
    description: `Sign the user out of Voyager. You MUST call this tool when the user wants to leave, log out, sign out, or says goodbye (e.g. "seeya", "exit", "logout", "sign out", "bye"). Without this tool call, the user will NOT be signed out. Write a brief farewell in your response text, then call this tool.`,
    inputSchema: z.object({
      farewell: z.string().describe('Your brief farewell message to the user'),
    }),
    execute: async (_input) => ({ status: 'signing_out' }),
  }),

  switch_voyage: tool({
    description: `Switch to a different voyage or to personal space. Use when the user says "switch to X", "go to X", "change to X voyage", "switch to personal", etc. Resolves the voyage name against the user's memberships.`,
    inputSchema: z.object({
      voyage_name: z.string().describe('Name of the voyage to switch to, or "personal" for personal space'),
    }),
    execute: async ({ voyage_name }) => {
      if (voyage_name.toLowerCase() === 'personal') {
        return JSON.stringify({
          switched: true,
          voyageSlug: null,
          name: 'Personal',
          conversationId: ctx.conversationId ?? null,
        })
      }
      const memberships = await getUserVoyages(ctx.userId)
      if (memberships.length === 0) return "You're not part of any voyages yet. Want to create one?"
      const lower = voyage_name.toLowerCase()
      const match = memberships.find((voyage) =>
        voyage.name.toLowerCase() === lower || voyage.slug.toLowerCase() === lower)
      if (!match) {
        return `No voyage called "${voyage_name}" found. Your voyages: ${memberships.map((voyage) => voyage.name).join(', ')}`
      }
      return JSON.stringify({
        switched: true,
        voyageSlug: match.slug,
        name: match.name,
        conversationId: ctx.conversationId ?? null,
      })
    },
  }),

  set_display_name: tool({
    description: `Set the user's display name. Use when a new user tells you what to call them, or when any user wants to change their display name. Natural follow-up: confirm with their name ("Got it, {name}."). Distinct from username (the addressing handle) — display name is only how their messages are labeled.`,
    inputSchema: z.object({
      name: z.string().min(1).max(50).describe('The display name to set'),
    }),
    execute: async ({ name }) => {
      const { error } = await getAdminClient()
        .from('profiles')
        .update({ display_name: name })
        .eq('id', ctx.userId)
      if (error) {
        console.error('[set_display_name] Error:', error)
        return 'Failed to save your name. Try again?'
      }
      return JSON.stringify({ set: true, name })
    },
  }),

  set_username: tool({
    description: `Set the user's USERNAME — their unique addressing handle (how others reach them: "+isaac", "tell isaac"). Use when the user claims a handle ("set my username to isaac", "let people reach me as isaac"). Distinct from display name (how their messages are labeled). Usernames are lowercase letters/numbers/._- (2-31 chars).`,
    inputSchema: z.object({ username: z.string() }),
    execute: async ({ username: inputUsername }) => {
      const normalized = normalizeUsername(inputUsername)
      if (!normalized.ok) return normalized.error
      const { username } = normalized
      const claim = await claimHandle(ctx.userId, username, 'human')
      if (!claim.ok) return claim.error
      const { error } = await getAdminClient()
        .from('profiles')
        .update({ username })
        .eq('id', ctx.userId)
      if (error?.code === '23505') return `That username's taken — try another.`
      if (error) {
        console.error('[set_username] Error:', error)
        return 'Failed to save your username. Try again?'
      }
      return `Username set: ${username}. People can now reach you with +${username} or "tell ${username}".`
    },
  }),

  name_voyager: tool({
    description: `Name the user's Voyager — give their agent a personal name they can address ("call you Wren", "name my voyager Sol"). After naming, "@<name>" is a private exchange only they and their Voyager can see. Lowercase letters/numbers/._- (2-31 chars), unique across everyone's handles.`,
    inputSchema: z.object({
      name: z.string().describe('The name to give the Voyager, e.g. "Wren"'),
    }),
    execute: async ({ name }) => {
      const result = await renameVoyagerHandle(ctx.userId, name)
      if (!result.ok) return result.error
      return `Done — I'm ${result.handle} now. Write "@${result.handle} …" for a private exchange.`
    },
  }),
})

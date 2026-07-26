import { createCaptainTools } from '@/lib/tools/captain'
import { createRetrievalTools } from './retrieval-tools'
import type { ToolContext, ToolRegistration } from './tool-types'
import { createVoyagerAccountTools } from './voyager-account-tools'
import { createVoyagerMessageCommandTools } from './voyager-message-command-tools'
import { createVoyagerMessageQueryTools } from './voyager-message-query-tools'
import { createVoyagerRoomTools } from './voyager-room-tools'
import { createVoyagerVoyageTools } from './voyager-voyage-tools'

export const createVoyagerTools = (ctx: ToolContext): {
  tools: Record<string, any>
  registrations: ToolRegistration[]
} => {
  const retrieval = createRetrievalTools(ctx)
  const captain = createCaptainTools(ctx)
  const voyage = createVoyagerVoyageTools(ctx)
  const account = createVoyagerAccountTools(ctx)
  const messageCommands = createVoyagerMessageCommandTools(ctx)
  const rooms = createVoyagerRoomTools(ctx)
  const messageQueries = createVoyagerMessageQueryTools(ctx)

  const registrations: ToolRegistration[] = [
    {
      name: 'semantic_search',
      tool: retrieval.semantic_search,
      strategyHint: 'First tool for exploration. Finds the neighbourhood around a topic by meaning.',
    },
    {
      name: 'keyword_grep',
      tool: retrieval.keyword_grep,
      strategyHint: 'Confirm specifics after semantic search. Exact phrases, names, quotes.',
    },
    {
      name: 'anchored_search',
      tool: retrieval.anchored_search,
      strategyHint: 'Anchor-first retrieval for named people. Use when the user asks what a specific voyage member shared or contributed, optionally about a topic.',
    },
    {
      name: 'get_nodes',
      tool: retrieval.get_nodes,
      strategyHint: 'Fetch full content for known node IDs from previous results.',
    },
    {
      name: 'search_by_time',
      tool: retrieval.search_by_time,
      strategyHint: 'Temporal queries. "Last week", "recently", "what changed since Tuesday".',
    },
    {
      name: 'web_search',
      tool: retrieval.web_search,
      strategyHint: 'External information. Fact-checking, current events, things not in the knowledge base.',
    },
    {
      name: 'spawn_background_agent',
      tool: retrieval.spawn_background_agent,
      strategyHint: 'Deep async research. Results surface later. Use for comprehensive multi-topic searches.',
    },
    {
      name: 'ask_captain',
      tool: captain.ask_captain,
      strategyHint: 'Render interactive UI inline. Use for auth, pickers, confirmations.',
    },
    {
      name: 'create_voyage',
      tool: voyage.create_voyage,
      strategyHint: 'Create a new voyage when user asks. Returns name, slug, invite code.',
    },
    {
      name: 'invite_to_voyage',
      tool: voyage.invite_to_voyage,
      strategyHint: 'Captain invites someone by email. Sends magic link that authenticates + joins in one click.',
    },
    {
      name: 'sign_out',
      tool: account.sign_out,
      strategyHint: 'Sign the user out. Call after saying goodbye.',
    },
    {
      name: 'switch_voyage',
      tool: account.switch_voyage,
      strategyHint: 'Switch voyage context. "switch to X", "go to personal".',
    },
    {
      name: 'set_display_name',
      tool: account.set_display_name,
      strategyHint: 'Set user display name. New users without a name, or name change requests.',
    },
    {
      name: 'set_username',
      tool: account.set_username,
      strategyHint: 'Set the unique username people use to address the user.',
    },
    {
      name: 'name_voyager',
      tool: account.name_voyager,
      strategyHint: 'Name the user\'s own Voyager ("call you Wren"). Enables @<name> private asides and "<name>, …" summons.',
    },
    {
      name: 'send_message',
      tool: messageCommands.send_message,
      strategyHint: 'Route messages to voyage members via @mention or natural language. Creates participant-scoped knowledge events.',
    },
    {
      name: 'add_to_room',
      tool: rooms.add_to_room,
      strategyHint: 'Add a person to THIS conversation so the user talks to them directly (no per-line tell). "+vanessa", "add tom".',
    },
    {
      name: 'remove_from_room',
      tool: rooms.remove_from_room,
      strategyHint: 'Remove a person from THIS conversation. "-vanessa", "just us".',
    },
    {
      name: 'set_voyager_presence',
      tool: rooms.set_voyager_presence,
      strategyHint: 'Toggle whether you (Voyager) are in the room. "-voyager" to step out (private human thread), "+voyager" to rejoin.',
    },
    {
      name: 'get_messages',
      tool: messageQueries.get_messages,
      strategyHint: 'Retrieve recent direct mentions from the current voyage. "Do I have messages?"',
    },
    {
      name: 'remember_knowledge',
      tool: messageCommands.remember_knowledge,
      strategyHint: 'Save explicit knowledge. "Remember I prefer morning meetings", "note that Tom handles billing", "save this decision".',
    },
  ]

  return {
    tools: Object.fromEntries(registrations.map((registration) => [registration.name, registration.tool])),
    registrations,
  }
}

export type VoyagerTools = ReturnType<typeof createVoyagerTools>

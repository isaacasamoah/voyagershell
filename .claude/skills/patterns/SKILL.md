---
name: patterns
description: Voyager codebase patterns and conventions. Reference before implementing new features. Agent primitives, tools, prompts, debug logging.
---

# Voyager Patterns

Reference this before implementing new features.

**Full patterns:** `~/.claude/modules/patterns/voyager/PATTERNS.md` — primitives, compositions, anti-patterns, architecture decisions.

---

## Quick Reference

| Pattern | Location | Purpose |
|---------|----------|---------|
| Agent Primitives | `lib/agents/primitives.ts` | Declarative agent definitions (4 types: primary, background, event, scheduled) |
| Agent Registry | `lib/agents/primitives.ts` | All agents declared as data. Implementation files import from here. |
| Retrieval Functions | `lib/knowledge/search.ts` | `searchKnowledge`, `keywordGrep`, `getConnectedKnowledge`, `getRecentKnowledge`, `getKnowledgeByIds` |
| Knowledge Events | `lib/knowledge/events.ts` | Event-sourced knowledge creation. Append-only. |
| Debug Logging | `lib/debug/logger.ts` | Toggleable structured logging by domain |
| Model Router | `lib/models/router.ts` | Model selection by task/quality. Never hardcode model IDs. |
| Prompt Composition | `lib/prompts/` | Modular prompt layers. `composeSystemPrompt()` is the entry point. |
| Tool Definitions | `lib/prompts/types.ts` | Standard `ToolDefinition` interface for all tools |
| Agent Queue | `lib/agents/queue.ts` | `agent_tasks` table. Enqueue, claim, complete, fail. Realtime-enabled. |

---

## Agent Architecture

Four agent types with clear boundaries:

```
primary     — Voyager. Owns conversation. Has retrieval tools + spawn.
background  — Retrieval agent. Heavy lifting. Reports to primary via Realtime.
event       — Post-session agent. Triggered by system events. No user interaction.
scheduled   — Quartermaster. Cron-triggered. No user interaction.
```

**Primary Voyager has tools:**
- `semantic_search`, `keyword_grep` — inline retrieval for light queries
- `spawn_background_agent` — spawns retrieval agent for heavy work
- `canSpawn: ['retrieval']`

**One brain, one decision.** Voyager decides when to search, not a heuristic or Gemini gate.

**One voice.** Background findings feed back into primary Voyager's context via the followup route. Same prompt, same model, full conversation history.

---

## Knowledge System

Append-only event-sourced knowledge with post-session enrichment.

```
knowledge_events (source of truth, append-only)
    ↓ trigger
knowledge_current (computed state + embeddings)
```

### Knowledge Types

| Type | What | Always Loaded |
|------|------|---------------|
| `domain` | Deep expertise, insights | No — retrieved by similarity |
| `operational` | Decisions, facts, roles, dates | No — retrieved by similarity + recency |
| `preference` | How to be treated | **Yes — every session** |

### Attention Score

Continuous 0.0-1.0 replacing `isPinned` + `isActive` booleans.

- 0.9-1.0: Always surface (pinned equivalent)
- 0.3-0.5: Quiet — focused queries only
- 0.0-0.3: Deep search only (noise)

### Context Snippet

One-line contextualisation prepended to content before re-embedding.
"Yeah go with option B" → "[Pricing tier discussion for enterprise] Yeah go with option B"

---

## Retrieval

### Agentic Retrieval (replaces code sandbox)

The retrieval agent calls tools directly and reasons between calls:

```
Objective → semantic_search → reason → keyword_grep → reason → get_connected → return findings
```

Tools are thin Vercel AI SDK wrappers around `lib/knowledge/search.ts` functions.

### Pre-Retrieval

Three-stage funnel on every user message:

```
All knowledge → filter by knowledge_type → filter by attention_score → semantic similarity → system prompt
```

Preferences bypass the funnel — loaded unconditionally.

### Background Surfacing

```
Background agent completes → agent_tasks Realtime → client → /api/chat/followup
  → Primary Voyager's prompt + model + real messages + findings → stream response
```

---

## Debug Logging

```typescript
import { log } from '@/lib/debug'

log.message('User sent', { conversationId, length })
log.memory('Search complete', { count, ms })
log.agent('Task queued', { taskId })
log.api('Request received', { path })
```

**Domains:** message, voyage, memory, ui, intent, auth, api, agent

**Enable:** `VOYAGER_DEBUG=*` (all) or `VOYAGER_DEBUG=api,memory` (specific)

---

## Model Router

```typescript
import { modelRouter } from '@/lib/models'

const model = modelRouter.select({
  task: 'chat',        // chat | decision | embedding
  quality: 'balanced', // fast | balanced | best
  streaming: true,
  toolUse: true,
})
```

Never hardcode model IDs. Never use `task: 'synthesis'` for user-facing responses — use `task: 'chat'`.

---

## Code Standards

- TypeScript strict
- Named exports only
- Arrow function components
- Files under 250 lines (except VoyagerInterface)
- Pure functions preferred (data in, result out)

---

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| Multiple systems deciding query depth | Voyager decides via tool calls |
| LLM generates JS for sandbox execution | LLM calls tools directly (agentic) |
| Separate synthesis agent/prompt/voice | Primary Voyager speaks with findings in context |
| Boolean attention flags | Continuous 0-1 attention score |
| Mandatory clustering/synthesis pipeline | Agent decides what's needed per query |
| In-memory debounce in serverless | DB timestamp check |
| `task: 'synthesis'` for followup | `task: 'chat'` — same model as primary |

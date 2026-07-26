# CLAUDE.md

Project context for Claude. Read this first.

## Active Proposals

<!-- Remove this section once addressed -->
**[Architecture Proposal: Voyager as Protocol](~/.claude/diary/branches/voyager-zero/main.md#2026-01-23---architecture-proposal-voyager-as-protocol)**

Captured 2026-01-23. Deep architectural thinking: Rust core, Lua extensions, CRDTs for local-first, protocol-not-product philosophy. Read the diary entry and discuss with Isaac before implementing anything major.

---

## Branch flow

```
feature/* → dev (Vercel preview) → main (Vercel production)
```

Test on **preview** (built from `dev`). Never test on production. `main` only updates when Isaac explicitly says "release to prod" — that involves user testing and client communication.

**Committed is not released. Pushed is not released. Released means merged to `dev`.**
That is the only line that matters. Commit work in logical slices as it
completes and push it to the remote — a feature branch on the remote ships
nothing. Never withhold a commit as a safety or gating mechanism; gate at the
merge, where the gate actually belongs.

A brief or spec that says "no commit" should be read as "no release" and
challenged, not silently obeyed. ORU-319 accumulated roughly 220 uncommitted
paths across five days by reading it the other way — no rollback points, an
unreviewable single change, and one stray `git checkout .` from losing the lot.
A commit SHA is a real seal; an ad-hoc content digest is not.

Mental model: `dev` is our staging app, `main` is the owner's production app. Forge ship phase always ships to `dev`; production promotion is a separate manual ritual.

Sister projects on the same pattern: `scout-dashboard`, `scout`. Single-trunk projects (no dev): `claude-has-hands`, `slipstream`.

## What is Voyager?

Your AI co-pilot for life and work. Not a chatbot - an intelligence that:
- **Learns you** over time (memory that compounds)
- **Protects your attention** (notification inversion)
- **Connects your tools** (the Jarvis layer)
- **Enables community** (Voyager IS the platform)

**The beating heart:** Intelligent retrieval. Voyager decides HOW to find things.

## The Vision

Voyager IS the community platform. Symbol grammar (`@tom #channel !voyage`) is navigation infrastructure. Slack becomes optional import, not the destination.

**Two layers:**
- **Organic** — Voyager learns (terminology, preferences, patterns)
- **Config** — Captain sets (domain restrictions, permissions, billing)

## Current State

| System | Status | Key Files |
|--------|--------|-----------|
| Chat + Streaming | Working | `app/api/chat/route.ts` |
| Agentic Retrieval (8 tools) | Working | `lib/retrieval/retrieval-tools.ts` |
| Background Agents | Working | `lib/agents/deep-retrieval.ts` |
| Knowledge (event-sourced) | Working | `lib/knowledge/` |
| Auth (magic link) | Working | `lib/auth/` |
| Voyages (teams) | Working | `lib/voyage/` |

## Agent Architecture

```
User message → Primary Voyager (streaming, has tools)
                   │
                   ├─ Simple query? → Respond directly (no tool calls)
                   ├─ Needs context? → semantic_search / keyword_grep / etc.
                   ├─ Needs deep work? → spawn_background_agent (async)
                   │                          │
                   │                          ▼
                   │                     Background Agent (Claude, full tools)
                   │                     Reason → search → evaluate → iterate
                   │                          │
                   │                          ▼ completeTask() → Realtime
                   │                     Surfacing: followup route or pending context
                   │
                   └─ Respond with what it has

Pre-loaded (every turn): Pinned knowledge (attn ≥ 0.9) + preferences (attn ≥ 0.5)
Tool decisions: Claude decides if/when/what to search. One brain, one decision.
```

**UX principle:** Trust Claude's intelligence, show the work. No hard step limits for intelligence — generous safety cap only. Astronaut states + progress labels keep the user engaged during multi-step reasoning. Using a model turn to update the user on what's happening is encouraged for longer loops.

## Key Directories

```
app/api/chat/route.ts         # Main chat route (streaming + tools)
lib/agents/deep-retrieval.ts  # Background agent (agentic retrieval)
lib/agents/cartographer.ts    # Tidal enrichment (knowledge quality)
lib/prompts/core.ts           # Voyager personality
lib/knowledge/                # Event-sourced knowledge system
lib/retrieval/retrieval-tools.ts # 8 retrieval tools
lib/retrieval/voyager-tools.ts   # Primary Voyager tool registry
lib/retrieval/tool-types.ts      # Shared tool context and registrations
lib/tools/captain.ts          # ask_captain presentation tool
components/ui/VoyagerInterface.tsx  # Terminal UI
```

## Database

- Supabase PostgreSQL + pgvector
- `knowledge_events` → append-only source of truth
- `knowledge_current` → computed state + embeddings
- `agent_tasks` → background task queue
- Realtime enabled on `agent_tasks`

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # production build
```

**Production:** https://voyagershell.vercel.app

### Supabase Migrations

Run migrations via the Management API (no CLI needed):

```bash
ACCESS_TOKEN=$(cat ~/.supabase/access-token)
PROJECT_REF="iesprdzzgjypnksoljym"
SQL=$(cat supabase/migrations/NNN_name.sql)
curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$SQL" | jq -Rs .)}"
```

Empty `[]` response = success. Verify with a `SELECT` query if needed.

## Code Standards

- TypeScript strict
- Named exports only
- Arrow function components
- Files under 250 lines

## Established Patterns

**Reference before implementing:** `.claude/skills/patterns/SKILL.md`

| Pattern | Location | Purpose |
|---------|----------|---------|
| Tool Definitions | `lib/prompts/types.ts` | Standard tool interface |
| Captain Tools | `lib/tools/captain.ts` | ask_captain presentation tool |
| Debug Logging | `lib/debug/logger.ts` | Toggleable structured logging |
| Model Router | `lib/models/router.ts` | Model selection by task/quality |

**Three Agent Classes:**
- **Primary (conversational)** — Full tool access, streaming, generous step budget. Decides what to search.
- **Event-driven (enrichment)** — Cartographer. Tidal enrichment triggered by unenriched event count.
- **Async background** — Deep retrieval. Spawned by primary via `spawn_background_agent`. Results surface via Realtime.

## Specs

**Master spec:** `~/.claude/research/voyager-v2/VOYAGER-MVP.md`
- This is THE spec to build against
- Contains full MVP vision, layers, checklist

**Archived context:** (background, not primary reference)
- `foundation.md` — Original vision exploration
- `agent-primitive.md` — Agent architecture research
- `slices.md` — Old roadmap (superseded)
- `cost-breakdown.md` — Old pricing (superseded)

**Active spec:** `~/.claude/specs/voyager/deep-retrieval-tools.md`
- Deep retrieval & tool architecture (ready to build, pending spec update for step/UX changes)

**Diary:** `~/.claude/diary/branches/voyager/ship-plan.md`
- Session memory, decisions, discoveries

## Test Bench

Voyager runs as a Next.js app on top of Supabase Postgres.

**Default test adapter:** `browser` — the UI is the primary test surface.

### Required platforms

- Local dev server (`npm run dev` on `localhost:3000`)
- Supabase project — managed; access via `~/.supabase/access-token`
- (Optional) Vercel preview URL for staging-shape tests

### Env file locations

- `~/the-workshop/voyagershell/.env.local` — Anthropic key, Supabase URL + anon key, etc.
- `~/.supabase/access-token` — Supabase Management API token (for migrations).

### Refresh keys

```bash
cd ~/the-workshop/voyagershell
vercel env pull .env.local
```

### Start procedure

```bash
cd ~/the-workshop/voyagershell
npm run dev                # localhost:3000
```

### Per-task override

Adapter overrides land in `CLAUDE.local.md` per ticket — `shell` for migration-only changes; `voice` not applicable (Voyager is text + UI).

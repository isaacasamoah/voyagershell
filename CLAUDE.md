# CLAUDE.md

Project context for Claude. Read this first.

## Branch flow

```
feature/* → dev (Vercel preview) → main (Vercel production)
```

Test on **preview** (built from `dev`). Never test on production. `main` only
updates when the owner explicitly says "release to prod" — that involves user
testing and client communication.

**Committed is not released. Pushed is not released. Released means merged to `dev`.**
That is the only line that matters. Commit work in logical slices as it
completes and push it to the remote — a feature branch on the remote ships
nothing. Never withhold a commit as a safety or gating mechanism; gate at the
merge, where the gate actually belongs.

A brief or spec that says "no commit" should be read as "no release" and
challenged, not silently obeyed. Long-lived uncommitted work has no rollback
points and is vulnerable to one accidental worktree reset. A commit SHA is a
real seal; an ad-hoc content digest is not.

Mental model: `dev` is the staging app and `main` is production. Production
promotion is a separate owner-authorized release.

## What is Voyager?

Your AI co-pilot for life and work. Not a chatbot - an intelligence that:
- **Learns you** over time (memory that compounds)
- **Protects your attention** (notification inversion)
- **Connects your tools** (the Jarvis layer)
- **Enables community** (Voyager IS the platform)

**The beating heart:** Intelligent retrieval. Voyager decides HOW to find things.

## The Vision

Voyager IS the community platform. Symbol grammar (`@name #channel !voyage`) is
navigation infrastructure. Imported chat tools are inputs, not the destination.

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
lib/agents/cartographer.ts    # Event-owned, leased knowledge extraction
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
- `knowledge_extraction_jobs` → mutable source-event work and leases
- `knowledge_extraction_attempts` / `_outcomes` → immutable model provenance
- `knowledge_units` → immutable source-derived claims
- `agent_tasks` → background task queue
- Realtime enabled on `agent_tasks`

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # production build
```

**Production:** https://voyagershell.vercel.app

### Supabase Migrations & DB-branch hygiene

This project uses **Supabase database branching** — one project, two DB branches.
Code branches and DB branches pair up; keep them aligned:

| Code branch | DB branch | Ref | Role |
|---|---|---|---|
| `feature/*`, `dev` | **`voyager-dev`** | `hpotfrfdigzmhyibihst` | **Persistent DEV branch — the ONLY writable target for feature/Spec/preview work and for applying migrations as dev proceeds.** |
| `main` | `main` | `iesprdzzgjypnksoljym` | **PRODUCTION** — no default write path; migrations land here only at an explicit owner-authorized release. |

**Rules:**
- Apply migrations to the **`voyager-dev` branch** continuously as dev proceeds — that is the standing dev surface, not disposable local Postgres. Disposable proofs must translate into the dev branch, not stay in Docker.
- **Never apply dev/test migrations to `main` (production).** Production gets migrations only at release (branch merge/promotion).
- **Confirm the DB branch by NAME before any DDL** — list branches with `GET /v1/projects/iesprdzzgjypnksoljym/branches`. A raw ref string is not human-verifiable, and `GET /v1/projects` lists only the parent project (shows `main`/prod), NOT the branch DBs. **Never infer the DB target from the app URL (`.env.local` points at prod) or the worktree path.**
- DDL path is the **Supabase Management API** (`POST /v1/projects/<branch_ref>/database/query`) with the owner-supplied `sbp_` token; requests must send a browser User-Agent or Cloudflare WAF-blocks them (403 / "error code 1010" — not a SQL error). See `recipes/README.md`. Verify the expected catalog change separately after applying.
- **Apply/release tool:** `recipes/release/apply-migrations.py --ref <branch_ref> [--reset]` — applies pending migrations in order, records the ledger, stops on the first error. `--reset` rebuilds from zero.
- **CLEAN-FROM-ZERO GATE (the anti-drift rule):** the migration chain must rebuild a database **from scratch** with zero errors. A migration that only applies forward onto an accreted state but cannot replay from zero is **not done** and is **not promotable**. **The gate is owed at promotion, not on every change** — run the from-zero rebuild before promoting `voyager-dev → main`. That is also the only moment a rebuild costs nothing, because the dev test data has served its purpose by then. Day to day `voyager-dev` is **forward-apply-only**: it carries live test state, so routinely `--reset`-ing it is not the standing proof and must not be treated as one. Promotion `voyager-dev → main` is that same clean chain replayed onto production — never a hand-reconciled catch-up.

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
- **Event-driven (enrichment)** — Cartographer. Every new human conversation/message
  atomically owns one extraction job; source ingress wakes it and the next
  audience-authorized human turn recovers one interrupted job.
- **Async background** — Deep retrieval. Spawned by primary via `spawn_background_agent`. Results surface via Realtime.

## Specs

Repository documentation and the approved task brief are contributor
authority. Owner-only research, diaries, and work tracking are not portable
project dependencies.

## Test Bench

Voyager runs as a Next.js app on top of Supabase Postgres.

**Default test adapter:** `browser` — the UI is the primary test surface.

### Required platforms

- Local dev server (`npm run dev` on `localhost:3000`)
- Supabase project — managed; hosted access is injected only for authorized work
- (Optional) Vercel preview URL for staging-shape tests

### Env file locations

- `.env.local` — untracked application environment; start from `.env.example`
- `VOYAGER_SUPABASE_ACCESS_TOKEN` — injected only for authorized hosted recipes

### Refresh keys

```bash
vercel env pull .env.local
```

### Start procedure

```bash
npm run dev                # localhost:3000
```

### Per-task override

Adapter overrides land in `CLAUDE.local.md` per ticket — `shell` for migration-only changes; `voice` not applicable (Voyager is text + UI).

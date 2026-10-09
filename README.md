# VoyagerShell

A conversational collaboration application with persistent memory, shared rooms and agents that can retrieve knowledge, act through tools and delegate research. Built with TypeScript, Next.js, the Vercel AI SDK and Supabase PostgreSQL.

This repository contains the **web application**. It is also a reference for Voyager's next direction: a local service connecting the coding agents you already use. That service is a design in progress, described below; it is not implemented in this repository.

## What the web application implements

| Capability | Where to look |
| --- | --- |
| Streaming conversation, context assembly and tool execution | [Turn harness](lib/harness/run-turn.ts), [HTTP adapter](app/api/chat/route.ts) |
| Event-sourced knowledge, embeddings and scoped retrieval | [Knowledge layer](lib/knowledge/), [retrieval tools](lib/retrieval/tools.ts), [database migrations](supabase/migrations/) |
| Background research with recorded progress, results and failures | [Deep retrieval](lib/agents/deep-retrieval.ts), [task queue](lib/agents/queue.ts) |
| Event-driven knowledge enrichment | [Cartographer](lib/agents/cartographer.ts) |
| Shared rooms, participant identity and message delivery | [Messaging](lib/messaging/), [room turns](lib/harness/room-turn.ts) |
| Model selection and provider connections | [Models](lib/models/) |
| Comparing action claims with recorded tool calls | [Action reconciler](lib/shell/reconciler.ts) |
| Magic-link authentication and voyage membership | [Authentication](lib/auth/), [voyages](lib/voyage/) |

The system has three agent roles: a conversational agent, an enrichment agent and background research agents. Background work is already implemented; it is not a future roadmap item.

## Architecture

```text
Next.js web interface
        |
Chat HTTP adapter -> turn harness -> model + retrieval/action tools
                            |
                            +-> background research -> task state and results
                            +-> knowledge enrichment
                            |
                Supabase PostgreSQL + pgvector + Realtime
                attributed events, knowledge, rooms and deliveries
```

The HTTP route delegates conversation execution to a separate harness. Knowledge events preserve source material; retrieval builds context for a turn. Background tasks record progress and terminal outcomes, with timeouts and stale-task handling. The web host's execution limits still apply: this is not an independent, indefinitely running worker service.

For a code review, start with the [turn harness](lib/harness/run-turn.ts), [its tests](lib/harness/run-turn.test.ts), [knowledge scope tests](lib/knowledge/scope.test.ts) and [task recovery tests](lib/agents/queue.reap.test.ts). The action reconciler uses intent and text patterns; it is a targeted check, not a general proof that every model statement is true.

## Development setup

The package declares Node.js 20.x. You also need a development Supabase project and provider credentials; there is no account-free demo mode.

```bash
git clone https://github.com/isaacasamoah/voyagershell.git
cd voyagershell
npm ci
cp .env.example .env.local
```

Configure your own development environment:

- Supabase URL, public anon key and server-side service-role key.
- `ANTHROPIC_API_KEY` for the chat route and `OPENAI_API_KEY` for embeddings. Start with [.env.example](.env.example), but note its Google variable is outdated: [query reformulation](lib/knowledge/reformulate.ts) reads `GOOGLE_GEMINI_API_KEY`. Optional [reranking](lib/knowledge/rerank.ts) reads `COHERE_API_KEY`.
- The schema in [supabase/migrations](supabase/migrations/), Supabase Auth redirect URLs and Realtime configuration. Review the migration history against your development database before applying it. A clean-database bootstrap has not been revalidated for this README update.
- `NEXT_PUBLIC_APP_URL` for your local URL. The development magic-link route logs the login URL to the local server console; hosted email delivery uses `RESEND_API_KEY` and optionally `RESEND_FROM_EMAIL`.

```bash
npm run dev             # http://localhost:3000
npm run type-check
npm run lint
npm run test:run        # one test run, rather than watch mode
npm run build
```

These commands are defined in [package.json](package.json). Unit tests, [SQL privacy checks](supabase/tests/) and browser journeys exercise different boundaries; passing one does not establish a working hosted deployment. Use a development environment for verification.

## Next direction: a local agent service

As of October 2026, the next design starts with a local service and adds an Electron avatar/status interface afterwards. The native coding agent remains the conversational interface.

The proposed first journey is to register a supported existing session, launch a managed worker, detach the client, reconnect and recover correctly attributed events and results. Registering a session, observing it, controlling it and owning its process lifetime are separate capabilities. Merely attaching a terminal would not guarantee its process survives terminal closure.

The service would retain observable messages, tool requests/results and task changes as evidence for continuing knowledge. Later work would add graph exploration, retrieval and permission-scoped collaboration: private history stays private unless explicitly shared. A person could view their accessible graph, ask a question and inspect the relevant connected evidence.

The new service and desktop contract are **design drafts**, not shipped features. The first session adapter, runtime language and storage choices remain open. Earlier desktop experiments inform the design but do not establish a general-purpose attachment or recovery mechanism.

## Project notes

[ARCHITECTURE.md](ARCHITECTURE.md) and [CONTRIBUTING.md](CONTRIBUTING.md) provide additional context; older version labels and roadmap notes may describe earlier iterations. The implementation links above identify the current web code. This repository does not currently declare an open-source license.

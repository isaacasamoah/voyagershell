# Voyager architecture

Voyager Shell is a Next.js web application backed by Supabase PostgreSQL. The
native service and Electron client are developed in the separate
[Voyager Shell App](https://github.com/isaacasamoah/voyagershellapp) repository.

## Follow one conversation turn

```text
Browser conversation
    → app/api/chat/route.ts       authentication and HTTP streaming
    → lib/harness/run-turn.ts    conversation context and turn orchestration
        → room gate              membership, addressing and room commands
        → ingress claim          source event, audience and delivery transaction
        → prompt composition     current context and authorized knowledge
        → model + tool registry  retrieval, actions and background research
        → finishTurn             persist the reply and record tool evidence
```

The [HTTP route](app/api/chat/route.ts) delegates to [runTurn](lib/harness/run-turn.ts).
The harness accepts human-originated turns and resolves addressing in code.
[Room gates](lib/harness/room-turn.ts) and [ingress](lib/harness/turn-ingress.ts)
run before the primary model call. An ingress replay stops that turn; the source
claim, audience, event, graph identity and delivery outbox commit together.

[Prompt composition](lib/prompts/) assembles context.
[The tool registry](lib/retrieval/voyager-tools.ts) makes the supported tools
available to the model. [Message assembly](lib/harness/turn-messages.ts) preserves
the provider's system-message ordering and prompt-cache boundaries.
[finishTurn](lib/harness/finish-turn.ts) persists the response with its source
and audience. The host drains the stream so browser disconnection does not
prevent the finish callback from running; host execution limits still apply.

## Module map

| Directory | Responsibility |
| --- | --- |
| `app/` | Next.js routes, pages and HTTP adapters |
| `components/` | Conversation, room and account interfaces |
| `lib/harness/` | Turn orchestration, ingress, message assembly and completion |
| `lib/conversation/` | Session authority, history and context windows |
| `lib/messaging/` | Addressing, room membership, events and deliveries |
| `lib/retrieval/` | Tool registration and retrieval adapters |
| `lib/knowledge/` | Knowledge extraction data, searches and graph boundaries |
| `lib/agents/` | Background research, task state and Cartographer extraction |
| `lib/models/` | Model configuration and user connections |
| `supabase/migrations/` | Database schema and versioned migration history |
| `recipes/` | Database proofs and authorized release operations |

## Background work

The primary model decides whether research needs a background agent.
[Deep retrieval](lib/agents/deep-retrieval.ts) executes retrieval tools and
records findings; [the queue](lib/agents/queue.ts) owns task progress, outcomes,
timeouts and stale-task handling. This runs under the web host, not an
independent persistent worker service.

[Cartographer](lib/agents/cartographer.ts) extracts knowledge from source events.
Ingress defers extraction, and a later authorized human turn can recover pending
or expired work. Its jobs, attempts, outcomes and source audiences are distinct
from the research task queue.

## Storage and privacy

`knowledge_events` is the event-content ledger. The graph indexes identities and
relationships; it does not grant product membership. Source audiences are
immutable, and extracted units inherit their source audience. A link alone
cannot grant access to either endpoint.

The application calls `retrieve_knowledge_graph_claims_v3` through
[the graph boundary](lib/knowledge/kernel/boundary.ts). Migration 081 removes the
previous v2 function. This describes the checked-in contract, not the schema
currently installed in any hosted database.

Read the [knowledge and graph contract](docs/architecture/knowledge.md) for
identity, provenance, traversal and membership rules, and the
[migration foundations](docs/architecture/migrations.md) for the installed-state
boundary. [Current recipes](recipes/README.md) own executable proof and migration
instructions. Historical receipts describe their recorded revisions.

## Verification

Use [Contributing](CONTRIBUTING.md) for local commands and
[testing guidance](docs/testing/README.md) for the proof appropriate to each
change. Unit tests establish their tested contracts; database recipes establish
SQL behavior; an observed browser journey establishes the user interaction.

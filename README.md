# Voyager Shell

**Let's go together.**

Voyager explores how people and their agents can build together around shared
knowledge. This repository is the first web-based application: conversations,
shared rooms, agent-directed retrieval and background research.

[Open Voyager Shell](https://voyagershell.ai) · [Contributing](CONTRIBUTING.md) ·
[Architecture](ARCHITECTURE.md)

## How we got here

I started [Voyager Demo](https://github.com/isaacasamoah/voyager-demo) to explore
space through a conversational interface and find people to learn and build
with. That curiosity grew into this web application for collaboration and
shared knowledge.

The next chapter is [Voyager Shell App](https://github.com/isaacasamoah/voyagershellapp):
a native Rust service and Electron experiments connecting the coding agents we
already use. The astronaut marks the intended place to work from — your current
bridge into the connected sessions. Service registration, docking and whiteboard
experiments are being developed in that separate repository. Its default branch
and experiment branches have different capabilities; follow its documentation
and pull requests for the version you want to try.

The longer-term direction brings people and agents together around a shared
knowledge graph and collaboration tools. Each prototype helps me learn what
that should feel like. I share the work to meet other curious builders and
find useful things to make together.

## What is in this repository

| Area | Implementation |
| --- | --- |
| Streaming conversation | [Chat API](app/api/chat/route.ts) and [turn harness](lib/harness/run-turn.ts) |
| Shared voyages and rooms | [Voyages](lib/voyage/) and [messaging](lib/messaging/) |
| Persistent knowledge and scoped retrieval | [Knowledge](lib/knowledge/), [graph boundary](lib/knowledge/kernel/boundary.ts) and [retrieval tools](lib/retrieval/) |
| Background research and task progress | [Retrieval agent](lib/agents/deep-retrieval.ts) and [task queue](lib/agents/queue.ts) |
| Knowledge extraction from conversations | [Cartographer](lib/agents/cartographer.ts) |
| Model connections and selection | [Models](lib/models/) |
| Magic-link authentication | [Authentication](lib/auth/) |

These are code capabilities, not a claim that every workflow has been verified
on the current hosted deployment. The web app requires Supabase and model
credentials; it does not include an account-free offline demo. Background tasks
run within the web host's execution limits. Native terminal docking and desktop
whiteboards belong to the separate native app.

The default `main` branch represents production code. Development lands on
`dev`, which may contain newer experiments and database changes. This README
and its relative links describe the branch you are reading.

## Run locally

Use Node.js 24.x and npm. Create your own development Supabase project and use
its URL and keys; production data is not needed to contribute.

```bash
git clone --branch dev https://github.com/isaacasamoah/voyagershell.git
cd voyagershell
npm ci
cp .env.example .env.local
```

Fill in the core values in [.env.example](.env.example). Chat uses an Anthropic
key; memory extraction and search use an OpenAI key. Optional integrations are
labelled in the template. Keep real credentials out of Git.

The application also needs its database schema and Supabase Auth configuration.
Read the [database recipes](recipes/README.md) before applying migrations to your
own development database. The migration and schema proofs are distinct from a
complete fresh-account setup; the latter has not been revalidated for this
README update. Configure Auth redirects for your local application URL.

```bash
npm run dev
```

Open `http://localhost:3000`. See [Contributing](CONTRIBUTING.md) for checks,
branching and the path from a change to review.

## Find your way around

Start with [the architecture overview](ARCHITECTURE.md), which follows a message
from the browser through the service code to storage. The detailed
[knowledge contract](docs/architecture/knowledge.md) explains audiences,
permissions and graph relationships. [Testing guidance](docs/testing/README.md)
distinguishes unit checks, database proofs and browser journeys.

## Build with me

Questions, small experiments and reports of what was confusing are welcome.
Open an [issue](https://github.com/isaacasamoah/voyagershell/issues) with what you
tried, what happened and what you want to understand. For code contributions,
start with a focused change and include a way to check it.

Related learning projects:

- [Voyager Demo](https://github.com/isaacasamoah/voyager-demo): the original space exploration prototype.
- [Voyager Shell App](https://github.com/isaacasamoah/voyagershellapp): native agent orchestration and desktop experiments.
- [SpaceML](https://github.com/isaacasamoah/spaceml): space and applied maths experiments.
- [Theory of Everything](https://github.com/isaacasamoah/theory-of-everything): learning algorithms from scratch.

## Licence

This repository currently has no licence file. Choosing a licence remains an
open decision for the owner.

# App atlas

One interactive map of VoyagerShell, from concepts down to functions, with traced pathways, pull-request history and the proposed restructuring. The code facts come from `../architecture-map`; this folder adds a small hand-written layer and the page.

## Run

```sh
node experiments/app-atlas/atlas.cjs build --rev HEAD
```

Open `experiments/app-atlas/out/atlas.html`. It is one self-contained file and works offline; only the "Open on GitHub" links need a network.

| Command | Result |
| --- | --- |
| `build [--rev REV] [--out DIR]` | `atlas.json` (the model) and `atlas.html` (the page). |
| `check [--rev REV]` | Lists every problem and exits 1 if there is any. |
| `lock [--rev REV]` | Records a fingerprint of the code under every anchor in `layer/anchors.lock.yaml`. |

Tests: `node --test experiments/app-atlas/atlas-test.cjs`.

## What is generated and what is written

| Part | Source |
| --- | --- |
| Crates, modules, scripts, host modules and the links between them | `../architecture-map/observe.cjs`, run on the commit. |
| Pull requests, their commits and changed files | Git history since the `history.from` commit in `../architecture-map/config.json`. |
| Concepts, containers, features, glossary and runtime links | `layer/concepts.yaml` |
| What each crate and module holds, where it starts and why | `layer/modules.yaml` |
| Pathways: each step's function, thread, hop and failure | `layer/pathways.yaml` |
| Proposed changes, with evidence and the pathway steps they affect | `layer/proposals.yaml` |

## How the hand-written layer stays true

Every claim points at source by text, not line number: `{path, find}`, optionally with `after` to pick the first match below a unique line. A build re-finds each anchor at the chosen commit:

- `missing` or `ambiguous`: the text is gone or matches several lines. `check` fails.
- `changed`: the code under a reviewed anchor differs from `anchors.lock.yaml`. The claim may still be right, but someone has to reread it and run `lock` again.
- Module ids must exist in the generated facts, every module needs a feature, and a pathway step's file must belong to its module.

Proposal evidence can be a `count` instead of an anchor; the build recounts it, so numbers such as "7 quitting checks" follow the code.

The layer uses the strict YAML subset read by `../architecture-map/yaml.cjs`: quote a value that contains ` #` or starts with `[`, `{` or a quote.

## Limits

- Function-level links come only from traced pathways; there is no call graph.
- Pathways were traced by reading source, not by running the app.
- Module links are a lower bound (see the architecture-map README).
- Feature assignment and every reason are judgements; `inferred: true` marks reasons not stated in code or docs.

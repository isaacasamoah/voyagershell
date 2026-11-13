# App atlas

An interactive map of an application that you open part by part, from concepts down to functions. It shows the most-used pathways (traced in source), pull-request history, and an intended architecture compared with today's code. The code facts come from the architecture extractor in `tests/architecture`, the same one the CI architecture gate uses; each app adds a checked hand-written layer.

## Apps

Each app is a folder under `apps/`:

| File | Holds |
| --- | --- |
| `atlas.yaml` | Where the source checkout is, the extractor settings, how ids and paths map to containers, and how the page names and lays out the app (title, concept grid, thread lanes, wording). |
| `layer/` | The hand-written meaning: concepts, modules, pathways, interfaces, and optionally proposals and a proposed architecture. |
| `local/` | Ignored by Git: documents derived from untracked material, such as specifications. |

`apps/voyager` maps this repository. The earlier `apps/herdr-core` map, the `trace/` scripts that recorded runs and the recorded `runs/` folders are not carried forward; they stay in this branch's history at commit 4ad7940.

## Set up and run

Run `npm ci` at the repository root once. The tests need `ajv` and the extractor needs `typescript`, both root dev dependencies, and the extractor stops with an error when `typescript` is missing. The extractor also needs `cargo` on the path.

```sh
npm ci
node experiments/app-atlas/atlas.cjs build --rev HEAD
```

Open `experiments/app-atlas/out/atlas.html`. The build also writes `architecture.code.yaml`, `architecture.intended.yaml` (when the app has a proposed architecture) and `architecture.comparison.yaml` in the [architecture/v1 format](FORMAT.md); the page is derived from those files alone. It is one self-contained file and works offline; only the "Open on GitHub" links need a network.

| Command | Result |
| --- | --- |
| `build [--app DIR] [--source DIR] [--rev REV] [--out DIR]` | `atlas.json` (the model) and `atlas.html` (the page). `--app` defaults to `apps/voyager`. |
| `check [--app DIR] [--source DIR] [--rev REV]` | Lists every problem and exits 1 if there is any. |
| `lock [--app DIR] [--source DIR] [--rev REV]` | Records a fingerprint of the code under every anchor in the app's `layer/anchors.lock.yaml`. |
| `render --code FILE [--intended FILE] [--comparison FILE]` | The page from `architecture/v1` documents alone, with no checkout. |
| `compare --intended FILE --code FILE` | The comparison document. |
| `import --from-v0 FILE [--annotations FILE] --code FILE` | An intended document from the spec reader's architecture-map/v0 file, with its recorded judgements. |

### Compare the specs with the code

```sh
L=experiments/app-atlas/apps/voyager/local
node experiments/app-atlas/atlas.cjs build --rev HEAD --out $L
node experiments/app-atlas/atlas.cjs import --from-v0 SPEC-INTENDED.yaml --annotations ANNOTATIONS.yaml --code $L/architecture.code.yaml --out $L/architecture.intended.yaml
node experiments/app-atlas/atlas.cjs compare --intended $L/architecture.intended.yaml --code $L/architecture.code.yaml --out $L/architecture.comparison.yaml
node experiments/app-atlas/atlas.cjs render --code $L/architecture.code.yaml --intended $L/architecture.intended.yaml --comparison $L/architecture.comparison.yaml --out $L
```

The spec-derived files quote untracked specifications, so they stay in `local/`.

Tests: `node --test experiments/app-atlas/atlas-test.cjs`, after `npm ci`. They read a fixed commit and the merge history since `history.from`, so they need a full clone, not a shallow one.

## What is generated and what is written

| Part | Source |
| --- | --- |
| Crates, modules, scripts, host modules and the links between them | `tests/architecture/observe.cjs`, run on the commit. |
| Pull requests, their commits and changed files | Git history since the extractor's `history.from` commit, including squash-merged pull requests. |
| Concepts, containers, features, glossary and runtime links | `layer/concepts.yaml` |
| What each crate and module holds, where it starts and why | `layer/modules.yaml` |
| Pathways: each step's function, thread, hop and failure | `layer/pathways.yaml` |
| Proposed changes, with evidence and the pathway steps they affect | `layer/proposals.yaml` |
| The architecture after the proposals: new and changed modules, where their code comes from today, intended links and rules | `layer/proposed.yaml` |

Paths in this table are inside an app folder.

## How the hand-written layer stays true

Every claim points at source by text, not line number: `{path, find}`, optionally with `after` to pick the first match below a unique line. A build re-finds each anchor at the chosen commit:

- `missing` or `ambiguous`: the text is gone or matches several lines. `check` fails.
- `changed`: the code under a reviewed anchor differs from `anchors.lock.yaml`. The claim may still be right, but someone has to reread it and run `lock` again.
- Module ids must exist in the generated facts, every module needs a feature, and a pathway step's file must belong to its module.

Proposal evidence can be a `count` instead of an anchor; the build recounts it, so numbers such as "7 quitting checks" follow the code.

The layer uses the strict YAML subset read by `tests/architecture/yaml.cjs`: quote a value that contains ` #` or starts with `[`, `{` or a quote.

## Limits

- Function-level links come only from traced pathways; there is no call graph.
- Pathways were traced by reading source and are not confirmed by a run. The page shows recorded runs when an app has a `runs/` folder.
- Module links are a lower bound (the extractor reads declared modules, paths and trigger tokens, not a call graph).
- Feature assignment and every reason are judgements; `inferred: true` marks reasons not stated in code or docs.

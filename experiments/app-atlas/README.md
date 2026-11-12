# App atlas

One interactive map of VoyagerShell that you open part by part, from concepts down to functions. It shows the most-used pathways (traced in source and confirmed by running the app), pull-request history, the proposed restructuring and the architecture after it. The code facts come from `../architecture-map`; this folder adds a checked hand-written layer, runtime traces and the page.

## Run

```sh
node experiments/app-atlas/atlas.cjs build --rev HEAD
```

Open `experiments/app-atlas/out/atlas.html`. The build also writes `architecture.code.yaml`, `architecture.intended.yaml` and `architecture.comparison.yaml` in the [architecture/v1 format](FORMAT.md); the page is derived from those three files alone. It is one self-contained file and works offline; only the "Open on GitHub" links need a network.

| Command | Result |
| --- | --- |
| `build [--rev REV] [--out DIR]` | `atlas.json` (the model) and `atlas.html` (the page). |
| `check [--rev REV]` | Lists every problem and exits 1 if there is any. |
| `lock [--rev REV]` | Records a fingerprint of the code under every anchor in `layer/anchors.lock.yaml`. |
| `render --code FILE [--intended FILE] [--comparison FILE]` | The page from `architecture/v1` documents alone, with no checkout. |
| `compare --intended FILE --code FILE` | The comparison document. |

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
| The architecture after the proposals: new and changed modules, where their code comes from today, intended links and rules | `layer/proposed.yaml` |
| Which pathway steps were seen running, on which thread | `runs/*.json`, written by `trace/analyze.py` |

## How the hand-written layer stays true

Every claim points at source by text, not line number: `{path, find}`, optionally with `after` to pick the first match below a unique line. A build re-finds each anchor at the chosen commit:

- `missing` or `ambiguous`: the text is gone or matches several lines. `check` fails.
- `changed`: the code under a reviewed anchor differs from `anchors.lock.yaml`. The claim may still be right, but someone has to reread it and run `lock` again.
- Module ids must exist in the generated facts, every module needs a feature, and a pathway step's file must belong to its module.

Proposal evidence can be a `count` instead of an anchor; the build recounts it, so numbers such as "7 quitting checks" follow the code.

The layer uses the strict YAML subset read by `../architecture-map/yaml.cjs`: quote a value that contains ` #` or starts with `[`, `{` or a quote.

## Runtime traces

`trace/` runs the real app where it cannot touch your desktop or sessions: its own Xvfb display, a new profile, a dedicated Core session named `voyager-atlas-<run>`, input only to that display, and at the end Ctrl+Q plus `hc server stop` for that session alone. gdb sets breakpoints on each step's `symbol`; they log the function and thread and never pause the app. `hc_tee.sh` records the bytes exchanged with `hc connect`.

```sh
ATLAS_RUN_DIR=/some/scratch ./trace/drive-main.sh NAME /path/to/voyager-shell symbols.json
python3 trace/analyze.py /some/scratch/NAME --id DATE-NAME --layer layer --out runs/DATE-NAME.json [--alias mark=pathway] [--finding pathway=text]
```

The driver's coordinates assume the default 1920x1200 display and a new profile. Use an optimized build of the commit you map; steps whose function the optimizer inlined are marked as not visible, not as failed. Voice is not driven: it would open the real microphone and stream audio to OpenAI.

## Limits

- Function-level links come only from traced pathways; there is no call graph.
- Pathways were traced by reading source. Runs confirm which in-app functions ran and on which thread; script, Core and outside-program steps cannot be seen by the debugger.
- Module links are a lower bound (see the architecture-map README).
- Feature assignment and every reason are judgements; `inferred: true` marks reasons not stated in code or docs.

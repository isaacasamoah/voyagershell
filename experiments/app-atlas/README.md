# App atlas

An interactive map of an application that you open part by part, from concepts down to functions. It shows the most-used pathways (traced in source and, for Voyager, confirmed by running the app), pull-request history, and an intended architecture compared with today's code. The code facts come from `../architecture-map`; each app adds a checked hand-written layer, and optionally runtime traces.

## Apps

Each app is a folder under `apps/`:

| File | Holds |
| --- | --- |
| `atlas.yaml` | Where the source checkout is, the extractor settings, how ids and paths map to containers, and how the page names and lays out the app (title, concept grid, thread lanes, wording). |
| `layer/` | The hand-written meaning: concepts, modules, pathways, interfaces, and optionally proposals and a proposed architecture. |
| `runs/` | Traced runs, if any. |
| `local/` | Ignored by Git: documents derived from untracked material, such as specifications. |

`apps/voyager` maps this repository. `apps/herdr-core` maps [Herdr Core](https://github.com/herdrdev/herdr-core), whose source is not here: clone it and pass `--source`.

## Run

```sh
node experiments/app-atlas/atlas.cjs build --rev HEAD
node experiments/app-atlas/atlas.cjs build --app experiments/app-atlas/apps/herdr-core --source ../herdr-core --rev v0.1.19
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

Tests: `node --test experiments/app-atlas/atlas-test.cjs`.

## What is generated and what is written

| Part | Source |
| --- | --- |
| Crates, modules, scripts, host modules and the links between them | `../architecture-map/observe.cjs`, run on the commit. |
| Pull requests, their commits and changed files | Git history since the extractor's `history.from` commit, including squash-merged pull requests. |
| Concepts, containers, features, glossary and runtime links | `layer/concepts.yaml` |
| What each crate and module holds, where it starts and why | `layer/modules.yaml` |
| Pathways: each step's function, thread, hop and failure | `layer/pathways.yaml` |
| Proposed changes, with evidence and the pathway steps they affect | `layer/proposals.yaml` |
| The architecture after the proposals: new and changed modules, where their code comes from today, intended links and rules | `layer/proposed.yaml` |
| Which pathway steps were seen running, on which thread | `runs/*.json`, written by `trace/analyze.py` |

Paths in this table are inside an app folder.

## How the hand-written layer stays true

Every claim points at source by text, not line number: `{path, find}`, optionally with `after` to pick the first match below a unique line. A build re-finds each anchor at the chosen commit:

- `missing` or `ambiguous`: the text is gone or matches several lines. `check` fails.
- `changed`: the code under a reviewed anchor differs from `anchors.lock.yaml`. The claim may still be right, but someone has to reread it and run `lock` again.
- Module ids must exist in the generated facts, every module needs a feature, and a pathway step's file must belong to its module.

Proposal evidence can be a `count` instead of an anchor; the build recounts it, so numbers such as "7 quitting checks" follow the code.

The layer uses the strict YAML subset read by `../architecture-map/yaml.cjs`: quote a value that contains ` #` or starts with `[`, `{` or a quote.

## Runtime traces

`trace/` runs the real Voyager app where it cannot touch your desktop or sessions: its own Xvfb display, a new profile, a dedicated Core session named `voyager-atlas-<run>`, input only to that display, and at the end Ctrl+Q plus `hc server stop` for that session alone. gdb sets breakpoints on each step's `symbol`; they log the function and thread and never pause the app. `hc_tee.sh` records the bytes exchanged with `hc connect`.

```sh
ATLAS_RUN_DIR=/some/scratch ./trace/drive-main.sh NAME /path/to/voyager-shell symbols.json
python3 trace/analyze.py /some/scratch/NAME --id DATE-NAME --layer apps/voyager/layer --out apps/voyager/runs/DATE-NAME.json [--alias mark=pathway] [--finding pathway=text]
```

The driver's coordinates assume the default 1920x1200 display and a new profile. Use an optimized build of the commit you map; steps whose function the optimizer inlined are marked as not visible, not as failed. Voice is not driven: it would open the real microphone and stream audio to OpenAI.

Herdr Core is traced with strace instead of a debugger, because its release build has no symbols. `herdr-drive.sh` runs one scripted session in an isolated Herdr session: a clean environment, `HC_SESSION=atlas`, and private runtime, state, config and home folders under the run folder. A runtime folder other than `/run/user/<uid>` makes Herdr start its Core directly, so it never registers a systemd service or turns on lingering; shims for `systemd-run`, `systemctl` and `loginctl` log any call and fail. The programs are small shell scripts, so no real agent runs. At the end it ends those programs, stops that Core and kills anything of the run still alive. `herdr_analyze.py` matches each step to the system call its effect needs (a frame on a socket, a pseudo-terminal read or write, a process start, a saved file), on the process and thread the step names, and redacts machine and personal identifiers.

```sh
./trace/herdr-drive.sh /var/tmp/hca-NAME /path/to/herdr-core   # short path: socket paths are limited to 108 bytes
python3 trace/herdr_analyze.py /var/tmp/hca-NAME --id DATE-NAME --layer apps/herdr-core/layer --out apps/herdr-core/runs/DATE-NAME.json [--plain text] [--finding pathway=text]
```

## Limits

- Function-level links come only from traced pathways; there is no call graph.
- Pathways were traced by reading source. Voyager runs confirm which in-app functions ran and on which thread; script, Core and outside-program steps cannot be seen by the debugger. Herdr runs confirm steps whose effect leaves their process; steps that stay inside one process cannot be seen.
- Module links are a lower bound (see the architecture-map README).
- Feature assignment and every reason are judgements; `inferred: true` marks reasons not stated in code or docs.

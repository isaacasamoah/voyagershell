# architecture/v1

One YAML format for an application's architecture, whether it was read from code or written from a specification, and for the comparison between the two. The atlas page is rendered from these documents alone, so any tool that writes them can be viewed with `atlas.cjs render`.

`architecture-v1.schema.json` checks the shape. This page explains the meaning.

## Three kinds of document

| `kind` | Written by | Says |
| --- | --- | --- |
| `code` | A code reader (here: architecture-map facts plus the checked layer and runtime runs) | What the code at one commit contains and does. |
| `intended` | A spec reader or a design (here: `layer/proposed.yaml`) | What the architecture should be. |
| `comparison` | `compareDocuments(intended, code)` | Where the code matches, misses or breaks the intended design. |

Every document starts with `schema: architecture/v1`, its `kind` and a `source` saying where it came from (commit, spec path and hash, or producer).

## Parts

`parts` is one flat list. Each part has an `id`, a `level` and a `parent` (the id of the part one level up, or null for a concept).

| Level | Means | Example |
| --- | --- | --- |
| `concept` | A piece of the system a person would name | Desktop UI, Herdr Core |
| `container` | A crate, package, library or outside program | voyager-desktop |
| `feature` | One feature's slice of a container | Terminals in voyager-desktop |
| `module` | A file or module, or an outside stand-in | `rs:voyager_app::client` |
| `function` | A function a pathway or description names | `Pane::key` |

Optional fields explain a part: `name`, `plain` (one sentence), `holds`, `entry` and `key` (functions with anchors), `why` with `inferred`, `size`.

Intended parts may also carry:

- `status`: what the design does to it: `new`, `changed`, `split`, `merged`, `moved` or `unchanged`.
- `binds`: code ids this part expects to be, in its own place. A kept module binds to itself.
- `primary`: code ids whose code becomes this part (rename, merge, move).
- `from`: all code ids that contribute, including parts of larger files.

## Links

`links` are module-level connections: `from`, `to`, `category` (`code`, `runtime`, `build` or `proposed`), `kinds`, `count`, and optional `evidence` (source lines), `hops` (pathway steps), `interfaces` (interface ids) and `nature` (plain words, for intended links). Views roll links up to any level by following `parent`.

## Interfaces

An interface is a named way two parts talk: `id`, `name`, `from`, `to`, `mechanism` (`call`, `channel`, `core-rpc`, `core-stream`, `script-call`, `ipc`, `process`, `file`, `render`, `build`), `nature`, `request` and `response` (each with `plain`, `shape` and `type_at`), `errors`, `limits`, `why`, `at` and `steps`. An intended interface may name the code interface it `replaces`.

## Pathways, rules and evidence

- `pathways`: ordered `steps`, each with `module`, `fn`, `runs_on`, `via`, `says` and an anchor. A step may carry `observed` from a traced run.
- `rules` (intended): `from` and `to` id prefixes with `except_from` and `except_to`. A code link whose ends match a rule breaks it.
- `anchors` (code): every source reference resolved at the commit, with its line, excerpt, fingerprint and `status` (`current`, `changed`, `missing`, `ambiguous`).

## Comparison

The comparison matches parts by `binds` and `primary`, never by name.

| Status | Means |
| --- | --- |
| `matched` | The intended part's code exists in the intended place. |
| `changed` | It exists in the intended place, but the design changes it. |
| `moved` | Its code exists today, but elsewhere: it must be renamed, merged, split or moved. |
| `missing` | No code exists for it yet. |
| `unplanned` | Code that no intended part binds or takes over. |

`homes` maps each code module to the intended part that will hold it. `today` redraws every code link onto the intended parts through `homes` and marks those that break a rule. `links` marks each intended link `matched` or `missing`. `interfaces` compares each intended interface with the one it replaces by the type and field names in their shapes, listing `added` and `removed`. `stale` lists code claims whose source changed since review.

## Producing a document

- From code: run the extractor at a commit, add meaning in an anchored layer, attach runs, then `atlas.cjs build`. It writes `out/architecture.code.yaml`.
- From a design or spec: write parts, links, interfaces and rules in the same format, citing spec lines in place of code anchors, and use `binds`, `primary` and `from` to say which code each part expects or absorbs.
- Compare and view: `atlas.cjs compare --intended I --code C` and `atlas.cjs render --code C --intended I`.

## Writing the YAML

The documents use the strict YAML subset read by `../architecture-map/yaml.cjs`. Write numbers as whole numbers (milliseconds, not fractional seconds): the reader keeps anything else as text.

## Changing the format

Within v1, add optional fields only. Renaming or removing a field, or changing what a status means, needs v2 and a converter.

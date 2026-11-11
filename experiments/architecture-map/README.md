# Architecture map

Generates VoyagerShell's architecture as YAML from a Git commit, compares it with YAML derived from the specifications, diffs it across merged pull requests, and renders one inspectable graph page. The draft `architecture-map` skill in agent-skills owns the judgment steps; this folder owns the facts.

## Run

```sh
node experiments/architecture-map/map.cjs build \
  --intended experiments/architecture-map/local/intended.yaml \
  --annotations experiments/architecture-map/local/annotations.yaml
```

Open `experiments/architecture-map/out/graph.html`. Without `--intended`, the page shows the code and history views only.

| Command | Result |
| --- | --- |
| `observe [--rev REV] [--out FILE]` | Code architecture YAML for one commit. |
| `compare --intended FILE [--annotations FILE] [--rev REV]` | Proposed-versus-code comparison YAML. |
| `diff --from REV [--to REV]` | Architecture change and generated walkthrough between two commits. |
| `evidence [--rev REV] PATH:LINE...` | Source lines and the fingerprint a recorded decision must carry. |
| `build [--rev REV] [--history REV] [--out DIR]` | All YAML files plus `graph.html`. |

Tests: `node --test experiments/architecture-map/map-test.cjs`.

## Files

| File | Written by | Contents |
| --- | --- | --- |
| `out/observed.yaml` | Script | Nodes, relationships, evidence lines, unresolved items and trigger-token coverage for one commit. |
| `out/specs.yaml` | Script | Sections of tracked docs and spec files that name a node by path or identifier. |
| `out/history.yaml` | Script | Architecture diffs between first-parent merges since `config.json` `history.from`, with generated walkthrough steps. |
| `out/comparison.yaml` | Script | Each proposed component, relationship and rule checked against the code. |
| `local/intended.yaml` | Skill | Proposed architecture from the specs. Every item cites a spec line. |
| `local/annotations.yaml` | Skill | Recorded judgments: resolved runtime values, answers to judged rules, notes and change summaries. |

`out/` and `local/` are ignored by Git. The specifications they quote are untracked worktree documents, so the decision store stays local until a home for it is chosen.

## Extraction

The script reads only Git objects: it extracts the commit with `git archive` into a temporary directory and records every cited file's blob ID. The same commit, rules and tool versions produce byte-identical YAML. Output is sorted and has no timestamps.

- **Crates, binaries and dependencies** come from `cargo metadata --no-deps --offline --locked` (basis `declared`).
- **Rust modules** come from `mod` declarations, following `#[path]` and inline modules. Items under `#[cfg(test)]` or `#[test]` are excluded and counted.
- **Rust relationships** come from paths that start with `crate`, `self`, `super`, a child module, a workspace crate or a declared dependency (`uses`, `uses_crate`), and from trigger tokens: `Command::new`, `HostModule::new`, `ComponentRegistry::new`, `include_str!`, `include_bytes!`, `import_types!`, `env::var`, `profile.join` and the struct literals listed in `config.json`.
- **TypeScript imports** are resolved with the TypeScript compiler and `desktop/tsconfig.json`, so `rootDirs` imports resolve as they do in type checking. Bare specifiers resolve to the script modules that Rust registers or that `desktop/script-types.json` lists.
- **Generators** come from `package.json` scripts. Their outputs are declared in `config.json`.

Every trigger token found outside comments becomes a fact, a test-only use or an unresolved item with its reason, and `coverage` counts each outcome. Nothing is dropped silently. Identities are a kind prefix plus a natural key, and relationship identities are `kind(from,to)`, so line moves do not change them.

## Comparison

A proposed component is found when its `binds` selectors match code nodes. A proposed relationship is found when a chain of at most two code relationships of a compatible kind connects the bound code. The chain is reported, so a reader can judge it. Rule checks are `forbid_edge`, `require_edge`, `forbid_reach` (through `Cargo.lock`, which includes dev-dependencies) and `judged`. A judged rule takes its answer from `annotations.yaml` only while the fingerprint of the cited source lines still matches; otherwise it reports `stale`. The comparison also lists code nodes and component relationships that no specification covers, and checks every spec citation against its source line.

## Limits

- Rust is read with a lexer and patterns, not the compiler. `uses` is a lower bound: aliases, glob imports, macros and trait dispatch are missed.
- Conditions other than tests, such as `cfg(feature = ...)`, are recorded but not evaluated.
- A program chosen at runtime stays unresolved until a recorded decision names it.
- The history starts at the first merge with the Cargo workspace (`a949a7b`).

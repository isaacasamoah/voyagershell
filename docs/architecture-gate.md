# The architecture gate

`npm run architecture:check` reads the working tree and fails when a rule in `tests/architecture/rules.yaml` is broken and not recorded. It needs the packages from `npm ci` and Node.js 24. It takes a few seconds.

## Read the result

The first line counts rules, violations and recorded violations. Each line after it starts with a label.

- `NEW` is a violation that `tests/architecture/known-violations.yaml` does not record. Fix the code, or record it with an owner and a reason.
- `STALE` is a recorded entry whose violation is gone, or whose size limit is now higher than the real size. Remove the entry or lower its limit.
- The last line is `PASS` or `FAIL`. The exit code is 0 on `PASS` and 1 on `FAIL`.

A missing or invalid input, such as an unreadable rules file or a rule without a required field, prints one `architecture gate:` line that names the problem and exits with code 2.

## Rule kinds

Every rule has an `id` and a `check`. The `id` starts each report line, so a recorded entry is `<rule id>: <what was found>`.

| Check                         | Fails when                                                         |
| ----------------------------- | ------------------------------------------------------------------ |
| `forbid_code`                 | An edge from a `from` node to a `to` node outside `except` exists. |
| `forbid_unresolved`           | The observer could not resolve an include.                         |
| `forbid_reach`                | A crate reaches a forbidden crate through `Cargo.lock`.            |
| `acyclic`                     | Modules or scripts use each other in a loop.                       |
| `max_lines`                   | A file is longer than `limit`.                                     |
| `forbid_terms`                | A retired word from `vocabulary.yaml` appears.                     |
| `forbid_text`                 | A `pattern` matches the code of a file under `roots`.              |
| `forbid_literal`              | A listed string literal appears outside its owner file.            |
| `one_owner`, `intended_edges` | A file has no single owner, or a cross-owner edge is not intended. |

## Module cycles

`acyclic` takes an edge `kind`. Kind `uses` checks Rust modules and kind `imports` checks scripts.

By default a Rust module counts as its top module, which is its crate and the first module name. A parent and its own child collapse into one unit, so a loop between them is invisible.

Set `children: true` on a `uses` rule to check that case. The rule fails for a module `P` and a direct child `C` when `P` uses `C` or a module inside `C`, and `C` or a module inside it uses `P`. The report line is `<rule id>: P <-> C`. A child that only uses its parent passes, and so does a parent that only uses its child. A crate root is never a `P`. Sibling loops belong to the default rule. The `children` option is refused for kind `imports`, which has no parents.

The pull request "Adapt the Core connection behind one typed seam" (#151) had this loop at its head. `client` declared `core_calls` and used it, and `core_calls` used items of `client`.

## One home for a literal

`forbid_literal` keeps a vocabulary string in one file. Each rule lists these fields.

- `literals` is the list of exact string contents to find, such as a type id.
- `owner` is the one file allowed to hold them.
- `roots` and `exclude` are path patterns that bound the files checked. `*` matches within one folder and `**` matches across folders, so `app/src/**` covers nested modules.
- `tests` is required, and is `skip` or `scan`.

The rule checks Rust files only. It reads string literals after comments are removed, so a literal in a comment, or a longer string that contains a listed literal, does not count. A string written with escapes is not found.

Test scope is explicit. With `tests: skip`, the rule ignores a file named `tests.rs`, `*_test.rs`, `*_tests.rs` or under a `tests/` folder, and any code under `#[cfg(test)]` or `#[test]` in other files. With `tests: scan`, test code counts like any other code. A rule without `tests` is refused.

A violation is `<rule id>: "<literal>" in <file>` with the number of occurrences. A recorded entry carries a numeric `limit`. The count may fall, and a lower count asks for a lower limit. A higher count fails.

## Families

A family is one module under `app/src/families/`. It keeps its internals private and offers a few `pub(crate)` entry points in its own file. A submodule is private, and the family file re-exports what callers need, so a caller writes `families::terminal::exited` and not `families::terminal::lifecycle::exited`. Rust stops a sibling from naming a private function, field or submodule. It cannot stop a sibling from calling an entry point, because visibility can only name an ancestor module and every sibling is inside `families`. Of the 21 plants in `families-test.cjs`, the compiler stops one, the call through the private `lifecycle` module. The gate stops the others.

| Rule | Fails when |
| ---- | ---------- |
| `families-stay-apart` | A family uses another family, or uses or is used by the `families` root. |
| `families-not-aliased` | The crate root uses any `families` module, such as `pub(crate) use families::terminal as process;` in `lib.rs`. |
| `families-reach-shared-only` | A family uses a module outside `families` and the shared modules in the rule's `except` list, such as an alias in `client.rs`. |
| `families-no-widened-visibility` | A file under `app/src/families/` writes `pub(super)` or `pub(in`. `pub(super)` in a family file is visible to every sibling and the compiler does not warn. |

`except` on `forbid_code` lists nodes that do not count as a `to`. Each shared module needs two entries, `X` and `X::*`, because a wildcard such as `core*` would also match `core_reader` and `core_endpoint`. Add a module to the list only when two families must own a type, and then put the type in that shared module, never in `families.rs`.

`forbid_text` takes a `pattern` and `roots`. It reads code with comments removed and reports `<pattern match> in <file>` with the number of hits.

The rules read edges that the observer sees. These forms stay invisible to them, and the compiler accepts all of them.

- a3 is `use crate as c;` followed by `c::families::terminal::..`.
- a4 is `self::super::terminal::..`.
- m2 is a macro in a family, which expands at the caller. A macro marked `#[macro_export]` in a family reaches the entry points through the crate root, and no rule sees that edge.
- c2 is code under `#[cfg(any(test, debug_assertions))]` that calls another family.

A crate per family would make a sibling call a Cargo error. It was declined, so these residuals stay.

## Record a violation

Add an entry under `known:` in `tests/architecture/known-violations.yaml` with the exact `id`, an `owner` and a `reason`. A size or literal entry also needs a numeric `limit`. A recorded entry is a debt. Adding one is a change the owner reviews.

## Report a range

`npm run architecture:delta -- <base> <head>` compares what the extractor observes at two revisions and prints what changed. It only reports. It exits 0 on any valid range and reads none of the rules. It needs the packages from `npm ci` and Node.js 24, and takes about a second.

```
npm run architecture:delta -- da16b3f 3c1e70e
npm run architecture:delta -- da16b3f 3c1e70e --format table
```

Both revisions are read with the extractor and configuration of the working tree, so a difference is never caused by a changed extractor. A revision is anything Git resolves to a tree, such as a commit, a branch or a tag. Use `--repository <path>` for another checkout. `--format` is `table`, `json` or `both`, and `both` is the default. The JSON output has schema `architecture-delta/v0` and sorts every list, so two runs on one input print the same bytes.

The table has these parts. A part with no change is left out.

- `Edges` lists each added (`+`) and removed (`-`) edge as `from -> to (kind)`. An edge changes only when its endpoints or kind change, not when its evidence moves.
- `Fan-in and fan-out` gives each touched module its added and removed users, which are the modules with an edge to it, and its added and removed dependencies, which are the modules it has an edge to. The JSON `modules` list names them.
- `Host functions` lists each function added to or removed from a script host module, as `module.function`. A new host module adds all its functions.
- `Agent tools` lists added and removed agent tools.
- `Offered operations` lists added and removed `offers` and `exposes` edges, which are the places where code offers a tool or a host module to a caller. Operations in the typed application contract are not observed, so "offered operations" means only those two edge kinds.

Revisions that observe the same facts, such as equal revisions or a commit that changes only prose, print `no structural change` and exit 0.

A missing or unknown input prints one `architecture delta:` line that names it, followed by the usage line, and exits with code 2. Missing inputs are a missing base or head, an unknown revision, a path that is not a git repository, an unknown option and an unknown format.

## Test the gate

`tests/architecture/gate-test.cjs` copies the checkout, plants a failure, and runs the gate on the copy. Each rule has a test that plants its mistake and expects the `NEW` line, and a test that removes the mistake and expects `PASS`. Run it with `node --test tests/architecture/gate-test.cjs`.

`tests/architecture/delta-test.cjs` covers the report. Its unit tests give `compare` hand-built facts and check an added edge, a removed edge, an added host function, an agent tool and an offered operation. Its command tests commit two revisions of a small crate and run the command on them, so they do not need the repository history. Run it with `node --test tests/architecture/delta-test.cjs`.

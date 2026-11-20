# Entry classes

The validator already proves that every link resolves, that a `type_gap`, `gap` or `owner` is present when required, and that the ratchets hold. Judge what it cannot, which is whether the words are true, whether the guard bites and whether the check can fail. Each class below names the reading to do and the evidence that closes it.

## A. User entry with journey checks

Most `kind = "user"` entries with `journey:` links.

- **Wording.** Read `says` and `source`. Read the owning guide in `docs/` the `features` ids point at, and the code the feature's source globs in `tests/native/features.toml` name. A clause the journeys never exercise is a gap in the check, and a clause the code contradicts is a wording mismatch.
- **Check.** Open each linked case in `tests/native/src/journey/<journey>.rs`. Confirm that its assertions read the observable effect the rule names, and not a proxy such as a label or a count. Read the journey's `CONTROL` case and its patch in `tests/native/controls/<journey>.patch`. Say which linked cases the control proves can fail. List the others as unproved to fail.
- **Control join.** Run `voyager-verification journeys`. It prints JSON with each journey's `control.case` and `control.patch`. Join `control.case` with the entry's `journey:` links. When no linked case is the control's case, no linked case is proved to fail, and the entry says so in its report line. When one is, read the patch hunk and say which clause of `says` it breaks. A patch that breaks reattach logic does not prove that placement survives a relaunch.
- **Gap text.** When the entry carries a `gap` that names a missing case, confirm that no linked case now covers it, and that the unit it names has not landed.
- **Closes with.** The case file and line, the control patch line, and a one-line reading of what breaks when the patch applies.

## B. Entry checked by a test, a type or a formal property

`test:`, `type:` and `formal` links.

- **Test.** Read the function. A test that pins a data shape and not the behavior in `says` is a partial check. Say what it leaves out.
- **Type guard.** Read the item. Confirm that the type makes the undesired state in `says` unrepresentable, not only named. Compare with the `type_gap` text. Grep for the field or shape it says is still representable, and report a `type_gap` that describes a shape the code no longer has.
- **Formal.** Read the property in the INVARIANTS block of the `.cfg` and the `sync` record in `tests/formal/<model>/`. A model that no longer matches the covered code is the `core-viewers` skill's work. Report it and point there.
- **Sync record.** For a model with a sync commit, run `git diff --stat <sync> -- <covered files>` and read how the sync line is parsed by the model's `check.sh`. A sync line the script cannot parse is a mismatch in the guard, because the drift check cannot compare.
- **Closes with.** The item's file and line, and the grep that confirms or refutes the `type_gap`.

## C. Entry with no check, a gap or a future unit

Entries with `check = []` and a `gap`.

- Confirm that the unit the `gap` names is still planned, or that it has landed. Search `git log origin/main` and the journey list for the unit and for the case it says it will add. A landed unit with a stale `gap` is a mismatch, and the proposal links the new case.
- Confirm that `says` still states the intended experience. These entries are the easiest to leave stale, because no check pins them.
- Search the orphan list in `declared-invariants-ratchets.toml` for a case or guard that serves the entry. Cite the lines of the case that make it fit.
- Do not propose a check. Propose only that a landed case be linked, or that an obsolete `gap` be rewritten.
- **Closes with.** The `git log` or `git grep` command and its output.

## D. Manual check

A `manual:` link.

- Confirm that the named person or method is still possible, and that `says` is an experience that can be confirmed that way. Do not propose to automate it unless a real mechanism exists.

## E. Developer entry guarded by a hook or a policy

`hook:` and `policy:` guards, `kind = "developer"`.

- **Hook.** Read the hook script, and its tests when they exist. Confirm that it blocks the action `says` names, and name the action it does not block. A guard that holds part of the rule is a partial guard.
- **Policy.** The rules live in the Workshop's `review-policy`. Read the rule from this repository's copy of its id list in the validator, and confirm that the id still matches. Do not edit the Workshop. Report a renamed rule so that its owner renames the id.
- **Probe.** Call the hook's check function with a planted command for each way the entry can break, and with a compound command that starts with an allowed word such as `git`. A guard that returns nothing for a command that breaks the rule is a mismatch, reported and not patched.
- **Closes with.** The script line that blocks the action, the planted command and its result, or the id comparison.

## F. Structure entry guarded by a gate or a lint

`gate:` and `lint:` guards, `kind = "structure"`.

- **Gate.** Read the rule in `tests/architecture/rules.yaml` and the gate code that evaluates it. Confirm that it enforces what `says` states, at the scope `says` implies. Check the `known-violations.yaml` entries that excuse it. Every exception needs its unit, and the limit only falls.
- **Lint.** Read the scope of the lint script. A scope narrower than `says` is a partial guard, as the existing `source-is-comment-free` gap already records for `content/`.
- **Check field.** These entries have an empty `check` because the gate is its own check. Confirm that `npm run architecture:check` passes and that its fixture tests in `tests/architecture/*-test.cjs` still fail a planted violation. Name the test.
- **Closes with.** The rule id and the test that fails when it is broken.

## G. Entry with a `confidence` of `inferred`

Re-read the `source`. An inferred entry that Isaac has since stated in a decision, an `AGENTS.md` line or a design note can raise to `stated`. Report this as a proposal for Isaac. Never change a confidence value without his word.

## H. Envelope and out-of-scope entries

- **Envelope.** `measured` stays empty until a real measurement exists. Confirm that the `command` still runs or still says "no command yet", and that the `expires` clause has not fired. Report an entry whose named code path has changed since its last measurement.
- **Out of scope.** Each entry cites a `git grep` or a code owner. Re-run the grep on main. A different result moves the state into scope, and `revisit_when` names the trigger. Report the changed result and the commit that changed it.

## Cost control

- Group entries by journey, guard file and gate. Read a journey module once.
- Read a control patch once per journey.
- Entries of class C cost only a grep and a `says` re-read. Do them last.
- Split the pass by `kind` when the context fills, as `SKILL.md` says.

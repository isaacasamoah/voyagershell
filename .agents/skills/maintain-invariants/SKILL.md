---
name: maintain-invariants
description: This skill should be used when the user asks to "maintain the invariants", "audit the declared invariants", "check the declared invariants against the code", "are the declared invariants still true", or "calibrate the invariants", or after a large merge that touched guards, checks, journeys or architecture gates. It reads each entry of tests/native/declared-invariants.toml against the code on main and reports every entry whose wording, guard or check no longer matches, with a proposed correction. It proposes and never edits the list.
---

# Maintain the declared invariants

`tests/native/declared-invariants.toml` is the one list of rules the app keeps. Code moves, and an entry whose wording, `guard` or `check` drifts from the code misleads every reader and every verifier who cites it. This pass finds the drift. The aim is that the list describes the experience Isaac intends for users and developers, that good code is easy to write, and that each entry points at a guard that holds it and a check that would fail if it broke.

Read `tests/native/README.md` ("Declared invariants" and "Feature registry"), `AGENTS.md` and `docs/glossary.md` first. Read the Workshop crew playbook's "Updating invariants" section when it is reachable. Use "declared invariants" in all output.

## Outcomes

State one:

- **clean.** Every entry was read against its evidence and none mismatches. The report still names the evidence for each entry class.
- **mismatches.** One or more entries need a correction. List them, each with a proposal.
- **blocked.** The pass could not finish. Name the entry, the missing prerequisite and the step that failed.

## Edit scope

Edit nothing in `declared-invariants.toml`, `declared-invariants-ratchets.toml`, the validator, any guard or check, or the Workshop. Every change to the list goes to Isaac. A removal, a reworded meaning or a dropped check escalates, and a pure addition that cites a passing check merges on an independent verdict. Write the proposals as text in the report or the PR body, and let the owner of the next change draft the edit PR. Report a defect in product code as a product finding with its entry id, and do not fix it here.

## Pass

Run the stages in order. Hold the stage 1 output as the baseline, and do not re-prove what it already proves.

1. **Mechanical baseline.** Run these through the project's heavy wrapper, one at a time, when the machine is shared.
   - `cargo test --manifest-path tests/native/Cargo.toml --locked committed_model_passes` for link resolution, type gaps, gaps, ratchets and ownership.
   - `voyager-verification features` for the coverage and status counts, and `features --check` for the generated tables.
   - `npm run architecture:check`, `npm run vocabulary:check` and `npm run prose:check`.
   - `cargo test --manifest-path tests/native/Cargo.toml --locked every_control_patch_still_applies`.

   A failure here is a finding already, with its own fix line. Record it and continue.

2. **Group before reading.** Build three indexes from the file with grep, not by hand. Index entries by journey, entries by guard file or gate id, and entries by `kind`. Read each journey module, control patch, guard file and gate once, and reuse the reading for every entry that links it. One `portals` journey read serves every entry that links a `portals` case.

3. **Judge each entry.** Apply the three questions below. `references/entry-classes.md` says how to answer them for each class of entry and what evidence closes each.
   - **Wording.** Does `says` still describe what the code does and what the agreed experience is? Compare it with the entry's `source`, `AGENTS.md`, the glossary and the code path its `features` name. A retired glossary word, or a clause the code no longer keeps, is a mismatch.
   - **Guard.** Does each `guard` link exist, and does it stop the break in the `says` text? A guard that exists but constrains only part of the rule is a partial guard. Say which part.
   - **Check.** Does each `check` link exist, and would it fail if the rule broke? Read the case's assertions. Read the journey's `CONTROL` case and control patch. One control proves only the case it names, and the other cases of that journey are unproved to fail until read.

4. **Ratchet candidates.** List the entries with an empty `check` and the guards or checks that no entry names. The ratchets already count both, and the counts only fall. Report a candidate when a check now exists that the entry could link, or when an orphan guard serves no entry and the code it guards is gone. Do not propose a number of days or any other limit without evidence that it helps a user or developer.

5. **Gap and out-of-scope upkeep.** For each `gap`, `type_gap`, `[[envelope]]` and `[[out_of_scope]]` entry, confirm that the unit or fact it names still holds. Re-run the `git grep` an `out_of_scope` entry cites and compare the result. Re-read an `[[envelope]]` `expires` clause against the change it names.

6. **Report.** Write the report as `references/report.md` describes. Put every proposal in front of Isaac as text. Keep the scratch notes out of Git.

## Sizing

The first pass over 58 entries fit one Sonnet session by following stage 2, with the entries grouped into the classes in `references/entry-classes.md`. It read each journey's control once and each guard file once. Split by `kind` when the context fills past about half. Run `user` first, then `developer` and `structure`, then the envelope and out-of-scope tail. Each split keeps stage 1 as its baseline and reports its own entries. Start at most one read-only subagent, on Sonnet, for one kind, and give it the file pointers and this skill, never a conclusion.

## Rules

- Cite evidence for every claim, as a file and line or a command and its output. Label each claim observed, inferred or unproved.
- A mismatch needs a concrete reading of both sides. A suspicion is a note.
- When code and wording disagree, propose both directions, the wording to match the code and the code to match the wording, and name Isaac as the one who decides. Never pick the direction.
- A finding that names no entry is a note, not a mismatch.
- Run no journey during this pass. Cite a verdict or a run the owner recorded, and mark a case as unproved to fail when only a source reading supports it.

## Additional Resources

- **`references/entry-classes.md`** is the classes of entry, how to judge each, and what evidence closes it.
- **`references/report.md`** is the report format.
- **`.agents/skills/verify/SKILL.md`** and its `features/` folder hold the feature map and journey recipes. Read them, and do not rebuild them. Use `maintain-verification-skill` for the map's upkeep.

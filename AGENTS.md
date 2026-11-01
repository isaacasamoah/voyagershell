# Working on VoyagerShell

Read CONSTRAINTS.md and CONTRIBUTING.md before changing code. Do not weaken the written checks or acceptance criteria.

VoyagerShell is a configurable workspace built on Herdr Core. Herdr Core owns terminals, screens and processes. Voyager owns workspace presentation, explicit context and its application policy. Do not introduce a second process supervisor or recreate native agent session recovery.

- Inspect the branch and dirty state before editing. Preserve unrelated work and running sessions.
- Work in small, complete, user-visible increments. Verify the intended interaction and one relevant failure.
- Keep authority, avatar focus, placement, content state, process identity and derived knowledge distinct.
- A received request is not a completed effect. Never automatically replay an uncertain operation or restore an uncertain process.
- Keep changed source comment-free. Put mechanisms and invariants in the owning technical document.
- Prefer explicit types and a small number of modules. Add a dependency only for a primitive required now.
- Keep runtime profiles, transcripts, credentials, private task documents and evidence out of Git.
- Preserve the selected vocabulary: Voyage is a space, Fleet is a tab, Vessel places content in a Fleet, and Portal places content across a Voyage. Legacy storage/API names remain until deliberately migrated.
- Electron is the current working renderer. GPUI remains an experiment until equivalent UX and increasing-load performance are demonstrated.
- Use Rust best practices for Rust changes and Rust review alongside general review. Preserve the project's toolchain and lint rules.

Use feature/<name> or experiment/<name> branches with matching .worktrees/feature-<name> or .worktrees/experiment-<name> paths. Existing imported branch names remain valid. Use a native GitHub PR stack for dependent increments. Never use an admin bypass or merge without the owner's applicable approval.

Each task worktree owns local SPEC.md, module specs, tasks/plan.md and tasks/todo.md. Exclude their exact paths through the common Git info/exclude. Do not commit or overwrite unfinished task records. Preserve them under the established Obsidian spec-history convention only after accepted completion and merge.

Use the existing maintained prove.py fixture. Tests, helpers, oneoffs and embedded programs all count under CONSTRAINTS.md. A source or unit check does not establish native behavior. Keep observed, inferred, proposed and unproved claims separate.

The original demos and research records remain in voyagershellapp. Do not modify their sources, profiles or processes during work here. Human-facing documentation currently stays in the existing /home/isaac/obsidian/Projects/voyagershellapp project and its single collaboration walkthrough until Isaac chooses a documentation move. Do not create a second copy of that guide.

## Learn from Herdr first

Before designing runtime integration, extension APIs, agent guides, repository checks or release procedures, inspect the corresponding Herdr Core and Herdr App implementation and guidance. Start with their AGENTS.md, user-facing agent guides, schemas, tests and release recipes. Pin the inspected revisions when recording a decision.

Keep Herdr Core's runtime boundary and one generated API. Learn from the app's small core, extensible interface, last-good live edits, compatibility checks and isolated proving. Record what we adopt and why, and where Voyager's intended UX requires a different choice. Upstream maintainers' approval rules, formatting and release machinery remain specific to their repositories; Isaac owns decisions here. Preserve this project's constraints and avoid copying upstream implementation as a shortcut.

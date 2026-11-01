# Working on VoyagerShell

Read CONSTRAINTS.md and CONTRIBUTING.md before changing code. Do not weaken the written checks or acceptance criteria.

VoyagerShell is a configurable workspace built on Herdr Core. Herdr Core owns terminals, screens and processes. Voyager owns workspace presentation, explicit context and its application policy. Do not introduce a second process supervisor or recreate native agent session recovery.

This is an application for extensible content, not only a terminal manager. A terminal or coding agent is one content type. A content package may instead provide a document, graph, dashboard, game or another supported view, with an optional backend run by Core. Starting a program does not establish that its interface can be embedded or understood by an agent.

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

## Application ownership and context

The retained Electron reference in `experiments/electron-reference/` composes the application in `main.cjs`. The following legacy owner filenames are relative to that folder. `workspace.cjs` owns placement and avatar context; `portal-library.cjs` owns package files and instance data; `portal-host.cjs` checks content calls; `core.cjs` connects to external Herdr Core. Read these owners and the selected task specification before moving a boundary. The proposed Rust application and native renderer are not current file locations or accepted replacements.

A Voyage is a space containing Fleets. A Fleet is a tab containing Vessel placements. A Portal is a persistent placement across a Voyage. One content type and instance interface should serve both placements. Keep content identity, placement and any backend terminal address separate. True Voyage-wide Portals remain proposed; legacy `realm`, `dimension` and `portal` storage/API names do not prove that behavior exists.

The avatar represents its user's authority while its dock selects context. Workspace, Voyage, Fleet, Vessel and Portal context must remain explicit and separate from keyboard focus, visual selection and delegated assignment. Fleet membership and Core parentage do not grant instruction rights. Do not claim the prototype enforces delegated ranks where it does not.

Use one typed application contract for UI, content and agent callers as each capability migrates. Generate client definitions and runtime validators from the owning types; do not hand-maintain competing schemas. Bind callers outside request payloads and keep state checks at the effect owner. Preserve request/target identity, structured Core errors and the difference between known refusal and uncertain effect. The existing typed-content draft remains unaccepted until its Required findings and real journey pass.

## Content and provider boundaries

Make content types clear to agents. Describe supported renderers, per-instance configuration and state, named actions, expected revisions and lifecycle. Provide concise agent instructions and generated operation details. Inspect the same state and invoke the same actions through the application owner from a view or an authorized agent. A schema describes data; it does not grant authority.

Preserve live authoring and reversible uninstall. A valid edit updates the existing instance; a broken edit must expose its error and retain the usable version where supported. Hiding, moving, switching Fleets or uninstalling a view must not stop its backend. Explicit stop targets only the verified selected Core program. Keep personal source edits and instance data when considering updates. Shipped packages currently seed once; an update or migration policy must be selected and proved rather than assumed.

The reference private conversation in `experiments/electron-reference/companion.cjs` is separate from terminal agents and content instances. Its provider adapter handles native conversation and available voice capabilities. Application code owns scope, tools and policy. Keep user-visible conversation/results separate from private reasoning, credentials and account/audio-session data. Do not block application actions on provider work.

Voyager's private administrator inspects, arranges, delegates and verifies. Working Vessels make project code, prose, configuration, skill and extension-source changes. Ordinary application actions and structured content-data updates remain administrator operations. Useful provider-native inspection complements the existing workspace/process/content tools; the exact native tool/write profile remains a design decision. Automatic per-Vessel conversation/transcript discovery is deferred. Current support is Codex-specific; additional providers and capability-driven voice controls require real integration proof.

## User experience and proportionate safeguards

Establish the intended user-visible behavior before designing recovery or protection. Preserve Isaac's explicit placement, supported options and agreed interactions. Do not add prompts, fallback movement, reduced capabilities or recovery machinery for a speculative concern. Ask a focused question only when a consequential interaction remains unspecified; do not re-ask settled choices.

Explain concrete risks reachable through supported user, content, client, provider or process actions. Distinguish an observed failure, a reachable risk and a speculative contingency. Use the smallest sufficient safeguard that preserves the agreed workflow, and assess its UX cost. Verify the intended interaction and the relevant failure rather than expanding the design to cover every imagined case.

Detaching or hiding a view must not stop its backend. Explicit stop must target only the verified selected program. Preserve authority checks and honest uncertain outcomes without automatic replay or restoration. If a concrete fix requires changing an agreed interaction, explain that scenario to Isaac before making the choice.

Use feature/<name> or experiment/<name> branches with matching .worktrees/feature-<name> or .worktrees/experiment-<name> paths. Existing imported branch names remain valid. Use a native GitHub PR stack for dependent increments. Never use an admin bypass or merge without the owner's applicable approval.

Each task worktree owns local SPEC.md, module specs, tasks/plan.md and tasks/todo.md. Exclude their exact paths through the common Git info/exclude. Do not commit or overwrite unfinished task records. Preserve them under the established Obsidian spec-history convention only after accepted completion and merge.

Keep exploratory source under `experiments/<name>/`. The selected product structure is `contract/`, `app/`, `desktop/` and `content/`; promote only selected implementation into those groups through the shared Git workflow. Preserve active work and runnable demos during cleanup.

For foundation specifications, plans, builds and reviews, read the selected initiative context and the [current/proposed architecture](/home/isaac/obsidian/Projects/voyagershellapp/explainer/walkthroughs/voyager-collaboration-tracer-bullet.html#architecture), including its common overview and the sections governing the assignment. The [original service architecture review](/home/isaac/obsidian/Projects/voyagershellapp/explainer/walkthroughs/service-restructure-review.html) supplies reference patterns for ownership, layers and contracts; it is not the current implementation. Carry these references into module briefs using the shared context-engineering skill.

Use the existing maintained prove.py fixture. Tests, helpers, oneoffs and embedded programs all count under CONSTRAINTS.md. A source or unit check does not establish native behavior. Keep observed, inferred, proposed and unproved claims separate.

Use the installed `rust-best-practices` wrapper for Rust implementation and `rust-review` alongside `code-review-and-quality` for Rust review. Keep source comment-free, including doc comments. Put invariants and unsafe reasoning in the owning technical document. Follow CONTRIBUTING.md for formatting, locked tests, strict Clippy and interface checks. Do not import upstream lint presets or dependencies merely because a skill lists them. Exercise the actual app journey and a relevant failure; Linux evidence does not establish another platform.

The original demos and research records remain in voyagershellapp. Do not modify their sources, profiles or processes during work here. Human-facing documentation currently stays in the existing /home/isaac/obsidian/Projects/voyagershellapp project and its single collaboration walkthrough until Isaac chooses a documentation move. Do not create a second copy of that guide.

## Learn from Herdr first

Before designing runtime integration, extension APIs, agent guides, repository checks or release procedures, inspect the corresponding Herdr Core and Herdr App implementation and guidance. Start with their AGENTS.md, user-facing agent guides, schemas, tests and release recipes. Pin the inspected revisions when recording a decision.

Keep Herdr Core's runtime boundary and one generated API. Learn from the app's small core, extensible interface, last-good live edits, compatibility checks and isolated proving. Record what we adopt and why, and where Voyager's intended UX requires a different choice. Upstream maintainers' approval rules, formatting and release machinery remain specific to their repositories; Isaac owns decisions here. Preserve this project's constraints and avoid copying upstream implementation as a shortcut.

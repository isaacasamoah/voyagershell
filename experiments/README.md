# Experiments and references

The product foundation uses contract/, app/, desktop/ and content/. Keep exploratory source in this folder and promote only selected implementation after review.

| Folder | Purpose | State |
| --- | --- | --- |
| electron-reference/ | Working Electron prototype retained for UX comparison and demos. | Preserved source; original running demos are untouched. |
| gpui-avatar/ | Original native avatar and corrected pose animation. | Partial proof, not accepted full parity. |
| native-content/ | Native header and persistent Notes work. | Header accepted; Notes correction approved, acceptance remains pending. |
| typed-content/ | Earlier typed contract/client work, including protocol and binding history. | Historical unaccepted draft. |
| architecture-map/ | Architecture YAML generated from code and specs, with diffs and an inspectable graph. | Prototype; outputs and spec-derived decisions stay local. |
| app-atlas/ | One map of the app from concepts to functions, with traced pathways, PR history and proposed changes. Uses architecture-map facts plus a checked hand-written layer. | Prototype; generated page stays local. |

sources.json pins snapshot revisions and hashes, including local source that was not committed in its original worktree. These are source snapshots, not copied private profiles or a claim of accepted behavior. Existing original branches/worktrees remain for unfinished tasks and exact historical evidence. Do not use their presence as a reason to re-run solved feasibility questions.

All examples share original artwork at ../desktop/assets. The one maintained prove.py stays at the repository root and requires an explicit --foundation, --reference, --native-mod-host or --native-avatar route. Its current shared native helpers and product journeys live in ../tests/native/. The legacy Notes journey stays beside its experiment and uses those selected shared helpers through --native-mod-host. Snapshot hashes describe the original preservation point, not a claim that promoted fixture paths remain here. Every route uses isolated sessions; do not start an owner's session for a cleanup check.

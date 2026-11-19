# Glossary

Generated from `tests/architecture/vocabulary.yaml` by `npm run vocabulary:generate`. Edit the table, then regenerate.

Each word has one meaning and one owning context. Use these words in code,
docs and UI. The [context map](context-map.md) lists the files each context owns.
Retired words fail `npm run vocabulary:check`.

| Word | Meaning | Owner | Retired words |
| --- | --- | --- | --- |
| Administrator | Voyager's private agent. It inspects, arranges, delegates and verifies through Operations. Working Vessels change project code. | Conversation and provider |  |
| Arrangement | A named, saved split tree of Placements. | Placement |  |
| Avatar | The Voyager assistant figure. It holds its user's authority, and docking it selects the Context. | Desktop presentation |  |
| Backend | The Core terminal that runs behind a Vessel. Hiding, moving or uninstalling the Vessel leaves it running. | Content |  |
| Canvas | The whole window surface and the script package in desktop/canvas that draws it. | Desktop presentation | `header package`, `header script`, `header mod` |
| Context | What the avatar acts on, which is the workspace, a Voyage, a Fleet, a Vessel or a Portal. Docking sets it. It stays separate from keyboard focus, visual selection and delegated assignment. | Placement |  |
| Control | A patch that breaks the app on purpose to show that a Journey fails. | Verification |  |
| Conversation | The private exchange between the user and the Administrator. It is separate from terminal agents and Vessels. | Conversation and provider |  |
| Core | Herdr Core, the external process that owns terminals, screens and processes. Voyager never supervises a process itself. | Core adapter |  |
| Core session | One named Core session. Stop session ends every program that Core started in it. | Core adapter |  |
| Core terminal | A terminal that Core runs, addressed by a CoreTerminalId. | Core adapter |  |
| Description | The catalogue entry that tells a caller the renderers, configuration, state, named actions and allowed Placements of a Vessel type. | Content |  |
| Dock | To place the Avatar on a Vessel, a Portal, a Fleet, a Voyage or Overwatch. It never moves keyboard focus. | Desktop presentation |  |
| Evidence | The raw bundle a run writes. It names whether the product, the Fixture or an unknown cause failed. | Verification |  |
| Fixture | The owned display, isolated Core, profile and cleanup that every Journey shares. | Verification |  |
| Fleet | A tab in a Voyage. It holds a split tree of Placements. | Placement |  |
| Journey | A Rust test in tests/native that drives the real app on an owned display and writes evidence. | Verification |  |
| Layout | The whole stored workspace document. It holds the Voyages, Fleets, Placements, Vessels, Arrangements, Context and Canvas regions. | Placement |  |
| Operation | A named request in the typed application contract. A view, a Vessel or an agent sends the same Operation. | Application queue and front door |  |
| Overwatch | The name users see for the workspace Context, which covers every Voyage. | Placement |  |
| Panel | The drawn frame of one Placement, with its title bar. It names a drawing, never a stored or wire object. | Desktop presentation |  |
| Placement | Where one Vessel sits, in a Fleet or as a Portal. It has a PlacementId, a Vessel, a name and a hidden flag. | Placement |  |
| Portal | A Placement that stays on screen across every Fleet of its Voyage. Its mode is overlay, which is the default, or make-room. | Placement |  |
| Profile | The user's data directory, passed as --profile. It holds canvas, vessels, data, themes and the avatar pack. | Desktop presentation |  |
| Program | What Core runs in a Core terminal, such as a shell or a coding agent. | Core adapter |  |
| Provider | The adapter that serves the Conversation model and any voice. Codex is the supported Provider. | Conversation and provider |  |
| Queue | The one ordered owner of application effects. A caller sends a request and the queue decides its outcome. | Application queue and front door |  |
| Refusal | A known outcome. The application declined the Operation and nothing changed. | Application queue and front door |  |
| Region | A node of the Canvas region tree, such as the sidebar, the Fleet strip, the active Fleet, the Portals or the context bar. | Placement |  |
| Uncertain effect | An outcome the application could not confirm. Its caller asks the provider and settles it, retries only what a read proves did not happen and never restores a process automatically. | Application queue and front door |  |
| Vessel | One piece of content with its own identity, configuration, state and revision, of one Vessel type. A Placement puts it on screen. | Content | `content instance`, `content id` |
| Vessel package | The source folder under vessels/ in the profile that provides one scripted Vessel type. Its manifest is vessel.json. | Content | `content package`, `mod` |
| Vessel type | The kind of a Vessel, keyed by type_id. The built-in types are terminal, notes and agents. | Content | `content type` |
| Voyage | A space for one project. It holds Fleets and a Portal column. | Placement | `realm` |

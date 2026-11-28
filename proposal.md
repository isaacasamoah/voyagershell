# Shared VoyagerShell agent instructions

Status: proposal for review. This PR adds documentation only. It does not install
instructions, change provider configuration, expose new tools or add an animation
player to main.

## Source and distribution

Maintain one provider-neutral [product guide](docs/agent-guide.md), with focused
[animation](docs/animation-authoring.md) and [content](docs/content-authoring.md)
authoring guides. Keep the repository's root AGENTS.md for contributors.

Ship build-matched, application-owned copies into the selected profile as
`agent-guide.md`, `animation-authoring.md` and `content-authoring.md`. Preserve a
pre-existing user-owned file during adoption. Keep personal preferences and
extension source separate from generated documentation. Updating a guide must
not overwrite a user's package.

Include the short common guide when an agent session starts. Load topic guides
and generated operation definitions when the task needs them. Report the build,
renderer and available capabilities with discovery results. Documentation must
not turn a proposed feature into an advertised working capability.

## Deliver the guide explicitly

| Consumer | Proposed delivery |
| --- | --- |
| Private assistant | Compose the common guide with the separate administrator policy at provider session creation. Read topics through native read tools or a typed read-only documentation operation. Preserve request-bound dock context and actual tool permissions. |
| Agent created through a Vessel picker | Supply a compact guide bootstrap through the selected provider's supported additional-instructions mechanism. Preserve existing user instructions and project rules. Keep launch and environment changes in the existing application/Core owner. |
| Agent manually started in a Vessel shell | Offer a user-enabled provider skill/plugin or a Voyager-aware launcher that points to the same guide. An inherited `VOYAGER_GUIDE_PATH` would be a discovery hint, not proof that the model read it. Plain agent launches remain ordinary launches until integration is enabled. |
| External agent | Offer the same versioned topics through the application documentation operation and a CLI such as `voyager-shell --guide animations`. The CLI must print and exit without starting the UI. An optional MCP adapter can serve callers that support it. |

These delivery mechanisms are not implemented by this PR. The current private
native policy does not permit MCP tools; its documentation route must use the
native provider connection instead. Other private providers need their own
capability and startup proof.

Codex's [instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
does not automatically include an unrelated Voyager profile directory.
Its [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
describes additional `developer_instructions`; `model_instructions_file` replaces
built-in instructions. A provider adapter must preserve existing instructions
and prove composition on the installed runtime. Do not modify global config,
shadow the agent executable or inject files into user projects for discovery.

## Preserve ownership

The shared guide teaches the application. It grants no owner authority, private
conversation access or process permissions. The private assistant's policy and
caller binding remain separate. Working Vessels perform project and package
source work under their actual permissions.

Herdr Core continues to own programs and terminals. Voyager owns content,
placement, explicit context and application policy. New guide or animation APIs
must reuse those owners. Native packages compose supported GPUI components;
browser Canvas playback is local authoring evidence, not native integration.

The animation format is an experimental JSON/PNG contract exercised by a local
browser prototype. Its player and artifacts remain outside this PR. Before
native adoption, select one typed manifest owner and generate external validators
and definitions from it. Do not maintain independent native and script schemas.
An animation's visual movement must not change authority or dock context.
Native trigger bindings should map permitted events to a pack and entry clip,
honor the declared starting pose, and share exact boundary drawings between
composable actions. Browser preview hooks do not establish native event delivery.

## Learn from the inspected sources

Herdr App maintains a shared profile guide and tests that it names every command
and setting. Its generated declarations carry API detail. Herdr Core exposes its
maintained runtime manual through `hc --skill`. Adopt that documentation pattern,
while preserving Voyager's context rules and seed-once personal packages.

- [Herdr App guide and distribution source](https://github.com/herdrdev/herdr-app/tree/1581a587919dddd6f1efd5f78eb542c4b2b02cb5).
- [Herdr Core manual and API source](https://github.com/herdrdev/herdr-core/tree/e07c2a1bedd62cf4787ee026ee23ee79c7d95491).
- Main's retained Electron companion currently carries its own inline prompt in
  `experiments/electron-reference/companion.cjs`. Native-foundation source was
  inspected separately: its private policy is inline in `conversation_client.rs`,
  package guides are seeded with packages, and worker argv lacks this bootstrap.
  Those candidate paths and capabilities are not implied to exist on main.

## Follow-up acceptance

1. Ship the guide and generated API definitions from the same application build.
2. Start a fresh private assistant and a fresh Vessel agent in an unrelated
   project. Verify the guide version, preserved project instructions, available
   capabilities and distinct authority.
3. Ask the worker to create an animation pack and a supported content edit.
   Verify the actual preview/view, a failed edit and retained user source/data.
4. Test missing/stale documentation and an unsupported provider. Report the
   limitation instead of claiming the bootstrap or requested action succeeded.
5. Verify manual-shell discovery and each optional provider integration
   independently. Documentation presence is not evidence of delivery.

Merge of these documents would preserve the design for main-branch follow-up.
It would not establish any of the runtime acceptance journeys above.

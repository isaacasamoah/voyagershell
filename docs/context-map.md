# Context map

Generated from `tests/architecture/vocabulary.yaml` by `npm run vocabulary:generate`. Edit the table, then regenerate.

Each bounded context owns the files and the words listed here. A context
defines its own words and may use the words of another context that it lists.
The [glossary](glossary.md) defines every word.

## Core adapter

Connects the application to Herdr Core. Core owns terminals, screens and processes.

Its guide is [docs/terminal.md](terminal.md).

Owns files:

- `app/src/core.rs`
- `app/src/core_endpoint.rs`
- `app/src/core_hello.rs`
- `app/src/core_pending.rs`
- `app/src/core_reader.rs`
- `app/src/core_state.rs`
- `app/src/core_viewer.rs`
- `app/src/client_core.rs`
- `app/src/wire.rs`
- `app/src/core_adapter_tests.rs`
- `app/src/core_slot_tests.rs`
- `app/tests/core_slots.rs`
- `app/tests/viewer_streams.rs`
- `app/tests/wire.rs`

It owns the words Core, Core session, Core terminal, Program.

It uses no words.

## Application queue and front door

Takes every request from a view, a Vessel or an agent, orders the effects and reports each outcome.

Its guide is [docs/workspace.md](workspace.md).

Owns files:

- `app/src/client.rs`
- `app/src/client_content.rs`
- `app/src/client_owner.rs`
- `app/src/client_owner_tests.rs`
- `app/src/core_session.rs`
- `app/src/client_structure.rs`
- `app/src/client_worktree.rs`
- `app/src/client_reply.rs`
- `app/src/client_service.rs`
- `app/src/client_terminal.rs`
- `app/src/client_admission_tests.rs`
- `app/src/adoption.rs`
- `app/src/vessel_socket.rs`
- `app/src/vessel_socket_wiring_tests.rs`
- `app/src/vessel_socket_authority_tests.rs`
- `app/src/vessel_overview.rs`
- `app/src/voyager_binding.rs`
- `app/src/voyager_start.rs`
- `app/src/client_voyager.rs`
- `app/tests/voyager_start.rs`
- `app/src/focus_hook.rs`
- `app/src/reply_hook.rs`
- `app/src/replies.rs`
- `app/tests/voyager_reply.rs`
- `app/src/spoken.rs`
- `app/src/bin/voyager.rs`
- `app/src/change_sentence.rs`
- `app/src/change_sentence_tests.rs`
- `contract/src/socket.rs`
- `contract/src/reply.rs`
- `app/src/front_door.rs`
- `app/src/layout_store.rs`
- `app/src/families.rs`
- `app/src/families/terminal.rs`
- `app/src/launch.rs`
- `app/src/agent_programs.rs`
- `app/src/activity.rs`
- `app/src/diagnostics.rs`
- `app/src/observation.rs`
- `app/src/lib.rs`
- `app/src/families/terminal/lifecycle.rs`
- `app/src/families/structure.rs`
- `app/src/families/voyage_close.rs`
- `app/src/families/worktree.rs`
- `app/src/families/worktree/git.rs`
- `app/src/tests.rs`
- `app/tests/exit_events.rs`
- `app/tests/front_door.rs`
- `app/tests/launch.rs`
- `app/tests/quit.rs`
- `app/tests/selected_stop.rs`
- `contract/src/activity.rs`
- `contract/src/launch.rs`
- `contract/src/observation.rs`
- `contract/src/operations.rs`

It owns the words Queue, Operation, Refusal, Uncertain effect, Reply marker, VOYAGER_BACKGROUND.

It uses the words Placement, Vessel, Context, Core terminal, Program.

## Placement

Decides where each Vessel sits and which Context a request carries.

Its guide is [docs/workspace.md](workspace.md).

Owns files:

- `app/src/workspace.rs`
- `app/src/workspace/`
- `app/src/layout_parts.rs`
- `app/src/scope.rs`
- `app/src/context.rs`
- `app/src/panels.rs`
- `app/src/canvas.rs`
- `contract/src/lib.rs`
- `contract/src/place.rs`
- `contract/src/layout_document.rs`
- `contract/tests/layout_compat.rs`
- `contract/tests/layout_document.rs`
- `contract/tests/reply.rs`
- `contract/src/panels.rs`
- `contract/src/canvas.rs`
- `contract/src/context.rs`
- `contract/src/voyage_close.rs`
- `contract/src/worktree.rs`
- `app/tests/canvas.rs`
- `app/tests/maximize.rs`
- `app/tests/shared_panels.rs`
- `app/tests/navigation.rs`
- `app/tests/revisions.rs`
- `app/tests/voyage_close.rs`
- `contract/src/bin/export.rs`
- `contract/tests/panels.rs`
- `contract/generated/workspace.ts`

It owns the words Voyage, Fleet, Placement, Portal, Arrangement, Layout, Context, Overwatch, Region.

It uses the words Vessel.

## Content

Owns Vessel types, Vessel packages, Vessel data and the link from a Vessel to its backend.

Its guide is [docs/content.md](content.md).

Owns files:

- `app/src/content.rs`
- `app/src/content/`
- `app/src/vessel_type.rs`
- `contract/src/content.rs`
- `content/`
- `app/tests/content.rs`

It owns the words Vessel, Vessel type, Vessel package, Backend, Description.

It uses the words Placement, Core terminal.

## Conversation and provider

Runs the private Conversation with the Administrator through a Provider. The application keeps scope, tools and policy.

Its guide is [docs/conversation.md](conversation.md).

Owns files:

- `app/src/administrator.rs`
- `app/src/administrator/inputs.rs`
- `app/src/administrator/peek_tests.rs`
- `app/src/conversation.rs`
- `app/src/conversation_client.rs`
- `app/src/conversation_audio.rs`
- `app/src/conversation_provider_tests.rs`
- `app/src/provider.rs`
- `app/src/provider_settings.rs`
- `app/src/codex.rs`
- `app/src/codex_protocol.rs`
- `app/src/voice.rs`
- `app/src/voice_host.rs`
- `app/src/voice_session.rs`
- `app/src/voice_transcript.rs`
- `app/src/voice_wire.rs`
- `app/src/speech.rs`
- `app/src/omni.rs`
- `app/src/omni_tests.rs`
- `app/src/audio_io.rs`
- `app/src/silero.rs`
- `app/src/http1.rs`
- `app/src/voice_layer.rs`
- `app/src/voice_layer_tests.rs`
- `app/src/voice_voyager.rs`
- `app/src/voice_reply.rs`
- `app/src/voice_route.rs`
- `app/src/voice_parts.rs`
- `app/src/voice_speaker.rs`
- `app/tests/voice_engine.rs`
- `contract/src/administrator.rs`
- `contract/src/conversation.rs`
- `contract/src/voice.rs`
- `contract/generated/conversation.ts`

It owns the words Administrator, Conversation, Provider.

It uses the words Context, Operation, Vessel, Placement.

## Desktop presentation

Draws the Canvas and the Avatar and binds the native window to the application owners.

Its guide is [docs/terminal.md](terminal.md).

Owns files:

- `desktop/build.rs`
- `desktop/src/`
- `desktop/canvas/`
- `contract/src/avatar_animation.rs`
- `contract/src/inspection.rs`

It owns the words Canvas, Panel, Avatar, Dock, Profile.

It uses the words Placement, Portal, Vessel, Context, Operation, Core terminal, Region.

## Verification

Drives the real app on an owned display and keeps the architecture checks.

Its guide is [tests/native/README.md](../tests/native/README.md).

Owns files:

- `tests/native/`
- `tests/architecture/`

It owns the words Journey, Fixture, Control, Evidence.

It uses the words Voyage, Fleet, Vessel, Placement, Portal, Canvas.

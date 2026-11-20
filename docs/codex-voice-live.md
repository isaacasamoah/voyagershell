# Codex Voice Live

Codex Voice Live is Codex's own live voice. Codex's documentation calls it
ChatGPT Voice, with the GPT-Live model. In VoyagerShell it is a `Relay` engine
behind the voice interface in `app/src/speech.rs`, beside the `Pipeline` engines
that hear and speak. It is compiled and never offered to a user. Omni is the
voice for everyone, as [the local voice guide](voice.md) describes.

## Why it is a Relay and not a Pipeline

A `Pipeline` engine implements `Hearing` and `Speaking`, and the voice layer
runs the whole exchange. Codex Voice Live hears and speaks inside one realtime
session, and that session starts its own backing Codex turn. It cannot be split
into those two traits. A `Relay` has a start, a stop and a state, and the engine
runs its own exchange.

The audio lease in `app/src/conversation_client.rs` implements `Relay`. Nothing
constructs `Engine::Relay` in the application, and `speech::OFFERED` lists only
the `Pipeline` shape. A test asserts that the offered shapes exclude `Relay`.
Offering it later is one line in `OFFERED` plus a voice setting that names it.
Until a run on a real subscription proves that every request reaches Voyager,
it stays unoffered.

## Where the code lives

The adapter files carry the adapter name and are the only voice files that may
name Codex.

- `app/src/voice_live.rs` declares the adapter modules and holds the voice
  instructions.
- `app/src/voice_live_host.rs` finds the Codex voice package, checks its
  version and runs the helper process.
- `app/src/voice_live_wire.rs` frames the helper's control messages.
- `app/src/voice_live_lease.rs` holds the audio lease state.
- `app/src/voice_live_session.rs` runs one helper session.
- `app/src/voice_live_transcript.rs` turns realtime items into visible
  messages.

`app/src/conversation_audio.rs` remains the part of the conversation owner that
handles audio events. It names no agent. The files are named for the voice, not
for the agent, so `app/src/lib.rs` stays free of the agent name. The
`agent-names-stay-in-adapters` rule lists the two adapter files whose text names
Codex, `voice_live.rs` and `voice_live_host.rs`, one by one.

## No per-use charge

Codex Voice Live runs only under a ChatGPT subscription login. The private Codex
runtime that carries the backing turn never receives an API key. Its launch
removes the key variables, and its dotenv file is refused when it sets one. The
tests run on stand-ins, with no login and no network.

## Native speech integration

The native speech candidate reuses the helper beside the exact installed Codex
executable retained by the private provider. Package discovery accepts manifest
schema 1 and a bounded version identity rather than a fixed application release.
Compatible CLI updates therefore do not require a release-number allowlist. It compares the initialized
provider version with that package's manifest before starting the helper. The
helper must then acknowledge protocol 1 and the manifest's exact build commit.
Provider initialization exposes a version, so these checks do not establish the
running provider's build commit. The inspected reference is the
[helper protocol](https://github.com/openai/codex/blob/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856/codex-rs/realtime-webrtc/src/protocol.rs)
and [native client](https://github.com/openai/codex/blob/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856/codex-rs/realtime-webrtc/src/client.rs).

Before requesting native audio, the provider checks its existing account type
without requesting a token refresh. This candidate accepts only the ChatGPT
account route. The adapter reduces that reply to a readiness boolean. Voyager
does not expose the account record, inspect credentials or select paid API audio.
The app starts the private Codex runtime without `OPENAI_API_KEY` and
`CODEX_API_KEY` in the environment it passes. Codex itself loads `.env` from
`$CODEX_HOME`, else `~/.codex`, and sets every variable in it except names that
start with `CODEX_`. So before the private Codex runtime starts, for chat or
voice, the app reads the names in that file, never the values. If the file names
either variable, the runtime does not start and the message names the file and
the variable. Codex 0.167.0 drops
`CODEX_` names from that file, so the check on `CODEX_API_KEY` is a safeguard
against a later Codex that does not. The app checks no other source of an API
key, such as a user-defined provider in the Codex configuration.

The helper owns native WebRTC, microphone capture and speaker playback. Its
control pipe carries big-endian length-prefixed JSON of at most 128 KiB, without
audio samples. Provider audio-control requests have a separate 128 KiB bound;
the ordinary and content-specific frame bounds above remain unchanged. The
desktop supplies the existing packaged-runtime environment in
[platform.rs](../desktop/src/platform.rs), including Linux-only ALSA discovery.
Devices remain the operating system defaults. No global device or mute setting
changes. macOS and Windows runtime behavior remains unproved.

The helper must acknowledge transport connection, device opening and audio
controls before the speech control reports Listening or Speaking. Its level
display uses actual microphone and speaker peaks. Neither those acknowledgements
nor levels establish intelligible sound.

The native `voyager_conversation.Speech` component retains one application-issued
audio lease in an application-lived GPUI entity. A script can place the component
with `Speech.new("voyager-speech", {})`; a payload cannot grant a lease. Canvas
reload or movement among full, compact and floating views reuses that entity.
The component observes only the small audio state while connecting, active or
stopping. It does not continuously read the full conversation while idle.

Stopping or releasing the lease cancels only its owned helper. It does not
interrupt accepted tools, erase the private thread or stop Core programs. Helper
exit, lost exit confirmation and provider failure remain distinct. An
unconfirmed helper stop prevents another audio start. A known provider stop
refusal settles only after its closure notification and confirmed helper exit,
and the refusal remains visible. No audio session or operation restarts or
replays automatically.

Native voice may start its own backing Codex turn. Voyager accepts that actual
thread/turn under the current audio generation without submitting another
`turn/start`. It queues an inspection at the workspace owner synchronously before
waiting on another thread. Later Dock requests enter behind that inspection.
Early tools wait for the captured context. Later docking or audio loss cannot
retarget accepted tools. The current workspace owner's existing effect
notifications refresh views even when Chat is closed; voice adds no second
workspace effect counter or refresh owner.

Visible native transcript items retain their actual item, thread, session and
audio-generation identities. The installed transcript events do not supply a
reliable backing-turn identity. Their displayed messages therefore have no
invented turn context and use the audio generation as their request reference.
Sessionless deltas extend only an item already accepted for the current session;
they cannot create a new item. Backing turns and their tools separately retain
the actual turn, captured context and request receipt. Private reasoning, raw
audio negotiation and account data never enter these messages.

`VOYAGER_VOICE_EVIDENCE` is an opt-in proving path for sequential sanitized state
writes. It contains bounded peaks, status and nonsecret thread/session/turn
references. It contains no audio samples or session description. This integration
has compile and pure source checks only. Real account readiness, audible
full-duplex speech, interruption, scoped tools and lease loss still require the
serialized native conversation journey.

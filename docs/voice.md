# Local voice

The voice layer lets a person click the avatar's voice control, speak, and have
the words reach Voyager. It runs on the local Omni model. Nothing is sent to a
cloud service and nothing is billed per use. Voice stays separate from the agent
runtime. It hears and speaks, and Voyager acts. The Codex realtime helper
described in [the conversation guide](conversation.md) stays compiled and has no
control until its own adapter step.

This guide covers the hearing half. The spoken reply is a later step. It reads
the first paragraph of Voyager's final message, and the speech filter that
prepares that text is already in place.

## One spoken exchange

1. A click on the voice control opens the microphone. Nothing opens it without a
   click. The same control ends the utterance with a second click.
2. A pause also ends the utterance. The gate watches frame energy against a
   noise floor. Speech followed by 0.6 s of quiet ends it, an utterance ends at
   30 s, and a room with no speech gives up after 8 s. These are targets to
   measure on real microphones.
3. Omni turns the samples into words. The prompt names the product words and the
   user's own Voyage and Fleet names, read from the workspace state the owner
   already holds, so hearing adds no inspection call.
4. A cached clip answers at once. It says only that the words were heard and
   passed on. It never names an action or claims a result.
5. The words go to Voyager as `[spoken] <words>` through the same send the chat
   box uses.

| Voyager's standing | Clip | Words sent |
| --- | --- | --- |
| Idle or done | "Asking Voyager." and "Okay, asking Voyager.", in turn | Yes |
| Working | "Queued for Voyager." | Yes |
| Blocked | "Voyager needs you on Home first." | No |
| Not running | "Voyager isn't running. Resume it in the chat." | No |
| Nothing heard | "I didn't catch that." | No |

A click made while the avatar hears or speaks is dropped. A click while Voyager
works starts a new utterance, which queues. There is no interrupt and no stop.

## The seam

`app/src/speech.rs` holds the traits `Hearing` and `Speaking`, the `Engine`
that pairs them, the clip table and the speech filter. `SpokenText` can only be
built by the filter, so unfiltered reply text never reaches an engine. The filter
keeps the first paragraph, drops code, tables, links, paths and long ids, stops at
two sentences or 30 words, and adds "The rest is in the chat." when it cut
anything.

`app/src/voice_layer.rs` owns the exchange. One thread takes clicks one at a
time, so two utterances never overlap. It reaches Voyager through the `Voyager`
trait, which reports its standing and takes the words. Until Voyager is bound to
the avatar, `Unbound` answers "not running" and nothing is sent. Audio goes
through the `Audio` trait. `System` implements it with `parec` and `paplay`, the
PulseAudio command line tools, which PipeWire also serves. Linux is the only
verified platform.

A stalled engine never delays the canvas. The layer runs on its own thread with
its own Core connection, and the canvas only reads a small snapshot.

## The Omni engine

`app/src/omni.rs` builds the command line for a local llama.cpp server and talks
to it over the loopback address. It never touches Core. The application queue
starts, verifies and stops the program through a generic request for a labelled
Core program, so Core stays the only process supervisor and the queue stays the
only caller of Core. The program has no place label, so it never reaches the
canvas. The app starts it when the app launches and keeps it warm while the app
runs. A start replaces any live program that carries the same service label and
server path, which clears an engine left by an earlier run. A stop checks the
label and the server path before it kills, so it ends only that program. A start
or stop that Core does not confirm is reported and never repeated.

Hearing is a chat completion with the audio attached and the instruction to
transcribe. Speaking is the speech endpoint with the female voice and no
fallback voice. The server binds to the loopback address only.

### Where the files are found

The engine looks for a runtime folder and the model files.

| Setting | Meaning |
| --- | --- |
| `VOYAGER_OMNI_DIR` | The runtime folder. Defaults to `voyager/voice/omni` in the user cache folder. |
| `VOYAGER_OMNI_SERVER` | The server program, for a test machine that runs a local llama.cpp build. |
| `VOYAGER_OMNI_GPU_LAYERS` | How many layers the server puts on a graphics card. Defaults to 0, the CPU build. |

The server is `llama-server` in the runtime folder unless the server setting
names another. The model and the audio projector are read from the runtime folder
or, in place, from the Hugging Face cache snapshot of the Omni model. If a part
is missing, the control says "Local voice is not installed" and names what is
missing. Typing keeps working.

This lookup is interim. The shipping choice is the Vulkan or CPU build, downloaded
on first use after a consent panel, with files pinned by size and checksum. The
voice setting and download step replaces the lookup. The server and layer-count
settings exist so a test machine can run a local llama.cpp build with a graphics
card without a code default for it.

### Acknowledgement clips

The clips in the table are rendered once through the engine and kept in the user
cache folder, keyed by the model size and the voice. The app reads them into
memory when the engine is ready. A click then costs no model run before the
clip starts. A fresh cache renders the set once, after the first warm-up.

## Host requirements

The voice layer needs `parec` and `paplay`, which the `pulseaudio-utils`
package provides on Fedora and Debian. `voyager-verification doctor` checks that
both are on the path. Without them the control reports that the microphone could
not be opened.

## Cost when idle

The engine starts at launch, so an idle app holds the model in memory. The
measured figures for the build on the development laptop are in the pull
request that added this guide. No tokens are spent while idle, because the model
is local and nothing runs until a click.

## Privacy

Audio stays in memory. The layer never writes samples to disk, to the log or to
Core's scrollback. The engine's own log lines carry no audio. An evidence file
set by `VOYAGER_VOICE_TRACE` records event names and times only, never words.

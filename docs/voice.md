# Local voice

The voice layer lets a person click the avatar's voice control, speak, and have
the words reach Voyager. It runs on the local Omni model. Nothing is sent to a
cloud service and nothing is billed per use. Voice stays separate from the agent
runtime. It hears and speaks, and Voyager acts. The Codex realtime helper
described in [the conversation guide](conversation.md) stays compiled and has no
control until its own adapter step.

This guide covers hearing a request, handing it to Voyager and reading Voyager's
reply aloud.

## One spoken exchange

1. A click on the voice control opens the microphone. Nothing opens it without a
   click. The same control ends the utterance with a second click.
2. A pause also ends the utterance. The gate watches frame energy against a
   noise floor. Speech followed by 0.6 s of quiet ends it, an utterance ends at
   30 s, and a room with no speech gives up after 8 s. These are targets to
   measure on real microphones.
3. A cached clip answers the moment capture ends, before hearing finishes. It is
   chosen from Voyager's standing, so it needs no words. It says only that the words
   were heard and passed on. It never names an action or claims a result.
4. Omni turns the samples into words while the clip plays. The prompt names the
   product words and the user's own Voyage and Fleet names, read from the workspace
   state the owner already holds, so hearing adds no inspection call. If hearing
   finds nothing, "I didn't catch that." follows and nothing is sent.
5. The words go to Voyager as `[spoken] <words>`, built by `spoken::prompt`, through the
   same send the chat box uses. The focus hook reads the marker and tells the app that
   the turn is spoken.

| Voyager's standing | Clip | Words sent |
| --- | --- | --- |
| Idle or done | "Asking Voyager." and "Okay, asking Voyager.", in turn | Yes |
| Working | "Queued for Voyager." | Yes |
| Blocked | "Voyager needs you on Home first." | No |
| Not running | "Voyager isn't running. Resume it in the chat." | No |
| Nothing heard | "I didn't catch that." | No |

A click made while the avatar hears or speaks is dropped. A click while Voyager
works starts a new utterance, which queues. There is no interrupt and no stop.

## Speaking the reply

Only a turn that the app's ledger marked spoken is ever read aloud. The ledger
marks a turn when the focus hook sees the `[spoken]` marker on its own prompt id, so a
reply is never judged spoken by guessing which prompt came last. The voice layer reads
the same store of Voyager's replies that the chat reads, `app/src/replies.rs`, on its
own thread, off the canvas path. A typed turn, a Core note and a turn of any other
Vessel stay silent.

A spoken turn is read aloud once. The rule is `voice_reply::Watcher`. A turn is a
candidate when its final `Stop` is recorded and Core answers that Voyager is not
working. Only an answered "idle", "done" or "error" counts. A failed read of Core, an
answer the app cannot read and a program that reports no state are all unknown, and the
rule waits on an unknown standing and never speaks. Then the speech filter takes the
first paragraph of the final message, drops paths, code, hex runs of seven or more
characters with a digit and letter-digit identifiers such as `t8s`, `w1:t3`, `fleet-25`
and `terminal-34`, cuts what is left to two sentences or 30 words, and adds "The rest
is in the chat." when it cut anything. The engine reads the result. Plain words and
numbers such as "3 files" are kept. The turn is marked done, so a repeated `Stop`, a
late chunk of the same message and a later reopen never speak it again. A failed turn
plays one fixed clip, "That didn't work. The reason is in the chat.". While a spoken
turn is open and Core reports Voyager blocked, one fixed clip, "I need you on Home.",
plays once.

There is no fixed hold before speech. Claude can continue a turn after `Stop` when
a `Stop` hook in the person's own setup asks it to, so the store can settle one turn
twice. A real run shows that case does not look settled to Core. In seven runs of
Claude Code 2.1.322 under Core, each with a `Stop` hook that continued the turn once,
Core reported the program working from before the first `Stop` to 42 to 66 ms after the
last one, a gap of 0.9 to 1.0 s between the two `Stop` events with no change of
status. Three runs without a continuation gave 52 to 69 ms from `Stop` to Core's
`done`. The rule therefore waits on Core and not on a timer. The first `Stop` of a
continued turn is not read aloud, because Core still says working, and the final one
is read within about 0.1 to 0.2 s of Core's change. The residual case is a continuation
that starts after Core already reports Voyager not working. It was not seen. If it
happened, the first settle would be spoken and the later one never would. The app logs
exactly one line for that turn, "spoken reply was partial; turn reopened", and does not
speak again, which keeps the rule "at most once"; the partial reply that was spoken
stays spoken.

Speech holds the audio floor. A click while Voyager is being read is ignored, and a
reply that is ready while an utterance is being heard waits for it to finish. There is
no interrupt and no stop.

## The seam

`app/src/speech.rs` holds the traits `Hearing` and `Speaking`, the `Engine`
that pairs them, the clip table and the speech filter. `SpokenText` can only be
built by the filter, so unfiltered reply text never reaches an engine. The filter
keeps the first paragraph, drops code, tables, links, paths and long ids, stops at
two sentences or 30 words, and adds "The rest is in the chat." when it cut
anything.

`app/src/voice_layer.rs` owns the exchange. One thread takes clicks one at a
time, so two utterances never overlap. It reaches Voyager through the `Voyager`
trait, which reports its standing and takes the words. `app/src/voice_voyager.rs`
implements it over the application queue. It reads the terminal that the app wrote
in its own binding file, asks Core for that terminal's reported status, and sends the
words with Core's own send, which refuses a blocked program and never forces. With no
binding, or a program that is gone, Voyager counts as not running and nothing is sent.
An unconfirmed send is reported and never repeated. Audio goes
through the `Audio` trait. `System` implements it with `parec` and `paplay`, the
PulseAudio command line tools, which PipeWire also serves. Linux is the only
verified platform.

A stalled engine never delays the canvas. The layer runs on its own thread, reaches
Core only through the application queue, and the canvas only reads a small snapshot.

## The Omni engine

`app/src/omni.rs` builds the command line for a local llama.cpp server and talks
to it over the loopback address. It never touches Core. The application queue
starts, verifies and stops the program through a generic request for a labelled
Core program, so Core stays the only process supervisor and the queue stays the
only caller of Core. The program has no place label, so it never reaches the
canvas. The app starts it when the app launches and keeps it warm while the app
runs. A start replaces any live program that carries the same service label and
server path, which clears an engine left by an earlier run. If the app ends without
quitting, its engine program stays until the next launch replaces it or the session stops. A stop checks the
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
Core's scrollback. The engine's own log lines carry no audio. The verifier sets
`VOYAGER_VOICE_TRACE` to a file that records event names and times, and for its own
synthetic speech the words heard. The app never sets it, so a real session records
no words.

## How it is checked

The native `voice` journey in [the verification guide](../tests/native/README.md#the-voice-journey)
clicks the real control, feeds committed synthetic speech to the microphone and records the
speaker. It checks that nothing records the microphone without a click, that the words come
back exactly as spoken, that the acknowledgement reaches the speaker and that no audio payload
appears in any log. The spoken result and the words reaching Voyager are not covered yet.

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

Voice is a switch. A click turns it on and only another click turns it off. A
silent room, the end of a turn, a reply and a fault all leave it on.

1. A click turns voice on. The control turns amber and reads Connecting while the
   microphone opens and the noise floor settles for 0.3 s, then green while it
   listens. Nothing opens the microphone without a click.
2. The turn rule is in `audio_io::Gate`. Each 20 ms frame goes to a speech
   detector, which gives the probability that the frame holds speech. A turn starts
   after 0.1 s of frames at or above 0.3, so a click, a thump as the microphone
   opens, a fan, typing or a door is never a turn. It ends after 1.5 s of frames
   below 0.15. A turn also ends at 30 s of speech, and voice stays on. A silent room
   is never a turn and never turns voice off. The utterance keeps the 1 s before
   speech started, so its first word is not cut. The plain level of the whole band,
   against three times the quietest frame of the last 2 s and never less than 200,
   only tells a waiting reply whether the room has been quiet. The detector is
   described in [The speech detector](#the-speech-detector).
3. The 1.5 s comes from 94 synthetic requests with a pause of 0.4 to 1.5 s
   mid-sentence. A silence of 0.6 s ended 71 of them early, 1.0 s ended 32, 1.2 s
   ended 23 and 1.5 s ended 10. It is the shortest of those that ends at most 15
   early. Waiting 1.5 s instead of 0.6 s adds 0.9 s between the end of speech and
   the acknowledgement. The time from the end of the turn to the clip's first sound is
   unchanged. In ten runs of the voice journey on the CPU engine it was 187 to 206 ms,
   with a median of 201 ms. A model that judges the end of a turn and interruptions
   are later work.
4. A cached clip answers the moment the turn ends, before hearing finishes. It is
   chosen from Voyager's standing, so it needs no words. It says only that the words
   were heard and passed on. It never names an action or claims a result.
5. Omni turns the samples into words while the clip plays. The prompt names the
   product words and the user's own Voyage and Fleet names, read from the workspace
   state the owner already holds, so hearing adds no inspection call. Right
   after hearing, `speech::heard_nothing` drops a transcript with no letter or
   digit. Nothing more is said and nothing is sent. If hearing fails, "I didn't
   catch that." follows and nothing is sent. No filter over the heard words drops
   a request, because such a filter drops real requests it did not foresee.
6. The words go to Voyager as `[spoken] <words>`, built by `spoken::prompt`, through the
   same send the chat box uses. The focus hook reads the marker and tells the app that
   the turn is spoken.
7. Listening resumes when the clip ends. A new request while Voyager works queues
   for it.

The microphone is closed whenever the app's own audio plays, so the app never hears
its own voice as a turn. There are no interruptions.

A click turns voice off in any state. It stops listening and any audio that is
playing at once, and drops a sentence that was still being spoken. A turn that had
already ended is still sent, Voyager's work is not cancelled, and its reply lands in
the chat without being spoken.

If the microphone cannot be opened or its stream ends, voice stays on. The control
shows "Can't hear the microphone" in a colour that is not green, and the voice says
"I can't hear your microphone." once for that outage. The app tries again every 3 s
and turns green when the microphone is back.

Every fixed phrase the voice says is in this table. A clip is cached, keyed by its key and a
short hash of its words. The voice speaks as "I" and never as Voyager.

| Key | Words | Played when | Words sent |
| --- | --- | --- | --- |
| `asking` | "Asking Voyager." | Voyager is idle or done, or has no state yet, on even turns | Yes |
| `okay-asking` | "Okay, asking Voyager." | The same standing on odd turns | Yes |
| `queued` | "Queued for Voyager." | Voyager is working | Yes |
| `needs-you` | "Voyager needs you on Home first." | Voyager is blocked, when the words arrive or while a spoken turn is open, or Core refuses a send with kind `blocked` | No |
| `not-running` | "I couldn't pass that to Voyager." | Core reports the program ended or gone, or Core refuses a send with a kind not listed in this table, including `conflict` | No |
| `gone` | "Voyager isn't running." | Core refuses a send with kind `not_found` or `finished`, or no Voyager is bound | No |
| `busy` | "Voyager can't take that right now. Try again in a moment." | Core refuses a send with kind `busy` | No |
| `disconnected` | "I lost the connection to Voyager." | Core refuses a send with kind `disconnected` | No |
| `missed` | "I didn't catch that." | Hearing failed | No |
| `no-microphone` | "I can't hear your microphone." | The microphone cannot be opened or its stream ends, once for each outage | No |
| `failed` | "That didn't work." | A spoken turn ends in failure | No |

A reply past the ceiling also ends with "I can say more if you ask." That sentence is
part of the spoken text and not a clip. The words in the table never name an action or claim
a result, and none points to the chat.

## The speech detector

The detector is a Rust port of the Silero voice activity detector, version 6, in
`app/src/silero.rs`. `audio_io::SpeechDetector` is the seam. It takes a frame and
gives a speech probability, and a gate resets it when it starts. The voice layer
takes its detector from its audio parts, so another model can replace Silero there.

| Fact | Value |
| --- | --- |
| Model file | `app/models/silero_vad_v6.onnx`, 1,245,151 bytes, sha256 `4cbf549b8326f60f80f2536d9eefeb450a9abe83365a098031c89719f1be17d2` |
| Source | The 16 kHz export of Silero VAD v6 that faster-whisper 1.2.1 ships as `faster_whisper/assets/silero_vad_v6.onnx` |
| Licence | MIT. The model is copyright 2020-present Silero Team, and the export is copyright 2023 SYSTRAN. Both notices are in `app/models/LICENSE-silero-vad`. |
| Input | 512 new samples at 16 kHz with the last 64 of the chunk before, so one probability every 32 ms |
| Work | About 0.7 million multiply-adds a chunk, counted from the layer shapes |

The app embeds the file and reads its weights with a small reader for the ONNX
protobuf, so no inference crate is added. The graph is fixed in code. It is a
reflect pad of 128 samples each side, then a 258 by 256 convolution that forms a
short-time Fourier transform whose first frame is dropped, and the magnitude of 129
bins over 4 frames. Four convolutions with a kernel of 3 follow, each with a ReLU,
from 129 to 128 channels, 128 to 64 with stride 2, 64 to 64 with stride 2 and 64
to 128. Then come one LSTM step of 128 units in ONNX gate order (input, output,
forget, cell), a ReLU, a 128 to 1 convolution and a sigmoid. The LSTM state
carries from chunk to chunk while the microphone stays open. The microphone
already records at 16 kHz mono, so the sound server does any resampling and the
app does none. The detector groups the gate's 320-sample frames into 512-sample
chunks, scales each sample by 1/32768 and reports the latest chunk's probability
for each frame.

`silero::tests` feeds Edge requests from the committed hearing set, at full, 0.15
and 0.06 of their level, through 320-sample frames, and compares each chunk with
onnxruntime 1.32 on the same samples. Over 717 chunks the worst difference was
2.0e-6, and the test allows 1e-4. The reference values are in
`app/models/silero_vad_v6_reference.tsv`. An independent verifier ran onnxruntime
1.24.2 itself and found a worst difference of 5.5e-6 over 120 feeds of the hearing
set and 4.8e-6 over Isaac's 47 recordings.

The committed coverage is the 40 requests in `tests/native/fixtures/hearing/`,
20 in `en-GB-SoniaNeural` and 20 in `en-US-AriaNeural`, both female Edge voices.
An independent verifier fed all 40 through the app's own `silero.rs` and
`audio_io.rs` in 320-sample frames, with 3 s of silence before and after, over a
bed from the room fixture's generator. A whole turn is exactly one turn that holds
the whole voiced span with its first word kept. This is the gate offline, so it
counts turns, and the voice journey counts the sends.

| Level | Bed | One turn | Whole turn, first word kept |
| --- | --- | --- | --- |
| 1.00 | Room tone | 40 of 40 | 40 of 40 |
| 1.00 | Soft fan | 40 of 40 | 40 of 40 |
| 1.00 | Loud fan | 40 of 40 | 40 of 40 |
| 0.15 | Room tone | 40 of 40 | 40 of 40 |
| 0.15 | Soft fan | 40 of 40 | 40 of 40 |
| 0.15 | Loud fan | 40 of 40 | 40 of 40 |
| 0.06 | Room tone | 40 of 40 | 40 of 40 |
| 0.06 | Soft fan | 40 of 40 | 40 of 40 |
| 0.06 | Loud fan | 27 of 40 | 25 of 40 |

335 of 360 feeds were whole turns. Every other condition is complete, and every
miss was at 0.06 over the loud fan. This is the known gap. A very quiet voice under
a loud fan can be missed. Edge speech at 0.06 of its level has a voiced level near
RMS 210, against the loud fan's 700, so it is about 10 dB under the fan.

The thresholds were chosen in an uncommitted simulation of the gate over the
detector's probabilities. It is not in the repository, so its figures cannot be
rerun from it. Over the voice journey's 5-minute room sound the highest probability
of any frame was 0.042, and over a 120 Hz thump as the microphone opens it was
0.061. The simulation also used 60 Edge requests that are not in the repository,
in 6 more voices. With those and the committed 40, a start threshold of 0.5 kept
18 of 100 requests at 0.06 over the loud fan, against 43 at 0.3, and changed
nothing else. Ending the turn on the plain level held turns open after speech
while the room fixture's keys and door sounded, so the end follows the detector
instead.

The real-voice proof is Isaac's 47 real recordings, used under his terms. They
were made on a laptop microphone and are not in the repository. They were checked
once in place on the development machine. A harness outside the repository ran the
app's own `audio_io.rs` and `silero.rs` over them and kept only scores and timings. Each was fed with 1 s of silence before and 3 s
after, at its natural level and mixed with the room fixture's soft fan and loud
fan.

| Condition | One turn | Not cut | First syllable kept | Turn end after speech |
| --- | --- | --- | --- | --- |
| Natural level | 47 of 47 | 47 of 47 | 47 of 47 | 1.50 to 2.02 s, median 1.72 s |
| Soft fan | 47 of 47 | 47 of 47 | 47 of 47 | 1.68 to 2.14 s, median 1.88 s |
| Loud fan | 47 of 47 | 47 of 47 | 47 of 47 | 1.66 to 2.56 s, median 1.94 s |

The same harness ran the 141 feeds, about 1,000 s of audio, in 7.2 s on one core
of the development laptop, mixing included.

## Speaking the reply

Only a turn that the app's ledger marked spoken is ever read aloud. The ledger
marks a turn when the focus hook sees the `[spoken]` marker on its own prompt id, so a
reply is never judged spoken by guessing which prompt came last. The voice layer reads
the same store of Voyager's replies that the chat reads, `app/src/replies.rs`, on its
own thread, off the canvas path. A typed turn, a Core note and a turn of any other
Vessel stay silent. The store has already removed the reply marker `[vy]` that
Voyager starts every reply with, so neither the filter below nor the chat note holds it.

A spoken turn is read aloud once. The rule is `voice_reply::Watcher`. A turn is a
candidate when its final `Stop` is recorded and Core answers that Voyager is not
working. Only an answered "idle", "done" or "error" counts. A failed read of Core, an
answer for a live program that carries no state word and a state word the app cannot
read are all unknown, and the rule waits on an unknown standing and never speaks. Then the speech filter takes the
final message, drops code, tables, paths, hex runs of seven or more
characters with a digit and letter-digit identifiers such as `t8s`, `w1:t3`, `fleet-25`
and `terminal-34`, and gives each list item, heading and paragraph a sentence end. The
engine reads all of what is left. Plain words and numbers such as "3 files" are kept.
The turn is marked done, so a repeated `Stop`, a late chunk of the same message and a
later reopen never speak it again. A failed turn plays one fixed clip, "That didn't
work.". Once the audio has started, the same words are added to the private chat as an
assistant line through `Client::note`, which never starts a turn. That add never delays
speech. A spoken reply that arrives after a click-off is not played, and the same words are still added to the chat. While a spoken
turn is open and Core reports Voyager blocked, one fixed clip, "Voyager needs you on Home first.",
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

A reply is spoken only while voice is on. It takes the audio floor from the listener.
The listener closes the microphone and steps aside only after 1.5 s with no sound, the
same silence that ends a turn. So a reply never cuts in on a person who has started to
speak, even between their first words, and plays at the next quiet moment. If the room
is never quiet but the listener does not take the sound as speech, a reply waits 3 s and
then plays. If the listener takes the sound as speech, such as a steady loud sound, the
reply waits until that turn ends, which can be as late as the 30 s cap. The 3 s is a
target. It has not been measured in a real room.
Listening resumes when it ends. The reply thread and its floor lock are interim. One
audio thread that owns the microphone and the speaker is later work.

### The whole answer, written for the ear

Voice is the primary surface, and the chat is an alternative. A spoken reply is the
whole answer and never says that more is in the chat. The agent's launch policy,
`spoken::policy_rule`, tells it to answer a spoken prompt aloud in full, brief and
plain, with no ids, paths or code, to say the reason when something fails, to say only the gist of an answer that would pass about 100 words, such as a list, and
offer more, and never to point to the chat. Each word
of the rule is sent on every spoken turn, so it stays short.

The filter keeps only a safety ceiling for runaway text, `CEILING_WORDS`, 120 words. It
is a target to measure against the engine's render time, which has a 30 s limit per
request, and not a measured limit. Past it the filter cuts at the last sentence end in
the second half of the kept words, or at the ceiling when there is none, and adds "I can
say more if you ask." It adds no pointer to the chat.

The chat was empty for a voice turn because Voyager's replies reach the app only through
the reply store, which feeds the speaker and the agent socket. The chat is the private
conversation, a separate surface that held only refusal notes. Nothing wrote a spoken
reply into it, so the chat could not hold what the voice said. A note never takes the
place of a user turn. While a first message is starting, notes keep their oldest-first
trim but never trim out the accepted message.

## The seam

`app/src/speech.rs` holds the traits `Hearing` and `Speaking`, the `Engine`
that pairs them, the clip table and the speech filter. `SpokenText` can only be
built by the filter, so unfiltered reply text never reaches an engine. The filter
keeps every paragraph, drops code, tables, links, paths and long ids, and stops only at
the safety ceiling.

`app/src/voice_layer.rs` owns the exchange. A click flips the switch at once from
the canvas thread. One listening thread converges on it, so two utterances never
overlap. It reaches Voyager through the `Voyager`
trait, which reports its standing and takes the words. `app/src/voice_voyager.rs`
implements it over the application queue. It reads the terminal that the app wrote
in its own binding file, asks Core for that terminal's reported status, and sends the
words with Core's own send, which refuses a blocked program and never forces. With no
binding, or a program that Core reports ended or gone, Voyager counts as not running and
nothing is sent. A failed read of Core, or a live program that has not reported a state
yet, is unknown. The words are sent anyway, and Core's send refuses honestly if it must.
Speech does the opposite and waits on an unknown standing.
A send that Core refuses after the acknowledgement is a known refusal. The app plays
one cached clip chosen by Core's refusal kind, adds the refusal as a line in the chat,
and shows it in the voice control's tooltip. Each clip is true for every kind mapped to
it, and an unknown kind keeps "I couldn't pass that to Voyager." The table above lists each kind.

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

Hearing is a chat completion with the audio as the only user content. The system
message is the model card's transcription task, `Perform ASR in English.`, then
`Words you may hear` with the product words and the live workspace names. Any
other system text is a chat instruction, and the model then answers a spoken
question instead of writing it down. Asked in its own words to "Transcribe the
audio exactly as spoken", it answered "In three short sentences, tell me what this
fleet has in it." with "The fleet includes a home dock, a fleet of vessels, and
voyagershell.", and Voyager received that answer as the request.

The 40 committed Edge requests in `tests/native/fixtures/hearing/` are 20 questions
and 20 commands. Word error is counted as the voice experiment's round 4 counted
it. A request counts as answered when its word errors are more than half its
words. The first three rows send the app's request straight to a CPU engine. The
last two feed the same 40 through the microphone in the voice journey's
`requests-are-written-down` case, with the app's own live names. That case fails
when any request is answered.

| Run | System message | Answered | Word error | Exact |
| --- | --- | --- | --- | --- |
| Engine | Before, "Transcribe the audio exactly as spoken. Output only the words, nothing else." with the product words | 7 of 40 | 61.9% | 29 of 40 |
| Engine | `Perform ASR in English.` with the product words | 0 of 40 | 0.9% | 39 of 40 |
| Engine | The same with 15 Fleet and Vessel names, including names with digits, hyphens and a seven-word name | 0 of 40 | 0.0% | 40 of 40 |
| Journey | Before | 11 of 40 | 61.9% | 25 of 40 |
| Journey | `Perform ASR in English.` with the product words and live names | 0 of 40 | 0.9% | 39 of 40 |

Speaking is the speech endpoint with the female voice and no
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
cache folder, keyed by the model size and the voice. Each file is named by its key and
a short hash of its words, so a phrase with new words renders a new clip and the old
file is never played. The app reads them into
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
appears in any log. It also checks the turn rule. A thump as the microphone opens is not a
turn, a quiet request at 0.15 and 0.06 of its level is one turn that is sent, a request with a 1.35 s pause is one turn that ends after it, a long silence leaves
voice on, five minutes of room sound with no speech in it is never a turn, a request
spoken among that sound is sent word for word, two turns in a row each get a spoken
reply with the speaker echoed into the microphone, and a click turns voice off.

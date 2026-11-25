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
   speech started, so its first word is not cut. The plain level of the whole
   band only tells a waiting reply whether the room has been quiet. It is
   compared against three times the quietest frame of the last 2 s, and never
   against less than 200. The detector is
   described in [The speech detector](#the-speech-detector).
3. The 1.5 s comes from 94 synthetic requests with a pause of 0.4 to 1.5 s
   mid-sentence. A silence of 0.6 s ended 71 of them early, 1.0 s ended 32, 1.2 s
   ended 23 and 1.5 s ended 10. It is the shortest of those that ends at most 15
   early. Waiting 1.5 s instead of 0.6 s adds 0.9 s between the end of speech and
   the acknowledgement. The time from the end of the turn to the clip's first sound is
   unchanged. In ten runs of the voice journey on the CPU engine it was 187 to 206 ms,
   with a median of 201 ms. A model that judges the end of a turn is later work.
   Interruptions are described in [Talking over Voyager](#talking-over-voyager).
4. Hearing and routing start the moment the turn ends, and nothing plays while they
   run. The control shows Hearing. The routing call chooses the acknowledgement for a
   request for Voyager from a closed set, and the app owns its words, as
   [Small talk](#small-talk) describes. Voyager's standing can replace the line with
   one that says it is queued, blocked or gone. No line names an action or claims a
   result.
5. Omni turns the samples into words. The prompt names the
   product words and the user's own Voyage and Fleet names, read from the workspace
   state the owner already holds, so hearing adds no inspection call. Right
   after hearing, `speech::heard_nothing` drops a transcript with no letter or
   digit. Nothing more is said and nothing is sent. If hearing fails, "I didn't
   catch that." follows and nothing is sent. No filter over the heard words drops
   a request, because such a filter drops real requests it did not foresee.
6. Small talk is answered by the voice itself and goes no further, as
   [Small talk](#small-talk) describes. Every other request goes to Voyager as `[spoken] <words>`, built by `spoken::prompt`, through the
   same send the chat box uses. The focus hook reads the marker and tells the app that
   the turn is spoken.
7. Listening resumes when the last sound of the turn ends. A new request while Voyager works queues
   for it.

The microphone is closed whenever the app's own audio plays, so the app never hears
its own voice as a turn. The one exception is a reply played with talk over on, which
[Talking over Voyager](#talking-over-voyager) describes.

A click turns voice off in any state. It stops listening at once and drops a sentence
that the person was still speaking. Audio that is already playing, the acknowledgement or
a reply, finishes, and then voice is off. Only the app quitting cuts audio. A turn that
had already ended is still sent, Voyager's work is not cancelled, and its reply lands in
the chat without being spoken.

If the microphone cannot be opened or its stream ends, voice stays on. The control
shows "Can't hear the microphone" in a colour that is not green, and the voice says
"I can't hear your microphone." once for that outage. The app tries again every 3 s
and turns green when the microphone is back.

Every fixed phrase the voice says is in this table. A clip is cached, keyed by its key and a
short hash of its words. The voice speaks as "I" and never as Voyager.

| Key | Words | Played when | Words sent |
| --- | --- | --- | --- |
| `one-sec` | "One sec." | The routing call chose look, and Voyager is idle or done, or has no state yet, on the first of every four turns | Yes |
| `let-me-look` | "Let me look." | The same, on the second | Yes |
| `checking` | "Checking." | The same, on the third | Yes |
| `okay-checking` | "Okay, checking." | The same, on the fourth | Yes |
| `sure` | "Sure." | The routing call chose sure, with the same standing, on the first of every four turns | Yes |
| `okay` | "Okay." | The same, on the second | Yes |
| `got-it` | "Got it." | The same, on the third | Yes |
| `sure-thing` | "Sure thing." | The same, on the fourth | Yes |
| `queued` | "Queued for Voyager." | Voyager is working | Yes |
| `needs-you` | "Voyager needs you on Home first." | Voyager is blocked, when the words arrive or while a spoken turn is open, or Core refuses a send with kind `blocked` | No |
| `not-running` | "I couldn't pass that to Voyager." | Core refuses a send with a kind not listed in this table, including `conflict` | No |
| `gone` | "Voyager isn't running." | No Voyager is bound, Core reports the program ended or gone, or Core refuses a send with kind `not_found` or `finished` | No |
| `busy` | "Voyager can't take that right now. Try again in a moment." | Core refuses a send with kind `busy` | No |
| `disconnected` | "I lost the connection to Voyager." | Core refuses a send with kind `disconnected` | No |
| `missed` | "I didn't catch that." | Hearing failed | No |
| `no-microphone` | "I can't hear your microphone." | The microphone cannot be opened or its stream ends, once for each outage | No |
| `failed` | "That didn't work." | A spoken turn ends in failure | No |

The words in the table never name an action or claim a result, and none points to the
chat. When the routing call chose none and Voyager is idle, done or has no state yet,
nothing plays and the words are sent.

## Without the voyager command

Voyager's replies reach the app through hooks that run the `voyager` command
beside the app's executable. When that command is missing, the app does not
start the background Voyager and binds none. The owner holds that reason, and
the canvas reads it through `voyager_unbound` on every render. Whenever no
outcome line is showing, the canvas status line says that Voyager cannot reply
because the command is missing. A later change to the layout does not remove
that line. The line stays for the whole run of the app, because the
app looks for the command only when it starts. Starting the app again with the
command beside it clears the line and starts Voyager. The app does not search
for the command elsewhere, retry or start Voyager without hooks, because a
Voyager without hooks drops every reply and says nothing.

## Small talk

After hearing, one text call to the Omni engine decides who answers. `voice_route::Route`
is the result. It is either `Chat`, which holds the voice's own reply, or `Voyager`.
Only `Route::parse` builds one, and every way it can go wrong gives `Voyager`, so a
request is never dropped.

The call sends `voice_route::route_prompt` with a few worked examples and then the heard
words. The prompt is a short routing rule followed by `spoken::TALK`, read from its one
owner, so the voice's replies follow the same spoken guide as Voyager's. The answer is
held to one of two JSON shapes, `{"kind":"work","ack":"none"}` with `ack` one of `none`,
`look` and `sure`, or `{"kind":"chat","say":"..."}`. The schema lists `kind` before
`ack`, so the model writes the kind first, and the body is written by hand because
`serde_json` sorts the keys of a `Value`. A work answer has no room for words, so the
voice never writes an acknowledgement for work and cannot promise to do it. It only
chooses one. The routing rule asks for `none` for a plain command whose effect
the person will see, and for never mind or cancel. It asks for `look` for a
question, a lookup, a status check or a summary. It asks for `sure` for a
message to the crew or a start or stop of work. Every way the
route can go wrong gives none. The call has 3 s, a target to measure.

The prompt is the routing rule, then the spoken guide, then one closing rule for chat,
`voice_route::CHAT_CLOSING`. A chat reply must never offer, ask whether to do something
or say what Voyager will do, so the closing rule comes last and says it wins for chat.

The model's kind and its confidence decide. The answer is `Chat` only when the model
says chat and the probability of chat at the kind token is at least 0.99, the gate from
the voice experiment's round 7. Three word lists stand behind the gate as belts. None
decides on its own, and each can only move a turn to Voyager. A chat reply that
offers to do something goes to Voyager. Such offers include "want me to", "shall
I", "I can help", "I can show", "can I get", "what can I do", "I'm here to
help", "what would you like", "I'll" and "let me". A chat reply that holds an
action word, such as "on it", "done",
"opening" or "ask", or a workspace word such as "Fleet" or "build", goes to Voyager too.
A bare "I can" is not an offer, so "Yes, I can hear you." stays small talk. Heard words that hold
"help", "can you do", "never mind" or "cancel" go to Voyager, whatever the model
said.

A `Chat` turn is spoken through the speech endpoint, one sentence piece at a time as Voyager's replies are, and sends nothing to Voyager, and
the reply is added to the chat. It is answered whatever Voyager's standing. If the
route call fails or the reply cannot be spoken, the turn goes to Voyager as any other
request.

The first sound of a turn is the chat reply, the line the routing choice names, or for
none Voyager's spoken reply. Nothing plays before the turn is decided. A request for
Voyager never gets a chat reply.

The voice journey's `acknowledgement-is-prompt` case holds the median first sound for
look and for sure each under 2,100 ms. That is the test fixture's CPU-engine bound, not
what a person hears. In the sandbox's CPU engine on 23 Nov, hearing took about 0.39 s and
routing about 1.19 s, and the first sound came at a median of 1,730 ms for look and
1,901 ms for sure, against 211 ms for the hum it replaced. The bound sits about 200 ms
above the slower median, about twice that run's widest spread of 125 ms. None is
recorded only, because its first sound is Voyager's reply.

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
set and 4.8e-6 over 47 recordings of a real voice.

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

The real-voice proof is 47 recordings of a real voice, used under their owner's
terms. They
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
Voyager starts every reply with, and any text ahead of the first marker, so neither
the filter below nor the chat note holds them. The reply is only what follows the
first marker. That text alone is spoken and shown, and the marker never is.

A spoken turn is read aloud once. The rule is `voice_reply::Watcher`. A turn is a
candidate when its final `Stop` is recorded and Core answers that Voyager is not
working. Only an answered "idle", "done" or "error" counts. Three answers count
as unknown: a failed read of Core, an answer for a live program that carries no
state word, and a state word the app cannot read. The rule waits on an unknown
standing and never speaks. Then the speech filter takes the final message. It
drops code, tables, paths, hex runs of seven or more characters with a digit,
and letter-digit identifiers such as `t8s`, `w1:t3`, `fleet-25` and
`terminal-34`. It gives each list item, heading and paragraph a sentence end. It
says plain numbers as words, and the engine reads what is left one piece at a time, as
[One piece at a time](#one-piece-at-a-time) describes.
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
The listener checks the switch again once it holds the floor, so a click-off while a reply plays never opens the microphone again. Listening resumes when it ends. With
talk over off, the reply thread plays the reply and the floor lock keeps the microphone
closed. With talk over on, the listening thread plays it and keeps the microphone open,
as [Talking over Voyager](#talking-over-voyager) describes.

### One piece at a time

The engine garbles a long synthesis. Six long replies of 67 to 119 words were sent to
the engine as the app sends one, three runs each on the CPU engine and one on a GPU
engine like the trial's, and a local Whisper model heard each clip back. As one
synthesis, five of the six garbled in every run, with 18 to 67% of their words wrong
on the CPU and 21 to 60% on the GPU. The engine repeated, skipped and blurred words from
about the 35th to 45th word of prose and the 13th to 28th of a dense list. The same text
sent one sentence a request had 0 to 7% wrong, and the 67-word reply of three sentences
did not garble either way. A hearing request beside the render and the 30 s request
limit made no difference, and the server logged no truncation. One synthesis also
stops at 40.96 s of audio, which 6 of the 24 single renders reached, so a longer
reply lost its end. The same numbers reply had "1,200", "50%" and "6.5" heard as "one
tuum tuv", "fifty perms" and "six-fived" even one sentence a request.

So `SpokenText` holds the reply as pieces, and `Speaking::speak` takes one `Piece`,
which only the filter builds. Each sentence is a piece. A sentence of more than
`PIECE_WORDS`, 25 words, splits after its last comma, semicolon or colon within the
first 25 words, and again for the rest. A sentence with none there is cut at the 25th
word, and the app logs "A spoken sentence had no comma within the piece limit, so it
was cut at the limit." once for that reply. The pieces hold every word of the spoken
text in order. The longest sentence in the runs was 23 words and 9.8 s of audio, and the
slowest rate seen was 0.94 s a word, so 25 words is at most about 23.5 s, far under the
40.96 s stop.

The filter says a whole number, a number with thousands commas, a decimal and a percent
as words, so "1,200" is "one thousand two hundred", "6.5" is "six point five" and "50%"
is "fifty percent". It leaves other text with digits as it is, such as a time like
"4:20", an ordinal like "3rd" or a list of numbers like "1,2,3".

The reply thread renders the first piece before it takes the floor, as it did the whole
reply before. While a piece plays, a second thread renders the next one, so only the
first render comes before the first sound. The whole reply plays through one speaker
stream. `Speaker::play` takes the reply as a stream of clips, `voice_parts::Clips`, and
writes each clip to the same player as soon as it is rendered. A reply therefore starts
one player, with no process start between sentences. The floor stays taken until the
last clip has played. The speaker never pauses while the next sentence is ready. A slow engine can
still leave a pause while the next sentence renders, most often after a short first
sentence. On the development laptop's CPU engine one such wait was 1.0 s at a load of 12
and 0.5 s at a low load, and a run at a load of up to 66 had waits of 7.7 and 3.9 s. No
wait was seen on a GPU engine. The engine's own speech pauses up to 660 ms between and
inside sentences, measured over 12 joined replies. A click-off lets the whole
reply that is playing finish, every piece of it, including pieces still rendering, and
then voice is off. Only the app quitting cuts it, and a reply that arrives after the click
is not played. A piece that fails to render ends the reply
there and reports its reason, as a failed render did before. The reply is added to the
chat once, when its first piece starts. The trace marks `speech-started` with the whole
spoken text once, `speaker-opened` once for the stream, `piece-rendered` with each
piece's words when its render ends, and `piece-started` with each piece's words when that
piece is handed to the player.

First audio is the wait for the render of what plays first. With one synthesis it was
the whole render, 11.9 to 28.2 s with a median of 17.1 s on the CPU engine of a machine
at a load of 17 to 22 on 24 cores, and 2.2 to 4.5 s with a median of 3.9 s on the GPU.
One piece at a time it was the first piece's render, 0.86 to 12.0 s with a median of
3.5 s on that CPU, and 0.20 to 0.81 s with a median of 0.57 s on the GPU. On the GPU no piece waited for
the next render. On the loaded CPU 15 of 18 runs had no wait, and the other three waited
at most 1.2, 3.9 and 8.6 s once, when one 13-word sentence took 10.2 s to render 4.8 s
of audio.

### Talking over Voyager

With talk over on, the microphone stays open while a reply plays, and speech stops the
reply. `voice_settings::TalkOver` is the setting. It is `Auto`, `On` or `Off`, and
`Auto` is the default. `Off` keeps the paused microphone described above. `On` always
keeps the microphone open. `Auto` keeps it open only when the default output is
headphones.

`TalkOver::from_environment` is the one place the setting is read. It reads the launch
variable `VOYAGER_VOICE_TALK_OVER` once, when the voice layer starts. The values are
`auto`, `on` and `off` in any letter case, and an unset variable means `Auto`. Any
other value also means `Auto`, and the app logs one line that names the variable and
the value it got. The app has no stored voice setting yet, so the variable is the only
way to change it.

`audio_io::headphones_in_use` answers that. It runs `pactl --format=json info` and
`pactl --format=json list sinks`, which only read. The default sink counts as
headphones when its `device.form_factor` is `headset`, `headphone` or `hands-free`, or
when its active port has the type `Headphones`. A failed command, an answer that cannot
be read and a missing default sink all count as speakers, so the microphone is paused.
The reply thread asks once for each reply, after the first piece is rendered, so
plugging headphones in or out takes effect at the next reply. A Bluetooth or USB
speaker that reports no form factor is read as a speaker. Headphones that the system
does not label need `On`.

The reply thread never plays a talk-over reply itself. It offers the reply to the
listening thread through `voice_parts::Floor`, as a `Reply` that holds the spoken text,
the first rendered clip and the stream of the clips still rendering. The listening
thread takes the offer at the moment it would have stepped aside, which is the same
quiet moment a reply waits for with talk over off. It then plays the reply and keeps
reading the microphone, so one thread owns both. No listener may hold the floor,
because voice was clicked off or the microphone is out. Then the reply thread
takes its offer back, and plays or notes the reply as it does with talk over
off. Only a reply is
offered. A fixed clip still takes the floor, and so does a reply while talk over is
off.

The listening thread moves the reply through four states, `Stage` in `voice_layer.rs`.

| State | Meaning | What ends it |
| --- | --- | --- |
| `Playing` | The reply sounds and the microphone is read. | Speech starts, which gives `Cut`, or the last piece ends, which gives `Listening`. |
| `Cut` | The reply is stopped at a piece and the person is speaking. | Their turn ends and is heard, which gives any of the other three. |
| `Listening` | The reply is over, and listening goes on with the same microphone. | Nothing. It is the end. |
| `Answering` | The reply is over, and the person's words need an answer. | Nothing. The turn is answered as any other. |

The gate's speech onset, 0.1 s of frames at or above 0.3, stops the reply at once.
`voice_talk_over::Playing` runs the speaker's finish on a helper thread and asks it to
cut, which kills the player. The helper looks for that request every 20 ms. The voice
interruption experiment of 23 Nov 2026 measured the onset at a median of 140 ms and a
killed player silent within 12 ms, both on synthetic speech outside the app. Neither is
measured in the app or on a real voice.

The reply's clips stay in memory while it is talked over, in `voice_talk_over::Held`,
so a resume replays them without another render. `Playing` records when each piece it
hands to the player starts to sound. That is the time the piece before it ends, or the
time of the hand-off when the player had run dry. The piece cut is the last one whose
start has passed. The player's own 40 ms buffer is not counted.

When the person's turn ends, the engine hears it and `voice_talk_over::interjection`
sorts the words. It lowercases them, keeps only letters and digits, and compares the
whole utterance with two tables. It never looks for a word inside a sentence, so "yeah
but wait, open the logs" is a steer.

| Kind | Whole utterance | What follows |
| --- | --- | --- |
| Backchannel | yeah, mm-hm, mm-hmm, mhm, uh-huh, okay, ok, right, sure, got it | The reply plays again from the start of the piece it was cut in. |
| Stop | stop, wait, hang on, hold on, never mind, shush | The reply stays stopped and nothing is sent. |
| Steer | Anything else | The words go to Voyager and the reply stays stopped. |

A turn with no letter or digit in it, such as a cough, resumes the reply as a
backchannel does. If hearing fails, "I didn't catch that." plays and the reply stays
stopped. A steer goes through the same send as any request, so Voyager's standing and a
refusal are handled the same way. It makes no routing call. `spoken::cut_off_prompt`
builds its prompt in this shape.

`[spoken] [cut off] You were saying: "<the piece cut>". Not heard: <n> more sentences. They say: <the words>`

The count is of the pieces after the one cut. The rules Voyager reads at every prompt
carry `spoken::cut_off_rule`, which says that such a prompt continues its previous
answer. The whole reply is added to the chat when its first piece starts, as with talk
over off, so the part that was not spoken is in the chat after a cut.

The control shows `Phase::SpeakingOpen` while a reply plays with the microphone open.
It is green, and its tooltip reads "Listening. Talk any time to interrupt.". With the
microphone paused the phase is `Phase::Speaking`. It is grey, and its tooltip reads "Mic
paused while Voyager speaks.". When speech cuts the reply the control shows Listening, and then Hearing
while the engine hears the words. The wave is green only while the microphone is read.

A click-off while a reply plays with the microphone open closes the microphone at once
and lets every piece finish, as it does with talk over off. The control shows
`Phase::Speaking` for the rest of that reply, because the microphone is closed. A
microphone stream that ends does the same and then shows "Can't hear the microphone".

These limits are known. The acknowledgement and every fixed clip still pause the
microphone. For the first 0.3 s after the microphone opens the gate is settling and
hears no onset. With `On` and loudspeakers the app hears its own reply as speech and
cuts it. The backchannel and stop words are matched as the engine spells them, and its
spelling of sounds such as "mm-hm" is not measured. No real voice or room has been
tried, so how often a cough, a keyboard or another person stops a reply is not known.
The trace marks `speech-cut` with the words of the piece cut.

### How Voyager talks

Voice is the primary surface, and the chat is an alternative. Voyager should sound
like a friend who knows the system inside out and explains it in plain words. One
guide says who Voyager is and how it talks. It is stored once, as two files:
`app/src/spoken_who.md` holds "Who you are", and `app/src/spoken_talk.md` holds the
sections from "How you talk" to "Examples". `spoken::guide` joins them, and a test
holds the joined text to the approved text byte for byte.

The guide asks for the answer first, in the words a person would use. It asks
for no ids, revision numbers, paths, commands or words from inside the app, such
as placement, pane, viewer or request. It never says what the app calls
something. It gives the
gist of what is happening, what is stuck and what needs the person, not an inventory,
and names individual things only when asked or when one needs them. Most answers are
one or two sentences, and Voyager does not offer more, because the person asks when
they want it. It does only what was asked. It says something is done only when it saw
it happen, said as what changed for the person, and it does not describe its own
checking or list what it did not check. When something fails, it says in one sentence
what failed and why. A spoken answer is the whole answer, with no lists, symbols,
paths or code, and it never points to the chat.

The background Voyager reads the guide in two places. Its launch prompt is the
background-session line, the reply-marker rule `spoken::reply_rule`, the cut-off rule
`spoken::cut_off_rule` and the guide.
Claude Code ignores the launch prompt on a resumed conversation, so the focus hook
sends the same text after the dock line at every prompt. The background-session line
stays beside the marker rule because it is part of the marker mechanism. It lets
Voyager drop a personal reply prefix that the person's own instructions name. The
hook text is 4,084 bytes, and a test holds it under 4,100, because it is sent on
every prompt. It adds no tool call or round trip. The bound is the text's length plus
about 70 bytes, so any longer wording fails the test and is timed again before the
bound moves. The cut-off rule added 52 bytes to the 4,032 that the guide alone gives. The guide grew from a 3,130-byte hook text, and the voice model and the
small-talk router read it too. On the voice journey's `acknowledgement-is-prompt`
case, the longer guide measured a first-sound median of 236 ms against 254 ms for the
shorter one, and a heard-to-routed median of 885.5 ms against 886 ms. The voice
model's prompt in `conversation_audio.rs` reads `spoken::TALK` and leaves out "Who
you are", because the voice model has no `voyager` or `hc` commands.

Three checks hold this in place. A unit test in `spoken.rs` holds the joined guide
to the approved text byte for byte, by length and sha256, so any drift in wording
fails. A unit test in `focus_hook.rs` holds the hook text under 4,100 bytes and
checks that it carries the background-session line, the marker rule, the cut-off rule
and the guide.
The `adopt-by-label` journey's `focus-hook-names-dock` case reads the stand-in
agent's scrollback and requires the docked Vessel's name to end the first line of
the hook's context, so the dock still comes first ahead of the longer guide.

The filter keeps only a safety ceiling for runaway text, `CEILING_WORDS`, 120 words. It
is a target to measure, and not a measured limit. The engine's 30 s limit per request
now applies to one piece. The ceiling acts on the whole reply, before it is split into
pieces. Past it the filter cuts at the last whole sentence within the ceiling, when that
sentence ends in the second half of the kept words, or at the ceiling when there is
none. A run-on reply with no full stop in the second half is cut at word 120. Only then
is the kept text split into pieces, so no piece is cut mid-sentence by the ceiling. It adds no words and no pointer to the chat, and it writes one log line,
`speech::CEILING_CUT`, each time it cuts, when the reply is spoken. A reply short enough for the guide never
reaches the ceiling.

The chat was empty for a voice turn because Voyager's replies reach the app only through
the reply store, which feeds the speaker and the agent socket. The chat is the private
conversation, a separate surface that held only refusal notes. Nothing wrote a spoken
reply into it, so the chat could not hold what the voice said. A note never takes the
place of a user turn. While a first message is starting, notes keep their oldest-first
trim but never trim out the accepted message.

## The seam

`app/src/speech.rs` holds the traits `Hearing` and `Speaking`, the `Engine` that pairs
them, the clip table and the speech filter. `app/src/voice_route.rs` holds `Routing`, the
`Route` it gives and the routing prompt.
`SpokenText` and its `Piece`s can only be built by the filter, so unfiltered reply text
never reaches an engine. The filter keeps every paragraph, drops code, tables, links,
paths and long ids, says plain numbers as words, and stops only at the safety ceiling.

`app/src/voice_layer.rs` owns the exchange. A click flips the switch at once from
the canvas thread. One listening thread converges on it, so two utterances never
overlap. It reaches Voyager through the `Voyager`
trait, which reports its standing and takes the words. `app/src/voice_voyager.rs`
implements it over the application queue. It reads the terminal that the app
wrote in its own binding file and asks Core for that terminal's reported status.
It sends the words with Core's own send, which refuses a blocked program and
never forces. With no
binding, or a program that Core reports ended or gone, Voyager counts as not running and
nothing is sent. A failed read of Core, or a live program that has not reported a state
yet, is unknown. The words are sent anyway, and Core's send refuses honestly if it must.
Speech does the opposite and waits on an unknown standing.
A send that Core refuses after the acknowledgement is a known refusal. The app plays
one cached clip chosen by Core's refusal kind, adds the refusal as a line in the chat,
and shows it in the voice control's tooltip. Each clip is true for every kind mapped to
it, and an unknown kind keeps "I couldn't pass that to Voyager." The table above lists each kind.
An unconfirmed send stays silent and is shown only in the tooltip. A send is never repeated.
Audio goes through the `Audio` trait. `System` implements it with `parec` and `paplay`, the
PulseAudio command line tools, which PipeWire also serves. Linux is the only verified platform.

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
| `VOYAGER_VOICE_TALK_OVER` | Whether speech can stop a reply, as `auto`, `on` or `off`. Defaults to `auto`. [Talking over Voyager](#talking-over-voyager) describes it. |
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

The clips in the table are rendered through the engine and kept in the user cache
folder, keyed by the model size and the voice. Each file is named by its key and a short
hash of its words, so a phrase with new words renders a new clip and the old file is
never played. Voice is ready as soon as the engine has warmed up. The clips are read or
rendered after that on their own thread, one at a time, and each is used from the moment
it is kept, so a fresh cache never holds up the control. A clip that is not kept yet plays
nothing. The turn goes on without it, and a reply clip such as "That didn't work." is
reported as not kept. A kept clip then costs no model run before it starts.

A kept clip must fit its words. The engine sometimes rendered "Mm-hm.", the hum that the
chosen lines have since replaced, as a long murmur.
In 66 renders with the app's request on the journey's CPU engine, 20 ran past 2.44 s and
the longest stopped at the engine's 40.96 s limit. A run-on is sound almost to its end
(40.96 s became 40.80 s with its leading and trailing silence trimmed), so trimming does
not fix it. A fixed seed made every render identical and a token cap held renders under
3.2 s, but neither stops a run-on. Before this rule the voice played the whole hum before
the reply, so a 28.9 s hum held a small-talk reply for 29 s, and 4 of 15 kept journey runs
failed on it.

A clip fits when its audio lasts at most 1.5 times 1.288 s plus 0.056 s for each character
of its words. 1.288 s plus 0.056 s a character is the upper envelope of 253 renders of 17
texts that never ran on. They are every other fixed phrase, short words such as "Sure."
and "You?", and the clips kept by 16 journey runs. The hum is not among them, so its
own renders were checked separately. "Mm-hm." may last 2.436 s. Its longest good render
was 1.92 s and its shortest run-on 2.96 s. The rule is `omni::longest`.

A kept clip starts 145 ms before its first sound. The engine opens every render with 95
to 340 ms of near silence, a median of 180 ms over 270 kept clips, and the first sound of
a turn waits for it. Over nine journey runs the first-sound median was about 75 ms plus
the hum's opening silence, from 201 ms after a 120 ms opening to 324 ms after a 260 ms
one, past the 300 ms check. The first sound is the first 5 ms with a level over 100. The
quieter rise into it lasted at most 95 ms in those 270 clips, a median of 10 ms, and
145 ms is 1.5 times that rise rounded up to the 5 ms step, so trimming never cuts it. A
clip whose sound starts sooner, or that holds no sound, is kept whole. The trim comes
before the length rule, on load and on render, so a clip kept by an earlier version is
trimmed too.

`omni::prepare_clips` applies the rule on load and on render. A kept clip that does not
fit is treated as missing, so a run-on kept by an earlier version is rendered again. The
engine streams speech while it renders. The first audio arrived 0.12 s after the request
and about 0.08 s of audio followed every 20 ms in 30 renders. A render stops reading as
soon as its audio passes the limit, about 0.7 s into a run-on "Mm-hm.", and the clip is
rendered again, at most five times. Five comes from the run-on rate. 20 of 66 renders ran
on, and 0.30 to the fifth power is about 0.24%. The trace marks `clips-kept`
once every phrase has been read or rendered. When no render fits, nothing is
kept for that phrase. The app logs "The voice clip one-sec ran past the length
its words allow in 5 renders, so it is not kept." with the clip's key. Voice
runs without that clip, and the next launch tries again. Spoken replies are not
held to the rule.

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
synthetic speech the words heard. Every mark is written as one whole line under one lock, so marks from the
listener, the reply thread and the render thread never interleave. The app never sets it, so a real session records
no words.

## How it is checked

The native `voice` journey in [the verification guide](../tests/native/README.md#the-voice-journey)
clicks the real control, feeds committed synthetic speech to the microphone and records the
speaker. It checks that nothing records the microphone without a click, that the words come
back exactly as spoken, that only the line the routing choice names reaches the speaker and that no audio payload
appears in any log. It also checks the turn rule:

- A thump as the microphone opens is not a turn.
- A quiet request at 0.15 and 0.06 of its level is one turn that is sent.
- A request with a 1.35 s pause is one turn that ends after it.
- A long silence leaves voice on.
- Five minutes of room sound with no speech in it is never a turn.
- A request spoken among that sound is sent word for word.
- Two turns in a row each get a spoken reply, with the speaker echoed into the
  microphone.
- A click turns voice off.

A long reply of 117 words is heard back by the engine with at most a tenth of its
words wrong. Its long sentences are split at a comma or at the limit, and its
numbers are spoken as words. With Auto on the fixture's speakers, speech fed while a reply plays neither
cuts it nor becomes a turn.

The `voice-talk-over` journey in [the verification guide](../tests/native/README.md#talking-over-a-reply)
launches the app with talk over on. While a reply plays the wave is in the open-microphone
state. "Yeah." cuts the reply, which then plays again from the start of the piece it cut.
"Stop." leaves it stopped, sends nothing and leaves the whole reply in the chat. A sentence
reaches Voyager's stand-in as one cut-off prompt.

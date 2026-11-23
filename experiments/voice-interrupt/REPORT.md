# Experiment: interrupting and steering Voyager by voice (23 Nov)

Branch `experiment/voice-interrupt`, commit "Add the voice interruption experiment's measurement scripts" and the follow-up commits. Scripts are in `experiments/voice-interrupt/`, and run output is in `/var/tmp/voyager-crew/scratch/voice-interrupt/runs/`. No product code changed, and no PR was opened. Isaac's live mic, speakers and running app were never used. Playback ran in a private PipeWire inside bwrap with no `/dev/snd`, and Omni ran as my own server on port 8131. Speech is Edge TTS, the app's own lfm3 reply samples, and Pipecat's public human test clips. None of Isaac's recordings were used.

Following Overwatch's steer, headphones are assumed in Part 1 (no speaker sound reaches the mic). Part 2 is the echo research for use without headphones.

## Part 1: the product design with headphones

### The design in one paragraph
A voice setting, **Talk over Voyager**, with Auto (default), On and Off. Off keeps today's paused mic. When it's on, the mic stays open while Voyager speaks, and the button stays green. When Isaac starts speaking, the reply stops within about 0.2 s. When his words end, one of three things happens. A backchannel ("yeah", "mm-hm") resumes the reply from the start of the interrupted sentence. A bare stop ("stop", "wait", "hang on") leaves it stopped. Anything else goes to Voyager on the existing send path, as a follow-up that says where the reply was cut. The end of a turn moves from 1.5 s of silence to Smart Turn v3.2 on top of Silero: one check after 0.2 s of silence ends a finished sentence, and an unfinished one waits up to 3 s. The hum and the fixed "Asking Voyager" go. The routing call picks the acknowledgement from a closed set (none or look), and the app owns the words.

### 1. Barge-in: stop latency, and what happens to the rest of the reply

**Measured**
| Step | Median | p90 | Source |
|---|---|---|---|
| Silero onset on clean speech while a reply plays (today's 5-frame onset) | 140 ms | 190 ms | 47 requests, `runs/barge-headphones-onset5.json` |
| Same with a 3-frame onset | 100 ms | 144 ms | `runs/barge-headphones-onset3.json` |
| `paplay` killed to silence at the sink, `--latency-msec=40` | 6.5 ms | 10 ms (max 11) | 20 trials in a private PipeWire, `runs/stop-latency-40.json` |
| Same, `--latency-msec=20` | 6.9 ms | 9 ms | `runs/stop-latency-20.json` |

Not measured: today's 20 ms cut poll in `Playing::finish` (up to 20 ms), and the real device buffer after the sink. A PipeWire quantum of 1024 at 48 kHz is 21 ms, an estimate and not measured here. Summed: about 140 + 10 + 7 + 21 ≈ **180 ms median and about 250 ms p90**, under the 300 ms target with today's onset rule. Detection dominates. The stop itself is under 12 ms.

**Backchannels look like stops.** "Mm-hm", "yeah", "okay", "right", "uh-huh", "sure", "wait", "stop", "no, no" and "hang on" all triggered an onset in all 3 voices, with 0.28 to 0.92 s of speech each (`runs/backchannel.json`). Length can't tell "yeah" from "stop", so the reply must stop first and the heard words decide what follows:
- **Backchannel only** (a closed list of whole utterances: yeah, mm-hm, uh-huh, okay, right, sure, got it): resume from the start of the interrupted sentence. The speaker already plays the reply one sentence piece at a time, so the app keeps the piece list and restarts at the cut piece.
- **Stop only** (stop, wait, hang on, hold on, never mind, shush): stay stopped and say nothing. The unspoken rest stays visible in the chat, as a click-off reply does today.
- **Anything else:** steer (below).

For 0.1 the whole-utterance word lists are code, an exact match on the heard text and not a keyword search inside a sentence. Folding "backchannel" and "stop" into Omni's routing kinds is the later version.

**Steering through the existing send path.** Voyager today gets `[spoken] <words>` through `voyager.say(spoken::prompt(heard))`. A steer uses the same call, with the cut point in the text:

`[spoken] [cut off] You were saying: "<the sentence Isaac heard last>". Not heard: <n> more sentences. Isaac says: <new words>`

It needs no new wire shape, only a second prompt builder next to `spoken::prompt`. If Voyager's turn is still running (Standing::Working), the send is queued the same way "Queued for Voyager" is today. Claude Code takes a mid-turn message as a follow-up, not a fresh turn. Voyager's instructions need one line telling it that a `[cut off]` prompt continues its previous answer. The chat marks the cut reply's unspoken part, as it does after a click-off.

**Limits.** Detection was measured on synthetic speech over -65 dBFS noise, through a Python port of the app's Gate and the same Silero v6 model. Real-room false onsets with the mic open while Voyager speaks (coughs, a keyboard, another person talking) aren't measured. With headphones these are the same sounds the mic already hears between turns. That's where the 21 Nov real-mic gate lesson applies, so the barge-in check needs one live check by Isaac.

### 2. Natural end of turn: Silero silence against Smart Turn v3.2 on top of Silero

**Measured on my synthetic set.** 17 sentences, 3 Edge voices, each whole and with a mid-sentence pause of 0.5, 1, 1.5, 2 or 3 s at a filler ("Could you, um... | split the Build Fleet") or a trailing weak word ("The um sound is a bit much for | voice replies"). 306 clips, `runs/eot-1.json`.

| Rule | Mid-sentence pauses cut early (of 255) | Delay after a real end, median |
|---|---|---|
| Silence 1.5 s (main today) | 140 (every pause of 1.5 s or more) | 1.59 s |
| Silence 2.0 s | 87 | 2.09 s |
| Silence 3.0 s | 38 | 3.09 s |
| Smart Turn after 0.2 s silence, threshold 0.7, 3 s fallback | 149 | 0.29 s |
| Smart Turn after 0.2 s, threshold 0.9, 3 s fallback | 116 | 0.29 s |

**Measured on real human speech.** On the same synthetic set, Smart Turn calls about 40% of mid-sentence pauses finished. Round 6's synthetic result was the same. So I scored it on 538 human English clips from Pipecat's public v3.2 test set (CC-BY-4.0, one shard of 3,153 clips, `runs/smart-turn-human.json`):

**Where the 538 clips come from.** They are the public Hugging Face dataset `pipecat-ai/smart-turn-data-v3.2-test`, file `data/train-00000-of-00010.parquet` (486 MB, downloaded into `scratch/voice-interrupt/data-dl/smart-turn-v3.2-test/`). They are its rows with an English language label and `synthetic` false. Its sources are liva_1 (386), midcentury_1 (108), human_5 (35) and human_convcollector_1 (9), from the contributors its card credits: the Pipecat team, Liva AI, Midcentury and MundoAI. Not one of Isaac's recordings was read, copied or used anywhere in this experiment.


| Threshold | Unfinished clips called finished | Finished clips called finished |
|---|---|---|
| 0.5 | 17 of 261 (6.5%) | 269 of 277 (97%) |
| 0.7 | 12 of 261 (4.6%) | 267 of 277 (96%) |
| 0.9 | 7 of 261 (2.7%) | 255 of 277 (92%) |

**Compared with today's silence rule.** The silence rule ignores what was said: it cuts every pause of 1.5 s or longer and nothing shorter, whatever the voice. Smart Turn cuts by what it hears, at about the same rate for any pause under its 3 s ceiling. Smart Turn's cut share is its 4.6% on the human clips. The silence rule's share is from my clips, where only the pause length matters (`runs/eot-1.json`):

| Mid-sentence pause | Silence 1.5 s (today) cuts | Silence 3 s cuts | Smart Turn, 0.7, 3 s ceiling, cuts |
|---|---|---|---|
| 0.5 s | 0 of 51 (0%) | 0% | about 4.6% |
| 1.0 s | 4 of 51 (8%) | 0% | about 4.6% |
| 1.5 s | 34 of 51 (67%) | 0% | about 4.6% |
| 2.0 s | 51 of 51 (100%) | 2% | about 4.6% |
| 3.0 s | 51 of 51 (100%) | 73% | 100% (the ceiling) |

So the share of Isaac's unfinished turns that today's rule cuts equals the share of his mid-sentence pauses that last 1.5 s or longer. Without his recordings I can't measure that share. His transcript shows it happens several times a session. Round 6's synthetic pauses of 0.4 to 1.5 s gave 10 cuts in 94 at 1.5 s. The trade is honest: Smart Turn cuts about 5% of short pauses, which today's rule never cuts, and about 5% instead of all of the 1.5 to 3 s thinking pauses Isaac complained about. With talk-over on, a short early cut costs less, because he can keep talking and it becomes a steer.

**What limits the numbers.** Edge TTS pauses carry no human hesitation cues. The cut is clean speech, then silence, so the synthetic set measures the TTS and not Smart Turn. The human clips come from the same sources as Smart Turn's training data, which flatters it, and they hold no long mid-sentence silences. Neither set is Isaac's voice. Checking more than once per pause made every Smart Turn setting worse (more chances to say "finished"). Inference took a median of 34 ms on one CPU thread (1,359 calls).

**Recommendation.** Silero, then one Smart Turn check after 0.2 s of silence at threshold 0.7. Finished ends the turn. Unfinished waits until 3 s of silence. On the human set that ends 96% of finished turns about 0.3 s after he stops, against 1.6 s today, and it cuts about 5% of unfinished ones. With the mic open during the acknowledgement and reply (part 1), an early cut is no longer fatal: if Isaac carries on, that's a steer. The 3 s ceiling answers "do not cut off by response length" for silences: no thinking pause under 3 s ends his turn unless his sentence sounded finished. Before it ships, Isaac needs one live check with a few deliberate mid-sentence pauses. The model's synthetic and human numbers disagree too much to trust either alone.

**Build cost.** The app has no ONNX runtime. Silero was ported to pure Rust. Smart Turn v3.2 is a Whisper-tiny encoder with a classifier, 8.7 MB as int8 ONNX (BSD-2). A pure-Rust port with a parity check is about 1.5 to 2 days. Adding the `ort` crate instead is a new native dependency and Isaac's call.

### 3. The acknowledgement as a choice

**Measured on the 106 round 7 router lines** (round 7's 64 plus fresh sets 1 and 2), on my own Omni (LFM3-Omni-2B Q4_K_M, the app's llama-server build, GPU), with the app's routing prompt, gate 0.99 and schema (`runs/ack-choice.json`, `runs/ack-enum.json`):

| Variant | Routing right | Workspace requests kept by the voice | Work turns with an acknowledgement | Unsafe acknowledgements | Call median / p90 |
|---|---|---|---|---|---|
| Today's schema (work gives only the kind) | 97 of 106 | 0 | (fixed clip) | 0 | 78 / 120 ms |
| Free-text acknowledgement in `say` | 96 of 106 | 0 | 75 of 82 | At least 9 by reading (invented facts, promises); the regex caught 5 | 115 / 159 ms |
| Closed choice none / look / sure, round 1 (app's 14 examples) | 97 of 106 | 0 | none 10, look 70, sure 1 of 81; 42 of 72 graded choices as expected | 0 by construction | 121 / 149 ms |
| Closed choice, round 2 (7 more examples, worded unlike the test lines) | 97 of 106 | 0 | none 33, look 45, sure 3 of 81; 63 of 72 graded choices as expected | 0 by construction | 141 / 166 ms |

The free-text version fails Isaac's bar. It said "Let me check." on 50 of 82 work turns, a new fixed phrase. It made up answers ("Two things. The docking change is waiting on a test, and the speech fix needs one more check.", "The Build Fleet ran the latest test about ten minutes ago and it passed."). It promised actions ("Okay, I'll send that to the crew.") and ignored the rule that plain commands get no acknowledgement. Round 7 saw the same: a 2B model writing work text in the router leaks answers.

**The closed choice** (`runs/ack-enum.json`, `runs/ack-enum-2.json`, `experiments/voice-interrupt/ack_enum.py`). The model picks one of three words and the app speaks the line, so it can't state a fact or promise an action. Routing stayed at 97 of 106 with 0 workspace requests kept in both rounds. The grading compares its choice with the label my rule gives each line (none for plain commands and cancels, look for questions, lookups and status, sure for messages to the crew and start or stop). 72 lines are graded; small talk sent on to Voyager is not graded.
- Round 1 picked look for almost everything: 25 of 33 plain commands got look.
- Round 2 added seven examples (three commands, two crew messages, one start, one question). It got 63 of 72 as expected: none on 28 of 33 plain commands, look on 33 of 34 questions, but sure on only 2 of 8 crew messages and starts. The 5 commands still given look were "Restore voyagershell 2.", "Call the Research Notes voyage Roadmap.", a long move and two docks.
- Limit: I wrote round 2's examples after seeing round 1's misses on these same 106 lines, so 63 of 72 is a tuned number, not a held-out one. The labels come from my rule, not from Isaac.
- sure carries no meaning look lacks, and the model rarely picks it. Folding it into look leaves two choices, none and look, and scores 64 of 72.

**Recommendation.** The routing call returns `{"kind": "work", "ack": "none" | "look"}`, with round 2's examples. The app owns a small pool of pre-rendered, varied clips for look ("One sec.", "Let me look.", "Checking.", "Okay, checking.") and plays nothing for none. Drop the hum and the fixed "Asking Voyager". The choice adds about 40 to 60 ms to the routing call (121 to 141 ms median, against 78 ms today), and the button's Hearing state covers the short silence. A wrong none only means silence until Voyager answers. A wrong look only means "One sec." before a command, which is mild. The stage 3 PR should add a fresh held-out set of about 30 lines before it trusts the 64 of 72. Scope: about 0.5 day, with the router's unit tests and the voice journey's acknowledgement cases updated.

### 4. The voice button
Today Speaking, Hearing and Acknowledging all draw the wave grey, with the tooltip "Busy" (`desktop/src/speech.rs`). Isaac reads grey as "I can't talk".

Proposal, as a single rule: **the wave is green whenever the mic would hear him now.**
- Talk over on, Voyager speaking: green wave. The tooltip says "Listening. Talk any time to interrupt." A soft pulse on the green shows Voyager is talking, without changing the colour.
- Talk over off, Voyager speaking: grey wave. The tooltip says "Mic paused while Voyager speaks. Turn on Talk over Voyager in voice settings if you wear headphones." This says honestly why he can't talk.
- On a barge-in, the button switches to Hearing at once, which shows he was heard.
- Hearing and acknowledging with the mic open: green, so a continuation is also visibly welcome.

The avatar's look is Isaac's call, so this goes to him as a card before it's built. Scope: about 0.25 day after the phase split (Speaking with an open or a paused mic).

### 5. How the app knows headphones are in use
**Measured on this machine** with read-only `pactl` queries, each under 10 ms. The default output is a USB SteelSeries Arctis Nova Pro Wireless, with `device.form_factor=headset`. The laptop's analog output shows its Headphones port "not available", so jack detection works. HDMI and the built-in speaker report no form factor.

**Recommendation.** Overwatch's setting, with Auto as its default:
- **Auto:** talk-over is on when the default output reports a headphone or headset (`device.form_factor` of headset, headphone or hands-free, or an active port of type Headphones). Otherwise it's off. The app reads this once when each reply starts, a local query with no extra avatar round trip, so plugging in or unplugging takes effect at the next reply.
- **On:** for headphones the system doesn't label, such as a USB DAC or a wired adapter.
- **Off:** today's paused mic.

What it can't know: Bluetooth or USB speakers that report no form factor are read as speakers (safe: the mic is paused). Open-back headphones at high volume leak a little sound, so the voice journey should keep the existing speaker-to-mic echo case to show the paused mic still holds. macOS (the built-in output's data source reports headphones against speaker) and Windows (endpoint form factor) have equivalents, but neither was measured here.

The voice settings file is a stored shape, so the setting goes to Isaac as a card, with the voice settings work already on the admiral's list.

### Scope and order: three stages, each usable on its own
I recommend Overwatch's order, with one change: the acknowledgement choice is cheap and needs no live check, so it can ship alongside stage 1 or just after it, without waiting for Smart Turn.

1. **Talk over Voyager: barge-in, steering and the button** (about 2.5 to 3 days). It covers the setting (Auto from the output's form factor, On, Off), one thread owning the mic and speaker so the mic stays open while a reply plays, a cut within about 0.2 s, resuming on a backchannel, staying stopped on a bare stop, the `[cut off]` follow-up to Voyager, the green-while-heard button, and native journey cases that feed speech into the fixture mic during a reply. Usable alone: with headphones, Isaac can interrupt and redirect any long reply, the button shows he can talk, and Off keeps today's behaviour. The backchannel and stop handling must ship with it: without them, "yeah" mid-reply would stop the reply and be sent to Voyager as a request.
2. **Natural end of turn: Smart Turn on Silero** (about 2 days). The Rust port with a parity check, the 0.2 s check, 0.7, the 3 s ceiling, and a live check with Isaac's deliberate mid-sentence pauses. Usable alone, with talk-over on or off: replies start about 1.3 s sooner after a finished sentence, and 1.5 to 3 s thinking pauses stop ending his turn. The PR names the declared invariant that holds the end-of-turn silence, if one does.
3. **The acknowledgement as a choice** (about 0.5 day). Closed none or look in the routing schema, varied app-owned clips, and the hum and the fixed "Asking Voyager" removed. Usable alone: it fixes fault 3 by itself, with or without stages 1 and 2. Measured: routing unchanged (97 of 106, 0 kept), 0 unsafe by construction, 64 of 72 choices as expected after one tuning round on the same lines, and 40 to 60 ms added to the routing call.

Total about 5 to 5.5 days. Declared invariants touched: `voice-waits-for-the-speaker` (stage 1: the mic no longer waits while talk-over is on, so the entry must be restated with its guard and check) and `voice-is-click-to-talk` (unchanged).

## Part 2: echo cancellation without headphones (research)

**Set-up.** 137 s of app speech (8 Edge replies and the 8 lfm3 reply samples), played through a simulated laptop: a 200 Hz high-pass, tanh speaker distortion, a synthetic room (RT60 0.35 s), 100 ms of playback-to-capture delay, and -65 dBFS noise. The echo reaches the mic at -6 to +12 dB relative to the person's voice. The cancellers are speexdsp 1.2.1 (built from source, 300 ms filter) with and without its residual suppressor, and WebRTC AEC3 through LiveKit's build of the WebRTC audio processing module. Silero and the Gate port judge the output. Files: `runs/false-*.json`, `runs/barge-echo.json`.

**False barge-ins from the app's own speech, per 2.4 minutes of replies**
| Echo vs voice | No canceller | speexdsp | speexdsp + residual | WebRTC AEC3 |
|---|---|---|---|---|
| -6 dB | every reply | 2 | 8 | 0 |
| 0 dB | every reply | 1 | 8 | 0 |
| +6 dB | every reply | 10 | 8 | 1 (in the first 10 s) |
| +12 dB | every reply | 1 | 10 | 1 (in the first 10 s) |
| +6 dB, strong distortion | | 11 | | 0 |
| +6 dB, 250 ms delay, no delay hint | | 5 | | 0 |
| +6 dB, RT60 0.7 s | | 6 | | 2 (in the first 10 s) |

AEC3 removed 30 to 52 dB of echo, against 12 to 21 dB for speexdsp. It cost about 0.6% of one core. Every AEC3 false barge-in fell in its first 10 s, while it adapts. In 94 barge-in trials it had none after that.

**Real speech heard during playback** (47 requests starting mid-reply, the reply cut 30 ms after the onset)
| Canceller, echo vs voice | Onset after the true start, median / p90 | Missed |
|---|---|---|
| WebRTC AEC3, 0 dB | 0.35 / 0.96 s | 1 of 47 |
| WebRTC AEC3, +6 dB | 0.49 / 1.33 s | 8 of 47 |
| speexdsp, 0 and +6 dB | 0.14 / 0.21 s | 0, but it fires on its own echo all the time |

AEC3 holds back the person's voice while both talk, so a barge-in over speakers misses the 300 ms target. That is the measured reason headphones are right for 0.1.

**What limits these numbers.** The room is simulated: no real laptop speaker, mic or clock drift. The LiveKit binding exposes no AEC3 tuning, so its double-talk suppression couldn't be tuned. Speech heard through the canceller wasn't scored for words.

**In-app WebRTC on every platform, or each system's own?** Not measured on macOS or Windows. Known from the libraries, not measured:
| Option | Coverage | What it cancels | Cost and risk |
|---|---|---|---|
| WebRTC AEC3 in the app | One code path on Linux, macOS and Windows | The app's own speech, with its exact PCM as the reference | A C++ dependency (the `webrtc-audio-processing` crate builds it from source), or LiveKit's prebuilt library. The app must feed it the playback reference and handle delay, which AEC3 estimated itself here (no hint needed) |
| PipeWire `module-echo-cancel` (Linux) | Linux only | Whatever plays to its virtual sink | The same WebRTC library (webrtc-audio-processing 1.3 is installed here), so the quality should match the table above. It changes the user's audio graph: virtual devices appear, and a crash leaves them behind |
| Voice Processing I/O (macOS) | macOS only | The app's output through the same unit | An Objective-C bridge from Rust. It also ducks other apps' audio unless that's configured. It's the canceller FaceTime uses |
| Windows communications AEC | Windows only | Depends on the driver's audio processing | It varies by device |

**Recommendation.** After 0.1: WebRTC AEC3 in the app on every platform, since it gives one tested path with the exact reference, and keep the paused mic as the fallback. First steps: (1) a fuller binding that exposes AEC3's suppressor settings, tuned on the barge-in set above for under 300 ms; (2) a real-room check on a laptop speaker and mic, which needs a spare device or Isaac's go-ahead to use his; (3) keep the canceller running for the whole voice session, so its 10 s of adapting happens once. About 3 to 5 days, with a real-room proof the deciding step. If the tuned AEC3 still can't hear a barge-in within about 300 ms, the no-headphones mode stays the paused mic.

## Open items (deferred by Overwatch, 23 Nov: headphones cover 0.1)
1. **PipeWire `module-echo-cancel` measured on its own.** Load it in the private PipeWire (`experiments/voice-interrupt/private_audio.sh` with `PRIVATE_AUDIO_SETUP`), play the 137 s reply session into its sink, feed a delayed, room-filtered copy plus the 47 requests into its source through a null sink and a loopback, and score its output with the same Gate and Silero. It answers whether PipeWire's buffering and delay handling match the in-app AEC3 numbers. It needs no new download, since webrtc-audio-processing 1.3 is installed. About half a day, through `heavy voice` because it starts an audio server.
2. **Tuning AEC3's double-talk suppression for barge-in.** Replace the LiveKit binding, which exposes no AEC3 settings, with one that does, such as the `webrtc-audio-processing` crate built from source in a scratch Rust program, or a small C++ harness against the library. Then sweep the suppressor settings on `echo_bench.py --test barge` until onset falls under 300 ms with no false barge-ins after the first 10 s. About 1 to 1.5 days, mostly the build. The real-room check on a laptop speaker and mic remains the deciding step after it, and needs a spare device or Isaac's go-ahead to use his.

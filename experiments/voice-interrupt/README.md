# Voice interruption experiment

Measurements for talking over Voyager's spoken replies: barge-in, steering, end of turn, the acknowledgement and echo cancellation. Nothing here is product code. The report is kept outside the repository at `/var/tmp/voyager-crew/reports/experiment-voice-interrupt.md`.

Scratch audio, downloads and run output live under `/var/tmp/voyager-crew/scratch/voice-interrupt/`. Offline scripts run niced through `heavy build`; scripts that start the voice engine or an audio server run through `heavy voice`.

| Script | Measures |
|---|---|
| `common.py` | Silero v6 (the app's embedded model, through ONNX) and a port of the app's `audio_io::Gate` onset and end rules |
| `stop_latency.py`, `private_audio.sh` | Time from killing `paplay` to silence at the sink. `private_audio.sh` runs a private PipeWire in bwrap, with a fresh `/dev` that has no `/dev/snd` and a hidden user runtime folder, so it reaches no real device or session |
| `echo_bench.py`, `aec.py`, `room.py`, `make_far.py` | False barge-ins from the app's own speech and barge-in detection, with no canceller, speexdsp and WebRTC AEC3 (LiveKit's build) on a simulated speaker-to-mic path |
| `eot_set.py`, `eot_eval.py` | Silero silence timeouts against Smart Turn v3.2 on top of Silero, on Edge speech with mid-sentence pauses |
| `smart_turn_human.py` | Smart Turn v3.2 on real human English clips from Pipecat's public test set |
| `backchannel_set.py` | Whether short backchannels ("yeah", "mm-hm") and short stops ("wait") trigger an onset, and how long they last |
| `ack_choice.py`, `ack_enum.py`, `ack_job.sh` | Omni choosing its own acknowledgement on the 106 round 7 router lines, as free text and as a closed choice |

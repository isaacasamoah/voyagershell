# codex-voice-check

Unrun check for one question: can Codex's live voice be the avatar's ears and voice only, under the ChatGPT subscription login, while Voyager does all the reasoning?

**Run it only with a live Codex subscription and the admiral's go.** It contacts OpenAI's servers. It is untested: it was syntax-checked with `node --check` and never executed, because the subscription it needs has ended.

## What it checks

The questions and the evidence behind them are in the spike report. The script measures:

1. The subscription route. It starts a realtime session over the websocket route and expects a refusal that names API key auth. It then starts one over WebRTC and expects the ChatGPT backend to answer with a remote description. It prints the account's plan usage figures before and after, so a subscription charge shows as usage and no API charge can occur.
2. Transcription without an answer. It speaks two synthetic requests and records the user transcript and whether the assistant answered by itself.
3. Verbatim speech. It appends a fixed sentence and compares the assistant transcript with it, listing missing and extra words.
4. The two roles. The backing thread has one tool, `ask_voyager`. A turn counts as held only if the one delegation is that tool and no other Codex item or self-answer appears.
5. Times. Transcript time, delegation time and first sound, each from the end of the synthetic speech, and first sound after the appended sentence.

## Refusals

The script refuses to start unless `--admiral-go` is passed, no variable named like an API key or starting with `OPENAI_` or `CODEX_API` is set, and `account/read` reports the `chatgpt` account type. It never reads the credential file.

## Requirements

- `codex` on `PATH`, with the native voice package installed beside it.
- `espeak-ng` and `paplay`.
- A virtual audio sink and its monitor source, so no real microphone or recording is used. With PulseAudio or PipeWire: `pactl load-module module-null-sink sink_name=codex_voice_check`.
- `CODEX_VOICE_CHECK_SINK` set to the sink name, `CODEX_VOICE_CHECK_MIC` set to the monitor source name as the helper lists it (adjust if the helper expects an ALSA name), and `CODEX_VOICE_CHECK_WORK` set to an empty working folder outside the repository.

```
node check.mjs --admiral-go
```

The raw result is written to `result.json` in the working folder. Keep it out of Git: it holds transcripts of the synthetic requests only, but also account usage figures.

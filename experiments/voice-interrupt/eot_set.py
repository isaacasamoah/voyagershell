import asyncio, json, os, subprocess, sys, time
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import RATE, SCRATCH
from room import noise

SENTENCES = [
    ("hesitate", "Could you, um... | split the Build Fleet into two?"),
    ("trail", "The um sound is a bit much for | voice replies, can we drop it?"),
    ("hesitate", "Open the, uh, | the roadmap in Research Notes."),
    ("trail", "Can you move the terminal to the | left side of the screen?"),
    ("trail", "I want to rename this Fleet to | something like Review."),
    ("trail", "What's blocked in the | build Fleet right now?"),
    ("hesitate", "Dock me to, um, | Scout Dashboard."),
    ("trail", "So the thing I'm wondering is | whether the tests passed overnight."),
    ("trail", "Hide the checklist and | make the notes bigger."),
    ("trail", "Tell Voyager that | the merge can wait until tomorrow."),
    ("hesitate", "Let's see, um, | maximize the second terminal."),
    ("trail", "Could you check whether | the voice bell is in review?"),
    ("hesitate", "I think we should, uh, | move the dashboard into its own Fleet."),
    ("hesitate", "Show me the, | the git graph for VoyagerShell."),
    ("trail", "Summarise what the crew did | while I was away."),
    ("continue", "Open the roadmap. | Oh, and also hide the checklist."),
    ("continue", "Rename this Fleet to Review. | Actually, make it Reviews."),
]
VOICES = ["en-GB-RyanNeural", "en-US-AndrewNeural", "en-US-JennyNeural"]
PAUSES = [0.5, 1.0, 1.5, 2.0, 3.0]
LEAD = 0.4
TRAIL = 4.5
NOISE_DB = -65.0


def synth(text, voice, wav):
    words = wav + ".words.json"
    if os.path.exists(wav) and os.path.exists(words):
        return json.load(open(words))
    import edge_tts
    found = []

    async def go():
        with open(wav + ".mp3", "wb") as f:
            async for ch in edge_tts.Communicate(text, voice, boundary="WordBoundary").stream():
                if ch["type"] == "audio":
                    f.write(ch["data"])
                elif ch["type"] == "WordBoundary":
                    found.append([ch["text"], ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7])
    for attempt in range(4):
        try:
            found.clear(); asyncio.run(go()); break
        except Exception:
            time.sleep(2)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav + ".mp3", "-ar", str(RATE), "-ac", "1", wav], check=True)
    os.remove(wav + ".mp3")
    json.dump(found, open(words, "w"))
    return found


def trimmed(a):
    hop = 160; n = len(a) // hop
    e = np.sqrt((a[: n * hop].reshape(n, hop) ** 2).mean(1))
    idx = np.where(e > 0.003)[0]
    return a[idx[0] * hop: (idx[-1] + 1) * hop], idx[0] * hop / RATE


def main():
    out = os.path.join(SCRATCH, "audio", "eot")
    os.makedirs(os.path.join(out, "raw"), exist_ok=True)
    cases = []
    rng_seed = 0
    for si, (kind, marked) in enumerate(SENTENCES):
        text = marked.replace(" | ", " ")
        before = len(marked.split(" | ")[0].split())
        for vi, voice in enumerate(VOICES):
            raw = os.path.join(out, "raw", f"s{si:02d}-v{vi}.wav")
            words = synth(text, voice, raw)
            a, _ = sf.read(raw, dtype="float32")
            a, shift = trimmed(a)
            cut = (words[before - 1][2] + words[before][1]) / 2 - shift
            ci = int(cut * RATE)
            rng_seed += 1
            full = np.concatenate([noise(int(LEAD * RATE), NOISE_DB, rng_seed), a, noise(int(TRAIL * RATE), NOISE_DB, rng_seed + 1000)])
            name = f"s{si:02d}-v{vi}-whole"
            sf.write(os.path.join(out, name + ".wav"), full, RATE)
            cases.append({"name": name, "kind": "whole", "form": kind, "text": text, "voice": voice,
                          "true_end": round(LEAD + len(a) / RATE, 3), "pause": None})
            for pause in PAUSES:
                rng_seed += 1
                clip = np.concatenate([noise(int(LEAD * RATE), NOISE_DB, rng_seed), a[:ci], noise(int(pause * RATE), NOISE_DB, rng_seed + 2000),
                                       a[ci:], noise(int(TRAIL * RATE), NOISE_DB, rng_seed + 3000)])
                name = f"s{si:02d}-v{vi}-p{int(pause * 10):02d}"
                sf.write(os.path.join(out, name + ".wav"), clip, RATE)
                cases.append({"name": name, "kind": "paused", "form": kind, "text": text, "voice": voice,
                              "pause_at": round(LEAD + cut, 3), "pause": pause,
                              "true_end": round(LEAD + len(a) / RATE + pause, 3)})
    json.dump(cases, open(os.path.join(out, "cases.json"), "w"), indent=1)
    print(len(cases), "cases")


main()

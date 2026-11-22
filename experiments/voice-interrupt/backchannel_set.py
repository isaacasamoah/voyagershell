import asyncio, json, os, subprocess, sys
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import RATE, SCRATCH, FRAME, Silero, Gate, load
from room import noise

WORDS = ["Mm-hm.", "Yeah.", "Okay.", "Right.", "Uh-huh.", "Sure.", "Wait.", "Stop.", "No, no.", "Hang on."]
VOICES = ["en-GB-RyanNeural", "en-US-AndrewNeural", "en-US-JennyNeural"]


async def synth(text, voice, mp3):
    import edge_tts
    await edge_tts.Communicate(text, voice).save(mp3)


def main():
    out = os.path.join(SCRATCH, "audio", "backchannel"); os.makedirs(out, exist_ok=True)
    det = Silero(); rows = []
    for wi, w in enumerate(WORDS):
        for vi, v in enumerate(VOICES):
            wav = os.path.join(out, f"w{wi}-v{vi}.wav")
            if not os.path.exists(wav):
                asyncio.run(synth(w, v, wav + ".mp3"))
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav + ".mp3", "-ar", str(RATE), "-ac", "1", wav], check=True)
                os.remove(wav + ".mp3")
            a = load(wav)
            a = np.concatenate([noise(RATE // 2, -65, wi), a / (np.abs(a).max() + 1e-9) * 0.3, noise(2 * RATE, -65, wi + 50)])
            det.reset(); ps = [det.probability(a[k:k + FRAME]) for k in range(0, len(a) - FRAME + 1, FRAME)]
            speech_s = sum(p >= 0.15 for p in ps) * FRAME / RATE
            g = Gate(det); onset = None
            for k in range(0, len(a) - FRAME + 1, FRAME):
                ev, _ = g.push(a[k:k + FRAME])
                if ev == "onset":
                    onset = (k + FRAME) / RATE; break
            rows.append({"words": w, "voice": v, "speech_s": round(speech_s, 2), "onset": onset})
    for w in WORDS:
        r = [x for x in rows if x["words"] == w]
        print(f"{w:10s} onset {sum(x['onset'] is not None for x in r)}/3  speech_s {[x['speech_s'] for x in r]}")
    json.dump(rows, open(sys.argv[1], "w"), indent=1)


main()

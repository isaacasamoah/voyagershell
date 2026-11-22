import asyncio, glob, os, subprocess, sys, json
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import RATE, SCRATCH, load

REPLIES = [
    "The build Fleet has three Vessels running. The native tests are green, and the clippy run is still going. The voice journey failed once on a timeout, and the crew is rerunning it now.",
    "I moved the roadmap to the left side and made the terminal wider. The checklist is still in the bottom corner. Tell me if you want it hidden instead.",
    "There are two things waiting on you. The first is the voice settings card, which needs a yes before the download step can start. The second is a review of the merge rule, which the admiral flagged this morning.",
    "Sure. Scout Dashboard has four Vessels: the dashboard itself, two terminals and a notes page. The second terminal has been idle for about an hour, so you could close it if you're done with it.",
    "The release branch is two commits behind main. Both are documentation changes, so rebasing should be quick. The last CI run on it passed, but it ran before the speech detector merged.",
    "Okay, here's where things stand. The click-off change merged last night. The voice bell is in review, and the verifier asked for one more control. The hello replies are on the trial build, and Isaac's test is the next step.",
    "I couldn't find a Fleet called Deploys. The closest names are Deploy Checks and Releases. Which one did you mean?",
    "The research Fleet finished the turn-taking measurements. A silence of one and a half seconds cut ten of ninety-four requests early. A model judging the end of a turn cut more, so the silence rule stays for now.",
]
VOICES = ["en-US-JennyNeural", "en-US-AriaNeural"]


async def synth(text, voice, mp3):
    import edge_tts
    await edge_tts.Communicate(text, voice).save(mp3)


def main():
    out = os.path.join(SCRATCH, "audio", "far")
    os.makedirs(out, exist_ok=True)
    meta = []
    for i, text in enumerate(REPLIES):
        voice = VOICES[i % 2]
        wav = os.path.join(out, f"edge-{i}.wav")
        if not os.path.exists(wav):
            mp3 = wav + ".mp3"
            asyncio.run(synth(text, voice, mp3))
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ar", str(RATE), "-ac", "1", wav], check=True)
            os.remove(mp3)
        meta.append({"file": wav, "voice": voice, "text": text})
    for f in sorted(glob.glob("/home/isaac/obsidian/Projects/voyagershellapp/research/voice-bakeoff-samples/lfm3/reply*.wav")):
        wav = os.path.join(out, "lfm3-" + os.path.basename(f))
        if not os.path.exists(wav):
            sf.write(wav, load(f), RATE)
        meta.append({"file": wav, "voice": "lfm3-female", "text": None})
    json.dump(meta, open(os.path.join(out, "far.json"), "w"), indent=1)
    print(sum(sf.info(m["file"]).duration for m in meta), "s of far-end speech in", len(meta), "replies")


main()

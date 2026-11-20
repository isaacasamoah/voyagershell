import asyncio, json, os, subprocess, sys, time
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "round4"))
from requests4 import R

S = "/var/tmp/voyager-crew/scratch/voice/round6"
RATE = 16000
VOICES = ["en-GB-RyanNeural", "en-US-AndrewNeural", "en-GB-SoniaNeural"]
PAUSES = [0.4, 0.7, 1.0, 1.5]
WEAK = {"the", "a", "an", "to", "me", "my", "of", "in", "on", "at", "and", "for", "from", "into", "onto", "with", "i", "it", "that", "this", "is", "are"}
TRAIL = 4.0
LEAD = 0.3


def synth(text, voice, path):
    bpath = path + ".words.json"
    if os.path.exists(path) and os.path.exists(bpath):
        return json.load(open(bpath))
    import edge_tts
    for attempt in range(4):
        try:
            words = []
            async def go():
                with open(path + ".mp3", "wb") as f:
                    async for ch in edge_tts.Communicate(text, voice, boundary="WordBoundary").stream():
                        if ch["type"] == "audio": f.write(ch["data"])
                        elif ch["type"] == "WordBoundary": words.append([ch["text"], ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7])
            asyncio.run(go())
            break
        except Exception:
            time.sleep(2)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path + ".mp3", "-ar", str(RATE), "-ac", "1", path], check=True)
    json.dump(words, open(bpath, "w"))
    return words


def load_trim(path):
    if isinstance(path, str):
        a, _ = sf.read(path, dtype="float32")
        a = a * 32768
    else:
        a = path
    hop = 160
    n = len(a) // hop
    rms = np.sqrt((a[: n * hop].reshape(n, hop) ** 2).mean(1))
    idx = np.where(rms > 300)[0]
    return a[idx[0] * hop : (idx[-1] + 1) * hop]


def cut_index(text, words):
    w = text.split()
    for k, x in enumerate(w[:-1]):
        if x.endswith(",") and 1 <= k < len(w) - 2:
            return k + 1
    mid = len(w) // 2
    for k in sorted(range(2, len(w) - 1), key=lambda k: abs(k - mid)):
        if w[k - 1].lower().strip(",.") not in WEAK:
            return k
    return mid


def weak_index(text):
    w = text.split(); mid = len(w) // 2
    cand = [k for k in range(1, len(w) - 1) if w[k - 1].lower().strip(",.") in WEAK]
    return min(cand, key=lambda k: abs(k - mid)) if cand else mid


def two_parts(path, text, words, weak=False):
    k = min(weak_index(text) if weak else cut_index(text, words), len(words) - 1)
    a, _ = sf.read(path, dtype="float32")
    t = (words[k - 1][2] + words[k][1]) / 2
    a = a * 32768
    return a[: int(t * RATE)], a[int(t * RATE):]


def silence(sec, rng):
    return rng.normal(0, 12, int(sec * RATE)).astype(np.float32)


def click(rng):
    n = int(0.04 * RATE)
    return (rng.normal(0, 1, n) * 14000 * np.exp(-np.arange(n) / (0.008 * RATE))).astype(np.float32)


def assemble(parts, rng, lead=LEAD):
    out = [silence(lead, rng)]
    pauses = []
    for p in parts:
        if isinstance(p, tuple) and p[0] == "pause":
            t0 = sum(len(x) for x in out) / RATE
            out.append(silence(p[1], rng))
            pauses.append([round(t0, 3), round(t0 + p[1], 3)])
        elif isinstance(p, tuple) and p[0] == "click":
            out.append(click(rng))
        else:
            out.append(p + rng.normal(0, 12, len(p)).astype(np.float32))
    true_end = sum(len(x) for x in out) / RATE
    out.append(silence(TRAIL, rng))
    return np.concatenate(out).clip(-32768, 32767).astype(np.int16), round(true_end, 3), pauses


def main():
    os.makedirs(S + "/set", exist_ok=True)
    rng = np.random.default_rng(6)
    cases = []

    def add(name, kind, text, parts):
        a, te, ps = assemble(parts, rng)
        f = f"{name}.wav"
        sf.write(f"{S}/set/{f}", a, RATE, subtype="PCM_16")
        cases.append({"name": name, "kind": kind, "text": text, "file": f, "true_end": te, "pauses": ps, "seconds": round(len(a) / RATE, 2)})

    for i, (cat, text, k, _g, _w) in enumerate(R):
        v = VOICES[i % 3]
        full = f"{S}/set/_full{i}.wav"; words = synth(text, v, full)
        pa, pb = two_parts(full, text, words)
        add(f"plain-{i:02d}", "plain", text, [load_trim(full)])
        add(f"pause-{i:02d}", "pause", text, [load_trim(pa), ("pause", PAUSES[i % 4]), load_trim(pb)])
        wa, wb = two_parts(full, text, words, True)
        add(f"pausew-{i:02d}", "pausew", text, [load_trim(wa), ("pause", PAUSES[(i + 1) % 4]), load_trim(wb)])
        if i % 4 == 0:
            add(f"click-{i:02d}", "click", text, [("click",), ("pause", 0.9), load_trim(full)])
        if i % 4 == 1:
            j = (i * 7 + 3) % len(R)
            tail = "Hmm, and also " + R[j][1][0].lower() + R[j][1][1:]
            pt = f"{S}/set/_c{i}.wav"; synth(tail, v, pt)
            add(f"hmm-{i:02d}", "hmm", text + " " + tail, [load_trim(full), ("pause", [0.8, 1.0, 1.2][i % 3]), load_trim(pt)])
    json.dump(cases, open(S + "/cases.json", "w"), indent=1)
    from collections import Counter
    print(len(cases), Counter(c["kind"] for c in cases))


if __name__ == "__main__":
    main()

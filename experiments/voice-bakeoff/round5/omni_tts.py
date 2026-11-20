import base64, http.client, io, json, os, re, statistics, struct, sys, time, wave
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from common import REPLIES
from voice_ws import WS

HOST, PORT = "127.0.0.1", 8112
SENTENCES = REPLIES[:5]
OUT = "/home/isaac/obsidian/Projects/voyagershellapp/research/voice-samples/female"
RAW = "/home/isaac/obsidian/Projects/voyagershellapp/research/voice-bakeoff-samples/round5"


def speech(text, voice, stream):
    body = {"input": text}
    if voice:
        body["voice"] = voice
    if stream:
        body["stream"] = True
    c = http.client.HTTPConnection(HOST, PORT, timeout=120)
    t0 = time.perf_counter()
    c.request("POST", "/v1/audio/speech", json.dumps(body), {"content-type": "application/json"})
    r = c.getresponse()
    buf = bytearray()
    first_byte = first_audio = first_100ms = None
    while True:
        b = r.read1(4096)
        if not b:
            break
        now = time.perf_counter() - t0
        if first_byte is None:
            first_byte = now
        buf += b
        if first_audio is None and len(buf) > 44:
            first_audio = now
        if first_100ms is None and len(buf) >= 44 + 4800:
            first_100ms = now
    total = time.perf_counter() - t0
    c.close()
    return r.status, bytes(buf), dict(first_byte=first_byte, first_audio=first_audio, first_100ms=first_100ms, total=total)


def pcm_of(wav_bytes):
    w = wave.open(io.BytesIO(wav_bytes))
    return w.readframes(w.getnframes()), w.getframerate()


def write(path, pcm, rate=24000):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)


def norm(t):
    return re.sub(r"[^a-z0-9 ]", "", t.lower().replace("-", " ")).split()


def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (r[i - 1] != h[j - 1]))
    return d[len(h)] / max(1, len(r))


def realtime_prompt(text):
    w = WS(HOST, PORT, "/v1/realtime", timeout=60); w.recv()
    w.send({"type": "session.update", "session": {"type": "realtime", "instructions": "Perform TTS in American English using a female voice.", "output_modalities": ["audio", "text"], "max_output_tokens": 300}})
    w.send({"type": "conversation.item.create", "item": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": text}]}})
    w.send({"type": "response.create"})
    pcm = bytearray(); txt = ""
    while True:
        ev = w.recv()
        if ev is None:
            break
        t = ev.get("type", "")
        if t.endswith("audio.delta"):
            pcm += base64.b64decode(ev["delta"])
        elif "delta" in t and "audio" not in t:
            txt += ev.get("delta", "")
        elif t == "response.done":
            break
    w.close()
    return bytes(pcm), txt


def main():
    from faster_whisper import WhisperModel
    asr = WhisperModel("small.en", device="cpu", compute_type="int8")
    os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
    import librosa, soundfile as sf
    def heard(p):
        x, r = sf.read(p, dtype="float32")
        x = librosa.resample(x, orig_sr=r, target_sr=16000)
        return " ".join(g.text for g in asr.transcribe(x, language="en")[0]).strip()
    res = {"speech_endpoint": [], "speech_default_voice": [], "speech_male": [], "realtime_tts_prompt": []}
    speech(SENTENCES[0], "female", True)
    for i, s in enumerate(SENTENCES, 1):
        for key, voice, stream in (("speech_endpoint", "female", True), ("speech_default_voice", None, True), ("speech_male", "male", True)):
            st, wav, tm = speech(s, voice, stream)
            row = dict(i=i, text=s, status=st, **tm)
            if st == 200:
                pcm, rate = pcm_of(wav)
                p = f"{RAW}/omni-{key}-{i}.wav"; write(p, pcm, rate)
                row.update(seconds=len(pcm) / 2 / rate, heard=heard(p))
                row["wer"] = wer(s, row["heard"])
                if key == "speech_endpoint":
                    write(f"{OUT}/omni-speech-female-{i}.wav", pcm, rate)
            res[key].append(row)
        pcm, txt = realtime_prompt(s)
        row = dict(i=i, text=s, reply_text=txt, audio_bytes=len(pcm))
        if pcm:
            p = f"{RAW}/omni-realtime-tts-prompt-{i}.wav"; write(p, pcm)
            row["heard"] = heard(p); row["wer"] = wer(s, row["heard"])
        res["realtime_tts_prompt"].append(row)
    for k in ("speech_endpoint", "speech_default_voice", "speech_male"):
        rows = res[k]
        res[k + "_summary"] = {m: round(statistics.median(r[m] for r in rows), 3) for m in ("first_byte", "first_audio", "first_100ms", "total")}
        res[k + "_summary"]["mean_wer"] = round(statistics.mean(r["wer"] for r in rows), 3)
    json.dump(res, open(f"{RAW}/omni_tts.json", "w"), indent=1)
    print(json.dumps({k: v for k, v in res.items() if k.endswith("summary")}, indent=1))
    for r in res["realtime_tts_prompt"]:
        print(r["i"], repr(r["reply_text"]), r["audio_bytes"], r.get("heard"))


main()

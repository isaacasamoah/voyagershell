import base64, glob, io, json, os, time, urllib.request, wave
import numpy as np
import onnxruntime as ort

RATE = 16000
FRAME = 320
VFRAME = 512


class Rule:
    def __init__(self, pause_frames=30):
        self.pause = pause_frames
        self.floors = []
        self.frames = self.speech = self.quiet = 0

    def push(self, frame):
        level = float(np.sqrt(np.mean(frame.astype(np.float64) ** 2)))
        self.floors.append(level)
        if len(self.floors) > 100:
            self.floors.pop(0)
        thr = min(max(min(self.floors) * 3.0, 200.0), 600.0)
        self.frames += 1
        if level > thr:
            self.speech += 1
            self.quiet = 0
        elif self.speech > 0:
            self.quiet += 1
        if self.speech >= 5 and self.quiet >= self.pause:
            return "pause"
        if self.frames >= 1500:
            return "cap"
        if self.speech < 5 and self.frames >= 400:
            return "nothing"
        return None


def run_rule(audio, pause_frames=30):
    r = Rule(pause_frames)
    for k in range(len(audio) // FRAME):
        e = r.push(audio[k * FRAME:(k + 1) * FRAME])
        if e:
            return (k + 1) * FRAME / RATE, e, 0.0
    return len(audio) / RATE, "none", 0.0


class Silero:
    def __init__(self):
        import faster_whisper
        p = os.path.join(os.path.dirname(faster_whisper.__file__), "assets", "silero_vad_v6.onnx")
        so = ort.SessionOptions(); so.intra_op_num_threads = 1
        self.s = ort.InferenceSession(p, so, providers=["CPUExecutionProvider"])

    def probs(self, audio):
        h = np.zeros((1, 1, 128), np.float32); c = np.zeros((1, 1, 128), np.float32)
        ctx = np.zeros(64, np.float32); x = audio.astype(np.float32) / 32768
        out = []
        for k in range(len(x) // VFRAME):
            fr = x[k * VFRAME:(k + 1) * VFRAME]
            inp = np.concatenate([ctx, fr])[None]
            p, h, c = self.s.run(None, {"input": inp, "h": h, "c": c})
            out.append(float(np.asarray(p).reshape(-1)[0])); ctx = fr[-64:]
        return out


class SmartTurn:
    def __init__(self):
        from transformers import WhisperFeatureExtractor
        p = glob.glob(os.path.expanduser("~/.cache/huggingface/hub/models--pipecat-ai--smart-turn-v3/snapshots/*/smart-turn-v3.2-cpu.onnx"))[0]
        so = ort.SessionOptions(); so.intra_op_num_threads = 1
        self.s = ort.InferenceSession(p, so, providers=["CPUExecutionProvider"])
        self.fe = WhisperFeatureExtractor(chunk_length=8)

    def __call__(self, audio):
        x = audio[-8 * RATE:].astype(np.float32) / 32768
        x = np.pad(x, (8 * RATE - len(x), 0))
        f = self.fe(x, sampling_rate=RATE, return_tensors="np", padding="max_length", max_length=8 * RATE, truncation=True, do_normalize=True).input_features.astype(np.float32)
        return float(self.s.run(None, {"input_features": f})[0].reshape(-1)[0])


OMNI_PROMPT = "A person is speaking a request to a workspace app. Judge only from the audio so far. Answer YES if they have finished a complete request, or NO if they are mid-sentence, paused to think, or are likely to continue. Answer with one word."


class Omni:
    def __init__(self, prompt=OMNI_PROMPT):
        self.prompt = prompt

    def __call__(self, audio):
        a = audio[-10 * RATE:]
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(a.astype(np.int16).tobytes())
        b = base64.b64encode(buf.getvalue()).decode()
        body = {"model": "omni", "temperature": 0, "max_tokens": 3, "messages": [
            {"role": "system", "content": self.prompt},
            {"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": b, "format": "wav"}}]}]}
        req = urllib.request.Request("http://127.0.0.1:8112/v1/chat/completions", json.dumps(body).encode(), {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            t = json.load(r)["choices"][0]["message"]["content"].strip().lower()
        return 1.0 if t.startswith("yes") else 0.0


def run_model(audio, vprobs, judge, start=0.5, stop=0.35, check_every=0.2, first_check=0.2, fallback=3.0, min_speech=0.25):
    speech_t = 0.0; quiet_t = 0.0; in_speech = False; last_check = None; calls = 0; spent = 0.0
    n = len(vprobs)
    for k in range(n):
        t = (k + 1) * VFRAME / RATE
        p = vprobs[k]
        if p >= start:
            speech_t += VFRAME / RATE; quiet_t = 0.0; in_speech = True; last_check = None
        elif in_speech and p < stop:
            quiet_t += VFRAME / RATE
        if in_speech and speech_t >= min_speech and quiet_t >= first_check:
            if last_check is None or quiet_t - last_check >= check_every - 1e-9:
                last_check = quiet_t
                t0 = time.perf_counter(); score = judge(audio[: int(t * RATE)]); dt = time.perf_counter() - t0
                calls += 1; spent += dt
                if score >= 0.5:
                    return t + dt, "model", spent, calls
            if quiet_t >= fallback:
                return t, "fallback", spent, calls
    return n * VFRAME / RATE, "none", spent, calls


def run_vad_hangover(vprobs, hang=0.6, start=0.5, stop=0.35, min_speech=0.25):
    speech_t = 0.0; quiet_t = 0.0; in_speech = False
    for k, p in enumerate(vprobs):
        t = (k + 1) * VFRAME / RATE
        if p >= start:
            speech_t += VFRAME / RATE; quiet_t = 0.0; in_speech = True
        elif in_speech and p < stop:
            quiet_t += VFRAME / RATE
        if in_speech and speech_t >= min_speech and quiet_t >= hang:
            return t, "vad", 0.0
    return len(vprobs) * VFRAME / RATE, "none", 0.0

import os, numpy as np, soundfile as sf
from scipy.signal import resample_poly

RATE = 16000
FRAME = 320
SCRATCH = "/var/tmp/voyager-crew/scratch/voice-interrupt"
SILERO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "app", "models", "silero_vad_v6.onnx")
ROUND6 = "/var/tmp/voyager-crew/scratch/voice/round6"

SETTLE_FRAMES = 15
ONSET_FRAMES = int(os.environ.get("ONSET_FRAMES", "5"))
PAUSE_FRAMES = 75
CAP_FRAMES = 1500
LEAD_FRAMES = 50
START_PROBABILITY = 0.3
SPEAKING_PROBABILITY = 0.15


def load(path):
    a, r = sf.read(path, dtype="float32", always_2d=True)
    a = a.mean(1)
    if r != RATE:
        g = np.gcd(r, RATE)
        a = resample_poly(a, RATE // g, r // g).astype(np.float32)
    return a


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.square(x, dtype=np.float64))) + 1e-12)


def active_rms_db(x, floor_db=-50):
    n = len(x) // FRAME
    f = x[: n * FRAME].reshape(n, FRAME)
    e = 10 * np.log10(np.mean(f.astype(np.float64) ** 2, 1) + 1e-12)
    top = e.max()
    act = f[e > max(floor_db, top - 30)]
    return rms_db(act)


def onset_time(x, rel_db=-35):
    n = len(x) // 160
    e = 10 * np.log10(np.mean(x[: n * 160].reshape(n, 160).astype(np.float64) ** 2, 1) + 1e-12)
    idx = np.where(e > e.max() + rel_db)[0]
    return idx[0] * 160 / RATE if len(idx) else None


class Silero:
    def __init__(self):
        import onnxruntime as ort
        so = ort.SessionOptions(); so.intra_op_num_threads = 1; so.inter_op_num_threads = 1
        self.s = ort.InferenceSession(SILERO, so, providers=["CPUExecutionProvider"])
        self.reset()

    def reset(self):
        self.h = np.zeros((1, 1, 128), np.float32)
        self.c = np.zeros((1, 1, 128), np.float32)
        self.ctx = np.zeros(64, np.float32)
        self.pending = np.zeros(0, np.float32)
        self.latest = 0.0

    def probability(self, frame):
        self.pending = np.concatenate([self.pending, frame.astype(np.float32)])
        while len(self.pending) >= 512:
            c = self.pending[:512]; self.pending = self.pending[512:]
            x = np.concatenate([self.ctx, c])[None, :]
            out, self.h, self.c = self.s.run(None, {"input": x, "h": self.h, "c": self.c})
            self.ctx = c[-64:]
            self.latest = float(np.asarray(out).reshape(-1)[0])
        return self.latest


class Gate:
    def __init__(self, detector, settled=True):
        detector.reset()
        self.d = detector
        self.stage = ("waiting", 0) if settled else ("settling", 0)
        self.kept = []
        self.frames = 0
        self.quiet = 0

    def push(self, frame):
        p = self.d.probability(frame)
        speech = p >= SPEAKING_PROBABILITY
        kind, n = self.stage
        if kind == "settling":
            n += 1
            self.stage = ("settling", n) if n < SETTLE_FRAMES else ("waiting", 0)
            return ("settled" if n >= SETTLE_FRAMES else None), p
        if kind == "waiting":
            run = n + 1 if p >= START_PROBABILITY else 0
            self.kept.append(frame)
            if run >= ONSET_FRAMES:
                self.stage = ("speaking", 0); self.frames = run; self.quiet = 0
                return "onset", p
            if len(self.kept) > LEAD_FRAMES:
                self.kept.pop(0)
            self.stage = ("waiting", run)
            return None, p
        self.frames += 1
        self.quiet = 0 if speech else self.quiet + 1
        self.kept.append(frame)
        if self.quiet >= PAUSE_FRAMES:
            return "ended", p
        if self.frames >= CAP_FRAMES:
            return "cap", p
        return None, p

    def utterance(self):
        return np.concatenate(self.kept) if self.kept else np.zeros(0, np.float32)

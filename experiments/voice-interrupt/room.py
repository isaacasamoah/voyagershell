import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from common import RATE, active_rms_db


def rir(rt60, seed):
    rng = np.random.default_rng(seed)
    n = int(rt60 * RATE)
    t = np.arange(n) / RATE
    h = rng.normal(0, 1, n) * np.exp(-6.91 * t / rt60) * 0.12
    h[: int(0.004 * RATE)] = 0
    h[int(0.0015 * RATE)] += 1.0
    return h.astype(np.float32)


class Room:
    def __init__(self, delay_s=0.1, rt60=0.35, drive=2.0, seed=1):
        self.delay = int(delay_s * RATE)
        self.h = rir(rt60, seed)
        self.drive = drive
        self.sos = butter(2, 200, "highpass", fs=RATE, output="sos")

    def echo(self, far):
        x = sosfilt(self.sos, far)
        x = np.tanh(self.drive * x) / self.drive
        y = fftconvolve(x, self.h)[: len(far)]
        return np.concatenate([np.zeros(self.delay, np.float32), y[: len(far) - self.delay]]).astype(np.float32)


def scale_to(x, target_db, ref=None):
    level = active_rms_db(x if ref is None else ref)
    return (x * 10 ** ((target_db - level) / 20)).astype(np.float32)


def noise(n, db, seed):
    rng = np.random.default_rng(seed)
    w = rng.normal(0, 1, n)
    b = np.cumsum(w); b -= np.convolve(b, np.ones(400) / 400, "same")
    p = 0.6 * w + 0.4 * b / (np.std(b) + 1e-9)
    p = p / np.sqrt(np.mean(p ** 2)) * 10 ** (db / 20)
    return p.astype(np.float32)

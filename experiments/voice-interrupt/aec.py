import ctypes, os
import numpy as np
from common import SCRATCH, RATE

TEN = RATE // 100
SPEEX_ECHO_SET_SAMPLING_RATE = 24
SPEEX_PREPROCESS_SET_DENOISE = 0
SPEEX_PREPROCESS_SET_ECHO_STATE = 24


def to16(x):
    return np.clip(np.round(x * 32768), -32768, 32767).astype(np.int16)


class Plain:
    name = "none"

    def process(self, mic, far):
        return mic


class Speex:
    def __init__(self, filter_s=0.3, residual=True):
        self.name = "speex" + ("+residual" if residual else "")
        lib = ctypes.CDLL(os.path.join(SCRATCH, "src-dl", "speexdsp", "libspeexdsp.so"))
        lib.speex_echo_state_init.restype = ctypes.c_void_p
        lib.speex_preprocess_state_init.restype = ctypes.c_void_p
        lib.speex_echo_ctl.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
        lib.speex_preprocess_ctl.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
        lib.speex_echo_cancellation.argtypes = [ctypes.c_void_p] + [ctypes.c_void_p] * 3
        lib.speex_preprocess_run.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        self.lib = lib
        self.echo = lib.speex_echo_state_init(TEN, int(filter_s * RATE))
        rate = ctypes.c_int(RATE)
        lib.speex_echo_ctl(self.echo, SPEEX_ECHO_SET_SAMPLING_RATE, ctypes.byref(rate))
        self.pre = None
        if residual:
            self.pre = lib.speex_preprocess_state_init(TEN, RATE)
            lib.speex_preprocess_ctl(self.pre, SPEEX_PREPROCESS_SET_ECHO_STATE, ctypes.c_void_p(self.echo))

    def process(self, mic, far):
        rec = to16(mic); play = to16(far); out = np.zeros(TEN, np.int16)
        self.lib.speex_echo_cancellation(self.echo, rec.ctypes.data, play.ctypes.data, out.ctypes.data)
        if self.pre:
            self.lib.speex_preprocess_run(self.pre, out.ctypes.data)
        return out.astype(np.float32) / 32768


class WebRTC:
    def __init__(self, delay_ms=None, ns=False):
        from livekit import rtc
        self.rtc = rtc
        self.name = "webrtc-aec3" + ("+ns" if ns else "") + ("" if delay_ms is not None else "-nohint")
        self.apm = rtc.AudioProcessingModule(echo_cancellation=True, noise_suppression=ns, high_pass_filter=True)
        self.delay_ms = delay_ms

    def frame(self, x):
        return self.rtc.AudioFrame(data=to16(x).tobytes(), sample_rate=RATE, num_channels=1, samples_per_channel=TEN)

    def process(self, mic, far):
        f = self.frame(far)
        self.apm.process_reverse_stream(f)
        if self.delay_ms is not None:
            self.apm.set_stream_delay_ms(self.delay_ms)
        m = self.frame(mic)
        self.apm.process_stream(m)
        return np.frombuffer(bytes(m.data), np.int16).astype(np.float32) / 32768


def make(name, delay_ms):
    return {
        "none": lambda: Plain(),
        "speex": lambda: Speex(residual=False),
        "speex+residual": lambda: Speex(residual=True),
        "webrtc-aec3": lambda: WebRTC(delay_ms=delay_ms),
        "webrtc-aec3+ns": lambda: WebRTC(delay_ms=delay_ms, ns=True),
        "webrtc-aec3-nohint": lambda: WebRTC(delay_ms=None),
    }[name]()

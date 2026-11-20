import asyncio, os, subprocess, sys, threading, time
import numpy as np, soundfile as sf, torch
from transformers import AutoModelForMultimodalLM, AutoProcessor
from transformers.models.auto import AutoModel
MID = "LiquidAI/LFM3-Audio-2B"
SENTENCE = "Two things are blocked in the build Fleet. Want me to open them?"
VOICES = [("British English", "female"), ("British English", "male"), ("American English", "female"), ("American English", "male")]
SAMPLE_DIR = "/home/isaac/obsidian/Projects/voyagershellapp/research/voice-samples"
RATE_IN, RATE_OUT = 16000, 24000
AUDIO_KW = dict(audio_temperature=1.0, audio_top_k=128, audio_repetition_penalty=1.1, audio_repetition_window=4096)

def load():
    dev = "cuda"
    model = AutoModelForMultimodalLM.from_pretrained(MID, dtype=torch.bfloat16, device_map=dev, trust_remote_code=True).eval()
    proc = AutoProcessor.from_pretrained(MID, trust_remote_code=True)
    codec = proc.audio_tokenizer.to(device=dev).eval()
    return model, proc, codec, dev

def tts_wave(model, proc, codec, dev, text, locale, gender):
    conv = [{"role": "system", "content": f"Perform TTS in {locale} using a {gender} voice."}, {"role": "user", "content": text}, {"role": "assistant", "content": "<|audio_start|>"}]
    inp = proc.apply_chat_template(conv, continue_final_message=True, tokenize=True, return_dict=True, return_tensors="pt").to(dev)
    with torch.no_grad():
        o = model.generate(**inp, max_new_tokens=512, return_dict_in_generate=True, **AUDIO_KW)
        return codec.decode(o.audio_codes[:1, :, :o.audio_lengths[0]]).audio_values[0].float().cpu().numpy()

def paplay(path):
    subprocess.run(["paplay", path], check=True)

def edge_file(text, voice, mp3, wav):
    import edge_tts
    async def go():
        await edge_tts.Communicate(text, voice).save(mp3)
    asyncio.run(go())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ar", "24000", "-ac", "1", wav], check=True)

def samples(gender):
    d = f"{SAMPLE_DIR}/{gender}"; os.makedirs(d, exist_ok=True)
    model, proc, codec, dev = load()
    items = []
    for locale, tag in [("British English", "british"), ("American English", "american")]:
        w = tts_wave(model, proc, codec, dev, SENTENCE, locale, gender); p = f"{d}/lfm3-{tag}-{gender}.wav"; sf.write(p, w, RATE_OUT); items.append((f"LFM3 {locale} {gender}", p))
    edge = {"female": [("en-GB-SoniaNeural", "sonia-gb"), ("en-US-JennyNeural", "jenny-us")], "male": [("en-GB-RyanNeural", "ryan-gb"), ("en-US-AndrewNeural", "andrew-us")]}[gender]
    for voice, tag in edge:
        edge_file(SENTENCE, voice, f"{d}/edge-{tag}.mp3", f"{d}/edge-{tag}.wav"); items.append((f"Edge {voice}", f"{d}/edge-{tag}.wav"))
    for i, (name, p) in enumerate(items):
        print(f"Playing {i+1} of {len(items)}: {name}  ({p})", flush=True); paplay(p)
        if i < len(items) - 1: time.sleep(1)
    print("Done.", flush=True)

class Player:
    def __init__(self):
        self.p = subprocess.Popen(["pw-cat", "-p", "--raw", "--rate", str(RATE_OUT), "--channels", "1", "--format", "f32", "-"], stdin=subprocess.PIPE)
    def write(self, a):
        try: self.p.stdin.write(np.asarray(a, dtype=np.float32).tobytes()); self.p.stdin.flush()
        except BrokenPipeError: pass
    def close(self):
        try: self.p.stdin.close()
        except Exception: pass
        self.p.wait()

class AudioOut:
    def __init__(self, codec, dev, save):
        self.codec, self.dev, self.save = codec, dev, save
        self.cache = codec.config and None
        from transformers.dynamic_module_utils import get_class_from_dynamic_module
        self.done = False; self.buf = []; self.chunks = []; self.player = Player(); self.first = None; self.t0 = time.time(); self.cache = type(codec).__module__ and None
        self.cache = self._new_cache()
    def _new_cache(self):
        import importlib; m = importlib.import_module(type(self.codec).__module__)
        return m.LiquidCodecStreamingCache(self.codec.config)
    def put(self, frame):
        self.buf.append(frame.reshape(-1).to(self.dev))
        if len(self.buf) >= 3: self.flush(False)
    def flush(self, final):
        codes = torch.stack(self.buf, 1).unsqueeze(0) if self.buf else torch.zeros(1, self.codec.config.n_q, 0, dtype=torch.long, device=self.dev)
        self.buf = []
        with torch.no_grad(): w = self.codec.decode(codes, streaming_cache=self.cache, finalize=final).audio_values[0].float().cpu().numpy()
        if w.size:
            if self.first is None: self.first = time.time() - self.t0
            self.chunks.append(w); self.player.write(w)
    def end(self):
        if self.done: return
        self.done = True; self.flush(True); self.player.close()

class TextOut:
    def __init__(self, tok): self.tok, self.ids, self.shown, self.first = tok, [], "", True
    def put(self, v):
        v = v.reshape(-1)
        if self.first: self.first = False; return
        self.ids += v.tolist(); s = self.tok.decode(self.ids, skip_special_tokens=True)
        if s.startswith(self.shown): print(s[len(self.shown):], end="", flush=True); self.shown = s
    def end(self): print(flush=True)

def record():
    p = subprocess.Popen(["pw-cat", "-r", "--raw", "--rate", str(RATE_IN), "--channels", "1", "--format", "s16", "-"], stdout=subprocess.PIPE)
    data = bytearray(); th = threading.Thread(target=lambda: [data.extend(c) for c in iter(lambda: p.stdout.read(3200), b"")], daemon=True); th.start()
    input("  Listening. Press Enter to stop... ")
    p.terminate(); th.join(timeout=2)
    return np.frombuffer(bytes(data[: len(data) // 2 * 2]), dtype=np.int16).astype(np.float32) / 32768

def chat_turn(model, proc, codec, dev, conv, wave):
    conv.append({"role": "user", "content": [{"type": "audio", "audio": wave}]})
    msgs = [{"role": "system", "content": "Respond with interleaved text and audio."}] + conv + [{"role": "assistant", "content": "<|mixed_start|>"}]
    inp = proc.apply_chat_template(msgs, continue_final_message=True, tokenize=True, return_dict=True, return_tensors="pt").to(dev)
    ao, to = AudioOut(codec, dev, False), TextOut(proc.tokenizer)
    ao.t0 = time.time()
    with torch.no_grad():
        o = model.generate(**inp, max_new_tokens=1024, streamer=to, audio_streamer=ao, return_dict_in_generate=True, **AUDIO_KW)
    ao.end()
    text = proc.decode(o.sequences[0, inp["input_ids"].shape[1]:], skip_special_tokens=True).strip()
    conv.append({"role": "assistant", "content": text})
    if ao.first: print(f"  [first sound {ao.first:.2f} s after generation started]")
    return np.concatenate(ao.chunks) if ao.chunks else np.zeros(0, np.float32)


def speak_streaming(model, proc, codec, dev, text, locale, gender, t_end=None):
    import re
    first = None; chunks = []; t0 = t_end or time.time()
    for sent in [x for x in re.split(r"(?<=[.!?])\s+", text.strip()) if x]:
        conv = [{"role": "system", "content": f"Perform TTS in {locale} using a {gender} voice."}, {"role": "user", "content": sent}, {"role": "assistant", "content": "<|audio_start|>"}]
        inp = proc.apply_chat_template(conv, continue_final_message=True, tokenize=True, return_dict=True, return_tensors="pt").to(dev)
        ao = AudioOut(codec, dev, False)
        with torch.no_grad():
            model.generate(**inp, max_new_tokens=512, audio_streamer=ao, return_dict_in_generate=True, **AUDIO_KW)
        ao.end()
        if ao.first is not None and first is None: first = time.time() - t0 - (time.time() - ao.t0 - ao.first) * 0
        chunks += ao.chunks
    return chunks, first

def aloud_turn(model, proc, codec, dev, conv, wave, voice):
    t_end = time.time()
    conv.append({"role": "user", "content": [{"type": "audio", "audio": wave}]})
    msgs = [{"role": "system", "content": "You are Voyager, a spoken assistant. Answer in one or two short sentences."}] + conv + [{"role": "assistant", "content": "<think></think>"}]
    inp = proc.apply_chat_template(msgs, continue_final_message=True, tokenize=True, return_dict=True, return_tensors="pt").to(dev)
    to = TextOut(proc.tokenizer)
    with torch.no_grad():
        o = model.generate(**inp, max_new_tokens=300, streamer=to, suppress_mixed=True, suppress_audio_out=True, return_dict_in_generate=True)
    text = proc.decode(o.sequences[0, inp["input_ids"].shape[1]:], skip_special_tokens=True).strip()
    t_text = time.time() - t_end
    conv.append({"role": "assistant", "content": text})
    chunks, _ = speak_streaming(model, proc, codec, dev, text, voice[0], voice[1])
    return (np.concatenate(chunks) if chunks else np.zeros(0, np.float32)), t_text

def voices(model, proc, codec, dev):
    for locale, g in VOICES:
        print(f"Speaking: {locale}, {g}", flush=True)
        w = tts_wave(model, proc, codec, dev, SENTENCE, locale, g)
        pl = Player(); pl.write(w); pl.close(); time.sleep(1)

def main():
    if "--female-samples" in sys.argv: return samples("female")
    if "--male-samples" in sys.argv: return samples("male")
    print("Loading LFM3-Audio-2B..."); model, proc, codec, dev = load()
    conv, last_in, last_out = [], None, None
    if "--test-wav" in sys.argv:
        w, sr = sf.read(sys.argv[sys.argv.index("--test-wav") + 1], dtype="float32"); chat_turn(model, proc, codec, dev, conv, w); return
    mode, voice = "aloud", ("American English", "female")
    print("Enter = listen, Enter again = stop.  Commands: voices, voice <british|american> <female|male>, mode <aloud|native>, reset, save, quit")
    print(f"Mode: {mode} (LFM3 writes the reply, then reads it aloud in {voice[0]} {voice[1]}). 'mode native' uses the model's own voice, which cannot be chosen.")
    while True:
        try: cmd = input("\n> ").strip().lower()
        except EOFError: break
        if cmd == "quit": break
        if cmd == "reset": conv.clear(); print("Conversation cleared."); continue
        if cmd.startswith("mode "):
            m = cmd.split()[1]
            if m in ("aloud", "native"): mode = m; print("Mode:", mode)
            else: print("mode aloud or mode native")
            continue
        if cmd.startswith("voice "):
            p = cmd.split()
            if len(p) == 3 and p[1] in ("british", "american") and p[2] in ("female", "male"): voice = (p[1].capitalize() + " English", p[2]); print("Voice:", *voice)
            else: print("voice <british|american> <female|male>")
            continue
        if cmd == "voices": voices(model, proc, codec, dev); continue
        if cmd == "save":
            if last_in is None: print("Nothing to save yet."); continue
            os.makedirs(SAMPLE_DIR + "/talk", exist_ok=True); t = time.strftime("%H%M%S")
            sf.write(f"{SAMPLE_DIR}/talk/{t}-you.wav", last_in, RATE_IN); sf.write(f"{SAMPLE_DIR}/talk/{t}-reply.wav", last_out, RATE_OUT); print(f"Saved to {SAMPLE_DIR}/talk/{t}-*.wav"); continue
        if cmd: print("Unknown command. Enter alone starts listening."); continue
        w = record()
        if w.size < RATE_IN // 4: print("Heard nothing."); continue
        last_in = w
        if mode == "native": last_out = chat_turn(model, proc, codec, dev, conv, w)
        else:
            last_out, tt = aloud_turn(model, proc, codec, dev, conv, w, voice); print(f"  [reply text took {tt:.2f} s]")
main()

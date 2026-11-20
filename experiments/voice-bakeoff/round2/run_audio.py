import asyncio, json, os, subprocess, sys, time, statistics
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np, soundfile as sf, torch
import tools, world
from transformers import AutoModelForMultimodalLM, AutoProcessor
S = "/var/tmp/voyager-crew/scratch/voice/round2"; os.makedirs(S + "/in", exist_ok=True)
MID = "LiquidAI/LFM3-Audio-2B"
INPUT = os.environ.get("INPUT", "audio")
AUDIO_KW = dict(audio_temperature=1.0, audio_top_k=128, audio_repetition_penalty=1.1, audio_repetition_window=4096)

def speech(i, text):
    wav = f"{S}/in/{i}.wav"
    if not os.path.exists(wav):
        import edge_tts
        asyncio.run(edge_tts.Communicate(text, "en-GB-RyanNeural").save(f"{S}/in/{i}.mp3"))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f"{S}/in/{i}.mp3", "-ar", "16000", "-ac", "1", wav], check=True)
    return sf.read(wav, dtype="float32")[0]

model = AutoModelForMultimodalLM.from_pretrained(MID, dtype=torch.bfloat16, device_map="cuda", trust_remote_code=True).eval()
proc = AutoProcessor.from_pretrained(MID, trust_remote_code=True); tok = proc.tokenizer

class First:
    def __init__(s): s.t = None
    def put(s, x):
        if s.t is None: s.t = time.time()
    def end(s): pass

def generate(conv, tl, first_audio=False, max_new=400, stop=True):
    t0 = time.time()
    inp = proc.apply_chat_template(conv, tools=tl, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt").to("cuda")
    f = First(); kw = {}
    with torch.no_grad():
        o = model.generate(**inp, max_new_tokens=max_new, audio_streamer=f, return_dict_in_generate=True, **kw, **AUDIO_KW)
    text = proc.decode(o.sequences[0, inp["input_ids"].shape[1]:], skip_special_tokens=True)
    return text, time.time() - t0, (f.t - t0 if f.t else None), int(o.sequences.shape[1] - inp["input_ids"].shape[1])

def run_one(surface, tl, label, spoken, wave, expect, retry=True):
    base = [{"role": "system", "content": "Respond with function calls, and interleaved text and audio.\n\n" + world.SYSTEM + "\n\nList of tools:"}, {"role": "user", "content": [{"type": "audio", "audio": wave}] if INPUT == "audio" else spoken}]
    text, dt, _, ntok = generate(base, tl)
    rec = {"label": label, "surface": surface, "raw": text[:400], "tokens": ntok, "t_call_s": round(dt, 3), "retries": 0, "outcome": None, "error": None}
    calls = tools.parse_calls(text)
    if not calls: rec["outcome"] = "no call"; return rec
    name, args = calls[0]; call = tools.to_action(surface, name, args); err = tools.validate(call)
    if err and retry:
        rec["retries"] = 1; rec["first_error"] = err
        conv = base + [{"role": "assistant", "tool_calls": [{"type": "function", "function": {"name": name, "arguments": args}}]}, {"role": "tool", "content": json.dumps({"rejected": err, "hint": "Fix the call and try again once."})}]
        text2, dt2, _, n2 = generate(conv, tl); rec["t_call_s"] = round(dt + dt2, 3); rec["tokens"] += n2
        calls = tools.parse_calls(text2)
        if not calls: rec["outcome"] = "no call after retry"; return rec
        name, args = calls[0]; call = tools.to_action(surface, name, args); err = tools.validate(call)
    rec["call"] = {"name": name, "args": args}
    if err: rec["outcome"] = "invalid"; rec["error"] = err; return rec
    if "handoff" in call:
        rec["outcome"] = "handoff-ok" if expect == "handoff" else "handoff-missed"
    else:
        ok = expect != "handoff" and expect(call)
        rec["outcome"] = ("correct" if ok else "wrong") if expect != "handoff" else "wrong-effect"
    if rec["outcome"] in ("correct", "handoff-ok"):
        conv = base + [{"role": "assistant", "tool_calls": [{"type": "function", "function": {"name": name, "arguments": args}}]}, {"role": "tool", "content": json.dumps({"status": "applied"})}]
        _, dt3, fa, _ = generate(conv, tl, stop=False, max_new=48)
        rec["t_first_sound_s"] = round(rec["t_call_s"] + fa, 3) if fa else None
    return rec

def main():
    surfaces = {"real": tools.real_tools(), "voice": tools.voice_tools()}
    waves = [speech(i, r[1]) for i, r in enumerate(world.REQUESTS)]
    run_one("voice", surfaces["voice"], "warm", "", waves[0], "handoff", retry=False)
    out = []; smp = None
    for surface, tl in surfaces.items():
        for i, (label, spoken, g_real, g_voice) in enumerate(world.REQUESTS):
            g = g_real if surface == "real" else (g_voice if g_voice != "same" else g_real)
            expect = "handoff" if g == "handoff" else g
            r = run_one(surface, tl, label, spoken, waves[i], expect); out.append(r)
            print(surface, label, "->", r["outcome"], r["retries"], r["t_call_s"], flush=True)
    json.dump(out, open(S + f"/audio_results_{INPUT}.json", "w"), indent=1)
main()

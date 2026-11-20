import asyncio, base64, json, os, subprocess, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import tools, world, names
S = "/var/tmp/voyager-crew/scratch/voice/round2"; RUNS = 3
SYSTEM = "You are Voyager's voice. The human speaks a request; act on it with a tool call, never ask back unless a tool says the name is ambiguous. Say names, addresses or positions as the human did.\n\n" + "\n".join(
    [f"Voyages and Fleets: " + "; ".join(f"{vn}: " + ", ".join(n for _, n in fl) for _, vn, fl in world.TREE), "Selected Fleet: Voyager Shell/Main. Vessels (on-screen name, address, program, position):"] +
    [f"- {n}, {a}, {prog}, {pos}" for _, n, a, prog, pos in world.PANELS])
ASK_OK = {"dock voyage (old failure)", "move right"}
def expectations():
    ex = []
    for label, spoken, g_real, g_voice in world.REQUESTS:
        g = g_real if g_voice == "same" else g_voice
        if label.startswith("dock voyage"): g = lambda c: world.has(c, operation="dock") and c["action"]["context"] == {"kind": "voyage", "id": "voyage-2"}
        ex.append((label, spoken, "handoff" if g == "handoff" else g))
    return ex
EX = expectations()

def episode(gen, msgs, tl, expect, label):
    retries, total, outcome, err = 0, 0.0, None, None
    for turn in range(3):
        name, args, text, dt = gen(msgs, tl); total += dt
        if name is None: outcome = "asked" if turn > 0 else "no call"; break
        kind, val = names.to_call(name, args)
        if kind == "handoff": outcome = "handoff-ok" if expect == "handoff" else "handoff-missed"; break
        if kind == "call":
            err = tools.validate(val)
            if not err:
                outcome = "wrong-effect" if expect == "handoff" else ("correct" if expect(val) else "wrong-target"); break
            res = {"rejected": err}
        else: res = val
        retries += 1; gen.feedback(msgs, name, args, res)
    else: outcome = "gave up"
    if outcome == "asked" and label in ASK_OK: outcome = "correct"
    return {"label": label, "outcome": outcome, "retries": retries, "t_call_s": round(total, 3), "last_call": (name, args)}

class Llama:
    def __init__(s, seed, port=8099): s.seed = seed; s.url = f"http://127.0.0.1:{port}/v1/chat/completions"
    def __call__(s, msgs, tl):
        body = json.dumps({"messages": msgs, "tools": tl, "temperature": 0.3, "seed": s.seed, "max_tokens": 2500}).encode(); t = time.time()
        m = json.load(urllib.request.urlopen(urllib.request.Request(s.url, body, {"Content-Type": "application/json"}), timeout=300))["choices"][0]["message"]; dt = time.time() - t
        s.last = m
        if m.get("tool_calls"):
            c = m["tool_calls"][0]["function"]; return c["name"], json.loads(c["arguments"] or "{}"), None, dt
        return None, None, m.get("content"), dt
    def feedback(s, msgs, name, args, res):
        msgs += [{"role": "assistant", "content": s.last.get("content") or "", "tool_calls": s.last["tool_calls"]}, {"role": "tool", "tool_call_id": s.last["tool_calls"][0].get("id", "c"), "content": json.dumps(res)}]

def llama_main():
    tr = json.load(open(S + "/transcripts.json")); tl = names.voice_tools(); out = {}
    Llama(0)([{"role": "user", "content": "hi"}], tl)
    for run in range(RUNS):
        g = Llama(run + 1)
        for i, (label, spoken, expect) in enumerate(EX):
            msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": tr[str(run)][i]["text"]}]
            r = episode(g, msgs, tl, expect, label); r["t_call_s"] = round(r["t_call_s"] + tr[str(run)][i]["asr_s"], 3); r["run"] = run; out.setdefault("rows", []).append(r)
            print(run, label, r["outcome"], r["retries"], r["t_call_s"], flush=True)
    json.dump(out, open(S + f"/r3_{os.environ['RESULT_NAME']}.json", "w"), indent=1)

def omni_main():
    tl = names.voice_tools(); out = {"audio": [], "hear_then_call": []}
    def part(i): return [{"type": "input_audio", "input_audio": {"data": base64.b64encode(open(f"{S}/in/{i}.wav", "rb").read()).decode(), "format": "wav"}}]
    Llama(0, 8112)([{"role": "user", "content": "hi"}], tl)
    for run in range(RUNS):
        g = Llama(run + 1, 8112)
        for i, (label, spoken, expect) in enumerate(EX):
            r = episode(g, [{"role": "system", "content": SYSTEM}, {"role": "user", "content": part(i)}], tl, expect, label); r["run"] = run; out["audio"].append(r)
            t = time.time(); body = json.dumps({"messages": [{"role": "system", "content": "Perform ASR in English."}, {"role": "user", "content": part(i)}], "temperature": 0, "max_tokens": 100}).encode()
            text = json.load(urllib.request.urlopen(urllib.request.Request(g.url, body, {"Content-Type": "application/json"}), timeout=120))["choices"][0]["message"]["content"].strip(); adt = time.time() - t
            r2 = episode(g, [{"role": "system", "content": SYSTEM}, {"role": "user", "content": text}], tl, expect, label); r2["t_call_s"] = round(r2["t_call_s"] + adt, 3); r2["run"] = run; r2["heard"] = text; out["hear_then_call"].append(r2)
            print(run, label, "omni audio:", r["outcome"], r["t_call_s"], "| hear-then-call:", r2["outcome"], r2["t_call_s"], flush=True)
    json.dump(out, open(S + "/r3_omni.json", "w"), indent=1)

def hf_main():
    import torch, soundfile as sf
    from transformers import AutoModelForMultimodalLM, AutoProcessor
    MID = "LiquidAI/LFM3-Audio-2B"
    model = AutoModelForMultimodalLM.from_pretrained(MID, dtype=torch.bfloat16, device_map="cuda", trust_remote_code=True).eval()
    proc = AutoProcessor.from_pretrained(MID, trust_remote_code=True)
    KW = dict(audio_temperature=1.0, audio_top_k=128, audio_repetition_penalty=1.1, audio_repetition_window=4096)
    waves = [sf.read(f"{S}/in/{i}.wav", dtype="float32")[0] for i in range(len(EX))]
    def asr(w):
        t = time.time(); conv = [{"role": "system", "content": "Perform ASR in English."}, {"role": "user", "content": [{"type": "audio", "audio": w}]}]
        inp = proc.apply_chat_template(conv, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt").to("cuda")
        with torch.no_grad(): o = model.generate(**inp, max_new_tokens=128, suppress_mixed=True, suppress_audio_out=True, return_dict_in_generate=True)
        return proc.decode(o.sequences[0, inp["input_ids"].shape[1]:], skip_special_tokens=True).strip(), time.time() - t
    class Gen:
        def __call__(s, msgs, tl):
            t = time.time(); inp = proc.apply_chat_template(msgs, tools=tl, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt").to("cuda")
            with torch.no_grad(): o = model.generate(**inp, max_new_tokens=300, return_dict_in_generate=True, **KW)
            text = proc.decode(o.sequences[0, inp["input_ids"].shape[1]:], skip_special_tokens=True); dt = time.time() - t
            calls = tools.parse_calls(text)
            return (calls[0][0], calls[0][1], None, dt) if calls else (None, None, text, dt)
        def feedback(s, msgs, name, args, res):
            msgs += [{"role": "assistant", "tool_calls": [{"type": "function", "function": {"name": name, "arguments": args}}]}, {"role": "tool", "content": json.dumps(res)}]
    gen = Gen(); tl = names.voice_tools(); head = "Respond with function calls, and interleaved text and audio.\n\n" + SYSTEM + "\n\nList of tools:"
    asr(waves[0]); out = {"audio": [], "hear_then_call": []}; tr = {}
    for run in range(RUNS):
        torch.manual_seed(run); tr[str(run)] = []
        for i, (label, spoken, expect) in enumerate(EX):
            r = episode(gen, [{"role": "system", "content": head}, {"role": "user", "content": [{"type": "audio", "audio": waves[i]}]}], tl, expect, label); r["run"] = run; out["audio"].append(r)
            text, adt = asr(waves[i]); tr[str(run)].append({"text": text, "asr_s": round(adt, 3)})
            r2 = episode(gen, [{"role": "system", "content": head}, {"role": "user", "content": text}], tl, expect, label); r2["t_call_s"] = round(r2["t_call_s"] + adt, 3); r2["run"] = run; out["hear_then_call"].append(r2)
            print(run, label, "audio:", r["outcome"], "| hear-then-call:", r2["outcome"], flush=True)
    json.dump(tr, open(S + "/transcripts.json", "w"), indent=1); json.dump(out, open(S + "/r3_audio2b.json", "w"), indent=1)
{"hf": hf_main, "llama": llama_main, "omni": omni_main}[sys.argv[1]]()

import base64, json, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import tools, world
URL = os.environ.get("LLAMA_URL", "http://127.0.0.1:8099/v1/chat/completions")
NAME = os.environ.get("RESULT_NAME", "text17")
S = "/var/tmp/voyager-crew/scratch/voice/round2"

def chat(messages, tl):
    body = json.dumps({"messages": messages, "tools": tl, "temperature": 0, "max_tokens": int(os.environ.get("MAXTOK", "2500"))}).encode()
    t = time.time(); r = json.load(urllib.request.urlopen(urllib.request.Request(URL, body, {"Content-Type": "application/json"}), timeout=300))
    return r["choices"][0]["message"], time.time() - t, r["usage"]["completion_tokens"]

AUDIO = os.environ.get("INPUT") == "audio"
def user_content(i, spoken):
    if not AUDIO: return spoken
    b = base64.b64encode(open(f"{S}/in/{i}.wav", "rb").read()).decode()
    return [{"type": "input_audio", "input_audio": {"data": b, "format": "wav"}}]

def run_one(surface, tl, label, spoken, expect, i=0):
    msgs = [{"role": "system", "content": world.SYSTEM}, {"role": "user", "content": user_content(i, spoken)}]
    m, dt, n = chat(msgs, tl); rec = {"label": label, "surface": surface, "tokens": n, "t_call_s": round(dt, 3), "retries": 0, "outcome": None, "error": None}
    if not m.get("tool_calls"): rec["outcome"] = "no call"; rec["raw"] = (m.get("content") or "")[:200]; return rec
    c = m["tool_calls"][0]; name = c["function"]["name"]; args = json.loads(c["function"]["arguments"] or "{}")
    call = tools.to_action(surface, name, args); err = tools.validate(call)
    if err:
        rec["retries"] = 1; rec["first_error"] = err
        msgs2 = msgs + [{"role": "assistant", "content": m.get("content") or "", "tool_calls": m["tool_calls"]}, {"role": "tool", "tool_call_id": c.get("id", "call0"), "content": json.dumps({"rejected": err, "hint": "Fix the call and try again once."})}]
        m2, dt2, n2 = chat(msgs2, tl); rec["t_call_s"] = round(dt + dt2, 3); rec["tokens"] += n2
        if not m2.get("tool_calls"): rec["outcome"] = "no call after retry"; return rec
        c = m2["tool_calls"][0]; name = c["function"]["name"]; args = json.loads(c["function"]["arguments"] or "{}")
        call = tools.to_action(surface, name, args); err = tools.validate(call)
    rec["call"] = {"name": name, "args": args}
    if err: rec["outcome"] = "invalid"; rec["error"] = err; return rec
    if "handoff" in call: rec["outcome"] = "handoff-ok" if expect == "handoff" else "handoff-missed"
    else: rec["outcome"] = "wrong-effect" if expect == "handoff" else ("correct" if expect(call) else "wrong")
    return rec

out = []
chat([{"role": "user", "content": "hi"}], tools.voice_tools())
for surface, tl in {"real": tools.real_tools(), "voice": tools.voice_tools()}.items():
    for i, (label, spoken, g_real, g_voice) in enumerate(world.REQUESTS):
        g = g_real if surface == "real" else (g_voice if g_voice != "same" else g_real)
        r = run_one(surface, tl, label, spoken, "handoff" if g == "handoff" else g, i); out.append(r); print(surface, label, r["outcome"], r["retries"], r["t_call_s"], flush=True)
json.dump(out, open(f"{S}/{NAME}_results.json", "w"), indent=1)

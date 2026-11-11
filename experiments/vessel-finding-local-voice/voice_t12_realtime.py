"""Live voice channel: speech in over the local /v1/realtime WebSocket, hand-off tool call, spoken reply out.

usage: t12_realtime.py <audio dir> <out dir> [verbose]
"""
import base64, json, os, subprocess, sys, time, wave
from voice_ws import WS
from voice_handoff import HANDOFF_TOOL, INSTRUCTIONS, REQUESTS, norm

adir, odir = sys.argv[1], sys.argv[2]
verbose = "verbose" in sys.argv[3:]
INSTR = os.environ.get("RT_INSTRUCTIONS", INSTRUCTIONS)
MODES = os.environ.get("RT_MODALITIES", "audio")          # "audio", "audio,text", or "none" to leave the server default
PREAMBLE = os.environ.get("RT_PREAMBLE", "")              # optional typed user turn sent before the spoken one
ONLY = [int(x) for x in os.environ.get("RT_ONLY", "").split(",") if x]
from retest_lfm import chat


def heard(pcm24k):
    """Transcribe Omni's own spoken reply so the test can read what it said."""
    import io
    buf = io.BytesIO()
    with wave.open(buf, "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(24000); f.writeframes(pcm24k[:24000 * 2 * 20])
    part = {"type": "input_audio", "input_audio": {"data": base64.b64encode(buf.getvalue()).decode(), "format": "wav"}}
    a = chat([{"role": "system", "content": "Perform ASR in English."}, {"role": "user", "content": [part]}], max_tokens=200)
    return (a.get("content") or a.get("error", ""))[:170]
F = HANDOFF_TOOL["function"]
TOOL = {"type": "function", "name": F["name"], "description": F["description"], "parameters": F["parameters"]}

# request index -> what the backing agent answers
CASES = {
    1:  "Closed the Scout Dashboard voyage.",
    9:  "Selected the Deploys fleet in Scout Dashboard.",
    15: "Nothing was changed. No voyage named Billing exists. Open voyages: Scout Dashboard, Voyager Shell, Research Notes.",
    16: "Nothing was changed. This fleet has no Browser panel. Its panels are Claude and Notes.",
    17: "Three voyages are open: Scout Dashboard, Voyager Shell (selected) and Research Notes.",
    5:  "The request timed out before the workspace confirmed it. The outcome is unknown.",
    24: None,   # greeting, no hand-off expected
    25: None,   # sum
}


def pcm16k(path):
    return subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "s16le", "-ar", "16000", "-ac", "1", "-"],
                          capture_output=True, check=True).stdout


def collect(w, t0, tag):
    """Read events until the response finishes. -> dict(first_audio_ms, done_ms, text, call, audio(bytes), types)"""
    out = {"first_audio_ms": None, "done_ms": None, "text": "", "call": None, "audio": b"", "types": []}
    while True:
        ev = w.recv()
        if ev is None:
            out["types"].append("<closed>"); break
        t = ev.get("type", "?")
        if not out["types"] or out["types"][-1] != t:
            out["types"].append(t)
        if t.endswith("audio.delta"):
            if out["first_audio_ms"] is None:
                out["first_audio_ms"] = int((time.time() - t0) * 1000)
            out["audio"] += base64.b64decode(ev.get("delta", ""))
        elif t.endswith("audio_transcript.delta") or t.endswith("output_text.delta") or t.endswith("text.delta"):
            out["text"] += ev.get("delta", "")
        elif t == "response.function_call_arguments.done":
            out["call"] = {"call_id": ev.get("call_id"), "name": ev.get("name"), "arguments": ev.get("arguments")}
        elif t == "response.output_item.done" and (ev.get("item") or {}).get("type") == "function_call" and not out["call"]:
            it = ev["item"]; out["call"] = {"call_id": it.get("call_id"), "name": it.get("name"), "arguments": it.get("arguments")}
        elif t == "error":
            out["error"] = json.dumps(ev)[:400]
            if verbose: print("   ERROR", out["error"])
        elif t == "response.done":
            out["done_ms"] = int((time.time() - t0) * 1000)
            if verbose: print(f"   [{tag}] response.done:", json.dumps(ev)[:900])
            break
    return out


def save_wav(path, pcm, rate=24000):
    with wave.open(path, "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate); f.writeframes(pcm)


os.makedirs(odir, exist_ok=True)
if os.environ.get("RT_ALL"):
    CASES = {i: CASES.get(i) for i in range(len(REQUESTS))}
tally = {"work": 0, "work_ok": 0, "talk": 0, "talk_ok": 0, "ms": [], "first": []}
for idx, outcome in CASES.items():
    if ONLY and idx not in ONLY: continue
    label, prompt, want, keep = REQUESTS[idx]
    w = WS("127.0.0.1", 8112, "/v1/realtime", timeout=120)
    w.recv()  # session.created
    sess = {"type": "realtime", "instructions": INSTR, "tools": [TOOL], "tool_choice": "auto", "max_output_tokens": 500}
    if MODES != "none": sess["output_modalities"] = MODES.split(",")
    w.send({"type": "session.update", "session": sess})
    if PREAMBLE:
        w.send({"type": "conversation.item.create", "item": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": PREAMBLE}]}})
    pcm = pcm16k(os.path.join(adir, f"{idx:02d}.wav"))
    for i in range(0, len(pcm), 32000):
        w.send({"type": "input_audio_buffer.append", "audio": base64.b64encode(pcm[i:i + 32000]).decode()})
    t0 = time.time()                      # the human has stopped speaking
    w.send({"type": "input_audio_buffer.commit"})
    w.send({"type": "response.create"})
    r1 = collect(w, t0, "turn")
    if verbose: print("   events:", " > ".join(r1["types"]))
    line = f"{label:15s} said: {prompt[:44]:44s}"
    if r1["call"]:
        try: req = json.loads(r1["call"]["arguments"]).get("request", "")
        except Exception: req = str(r1["call"]["arguments"])
        line += f"\n      hand-off after {r1['done_ms']} ms: {req[:90]}"
        if r1["audio"]: line += f"   (also spoke {len(r1['audio'])//48000:.0f}s first: {r1['text'][:60]})"
        if outcome is not None:
            w.send({"type": "conversation.item.create", "item": {"type": "function_call_output", "call_id": r1["call"]["call_id"], "output": outcome}})
            t1 = time.time()
            w.send({"type": "response.create"})
            r2 = collect(w, t1, "report")
            if verbose: print("   events:", " > ".join(r2["types"]))
            if r2["call"]:
                line += f"\n      agent said: {outcome[:80]}\n      omni CALLED AGAIN: {r2['call']['arguments'][:90]}"
            else:
                line += (f"\n      agent said: {outcome[:80]}\n      omni spoke (first sound {r2['first_audio_ms']} ms, {len(r2['audio'])/48000:.1f}s of speech): {r2['text'][:150] or '[heard] ' + heard(r2['audio'])}")
                if r2["audio"]: save_wav(os.path.join(odir, f"{idx:02d}-report.wav"), r2["audio"])
    else:
        line += f"\n      no hand-off; spoke (first sound {r1['first_audio_ms']} ms, {len(r1['audio'])/48000:.1f}s of speech): {r1['text'][:150] or '[heard] ' + heard(r1['audio'])}"
        if r1["audio"]: save_wav(os.path.join(odir, f"{idx:02d}-reply.wav"), r1["audio"])
    if r1.get("error"): line += "\n      ERROR " + r1["error"]
    if want:
        tally["work"] += 1
        got = norm(json.loads(r1["call"]["arguments"]).get("request", "")) if r1["call"] else ""
        missing = [k for k in keep if norm(k).strip() not in got]
        ok = bool(r1["call"]) and not missing
        tally["work_ok"] += ok
        if r1["call"]: tally["ms"].append(r1["done_ms"])
        if r1["call"] and missing: line += f"\n      <-- lost {missing}"
    else:
        tally["talk"] += 1; tally["talk_ok"] += not r1["call"]
        if r1["first_audio_ms"]: tally["first"].append(r1["first_audio_ms"])
    print(line)
    w.close()

ms = sorted(tally["ms"]) or [0]; fa = sorted(tally["first"]) or [0]
print(f"\nSUMMARY spoken workspace requests handed off intact: {tally['work_ok']}/{tally['work']} | small talk answered without hand-off: "
      f"{tally['talk_ok']}/{tally['talk']} | end of speech to hand-off: median {ms[len(ms)//2]} ms, worst {ms[-1]} ms | small talk first sound median {fa[len(fa)//2]} ms")

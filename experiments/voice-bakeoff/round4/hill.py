import asyncio, base64, json, os, statistics, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..")); sys.path.insert(0, os.path.join(HERE, "..", "round2"))
import names, tools, world, requests4 as Q
from voice_ws import WS
S = "/var/tmp/voyager-crew/scratch/voice/round4"; os.makedirs(S + "/in", exist_ok=True)
VOICES = ["en-GB-RyanNeural", "en-US-AndrewNeural", "en-GB-SoniaNeural"]
WORKSPACE = "\n".join(["Voyages and Fleets: " + "; ".join(f"{vn}: " + ", ".join(n for _, n in fl) for _, vn, fl in world.TREE), "Selected Fleet: Voyager Shell/Main. Vessels (on-screen name, address, program, position):"] + [f"- {n}, {a}, {prog}, {pos}" for _, n, a, prog, pos in world.PANELS])
INSTR_BASE = "You are Voyager's voice. The human speaks a request; act on it with a tool call, never ask back unless a tool says the name is ambiguous. Say names, addresses or positions as the human did. After the tool result, say one short true sentence about what happened."
FAIL = ("can't", "cannot", "couldn't", "unable", "sorry", "error", "didn't", "not able", "wasn't")
CONFIRM = ("done", "ok", "okay", "maximiz", "open", "moved", "move", "renam", "dock", "show", "here", "now", "restor", "hid", "bring", "went", "switch", "home", "got it", "on it", "sure", "taking")
HAND = ("voyager", "ask", "check", "look", "on it", "pass", "hand", "send", "let", "will", "working")

def pcm(i, text):
    wav = f"{S}/in/{i}.wav"
    if not os.path.exists(wav):
        import edge_tts
        for attempt in range(4):
            try: asyncio.run(edge_tts.Communicate(text, VOICES[i % 3]).save(wav + ".mp3")); break
            except Exception: time.sleep(2)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav + ".mp3", "-ar", "16000", "-ac", "1", wav], check=True)
    return subprocess.run(["ffmpeg", "-loglevel", "error", "-i", wav, "-f", "s16le", "-ar", "16000", "-ac", "1", "-"], capture_output=True, check=True).stdout

def collect(w, t0):
    out = {"first_audio": None, "text": "", "call": None, "done": None}
    while True:
        ev = w.recv()
        if ev is None: break
        t = ev.get("type", "")
        if t.endswith("audio.delta") and out["first_audio"] is None: out["first_audio"] = time.time() - t0
        elif t.endswith("text.delta") and "function_call" not in t: out["text"] += ev.get("delta", "")
        elif t == "response.function_call_arguments.done": out["call"] = {"id": ev.get("call_id"), "name": ev.get("name"), "args": ev.get("arguments"), "t": time.time() - t0}
        elif t == "response.output_item.done" and (ev.get("item") or {}).get("type") == "function_call" and not out["call"]:
            it = ev["item"]; out["call"] = {"id": it.get("call_id"), "name": it.get("name"), "args": it.get("arguments"), "t": time.time() - t0}
        elif t == "response.done": out["done"] = time.time() - t0; break
    return out

def result_text(name, args, call):
    a = call["action"]; op = a["operation"]
    ents = [e for e in names.entries() if e["id"] in json.dumps(a)]
    label = ", ".join(e["name"] for e in ents) or "the workspace"
    verb = {"dock": "Docked to", "home": "Went home", "select-fleet": "Opened fleet", "select-voyage": "Opened voyage", "set-placement-maximized": ("Maximized" if a.get("maximized") else "Restored"), "set-placement-hidden": "Hid", "rename": f"Renamed to {a.get('name')}:", "reveal-placement": "Revealed", "move-placement": "Moved"}.get(op, op)
    return f"{verb} {label}." if op != "home" else "Went home."

def run_one(cfg, i):
    cat, spoken, kind, grader, words = Q.R[i]; spec = cfg["spec"]; tl = names.voice_tools(spec)
    rt_tools = [{"type": "function", "name": t["function"]["name"], "description": t["function"]["description"], "parameters": t["function"]["parameters"]} for t in tl]
    w = WS("127.0.0.1", 8112, "/v1/realtime", timeout=120); w.recv()
    w.send({"type": "session.update", "session": {"type": "realtime", "instructions": cfg["instructions"] + "\n\n" + WORKSPACE, "tools": rt_tools, "tool_choice": cfg.get("first_choice", "auto"), "output_modalities": ["audio", "text"], "max_output_tokens": 300}})
    data = pcm(i, spoken)
    for k in range(0, len(data), 32000): w.send({"type": "input_audio_buffer.append", "audio": base64.b64encode(data[k:k + 32000]).decode()})
    t0 = time.time(); w.send({"type": "input_audio_buffer.commit"}); w.send({"type": "response.create"})
    r = {"i": i, "cat": cat, "spoken": spoken, "kind": kind, "retries": 0, "outcome": None, "t_effect": None, "t_sound": None, "reply": "", "unsafe": False, "reply_true": None}
    result = None
    for turn in range(3):
        o = collect(w, t0)
        if not o["call"]:
            r["reply"] = o["text"]; r["t_sound"] = o["first_audio"]; r["outcome"] = "asked" if turn >= 0 else "no call"; break
        try: args = json.loads(o["call"]["args"] or "{}")
        except Exception: args = {}
        kindr, val = names.to_call(o["call"]["name"], args, spec)
        if kindr == "handoff":
            r["t_effect"] = o["call"]["t"]; r["outcome"] = "handoff"; result = "Asked Voyager. It will report back."
        elif kindr == "call":
            err = tools.validate(val)
            if err: kindr, val = "retry", {"rejected": err}
            else:
                r["t_effect"] = o["call"]["t"]; r["call"] = val; r["outcome"] = "effect"; result = result_text(o["call"]["name"], args, val)
        if kindr == "retry":
            r["retries"] += 1; w.send({"type": "conversation.item.create", "item": {"type": "function_call_output", "call_id": o["call"]["id"], "output": json.dumps(val)}}); w.send({"type": "response.create"}); continue
        w.send({"type": "conversation.item.create", "item": {"type": "function_call_output", "call_id": o["call"]["id"], "output": result}}); t1 = time.time()
        if cfg.get("first_choice", "auto") != "auto": w.send({"type": "session.update", "session": {"type": "realtime", "tool_choice": "none"}})
        w.send({"type": "response.create"})
        o2 = collect(w, t0); r["reply"] = o2["text"]; r["t_sound"] = o2["first_audio"]; break
    w.close()
    return grade(r, grader, words)

def grade(r, grader, words):
    kind, out = r["kind"], r["outcome"]; reply = (r["reply"] or "").lower()
    if kind == "handoff":
        right = out == "handoff"; r["unsafe"] = out == "effect"
        r["reply_true"] = right and any(h in reply for h in HAND) and not any(f in reply for f in FAIL)
    else:
        if out == "effect": right = bool(grader(r["call"])); r["unsafe"] = not right
        elif out == "asked": right = kind == "ambig" and "?" in reply
        else: right = False
        if out == "effect" and right: r["reply_true"] = (words in reply or any(c in reply for c in CONFIRM)) and not any(f in reply for f in FAIL)
        elif out == "asked" and right: r["reply_true"] = True
        else: r["reply_true"] = False
    r["right"] = right
    r["timing_ok"] = (r["t_effect"] is not None and r["t_effect"] <= 1.5 or out == "asked") and r["t_sound"] is not None and r["t_sound"] <= 1.0
    r["pass"] = bool(right and r["reply_true"] and not r["unsafe"] and r["timing_ok"])
    return r

def summarize(rows):
    n = len(rows); m = lambda k: [x[k] for x in rows if x[k] is not None]
    med = lambda v: round(statistics.median(v), 2) if v else None
    return {"n": n, "pass": sum(x["pass"] for x in rows), "right": sum(x["right"] for x in rows), "reply_true": sum(bool(x["reply_true"]) for x in rows), "unsafe": sum(x["unsafe"] for x in rows),
            "timing_ok": sum(x["timing_ok"] for x in rows), "t_effect_med": med(m("t_effect")), "t_sound_med": med(m("t_sound")), "retries": sum(x["retries"] for x in rows)}

def run(cfg, which, repeats=1):
    idx = Q.HELD_OUT if which == "held" else Q.TUNE if which == "tune" else list(range(len(Q.R)))
    rows = []
    for rep in range(repeats):
        for i in idx:
            r = run_one(cfg, i); r["rep"] = rep; rows.append(r)
    return rows

if __name__ == "__main__":
    import importlib; cfg = importlib.import_module("configs").CONFIGS[sys.argv[1]]; which = sys.argv[2]; rows = run(cfg, which, int(sys.argv[3]) if len(sys.argv) > 3 else 1)
    json.dump(rows, open(f"{S}/{sys.argv[1]}_{which}.json", "w"), indent=1); print(json.dumps(summarize(rows)))
    for r in rows:
        if not r["pass"]: print("FAIL", r["cat"], "|", r["spoken"][:40], "|", r["outcome"], r["retries"], "eff", r["t_effect"] and round(r["t_effect"], 2), "snd", r["t_sound"] and round(r["t_sound"], 2), "|", (r["reply"] or "")[:60], "| right", r["right"], "true", r["reply_true"])

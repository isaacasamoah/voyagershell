"""Decode the bytes a traced run exchanged with `hc connect` into message shapes.

Usage: decode_core.py RUN_DIR --id ID --out FILE
The stream starts with one JSON-RPC line (hello) each way, then binary frames:
4-byte little-endian channel, 1-byte kind (0 data, 1 credit, 2 close), 4-byte length, payload.
Channel 0 data is JSON-RPC; other channels carry terminal or activity bytes.
Personal paths, user and host names are replaced before anything is written.
"""
import json, os, re, socket, sys, getpass
from pathlib import Path

args = sys.argv[1:]
run = Path(args.pop(0)); opts = dict(zip(args[::2], args[1::2]))
HOME, USER, HOST = os.path.expanduser("~"), getpass.getuser(), socket.gethostname().split(".")[0]

def redact(text):
    text = text.replace(HOME, "~").replace(os.path.realpath(HOME), "~")
    text = re.sub(r"/home/[^/\s\"]+", "~", text)
    text = re.sub(r"\b%s\b" % re.escape(USER), "<user>", text)
    return re.sub(r"\b%s\b" % re.escape(HOST), "<host>", text)

def trim(value, depth=0):
    if isinstance(value, dict):
        if depth > 4: return "{…}"
        items = list(value.items())
        out = {k: trim(v, depth + 1) for k, v in items[:12]}
        if len(items) > 12: out["…"] = f"{len(items) - 12} more fields"
        return out
    if isinstance(value, list):
        if depth > 4: return ["…"]
        return [trim(v, depth + 1) for v in value[:2]] + ([f"… {len(value) - 2} more"] if len(value) > 2 else [])
    if isinstance(value, str):
        value = redact(value)
        return value if len(value) <= 80 else value[:77] + "…"
    return value

def frames(data):
    nl = data.find(b"\n")
    first = json.loads(data[:nl]) if nl > 0 else None
    i, out = nl + 1, []
    while i + 9 <= len(data):
        channel = int.from_bytes(data[i:i + 4], "little"); kind = data[i + 4]; length = int.from_bytes(data[i + 5:i + 9], "little")
        payload = data[i + 9:i + 9 + length]
        if len(payload) < length: break
        out.append((channel, kind, payload)); i += 9 + length
    return first, out

sent_first, sent = frames((run / "core.in.bin").read_bytes())
recv_first, recv = frames((run / "core.out.bin").read_bytes())
methods, notes, results, channels = {}, {}, {}, {}
def rpc(direction, msg):
    if "method" in msg and "id" in msg:
        m = methods.setdefault(msg["method"], {"count": 0, "request": None, "ids": []})
        m["count"] += 1
        if m["request"] is None: m["request"] = trim(msg.get("params"))
        m["ids"].append(msg["id"])
    elif "method" in msg:
        n = notes.setdefault(msg["method"], {"count": 0, "direction": direction, "example": None})
        n["count"] += 1
        if n["example"] is None: n["example"] = trim(msg.get("params"))
    elif "id" in msg:
        results[msg["id"]] = msg
for msg, d in ((sent_first, "to core"), (recv_first, "from core")):
    if msg: rpc(d, msg)
for direction, stream in (("to core", sent), ("from core", recv)):
    for channel, kind, payload in stream:
        c = channels.setdefault(str(channel), {"data_frames_to_core": 0, "data_frames_from_core": 0, "bytes_to_core": 0, "bytes_from_core": 0, "credit_frames": 0, "close_frames": 0, "example_to_core": None})
        if kind == 1: c["credit_frames"] += 1; continue
        if kind == 2: c["close_frames"] += 1; continue
        key = "to_core" if direction == "to core" else "from_core"
        c[f"data_frames_{key}"] += 1; c[f"bytes_{key}"] += len(payload)
        if channel == 0:
            try: rpc(direction, json.loads(payload))
            except ValueError: pass
        elif direction == "to core" and c["example_to_core"] is None:
            c["example_to_core"] = {"bytes": len(payload), "first_bytes_hex": payload[:12].hex(" ")}
for name, m in methods.items():
    reply = next((results[i] for i in m.pop("ids") if i in results), None)
    if reply is not None:
        m["result"] = trim(reply.get("result")) if "result" in reply else None
        if "error" in reply: m["error"] = trim(reply["error"])
summary = {"id": opts["--id"], "source": "bytes recorded by trace/hc_tee.sh during the run, decoded by trace/decode_core.py",
           "methods": dict(sorted(methods.items())), "notifications": dict(sorted(notes.items())),
           "channels": {"control (0)": channels.pop("0", {}), "terminal and activity channels": {"count": len(channels),
                        "data_frames_to_core": sum(c["data_frames_to_core"] for c in channels.values()),
                        "data_frames_from_core": sum(c["data_frames_from_core"] for c in channels.values()),
                        "bytes_from_core": sum(c["bytes_from_core"] for c in channels.values()),
                        "credit_frames": sum(c["credit_frames"] for c in channels.values()),
                        "close_frames": sum(c["close_frames"] for c in channels.values()),
                        "example_frames_to_core": [c["example_to_core"] for c in channels.values() if c["example_to_core"]][:3]}}}
Path(opts["--out"]).write_text(json.dumps(summary, indent=1) + "\n")
print(f"{opts['--id']}: {len(methods)} methods, {len(notes)} notification kinds, {len(channels)} terminal channels")

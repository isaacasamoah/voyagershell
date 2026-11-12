"""Summarise a traced run into runs/<id>.json: for each pathway step, was its function seen running, and on which thread.

Usage: analyze.py RUN_DIR --id ID --layer LAYER_DIR --out FILE [--alias mark=pathway ...] [--plain TEXT] [--note TEXT]
A run's marks named `mark:<label>` open a window; label is a pathway id, or an alias for one.
Steps are matched by their `symbol` field. Script, Core and program steps cannot be seen by the debugger.
"""
import json, sys, time
from pathlib import Path
import yaml

args = sys.argv[1:]
run = Path(args.pop(0))
opts, aliases = {}, {}
while args:
    key = args.pop(0).lstrip("-")
    value = args.pop(0)
    if key == "alias":
        a, b = value.split("="); aliases[a] = b
    elif key == "finding":
        a, b = value.split("=", 1); opts.setdefault("findings", []).append({"pathway": a, "plain": b})
    else:
        opts[key] = value
info = json.loads((run / "run.json").read_text())
marks = [json.loads(line) for line in (run / "marks.jsonl").read_text().splitlines()]
trace = [json.loads(line) for line in (run / "trace.jsonl").read_text().splitlines() if '"tid"' in line]
pid = next(t["pid"] for t in trace)

# Name threads by what they first ran.
first = {}
for t in trace:
    first.setdefault(t["tid"], t)
owner = next((t["tid"] for t in trace if t["key"].endswith("start_with_launches::{closure#0}") and t["tid"] != pid), None)
def role(t):
    if t["tid"] == pid: return "ui-thread"
    if t["tid"] == owner: return "owner-thread"
    if (t.get("thread") or "").startswith("Worker-"): return "background"
    return "background"
ROLE_NAME = {"ui-thread": "the UI thread", "owner-thread": "the app owner thread", "background": "a background thread"}

windows = []
for m in marks:
    if m["mark"] == "start": m["mark"] = "mark:startup"
    if m["mark"] == "stop": m["mark"] = "mark:quit"
labelled = [m for m in marks if m["mark"].startswith("mark:")]
end = max([t["wall"] for t in trace] + [labelled[-1]["wall"]]) + 1
for i, m in enumerate(labelled):
    label = m["mark"][5:]
    windows.append({"pathway": aliases.get(label, label), "label": label, "from": m["wall"], "to": labelled[i + 1]["wall"] if i + 1 < len(labelled) else end})

pathways = []
for file in sorted(Path(opts["layer"]).glob("*.yaml")):
    data = yaml.safe_load(file.read_text()) or {}
    pathways += data.get("pathways", [])
by_id = {p["id"]: p for p in pathways}
result = {}
for pathway_id in sorted({w["pathway"] for w in windows}):
    p = by_id.get(pathway_id)
    if not p:
        continue
    spans = [w for w in windows if w["pathway"] == pathway_id]
    hits = [t for t in trace if any(w["from"] <= t["wall"] < w["to"] for w in spans)]
    steps = {}
    for s in p["steps"] + [x for b in p.get("branches", []) for x in b.get("steps", [])]:
        sym = s.get("symbol")
        runs_on = s.get("runs_on")
        if runs_on in ("core", "program", "script", "os") or sym in (None, "script", "external"):
            steps[s["id"]] = {"checkable": False, "reason": {"script": "runs in the script engine; not visible to the debugger", "core": "runs inside Herdr Core", "program": "runs in another program"}.get(runs_on, "no symbol to watch")}
            continue
        if sym == "inlined":
            sym = s.get("symbol_caller")
            if not sym:
                steps[s["id"]] = {"checkable": False, "reason": "inlined by the optimizer; not visible"}
                continue
        keyed = [t for t in hits if t["key"] == sym]
        exact = [t for t in keyed if t.get("name") == sym or (t.get("name", "").startswith(sym) and "{closure" not in t.get("name", "")[len(sym):])]
        found = exact or keyed
        loop_entry = sym.endswith("start_with_launches::{closure#0}") or "__rust_begin_short_backtrace" in sym
        if not found and loop_entry and any(t["key"] == sym and t["wall"] < spans[0]["from"] for t in trace):
            steps[s["id"]] = {"checkable": False, "reason": "inside a long-running loop: the debugger saw the loop start earlier, not each pass", "symbol": sym}
            continue
        roles = sorted({role(t) for t in found})
        entry = {"checkable": True, "seen": bool(found), "symbol": sym, "hits": len(found)}
        if found:
            entry["thread"] = ROLE_NAME[roles[0]] if len(roles) == 1 else ", ".join(ROLE_NAME[r] for r in roles)
            entry["roles"] = roles
            entry["matches"] = runs_on in roles
            entry["after_ms"] = round((found[0]["wall"] - spans[0]["from"]) * 1000)
        else:
            elsewhere = any(t["key"] == sym for t in trace)
            entry["reason"] = ("ran elsewhere in this run but not during this step; the optimizer may have inlined this call" if elsewhere
                               else "never seen running in this run")
        steps[s["id"]] = entry
    result[pathway_id] = steps

summary = {
    "id": opts["id"], "date": time.strftime("%Y-%m-%d", time.localtime(info["started"])),
    "plain": opts.get("plain", ""), "binary_sha256": info["binary_sha256"], "binary_note": opts.get("note", ""),
    "session": info["session"], "core_stop": info.get("core_stop"),
    "windows": [{"pathway": w["pathway"], "label": w["label"], "seconds": round(w["to"] - w["from"], 1)} for w in windows],
    "threads": {"ui": pid is not None, "owner_identified": owner is not None},
    "steps": result,
    "findings": opts.get("findings", []),
}
Path(opts["out"]).write_text(json.dumps(summary, indent=1) + "\n")
seen = sum(1 for p in result.values() for s in p.values() if s.get("seen"))
checkable = sum(1 for p in result.values() for s in p.values() if s.get("checkable"))
print(f"{opts['id']}: {seen} of {checkable} checkable steps seen across {len(result)} pathways")

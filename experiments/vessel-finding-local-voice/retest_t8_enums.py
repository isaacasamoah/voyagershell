"""One-shot with outline, plus a per-request schema where every id field only admits ids that exist
(the server's constrained decoding then makes an invented or wrong-kind id impossible) and the version is fixed."""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
from retest_lfm import load_schema, strip_meta, tool, chat
from retest_world import TASKS, LAYOUT, VERSION, act
from retest_t2_eval import discriminator_first, with_op_descriptions
import retest_t3_context as ctx

V = [v["id"] for v in LAYOUT["voyages"]]
F = [f["id"] for v in LAYOUT["voyages"] for f in v["fleets"]]
P = [p["id"] for v in LAYOUT["voyages"] for f in v["fleets"] for p in f["vessels"]]
ID_KIND = {"select-voyage": V, "close-voyage": V, "reopen-voyage": V, "confirm-voyage-close": V, "cancel-voyage-close": V, "move-voyage": V,
           "select-fleet": F, "close-fleet": F, "reopen-fleet": F, "move-fleet": F,
           "reveal-panel": P, "reopen-panel": P, "set-panel-maximized": P, "set-panel-hidden": P, "remove-panel": P, "move-panel": P}
def enum(ids): return {"type": "string", "enum": ids}

def specialize(schema):
    s = json.loads(json.dumps(schema))
    s["properties"]["expectedVersion"] = {"type": "string", "enum": [VERSION]}
    for v in s["definitions"]["Action"]["oneOf"]:
        op = v["properties"]["operation"]["const"]; props = v["properties"]
        if op in ID_KIND and "id" in props: props["id"] = enum(ID_KIND[op])
        if "voyage" in props and props["voyage"].get("type") == "string": props["voyage"] = enum(V)
    for name in ("RenameTarget", "Context"):
        for v in s["definitions"][name]["oneOf"]:
            kind = v["properties"]["kind"]["const"]
            ids = {"voyage": V, "fleet": F, "vessel": P}.get(kind)
            if ids and "id" in v["properties"]: v["properties"]["id"] = enum(ids)
    for v in s["definitions"]["PanelOwner"]["oneOf"]:
        if v["properties"]["kind"]["const"] == "fleet": v["properties"]["id"] = enum(F)
        else: v["properties"]["voyage"] = enum(V)
    return s

SCHEMA = specialize(discriminator_first(with_op_descriptions(strip_meta(load_schema()))))
TOOLS = [tool(SCHEMA, ctx.DESC)]

def run(task, think):
    label, prompt, grade = task
    r = chat([{"role": "system", "content": ctx.SYSTEM}, {"role": "user", "content": prompt}], tools=TOOLS, think=think, max_tokens=1500 if think else 400)
    a = act(r.get("args"))
    if "error" in r: s = "ERROR " + r["error"][:90]
    elif grade(a): s = "ok"
    elif r.get("calls"): s = "wrong:" + json.dumps(a)[:100]
    else: s = "no-call(" + r.get("finish", "?") + ") " + r.get("content", "")[:70]
    return label, s, r.get("tokens", 0)

for think in ([False, True] if sys.argv[1:] == ["both"] else [False]):
    with ThreadPoolExecutor(4) as pool:
        rows = list(pool.map(lambda t: run(t, think), TASKS))
    print(f"=== one-shot, outline + only-real-ids schema, thinking {'on' if think else 'off'}: {sum(s == 'ok' for _, s, _ in rows)}/10 right, median {sorted(t for _, _, t in rows)[5]} tokens")
    for label, s, t in rows: print(f"    {label:17s} {s:70s} {t:4d} tok")

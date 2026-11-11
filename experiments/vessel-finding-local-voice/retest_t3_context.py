"""One-shot variant: the harness hands the model a compact workspace outline (ids + version) up front,
so an effect needs one call instead of inspect-then-act."""
import json, sys
from concurrent.futures import ThreadPoolExecutor
from retest_lfm import load_schema, strip_meta, tool, chat
from retest_world import TASKS, LAYOUT, VERSION, act
from retest_t2_eval import discriminator_first, with_op_descriptions, REC

def outline(layout, version):
    kinds = {c["id"]: c["typeId"] for c in layout["contents"]}
    lines = [f"version: {version}", f"focus: {layout['context']['kind']} {layout['context']['id']}"]
    for v in layout["voyages"]:
        sel = " (selected)" if v["id"] == layout["selectedVoyage"] else ""
        lines.append(f'voyage {v["id"]} "{v["name"]}" cwd={v["cwd"]}{sel}')
        for f in v["fleets"]:
            sel = " (selected, focus)" if f["id"] == layout["selectedFleet"] else ""
            lines.append(f'  fleet {f["id"]} "{f["name"]}"{sel}')
            for p in f["vessels"]:
                lines.append(f'    panel {p["id"]} "{p["name"]}" type={kinds[p["content"]]} content={p["content"]}')
    return "\n".join(lines)

OUTLINE = outline(LAYOUT, VERSION)
SYSTEM = ("You are Voyager, the human's concise private workspace administrator. Keep replies brief and factual.\n"
          "voyager.workspace (current, authoritative):\n" + OUTLINE)
DESC = ("Manage the workspace. voyager.workspace in the system message lists the current version and every exact id: "
        "use that version as expectedVersion and those ids directly, in one call. Never invent an id. "
        "Call inspect only when something you need is not listed. Dock changes the avatar's focus and is only for when the human says dock.")

SCHEMA = discriminator_first(with_op_descriptions(strip_meta(load_schema())))
TOOLS = [tool(SCHEMA, DESC)]

def run(task, think, sampling):
    label, prompt, grade = task
    r = chat([{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}], tools=TOOLS,
             think=think, max_tokens=1500 if think else 400, **sampling)
    a = act(r.get("args")); v = (r.get("args") or {}).get("expectedVersion")
    if "error" in r: s = "ERROR " + r["error"][:80]
    elif grade(a): s = "ok" if v == VERSION else f"ok-but-version={v}"
    elif r.get("calls"): s = "wrong:" + json.dumps(a)[:110]
    else: s = "no-call(" + r.get("finish", "?") + ") " + r.get("content", "")[:60]
    return label, s, r.get("tokens", 0), r.get("gen_ms", 0)

if __name__ == "__main__":
    print(OUTLINE); print(f"(outline is {len(OUTLINE)} bytes vs {len(json.dumps(LAYOUT, separators=(',',':')))} bytes of raw layout JSON)\n")
    for name, think, sampling in [("thinking off", False, {}), ("thinking off + recommended sampling", False, REC),
                                  ("thinking on", True, {}), ("thinking on + recommended sampling", True, REC)]:
        with ThreadPoolExecutor(4) as pool:
            rows = list(pool.map(lambda t: run(t, think, sampling), TASKS))
        ok = sum(s == "ok" for _, s, _, _ in rows); toks = sorted(t for _, _, t, _ in rows)
        print(f"=== one-shot with outline, {name}: {ok}/10 right, median {toks[5]} tokens")
        for label, s, t, ms in rows:
            print(f"    {label:17s} {s:60s} {t:4d} tok")

"""Graded two-step eval: (1) what does the model call first, (2) given a real-shaped inspect result, is the effect call right.

Step 2 always continues from a canonical inspect call so the two steps are measured independently.
"""
import copy, json, sys
from concurrent.futures import ThreadPoolExecutor
from retest_lfm import load_schema, strip_meta, tool, chat, ORIGINAL_DESC, EXP
from retest_world import TASKS, RESPONSE_TEXT, VERSION, FOCUS, act

sys.path.insert(0, f"{EXP}/experiments/lfm3-avatar")
from op_descriptions import OP_DESCRIPTIONS  # the earlier session's per-operation notes, reused unchanged

SESSION_AUGMENTED = ORIGINAL_DESC + (
    " If the human refers to something indirectly (this panel, that voyage, the one I just closed) "
    "and you do not already have its exact id from this conversation, call inspect first before any "
    "other operation - do not guess an id. "
    "Example inspect call: {\"action\":{\"operation\":\"inspect\"},\"expectedVersion\":\"0\"}. "
    "Example creating a brand new voyage with a name and folder the human gave you directly: "
    "{\"action\":{\"operation\":\"create-voyage\",\"name\":\"Research\",\"cwd\":\"/home/isaac/research\"},"
    "\"expectedVersion\":\"0\"} - use create-voyage-from-source only when the human named an existing "
    "template or source location to copy from, not a plain new folder."
)

SYSTEM = ("You are Voyager, the human's concise private workspace administrator. Keep replies brief and factual.\n"
          "voyager.focus: " + json.dumps(FOCUS))


def discriminator_first(node):
    """Reorder properties everywhere so a const-valued field (operation / kind) is written first,
    then the remaining fields in the Rust declaration order (the `required` list). Content is unchanged."""
    if isinstance(node, list):
        return [discriminator_first(n) for n in node]
    if not isinstance(node, dict):
        return node
    out = {k: discriminator_first(v) for k, v in node.items()}
    props = out.get("properties")
    if isinstance(props, dict):
        consts = [k for k, v in props.items() if isinstance(v, dict) and "const" in v]
        req = [k for k in out.get("required", []) if k in props and k not in consts]
        rest = [k for k in props if k not in consts and k not in req]
        out["properties"] = {k: props[k] for k in consts + req + rest}
    return out


def with_op_descriptions(schema):
    s = copy.deepcopy(schema)
    for v in s["definitions"]["Action"]["oneOf"]:
        op = v["properties"]["operation"]["const"]
        if op in OP_DESCRIPTIONS:
            v["description"] = OP_DESCRIPTIONS[op]
    return s


BASE = strip_meta(load_schema())
REC = {"temperature": 0.1, "top_k": 50, "repeat_penalty": 1.1}  # Liquid's recommended sampling for tool use

CONFIGS = {
    # name: (schema, description, think, sampling)
    "S0 as-run (alphabetical, original text)":   (BASE, ORIGINAL_DESC, True, {}),
    "S1 session's best (alphabetical+examples+op notes)": (with_op_descriptions(BASE), SESSION_AUGMENTED, True, {}),
    "F1 discriminator-first":                    (discriminator_first(BASE), ORIGINAL_DESC, True, {}),
    "F2 discriminator-first + op notes":         (discriminator_first(with_op_descriptions(BASE)), ORIGINAL_DESC, True, {}),
    "F3 = F2, thinking off":                     (discriminator_first(with_op_descriptions(BASE)), ORIGINAL_DESC, False, {}),
    "F4 = F2, recommended sampling":             (discriminator_first(with_op_descriptions(BASE)), ORIGINAL_DESC, True, REC),
    "F5 = F2, thinking off + recommended sampling": (discriminator_first(with_op_descriptions(BASE)), ORIGINAL_DESC, False, REC),
    "S2 alphabetical + op notes, thinking off":  (with_op_descriptions(BASE), ORIGINAL_DESC, False, {}),
}


def run_task(cfg, task):
    schema, desc, think, sampling = cfg
    label, prompt, grade = task
    tools = [tool(schema, desc)]
    base = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]
    budget = 1500 if think else 400
    r1 = chat(base, tools=tools, think=think, max_tokens=budget, **sampling)
    # step 2 from a canonical inspect call
    hist = base + [
        {"role": "assistant", "content": "", "tool_calls": [{"id": "call_inspect", "type": "function",
            "function": {"name": "voyager_workspace", "arguments": json.dumps({"action": {"operation": "inspect"}, "expectedVersion": "0"})}}]},
        {"role": "tool", "tool_call_id": "call_inspect", "content": RESPONSE_TEXT},
    ]
    r2 = chat(hist, tools=tools, think=think, max_tokens=budget, **sampling)
    a1 = act(r1.get("args")); a2 = act(r2.get("args"))
    v1 = (r1.get("args") or {}).get("expectedVersion"); v2 = (r2.get("args") or {}).get("expectedVersion")
    if "error" in r1: s1 = "ERROR"
    elif a1.get("operation") == "inspect": s1 = "inspect"
    elif grade(a1): s1 = "direct-ok" if v1 == VERSION else "direct-stale"
    elif r1.get("calls"): s1 = "wrong:" + str(a1.get("operation"))
    else: s1 = "no-call(" + r1.get("finish", "?") + ")"
    if "error" in r2: s2 = "ERROR"
    elif grade(a2): s2 = "ok" if v2 == VERSION else f"ok-but-version={v2}"
    elif r2.get("calls"): s2 = "wrong:" + str(a2.get("operation"))
    else: s2 = "no-call(" + r2.get("finish", "?") + ")"
    return {"task": label, "s1": s1, "s2": s2, "t1": r1.get("tokens", 0), "t2": r2.get("tokens", 0),
            "ms1": r1.get("gen_ms", 0), "ms2": r2.get("gen_ms", 0), "r1": r1, "r2": r2}


if __name__ == "__main__":
    only = sys.argv[1:]  # optional config-name prefixes
    out = {}
    for name, cfg in CONFIGS.items():
        if only and not any(name.startswith(o) for o in only):
            continue
        with ThreadPoolExecutor(4) as pool:
            rows = list(pool.map(lambda t: run_task(cfg, t), TASKS))
        out[name] = rows
        ok1 = sum(r["s1"] in ("inspect", "direct-ok") for r in rows); ok2 = sum(r["s2"] == "ok" for r in rows)
        med = lambda xs: sorted(xs)[len(xs) // 2]
        print(f"\n=== {name}\n    first call right: {ok1}/10 | effect call right: {ok2}/10 | "
              f"median tokens {med([r['t1'] for r in rows])}/{med([r['t2'] for r in rows])} | "
              f"median model time {med([r['ms1'] for r in rows])}ms / {med([r['ms2'] for r in rows])}ms")
        for r in rows:
            print(f"    {r['task']:17s} step1={r['s1']:34s} ({r['t1']:4d} tok) step2={r['s2']:30s} ({r['t2']:4d} tok)")
    json.dump({k: [{kk: vv for kk, vv in r.items()} for r in v] for k, v in out.items()},
              open("t2_results.json" if not only else "t2_results_partial.json", "w"), indent=1, default=str)

"""The same ten graded tasks, but with all four real tools loaded (fixed ordering, unique definition names)."""
import json, sys
from concurrent.futures import ThreadPoolExecutor
from retest_lfm import load_schema, strip_meta, chat
from retest_t2_eval import discriminator_first, with_op_descriptions, SYSTEM
from retest_t4_fourtools import rename_defs, descs, FILES
from retest_world import TASKS, RESPONSE_TEXT, VERSION, act

def tools_for(short_desc):
    out = []
    for name, f in FILES.items():
        s = strip_meta(load_schema(f))
        if name == "voyager_workspace": s = with_op_descriptions(s)
        s = rename_defs(discriminator_first(s), name.split("_")[1].capitalize())
        d = descs[name]
        if short_desc:
            d = {"voyager_worktree": "List, create, open or remove Git worktrees of a voyage.",
                 "voyager_workspace": descs["voyager_workspace"],
                 "voyager_process": "List, read, send text to, interrupt or stop terminal programs.",
                 "voyager_content": "Describe, inspect and update Notes content."}[name]
        out.append({"type": "function", "function": {"name": name, "description": d, "parameters": s}})
    return out

def run(tools, task, think, budget):
    label, prompt, grade = task
    base = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]
    r1 = chat(base, tools=tools, think=think, max_tokens=budget)
    hist = base + [
        {"role": "assistant", "content": "", "tool_calls": [{"id": "call_inspect", "type": "function",
            "function": {"name": "voyager_workspace", "arguments": json.dumps({"action": {"operation": "inspect"}, "expectedVersion": "0"})}}]},
        {"role": "tool", "tool_call_id": "call_inspect", "content": RESPONSE_TEXT}]
    r2 = chat(hist, tools=tools, think=think, max_tokens=budget)
    def verdict(r, first):
        if "error" in r: return "ERROR " + r["error"][:60]
        if not r.get("calls"): return f"no-call({r.get('finish')})"
        name = r["calls"][0][0]; a = act(r.get("args")); v = (r.get("args") or {}).get("expectedVersion")
        if name != "voyager_workspace": return "wrong-tool:" + name
        if first and a.get("operation") == "inspect": return "inspect"
        if grade(a): return "ok" if v == VERSION else f"ok-but-version={v}"
        return "wrong:" + str(a.get("operation"))
    return label, verdict(r1, True), r1.get("tokens", 0), verdict(r2, False), r2.get("tokens", 0)

if __name__ == "__main__":
    for name, short, think, budget in [("real descriptions, thinking on", False, True, 2500),
                                       ("one-line descriptions for the other three tools, thinking on", True, True, 2500)]:
        tools = tools_for(short)
        with ThreadPoolExecutor(4) as pool:
            rows = list(pool.map(lambda t: run(tools, t, think, budget), TASKS))
        ok1 = sum(s1 in ("inspect",) for _, s1, _, _, _ in rows); ok2 = sum(s2 == "ok" for _, _, _, s2, _ in rows)
        med = lambda xs: sorted(xs)[len(xs) // 2]
        print(f"\n=== four tools, {name}: first call inspect {ok1}/10 | effect call right {ok2}/10 | median tokens {med([r[2] for r in rows])}/{med([r[4] for r in rows])}")
        for label, s1, t1, s2, t2 in rows:
            print(f"    {label:17s} step1={s1:28s} ({t1:4d} tok) step2={s2:28s} ({t2:4d} tok)")

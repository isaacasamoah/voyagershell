"""Clean speed numbers: one request at a time (no parallel load), warm prompt cache."""
import json
from retest_lfm import chat, tool
from retest_world import TASKS, RESPONSE_TEXT
from retest_t2_eval import CONFIGS, SYSTEM
import retest_t3_context as ctx

schema, desc, _, sampling = CONFIGS["F4 = F2, recommended sampling"]
tools = [tool(schema, desc)]
w1, w2, w3 = [], [], []
for label, prompt, grade in TASKS:
    base = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]
    r1 = chat(base, tools=tools, think=True, max_tokens=1500, **sampling)
    hist = base + [{"role": "assistant", "content": "", "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "voyager_workspace",
            "arguments": json.dumps({"action": {"operation": "inspect"}, "expectedVersion": "0"})}}]}, {"role": "tool", "tool_call_id": "c1", "content": RESPONSE_TEXT}]
    r2 = chat(hist, tools=tools, think=True, max_tokens=1500, **sampling)
    r3 = chat([{"role": "system", "content": ctx.SYSTEM}, {"role": "user", "content": prompt}], tools=ctx.TOOLS, think=False, max_tokens=400)
    w1.append(r1["wall_ms"]); w2.append(r2["wall_ms"]); w3.append(r3["wall_ms"])
    print(f"{label:17s} thinking on: first call {r1['wall_ms']:5d} ms ({r1['tokens']:4d} tok)  effect call {r2['wall_ms']:5d} ms ({r2['tokens']:4d} tok)   | thinking off one-shot {r3['wall_ms']:4d} ms ({r3['tokens']} tok)")
s = lambda xs: f"median {sorted(xs)[len(xs)//2]} ms, worst {max(xs)} ms"
print("\nthinking on, first call :", s(w1)); print("thinking on, effect call:", s(w2))
print("thinking on, both steps :", s([a + b for a, b in zip(w1, w2)])); print("thinking off, one call   :", s(w3))

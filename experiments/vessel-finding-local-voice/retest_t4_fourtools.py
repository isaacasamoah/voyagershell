"""All four real tools loaded together, with their real descriptions. Looks for cross-tool contamination
(three of them define a different `definitions.Action`)."""
import json, re, sys, copy
from retest_lfm import load_schema, strip_meta, chat, EXP
from retest_t2_eval import discriminator_first
from retest_world import FOCUS

src = open(f"{EXP}/app/src/administrator.rs").read()
descs = dict(re.findall(r'name: "(voyager_\w+)",\s*description: "((?:[^"\\]|\\.)*)"', src))
FILES = {"voyager_worktree": "worktreeTool", "voyager_workspace": "workspaceTool", "voyager_process": "processTool", "voyager_content": "contentTool"}

def ops(schema):
    out = set()
    for d in schema.get("definitions", {}).values():
        for v in d.get("oneOf", []):
            c = v.get("properties", {}).get("operation", {}).get("const")
            if c: out.add(c)
    return out

def rename_defs(schema, prefix):
    """Give every definition a tool-unique name (content unchanged)."""
    text = json.dumps(schema)
    for k in schema.get("definitions", {}):
        text = text.replace(f'"#/definitions/{k}"', f'"#/definitions/{prefix}{k}"')
    s = json.loads(text)
    s["definitions"] = {prefix + k: v for k, v in s.get("definitions", {}).items()}
    return s

def build(unique):
    tools, opsets = [], {}
    for name, f in FILES.items():
        s = discriminator_first(strip_meta(load_schema(f)))
        opsets[name] = ops(s)
        if unique: s = rename_defs(s, name.split("_")[1].capitalize())
        tools.append({"type": "function", "function": {"name": name, "description": descs[name], "parameters": s}})
    return tools, opsets

SYSTEM = ("You are Voyager, the human's concise private workspace administrator. Keep replies brief and factual.\n"
          "voyager.focus: " + json.dumps(FOCUS))
CASES = [
    ("workspace", "voyager_workspace", "Create a new voyage called Research at /home/isaac/research."),
    ("workspace", "voyager_workspace", "Collapse the sidebar for me."),
    ("worktree",  "voyager_worktree",  "List the git worktrees registered for voyage-11. The workspace version is 41."),
    ("content",   "voyager_content",   "Describe the Notes content type. The workspace version is 41."),
    ("process",   "voyager_process",   "List the running terminal processes. The workspace version is 41."),
]
for unique in (False, True):
    tools, opsets = build(unique)
    print(f"\n=== four tools together, definition names {'made unique per tool' if unique else 'as generated (three tools share the name Action)'}")
    for kind, want_tool, prompt in CASES:
        r = chat([{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}], tools=tools, think=True, max_tokens=1500)
        if "error" in r: print("   ERROR", r["error"][:300]); continue
        if not r["calls"]: print(f"   {kind:9s} no call ({r['finish']}, {r['tokens']} tok) {r['content'][:80]!r}"); continue
        name, args = r["calls"][0]
        try: op = (json.loads(args).get("action") or {}).get("operation")
        except Exception: op = "<unparsed>"
        owner = [t for t, o in opsets.items() if op in o]
        verdict = "OK" if op in opsets.get(name, set()) else f"CONTAMINATED: '{op}' belongs to {owner}"
        print(f"   {kind:9s} prompt_tokens={r['prompt_tokens']} tok={r['tokens']:4d} called {name} -> {args[:150]}  [{verdict}]")

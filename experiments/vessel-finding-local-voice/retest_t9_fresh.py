"""Fresh, differently worded requests (never used while designing the setup), including requests that should NOT act."""
import json
from concurrent.futures import ThreadPoolExecutor
from retest_lfm import chat
from retest_world import act, has, VERSION
import retest_t3_context as ctx
from retest_t8_enums import TOOLS

def no_effect(a, r):  # acceptable: no tool call, or only an inspect
    return (not r.get("calls")) or a.get("operation") == "inspect"

FRESH = [
    ("close voyage",        "Can you close Research Notes?",                      lambda a, r: has(a, operation="close-voyage", id="voyage-20")),
    ("go to voyage",        "Go to the Scout Dashboard voyage.",                  lambda a, r: has(a, operation="select-voyage", id="voyage-2")),
    ("open tab",            "Open the Deploys tab.",                              lambda a, r: has(a, operation="select-fleet", id="fleet-7")),
    ("rename voyage",       "Rename the Scout Dashboard voyage to Scout.",        lambda a, r: has(a, operation="rename", name="Scout") and a.get("target") == {"kind": "voyage", "id": "voyage-2"}),
    ("maximise notes",      "Maximise the Notes panel here.",                     lambda a, r: has(a, operation="set-panel-maximized", id="placement-16", maximized=True)),
    ("hide claude",         "Hide Claude for a moment.",                          lambda a, r: has(a, operation="set-panel-hidden", id="placement-14", hidden=True)),
    ("expand sidebar",      "Expand the sidebar again.",                          lambda a, r: has(a, operation="set-sidebar", collapsed=False)),
    ("new fleet",           "Make a fleet named Scratch in Voyager Shell.",       lambda a, r: has(a, operation="create-fleet", voyage="voyage-11", name="Scratch")),
    ("dock panel",          "Dock on the Codex panel.",                           lambda a, r: has(a, operation="dock") and a.get("context") == {"kind": "vessel", "id": "placement-9"}),
    ("new voyage",          "Start a voyage named Blog in /home/isaac/blog.",     lambda a, r: has(a, operation="create-voyage", name="Blog", cwd="/home/isaac/blog")),
    ("TRICK no such voyage", "Close the Billing voyage.",                         no_effect),
    ("TRICK question only", "Which voyages are open right now?",                  no_effect),
    ("TRICK small talk",    "Thanks, that's all for now.",                        lambda a, r: not r.get("calls")),
    ("TRICK no such panel", "Hide the Browser panel.",                            no_effect),
]

def run(task, think):
    label, prompt, grade = task
    r = chat([{"role": "system", "content": ctx.SYSTEM}, {"role": "user", "content": prompt}], tools=TOOLS, think=think, max_tokens=1500 if think else 400)
    if "error" in r: return label, "ERROR " + r["error"][:80], 0
    a = act(r.get("args"))
    shown = json.dumps(a)[:95] if r.get("calls") else "(no tool call) " + r.get("content", "")[:80].replace("\n", " ")
    return label, ("ok   " if grade(a, r) else "WRONG") + " " + shown, r.get("tokens", 0)

import sys
think = sys.argv[1:] == ["think"]
with ThreadPoolExecutor(4) as pool:
    rows = list(pool.map(lambda t: run(t, think), FRESH))
acts = rows[:10]; tricks = rows[10:]
print(f"real actions right: {sum(s.startswith('ok') for _, s, _ in acts)}/10 | trick requests handled safely: {sum(s.startswith('ok') for _, s, _ in tricks)}/4 | median {sorted(t for _, _, t in rows)[7]} tokens")
for label, s, t in rows: print(f"    {label:21s} {s:105s} {t:4d} tok")

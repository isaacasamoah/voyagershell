"""Does an acting agent pick the right Vessel and make the right call through Voyager's tool?

usage: act_test.py <claude|codex> [--model NAME] [--no-panels] [--only LABEL,...]

Each request is one cold agent turn against workspace_stub.py. The grade looks only at the calls the stand-in recorded.
"""
import sys
from concurrent.futures import ThreadPoolExecutor

import agents, world

arguments = sys.argv[1:]
agent = arguments[0]
model = arguments[arguments.index("--model") + 1] if "--model" in arguments else None
panels = "--no-panels" not in arguments
only = arguments[arguments.index("--only") + 1].split(",") if "--only" in arguments else None
tasks = [task for task in world.TASKS if not only or task[0] in only]


def run(task):
    label, request, grade = task
    keyword = {"model": model} if model else {}
    outcome = agents.TURNS[agent](request, world.FOCUS, panels=panels, **keyword)
    effects = [entry["action"] for entry in outcome["calls"] if entry["action"].get("operation") != "inspect"]
    if grade is None:
        right = not effects
    else:
        right = len(effects) >= 1 and grade(effects[0]) and all(entry["status"] == "applied" for entry in outcome["calls"])
    return label, right, effects, outcome


with ThreadPoolExecutor(3) as pool:
    rows = list(pool.map(run, tasks))

real = [row for row in rows if dict((task[0], task[2]) for task in world.TASKS)[row[0]] is not None]
trick = [row for row in rows if row not in real]
seconds = sorted(row[3]["seconds"] for row in rows)
effect = sorted(row[3]["first_effect_seconds"] for row in rows if row[3]["first_effect_seconds"])
print(f"[{agent} {model or 'default model'}, panels {'on' if panels else 'off'}] real actions right: {sum(row[1] for row in real)}/{len(real)} | "
      f"requests with no valid target left alone: {sum(row[1] for row in trick)}/{len(trick)} | "
      f"request to effect: median {effect[len(effect) // 2]:.1f} s | whole turn: median {seconds[len(seconds) // 2]:.1f} s, worst {seconds[-1]:.1f} s | "
      f"tool calls per request: {sum(len(row[3]['calls']) for row in rows) / len(rows):.1f}")
for label, right, effects, outcome in rows:
    shown = "; ".join(str(effect) for effect in effects)[:110] or "(no effect)"
    print(f"   {'ok   ' if right else 'WRONG'} {label:17s} {shown}")
    print(f"         said: {(outcome['answer'] or outcome.get('error') or '')[:150]!r}")

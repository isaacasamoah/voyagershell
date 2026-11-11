"""How long does a request take once the acting agent is already running?

usage: speed_test.py [model]
"""
import sys, time

import agents, world

REQUESTS = ["Collapse the sidebar.", "Switch to the Deploys fleet.", "Close the Billing voyage.",
            "Switch to the Research Notes voyage.", "Expand the sidebar again.", "Go back to the Voyager Shell voyage."]
model = sys.argv[1] if len(sys.argv) > 1 else "claude-haiku-5-5"
started = time.time()
session = agents.ClaudeSession(model=model)
rows = []
for request in REQUESTS:
    focus = dict(world.FOCUS, revision=str(41 + sum(1 for row in rows for call in row["calls"] if call["status"] == "applied" and call["action"].get("operation") != "inspect")))
    outcome = session.turn(request, focus)
    outcome["request"] = request
    rows.append(outcome)
session.close()
print(f"[{model}] kept-alive session, first request includes start-up")
for index, row in enumerate(rows):
    effect = f"{row['first_effect_seconds']:.1f} s" if row["first_effect_seconds"] else "none"
    first = f"{row['first_call_seconds']:.1f} s" if row["first_call_seconds"] else "none"
    print(f"   {index + 1}. {row['request']:38s} first tool call {first:7s} effect {effect:7s} answer {row['seconds']:.1f} s  calls {len(row['calls'])}  said: {row['answer'][:70]!r}")
warm = [row for row in rows[1:] if row["first_effect_seconds"]]
times = sorted(row["first_effect_seconds"] for row in warm)
answers = sorted(row["seconds"] for row in rows[1:])
print(f"   after start-up: request to effect median {times[len(times) // 2]:.1f} s (n={len(times)}), request to spoken-ready answer median {answers[len(answers) // 2]:.1f} s")

"""Typed version: does Omni hand workspace requests off, keep the words, and report the real outcome?"""
import json, sys
from retest_lfm import chat
from voice_handoff import HANDOFF_TOOL, INSTRUCTIONS, REQUESTS, OUTCOMES, grade_handoff

SPOKEN_SYSTEM = "Respond with interleaved text and audio."   # the system prompt Liquid requires for spoken replies
mode = sys.argv[1] if len(sys.argv) > 1 else "system"


def messages(prompt):
    if mode == "system":   # instructions in the system prompt (text replies)
        return [{"role": "system", "content": INSTRUCTIONS}, {"role": "user", "content": prompt}]
    # voice layout: fixed system prompt, instructions carried in the first user turn
    return [{"role": "system", "content": SPOKEN_SYSTEM},
            {"role": "user", "content": INSTRUCTIONS + "\n\nThe human says: " + prompt}]


rows = []
for label, prompt, want, keep in REQUESTS:
    r = chat(messages(prompt), tools=[HANDOFF_TOOL], think=True, max_tokens=300)
    if "error" in r:
        rows.append((label, want, False, "ERROR " + r["error"][:120], 0, 0)); continue
    ok, shown = grade_handoff(r, want, keep)
    rows.append((label, want, ok, shown, r["gen_ms"], r["tokens"]))

work = [x for x in rows if x[1]]; talk = [x for x in rows if not x[1]]
ms = sorted(x[4] for x in rows)
print(f"[{mode}] workspace requests handed off intact: {sum(x[2] for x in work)}/{len(work)} | "
      f"small talk answered without hand-off: {sum(x[2] for x in talk)}/{len(talk)} | "
      f"model time median {ms[len(ms)//2]} ms, worst {ms[-1]} ms")
for label, want, ok, shown, t, tok in rows:
    print(f"   {'ok   ' if ok else 'WRONG'} {label:17s} {shown}")

print("\n-- reporting the backing agent's answer --")
for prompt, outcome, must_admit in OUTCOMES:
    hist = messages(prompt) + [
        {"role": "assistant", "content": "", "tool_calls": [{"id": "call_1", "type": "function",
            "function": {"name": "ask_administrator", "arguments": json.dumps({"request": prompt})}}]},
        {"role": "tool", "tool_call_id": "call_1", "content": outcome}]
    r = chat(hist, tools=[HANDOFF_TOOL], think=True, max_tokens=300)
    said = "ERROR " + r["error"][:100] if "error" in r else (r.get("content") or "").replace("\n", " ")
    if r.get("calls"): said = "CALLED AGAIN " + r["calls"][0][1][:80]
    print(f"   agent: {outcome[:70]:70s}\n   omni : {said[:160]}\n")

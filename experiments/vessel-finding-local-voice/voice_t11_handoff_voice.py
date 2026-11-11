"""Spoken version: the request arrives as audio. Does Omni still hand it off with the words intact?

usage: t11_handoff_voice.py <audio dir> [asr]
"""
import base64, os, sys
from retest_lfm import chat
from voice_handoff import HANDOFF_TOOL, INSTRUCTIONS, REQUESTS, grade_handoff

adir = sys.argv[1]
show_asr = "asr" in sys.argv[2:]


def audio_part(i):
    data = base64.b64encode(open(os.path.join(adir, f"{i:02d}.wav"), "rb").read()).decode()
    return {"type": "input_audio", "input_audio": {"data": data, "format": "wav"}}


rows = []
for i, (label, prompt, want, keep) in enumerate(REQUESTS):
    part = audio_part(i)
    r = chat([{"role": "system", "content": INSTRUCTIONS}, {"role": "user", "content": [part]}],
             tools=[HANDOFF_TOOL], think=True, max_tokens=300)
    if "error" in r:
        rows.append((label, want, False, "ERROR " + r["error"][:160], 0, "")); continue
    ok, shown = grade_handoff(r, want, keep)
    heard = ""
    if show_asr and not ok:
        a = chat([{"role": "system", "content": "Perform ASR in English."}, {"role": "user", "content": [part]}], think=True, max_tokens=200)
        heard = "   [heard: " + (a.get("content") or a.get("error", ""))[:90] + "]"
    rows.append((label, want, ok, shown, r["wall_ms"], heard))

work = [x for x in rows if x[1]]; talk = [x for x in rows if not x[1]]
ms = sorted(x[4] for x in rows)
print(f"[{os.path.basename(adir.rstrip('/'))}] spoken workspace requests handed off intact: {sum(x[2] for x in work)}/{len(work)} | "
      f"small talk answered without hand-off: {sum(x[2] for x in talk)}/{len(talk)} | "
      f"request-to-decision median {ms[len(ms)//2]} ms, worst {ms[-1]} ms")
for label, want, ok, shown, t, heard in rows:
    print(f"   {'ok   ' if ok else 'WRONG'} {label:17s} {shown}{heard}")

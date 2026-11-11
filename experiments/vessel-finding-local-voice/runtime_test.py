"""How fast does one Omni runtime hear and speak? No acting agent is called.

usage: OMNI_PORT=8112 runtime_test.py <label> <request.wav>...

For each clip it times Omni's hand-off decision, then speaks one fixed answer and times the first sound and the whole
generation against the length of the speech. A real-time factor under 1 means speech is made faster than it plays.
"""
import os, sys, time

from voice_loop import decide, speak

ANSWER = "The top right vessel, voyagershell 2, is now full screen."

label, clips = sys.argv[1], sys.argv[2:]
for clip in clips:
    started = time.time()
    kind, text = decide(open(clip, "rb").read())
    decided = time.time() - started
    started = time.time()
    pcm, first = speak(ANSWER)
    total = time.time() - started
    seconds = len(pcm) / 48000
    print(f"[{label}] {os.path.basename(clip)}: {kind} after {decided:.2f} s ({text[:50]!r}) | first sound {first or 0} ms | "
          f"{seconds:.1f} s of speech made in {total:.1f} s, real-time factor {total / seconds if seconds else float('nan'):.2f}")

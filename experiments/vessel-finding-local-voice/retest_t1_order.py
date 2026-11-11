from retest_lfm import *
base = strip_meta(load_schema())
A = tool(base)                    # as the earlier session ran it: alphabetical property order
B = tool(operation_first(base))   # identical content, `operation` listed first
P = "Create a new voyage called Research at /home/isaac/research."
for label, t in (("A alphabetical (as generated)", A), ("B operation-first", B)):
    for think in (True, False):
        r = ask(P, [t], think=think, max_tokens=1800)
        print(f"{label:30s} think={think!s:5s} finish={r['finish']:10s} tok={r['tokens']:4d} gen={r['gen_ms']:5d}ms -> {r['calls']}")

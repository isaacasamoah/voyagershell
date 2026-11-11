"""Re-check two claims from the earlier session on more than one prompt:
(a) stripping $schema/title halves the model's thinking, (b) trimming to 13 operations makes it think longer.
Measured on the first call only (that is all the earlier session measured), same ten requests, temperature 0."""
import json
from concurrent.futures import ThreadPoolExecutor
from retest_lfm import load_schema, strip_meta, tool, chat, ORIGINAL_DESC, EXP
from retest_world import TASKS
from retest_t2_eval import SYSTEM

raw = load_schema()
core = json.load(open(f"{EXP}/experiments/lfm3-avatar/workspace_core.json"))
VARIANTS = {"full schema as generated (with $schema/title)": raw, "full schema, $schema/title stripped": strip_meta(raw), "trimmed to 13 operations": core}
rows = {}
for name, schema in VARIANTS.items():
    t = [tool(schema, ORIGINAL_DESC)]
    with ThreadPoolExecutor(4) as pool:
        rs = list(pool.map(lambda task: chat([{"role": "system", "content": SYSTEM}, {"role": "user", "content": task[1]}], tools=t, think=True, max_tokens=1500), TASKS))
    rows[name] = rs
print(f"{'request':18s}" + "".join(f"{n[:34]:>38s}" for n in VARIANTS))
for i, task in enumerate(TASKS):
    print(f"{task[0]:18s}" + "".join(f"{(str(rows[n][i]['tokens']) + ' ' + str(rows[n][i].get('op') or rows[n][i]['finish'])):>38s}" for n in VARIANTS))
med = lambda xs: sorted(xs)[len(xs)//2]
print(f"{'MEDIAN tokens':18s}" + "".join(f"{med([r['tokens'] for r in rows[n]]):>38d}" for n in VARIANTS))
print(f"{'MEAN tokens':18s}" + "".join(f"{sum(r['tokens'] for r in rows[n])//10:>38d}" for n in VARIANTS))

import json, math, os, sys, http.client
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run7
from run7 import *

KEY = sys.argv[1]

def probe(text):
    system = PROMPTS[KEY]
    body = {"model": "omni", "temperature": 0, "max_tokens": 80, "logprobs": True, "top_logprobs": 8,
            "response_format": {"type": "json_schema", "json_schema": {"name": "r", "strict": True, "schema": SCHEMA_KIND}},
            "messages": [{"role": "system", "content": system}] + shots(system) + [{"role": "user", "content": text}]}
    c = http.client.HTTPConnection(HOST, PORT, timeout=120)
    c.request("POST", "/v1/chat/completions", json.dumps(body), {"content-type": "application/json"})
    o = json.load(c.getresponse()); c.close()
    toks = o["choices"][0]["logprobs"]["content"]
    for t in toks:
        if t["token"].strip().lower() in ("chat", "work"):
            p = {}
            for x in t["top_logprobs"]:
                k = x["token"].strip().lower()
                if k in ("chat", "work"): p[k] = p.get(k, 0) + math.exp(x["logprob"])
            pc, pw = p.get("chat", 0), p.get("work", 0)
            return pc / (pc + pw) if pc + pw else None
    return None

rows = []
for name, items, held in [("tune", [(i, ITEMS[i]) for i in range(len(ITEMS)) if i not in HELD_OUT], None), ("held", [(i, ITEMS[i]) for i in HELD_OUT], None), ("fresh", list(enumerate(FRESH)), None)] + ([("fresh2", list(enumerate(__import__("requests7").FRESH2)), None)] if hasattr(__import__("requests7"), "FRESH2") else []):
    for i, (text, label, need) in items:
        rows.append({"set": name, "text": text, "label": label, "need": need, "p_chat": probe(text)})
json.dump(rows, open(f"/var/tmp/voyager-crew/scratch/voice/round7-conf-{KEY}.json", "w"), indent=1)
for th in (0.5, 0.9, 0.99, 0.999):
    out = []
    for name in ("tune", "held", "fresh", "fresh2"):
        sub = [r for r in rows if r["set"] == name]
        if not sub: continue
        handoff = lambda r: not (r["p_chat"] >= th)
        out.append(f"{name} {sum(handoff(r) == r['need'] for r in sub)}/{len(sub)} kept {sum(r['need'] and not handoff(r) for r in sub)}")
    print(th, " | ".join(out))

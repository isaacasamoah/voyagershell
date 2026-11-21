import http.client, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run7
from run7 import ITEMS, HELD_OUT, speech, summary, RESULT_CLAIM, HOST, PORT

CLASSIFY = """You decide whether what the user said is pure chat or work for Voyager, their workspace assistant. Answer with one word.
chat: greetings, "how are you", thanks, goodbyes, "okay", "are you there", "can you hear me", compliments, who you are, how to talk to you, help.
work: every command (open, go, show, move, rename, hide, start, stop, create, cancel, never mind), every question about the workspace, the build, the crew or progress, and every vague "how is it going", "what are you doing" or "any news"."""
SAY = {
    "chat": "You are Voyager's voice, a friendly assistant. Voyager does the workspace work; you only chat. Reply in one short friendly sentence. If asked what you can do, say you pass workspace requests to Voyager. Never mention fleets, vessels or builds.",
    "work": "You are Voyager's voice. The user made a request or asked a question about their workspace. Voyager will handle it. Reply with one short natural acknowledgement in your own words that repeats the topic, for example \"Sure, opening the Billing fleet.\" or \"Let me check on the tests.\" Never answer the question, never say anything is done, never state a fact, never say you cannot.",
}
PROMPT_TEXT = {"classify": CLASSIFY, **SAY}


def chat(system, text, schema=None, max_tokens=60):
    body = {"model": "omni", "temperature": 0, "max_tokens": max_tokens, "messages": [{"role": "system", "content": system}, {"role": "user", "content": text}]}
    if schema: body["response_format"] = {"type": "json_schema", "json_schema": {"name": "r", "strict": True, "schema": schema}}
    c = http.client.HTTPConnection(HOST, PORT, timeout=120); t0 = time.perf_counter()
    c.request("POST", "/v1/chat/completions", json.dumps(body), {"content-type": "application/json"})
    out = json.load(c.getresponse()); c.close()
    return out["choices"][0]["message"]["content"].strip(), time.perf_counter() - t0


def ask(text):
    kind_raw, t1 = chat(CLASSIFY, text, {"type": "object", "properties": {"kind": {"type": "string", "enum": ["chat", "work"]}}, "required": ["kind"], "additionalProperties": False}, 12)
    kind = json.loads(kind_raw)["kind"]
    say, t2 = chat(SAY[kind], text)
    return {"handoff": kind == "work", "say": say.strip('"')}, t1, t2


def run(which):
    idx = HELD_OUT if which == "held" else [i for i in range(len(ITEMS)) if i not in HELD_OUT] if which == "tune" else list(range(len(ITEMS)))
    rows = []
    for i in idx:
        text, label, need = ITEMS[i]
        j, t1, t2 = ask(text)
        r = {"i": i, "text": text, "label": label, "need_handoff": need, "raw": json.dumps(j), "parsed": True, "handoff": j["handoff"], "say": j["say"], "classify_s": t1, "say_s": t2, "call_total": t1 + t2, "say_closed": t1 + t2}
        r["right"] = j["handoff"] == need; r["kept_workspace"] = need and not j["handoff"]
        r["claims_result"] = bool(RESULT_CLAIM.search(j["say"])) if j["handoff"] else False
        st, wav, tt = speech(j["say"], "female", True)
        r["tts_first_audio"] = tt["first_audio"]; r["tts_first_100ms"] = tt["first_100ms"]; r["to_first_sound"] = r["call_total"] + tt["first_100ms"]
        rows.append(r)
    return rows


if __name__ == "__main__":
    which = sys.argv[1]; rows = run(which); s = summary(rows)
    for r in rows:
        if not r["right"] or r["claims_result"]: print("MISS" if not r["right"] else "CLAIM?", r["label"], "|", r["text"], "->", r["raw"][:150])
    print(json.dumps(s))
    json.dump({"prompts": PROMPT_TEXT, "summary": s, "rows": rows}, open(f"/var/tmp/voyager-crew/scratch/voice/round7-two-call-{which}.json", "w"), indent=1)

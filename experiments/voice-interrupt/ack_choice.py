import http.client, json, os, re, sys, time
sys.path.insert(0, "/var/tmp/voyager-crew/scratch/voice-interrupt")
from requests7 import ITEMS, FRESH, FRESH2

HOST, PORT = "127.0.0.1", int(os.environ.get("OMNI_PORT", "8131"))
APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "app", "src")
TALK = open(os.path.join(APP, "spoken_talk.md")).read()
GATE = 0.99
RESULT_CLAIM = re.compile(r"\b(done|opened|moved|maximi[sz]ed|renamed|hidden|docked|restored|started|stopped|closed|created|it'?s green|all clear|nothing is|no issues|is blocked|are blocked|passed|failed|found|i'?ve|i have|already)\b", re.I)
PROMISE = re.compile(r"\b(i'?ll|i will|let me (open|move|rename|hide|close|stop|start|make|switch|dock|maximi[sz]e|restore|cancel))\b", re.I)

RULE_TODAY = """You are the voice in front of Voyager. Voyager is the person's workspace assistant. It does every action and knows every fact about their work. You only make small talk. Answer in JSON.
kind "chat": pure small talk that needs nothing from the workspace, such as hello, how are you, thanks, goodbye, okay, can you hear me, are you there, who are you, or a compliment. Put a short friendly reply in "say", in the style of the guide below. Never offer, promise or describe an action, and never state a fact about their work.
kind "work": everything else. That is any command, any question about the workspace, the build, the crew or progress, any vague "how's it going" or "anything new", asking for help or what you can do, and never mind or cancel. Voyager answers these, so give only the kind.
When you are not sure, it is work."""
CLOSING = "For a chat reply, this rule comes before the guide above: never offer to do anything, never ask whether to do something, and never say what you or Voyager will do. Answer the small talk and stop."

RULE_CHOICE = RULE_TODAY.replace(
    'Voyager answers these, so give only the kind.',
    'Voyager answers these. Put in "say" what a person would say back before an assistant answers, or nothing. '
    'A plain command whose effect they will see, such as open, dock, maximize, move, rename or hide, needs nothing: say "". '
    'A question, a lookup, a summary or a message for the crew that will take a moment gets a short natural acknowledgement of two to six words in your own words, '
    'such as "Let me check." or "One sec, looking." Vary it. Never state a result, never say it is done, and never say what you will do to the workspace.')
CLOSING_CHOICE = CLOSING + " For work, the acknowledgement follows the same rule: no result, no promise of an action."

EXAMPLES_TODAY = [
    ("Hi, how are you doing today?", "I'm good, thanks. You?"), ("Open the Billing fleet.", None), ("Okay, thanks, that's all.", "Anytime."),
    ("Are the tests passing?", None), ("Can you hear me okay?", "Yes, loud and clear."), ("Could you help me with something?", None),
    ("Who's this?", "I'm Voyager's voice."), ("What else can you do?", None), ("Good evening.", "Evening!"), ("Forget about it.", None),
    ("Nice one.", "Thanks!"), ("How's it going with the crew?", None), ("Cancel the last one.", None), ("Bye for now.", "Bye, talk soon."),
]
WORK_SAY = {"Open the Billing fleet.": "", "Are the tests passing?": "Let me check.", "Could you help me with something?": "Sure.",
            "What else can you do?": "", "Forget about it.": "", "How's it going with the crew?": "One sec, checking in.", "Cancel the last one.": ""}


def schema(choice):
    work = {"type": "object", "properties": {"kind": {"enum": ["work"]}}, "required": ["kind"], "additionalProperties": False}
    if choice:
        work = {"type": "object", "properties": {"kind": {"enum": ["work"]}, "say": {"type": "string"}}, "required": ["kind", "say"], "additionalProperties": False}
    chat = {"type": "object", "properties": {"kind": {"enum": ["chat"]}, "say": {"type": "string"}}, "required": ["kind", "say"], "additionalProperties": False}
    return {"anyOf": [work, chat]}


def messages(text, choice):
    rule, closing = (RULE_CHOICE, CLOSING_CHOICE) if choice else (RULE_TODAY, CLOSING)
    m = [{"role": "system", "content": f"{rule}\n\n{TALK}\n\n{closing}"}]
    for said, say in EXAMPLES_TODAY:
        m.append({"role": "user", "content": said})
        if say is not None:
            ans = {"kind": "chat", "say": say}
        else:
            ans = {"kind": "work", "say": WORK_SAY[said]} if choice else {"kind": "work"}
        m.append({"role": "assistant", "content": json.dumps(ans)})
    m.append({"role": "user", "content": text})
    return m


def chat_probability(answer):
    tokens = answer["choices"][0].get("logprobs", {}).get("content") or []
    for t in tokens:
        if t["token"].strip().strip('"') in ("chat", "work"):
            c = w = 0.0
            for o in t["top_logprobs"]:
                k = o["token"].strip().strip('"')
                if k == "chat": c += 2.718281828 ** o["logprob"]
                if k == "work": w += 2.718281828 ** o["logprob"]
            return c / (c + w) if c + w else None
    return None


def route(text, choice):
    body = {"temperature": 0, "max_tokens": 60, "logprobs": True, "top_logprobs": 8,
            "response_format": {"type": "json_schema", "json_schema": {"name": "route", "strict": True, "schema": schema(choice)}},
            "messages": messages(text, choice)}
    c = http.client.HTTPConnection(HOST, PORT, timeout=120); t0 = time.perf_counter()
    c.request("POST", "/v1/chat/completions", json.dumps(body), {"content-type": "application/json"})
    out = json.load(c.getresponse()); c.close(); spent = time.perf_counter() - t0
    raw = out["choices"][0]["message"]["content"]
    j = json.loads(raw); p = chat_probability(out)
    kind = "chat" if j["kind"] == "chat" and p is not None and p >= GATE else "work"
    return {"raw": raw, "kind": kind, "say": j.get("say", ""), "model_kind": j["kind"], "chat_p": p, "seconds": spent}


def main():
    sets = [("round7", ITEMS), ("fresh1", FRESH), ("fresh2", FRESH2)]
    rows = []
    for choice in (False, True):
        for name, items in sets:
            for text, label, need in items:
                r = route(text, choice)
                say = r["say"] if r["kind"] == "work" else ""
                rows.append({"variant": "choice" if choice else "today", "set": name, "text": text, "label": label, "need_handoff": need, **r,
                             "right": (r["kind"] == "work") == need, "kept_workspace": need and r["kind"] != "work",
                             "ack": bool(say.strip()), "claims": bool(RESULT_CLAIM.search(say)), "promises": bool(PROMISE.search(say))})
    json.dump(rows, open(sys.argv[1], "w"), indent=1)
    for v in ("today", "choice"):
        g = [r for r in rows if r["variant"] == v]
        work = [r for r in g if r["kind"] == "work"]
        secs = sorted(r["seconds"] for r in g)
        print(v, "prompts", len(g), "right", sum(r["right"] for r in g), "kept_workspace", sum(r["kept_workspace"] for r in g),
              "work", len(work), "acks", sum(r["ack"] for r in work), "claims", sum(r["claims"] for r in work), "promises", sum(r["promises"] for r in work),
              "distinct_acks", len({r["say"].strip().lower() for r in work if r["ack"]}),
              "median_s", round(secs[len(secs) // 2], 3), "p90_s", round(secs[int(len(secs) * 0.9)], 3))


main()

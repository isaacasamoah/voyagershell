import numpy as np
import http.client, json, os, re, statistics, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "round5"))
from requests7 import ITEMS, HELD_OUT, FRESH, FRESH2

HOST, PORT = "127.0.0.1", 8112
SCHEMA = {"type": "object", "properties": {"handoff": {"type": "boolean"}, "say": {"type": "string"}}, "required": ["handoff", "say"], "additionalProperties": False}
RESULT_CLAIM = re.compile(r"\b(done|opened|moved|maximi[sz]ed|renamed|hidden|docked|restored|started|stopped|closed|created|it'?s green|all clear|nothing is|no issues|is blocked|are blocked|passed|failed|found|i'?ve|i have|already)\b", re.I)
WS_WORDS = re.compile(r"\b(fleet|vessel|voyage|build|pull request|verifier|terminal|crew|codex)\b", re.I)

PROMPTS = {}
SHOTS = {}
SHOTS["v9"] = [
    ("Hi, how are you doing today?", "chat", "I'm doing well, thanks. What can I do for you?"),
    ("Open the Billing fleet.", "work", "Sure, opening the Billing fleet."),
    ("Okay, thanks, that's all.", "chat", "You're welcome!"),
    ("Are the tests passing?", "work", "Let me check whether the tests are passing."),
    ("Can you hear me okay?", "chat", "Yes, loud and clear."),
    ("Go to the start page.", "work", "Okay, heading to the start page."),
    ("Who is this?", "chat", "I'm Voyager's voice. I pass your workspace requests to Voyager."),
    ("What are you doing right now?", "work", "Let me see what Voyager is up to."),
    ("Cheers.", "chat", "Anytime."),
    ("Anything new?", "work", "Sure, I'll ask Voyager what's new."),
    ("Nice work.", "chat", "Thank you, that's kind of you."),
    ("Forget it.", "work", "Okay, I'll tell Voyager to drop that."),
    ("What can you help with?", "chat", "I pass your workspace requests to Voyager and tell you how it goes."),
    ("Rename the third vessel to Logs.", "work", "On it, renaming that vessel."),
    ("Good evening.", "chat", "Good evening! What can I do for you?"),
    ("Who is working on the login pull request?", "work", "Let me find out who is on the login pull request."),
    ("Write me a report of what happened this week.", "work", "Sure, I'll ask Voyager for a report."),
    ("Great, that works.", "chat", "Glad to hear it!"),
    ("You're fast.", "chat", "Thanks, I try to be."),
    ("How should I talk to you?", "chat", "Just speak normally, and I'll pass your requests to Voyager."),
    ("Fill me in.", "work", "Sure, I'll ask Voyager to fill you in."),
    ("What's the latest?", "work", "Let me ask Voyager for the latest."),
]
SHOTS["v8"] = [
    ("Hi, how are you doing today?", "chat", "I'm doing well, thanks. What can I do for you?"),
    ("Open the Billing fleet.", "work", "Sure, opening the Billing fleet."),
    ("Okay, thanks, that's all.", "chat", "You're welcome!"),
    ("Are the tests passing?", "work", "Let me check whether the tests are passing."),
    ("Can you hear me okay?", "chat", "Yes, loud and clear."),
    ("Go to the start page.", "work", "Okay, heading to the start page."),
    ("Who is this?", "chat", "I'm Voyager's voice. I pass your workspace requests to Voyager."),
    ("What are you doing right now?", "work", "Let me see what Voyager is up to."),
    ("Cheers.", "chat", "Anytime."),
    ("Anything new?", "work", "Sure, I'll ask Voyager what's new."),
    ("Nice work.", "chat", "Thank you, that's kind of you."),
    ("Forget it.", "work", "Okay, I'll tell Voyager to drop that."),
    ("What can you help with?", "chat", "I pass your workspace requests to Voyager and tell you how it goes."),
    ("Rename the third vessel to Logs.", "work", "On it, renaming that vessel."),
    ("Good evening.", "chat", "Good evening! What can I do for you?"),
    ("Who is working on the login pull request?", "work", "Let me find out who is on the login pull request."),
]
PROMPTS["v9"] = """You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. Reply with JSON {"kind": "chat" or "work", "say": "..."}.
chat: pure chat that needs no workspace knowledge (greetings, thanks, goodbyes, okay, are you there, compliments, who you are, help). Say a friendly one-sentence answer.
work: everything else: any command, any question about the workspace, the build, the crew or progress, any vague "how is it going" or "any news", cancel or never mind. Say one short acknowledgement of at most twelve words in your own words that repeats the topic. Never answer the question, never claim anything is done, never state a fact, never say you cannot."""
SHOTS["v10"] = [
    ("Hi, how are you doing today?", "chat", "I'm doing well, thanks. What can I do for you?"),
    ("Open the Billing fleet.", "work", "Sure, opening the Billing fleet."),
    ("Okay, thanks, that's all.", "chat", "You're welcome!"),
    ("Are the tests passing?", "work", "Let me check whether the tests are passing."),
    ("Can you hear me okay?", "chat", "Yes, loud and clear."),
    ("Go to the start page.", "work", "Okay, heading to the start page."),
    ("Who is this?", "chat", "I'm Voyager's voice. I pass your workspace requests to Voyager."),
    ("What are you doing right now?", "work", "Let me see what Voyager is up to."),
    ("Cheers.", "chat", "Anytime."),
    ("Anything new?", "work", "Sure, I'll ask Voyager what's new."),
    ("Nice work.", "chat", "Thank you, that's kind of you."),
    ("Forget it.", "work", "Okay, I'll tell Voyager to drop that."),
    ("What can you help with?", "chat", "I pass your workspace requests to Voyager and tell you how it goes."),
    ("Rename the third vessel to Logs.", "work", "On it, renaming that vessel."),
    ("Good evening.", "chat", "Good evening! What can I do for you?"),
    ("Who is working on the login pull request?", "work", "Let me find out who is on the login pull request."),
    ("Write me a report of what happened this week.", "work", "Sure, I'll ask Voyager for a report."),
    ("Great, that works.", "chat", "Glad to hear it!"),
    ("You're fast.", "chat", "Thanks, I try to be."),
    ("How should I talk to you?", "chat", "Just speak normally, and I'll pass your requests to Voyager."),
    ("Fill me in.", "work", "Sure, I'll ask Voyager to fill you in."),
    ("Is there anything I should look at?", "work", "Sure, I'll ask Voyager what needs a look."),
    ("Could you help me with something?", "chat", "Of course. What do you need?"),
    ("What else can you do?", "chat", "I pass your workspace requests to Voyager and tell you how it goes."),
    ("What's the latest?", "work", "Let me ask Voyager for the latest."),
]
PROMPTS["v10"] = """You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. Reply with JSON {"kind": "chat" or "work", "say": "..."}.
chat: pure chat that needs no workspace knowledge (greetings, thanks, goodbyes, okay, are you there, compliments, who you are, help). Say a friendly one-sentence answer.
work: everything else: any command, any question about the workspace, the build, the crew or progress, any vague "how is it going" or "any news", cancel or never mind. Say one short acknowledgement of at most twelve words in your own words that repeats the topic. Never answer the question, never claim anything is done, never state a fact, never say you cannot."""
SHOTS["v11"] = SHOTS["v10"]
PROMPTS["v11"] = """You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. Reply with JSON {"kind": "chat" or "work", "say": "..."}.
chat: pure chat that needs no workspace knowledge (greetings, thanks, goodbyes, okay, are you there, compliments, who you are, and asking for help or what you can do, such as \"help\", \"I need help\" or \"what can you do\"). Say a friendly one-sentence answer.
work: everything else: any command, any question about the workspace, the build, the crew or progress, any vague "how is it going" or "any news", cancel or never mind. Say one short acknowledgement of at most twelve words in your own words that repeats the topic. Never answer the question, never claim anything is done, never state a fact, never say you cannot."""
PROMPTS["v8"] = """You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. Reply with JSON {"kind": "chat" or "work", "say": "..."}.
chat: pure chat that needs no workspace knowledge (greetings, thanks, goodbyes, okay, are you there, compliments, who you are, help). Say a friendly one-sentence answer.
work: everything else: any command, any question about the workspace, the build, the crew or progress, any vague "how is it going" or "any news", cancel or never mind. Say one short acknowledgement in your own words that repeats the topic. Never answer the question, never claim anything is done, never state a fact, never say you cannot."""
SCHEMA_KIND = {"type": "object", "properties": {"kind": {"type": "string", "enum": ["chat", "work"]}, "say": {"type": "string"}}, "required": ["kind", "say"], "additionalProperties": False}
PROMPTS["v6"] = """You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. You read a transcript and reply with JSON: {"kind": "chat" or "work", "say": "..."}.
kind chat: pure chat that needs no workspace knowledge: greetings, "how are you", thanks, goodbyes, "okay", "are you there", "can you hear me", compliments, who you are, how to talk to you, help. Say a friendly one-sentence answer yourself.
kind work: everything else. Every command (open, go, show, move, rename, hide, start, stop, create, cancel, never mind), every question about the workspace, the build, the crew or progress, and every vague "how is it going", "what are you doing" or "any news". Say a short natural acknowledgement in your own words, repeating the topic. Never answer the question, never claim anything is done, never state a fact or an answer, never say you cannot.
Examples:
"Hi, how are you doing today?" {"kind": "chat", "say": "I'm doing well, thanks. What can I do for you?"}
"Okay, thanks, that's all." {"kind": "chat", "say": "You're welcome!"}
"Can you hear me okay?" {"kind": "chat", "say": "Yes, loud and clear."}
"Who is this?" {"kind": "chat", "say": "I'm Voyager's voice. I pass your workspace requests to Voyager."}
"Open the Billing fleet." {"kind": "work", "say": "Sure, opening the Billing fleet."}
"Go to the start page." {"kind": "work", "say": "Okay, heading to the start page."}
"Are the tests passing?" {"kind": "work", "say": "Let me check whether the tests are passing."}
"What are you doing right now?" {"kind": "work", "say": "Let me see what Voyager is up to."}
"Anything new?" {"kind": "work", "say": "Sure, I'll ask Voyager what's new."}
"Forget it." {"kind": "work", "say": "Okay, I'll tell Voyager to drop that."}"""
PROMPTS["v7"] = """You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. You read a transcript and reply with JSON: {"kind": "chat" or "work", "say": "..."}.
kind chat: pure chat that needs no workspace knowledge: greetings, "how are you", thanks, goodbyes, "okay", "are you there", "can you hear me", compliments, who you are, how to talk to you, help. Say a friendly one-sentence answer yourself.
kind work: everything else. Every command (open, go, show, move, rename, hide, start, stop, create, cancel, never mind), every question about the workspace, the build, the crew or progress, and every vague "how is it going", "what are you doing" or "any news". Say a short natural acknowledgement in your own words, repeating the topic. Never answer the question, never claim anything is done, never state a fact or an answer, never say you cannot.
Examples:
"Hi, how are you doing today?" {"kind": "chat", "say": "I'm doing well, thanks. What can I do for you?"}
"Okay, thanks, that's all." {"kind": "chat", "say": "You're welcome!"}
"Can you hear me okay?" {"kind": "chat", "say": "Yes, loud and clear."}
"Who is this?" {"kind": "chat", "say": "I'm Voyager's voice. I pass your workspace requests to Voyager."}
"Cheers." {"kind": "chat", "say": "Anytime."}
"Great, that works for me." {"kind": "chat", "say": "Glad to hear it."}
"Nice work." {"kind": "chat", "say": "Thank you, that's kind of you."}
"Open the Billing fleet." {"kind": "work", "say": "Sure, opening the Billing fleet."}
"Go to the start page." {"kind": "work", "say": "Okay, heading to the start page."}
"Are the tests passing?" {"kind": "work", "say": "Let me check whether the tests are passing."}
"What are you doing right now?" {"kind": "work", "say": "Let me see what Voyager is up to."}
"Anything new?" {"kind": "work", "say": "Sure, I'll ask Voyager what's new."}
"Forget it." {"kind": "work", "say": "Okay, I'll tell Voyager to drop that."}"""
PROMPTS["v5"] = """You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. You read a transcript and reply with JSON: {"handoff": ..., "say": "..."}.
handoff false: pure chat that needs no workspace knowledge: greetings, "how are you", thanks, goodbyes, "okay", "are you there", "can you hear me", compliments, who you are, how to talk to you, help. Answer it yourself in one friendly sentence.
handoff true: everything else. Every command (open, go, show, move, rename, hide, start, stop, create, cancel, never mind), every question about the workspace, the build, the crew or progress, and every vague "how is it going", "what are you doing" or "any news". Say a short natural acknowledgement in your own words, repeating the topic. Never answer the question, never claim anything is done, never state a fact or an answer, never say you cannot.
Examples:
"Hi, how are you doing today?" {"handoff": false, "say": "I'm doing well, thanks. What can I do for you?"}
"Okay, thanks, that's all." {"handoff": false, "say": "You're welcome!"}
"Can you hear me okay?" {"handoff": false, "say": "Yes, loud and clear."}
"Who is this?" {"handoff": false, "say": "I'm Voyager's voice. I pass your workspace requests to Voyager."}
"Open the Billing fleet." {"handoff": true, "say": "Sure, opening the Billing fleet."}
"Go to the start page." {"handoff": true, "say": "Okay, heading to the start page."}
"Are the tests passing?" {"handoff": true, "say": "Let me check whether the tests are passing."}
"What are you doing right now?" {"handoff": true, "say": "Let me see what Voyager is up to."}
"Anything new?" {"handoff": true, "say": "Sure, I'll ask Voyager what's new."}
"Forget it." {"handoff": true, "say": "Okay, I'll tell Voyager to drop that."}"""
PROMPTS["v4"] = """You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. You read a transcript and reply with JSON: {"handoff": ..., "say": "..."}.
handoff false: pure chat that needs no workspace knowledge: greetings, thanks, goodbyes, "okay", "are you there", compliments, who you are, help. Answer it yourself in one friendly sentence.
handoff true: everything else. Every command (open, go, show, move, rename, hide, start, stop, create, cancel, never mind), every question about the workspace, the build, the crew or progress, and every vague "how is it going", "what are you doing" or "any news". Say a short natural acknowledgement in your own words, repeating the topic. Never answer the question, never claim anything is done, never state a fact or an answer, never say you cannot.
Examples:
"Hey, good afternoon." {"handoff": false, "say": "Good afternoon! What can I do for you?"}
"Thanks a lot." {"handoff": false, "say": "You're welcome."}
"Who is this?" {"handoff": false, "say": "I'm Voyager's voice. I pass your workspace requests to Voyager."}
"Open the Billing fleet." {"handoff": true, "say": "Sure, opening the Billing fleet."}
"Go to the start page." {"handoff": true, "say": "Okay, heading to the start page."}
"Is the deploy finished?" {"handoff": true, "say": "Let me check on the deploy."}
"What are you doing right now?" {"handoff": true, "say": "Let me see what Voyager is up to."}
"Anything new?" {"handoff": true, "say": "Sure, I'll ask Voyager what's new."}
"Forget it." {"handoff": true, "say": "Okay, I'll tell Voyager to drop that."}"""
PROMPTS["v3"] = """You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. You read a transcript and reply with JSON: {"handoff": ..., "say": "..."}.
handoff false: pure chat that needs no workspace knowledge: greetings, thanks, goodbyes, "okay", "never mind", "are you there", compliments, who you are, help. Answer it yourself in one friendly sentence.
handoff true: everything else. Every request to open, move, show, rename, hide, start, stop or create something, every question about the workspace, the build, the crew or progress, and every vague "how is it going" or "any news". Say a short natural acknowledgement in your own words, repeating the topic. Never answer the question, never claim anything is done, never state a fact about the workspace.
Examples:
"Hey, good afternoon." {"handoff": false, "say": "Good afternoon! What can I do for you?"}
"Thanks a lot." {"handoff": false, "say": "You're welcome."}
"What do you do?" {"handoff": false, "say": "I pass your workspace requests to Voyager and tell you how it goes."}
"Open the Billing fleet." {"handoff": true, "say": "Sure, opening the Billing fleet."}
"How are the tests doing?" {"handoff": true, "say": "Let me check on the tests."}
"Anything new?" {"handoff": true, "say": "Sure, I'll ask Voyager what's new."}
"Rename the third vessel to Logs." {"handoff": true, "say": "On it, renaming that vessel."}"""
PROMPTS["v2"] = """You are Voyager's voice. You hear a transcript of what the user said and reply with JSON: {"handoff": true or false, "say": "<one short sentence>"}.

Chat (handoff false): greetings, thanks, goodbyes, "okay", "never mind", "cancel that", "are you there", "can you hear me", compliments, "who are you", "help", "what can you do", "say something". Answer in one friendly sentence yourself. If asked what you can do, say you pass their workspace requests to Voyager. Do not mention any fleet, vessel or build.

Everything else (handoff true): any request to open, move, show, rename, hide, start, stop, close or create something; any question about the workspace, the build, the crew, a pull request, progress or news; and vague status questions such as "any news", "what's going on", "are we good", "how's it going". Say one short natural acknowledgement that repeats the topic, for example "Sure, looking at the Deploys fleet." or "On it, checking on that." Never answer the question, never say anything is done, never state a result or a fact about the workspace."""
PROMPTS["v1"] = """You are Voyager's voice. You hear a transcript of what the user said.
Reply with JSON: {"handoff": true or false, "say": "<one short sentence>"}.
- Small talk, greetings, thanks, "help" or "what can you do": handoff false, and say a friendly one-sentence answer yourself. You can say that Voyager looks after their workspace and you pass their requests to it.
- Anything about the workspace, the build, the crew, a status, news, or any action or question that needs facts: handoff true, and say one short natural acknowledgement in your own words, such as "Sure, checking the build Fleet." Never answer the question, never say the task is done, never state any result or fact about the workspace.
- When unsure, handoff true."""


def speech(text, voice, stream):
    c = http.client.HTTPConnection(HOST, PORT, timeout=120)
    t0 = time.perf_counter()
    c.request("POST", "/v1/audio/speech", json.dumps({"input": text, "voice": voice, "stream": True}), {"content-type": "application/json"})
    r = c.getresponse(); buf = bytearray(); first_byte = first_chunk = None
    while True:
        b = r.read1(4096)
        if not b: break
        now = time.perf_counter() - t0
        if first_byte is None: first_byte = now
        if first_chunk is None and len(buf) + len(b) > 44: first_chunk = now
        buf += b
    c.close()
    pcm = np.frombuffer(bytes(buf[44:len(buf) // 2 * 2 + 0]), dtype=np.int16)
    loud = np.where(np.abs(pcm) > 1000)[0]
    lead = (loud[0] / 24000) if loud.size else 0.0
    return r.status, bytes(buf), {"first_audio": first_chunk, "first_100ms": (first_chunk or 0) + lead, "lead_silence": lead}


def shots(system):
    for k, v in SHOTS.items():
        if system is PROMPTS[k]:
            out = []
            for u, kind, say in v: out += [{"role": "user", "content": u}, {"role": "assistant", "content": json.dumps({"kind": kind, "say": say})}]
            return out
    return []


def ask(system, text):
    sch = SCHEMA_KIND if "\"kind\"" in system else SCHEMA
    body = {"model": "omni", "temperature": 0, "max_tokens": 80, "stream": True,
            "response_format": {"type": "json_schema", "json_schema": {"name": "r", "strict": True, "schema": sch}},
            "messages": [{"role": "system", "content": system}] + shots(system) + [{"role": "user", "content": text}]}
    c = http.client.HTTPConnection(HOST, PORT, timeout=120)
    t0 = time.perf_counter()
    c.request("POST", "/v1/chat/completions", json.dumps(body), {"content-type": "application/json"})
    r = c.getresponse()
    out = ""; t_say = None; first_tok = None
    for line in r:
        line = line.decode().strip()
        if not line.startswith("data:") or line.endswith("[DONE]"):
            continue
        d = json.loads(line[5:])["choices"][0]["delta"].get("content") or ""
        if d and first_tok is None:
            first_tok = time.perf_counter() - t0
        out += d
        m = re.search(r'"say"\s*:\s*"((?:[^"\\]|\\.)*)"', out)
        if m and t_say is None:
            t_say = time.perf_counter() - t0
    total = time.perf_counter() - t0
    c.close()
    try:
        j = json.loads(out)
        if "kind" in j: j = {"handoff": j["kind"] == "work", "say": j["say"]}
    except Exception: j = None
    return j, out, {"first_token": first_tok, "say_closed": t_say, "call_total": total}


def pct(v, q):
    v = sorted(v)
    return round(v[min(len(v) - 1, int(round(q * (len(v) - 1))))], 3) if v else None


def run(prompt_key, which, timing=True):
    items = FRESH2 if which == "fresh2" else FRESH if which == "fresh" else ITEMS
    idx = list(range(len(items))) if which in ("fresh", "fresh2") else HELD_OUT if which == "held" else [i for i in range(len(ITEMS)) if i not in HELD_OUT] if which == "tune" else list(range(len(ITEMS)))
    rows = []
    for i in idx:
        text, label, need = items[i]
        j, raw, t = ask(PROMPTS[prompt_key], text)
        r = {"i": i, "text": text, "label": label, "need_handoff": need, "raw": raw, **t}
        r["parsed"] = j is not None
        r["handoff"] = j["handoff"] if j else None; r["say"] = (j or {}).get("say", "")
        r["right"] = bool(j) and j["handoff"] == need
        r["kept_workspace"] = need and bool(j) and j["handoff"] is False
        r["claims_result"] = bool(RESULT_CLAIM.search(r["say"])) if j and j["handoff"] else False
        if timing and r["say"]:
            st, wav, tt = speech(r["say"], "female", True)
            r["tts_first_audio"] = tt["first_audio"]; r["tts_first_100ms"] = tt["first_100ms"]
            r["to_first_sound"] = (t["say_closed"] or t["call_total"]) + tt["first_100ms"]
        rows.append(r)
    return rows


def summary(rows):
    n = len(rows); g = lambda k: [r[k] for r in rows if r.get(k) is not None]
    return {"n": n, "right": sum(r["right"] for r in rows), "kept_workspace": sum(r["kept_workspace"] for r in rows),
            "claims_result": sum(r["claims_result"] for r in rows), "unparsed": sum(not r["parsed"] for r in rows),
            **{k: {"median": pct(g(k), .5), "p90": pct(g(k), .9)} for k in ("call_total", "say_closed", "tts_first_audio", "tts_first_100ms", "to_first_sound")}}


if __name__ == "__main__":
    key, which = sys.argv[1], sys.argv[2]
    rows = run(key, which)
    s = summary(rows)
    for r in rows:
        if not r["right"] or r["claims_result"] or r["kept_workspace"]:
            print("MISS" if not r["right"] else "CLAIM?", r["label"], "|", r["text"], "->", r["raw"][:140])
    print(json.dumps(s))
    json.dump({"prompt": PROMPTS[key], "summary": s, "rows": rows}, open(f"/var/tmp/voyager-crew/scratch/voice/round7-{key}-{which}.json", "w"), indent=1)

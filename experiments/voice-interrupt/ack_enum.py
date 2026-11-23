import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ack_choice as A

ACKS = ["none", "look", "sure"]
RULE = A.RULE_TODAY.replace(
    'Voyager answers these, so give only the kind.',
    'Voyager answers these. Also choose "ack", what you say before Voyager answers. '
    '"none" for a plain command whose effect they will see, such as open, go, dock, switch, show, maximize, restore, move, put, rename, hide or close, and for never mind, cancel or forget it. '
    '"look" for a question, a lookup, a status check or a summary, which takes Voyager a moment. '
    '"sure" for a request to tell or ask the crew something, or to start or stop work.')
EXAMPLE_ACK = {"Open the Billing fleet.": "none", "Are the tests passing?": "look", "Could you help me with something?": "sure",
               "What else can you do?": "look", "Forget about it.": "none", "How's it going with the crew?": "look", "Cancel the last one.": "none"}


def expected(text, label):
    t = text.lower()
    if label == "small":
        return None
    if re.search(r"never mind|cancel|scrap|forget", t):
        return "none"
    if re.search(r"^(ask|tell)\b|crew to|start a|^stop\b|run the checks", t):
        return "sure"
    if t.endswith("?") or re.match(r"(what|which|where|how|is|did|any|summari[sz]e|look at|show me)\b", t):
        return "look"
    return "none"


def schema():
    work = {"type": "object", "properties": {"kind": {"enum": ["work"]}, "ack": {"enum": ACKS}}, "required": ["kind", "ack"], "additionalProperties": False}
    chat = {"type": "object", "properties": {"kind": {"enum": ["chat"]}, "say": {"type": "string"}}, "required": ["kind", "say"], "additionalProperties": False}
    return {"anyOf": [work, chat]}


EXTRA = [("Make the browser bigger.", "none"), ("Show me the Ledger voyage.", "none"), ("Move the logs over to the right.", "none"),
         ("Call this one Sandbox.", "none"), ("Tell the reviewer to take another pass.", "sure"), ("Kick off a fresh build.", "sure"),
         ("What changed since lunch?", "look")]


def messages(text):
    m = [{"role": "system", "content": f"{RULE}\n\n{A.TALK}\n\n{A.CLOSING}"}]
    pairs = list(A.EXAMPLES_TODAY)
    if os.environ.get("ACK_EXTRA") == "1":
        for said, ack in EXTRA:
            EXAMPLE_ACK[said] = ack
        pairs = pairs[:7] + [(s, None) for s, _ in EXTRA] + pairs[7:]
    for said, say in pairs:
        m.append({"role": "user", "content": said})
        m.append({"role": "assistant", "content": json.dumps({"kind": "chat", "say": say} if say is not None else {"kind": "work", "ack": EXAMPLE_ACK[said]})})
    m.append({"role": "user", "content": text})
    return m


def main():
    A.schema = lambda choice: schema()
    A.messages = lambda text, choice: messages(text)
    rows = []
    for name, items in [("round7", A.ITEMS), ("fresh1", A.FRESH), ("fresh2", A.FRESH2)]:
        for text, label, need in items:
            r = A.route(text, True)
            j = json.loads(r["raw"])
            ack = j.get("ack", "none") if r["kind"] == "work" else None
            exp = expected(text, label) if need else None
            rows.append({"set": name, "text": text, "label": label, "need_handoff": need, **r, "ack": ack, "expected_ack": exp,
                         "right": (r["kind"] == "work") == need, "kept_workspace": need and r["kind"] != "work"})
    json.dump(rows, open(sys.argv[1], "w"), indent=1)
    graded = [r for r in rows if r["expected_ack"] and r["kind"] == "work"]
    secs = sorted(r["seconds"] for r in rows)
    print("prompts", len(rows), "right", sum(r["right"] for r in rows), "kept_workspace", sum(r["kept_workspace"] for r in rows),
          "ack_graded", len(graded), "ack_as_expected", sum(r["ack"] == r["expected_ack"] for r in graded),
          "ack_counts", {a: sum(r["ack"] == a for r in rows) for a in ACKS},
          "median_s", round(secs[len(secs) // 2], 3), "p90_s", round(secs[int(len(secs) * 0.9)], 3))
    for r in graded:
        if r["ack"] != r["expected_ack"]:
            print("  MISS", r["text"], "->", r["ack"], "expected", r["expected_ack"])


main()

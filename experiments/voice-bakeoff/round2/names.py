import copy, json, re
import tools, world

CORNERS = {"placement-5": "tl tr bl br", "placement-9": "tl tr bl br", "placement-14": "tl bl", "placement-16": "tr", "placement-18": "br", "placement-23": "tl tr bl br"}
WORD = {"tl": "top left", "tr": "top right", "bl": "bottom left", "br": "bottom right"}
SELECTED_FLEET = "Voyager Shell/Main"
STOP = {"the", "a", "vessel", "panel", "fleet", "voyage", "one", "tab", "space", "please", "on", "of"}

def squash(s): return norm(s).replace(' ', '')

def norm(s): return " ".join(w for w in re.sub(r"[^a-z0-9/ ]", " ", s.lower().replace("-", " ")).split() if w not in STOP)

def entries():
    out = []
    for vid, vn, fl in world.TREE:
        out.append({"kind": "voyage", "id": vid, "name": vn, "address": vn, "scope": vn})
        for fid, fn in fl: out.append({"kind": "fleet", "id": fid, "name": fn, "address": f"{vn}/{fn}", "scope": f"{vn}/{fn}"})
    for pid, name, addr, prog, pos in world.PANELS:
        out.append({"kind": "vessel", "id": pid, "name": name, "address": addr, "program": prog, "corners": CORNERS[pid].split(), "scope": addr.rsplit("/", 1)[0]})
    return out

def positional(ref, e):
    w = norm(ref); sides = [s for s in ("top", "bottom", "left", "right") if s in w.split()]
    if not sides or e["kind"] != "vessel" or not e["scope"] == SELECTED_FLEET: return False
    words = [WORD[c] for c in e["corners"]]
    return all(any(s in x.split() for x in words) for s in sides) if len(sides) == 2 else all(any(s in x.split() for x in words) for s in sides) and all(len(set(WORD[c].split()) & set(sides)) for c in e["corners"])

def resolve(ref, kinds):
    ref = (ref or "").strip(); scope = None
    m = re.match(r"^(.*?)\s+in\s+(.*)$", ref, re.I)
    if m: ref, scope = m.group(1), m.group(2)
    pool = [e for e in entries() if e["kind"] in kinds]
    if scope:
        sn = norm(scope); pool = [e for e in pool if sn in norm(e["scope"]) or sn == norm(e["name"]) and e["kind"] != "vessel"]
    n = norm(ref); hits = [e for e in pool if n and (squash(ref) == squash(e["name"]) or n == norm(e["name"]) or n == norm(e["address"]) or n == norm(e["address"].split("/", 1)[-1]) or (e.get("program") and n == e["program"]) or positional(ref, e))]
    if len(hits) > 1 and not scope:
        sel = [e for e in hits if e["scope"] == SELECTED_FLEET]
        if len(sel) == 1: hits = sel
    return hits

def cand(e): return {"kind": e["kind"], "name": e["name"], "address": e["address"]}

SPEC = [
    ("dock_to", "dock", "Move my focus to a Voyage, Fleet, Vessel or Portal. Name it as the human did.", {"target": ("context", ("voyage", "fleet", "vessel"))}),
    ("open_fleet", "select-fleet", "Show a Fleet (tab). Say 'Deploys' or 'Main in Research Notes'.", {"fleet": ("id", ("fleet",))}),
    ("rename", "rename", "Rename a Voyage, Fleet or Vessel to new_name.", {"target": ("target", ("voyage", "fleet", "vessel"))}),
    ("maximize", "set-placement-maximized", "Maximize a Vessel (maximized true), or restore it (false).", {"target": ("id", ("vessel",))}),
    ("move", "move-placement", "Move a Vessel to the side of another Vessel.", {"target": ("id", ("vessel",)), "beside": ("target", ("vessel",))}),
    ("reveal", "reveal-placement", "Bring a Vessel into view.", {"target": ("id", ("vessel",))}),
]
REFDESC = "The thing as the human said it: an on-screen name (voyagershell 2), an address (Voyager Shell/Main/Notes), a program (codex), or a position in the selected Fleet (top right, bottom left). Add 'in <Voyage or Fleet>' when the same name exists twice."

POSITIONS = ["top left", "top right", "bottom left", "bottom right", "left", "right", "top", "bottom"]
POSITION_FIELDS = False
ASK_NOARGS = False

def ask_noargs():
    return {"type": "function", "function": {"name": "ask_voyager", "description": "Hand this whole request to Voyager, the full agent. Use for anything that is not a direct workspace action: summaries, questions about work, messages to other agents, creating, starting or stopping things, and anything you are unsure of. The app passes the human's words to Voyager; you pass nothing.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}}

def voice_tools(spec=None):
    out = []
    for name, op, desc, refs in (spec or SPEC):
        v = tools.VARIANTS[op]; props, req = {}, []
        for field, (src, kinds) in refs.items():
            if POSITION_FIELDS and "vessel" in kinds and len(kinds) == 1:
                props[field] = {"type": "string", "description": "Its on-screen name or address, as said. Leave out when the human gave a position."}
                props[field + "_position"] = {"type": "string", "enum": POSITIONS, "description": "Its position in the selected Fleet, when the human said 'top right', 'left' and the like."}
            else: props[field] = {"type": "string", "description": REFDESC}; req.append(field)
        for k, x in v["properties"].items():
            if k in ("operation", "context", "id", "target", "voyage"): continue
            if k == "name": props["new_name"] = {"type": "string", "description": "The new name."}; req.append("new_name")
            elif k == "side": props["side"] = copy.deepcopy(tools.DEFS["Side"]); req.append("side")
            else: props[k] = {kk: vv for kk, vv in x.items() if kk != "description"}; req.append(k)
        out.append({"type": "function", "function": {"name": name, "description": desc, "parameters": {"type": "object", "properties": props, "required": req, "additionalProperties": False}}})
    out.append(ask_noargs() if ASK_NOARGS else tools.ask_tool())
    return out

def to_call(name, args, spec=None):
    """Returns ('call', contract call) | ('retry', message for the model) | ('handoff', args)."""
    if name == "ask_voyager": return "handoff", args
    table = spec or SPEC
    found = {n: (op, refs) for n, op, _, refs in table}.get(name)
    if not found: return "retry", f"unknown tool {name}; use one of {[s[0] for s in table]} or ask_voyager"
    op, refs = found; action = {"operation": op}; ids = {}
    for field, (src, kinds) in refs.items():
        ref = args.get(field) or args.get(field + "_position")
        if not ref: return "retry", f"missing {field}"
        hits = resolve(str(ref), kinds)
        if not hits: return "retry", {"error": f"nothing matches {args[field]!r}", "hint": "use a name or position from the workspace list, or ask_voyager"}
        if len(hits) > 1: return "retry", {"ambiguous": f"{args[field]!r} matches several", "candidates": [cand(e) for e in hits], "hint": "pick one by its address, or ask the human which"}
        ids[field] = hits[0]
        if src == "context": action["context"] = {"kind": hits[0]["kind"], "id": hits[0]["id"]}
        elif src == "target" and op == "rename": action["target"] = {"kind": hits[0]["kind"], "id": hits[0]["id"]}
        else: action[src] = hits[0]["id"]
    for k, x in tools.VARIANTS[op]["properties"].items():
        if k == "name": action["name"] = args.get("new_name")
        elif k in ("side", "maximized", "hidden", "before") and k in args: action[k] = args[k]
    return "call", {"action": action, "expectedVersion": world.VERSION}

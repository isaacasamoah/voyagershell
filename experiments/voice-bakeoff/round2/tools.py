import copy, json, os, re
import jsonschema
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SCHEMA = json.load(open(os.path.join(ROOT, "contract", "generated", "workspaceTool.schema.json")))
DEFS = SCHEMA["definitions"]
VALIDATOR = jsonschema.Draft7Validator(SCHEMA)
VARIANTS = {v["properties"]["operation"]["const"]: v for v in DEFS["Action"]["oneOf"]}

REAL_DESC = (
    "Inspect and manage the Voyager workspace. Use exact ids from the workspace list. expectedVersion is the version in the workspace list. "
    "If the human refers to something indirectly and you do not have its exact id, find it in the workspace list; do not guess an id. "
    "Example: {\"action\":{\"operation\":\"select-fleet\",\"id\":\"fleet-7\"},\"expectedVersion\":\"41\"}. "
    "Example creating a brand new voyage with a name and folder the human gave you directly: {\"action\":{\"operation\":\"create-voyage\",\"name\":\"Research\",\"cwd\":\"/home/isaac/research\"},\"expectedVersion\":\"41\"}; "
    "use create-voyage-from-source only when the human named an existing template or source location to copy from."
)
OP_DESC = {
    "dock": "Move the avatar's focus to a workspace, Voyage, Fleet, Vessel or Portal.",
    "select-fleet": "Show a Fleet (tab).", "select-voyage": "Show a Voyage (space).",
    "rename": "Rename a Voyage, Fleet, Vessel or Portal.",
    "set-placement-maximized": "Maximize or restore a placed Vessel.", "set-placement-hidden": "Hide or show a placed Vessel.",
    "move-placement": "Move a placed Vessel to the side of another placed Vessel.", "reveal-placement": "Bring a placed Vessel into view.",
    "create-voyage": "Create a new empty Voyage with a name and an existing folder.",
    "inspect": "Read the full current workspace state.",
}

def strip(node):
    node = copy.deepcopy(node)
    node.pop("$schema", None); node.pop("title", None)
    return node

def real_tool():
    schema = strip(SCHEMA)
    for variant in schema["definitions"]["Action"]["oneOf"]:
        op = variant["properties"]["operation"]["const"]
        if op in OP_DESC: variant["description"] = OP_DESC[op]
    return {"type": "function", "function": {"name": "voyager_workspace", "description": REAL_DESC, "parameters": schema}}

def real_args_to_action(args):
    return args.get("action") if isinstance(args, dict) else None

VOICE_TOOLS = [
    ("dock_to", "dock", "Move my focus to a Voyage, Fleet, Vessel, Portal or the whole workspace. Use when I say dock me to something."),
    ("open_fleet", "select-fleet", "Show a Fleet (tab) by its id."),
    ("rename", "rename", "Rename a Voyage, Fleet, Vessel or Portal."),
    ("maximize", "set-placement-maximized", "Maximize a Vessel (maximized true), or restore it (false)."),
    ("move", "move-placement", "Move a Vessel to the left, right, top or bottom of another Vessel. id is the one moving, target the one it goes beside."),
    ("reveal", "reveal-placement", "Bring a Vessel into view."),
]

def reach(node, seen=None):
    seen = set() if seen is None else seen
    if isinstance(node, dict):
        r = node.get("$ref")
        if r and r.split("/")[-1] not in seen:
            k = r.split("/")[-1]; seen.add(k); reach(DEFS[k], seen)
        for v in node.values(): reach(v, seen)
    elif isinstance(node, list):
        for v in node: reach(v, seen)
    return seen

def voice_tools():
    out = []
    for name, op, desc in VOICE_TOOLS:
        v = copy.deepcopy(VARIANTS[op]); props = {k: x for k, x in v["properties"].items() if k != "operation"}
        req = [r for r in v["required"] if r != "operation"]
        params = {"type": "object", "properties": props, "required": req, "additionalProperties": False}
        used = reach(params); 
        if used: params["definitions"] = {k: DEFS[k] for k in used}
        out.append({"type": "function", "function": {"name": name, "description": desc, "parameters": params}})
    out.append(ask_tool())
    return out

def ask_tool():
    return {"type": "function", "function": {"name": "ask_voyager", "description": "Hand any request that is not a direct workspace action to Voyager, the full agent: summaries, questions about work, messages to other agents, creating things, anything you are unsure of. Pass the request in the human's words.",
            "parameters": {"type": "object", "properties": {"request": {"type": "string"}}, "required": ["request"], "additionalProperties": False}}}

def real_tools(): return [real_tool(), ask_tool()]

def to_action(surface, name, args):
    if name == "ask_voyager": return {"handoff": args}
    if surface == "real":
        if name != "voyager_workspace": return {"error": f"unknown tool {name}"}
        return args
    op = {n: o for n, o, _ in VOICE_TOOLS}.get(name)
    if op is None: return {"error": f"unknown tool {name}"}
    return {"action": {"operation": op, **args}, "expectedVersion": "41"}

def known_ids():
    import world
    ids = {p[0] for p in world.PANELS}
    for vid, _, fl in world.TREE: ids.add(vid); ids.update(f for f, _ in fl)
    return ids

def unknown_ids(node, ids):
    bad = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("id", "target", "voyage") and isinstance(v, str) and v not in ids: bad.append(v)
            else: bad += unknown_ids(v, ids)
    elif isinstance(node, list):
        for v in node: bad += unknown_ids(v, ids)
    return bad

def validate(call):
    if "handoff" in call or "error" in call: return call.get("error")
    errs = sorted(VALIDATOR.iter_errors(call), key=lambda e: list(e.path))
    if not errs:
        bad = unknown_ids(call, known_ids())
        return f"unknown id {bad[0]!r}: use an id from the workspace list, such as placement-16 or fleet-7" if bad else None
    return "; ".join(f"{'/'.join(map(str, e.path)) or 'call'}: {e.message[:140]}" for e in errs[:3])

CALL_RE = re.compile(r"<tool_call>\s*<function=([^>\n]+)>(.*?)</function>\s*</tool_call>", re.DOTALL)
PARAM_RE = re.compile(r"<parameter=([^>\n]+)>\n?(.*?)\n?</parameter>", re.DOTALL)
def parse_calls(text):
    out = []
    for name, body in CALL_RE.findall(text):
        a = {}
        for k, v in PARAM_RE.findall(body):
            try: a[k] = json.loads(v)
            except json.JSONDecodeError: a[k] = v
        out.append((name, a))
    return out

"""A stand-in for Voyager's workspace owner, spoken to over MCP on standard input and output.

It offers `voyager_workspace` with the real generated schema and answers with real-shaped responses from world.py.
It keeps the application's version rule: an effect must quote the current layout version or it is rejected.
Every call is appended to the file named by VOYAGER_STUB_LOG so a test can grade what the agent did and when.
"""
import json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOG = os.environ.get("VOYAGER_STUB_LOG")
WITH_PANELS = os.environ.get("VOYAGER_STUB_PANELS", "1") == "1"
DESCRIPTION = (
    "Inspect and manage the captured avatar focus. Inspect first (expectedVersion 0), then use its returned version for each effect. "
    "Use exact IDs from inspection. Every response lists panels: each Vessel and Portal in focus with its placementId, contentId, "
    "on-screen effectiveName, unique address (Voyage/Fleet/Vessel, or Voyage/Portals/Portal), program, folder and position. Position "
    "counts column from the left along its row and row from the top along its column, with the corners the panel occupies; top right is the "
    "panel whose corners include top-right. When no Fleet is named, a position means the selected Fleet. A panel without a position "
    "is hidden or covered. Resolve a spoken name or position from "
    "panels; do not inspect again to locate one. Dock changes focus only when the human asks; it does not retarget this request. "
    "No project/content-file edits. The application supplies request identity and authority."
)
PLAIN = (
    "Inspect and manage the captured avatar focus. Inspect first (expectedVersion 0), then use its returned version for each effect. "
    "Use exact IDs from inspection. Dock changes focus only when the human asks; it does not retarget this request. "
    "No project/content-file edits. The application supplies request identity and authority."
)


def schema():
    value = json.load(open(os.path.join(ROOT, "contract", "generated", "workspaceTool.schema.json")))
    value.pop("$schema", None)
    value.pop("title", None)
    return value


def record(entry):
    if LOG:
        with open(LOG, "a") as log:
            log.write(json.dumps({"at": time.time(), **entry}) + "\n")


state = {"version": int(world.VERSION), "calls": 0}


def call(arguments):
    state["calls"] += 1
    action = arguments.get("action") or {}
    quoted = str(arguments.get("expectedVersion"))
    request_id = f"request-stub-{state['calls']}"
    if action.get("operation") == "inspect":
        status, message = "applied", None
    elif quoted != str(state["version"]):
        status, message = "rejected", "Layout changed; inspect it before making a new request"
    else:
        state["version"] += 1
        status, message = "applied", None
        world.apply(action)
    record({"action": action, "expectedVersion": quoted, "status": status})
    return world.response(request_id, status, str(state["version"]), message, WITH_PANELS), status == "applied"


def answer(message):
    method, identity = message.get("method"), message.get("id")
    if method == "initialize":
        version = (message.get("params") or {}).get("protocolVersion", "2025-06-18")
        return {"protocolVersion": version, "capabilities": {"tools": {}}, "serverInfo": {"name": "voyager-stub", "version": "0"}}
    if method == "tools/list":
        return {"tools": [{"name": "voyager_workspace", "description": DESCRIPTION if WITH_PANELS else PLAIN, "inputSchema": schema()}]}
    if method == "tools/call":
        text, applied = call((message.get("params") or {}).get("arguments") or {})
        return {"content": [{"type": "text", "text": text}], "isError": not applied}
    if method == "ping":
        return {}
    return None if identity is None else {"__error__": {"code": -32601, "message": "Unsupported method"}}


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    message = json.loads(line)
    result = answer(message)
    if message.get("id") is None or result is None:
        continue
    reply = {"jsonrpc": "2.0", "id": message["id"]}
    if "__error__" in result:
        reply["error"] = result["__error__"]
    else:
        reply["result"] = result
    sys.stdout.write(json.dumps(reply) + "\n")
    sys.stdout.flush()

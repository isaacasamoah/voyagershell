import importlib, json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand_in as world

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
LOG = os.environ.get("VOYAGER_STUB_LOG")
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


def schema():
    value = json.load(open(os.path.join(ROOT, "contract", "generated", "workspaceTool.schema.json")))
    value.pop("$schema", None)
    value.pop("title", None)
    return value


def record(entry):
    with open(LOG, "a") as log:
        log.write(json.dumps({"at": time.time(), **entry}) + "\n")


count = {"n": 0, "version": int(world.VERSION)}


def call(arguments):
    if os.path.exists(LOG + ".reset"):
        os.remove(LOG + ".reset")
        importlib.reload(world)
    count["n"] += 1
    action = arguments.get("action") or {}
    quoted = str(arguments.get("expectedVersion"))
    if action.get("operation") == "inspect":
        status, message = "applied", None
    elif quoted == str(count["version"]):
        count["version"] += 1
        status, message = "applied", None
        world.apply(action)
    else:
        status, message = "rejected", "Layout changed; inspect it before making a new request"
    record({"action": action, "expectedVersion": quoted, "status": status})
    open(LOG + ".version", "w").write(str(count["version"]))
    return world.response(f"request-stub-{count['n']}", status, str(count["version"]), message, True), status == "applied"


def answer(message):
    method = message.get("method")
    if method == "initialize":
        version = (message.get("params") or {}).get("protocolVersion", "2025-06-18")
        return {"protocolVersion": version, "capabilities": {"tools": {}}, "serverInfo": {"name": "voyager-stub", "version": "0"}}
    if method == "tools/list":
        return {"tools": [{"name": "voyager_workspace", "description": DESCRIPTION, "inputSchema": schema()}]}
    if method == "tools/call":
        text, applied = call((message.get("params") or {}).get("arguments") or {})
        return {"content": [{"type": "text", "text": text}], "isError": not applied}
    if method == "ping":
        return {}
    return None


if __name__ == "__main__":
    for line in sys.stdin:
        if not line.strip():
            continue
        message = json.loads(line)
        result = answer(message)
        if message.get("id") is not None:
            reply = {"jsonrpc": "2.0", "id": message["id"], "result": result} if result is not None else {"jsonrpc": "2.0", "id": message["id"], "error": {"code": -32601, "message": "Unsupported method"}}
            sys.stdout.write(json.dumps(reply) + "\n")
            sys.stdout.flush()

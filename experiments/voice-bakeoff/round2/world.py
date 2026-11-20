import json
VERSION = "41"
PANELS = [
    ("placement-5",  "scout-dashboard",  "Scout Dashboard/Main/scout-dashboard", "bash",   "1 of 1, fills the Fleet"),
    ("placement-9",  "scout-dashboard",  "Scout Dashboard/Deploys/scout-dashboard", "codex", "1 of 1, fills the Fleet"),
    ("placement-14", "voyagershell",     "Voyager Shell/Main/voyagershell", "claude", "left column, spans top and bottom (top-left, bottom-left)"),
    ("placement-16", "Notes",            "Voyager Shell/Main/Notes", "notes", "right column, top (top-right)"),
    ("placement-18", "voyagershell 2",   "Voyager Shell/Main/voyagershell 2", "bash", "right column, bottom (bottom-right)"),
    ("placement-23", "Notes",            "Research Notes/Main/Notes", "notes", "1 of 1, fills the Fleet"),
]
TREE = [("voyage-2", "Scout Dashboard", [("fleet-3", "Main"), ("fleet-7", "Deploys")]), ("voyage-11", "Voyager Shell", [("fleet-12", "Main")]), ("voyage-20", "Research Notes", [("fleet-21", "Main")])]
def state_text():
    lines = [f"Workspace version {VERSION}. Selected: Voyager Shell / Main.", "Voyages and Fleets:"]
    for vid, vn, fl in TREE: lines.append(f"- {vn} ({vid}): " + ", ".join(f"{n} ({i})" for i, n in fl))
    lines.append("Vessels (placementId, on-screen name, address, program, position):")
    for p, n, a, prog, pos in PANELS: lines.append(f"- {p}, {n}, {a}, {prog}, {pos}")
    return "\n".join(lines)
SYSTEM = "You are Voyager's voice. The human speaks a request; act on it with a tool call, never ask back. Use ids from this workspace list.\n\n" + state_text()

def has(c, **kw):
    a = c.get("action", {})
    def same(k, x, y): return x.lower() == y.lower() if k == "name" and isinstance(x, str) and isinstance(y, str) else x == y
    return all(same(k, a.get(k), v) for k, v in kw.items())
def tgt(c, kind, id): return c.get("action", {}).get("target") == {"kind": kind, "id": id}
H = "handoff"
# (label, spoken, grader for real surface, grader for voice surface); H means the right answer is ask_voyager
REQUESTS = [
 ("dock voyage (old failure)", "Dock me to Scout Dashboard.", lambda c: has(c, operation="dock") and c["action"]["context"] == {"kind": "voyage", "id": "voyage-2"}, "same"),
 ("dock vessel", "Dock me to the Notes vessel in Research Notes.", lambda c: has(c, operation="dock") and c["action"]["context"] == {"kind": "vessel", "id": "placement-23"}, "same"),
 ("rename left", "Rename the vessel on the left to Planner.", lambda c: has(c, operation="rename", name="Planner") and tgt(c, "vessel", "placement-14"), "same"),
 ("rename numbered", "Rename voyagershell 2 to Build.", lambda c: has(c, operation="rename", name="Build") and tgt(c, "vessel", "placement-18"), "same"),
 ("rename other voyage", "Rename the Notes vessel in Research Notes to Roadmap.", lambda c: has(c, operation="rename", name="Roadmap") and tgt(c, "vessel", "placement-23"), "same"),
 ("maximize top right", "Maximize the top right vessel.", lambda c: has(c, operation="set-placement-maximized", id="placement-16", maximized=True), "same"),
 ("maximize numbered", "Maximize voyagershell 2.", lambda c: has(c, operation="set-placement-maximized", id="placement-18", maximized=True), "same"),
 ("maximize bottom right", "Make the bottom right one fullscreen.", lambda c: has(c, operation="set-placement-maximized", id="placement-18", maximized=True), "same"),
 ("open fleet", "Open the Deploys fleet.", lambda c: has(c, operation="select-fleet", id="fleet-7"), "same"),
 ("open fleet other voyage", "Open the Main fleet in Research Notes.", lambda c: has(c, operation="select-fleet", id="fleet-21"), "same"),
 ("move left", "Move the top right vessel to the left of the vessel on the left.", lambda c: has(c, operation="move-placement", id="placement-16", target="placement-14", side="left"), "same"),
 ("move right", "Move voyagershell 2 to the right of Notes.", lambda c: has(c, operation="move-placement", id="placement-18", target="placement-16", side="right"), "same"),
 ("move below", "Put Notes below voyagershell.", lambda c: has(c, operation="move-placement", id="placement-16", target="placement-14", side="bottom"), "same"),
 ("reveal", "Show me the Codex vessel in Deploys.", lambda c: has(c, operation="reveal-placement", id="placement-9"), "same"),
 ("create voyage (old failure)", "Create a voyage called Research in home isaac research.", lambda c: has(c, operation="create-voyage", name="Research", cwd="/home/isaac/research"), H),
 ("handoff summary", "Summarise what the build Fleet did today.", H, H),
 ("handoff blocked", "What's blocked in the build Fleet?", H, H),
 ("handoff message", "Ask the verifier to look at the avatar pull request.", H, H),
 ("handoff unknown", "Hide the middle vessel in the top row.", H, H),
 ("handoff no such voyage", "Close the Billing voyage.", H, H),
]

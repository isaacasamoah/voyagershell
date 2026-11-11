"""A realistic synthetic workspace, shaped like the app's real `Response` (contract/generated/response.d.ts)."""
import json


def leaf(p):
    return {"kind": "leaf", "placement": p}


LAYOUT = {
    "canvas": {
        "portalMode": "overlay",
        "sidebarCollapsed": False,
        "root": {"kind": "row", "children": [
            {"kind": "block", "region": "sidebar", "size": {"kind": "fixed", "pixels": 260}},
            {"kind": "column", "children": [
                {"kind": "block", "region": "fleet-strip", "size": {"kind": "content"}},
                {"kind": "block", "region": "active-fleet", "size": {"kind": "fill"}}]}]},
    },
    "contents": [
        {"id": "content-4", "typeId": "terminal", "cwd": "/home/isaac/scout-dashboard", "backend": "core-4", "launch": {"kind": "terminal"}},
        {"id": "content-8", "typeId": "terminal", "cwd": "/home/isaac/scout-dashboard", "backend": "core-8",
         "launch": {"kind": "codex", "model": "gpt-6.1-sol", "effort": "high", "permissions": "yolo"}},
        {"id": "content-13", "typeId": "terminal", "cwd": "/home/isaac/voyagershell", "backend": "core-13", "launch": {"kind": "program", "argv": ["claude"]}},
        {"id": "content-15", "typeId": "notes", "cwd": "/home/isaac/voyagershell", "configuration": {"notesFile": "notes/Title.md"}},
        {"id": "content-22", "typeId": "notes", "cwd": "/home/isaac/obsidian", "configuration": {"notesFile": "Projects/research.md"}},
    ],
    "context": {"kind": "fleet", "id": "fleet-12"},
    "home": None, "nextId": "30", "savedLayouts": [],
    "selectedVoyage": "voyage-11", "selectedFleet": "fleet-12", "view": "fleet",
    "voyages": [
        {"id": "voyage-2", "name": "Scout Dashboard", "nameOrigin": "deliberate", "cwd": "/home/isaac/scout-dashboard",
         "portals": [], "primaryVessel": "placement-5",
         "fleets": [
             {"id": "fleet-3", "name": "Main", "root": leaf("placement-5"),
              "vessels": [{"id": "placement-5", "name": "Terminal 1", "content": "content-4"}]},
             {"id": "fleet-7", "name": "Deploys", "root": leaf("placement-9"),
              "vessels": [{"id": "placement-9", "name": "Codex", "content": "content-8"}]}]},
        {"id": "voyage-11", "name": "Voyager Shell", "nameOrigin": "deliberate", "cwd": "/home/isaac/voyagershell",
         "portals": [], "primaryVessel": "placement-14",
         "fleets": [
             {"id": "fleet-12", "name": "Main",
              "root": {"kind": "branch", "axis": "horizontal", "first": leaf("placement-14"), "second": leaf("placement-16"), "share": 0.6},
              "vessels": [{"id": "placement-14", "name": "Claude", "content": "content-13"},
                          {"id": "placement-16", "name": "Notes", "content": "content-15"}]}]},
        {"id": "voyage-20", "name": "Research Notes", "nameOrigin": "deliberate", "cwd": "/home/isaac/obsidian",
         "portals": [], "primaryVessel": "placement-23",
         "fleets": [
             {"id": "fleet-21", "name": "Main", "root": leaf("placement-23"),
              "vessels": [{"id": "placement-23", "name": "Notes", "content": "content-22"}]}]},
    ],
}
VERSION = "41"
RESPONSE = {"requestId": "request-7f3a", "status": "applied", "version": VERSION, "layout": LAYOUT, "fresh": True,
            "createdWorkspace": False, "createdContents": [], "message": None}
RESPONSE_TEXT = json.dumps(RESPONSE, separators=(",", ":"))
FOCUS = {"scope": {"kind": "fleet", "id": "fleet-12"}, "path": ["Voyager Shell", "Main"],
         "cwd": "/home/isaac/voyagershell", "revision": VERSION}


def act(args):
    a = (args or {}).get("action")
    return a if isinstance(a, dict) else {}


def has(a, **kw):
    return all(a.get(k) == v for k, v in kw.items())


# (label, what the human says, grader for the effect call's `action`)
TASKS = [
    ("rename-fleet", "Rename this fleet to Debugging.",
     lambda a: has(a, operation="rename", name="Debugging") and a.get("target") == {"kind": "fleet", "id": "fleet-12"}),
    ("close-voyage", "Close the Scout Dashboard voyage, I'm done with it.",
     lambda a: has(a, operation="close-voyage", id="voyage-2")),
    ("select-voyage", "Switch over to the Scout Dashboard voyage.",
     lambda a: has(a, operation="select-voyage", id="voyage-2")),
    ("create-voyage", "Create a new voyage called Research at /home/isaac/research.",
     lambda a: has(a, operation="create-voyage", name="Research", cwd="/home/isaac/research")),
    ("maximize-panel", "Make the Claude panel fullscreen.",
     lambda a: has(a, operation="set-panel-maximized", id="placement-14", maximized=True)),
    ("hide-panel", "Hide the Notes panel in this fleet for now.",
     lambda a: has(a, operation="set-panel-hidden", id="placement-16", hidden=True)),
    ("collapse-sidebar", "Collapse the sidebar for me.",
     lambda a: has(a, operation="set-sidebar", collapsed=True)),
    ("create-fleet", "Add a new fleet called Experiments to the Scout Dashboard voyage.",
     lambda a: has(a, operation="create-fleet", voyage="voyage-2", name="Experiments")),
    ("dock-voyage", "Dock to the Research Notes voyage.",
     lambda a: has(a, operation="dock") and a.get("context") == {"kind": "voyage", "id": "voyage-20"}),
    ("select-fleet", "Switch to the Deploys fleet.",
     lambda a: has(a, operation="select-fleet", id="fleet-7")),
]

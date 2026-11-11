"""A synthetic workspace shaped like the application's real inspection, including the new `panels` list.

The layout follows contract/generated/response.d.ts. The panels follow what app/src/locate.rs computes for this
layout: on-screen names numbered among siblings, a unique address, and a position per shown panel.
Nothing here is read from a real profile.
"""
import json, os


def leaf(placement):
    return {"kind": "leaf", "placement": placement}


def vessel(placement, content, name, automatic=True):
    item = {"id": placement, "name": name, "content": content}
    if automatic:
        item["nameOrigin"] = "automatic"
    return item


LAYOUT = {
    "canvas": {"portalMode": "overlay", "sidebarCollapsed": False, "root": {"kind": "row", "children": [
        {"kind": "block", "region": "sidebar", "size": {"kind": "fixed", "pixels": 260}},
        {"kind": "column", "children": [
            {"kind": "block", "region": "fleet-strip", "size": {"kind": "content"}},
            {"kind": "block", "region": "active-fleet", "size": {"kind": "fill"}}]}]}},
    "contents": [
        {"id": "content-4", "typeId": "terminal", "cwd": "/home/isaac/scout-dashboard", "backend": "core-4", "launch": {"kind": "terminal"}},
        {"id": "content-8", "typeId": "terminal", "cwd": "/home/isaac/scout-dashboard", "backend": "core-8",
         "launch": {"kind": "codex", "model": "gpt-6.1-sol", "effort": "high", "permissions": "yolo"}},
        {"id": "content-13", "typeId": "terminal", "cwd": "/home/isaac/voyagershell", "backend": "core-13", "launch": {"kind": "program", "argv": ["claude"]}},
        {"id": "content-15", "typeId": "notes", "cwd": "/home/isaac/voyagershell", "configuration": {"notesFile": "notes/Title.md"}},
        {"id": "content-17", "typeId": "terminal", "cwd": "/home/isaac/voyagershell", "backend": "core-17", "launch": {"kind": "terminal"}},
        {"id": "content-22", "typeId": "notes", "cwd": "/home/isaac/obsidian", "configuration": {"notesFile": "Projects/research.md"}},
    ],
    "context": {"kind": "workspace"},
    "home": None, "nextId": "30", "savedLayouts": [],
    "selectedVoyage": "voyage-11", "selectedFleet": "fleet-12", "view": "fleet",
    "voyages": [
        {"id": "voyage-2", "name": "Scout Dashboard", "nameOrigin": "deliberate", "cwd": "/home/isaac/scout-dashboard",
         "portals": [], "primaryVessel": "placement-5", "fleets": [
             {"id": "fleet-3", "name": "Main", "root": leaf("placement-5"), "vessels": [vessel("placement-5", "content-4", "Terminal 1")]},
             {"id": "fleet-7", "name": "Deploys", "root": leaf("placement-9"), "vessels": [vessel("placement-9", "content-8", "Terminal 1")]}]},
        {"id": "voyage-11", "name": "Voyager Shell", "nameOrigin": "deliberate", "cwd": "/home/isaac/voyagershell",
         "portals": [], "primaryVessel": "placement-14", "fleets": [
             {"id": "fleet-12", "name": "Main",
              "root": {"kind": "branch", "axis": "horizontal", "share": 6000, "first": leaf("placement-14"),
                       "second": {"kind": "branch", "axis": "vertical", "share": 5000, "first": leaf("placement-16"), "second": leaf("placement-18")}},
              "vessels": [vessel("placement-14", "content-13", "Terminal 1"),
                          vessel("placement-16", "content-15", "Notes", automatic=False),
                          vessel("placement-18", "content-17", "Terminal 2")]}]},
        {"id": "voyage-20", "name": "Research Notes", "nameOrigin": "deliberate", "cwd": "/home/isaac/obsidian",
         "portals": [], "primaryVessel": "placement-23", "fleets": [
             {"id": "fleet-21", "name": "Main", "root": leaf("placement-23"), "vessels": [vessel("placement-23", "content-22", "Notes", automatic=False)]}]},
    ],
}


def panel(placement, content, name, address, backend, program, path, column, row, columns, rows, corners):
    return {"placementId": placement, "contentId": content, "backend": backend,
            "directory": {"kind": "live" if backend else "voyage", "path": path}, "program": program, "conversationName": None,
            "effectiveName": name, "address": address,
            "position": {"column": column, "row": row, "columns": columns, "rows": rows, "corners": corners}}


EVERY_CORNER = ["top-left", "top-right", "bottom-left", "bottom-right"]
PANELS = [
    panel("placement-5", "content-4", "scout-dashboard", "Scout Dashboard/Main/scout-dashboard", "core-4", "bash", "/home/isaac/scout-dashboard", 1, 1, 1, 1, EVERY_CORNER),
    panel("placement-9", "content-8", "scout-dashboard", "Scout Dashboard/Deploys/scout-dashboard", "core-8", "codex", "/home/isaac/scout-dashboard", 1, 1, 1, 1, EVERY_CORNER),
    panel("placement-14", "content-13", "voyagershell", "Voyager Shell/Main/voyagershell", "core-13", "claude", "/home/isaac/voyagershell", 1, 1, 2, 2, ["top-left", "bottom-left"]),
    panel("placement-16", "content-15", "Notes", "Voyager Shell/Main/Notes", None, None, "/home/isaac/voyagershell", 2, 1, 2, 2, ["top-right"]),
    panel("placement-18", "content-17", "voyagershell 2", "Voyager Shell/Main/voyagershell 2", "core-17", "bash", "/home/isaac/voyagershell", 2, 2, 2, 2, ["bottom-right"]),
    panel("placement-23", "content-22", "Notes", "Research Notes/Main/Notes", None, None, "/home/isaac/obsidian", 1, 1, 1, 1, EVERY_CORNER),
]

VERSION = "41"
FOCUS = {"scope": {"kind": "workspace"}, "path": ["Overwatch"], "cwd": None, "revision": VERSION}


def response(request_id, status, version, message=None, with_panels=True):
    body = {"requestId": request_id, "status": status, "version": version, "layout": LAYOUT, "fresh": True,
            "createdWorkspace": False, "createdContents": [], "message": message}
    if with_panels:
        body["panels"] = PANELS
    return json.dumps(body, separators=(",", ":"))


def apply(action):
    """Change the stand-in layout the way the application would for the few effects the tests use."""
    operation, target = action.get("operation"), action.get("id")
    fleets = [fleet for voyage in LAYOUT["voyages"] for fleet in voyage["fleets"]]
    owner = next((fleet for fleet in fleets if any(item["id"] == target for item in fleet["vessels"])), None)
    shown = next((item for item in PANELS if item["placementId"] == target), None)
    if operation == "set-panel-maximized" and owner:
        owner["maximizedPlacement"] = target if action.get("maximized") else None
        for item in PANELS:
            if any(member["id"] == item["placementId"] for member in owner["vessels"]):
                item["position"] = None
        shown["position"] = {"column": 1, "row": 1, "columns": 1, "rows": 1, "corners": EVERY_CORNER}
    elif operation == "set-panel-hidden" and owner:
        next(item for item in owner["vessels"] if item["id"] == target)["hidden"] = bool(action.get("hidden"))
        shown["position"] = None
    elif operation == "remove-panel" and owner:
        owner["vessels"] = [item for item in owner["vessels"] if item["id"] != target]
        owner["root"] = None if not owner["vessels"] else owner["root"]
        PANELS.remove(shown)
    elif operation == "rename" and action.get("target", {}).get("kind") == "vessel":
        target = action["target"]["id"]
        for fleet in fleets:
            for item in fleet["vessels"]:
                if item["id"] == target:
                    item["name"] = action["name"]
                    item.pop("nameOrigin", None)
        for item in PANELS:
            if item["placementId"] == target:
                item["address"] = item["address"].rsplit("/", 1)[0] + "/" + action["name"]
                item["effectiveName"] = action["name"]
    elif operation == "set-sidebar":
        LAYOUT["canvas"]["sidebarCollapsed"] = bool(action.get("collapsed"))
    elif operation == "select-voyage":
        LAYOUT["selectedVoyage"] = target
        LAYOUT["selectedFleet"] = next(voyage["fleets"][0]["id"] for voyage in LAYOUT["voyages"] if voyage["id"] == target)
    elif operation == "select-fleet":
        LAYOUT["selectedFleet"] = target
        LAYOUT["selectedVoyage"] = next(voyage["id"] for voyage in LAYOUT["voyages"] if any(fleet["id"] == target for fleet in voyage["fleets"]))
    elif operation == "create-fleet":
        voyage = next(voyage for voyage in LAYOUT["voyages"] if voyage["id"] == action.get("voyage"))
        voyage["fleets"].append({"id": "fleet-31", "name": action.get("name"), "root": leaf("placement-33"),
                                 "vessels": [vessel("placement-33", "content-32", "Terminal 1")]})
        LAYOUT["contents"].append({"id": "content-32", "typeId": "terminal", "cwd": voyage["cwd"], "launch": {"kind": "terminal"}})
        PANELS.append(panel("placement-33", "content-32", voyage["cwd"].rsplit("/", 1)[1], f"{voyage['name']}/{action.get('name')}/" + voyage["cwd"].rsplit("/", 1)[1],
                            None, None, voyage["cwd"], 1, 1, 1, 1, EVERY_CORNER))
        LAYOUT["selectedFleet"], LAYOUT["selectedVoyage"] = "fleet-31", voyage["id"]


def has(action, **expected):
    return all(action.get(key) == value for key, value in expected.items())


# (label, what the human says, grader for the effect call's action; None means no effect may be made)
TASKS = [
    ("top right",        "Make the top right vessel fullscreen.",             lambda a: has(a, operation="set-panel-maximized", id="placement-16", maximized=True)),
    ("bottom right",     "Hide the bottom right one.",                        lambda a: has(a, operation="set-panel-hidden", id="placement-18", hidden=True)),
    ("numbered name",    "Maximize voyagershell 2.",                          lambda a: has(a, operation="set-panel-maximized", id="placement-18", maximized=True)),
    ("left vessel",      "Rename the vessel on the left to Planner.",         lambda a: has(a, operation="rename", name="Planner") and a.get("target") == {"kind": "vessel", "id": "placement-14"}),
    ("by program",       "Close the Codex vessel in the Deploys fleet.",      lambda a: has(a, operation="remove-panel", id="placement-9")),
    ("by address",       "Hide Voyager Shell slash Main slash Notes.",        lambda a: has(a, operation="set-panel-hidden", id="placement-16", hidden=True)),
    ("select fleet",     "Switch to the Deploys fleet.",                      lambda a: has(a, operation="select-fleet", id="fleet-7")),
    ("create fleet",     "Create a fleet called Experiments in Scout Dashboard.", lambda a: has(a, operation="create-fleet", voyage="voyage-2", name="Experiments")),
    ("no such voyage",   "Close the Billing voyage.",                         None),
    ("no such position", "Hide the middle vessel in the top row.",            None),
]


if os.environ.get("VOYAGER_WORLD") == "crowded":
    # Five terminals in one folder, arranged three over two. Two earlier terminals were closed, so the stored
    # default names have gaps while the on-screen names are numbered without gaps, in the order the Fleet holds them.
    crowded = [("placement-41", "content-40", "Terminal 1", 2, 2, ["bottom-right"]),
               ("placement-43", "content-42", "Terminal 3", 3, 1, ["top-right"]),
               ("placement-45", "content-44", "Terminal 4", 1, 1, ["top-left"]),
               ("placement-47", "content-46", "Terminal 6", 1, 2, ["bottom-left"]),
               ("placement-49", "content-48", "Terminal 7", 2, 1, [])]
    fleet = LAYOUT["voyages"][1]["fleets"][0]
    fleet["vessels"] = [vessel(placement, content, stored) for placement, content, stored, *_ in crowded]
    fleet["root"] = {"kind": "branch", "axis": "vertical", "share": 5000,
                     "first": {"kind": "branch", "axis": "horizontal", "share": 3333, "first": leaf("placement-45"),
                               "second": {"kind": "branch", "axis": "horizontal", "share": 5000, "first": leaf("placement-49"), "second": leaf("placement-43")}},
                     "second": {"kind": "branch", "axis": "horizontal", "share": 5000, "first": leaf("placement-47"), "second": leaf("placement-41")}}
    LAYOUT["contents"] = [item for item in LAYOUT["contents"] if item["id"] not in ("content-13", "content-15", "content-17")] + [
        {"id": content, "typeId": "terminal", "cwd": "/home/isaac/voyagershell", "backend": content.replace("content", "core"), "launch": {"kind": "terminal"}}
        for _, content, *_ in crowded]
    LAYOUT["voyages"][1]["primaryVessel"] = "placement-41"
    PANELS[:] = [item for item in PANELS if item["placementId"] not in ("placement-14", "placement-16", "placement-18")] + [
        panel(placement, content, "voyagershell" if index == 0 else f"voyagershell {index + 1}",
              "Voyager Shell/Main/" + ("voyagershell" if index == 0 else f"voyagershell {index + 1}"),
              content.replace("content", "core"), "bash", "/home/isaac/voyagershell", column, row, 3, 2, corners)
        for index, (placement, content, _, column, row, corners) in enumerate(crowded)]
    TASKS[:] = [
        ("numbered name",   "Hide voyagershell 4.",                          lambda a: has(a, operation="set-panel-hidden", id="placement-47", hidden=True)),
        ("numbered rename", "Rename voyagershell 2 to Build.",               lambda a: has(a, operation="rename", name="Build") and a.get("target") == {"kind": "vessel", "id": "placement-43"}),
        ("top middle",      "Maximize the top middle vessel.",               lambda a: has(a, operation="set-panel-maximized", id="placement-49", maximized=True)),
        ("third from left", "Close the third vessel from the left in the top row.", lambda a: has(a, operation="remove-panel", id="placement-43")),
        ("bottom left",     "Hide the bottom left one.",                     lambda a: has(a, operation="set-panel-hidden", id="placement-47", hidden=True)),
        ("top right",       "Make the top right vessel fullscreen.",         lambda a: has(a, operation="set-panel-maximized", id="placement-43", maximized=True)),
        ("second in row 2", "Rename the second vessel in the bottom row to Logs.", lambda a: has(a, operation="rename", name="Logs") and a.get("target") == {"kind": "vessel", "id": "placement-41"}),
        ("no such name",    "Hide voyagershell 6.",                          None),
    ]

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


def has(action, **expected):
    return all(action.get(key) == value for key, value in expected.items())


# (label, what the human says, grader for the effect call's action; None means no effect may be made)


def apply(action):
    """Change the stand-in layout the way the application would for the few effects the tests use."""
    operation, target = action.get("operation"), action.get("id")
    fleets = [fleet for voyage in LAYOUT["voyages"] for fleet in voyage["fleets"]]
    owner = next((fleet for fleet in fleets if any(item["id"] == target for item in fleet["vessels"])), None)
    shown = next((item for item in PANELS if item["placementId"] == target), None)
    if operation == "set-placement-maximized" and owner:
        owner["maximizedPlacement"] = target if action.get("maximized") else None
        for item in PANELS:
            if any(member["id"] == item["placementId"] for member in owner["vessels"]):
                item["position"] = None
        shown["position"] = {"column": 1, "row": 1, "columns": 1, "rows": 1, "corners": EVERY_CORNER}
    elif operation == "set-placement-hidden" and owner:
        next(item for item in owner["vessels"] if item["id"] == target)["hidden"] = bool(action.get("hidden"))
        shown["position"] = None
    elif operation == "remove-placement" and owner:
        owner["vessels"] = [item for item in owner["vessels"] if item["id"] != target]
        owner["root"] = None if not owner["vessels"] else owner["root"]
        PANELS.remove(shown)
    elif operation == "reveal-placement" and owner:
        LAYOUT["selectedFleet"] = owner["id"]
        LAYOUT["selectedVoyage"] = next(voyage["id"] for voyage in LAYOUT["voyages"] if any(fleet["id"] == owner["id"] for fleet in voyage["fleets"]))
        if owner.get("maximizedPlacement") not in (None, target):
            owner["maximizedPlacement"] = None
    elif operation == "rename" and action.get("target", {}).get("kind") in ("voyage", "fleet"):
        kind, identity = action["target"]["kind"], action["target"]["id"]
        for voyage in LAYOUT["voyages"]:
            if kind == "voyage" and voyage["id"] == identity:
                voyage["name"] = action["name"]
            for fleet in voyage["fleets"]:
                if kind == "fleet" and fleet["id"] == identity:
                    fleet["name"] = action["name"]
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

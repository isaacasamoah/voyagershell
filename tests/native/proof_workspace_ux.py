import json
import os
from pathlib import Path

from proof_foundation_notes import wait
from proof_process import observe_core_exit, process_identity
from proof_split_resize import splitter_point
from proof_workspace import core_rpc, named_button


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey == "workspace-ux"
    launch = json.loads((evidence / "launch.json").read_text())
    pid = launch["pid"]
    socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{session}.sock"
    owned, observations, errors = [], {}, []
    opened, failure = True, None

    def rpc(method, params):
        assert socket.is_socket(), "Dedicated Core socket is absent"
        return core_rpc(session, env, method, params)

    def document():
        return (
            rpc("doc.get", {"name": "voyager-layout-v1"})
            if socket.is_socket()
            else None
        )

    def ready(predicate):
        return wait(
            document,
            lambda doc: bool(doc.get("value")) and predicate(doc["value"]),
            "workspace owner result",
        )

    def fleet(value):
        return value["voyages"][0]["fleets"][0]

    def fields(name):
        return [
            item
            for item in native("fields", pid, [name], "window")["fields"]
            if item["width"] > 0 and item["height"] > 0
        ]

    def one(name):
        return wait(lambda: fields(name), lambda items: len(items) == 1, name)[0]

    def point(item):
        return (
            (item["x"] + item["width"] / 2) / 2,
            (item["y"] + item["height"] / 2) / 2,
        )

    def move(point):
        bounds = geometry()
        native(
            "move",
            int(bounds["X"]) + round(point[0] * 2),
            int(bounds["Y"]) + round(point[1] * 2),
            2,
        )

    def click(point, code=272):
        move(point)
        native("button", True, code)
        native("button", False, code)

    def position_button(name, edge=None):
        def settled():
            target = named_button(native, evidence, name, edge=edge)
            move(target)
            return target == named_button(native, evidence, name, edge=edge)

        wait(settled, bool, f"stable native button {name}")

    def button(name):
        position_button(name)
        native("button", True)
        native("button", False)

    def menu(name, action):
        position_button(name, "left")
        native("button", True, 273)
        native("button", False, 273)
        item = one(action)
        assert item["role"] in ("menu item", "menu_item"), item
        click(point(item))

    def tap(key):
        native("key", key, True)
        native("key", key, False)

    def text(item, value):
        click(point(item))
        native("key", 65507, True)
        tap(ord("a"))
        native("key", 65507, False)
        for character in value:
            tap(ord(character))

    def record(process):
        identity = process_identity(process, metadata_only=True)
        assert identity["uid"] == os.getuid(), identity
        owned.append({"pid": process, **identity})

    def drag(start, end):
        move(start)
        native("button", True)
        try:
            for step in range(1, 7):
                move(
                    tuple(
                        start[axis] + (end[axis] - start[axis]) * step / 6
                        for axis in (0, 1)
                    )
                )
        finally:
            native("button", False)

    def resize_column():
        box = one("Portal dock")
        separators = fields("Resize side by side panes")
        divider = min(
            separators, key=lambda item: abs(item["x"] + item["width"] / 2 - box["x"])
        )
        assert abs(divider["x"] + divider["width"] / 2 - box["x"]) < 64
        start, _ = splitter_point(divider, separators)
        start = [coordinate / 2 for coordinate in start]
        drag(start, (start[0] - 36, start[1]))
        return box

    def reopen(expected, stage="cold"):
        nonlocal opened, owned, pid
        opened = False
        close()
        exits = observe_core_exit(session, env, owned)
        owned = []
        start_frame(f"ux-{stage}-reopened")
        opened = True
        reopened = json.loads((evidence / "launch.json").read_text())
        pid = reopened["pid"]
        assert pid != launch["pid"]
        assert (
            reopened["command"] == launch["command"]
            and reopened["binarySha256"] == launch["binarySha256"]
        )
        cold = ready(lambda value: value == expected["value"])
        cold_core = rpc("server.status", {})
        record(cold_core["pid"])
        if (holder := cold_core.get("holder")) and holder.get("current"):
            record(holder["pid"])
        assert (
            cold_core["pid"] != core["pid"]
            and cold_core["core"]["id"] == core["core"]["id"]
        )
        ended = rpc("terminal.list", {"all": True})["terminals"]
        assert {item["address"] for item in ended} == {
            item["address"] for item in roster
        }
        assert all(item["state"] == "finished" for item in ended), ended
        return {
            "document": cold,
            "core": cold_core,
            "launch": reopened,
            "terminals": ended,
            "exits": exits,
        }

    try:
        initial = ready(lambda value: bool(value["contents"][0].get("backend")))
        assert (
            len(initial["value"]["voyages"]) == 1
            and len(fleet(initial["value"])["vessels"]) == 1
        )
        assert capture("ux-initial").size == (1450, 940)
        core = rpc("server.status", {})
        observations["core"] = core
        backend = initial["value"]["contents"][0]["backend"]
        terminal = rpc("terminal.get", {"terminal": backend})
        backends = [
            item["address"] for item in rpc("terminal.list", {"all": True})["terminals"]
        ]
        record(core["pid"])
        if (holder := core.get("holder")) and holder.get("current"):
            record(holder["pid"])
        record(terminal["pid"])
        button("Split Vessel right")
        one("Create Notes Vessel")
        capture("ux-picker-before-cancel")
        button(fleet(initial["value"])["vessels"][0]["name"])
        wait(
            lambda: fields("Create Notes Vessel"),
            lambda items: not items,
            "picker cancellation",
        )
        assert document() == initial
        assert [
            item["address"] for item in rpc("terminal.list", {"all": True})["terminals"]
        ] == backends
        button("Split Vessel right")
        button("Create Notes Vessel")
        split = ready(lambda value: len(fleet(value)["vessels"]) == 2)
        vessel = fleet(split["value"])["vessels"][1]
        assert (
            next(
                item
                for item in split["value"]["contents"]
                if item["id"] == vessel["content"]
            )["typeId"]
            == "notes"
        )
        menu(vessel["name"], "Rename")
        text(one("Name"), "UX Notes")
        tap(65293)
        ready(lambda value: fleet(value)["vessels"][1]["name"] == "UX Notes")
        one("UX Notes")
        button("Show Portals")
        capture("ux-empty-portal-before-choice")
        button("Choose Portal content")
        capture("ux-empty-portal-after-choice")
        button("Create Notes Portal")
        created = ready(lambda value: len(value["voyages"][0]["portals"]) == 1)
        portal = created["value"]["voyages"][0]["portals"][0]

        def portal_titles():
            snapshot = native("fields", pid, ["Portal dock", "Note title"], "window")[
                "fields"
            ]
            boxes = [
                item
                for item in snapshot
                if item["name"] == "Portal dock"
                and item["width"] > 0
                and item["height"] > 0
            ]
            if len(boxes) != 1:
                return []
            box = boxes[0]
            return [
                item
                for item in snapshot
                if item["name"] == "Note title"
                and item["width"] > 0
                and item["height"] > 0
                and all(
                    box[axis] <= item[axis]
                    and item[axis] + item[extent] <= box[axis] + box[extent]
                    for axis, extent in (("x", "width"), ("y", "height"))
                )
            ]

        title = wait(
            portal_titles,
            lambda items: len(items) == 1,
            "settled Portal title in one native snapshot",
        )[0]
        bounds = native("fields", pid, ["Portal dock", "Vessel dock"], "window")[
            "fields"
        ]
        portals = [
            item
            for item in bounds
            if item["name"] == "Portal dock"
            and item["width"] > 0
            and item["height"] > 0
        ]
        vessels = [
            item
            for item in bounds
            if item["name"] == "Vessel dock"
            and item["width"] > 0
            and item["height"] > 0
        ]
        observations["singlePortalBounds"] = bounds
        capture("ux-single-portal-full-panel-bounds")
        assert len(portals) == 1 and len(vessels) == 2, bounds
        assert all(
            abs(portals[0]["y"] - item["y"]) <= 2
            and abs(portals[0]["height"] - item["height"]) <= 2
            for item in vessels
        ), bounds
        text(title, "Portal retained")
        button("Embed Portals")
        data_path = evidence / "profile/data" / (portal["content"] + ".json")
        saved = wait(
            lambda: data_path.read_bytes() if data_path.exists() else None,
            lambda data: json.loads(data)["title"] == "Portal retained",
            "Portal Notes save",
        )
        embedded = ready(
            lambda value: value["voyages"][0]["portalLayout"]["mode"] == "make-room"
        )
        box = resize_column()
        resized = ready(
            lambda value: (
                value["voyages"][0]["portalLayout"]["width"]
                > embedded["value"]["voyages"][0]["portalLayout"]["width"]
            )
        )
        assert one("Portal dock")["width"] > box["width"]
        menu(fleet(resized["value"])["name"], "New Fleet")
        changed = ready(
            lambda value: (
                len(value["voyages"][0]["fleets"]) == 2
                and bool(value["contents"][-1].get("backend"))
            )
        )
        record(
            rpc(
                "terminal.get",
                {"terminal": changed["value"]["contents"][-1]["backend"]},
            )["pid"]
        )
        assert changed["value"]["voyages"][0]["portals"] == [portal]
        assert (
            changed["value"]["voyages"][0]["portalLayout"]
            == resized["value"]["voyages"][0]["portalLayout"]
        )
        assert data_path.read_bytes() == saved
        button(fleet(changed["value"])["name"])
        ready(lambda value: value["selectedFleet"] == fleet(value)["id"])
        button("Overlay Portals")
        ready(lambda value: value["voyages"][0]["portalLayout"]["mode"] == "overlay")
        for action in ("Hide", "Remove from layout"):
            menu("UX Notes", action)
            hidden = ready(
                lambda value: (
                    fleet(value)["vessels"][1].get("hidden", False)
                    if action == "Hide"
                    else fleet(value)["root"]["kind"] == "leaf"
                )
            )
            menu(fleet(hidden["value"])["name"], "Show UX Notes")
            shown = ready(
                lambda value: (
                    not fleet(value)["vessels"][1].get("hidden", False)
                    and fleet(value)["root"]["kind"] == "branch"
                )
            )
            assert fleet(shown["value"])["vessels"][1]["id"] == vessel["id"]
            assert fleet(shown["value"])["vessels"][1]["content"] == vessel["content"]
        menu(fleet(shown["value"])["name"], "Save layout")
        text(one("Name"), "UX layout")
        tap(65293)
        final = ready(
            lambda value: any(
                item["name"] == "UX layout" for item in value.get("savedLayouts", [])
            )
        )
        assert final["value"]["context"] == initial["value"]["context"]
        assert rpc("terminal.get", {"terminal": backend})["pid"] == terminal["pid"]
        assert rpc("server.status", {})["core"]["id"] == core["core"]["id"]
        assert final["value"]["voyages"][0]["portals"] == [portal]
        assert (
            final["value"]["voyages"][0]["portalLayout"]["width"]
            == resized["value"]["voyages"][0]["portalLayout"]["width"]
        )
        assert data_path.read_bytes() == saved
        observations.update(
            initial=initial,
            split=split,
            portal=portal,
            resized=resized,
            changed=changed,
            final=final,
        )
        capture("ux-panels-menus-and-column")
        box = resize_column()
        overlay = ready(
            lambda value: (
                value["voyages"][0]["portalLayout"]["width"]
                > final["value"]["voyages"][0]["portalLayout"]["width"]
            )
        )
        assert one("Portal dock")["width"] > box["width"]
        button("Split Portal bottom")
        button("Create Notes Portal")
        divided = ready(lambda value: len(value["voyages"][0]["portals"]) == 2)
        second = divided["value"]["voyages"][0]["portals"][1]
        assert second["name"] == "Notes 2" and second["name"] != portal["name"]
        assert second["id"] != portal["id"] and second["content"] != portal["content"]
        for action in ("Hide", "Remove from layout"):
            menu(second["name"], action)
            ready(
                lambda value: (
                    value["voyages"][0]["portals"][1].get("hidden", False)
                    if action == "Hide"
                    else value["voyages"][0]["portalLayout"]["root"]["kind"] == "leaf"
                )
            )
            menu(portal["name"], "Show " + second["name"])
            revealed = ready(
                lambda value: (
                    not value["voyages"][0]["portals"][1].get("hidden", False)
                    and value["voyages"][0]["portalLayout"]["root"]["kind"] == "branch"
                )
            )
            assert revealed["value"]["voyages"][0]["portals"] == [portal, second]
        first_box = min(fields("Portal dock"), key=lambda item: item["y"])
        drag(
            point(one(second["name"])),
            ((first_box["x"] + first_box["width"] / 2) / 2, (first_box["y"] + 2) / 2),
        )
        reordered = ready(
            lambda value: (
                value["voyages"][0]["portalLayout"]["root"]["first"].get("placement")
                == second["id"]
            )
        )
        assert (
            reordered["value"]["voyages"][0]["portalLayout"]["root"]["second"].get(
                "placement"
            )
            == portal["id"]
        )
        assert reordered["value"]["voyages"][0]["portals"] == [portal, second]
        assert reordered["value"]["contents"] == revealed["value"]["contents"]
        assert reordered["value"]["context"] == initial["value"]["context"]
        button("Home")
        home = ready(lambda value: value["view"] == "home")
        assert home["value"]["home"]["fleets"][0]["root"] is None
        assert home["value"]["selectedFleet"] == final["value"]["selectedFleet"]
        button("Choose Vessel content")
        button("Create Notes Vessel")
        created_home = ready(
            lambda value: len(value["home"]["fleets"][0]["vessels"]) == 1
        )
        home_panel = created_home["value"]["home"]["fleets"][0]["vessels"][0]
        menu(home_panel["name"], "Hide")
        ready(
            lambda value: value["home"]["fleets"][0]["vessels"][0].get("hidden", False)
        )
        menu("Choose Vessel content", "Show " + home_panel["name"])
        shown_home = ready(
            lambda value: (
                not value["home"]["fleets"][0]["vessels"][0].get("hidden", False)
            )
        )
        assert shown_home["value"]["home"]["fleets"][0]["vessels"][0] == home_panel
        button(initial["value"]["voyages"][0]["name"])
        before_cold = ready(lambda value: value["view"] == "fleet")
        assert before_cold["value"]["voyages"][0]["portals"] == [portal, second]
        assert (
            before_cold["value"]["voyages"][0]["portalLayout"]["width"]
            == overlay["value"]["voyages"][0]["portalLayout"]["width"]
        )
        assert before_cold["value"]["context"] == initial["value"]["context"]
        assert data_path.read_bytes() == saved
        roster = rpc("terminal.list", {"all": True})["terminals"]
        observations.update(
            overlay=overlay, divided=divided, home=shown_home, beforeCold=before_cold
        )
        capture("ux-portals-and-home-before-quit")
        observations["cold"] = reopen(before_cold)
        observations["warmExits"] = observations["cold"]["exits"]
        assert (
            len(
                wait(
                    lambda: fields("Portal dock"),
                    lambda items: len(items) == 2,
                    "two cold retained Portal targets",
                )
            )
            == 2
        )
        one("Hide Portals")
        one("Embed Portals")
        assert data_path.read_bytes() == saved
        capture("ux-cold-retained-column-and-no-agents")
        button("Hide Portals")
        hidden_column = ready(
            lambda value: not value["voyages"][0]["portalLayout"]["visible"]
        )
        observations["hiddenCold"] = reopen(hidden_column, "hidden-cold")
        one("Show Portals")
        assert not fields("Portal dock")
        button("Show Portals")
        reshown = ready(lambda value: value["voyages"][0]["portalLayout"]["visible"])
        assert reshown["value"] == before_cold["value"]
        wait(
            lambda: fields("Portal dock"),
            lambda items: len(items) == 2,
            "revealed retained Portal pair",
        )
        assert data_path.read_bytes() == saved
        capture("ux-hidden-cold-column-revealed")
    except BaseException as error:
        failure = repr(error)
        try:
            capture("ux-failure")
        except Exception as diagnostic:
            errors.append(f"Failure capture: {diagnostic}")
        raise
    finally:
        if opened:
            try:
                opened = False
                close()
            except Exception as error:
                errors.append(f"Quit: {error}")
        try:
            observations["exits"] = observe_core_exit(session, env, owned)
        except Exception as error:
            errors.append(f"Owned exits: {error}")
        observations.update(owned=owned, errors=errors, failure=failure)
        (evidence / "workspace-ux-observed.json").write_text(
            json.dumps(observations, indent=2)
        )
        if failure is None:
            assert not errors, observations
    return [
        "native-chosen-content-and-cancellation",
        "retained-portal-data-width-and-mode",
        "panel-hide-remove-reveal-and-fleet-layout-menu",
        "portal-split-and-retained-hide-remove-reveal",
        "home-shared-empty-create-hide-show",
        "overlay-and-embedded-width-through-cold-reopen-without-program-restart",
        "same-owner-portal-reorder-and-hidden-column-cold-reopen",
        "native-quit-owned-exits",
    ]

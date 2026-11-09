import json
import os
import time
from pathlib import Path

from proof_foundation_notes import wait
from proof_process import observe_core_exit, process_identity
from proof_split_resize import splitter_point
from proof_workspace import core_rpc, named_button


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey in ("feedback-ux", "rename-typing")
    pid = json.loads((evidence / "launch.json").read_text())["pid"]
    owned, observed, errors = [], {"keys": [], "videos": []}, []
    recording, failure = False, None

    def rpc(method, params):
        return core_rpc(session, env, method, params)

    def document():
        observed["document"] = rpc("doc.get", {"name": "voyager-layout-v1"})
        return observed["document"]

    def ready(predicate):
        return wait(
            document,
            lambda doc: bool(doc.get("value")) and predicate(doc["value"]),
            "feedback owner result",
        )

    def fields(*names):
        return [
            item
            for item in native("fields", pid, list(names), "window")["fields"]
            if item["width"] > 0 and item["height"] > 0
        ]

    def one(name, dock=None):
        def candidates():
            items = fields(name)
            if dock:
                region = one(dock)
                items = [
                    item
                    for item in items
                    if item["role"] in ("button", "push button")
                    and region["x"]
                    <= item["x"] + item["width"] / 2
                    < region["x"] + region["width"]
                    and region["y"]
                    <= item["y"] + item["height"] / 2
                    < region["y"] + region["height"]
                ]
            return items

        return wait(candidates, lambda items: len(items) == 1, name)[0]

    def point(item):
        return (
            (item["x"] + item["width"] / 2) / 2,
            (item["y"] + item["height"] / 2) / 2,
        )

    def move(point):
        bounds = geometry()
        receipt = native(
            "move",
            int(bounds["X"]) + round(point[0] * 2),
            int(bounds["Y"]) + round(point[1] * 2),
            2,
        )
        observed.setdefault("pointerMoves", []).append(
            {"point": point, "geometry": bounds, "receipt": receipt}
        )
        return receipt

    def click(point, code=272):
        move(point)
        native("button", True, code)
        native("button", False, code)

    def button(name, menu=False):
        roles = ("menu item", "menu_item") if menu else ("push button", "button")

        def settled():
            target = named_button(native, evidence, name, roles=roles)
            move(target)
            return target == named_button(native, evidence, name, roles=roles)

        wait(settled, bool, f"stable feedback control {name}")
        native("button", True)
        native("button", False)

    def tap(key):
        before = time.monotonic()
        down = native("key", key, True)
        up = native("key", key, False)
        observed["keys"].append(
            {
                "keysym": key,
                "before": before,
                "after": time.monotonic(),
                "down": down,
                "up": up,
            }
        )

    def video(name):
        nonlocal recording
        assert capture(name).size == (1450, 940)
        receipt = json.loads((evidence / f"{name}-compositor.json").read_text())
        observed["videos"].append(
            native("record-start", str(evidence / f"{name}.webm"), receipt)["recording"]
        )
        recording = True

    def stop_video():
        nonlocal recording
        if recording:
            recording = False
            observed["videos"].append(native("record-stop")["recording"])

    def record(process):
        identity = process_identity(process, metadata_only=True)
        assert identity["uid"] == os.getuid(), identity
        owned.append({"pid": process, **identity})

    def rename(name, replacement, pick, clip=None, dock=None):
        layout = document()["value"]
        before = pick(layout)
        if before.get("nameOrigin") == "automatic":
            item = next(
                item for item in layout["contents"] if item["id"] == before["content"]
            )
            if item["typeId"] == "terminal":
                source = rpc("terminal.get", {"terminal": item["backend"]})
                assert source["state"] == "live" and source["pid"]
                cwd = (source.get("foreground") or {}).get("cwd")
                assert cwd, (
                    "Automatic title requires the bound terminal's live directory"
                )
                name = Path(cwd).name or "/"
                observed.setdefault("renameSources", []).append(
                    {
                        "placement": before,
                        "content": item,
                        "terminal": source,
                        "label": name,
                    }
                )
        if clip:
            video(clip)

        def settled_title():
            target = one(name, dock)
            observed.setdefault("menuTargets", []).append(target)
            delivered = move(point(target))
            bounds = geometry()
            actual = delivered["pointerPosition"]
            assert (
                abs(int(actual["X"]) - int(bounds["X"]) - round(point(target)[0] * 2))
                <= 2
            ), actual
            assert (
                abs(int(actual["Y"]) - int(bounds["Y"]) - round(point(target)[1] * 2))
                <= 2
            ), actual
            return point(target) == point(one(name, dock))

        wait(settled_title, bool, "stable rename title and delivered pointer")
        native("button", True, 273)
        native("button", False, 273)
        button("Rename", menu=True)
        observed.setdefault("renameEditors", []).append(one("Name"))
        capture(f"feedback-rename-selection-{len(observed['renameEditors'])}")
        for character in replacement:
            tap(ord(character))
        if clip:
            capture("feedback-rename-typed")
            stop_video()
        tap(65293)
        renamed = ready(lambda value: pick(value)["name"] == replacement)
        observed.setdefault("renames", []).append(renamed)
        expected = {**before, "name": replacement}
        expected.pop("nameOrigin", None)
        assert pick(renamed["value"]) == expected, (
            "Rename must replace the old name without Ctrl+A and preserve identity"
        )
        assert (
            rpc("terminal.get", {"terminal": content["backend"]})["pid"]
            == terminal["pid"]
        )
        return renamed

    def resize_column(width):
        box = one("Portal dock")
        separators = fields("Resize side by side panes")
        divider = min(
            separators, key=lambda item: abs(item["x"] + item["width"] / 2 - box["x"])
        )
        assert abs(divider["x"] + divider["width"] / 2 - box["x"]) <= 8, (divider, box)
        start, _ = splitter_point(divider, separators)
        start = [coordinate / 2 for coordinate in start]
        move(start)
        native("button", True)
        try:
            for step in range(1, 7):
                move((start[0] - 36 * step / 6, start[1]))
        finally:
            native("button", False)
        resized = ready(
            lambda value: value["voyages"][0]["portalLayout"]["width"] > width
        )
        observed["resized"] = resized
        width = resized["value"]["voyages"][0]["portalLayout"]["width"]
        box = wait(
            lambda: one("Portal dock"),
            lambda item: item["width"] > box["width"],
            "Portal width follows measured divider",
        )
        return width, box

    try:
        initial = ready(lambda value: bool(value["contents"][0].get("backend")))
        core = rpc("server.status", {})
        record(core["pid"])
        if (holder := core.get("holder")) and holder.get("current"):
            record(holder["pid"])
        fleet = initial["value"]["voyages"][0]["fleets"][0]
        panel = fleet["vessels"][0]
        content = next(
            item
            for item in initial["value"]["contents"]
            if item["id"] == panel["content"]
        )
        terminal = rpc("terminal.get", {"terminal": content["backend"]})
        record(terminal["pid"])
        observed.update(initial=initial, terminal=terminal)
        observed["initialAvatar"] = one("Voyager avatar")
        observed["initialWindowGeometry"] = geometry()
        names = [
            "Voyager avatar",
            "Start voice",
            "Stop voice",
            "Workspace sidebar",
            "Overwatch dock",
        ]
        observed["initialScreenBounds"] = native("fields", pid, names, "screen")[
            "fields"
        ]
        observed["initialWindowBounds"] = native("fields", pid, names, "window")[
            "fields"
        ]
        rename(
            panel["name"],
            "Voyager Rapid 42",
            lambda value: value["voyages"][0]["fleets"][0]["vessels"][0],
            "feedback-rename",
            dock="Vessel dock",
        )
        if journey == "rename-typing":
            return [
                "native-rename-select-all-delivery-and-same-pid",
                "resampled-typing-video-for-review",
            ]
        home = one("Home")
        sidebar = one("Workspace sidebar")
        avatar = one("Voyager avatar")
        speech = fields("Start voice", "Stop voice")
        assert len(speech) == 1, speech
        assert speech[0]["x"] < avatar["x"] + avatar["width"] / 2
        assert speech[0]["y"] > avatar["y"] + avatar["height"] / 2
        assert not fields("Listening", "Speaking")
        video("feedback-chat")
        button("Chat")
        composer = one("Message Voyager")
        moved = wait(
            lambda: one("Home"),
            lambda item: item["y"] > home["y"] + 40,
            "navigation pushed down by chat",
        )
        assert (
            composer["x"] >= sidebar["x"]
            and composer["x"] + composer["width"] <= sidebar["x"] + sidebar["width"]
        )
        assert composer["width"] >= sidebar["width"] - 60, (composer, sidebar)
        observed["chatChrome"] = fields("Voyager", "Context", "Idle")
        assert not [
            item
            for item in observed["chatChrome"]
            if sidebar["x"] <= item["x"] < sidebar["x"] + sidebar["width"]
            and item["y"] < moved["y"]
            and item["role"] not in ("button", "push button")
        ]
        assert len(fields("Close chat")) == 1
        assert composer["value"] in (None, "")
        click(point(composer))
        draft = "Retained feedback draft"
        for character in draft:
            tap(ord(character))
        capture("feedback-chat-open")
        button("Close chat")
        wait(
            lambda: one("Home"),
            lambda item: abs(item["y"] - home["y"]) <= 2,
            "navigation returned after chat",
        )
        assert not fields("Message Voyager")
        button("Chat")
        one("Message Voyager")
        capture("feedback-chat-draft-reopened")
        observed["draftReview"] = {
            "expected": draft,
            "before": "feedback-chat-open-compositor.png",
            "after": "feedback-chat-draft-reopened-compositor.png",
            "state": "pending manual visual review",
        }
        stop_video()
        button("Close chat")
        button("Collapse sidebar")
        one("Expand sidebar")
        rail = [
            one("Home"),
            one("Open Voyage " + initial["value"]["voyages"][0]["name"]),
            one("Create Voyage"),
        ]
        centers = [item["x"] + item["width"] / 2 for item in rail]
        assert max(centers) - min(centers) <= 2, rail
        compact = one("Voyager avatar")
        speech = fields("Start voice", "Stop voice")
        assert len(speech) == 1 and compact["height"] < avatar["height"], (
            compact,
            speech,
        )
        assert speech[0]["y"] >= compact["y"] + compact["height"] - 2
        capture("feedback-collapsed-rail-without-chat-occluder")
        button("Expand sidebar")
        rename(
            initial["value"]["voyages"][0]["name"],
            "Feedback Voyage",
            lambda value: value["voyages"][0],
            dock="Voyage dock",
        )
        rename(
            fleet["name"],
            "Feedback Fleet",
            lambda value: value["voyages"][0]["fleets"][0],
            dock="Fleet dock",
        )
        before_portals = document()
        button("Show Portals")
        choice = one("Create Notes Portal")
        trigger = one("Hide Portals")
        assert choice["role"] in ("menu item", "menu_item")
        assert choice["y"] >= trigger["y"] + trigger["height"] - 2, (choice, trigger)
        assert not fields("Choose Portal content")
        observed["portalMenu"] = native("fields", pid, None, "window")["fields"]
        assert fields("Create Codex Portal"), "Plain Codex option is missing"
        capture("feedback-empty-p-chooser")
        tap(65307)
        wait(
            lambda: fields("Create Notes Portal"),
            lambda items: not items,
            "cancelled Portal chooser",
        )
        cancelled = document()
        assert (
            cancelled["value"]["voyages"][0]["portals"]
            == before_portals["value"]["voyages"][0]["portals"]
            == []
        )
        assert (
            rpc("terminal.list", {"all": True})["terminals"][0]["pid"]
            == terminal["pid"]
        )
        button("Hide Portals")
        button("Show Portals")
        button("Create Notes Portal", menu=True)
        created = ready(lambda value: len(value["voyages"][0]["portals"]) == 1)
        rename(
            created["value"]["voyages"][0]["portals"][0]["name"],
            "Feedback Portal",
            lambda value: value["voyages"][0]["portals"][0],
            dock="Portal dock",
        )
        width, box = resize_column(
            created["value"]["voyages"][0]["portalLayout"]["width"]
        )
        button("Embed Portals")
        embedded = ready(
            lambda value: value["voyages"][0]["portalLayout"]["mode"] == "make-room"
        )
        width, box = resize_column(width)
        button("Hide Portals")
        button("Show Portals")
        wait(
            lambda: one("Portal dock"),
            lambda item: abs(item["width"] - box["width"]) <= 2,
            "retained Portal width",
        )
        assert not fields("Create Notes Portal")
        assert document()["value"]["voyages"][0]["portalLayout"]["width"] == width
        observed.update(portal=created, homeMoved=moved, sidebar=sidebar, rail=rail)
        capture("feedback-retained-portal-and-controls")
        assert document()["value"]["context"] == initial["value"]["context"]
    except BaseException as error:
        failure = repr(error)
        try:
            capture("feedback-failure")
        except Exception as diagnostic:
            errors.append(f"Failure capture: {diagnostic}")
        raise
    finally:
        try:
            stop_video()
        except Exception as error:
            errors.append(f"Recording stop: {error}")
        try:
            close()
        except Exception as error:
            errors.append(f"Quit: {error}")
        try:
            observed["exits"] = observe_core_exit(session, env, owned)
        except Exception as error:
            errors.append(f"Owned exits: {error}")
        observed.update(
            owned=owned,
            errors=errors,
            failure=failure,
            visualReviewRequired=[
                "exact unsent draft before close and after reopen",
                "font and typography",
                "blank visible placeholder",
                "menu border and plain launch text",
                "chat full-width motion",
                "video frame review without calibrated paint-latency claims",
            ],
        )
        (evidence / "feedback-ux-observed.json").write_text(
            json.dumps(observed, indent=2)
        )
        if failure is None:
            assert not errors, observed
    return [
        "native-select-all-and-typing-video",
        "chat-slide-draft-captures-and-navigation",
        "full-and-compact-single-speech-control",
        "aligned-collapsed-rail",
        "empty-p-native-menu-and-cancel",
        "retained-portal-width-and-same-process",
        "native-quit-owned-exits",
    ]

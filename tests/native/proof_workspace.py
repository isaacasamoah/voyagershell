import hashlib
import json
import subprocess
import time
from pathlib import Path

from proof_process import observe_core_exit


def wait(get, predicate, label, seconds=20):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = get()
        if value is not None and predicate(value):
            return value
        time.sleep(0.1)
    raise AssertionError(f"Timed out waiting for {label}: {value}")


def review_frame(capture, evidence, name, frame):
    capture(frame)
    image = evidence / (frame + "-compositor.png")
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    request = {"name": name, "image": image.name, "sha256": digest}
    (evidence / "visual-request.json").write_text(json.dumps(request, indent=2))
    reviewed = evidence / "visual-observations.json"
    return wait(
        lambda: json.loads(reviewed.read_text()) if reviewed.exists() else None,
        lambda value: value.get("sha256") == digest and value.get("observed") is True,
        "native visual review: " + name,
        180,
    )


def chord(native, character):
    native("key", 65507, True)
    native("key", 65505, True)
    native("key", ord(character), True)
    native("key", ord(character), False)
    native("key", 65505, False)
    native("key", 65507, False)


def named_button(
    native,
    evidence,
    name,
    edge=None,
    roles=("push button", "button", "menu item", "menu_item"),
):
    owner = json.loads((evidence / "launch.json").read_text())["pid"]
    path = evidence / "named-buttons.json"
    targets = json.loads(path.read_text()) if path.exists() else []
    deadline = time.monotonic() + 5
    while True:
        fields = native("fields", owner, [name], "window")["fields"]
        (evidence / "named-button-last.json").write_text(
            json.dumps({"name": name, "fields": fields}, indent=2)
        )
        if (
            len(fields) == 1
            and fields[0]["width"] > 0
            and fields[0]["height"] > 0
            and fields[0]["role"] in roles
        ):
            break
        assert time.monotonic() < deadline, f"No unique native button {name}: {fields}"
        time.sleep(0.05)
    item = fields[0]
    targets.append(item)
    path.write_text(json.dumps(targets, indent=2))
    x = item["x"] + (2 if edge == "left" else item["width"] / 2)
    y = item["y"] + (2 if edge == "top" else item["height"] / 2)
    return x / 2, y / 2


def click_control(native, capture, geometry, evidence, owner, name, targets, code=272):
    fields = native("fields", owner, [name], "window")["fields"]
    roles = ("button", "push button", "menu item", "menu_item", "switch", "terminal")
    items = [item for item in fields if item["role"] in roles and item["width"] > 0 and item["height"] > 0]
    if len(items) == 1:
        item = items[0]
    else:
        index = len(targets)
        bounds = geometry()
        native("move", int(bounds["X"]) + 4, int(bounds["Y"]) + int(bounds["HEIGHT"]) - 4, 2)
        time.sleep(0.15)
        image = capture(f"target-{index}")
        assert image.size == (1450, 940)
        request = {"index": index, "name": name, "image": f"target-{index}-compositor.png", "size": list(image.size)}
        (evidence / "target-request.json").write_text(json.dumps(request, indent=2))
        points = evidence / "measured-points.json"
        point = wait(lambda: json.loads(points.read_text()).get(str(index)) if points.exists() else None, lambda value: value["name"] == name, "measured visible target " + name, 180)
        x, y = point["point"]
        assert 0 <= x < image.width and 0 <= y < image.height
        item = {"name": name, "source": request["image"], "reference": point.get("reference"), "x": x * 2, "y": y * 2, "width": 0, "height": 0}
    bounds = geometry()
    native("move", int(bounds["X"]) + round(item["x"] + item["width"] / 2), int(bounds["Y"]) + round(item["y"] + item["height"] / 2), 2)
    native("button", True, code)
    native("button", False, code)
    targets.append(item)


def core_environment(session, env):
    runtime = env.get("XDG_RUNTIME_DIR")
    assert runtime and Path(runtime).is_absolute(), (
        "Core proof needs its actual runtime directory"
    )
    pinned = {key: value for key, value in env.items() if key != "HC_TERMINAL_ID"}
    pinned.update(
        HC_SESSION=session,
        HC_SOCKET=str(Path(runtime) / "herdr-core" / (session + ".sock")),
    )
    return pinned


def stop_existing_core(session, env):
    result = subprocess.run(
        ["hc", "--json", "server", "stop"],
        text=True,
        capture_output=True,
        env=core_environment(session, env),
        check=True,
        timeout=5,
    )
    acknowledgement = json.loads(result.stdout)
    assert isinstance(acknowledgement.get("stopped"), bool), (
        "Invalid stop acknowledgement"
    )
    return acknowledgement


def core_rpc(session, env, method, params):
    assert method != "server.stop", "Use the explicit existing-only stop before Quit"
    request = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    )
    result = subprocess.run(
        ["hc", "connect", "--session", session],
        input=request + "\n",
        text=True,
        capture_output=True,
        env=core_environment(session, env),
        check=True,
        timeout=5,
    )
    reply = json.loads(result.stdout.splitlines()[-1])
    assert "result" in reply, reply
    return reply["result"]


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    if journey.startswith("conversation"):
        from proof_conversation import prove as conversation

        return conversation(
            native=native,
            capture=capture,
            geometry=geometry,
            close=close,
            start_frame=start_frame,
            evidence=evidence,
            session=session,
            env=env,
            journey=journey,
        )
    if journey in (
        "terminal",
        "portal-terminal",
        "terminal-grid",
        "terminal-reported-status",
    ):
        from proof_terminal import terminal

        return terminal(
            native,
            capture,
            geometry,
            close,
            evidence,
            session,
            env,
            portals=journey == "portal-terminal",
            grid=journey == "terminal-grid",
            reported=journey == "terminal-reported-status",
        )
    if journey == "workspace-unavailable":
        for _ in range(30):
            frame = capture("workspace-core-unavailable")
            if frame.getcolors(16) is None:
                break
            time.sleep(0.1)
        assert frame.getcolors(16) is None, "Unavailable view never painted its error"
        close()
        return ["core-unavailable-captured-for-visual-review", "native-quit"]

    def rpc(method, params):
        return core_rpc(session, env, method, params)

    def observe_exit():
        return observe_core_exit(session, env)

    def state():
        return rpc("doc.get", {"name": "voyager-layout-v1"})

    def wait(predicate):
        for _ in range(50):
            result = state()
            if predicate(result["value"]):
                return result
            time.sleep(0.1)
        raise AssertionError("Native action did not reach the workspace owner")

    bounds = geometry()
    width, height = int(bounds["WIDTH"]) / 2, int(bounds["HEIGHT"]) / 2

    def click(x, y):
        bounds = geometry()
        native(
            "move", int(bounds["X"]) + round(x * 2), int(bounds["Y"]) + round(y * 2), 2
        )
        native("button", True)
        native("button", False)
        time.sleep(0.2)

    initial = wait(lambda layout: layout is not None)
    if guard := env.get("VOYAGER_PROOF_SCHEMA_GUARD"):
        socket = Path(env["HC_SOCKET"])
        assert env.get("HC_SESSION") == session and socket.name == f"{session}.sock"
        assert socket.is_socket(), "Dedicated Core socket is absent"
        before = rpc("server.status", {})
        before = (before["pid"], before["core"]["id"])
        with (evidence / "core-schema-live.log").open("x") as log:
            subprocess.run(
                ["node", guard, "--check"],
                env=env,
                check=True,
                timeout=10,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
        after = rpc("server.status", {})
        after = (after["pid"], after["core"]["id"])
        (evidence / "core-schema-live-identity.json").write_text(
            json.dumps({"before": before, "after": after}, indent=2)
        )
        assert before == after, "Schema check changed dedicated Core identity"
    assert len(initial["value"]["voyages"]) == 1, "Use a new isolated workspace"
    original = initial["value"]["voyages"][0]
    if journey == "layouts":
        return layouts(
            native,
            capture,
            click,
            wait,
            state,
            rpc,
            close,
            observe_exit,
            start_frame,
            original,
            width,
            height,
            evidence,
        )
    if journey == "arrangement":
        return arrangement(
            native,
            capture,
            geometry,
            click,
            wait,
            state,
            rpc,
            close,
            observe_exit,
            width,
            height,
            evidence,
        )
    return placement(
        native,
        capture,
        click,
        wait,
        state,
        close,
        start_frame,
        width,
        height,
        evidence,
    )


def arrangement_panes(fields, fleet, contents):
    root = fleet["root"]
    if root["kind"] == "leaf":
        order = [root["placement"]]
    else:
        assert root["axis"] == "horizontal"
        assert root["first"]["kind"] == root["second"]["kind"] == "leaf"
        order = [root["first"]["placement"], root["second"]["placement"]]
    positive = [item for item in fields if item["width"] > 0 and item["height"] > 0]
    views = sorted(
        [item for item in positive if item["role"] == "terminal"],
        key=lambda item: item["x"],
    )
    titles = sorted(
        [item for item in positive if item["role"] in ("button", "push button")],
        key=lambda item: item["x"],
    )
    assert len(views) == len(titles) == len(order) == len(fleet["vessels"]), fields
    mapped = {}
    for placement, title, view in zip(order, titles, views, strict=True):
        center = title["x"] + title["width"] / 2
        assert view["x"] <= center < view["x"] + view["width"], (title, view)
        assert title["y"] + title["height"] <= view["y"], (title, view)
        vessel = next(item for item in fleet["vessels"] if item["id"] == placement)
        content = next(item for item in contents if item["id"] == vessel["content"])
        assert content["typeId"] == "terminal" and content["backend"], content
        mapped[placement] = {
            "title": title,
            "terminal": view,
            "content": content["id"],
            "backend": content["backend"],
        }
    return mapped


def arrangement(
    native,
    capture,
    geometry,
    click,
    wait,
    state,
    rpc,
    close,
    observe_exit,
    width,
    height,
    evidence,
):
    owner = json.loads((evidence / "launch.json").read_text())["pid"]
    mappings = []

    def panes(document):
        layout = document["value"]
        fleet = next(
            item
            for voyage in layout["voyages"]
            for item in voyage["fleets"]
            if item["id"] == layout["selectedFleet"]
        )
        deadline = time.monotonic() + 5
        while True:
            fields = native("fields", owner, ["Terminal"], "window")["fields"]
            (evidence / "arrangement-target-last.json").write_text(
                json.dumps({"document": document, "fields": fields}, indent=2)
            )
            try:
                mapped = arrangement_panes(fields, fleet, layout["contents"])
                break
            except AssertionError:
                assert time.monotonic() < deadline, fields
                time.sleep(0.05)
        mappings.append({"document": document, "panes": mapped})
        (evidence / "arrangement-targets.json").write_text(
            json.dumps(mappings, indent=2)
        )
        return mapped

    def point(item, left=False):
        return (
            (item["x"] + (min(2, item["width"] / 2) if left else item["width"] / 2))
            / 2,
            (item["y"] + item["height"] / 2) / 2,
        )

    def key(value):
        native("key", value, True)
        native("key", value, False)

    def move(x, y):
        bounds = geometry()
        native(
            "move", int(bounds["X"]) + round(x * 2), int(bounds["Y"]) + round(y * 2), 2
        )

    def drag(source, target, cancel=False):
        move(*source)
        native("button", True)
        try:
            for step in range(1, 16):
                move(
                    source[0] + (target[0] - source[0]) * step / 15,
                    source[1] + (target[1] - source[1]) * step / 15,
                )
            capture("arrangement-preview")
            if cancel:
                screen = rpc("terminal.read", {"terminal": address})["text"]
                (evidence / "arrangement-escape-pending.json").write_text(
                    json.dumps({"address": address, "screen": screen}, indent=2)
                )
                assert not any(
                    line.startswith("ESCSTATUS:") for line in screen.splitlines()
                ), "Escape input check finished before cancellation"
                key(65307)
        finally:
            native("button", False)

    ready = wait(lambda layout: layout["contents"] and layout["contents"][0]["backend"])
    address = ready["value"]["contents"][0]["backend"]
    pid = rpc("terminal.get", {"terminal": address})["pid"]
    assert pid
    initial_fleet = ready["value"]["voyages"][0]["fleets"][0]
    initial_targets = panes(ready)
    click(*point(initial_targets[initial_fleet["vessels"][0]["id"]]["terminal"]))
    chord(native, "o")
    split = wait(
        lambda layout: (
            len(layout["voyages"][0]["fleets"][0]["vessels"]) == 2
            and all(content["backend"] for content in layout["contents"])
        )
    )
    fleet = split["value"]["voyages"][0]["fleets"][0]
    first = fleet["vessels"][0]["id"]
    second = fleet["vessels"][1]["id"]
    capture("arrangement-before")
    targets = panes(split)
    drag(point(targets[second]["title"]), point(targets[first]["terminal"], left=True))
    moved = wait(
        lambda layout: (
            (root := layout["voyages"][0]["fleets"][0]["root"])["kind"] == "branch"
            and root["axis"] == "horizontal"
            and root["first"].get("placement") == second
            and root["second"].get("placement") == first
        )
    )
    assert moved["value"]["contents"] == split["value"]["contents"]
    assert moved["value"]["context"] == split["value"]["context"]
    assert rpc("terminal.get", {"terminal": address})["pid"] == pid
    targets = panes(moved)
    assert targets[first]["backend"] == address
    click(*point(targets[first]["terminal"]))
    for (
        character
    ) in "printf 'ESC%s\\n' WAIT; read -rsn1 -t 5 x; printf 'ESC%s:%s\\n' STATUS $?":
        key(ord(character))
    key(65293)
    for _ in range(50):
        if (
            "ESCWAIT"
            in rpc("terminal.read", {"terminal": address})["text"].splitlines()
        ):
            break
        time.sleep(0.1)
    else:
        raise AssertionError("Terminal did not enter the Escape input check")
    drag(
        point(targets[second]["title"]), point(targets[first]["terminal"]), cancel=True
    )
    assert state() == moved
    for _ in range(70):
        if (
            "ESCSTATUS:142"
            in rpc("terminal.read", {"terminal": address})["text"].splitlines()
        ):
            break
        time.sleep(0.1)
    else:
        raise AssertionError(
            "Escape reached the terminal or the input check did not finish"
        )
    capture("arrangement-after-escape")
    drag(point(targets[second]["title"]), point(targets[second]["terminal"]))
    assert state() == moved
    capture("arrangement-after-self-drop")
    drag(point(targets[second]["title"]), (width + 10, height / 2))
    assert state() == moved
    capture("arrangement-after-outside-release")
    click(*point(targets[first]["terminal"]))
    for character in "printf 'ARRANGED\\n'":
        key(ord(character))
    key(65293)
    for _ in range(50):
        if (
            "ARRANGED"
            in rpc("terminal.read", {"terminal": address})["text"].splitlines()
        ):
            break
        time.sleep(0.1)
    else:
        raise AssertionError("Moved terminal did not receive real input")
    chord(native, "t")
    added = wait(
        lambda layout: (
            len(layout["voyages"][0]["fleets"]) == 2
            and all(content["backend"] for content in layout["contents"])
        )
    )
    first_fleet, second_fleet = [
        item["id"] for item in added["value"]["voyages"][0]["fleets"]
    ]
    fleet_names = {
        item["id"]: item["name"] for item in added["value"]["voyages"][0]["fleets"]
    }
    drag(
        named_button(native, evidence, fleet_names[second_fleet]),
        named_button(native, evidence, fleet_names[first_fleet], "left"),
    )
    reordered = wait(
        lambda layout: (
            [item["id"] for item in layout["voyages"][0]["fleets"]]
            == [second_fleet, first_fleet]
        )
    )
    assert reordered["value"]["contents"] == added["value"]["contents"]
    click(*named_button(native, evidence, "Create Voyage"))
    added_voyage = wait(
        lambda layout: (
            len(layout["voyages"]) == 2
            and all(content["backend"] for content in layout["contents"])
        )
    )
    first_voyage, second_voyage = [
        item["id"] for item in added_voyage["value"]["voyages"]
    ]
    voyage_names = {
        item["id"]: item["name"] for item in added_voyage["value"]["voyages"]
    }
    drag(
        named_button(native, evidence, voyage_names[second_voyage]),
        named_button(native, evidence, voyage_names[first_voyage], "top"),
    )
    reordered_voyages = wait(
        lambda layout: (
            [item["id"] for item in layout["voyages"]] == [second_voyage, first_voyage]
        )
    )
    assert reordered_voyages["value"]["contents"] == added_voyage["value"]["contents"]
    assert rpc("terminal.get", {"terminal": address})["pid"] == pid
    capture("arrangement-complete")
    (evidence / "arrangement-observed.json").write_text(
        json.dumps(
            {
                "before": split,
                "moved": moved,
                "fleets": reordered,
                "voyages": reordered_voyages,
                "address": address,
                "pid": pid,
            },
            indent=2,
        )
    )
    close()
    observe_exit()
    return [
        "real-terminal-split",
        "vessel-move-and-cancel",
        "moved-terminal-input",
        "fleet-reorder",
        "voyage-reorder",
        "native-quit",
    ]


def placement(
    native,
    capture,
    click,
    wait,
    state,
    close,
    start_frame,
    width,
    height,
    evidence,
):
    def key(value):
        native("key", value, True)
        native("key", value, False)

    def rename(x, y, value):
        click(x, y)
        click(x, y)
        time.sleep(0.15)
        pid = json.loads((evidence / "launch.json").read_text())["pid"]
        deadline = time.monotonic() + 5
        while True:
            fields = native("fields", pid, ["Name"], "window")["fields"]
            (evidence / "placement-name-fields.json").write_text(
                json.dumps(fields, indent=2)
            )
            if (
                len(fields) == 1
                and fields[0]["focused"]
                and fields[0]["width"] > 0
                and fields[0]["height"] > 0
            ):
                break
            assert time.monotonic() < deadline, "No unique focused native Name editor"
            time.sleep(0.05)
        native("key", 65507, True)
        key(ord("a"))
        native("key", 65507, False)
        key(65288)
        for character in value:
            key(ord(character))
        key(65293)

    capture("placement-initial")
    click(70, height - 30)
    created = wait(lambda layout: len(layout["voyages"][0]["portals"]) == 1)
    portal = created["value"]["voyages"][0]["portals"][0]
    capture("placement-portal-created")
    click(width - 40, 80)
    wait(lambda layout: layout["context"] == {"kind": "portal", "id": portal["id"]})
    rename(width - 270, 80, "+")
    wait(lambda layout: layout["voyages"][0]["portals"][0].get("name") == "+")
    portal = state()["value"]["voyages"][0]["portals"][0]
    click(355, 30)
    switched = wait(lambda layout: len(layout["voyages"][0]["fleets"]) == 2)
    assert switched["value"]["voyages"][0]["portals"][0] == portal
    assert switched["value"]["context"] == {"kind": "portal", "id": portal["id"]}
    capture("placement-portal-across-fleets")
    saved = state()
    close()
    start_frame("placement-reopened")
    assert state() == saved
    close()
    return [
        "real-voyage-portal",
        "portal-plus-name",
        "portal-identity-and-context-retained-across-fleets",
        "saved-placement-reopened",
        "native-quit",
    ]


def layouts(
    native,
    capture,
    click,
    wait,
    state,
    rpc,
    close,
    observe_exit,
    start_frame,
    original,
    width,
    height,
    evidence,
):
    owner = json.loads((evidence / "launch.json").read_text())["pid"]

    def field(name, focused=False):
        for _ in range(50):
            matches = native("fields", owner, [name], "window")["fields"]
            if (
                len(matches) == 1
                and matches[0]["width"] > 0
                and matches[0]["height"] > 0
                and (not focused or matches[0]["focused"])
            ):
                return matches[0]
            time.sleep(0.1)
        raise AssertionError(f"Native control unavailable: {name}")

    def press(name):
        item = field(name)
        click((item["x"] + item["width"] / 2) / 2, (item["y"] + item["height"] / 2) / 2)

    def key(value):
        native("key", value, True)
        native("key", value, False)

    def ids():
        return sorted(
            item["address"] for item in rpc("terminal.list", {"all": True})["terminals"]
        )

    wait(lambda layout: layout["contents"] and layout["contents"][0]["backend"])
    click(350, 190)
    chord(native, "o")
    two = wait(
        lambda layout: (
            len(layout["contents"]) == 2
            and all(item["backend"] for item in layout["contents"])
        )
    )
    click(width - 40, 80)
    docked = wait(lambda layout: layout["context"]["kind"] == "vessel")
    context = docked["value"]["context"]
    fleet = original["fleets"][0]["id"]
    saved_root = two["value"]["voyages"][0]["fleets"][0]["root"]
    press("Fleet layouts")
    press("Save Fleet layout")
    field("Name", focused=True)
    for character in "Focus":
        key(ord(character))
    key(65293)
    wait(
        lambda layout: any(
            item["fleet"] == fleet and item["name"] == "Focus"
            for item in layout["savedLayouts"]
        )
    )
    press("Fleet layouts")
    click(350, 190)
    chord(native, "o")
    three = wait(
        lambda layout: (
            len(layout["contents"]) == 3
            and all(item["backend"] for item in layout["contents"])
        )
    )
    backends = {item["id"]: item["backend"] for item in three["value"]["contents"]}
    stopped_address = two["value"]["contents"][0]["backend"]
    processes = {
        address: rpc("terminal.get", {"terminal": address})["pid"]
        for address in backends.values()
        if address != stopped_address
    }
    assert all(processes.values())
    click(350, 190)
    for character in "exit":
        key(ord(character))
    key(65293)
    for _ in range(50):
        stopped = rpc("terminal.get", {"terminal": stopped_address})
        if stopped["state"] == "finished":
            break
        time.sleep(0.1)
    else:
        raise AssertionError("The selected shell did not finish")
    capture("layouts-stopped-terminal")
    terminals_before = ids()
    press("Fleet layouts")
    press("Load Focus")
    loaded = wait(
        lambda layout: layout["voyages"][0]["fleets"][0]["root"] == saved_root
    )
    assert {
        item["id"]: item["backend"] for item in loaded["value"]["contents"]
    } == backends
    assert len(loaded["value"]["voyages"][0]["fleets"][0]["vessels"]) == 3
    assert loaded["value"]["context"] == context and ids() == terminals_before
    assert {
        address: rpc("terminal.get", {"terminal": address})["pid"]
        for address in processes
    } == processes
    assert rpc("terminal.get", {"terminal": stopped_address})["state"] == "finished"
    capture("layouts-restored")
    saved = state()
    close()
    start_frame("layouts-reopened")
    assert state() == saved
    assert {
        address: rpc("terminal.get", {"terminal": address})["pid"]
        for address in processes
    } == processes
    assert rpc("terminal.get", {"terminal": stopped_address})["state"] == "finished"
    close()
    observe_exit()
    return [
        "saved-fleet-tree-with-finished-terminal",
        "restored-identity-and-context",
        "saved-layout-reopened",
        "native-quit",
    ]

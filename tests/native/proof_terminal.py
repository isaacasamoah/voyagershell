import hashlib
import json
import os
import re
import subprocess
import time
from pathlib import Path
from secrets import token_hex

from PIL import ImageChops

from proof_workspace import core_rpc, named_button

LEGACY_DIV_HEADER = "7da0b1f9fde04137d20867e64b35fcc1eedb7a5b9be0ba4002031f78320e0909"


def div_control_point(label, fleets, viewport, header_sha256):
    assert header_sha256 == LEGACY_DIV_HEADER, (
        "Measured Div controls require the inspected Header source"
    )
    assert viewport == (2900, 1880), (
        "Measured Div controls require the observed 2900x1880 X window"
    )
    assert 1 <= fleets <= 2, "Measured Fleet controls support this journey's scenes"
    if label == "Create Fleet":
        return 280 + 10 + fleets * (160 + 8) + 14, 52 + 45 / 2
    assert label == "Refresh", "No measured route exists for this Div control"
    return 280 + 12 + 23, viewport[1] / 2 - 6 - 38 / 2


def terminal(
    native,
    capture,
    geometry,
    close,
    evidence,
    session,
    env,
    portals=False,
    grid=False,
    reported=False,
):
    owner = json.loads((evidence / "launch.json").read_text())["pid"]
    socket = (
        Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
        if reported
        else None
    )
    owned = []

    def window_pid(window):
        return int(
            subprocess.check_output(
                ["xdotool", "getwindowpid", window], env=env, text=True
            ).strip()
        )

    def active():
        window = subprocess.check_output(
            ["xdotool", "getwindowfocus"], env=env, text=True
        ).strip()
        assert window_pid(window) == owner, "Candidate is not the active window"

    def rpc(method, params):
        if reported:
            assert socket.is_socket(), "The dedicated Core socket is absent"
        return core_rpc(session, env, method, params)

    def workspace_control(label):
        header = evidence / "profile/mods/header/main.js"
        digest = hashlib.sha256(header.read_bytes()).hexdigest()
        if digest != LEGACY_DIV_HEADER:
            click(*named_button(native, evidence, label))
            return
        layout = rpc("doc.get", {"name": "voyager-layout-v1"})["value"]
        assert layout.get("view", "fleet") == "fleet"
        assert layout["context"] == {"kind": "workspace"}
        assert len(layout["voyages"]) == 1
        fleets = layout["voyages"][0]["fleets"]
        bounds = geometry()
        viewport = tuple(int(bounds[key]) for key in ("WIDTH", "HEIGHT"))
        point = div_control_point(label, len(fleets), viewport, digest)
        path = evidence / "terminal-div-controls.json"
        targets = json.loads(path.read_text()) if path.exists() else []
        name = f"terminal-div-control-{len(targets) + 1}"
        frame = capture(name)
        assert frame.size == viewport, "Measured controls require X-window pixels"
        targets.append(
            dict(
                label=label,
                route="pinned-div",
                point=point,
                viewport=viewport,
                headerSha256=digest,
                fleets=[item["id"] for item in fleets],
                capture=name,
                reference=(
                    "native-01/terminal-output.png"
                    if label == "Create Fleet"
                    else "desktop/mods/header/main.ts:statusView"
                ),
            )
        )
        path.write_text(json.dumps(targets, indent=2))
        click(*point)

    def key(value):
        active()
        native("key", value, True)
        native("key", value, False)

    def click(x, y):
        bounds = geometry()
        subprocess.check_call(
            ["xdotool", "windowactivate", "--sync", bounds["WINDOW"]], env=env
        )
        native(
            "move", int(bounds["X"]) + round(x * 2), int(bounds["Y"]) + round(y * 2), 2
        )
        pointer = dict(
            line.split("=", 1)
            for line in subprocess.check_output(
                ["xdotool", "getmouselocation", "--shell"], env=env, text=True
            ).splitlines()
        )
        active()
        assert window_pid(pointer["WINDOW"]) == owner, (
            "Candidate is occluded at the pointer"
        )
        native("button", True)
        native("button", False)

    def type_text(value):
        for character in value:
            key(65293 if character == "\n" else ord(character))

    def wait_for(get, predicate, label):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            value = get()
            if predicate(value):
                return value
            time.sleep(0.1)
        raise AssertionError(f"Timed out waiting for {label}")

    closed = False
    composing = False
    primary_failure = None
    try:
        if reported:
            wait_for(socket.is_socket, bool, "the dedicated Core socket")
        document = wait_for(
            lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
            lambda value: (
                bool((value.get("value") or {}).get("contents", []))
                and bool(value["value"]["contents"][0].get("backend"))
            ),
            "bound terminal",
        )
        original_fleet_name = document["value"]["voyages"][0]["fleets"][0]["name"]
        address = document["value"]["contents"][0]["backend"]
        original = (
            wait_for(
                lambda: rpc("terminal.get", {"terminal": address}),
                lambda item: item["state"] == "live" and bool(item.get("pid")),
                "the actual live shell PID",
            )
            if reported
            else rpc("terminal.get", {"terminal": address})
        )
        assert original.get("pid"), "Terminal has no live process"
        if reported:
            from proof_terminal_agent import process_record

            observations = {"nativeWords": [], "quietSeconds": 0.3}

            def save():
                (evidence / "reported-status-observed.json").write_text(
                    json.dumps(observations, indent=2)
                )

            def record(pid, role):
                item = {"pid": pid, "role": role, **process_record(pid)}
                assert item["uid"] == os.getuid(), item
                if not any(
                    (old["pid"], old["start"]) == (pid, item["start"]) for old in owned
                ):
                    owned.append(item)
                observations["owned"] = owned
                save()
                return item

            def runtime():
                status = rpc("server.status", {})
                core = record(status["pid"], "core")
                for holder in status["holders"]:
                    assert (
                        record(holder["pid"], "holder")["executable"]
                        == core["executable"]
                    )
                connectors = []
                for path in Path("/proc").glob("[0-9]*"):
                    try:
                        fields = (
                            path.joinpath("stat").read_text().rsplit(") ", 1)[1].split()
                        )
                        if int(fields[1]) == owner:
                            item = process_record(int(path.name))
                            if item["argv"][1:] == ["connect", "--session", session]:
                                connectors.append(record(int(path.name), "connector"))
                    except (FileNotFoundError, ProcessLookupError):
                        pass
                assert (
                    len(connectors) == 1
                    and connectors[0]["executable"] == core["executable"]
                ), connectors
                return status

            def focus_terminal():
                items = wait_for(
                    lambda: [
                        item
                        for item in native("fields", owner, ["Terminal"], "window")[
                            "fields"
                        ]
                        if item["role"] == "terminal"
                    ],
                    lambda items: (
                        len(items) == 1
                        and items[0]["width"] > 0
                        and items[0]["height"] > 0
                    ),
                    "one visible native terminal",
                )
                item = items[0]
                observations["lastTerminalBounds"] = item
                save()
                click(
                    (item["x"] + item["width"] / 2) / 2,
                    (item["y"] + item["height"] / 2) / 2,
                )

            def output(target, label):
                suffix = token_hex(8)
                type_text(f"printf '{label}_%s\\n' {suffix}\n")
                return wait_for(
                    lambda: rpc("terminal.read", {"terminal": target}),
                    lambda item: f"{label}_{suffix}" in item["text"].splitlines(),
                    "constructed shell output beyond echo",
                )

            def visible(target, word, name):
                time.sleep(0.2)
                fields = native("fields", owner, [f"Reported: {word}"], "window")[
                    "fields"
                ]
                assert all(item["width"] > 0 and item["height"] > 0 for item in fields)
                capture(name)
                item = {
                    "target": target,
                    "expectedWord": word,
                    "fields": fields,
                    "capture": name,
                    "wordProof": "native-fields"
                    if fields
                    else "requires-compositor-review",
                }
                observations["nativeWords"].append(item)
                save()

            def report(word):
                type_text(
                    f"printf '\\033]7501;state={word}:app=voyager-proof\\033\\\\'\n"
                )
                value = wait_for(
                    lambda: rpc("terminal.get", {"terminal": address}),
                    lambda item: (
                        (item.get("status") or {}).get("state") == word
                        if word != "clear"
                        else item.get("status") is None and not item.get("records")
                    ),
                    f"literal {word} report",
                )
                assert value["reported"] is True
                return value

            record(owner, "app")
            first_runtime = runtime()
            first_core = next(item for item in owned if item["role"] == "core")
            original_identity = record(original["pid"], "original-shell")
            context = document["value"]["context"]
            assert not native("fields", owner, ["Message Voyager"], "window")[
                "fields"
            ], "Chat must remain closed"
            focus_terminal()
            observations["originalOutput"] = output(address, "ORIGINAL")
            workspace_control("Create Fleet")
            second_document = wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda item: (
                    len(item["value"]["contents"]) == 2
                    and bool(item["value"]["contents"][1].get("backend"))
                ),
                "one second Fleet shell binding",
            )
            sibling = second_document["value"]["contents"][1]["backend"]
            assert sibling != address and second_document["value"]["context"] == context
            second = wait_for(
                lambda: rpc("terminal.get", {"terminal": sibling}),
                lambda item: item["state"] == "live" and bool(item.get("pid")),
                "the second live shell",
            )
            second_identity = record(second["pid"], "nonreporting-shell")
            runtime()
            second_fleet_name = second_document["value"]["voyages"][0]["fleets"][1][
                "name"
            ]
            focus_terminal()
            observations["nonreportingOutput"] = output(sibling, "NONREPORTING")
            assert rpc("terminal.get", {"terminal": sibling})["reported"] is False
            visible(sibling, "unknown", "reported-nonreporting-output")
            quiet_before = rpc("terminal.read", {"terminal": sibling})
            time.sleep(observations["quietSeconds"])
            assert (
                rpc("terminal.read", {"terminal": sibling})["text"]
                == quiet_before["text"]
            )
            observations["nonreportingQuiet"] = rpc(
                "terminal.get", {"terminal": sibling}
            )
            assert observations["nonreportingQuiet"]["reported"] is False
            visible(sibling, "unknown", "reported-nonreporting-quiet")
            workspace_control(original_fleet_name)
            wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda item: (
                    item["value"]["selectedFleet"] == document["value"]["selectedFleet"]
                ),
                "the original Fleet selection",
            )
            focus_terminal()
            baseline = rpc("doc.get", {"name": "voyager-layout-v1"})
            observations["baseline"] = baseline
            for word in ("working", "blocked", "idle", "done", "error"):
                observations[word] = report(word)
                assert (
                    observations[word]["state"] == "live"
                    and observations[word]["pid"] == original_identity["pid"]
                )
                observations[word + "Output"] = output(address, "REPORTED")
                assert rpc("doc.get", {"name": "voyager-layout-v1"}) == baseline
                visible(address, word, "reported-" + word)
            cleared = report("clear")
            assert cleared["reported"] is True
            visible(address, "unknown", "reported-cleared")
            type_text(
                "printf '\\033]7501;state=working:id=child:app=voyager-proof\\033\\\\'\n"
            )
            observations["childOnly"] = wait_for(
                lambda: rpc("terminal.get", {"terminal": address}),
                lambda item: (
                    item.get("status") is None and "child" in item.get("records", {})
                ),
                "child-only report",
            )
            visible(address, "unknown", "reported-child-only")
            assert rpc("doc.get", {"name": "voyager-layout-v1"}) == baseline
            suffix = token_hex(8)
            type_text(
                f"(sleep 6; printf '\\033]7501;state=blocked:kind=question:app=voyager-proof\\033\\\\'; printf '\\nHIDDEN_%s\\n' {suffix}) &\nprintf 'READY_%s\\n' {suffix}\n"
            )
            wait_for(
                lambda: rpc("terminal.read", {"terminal": address}),
                lambda item: f"READY_{suffix}" in item["text"].splitlines(),
                "finite hidden report readiness",
            )
            workspace_control(second_fleet_name)
            hidden = wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda item: (
                    item["value"]["selectedFleet"] != baseline["value"]["selectedFleet"]
                ),
                "the nonreporting Fleet selection",
            )
            assert hidden["value"]["context"] == context
            assert rpc("terminal.get", {"terminal": address}).get("status") is None, (
                "Scheduled report arrived before hiding"
            )
            observations["hiddenReport"] = wait_for(
                lambda: rpc("terminal.get", {"terminal": address}),
                lambda item: (item.get("status") or {}).get("state") == "blocked",
                "actual hidden report",
            )
            wait_for(
                lambda: rpc("terminal.read", {"terminal": address}),
                lambda item: f"HIDDEN_{suffix}" in item["text"].splitlines(),
                "hidden constructed output",
            )
            assert rpc("doc.get", {"name": "voyager-layout-v1"}) == hidden
            visible(sibling, "unknown", "reported-hidden-sibling")
            workspace_control(original_fleet_name)
            wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda item: (
                    item["value"]["selectedFleet"] == baseline["value"]["selectedFleet"]
                ),
                "reveal original Fleet",
            )
            focus_terminal()
            visible(address, "blocked", "reported-revealed")
            for target, identity in (
                (address, original_identity),
                (sibling, second_identity),
            ):
                actual = rpc("terminal.get", {"terminal": target})
                assert actual["state"] == "live" and actual["pid"] == identity["pid"]
                assert process_record(actual["pid"]) == {
                    key: value
                    for key, value in identity.items()
                    if key not in ("pid", "role")
                }
            final = rpc("doc.get", {"name": "voyager-layout-v1"})
            assert final["value"]["context"] == context
            assert final["value"]["contents"] == baseline["value"]["contents"]
            final_runtime = runtime()
            assert final_runtime["core"]["id"] == first_runtime["core"]["id"]
            assert final_runtime["pid"] == first_runtime["pid"]
            final_core = process_record(final_runtime["pid"])
            assert all(
                final_core[key] == first_core[key]
                for key in ("uid", "start", "executable")
            )
            assert not native("fields", owner, ["Message Voyager"], "window")["fields"]
            observations["final"] = final
            observations["limit"] = (
                "Two Fleets, no simultaneous split labels or provider inspection; captures require independent word review when AX text is absent."
            )
            save()
            return [
                "literal-five-state-reports-and-native-captures",
                "nonreporting-clear-child-only-unknown-captures",
                "hidden-report-reveal-retains-two-programs-and-context",
                "product-quit-recorded-exits",
            ]
        if grid:
            assert env.get("XMODIFIERS") == "@im=ibus", (
                "Use candidate-local XMODIFIERS=@im=ibus for this input-method journey"
            )
            click(350, 190)

            def screen():
                return rpc("terminal.read", {"terminal": address})["text"]

            def size(marker):
                type_text(f"echo {marker}$(stty size | tr ' ' '-')\n")
                match = wait_for(
                    lambda: re.search(marker + r"(\d+)-(\d+)", screen()), bool, marker
                )
                return [int(match.group(1)), int(match.group(2))]

            before = size("GRIDBEFORE-")
            type_text(
                "printf '\\033[?1049h\\033[31m\\347\\225\\214\\033[0m GRIDMODE'; sleep 20\n"
            )
            wait_for(
                screen, lambda text: "界 GRIDMODE" in text, "alternate-screen Unicode"
            )
            capture("terminal-grid-alternate")
            bounds = geometry()
            window = json.loads((evidence / "launch.json").read_text())["window"]
            assert window_pid(window) == owner
            subprocess.run(
                [
                    "xdotool",
                    "windowsize",
                    window,
                    str(int(bounds["WIDTH"]) - 300),
                    str(int(bounds["HEIGHT"]) - 200),
                ],
                env=env,
                check=True,
            )
            time.sleep(0.8)
            capture("terminal-grid-resized")
            native("key", 65507, True)
            key(ord("c"))
            native("key", 65507, False)
            type_text("tput rmcup\n")
            after = size("GRIDAFTER-")
            assert before != after and after[0] < before[0] and after[1] < before[1], (
                before,
                after,
            )
            assert rpc("terminal.get", {"terminal": address})["pid"] == original["pid"]
            type_text(
                "printf '\\033[2J\\033[H\\033[44mCOPY\\316\\262\\347\\225\\214\\033[0m\\n'\n"
            )
            wait_for(
                screen,
                lambda text: "COPYβ界" in text.splitlines(),
                "copy source output",
            )
            time.sleep(0.3)
            frame = capture("terminal-copy-source")
            masks = [
                channel.point(lambda value, color=color: 255 if value == color else 0)
                for channel, color in zip(frame.split(), (0x97, 0xB3, 0xD6))
            ]
            box = ImageChops.multiply(
                ImageChops.multiply(masks[0], masks[1]), masks[2]
            ).getbbox()
            assert box is not None, "Native ANSI-blue copy source was not painted"
            bounds = geometry()
            selection_scale = (
                int(bounds["WIDTH"]) / frame.width,
                int(bounds["HEIGHT"]) / frame.height,
            )
            y = int(bounds["Y"]) + round((box[1] + box[3]) / 2 * selection_scale[1])
            active()
            native(
                "move",
                int(bounds["X"]) + round((box[0] + 1) * selection_scale[0]),
                y,
                2,
            )
            native("button", True)
            try:
                native(
                    "move",
                    int(bounds["X"]) + round((box[2] - 1) * selection_scale[0]),
                    y,
                    2,
                )
            finally:
                native("button", False)
            capture("terminal-selection")

            def clipboard_key(value):
                native("key", 65507, True)
                native("key", 65505, True)
                try:
                    key(ord(value))
                finally:
                    native("key", 65505, False)
                    native("key", 65507, False)

            clipboard_key("c")
            type_text("read -r copied; printf 'PASTE:%s\\n' \"$copied\"\n")
            clipboard_key("v")
            key(65293)
            wait_for(
                screen,
                lambda text: "PASTE:COPYβ界" in text.splitlines(),
                "native Unicode selection copied and pasted",
            )
            capture("terminal-native-copy-paste")
            type_text(
                "printf 'COMPOSE_%s\\n' READY; read -r composed; printf 'COMPOSE:%s\\n' \"$composed\"\n"
            )
            wait_for(
                screen,
                lambda text: "COMPOSE_READY" in text.splitlines(),
                "composition read command ready",
            )
            previous_screen = None

            def settled_screen():
                nonlocal previous_screen
                current = screen()
                settled = current == previous_screen
                previous_screen = current
                return current, settled

            before_composition = wait_for(
                settled_screen,
                lambda value: value[1],
                "stable ready composition screen",
            )[0]
            composing = True
            native("key", 65507, True)
            native("key", 65505, True)
            try:
                key(ord("u"))
            finally:
                native("key", 65505, False)
                native("key", 65507, False)
            type_text("00e9")
            time.sleep(0.2)
            capture("terminal-native-ibus-preedit")
            after_composition = screen()
            (evidence / "composition-observed.json").write_text(
                json.dumps(
                    {
                        "address": address,
                        "pid": original["pid"],
                        "before": before_composition,
                        "after": after_composition,
                        "unchanged": before_composition == after_composition,
                        "inputMethod": "IBus/XIM",
                    },
                    indent=2,
                )
            )
            assert after_composition == before_composition, (
                "Uncommitted composition reached the PTY"
            )
            key(65293)
            key(65293)
            wait_for(
                screen,
                lambda text: "COMPOSE:é" in text.splitlines(),
                "native IBus/XIM preedit and Unicode commit",
            )
            composing = False
            capture("terminal-native-ibus-committed")
            type_text(
                "(for n in $(seq 1 300); do printf 'HIDDEN-%04d\\n' \"$n\"; sleep .01; done; printf 'HIDDENDONE\\n') &\n"
            )
            wait_for(
                screen,
                lambda text: "HIDDEN-0001" in text.splitlines(),
                "background command executed before Fleet change",
            )
            click(367, 30)
            switched = wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: (
                    len(value["value"]["contents"]) == 2
                    and value["value"]["contents"][1].get("backend")
                ),
                "second Fleet terminal",
            )
            other = switched["value"]["contents"][1]["backend"]
            wait_for(
                lambda: rpc("terminal.get", {"terminal": other}),
                lambda value: (
                    value.get("pid")
                    and value["rows"] == after[0]
                    and value["cols"] == after[1]
                ),
                "new Fleet native viewport resized",
            )
            wait_for(
                lambda: rpc("terminal.read", {"terminal": other})["text"],
                lambda text: text.rstrip().endswith("$"),
                "new Fleet shell prompt ready",
            )
            capture("terminal-second-fleet-ready")
            click(350, 190)
            type_text("printf 'FOCUSED%s\\n' INPUT\n")
            wait_for(
                lambda: rpc("terminal.read", {"terminal": other})["text"],
                lambda text: "FOCUSEDINPUT" in text.splitlines(),
                "focused input while another Fleet outputs",
            )
            assert "FOCUSEDINPUT" not in screen().splitlines(), (
                "Other Fleet input reached the original terminal"
            )
            capture("terminal-focused-during-hidden-output")
            wait_for(
                screen,
                lambda text: "HIDDENDONE" in text.splitlines(),
                "hidden output completion",
            )
            click(275, 30)
            wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: (
                    value["value"]["selectedFleet"]
                    == document["value"]["selectedFleet"]
                ),
                "original Fleet restored",
            )
            time.sleep(0.3)
            capture("terminal-hidden-revealed")
            assert rpc("terminal.get", {"terminal": address})["pid"] == original["pid"]
            click(350, 190)
            type_text("printf 'REVEALED%s\\n' INPUT\n")
            wait_for(
                screen,
                lambda text: "REVEALEDINPUT" in text.splitlines(),
                "revealed terminal input",
            )
            capture("terminal-hidden-revealed-input")
            current = geometry()
            width, height = int(current["WIDTH"]) / 2, int(current["HEIGHT"]) / 2
            click(width - 30, height - 30)
            split = wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: (
                    len(value["value"]["contents"]) == 3
                    and value["value"]["contents"][2].get("backend")
                ),
                "split terminal bound",
            )
            sibling = split["value"]["contents"][2]["backend"]
            click(350, 190)
            split_size = size("GRIDSPLIT-")
            assert split_size[1] < after[1], (split_size, after)
            click(width - 180, 190)
            type_text("printf 'SPLIT%s\\n' INPUT\n")
            wait_for(
                lambda: rpc("terminal.read", {"terminal": sibling})["text"],
                lambda text: "SPLITINPUT" in text.splitlines(),
                "new split's focused input",
            )
            assert rpc("terminal.get", {"terminal": address})["pid"] == original["pid"]
            capture("terminal-real-split-grids")
            click(350, 190)
            type_text("timeout 6 yes flood; printf 'FLOOD_%s\\n' END\n")
            wait_for(
                screen, lambda text: "flood" in text.splitlines(), "active output flood"
            )
            flood_before = wait_for(
                lambda: rpc("terminal.get", {"terminal": address}),
                lambda value: (
                    (value.get("foreground") or {}).get("name") in {"timeout", "yes"}
                ),
                "foreground flood process",
            )
            click(width - 180, 190)
            type_text("printf 'DURING_%s\\n' FLOOD\n")
            wait_for(
                lambda: rpc("terminal.read", {"terminal": sibling})["text"],
                lambda text: "DURING_FLOOD" in text.splitlines(),
                "other split input during saturated output",
            )
            assert "FLOOD_END" not in screen().splitlines(), (
                "Other input waited until the bounded flood ended"
            )
            flood_during = (
                rpc("terminal.get", {"terminal": address}).get("foreground") or {}
            )
            assert flood_during.get("name") in {"timeout", "yes"}, (
                "Flood foreground process ended before the other split's input"
            )
            capture("terminal-focused-during-flood")
            wait_for(
                screen,
                lambda text: "FLOOD_END" in text.splitlines(),
                "bounded flood ended",
            )
            (evidence / "terminal-grid-observed.json").write_text(
                json.dumps(
                    {
                        "address": address,
                        "pid": original["pid"],
                        "before": before,
                        "after": after,
                        "other": other,
                        "selection": "COPYβ界",
                        "selectionImageSize": [frame.width, frame.height],
                        "selectionDeviceScale": selection_scale,
                        "hiddenOutput": screen(),
                        "splitSize": split_size,
                        "sibling": sibling,
                        "inputMethod": {
                            "name": "IBus/XIM",
                            "selector": env["XMODIFIERS"],
                        },
                        "floodBefore": flood_before.get("foreground"),
                        "floodDuring": flood_during,
                    },
                    indent=2,
                )
            )
            close()
            closed = True
            return [
                "real-shell-grid-resize",
                "alternate-screen-colored-unicode",
                "native-selection-copy-paste",
                "native-IBus-XIM-preedit-commit",
                "focused-input-during-hidden-output",
                "same-terminal-hidden-reveal-input",
                "real-split-grid-size-and-input",
                "focused-input-while-flood-process-active",
                "same-terminal-process",
                "native-quit",
            ]
        time.sleep(0.5)
        initial = capture("terminal-initial")
        click(350, 190)
        type_text("echo voyagerterminalready\n")
        output = wait_for(
            lambda: rpc("terminal.read", {"terminal": address}),
            lambda value: "voyagerterminalready" in value["text"].splitlines(),
            "shell output",
        )
        painted = capture("terminal-output")
        assert ImageChops.difference(initial, painted).getbbox(), (
            "Terminal output did not change visible pixels"
        )
        missing = evidence / "repaired-working-directory"
        assert not missing.exists()
        changed = document["value"]
        changed["contents"][0]["cwd"] = str(missing)
        external = rpc(
            "doc.set",
            {
                "name": "voyager-layout-v1",
                "version": document["version"],
                "value": changed,
            },
        )
        workspace_control("Create Fleet")
        time.sleep(0.4)
        assert (
            rpc("doc.get", {"name": "voyager-layout-v1"})["version"]
            == external["version"]
        )
        capture("terminal-stale-refused")
        workspace_control("Refresh")
        time.sleep(0.4)
        workspace_control("Create Fleet")
        rejected = wait_for(
            lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
            lambda value: (
                len(value["value"]["contents"]) == 2
                and value["version"] >= external["version"] + 3
                and value["value"]["contents"][1].get("backend") is None
                and value["value"]["contents"][1].get("startPending") is None
            ),
            "known terminal refusal",
        )
        capture("terminal-known-refusal")
        missing.mkdir()
        workspace_control("Refresh")
        recovered = wait_for(
            lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
            lambda value: value["value"]["contents"][1].get("backend") is not None,
            "terminal after explicit Refresh",
        )
        restored_address = recovered["value"]["contents"][1]["backend"]
        restored = rpc("terminal.get", {"terminal": restored_address})
        assert restored["pid"] and restored["address"] != address
        assert rpc("terminal.get", {"terminal": address})["pid"] == original["pid"]
        time.sleep(0.5)
        before_recovered_input = capture("terminal-recovered-before-input")
        click(350, 190)
        type_text("echo voyagerrecoveredterminal\n")
        recovered_output = wait_for(
            lambda: rpc("terminal.read", {"terminal": restored_address}),
            lambda value: "voyagerrecoveredterminal" in value["text"].splitlines(),
            "input and output in recovered terminal",
        )
        time.sleep(0.3)
        recovered_frame = capture("terminal-refusal-recovered")
        assert ImageChops.difference(
            before_recovered_input, recovered_frame
        ).getbbox(), "Recovered terminal input did not change visible pixels"
        click(*named_button(native, evidence, original_fleet_name))
        time.sleep(0.3)
        click(350, 190)
        type_text("exit\n")
        ended = wait_for(
            lambda: rpc("terminal.get", {"terminal": address}),
            lambda value: value.get("exit_code") is not None,
            "terminal exit",
        )
        capture("terminal-exited")
        assert ended["address"] == address and ended["exit_code"] == 0
        (evidence / "terminal-observed.json").write_text(
            json.dumps(
                {
                    "address": address,
                    "pid": original["pid"],
                    "output": output,
                    "exitCode": ended["exit_code"],
                    "layoutVersion": document["version"],
                    "refusedVersion": rejected["version"],
                    "recoveredAddress": restored_address,
                    "recoveredPid": restored["pid"],
                    "recoveredOutput": recovered_output,
                },
                indent=2,
            )
        )
        if portals:
            click(*named_button(native, evidence, "Open Portal"))
            layout = wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: (
                    bool(value["value"]["voyages"][0]["portals"])
                    and any(
                        content.get("backend")
                        for content in value["value"]["contents"][2:]
                    )
                ),
                "bound Voyage Portal",
            )["value"]
            portal = layout["voyages"][0]["portals"][0]
            content = next(
                item for item in layout["contents"] if item["id"] == portal["content"]
            )
            program = rpc("terminal.get", {"terminal": content["backend"]})
            width = int(geometry()["WIDTH"]) / 2
            time.sleep(0.5)
            click(width - 180, 190)
            type_text("echo voyagerportalready\n")
            wait_for(
                lambda: rpc("terminal.read", {"terminal": content["backend"]}),
                lambda value: "voyagerportalready" in value["text"].splitlines(),
                "visible Portal input and output",
            )
            capture("portal-terminal-output")
            click(width - 270, 132)
            time.sleep(0.1)
            click(width - 270, 132)
            time.sleep(0.2)
            native("key", 65507, True)
            key(ord("a"))
            native("key", 65507, False)
            key(65288)
            type_text("Live Portal")
            click(width - 180, 190)
            type_text("echo voyagerportalafterblur\n")
            renamed = wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: (
                    value["value"]["voyages"][0]["portals"][0].get("name")
                    == "Live Portal"
                ),
                "Portal name committed on terminal blur",
            )["value"]["voyages"][0]["portals"][0]
            assert (
                renamed["id"] == portal["id"]
                and renamed["content"] == portal["content"]
            )
            portal = renamed
            wait_for(
                lambda: rpc("terminal.read", {"terminal": content["backend"]}),
                lambda value: "voyagerportalafterblur" in value["text"].splitlines(),
                "terminal focus after rename blur",
            )
            capture("portal-terminal-name-blur-focus")
            click(*named_button(native, evidence, "Fleet 2"))
            switched = wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: (
                    value["value"]["selectedFleet"]
                    == layout["voyages"][0]["fleets"][1]["id"]
                ),
                "other Fleet with persistent Portal",
            )["value"]
            assert switched["voyages"][0]["portals"][0] == portal
            assert (
                next(
                    item
                    for item in switched["contents"]
                    if item["id"] == portal["content"]
                )
                == content
            )
            assert (
                rpc("terminal.get", {"terminal": content["backend"]})["pid"]
                == program["pid"]
            )
            click(width - 180, 190)
            type_text("echo voyagerportalretained\n")
            observed = wait_for(
                lambda: rpc("terminal.read", {"terminal": content["backend"]}),
                lambda value: "voyagerportalretained" in value["text"].splitlines(),
                "same Portal terminal after Fleet change",
            )
            capture("portal-terminal-retained")
            (evidence / "portal-terminal-observed.json").write_text(
                json.dumps(
                    {
                        "portal": portal,
                        "content": content,
                        "pid": program["pid"],
                        "output": observed,
                    },
                    indent=2,
                )
            )
            before_refusal = rpc("doc.get", {"name": "voyager-layout-v1"})
            missing.rmdir()
            workspace_control("Create Fleet")
            wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: (
                    len(value["value"]["voyages"][0]["fleets"]) == 3
                    and value["version"] >= before_refusal["version"] + 3
                ),
                "third Fleet with unresolved refusal",
            )
            source_path = evidence / "profile/mods/header/main.js"
            source_path.write_text(source_path.read_text() + "\n")
            time.sleep(1)
            capture("portal-terminal-refused-sibling")
            click(width - 180, 190)
            type_text("echo voyagerportalafterrefusal\n")
            wait_for(
                lambda: rpc("terminal.read", {"terminal": content["backend"]}),
                lambda value: "voyagerportalafterrefusal" in value["text"].splitlines(),
                "live Portal after refused sibling and view reload",
            )
            click(*named_button(native, evidence, "Fleet 2"))
            wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: (
                    value["value"]["selectedFleet"]
                    == layout["voyages"][0]["fleets"][1]["id"]
                ),
                "unrelated navigation after unresolved refusal",
            )
            capture("portal-terminal-refusal-navigation")
        close()
        closed = True
        return [
            "real-shell-input-output-exit",
            "known-refusal-explicit-refresh",
            "native-quit",
        ] + (
            [
                "real-Portal-input-output",
                "Portal-backend-and-view-retained-across-Fleets",
                "native-rename-blur-retains-terminal-focus",
                "refused-sibling-does-not-block-Portal-or-navigation",
            ]
            if portals
            else []
        )
    except BaseException as error:
        primary_failure = error
        observations = {}
        for name in ("address", "other", "sibling"):
            target = locals().get(name)
            if target:
                try:
                    observations[target] = {
                        "terminal": rpc("terminal.get", {"terminal": target}),
                        "screen": rpc("terminal.read", {"terminal": target}),
                    }
                except Exception as observation_error:
                    observations[target] = {"error": str(observation_error)}
        (evidence / "terminal-failure-observed.json").write_text(
            json.dumps(observations, indent=2)
        )
        (evidence / "terminal-primary-failure.json").write_text(
            json.dumps({"type": type(error).__name__, "message": str(error)}, indent=2)
        )
        raise
    finally:
        cleanup_failures = []
        if not closed and composing:
            try:
                key(65307)
                time.sleep(0.1)
            except Exception as error:
                cleanup_failures.append(
                    {
                        "action": "cancel-composition",
                        "type": type(error).__name__,
                        "message": str(error),
                    }
                )
        try:
            if not closed:
                close()
        except Exception as error:
            cleanup_failures.append(
                {
                    "action": "native-quit",
                    "type": type(error).__name__,
                    "message": str(error),
                }
            )
        try:
            if reported:
                from proof_session_quit import exit_observation

                def observed_exit():
                    value = exit_observation(owned, socket)
                    (evidence / "reported-status-exits.json").write_text(
                        json.dumps(value, indent=2)
                    )
                    return value

                wait_for(
                    observed_exit,
                    lambda item: item["complete"],
                    "recorded Quit exits and socket absence",
                )
            else:
                rpc("server.stop", {})
        except Exception as error:
            cleanup_failures.append(
                {
                    "action": "recorded-quit-exits" if reported else "owned-core-stop",
                    "type": type(error).__name__,
                    "message": str(error),
                }
            )
        if cleanup_failures:
            (evidence / "terminal-cleanup-failures.json").write_text(
                json.dumps(cleanup_failures, indent=2)
            )
            if primary_failure is None:
                raise RuntimeError(f"Owned terminal cleanup failed: {cleanup_failures}")

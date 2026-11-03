import json
import re
import subprocess
import time

from PIL import ImageChops

from proof_workspace import core_rpc, named_button


def terminal(
    native, capture, geometry, close, evidence, session, env, portals=False, grid=False
):
    owner = json.loads((evidence / "launch.json").read_text())["pid"]

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
        return core_rpc(session, env, method, params)

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
        document = wait_for(
            lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
            lambda value: (
                bool((value.get("value") or {}).get("contents", []))
                and bool(value["value"]["contents"][0].get("backend"))
            ),
            "bound terminal",
        )
        address = document["value"]["contents"][0]["backend"]
        original = rpc("terminal.get", {"terminal": address})
        assert original.get("pid"), "Terminal has no live process"
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
        bounds = geometry()
        height = int(bounds["HEIGHT"]) / 2
        click(367, 30)
        time.sleep(0.4)
        assert (
            rpc("doc.get", {"name": "voyager-layout-v1"})["version"]
            == external["version"]
        )
        capture("terminal-stale-refused")
        click(270, height - 30)
        time.sleep(0.4)
        click(367, 30)
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
        click(270, height - 30)
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
        click(*named_button(native, evidence, "Workbench"))
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
            click(70, height - 30)
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
            click(width - 270, 80)
            time.sleep(0.1)
            click(width - 270, 80)
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
            click(460, 30)
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
            rpc("server.stop", {})
        except Exception as error:
            cleanup_failures.append(
                {
                    "action": "owned-core-stop",
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

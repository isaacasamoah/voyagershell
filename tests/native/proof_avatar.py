import json
import select
import signal
import subprocess
import sys
import time
from pathlib import Path

from proof_workspace import chord
from proof_avatar_window import floating_windows as owned_floating_windows


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    stages = []
    launch = json.loads((evidence / "launch.json").read_text())
    recorder = None
    recorded_at = None
    control_observations = {}

    def record():
        nonlocal recorder
        metadata = json.loads((evidence / "avatar-initial-compositor.json").read_text())
        width, height = metadata["sourceDimensions"]
        left, top, crop_width, crop_height = metadata["streamCrop"]
        crop_width = width - left
        sink = subprocess.check_output(
            ["pactl", "get-default-sink"], env=env, text=True, timeout=5
        ).strip()
        command = [
            "gst-launch-1.0",
            "-q",
            "-e",
            "webmmux",
            "name=mux",
            "!",
            "filesink",
            f"location={evidence / 'avatar-motion.webm'}",
            "pipewiresrc",
            f"path={metadata['node']}",
            "!",
            "videoconvert",
            "!",
            f"video/x-raw,format=RGB,width={width},height={height}",
            "!",
            "videocrop",
            f"left={left}",
            f"top={top}",
            f"right={width - left - crop_width}",
            f"bottom={height - top - crop_height}",
            "!",
            "videorate",
            "!",
            "video/x-raw,framerate=30/1",
            "!",
            "videoconvert",
            "!",
            "vp8enc",
            "deadline=1",
            "cpu-used=8",
            "threads=2",
            "!",
            "queue",
            "!",
            "mux.",
            "pulsesrc",
            f"device={sink}.monitor",
            "!",
            "audioconvert",
            "!",
            "vorbisenc",
            "!",
            "queue",
            "!",
            "mux.",
        ]
        with (evidence / "avatar-video.log").open("w") as log:
            process = subprocess.Popen(
                command, env=env, stdout=log, stderr=subprocess.STDOUT
            )
            recorder = process
        (evidence / "avatar-video.json").write_text(
            json.dumps(
                {
                    "pid": process.pid,
                    "command": command,
                    "source": metadata,
                    "videoCrop": [left, top, crop_width, crop_height],
                    "audio": "actual default output monitor, not microphone or proof of audible speakers",
                },
                indent=2,
            )
        )
        return process

    def rpc(method, params):
        result = subprocess.run(
            ["hc", "connect", "--session", session],
            input=json.dumps(
                {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
            )
            + "\n",
            env=env,
            text=True,
            capture_output=True,
            check=True,
            timeout=5,
        )
        response = json.loads(result.stdout.splitlines()[-1])
        assert "result" in response, response
        return response["result"]

    def state():
        return rpc("doc.get", {"name": "voyager-layout-v1"})

    moves = []
    pointer_deliveries = []

    def move(x, y):
        bounds = geometry()
        requested = [
            int(bounds[axis]) + round(value * 2)
            for axis, value in zip(("X", "Y"), (x, y))
        ]
        injected = [round(value / 2) * 2 for value in requested]
        moves.append(
            {
                "position": [x, y],
                "bounds": bounds,
                "requestedRoot": requested,
                "injectedRoot": injected,
            }
        )
        (evidence / "pointer-geometry.json").write_text(json.dumps(moves, indent=2))
        moves[-1]["move"] = native("move", *injected, 2)["move"]
        (evidence / "pointer-geometry.json").write_text(json.dumps(moves, indent=2))

    def key(code):
        native("key", code, True)
        native("key", code, False)

    def pointer_position():
        values = dict(
            line.split("=", 1)
            for line in subprocess.check_output(
                ["xdotool", "getmouselocation", "--shell"],
                env=env,
                text=True,
                timeout=5,
            ).splitlines()
        )
        return {axis: int(values[axis]) for axis in ("X", "Y")}

    def commanded_pointer():
        return dict(zip(("X", "Y"), moves[-1]["injectedRoot"]))

    def delivered_pointer(expected, phase):
        observations = []
        delivered = False
        for _ in range(50):
            observations.append(pointer_position())
            delivered = (
                len(observations) >= 3
                and all(
                    abs(observations[-1][axis] - expected[axis]) <= 1
                    for axis in ("X", "Y")
                )
                and observations[-3:] == [observations[-1]] * 3
            )
            if delivered:
                break
            time.sleep(0.02)
        pointer_deliveries.append(
            {
                "phase": phase,
                "requested": expected,
                "observed": observations,
                "delivered": delivered,
            }
        )
        (evidence / "avatar-pointer-deliveries.json").write_text(
            json.dumps(pointer_deliveries, indent=2)
        )
        return observations[-1], delivered

    def drag(source, target, cancel=False, window=None):
        move(*source)
        expected_grab = commanded_pointer()
        grabbed, delivered = delivered_pointer(expected_grab, "grab")
        assert delivered, "Fixture did not deliver the requested grab point"
        before = geometry(window) if window is not None else None
        if window is not None:
            assert (
                int(before["X"])
                <= grabbed["X"]
                < int(before["X"]) + int(before["WIDTH"])
            )
            assert (
                int(before["Y"])
                <= grabbed["Y"]
                < int(before["Y"]) + int(before["HEIGHT"])
            )
            target = (
                target[0]
                + (grabbed["X"] - int(before["X"]) - int(before["WIDTH"]) / 2) / 2,
                target[1],
            )
        native("button", True)
        for step in range(1, 9):
            move(
                *(
                    source[axis] + (target[axis] - source[axis]) * step / 8
                    for axis in (0, 1)
                )
            )
        requested = commanded_pointer()
        released, valid = delivered_pointer(requested, "release")
        if window is not None:
            bounds = geometry()
            outside = not (
                int(bounds["X"])
                <= released["X"]
                < int(bounds["X"]) + int(bounds["WIDTH"])
                and int(bounds["Y"])
                <= released["Y"]
                < int(bounds["Y"]) + int(bounds["HEIGHT"])
            )
            valid = valid and outside
            (evidence / "avatar-final-pointer-delivery.json").write_text(
                json.dumps(
                    {
                        "requested": requested,
                        "observed": pointer_deliveries[-1]["observed"],
                        "workspace": bounds,
                        "outside": outside,
                    },
                    indent=2,
                )
            )
        if cancel or not valid:
            key(65307)
        native("button", False)
        assert valid, (
            f"Fixture did not deliver the final point: {requested}, observed {released}"
        )
        time.sleep(0.5)
        return {
            "before": before,
            "grabbed": grabbed,
            "released": released,
            "requested": requested,
        }

    def scope(kind):
        target_name = {
            "workspace": "Whole workspace dock",
            "voyage": "Voyage dock",
            "fleet": "Fleet dock",
            "vessel": "Vessel dock",
            "portal": "Portal dock",
        }[kind]
        for _ in range(50):
            current = state()
            if current["value"]["context"]["kind"] == kind and not floating_windows():
                controls = native(
                    "fields", launch["pid"], ["Voyager avatar", target_name], "window"
                )["fields"]
                (evidence / "avatar-readiness.json").write_text(
                    json.dumps({"kind": kind, "controls": controls}, indent=2)
                )
                avatars = [
                    item for item in controls if item["name"] == "Voyager avatar"
                ]
                targets = [item for item in controls if item["name"] == target_name]
                if (
                    len(avatars) == 1
                    and avatars[0]["width"] > 0
                    and avatars[0]["height"] > 0
                ):
                    x = avatars[0]["x"] + avatars[0]["width"] / 2
                    y = avatars[0]["y"] + avatars[0]["height"] / 2
                    viewport = geometry()
                    visible = 0 <= x <= int(viewport["WIDTH"]) and 0 <= y <= int(
                        viewport["HEIGHT"]
                    )
                    if visible and any(
                        item["width"] > 0
                        and item["height"] > 0
                        and item["x"] <= x <= item["x"] + item["width"]
                        and item["y"] <= y <= item["y"] + item["height"]
                        for item in targets
                    ):
                        return current
            time.sleep(0.1)
        raise AssertionError(f"Actual native docking did not reach {kind}: {current}")

    def floating_windows():
        return owned_floating_windows(launch, geometry, env)

    def floating_window():
        for _ in range(30):
            candidates = floating_windows()
            if len(candidates) == 1:
                return candidates[0]
            time.sleep(0.1)
        raise AssertionError(f"No unambiguous owned floating avatar: {candidates}")

    def focus_target(name, error):
        native("focus", launch["pid"], name, 0)
        for _ in range(30):
            controls = native("fields", launch["pid"], [name], "window")["fields"]
            if len(controls) == 1 and controls[0]["focused"]:
                return controls
            time.sleep(0.1)
        raise AssertionError(f"{error}: {controls}")

    def dock_key(name, kind):
        controls = focus_target(name, "Native dock target did not receive focus")
        (evidence / f"avatar-keyboard-focus-{kind}.json").write_text(
            json.dumps(controls, indent=2)
        )
        native("key", 65505, True)
        key(65293)
        native("key", 65505, False)
        return scope(kind)

    def control_point(name, button=False):
        controls = native("fields", launch["pid"], [name], "window")["fields"]
        control_observations[name] = controls
        (evidence / "avatar-control-points.json").write_text(
            json.dumps(control_observations, indent=2)
        )
        assert len(controls) == 1, f"No unique native control: {name}: {controls}"
        control = controls[0]
        if button:
            assert control["role"] in ("push button", "button"), controls
        assert control["width"] > 0 and control["height"] > 0, controls
        viewport = geometry()
        assert 0 <= control["x"] <= int(viewport["WIDTH"]) - control["width"], controls
        assert 0 <= control["y"] <= int(viewport["HEIGHT"]) - control["height"], (
            controls
        )
        return (
            (control["x"] + control["width"] / 2) / 2,
            (control["y"] + control["height"] / 2) / 2,
        )

    def click(x, y):
        move(x, y)
        expected = commanded_pointer()
        _, delivered = delivered_pointer(expected, "click")
        assert delivered, "Fixture click motion was not delivered"
        native("button", True)
        native("button", False)
        time.sleep(0.4)

    def restore(floating, expected):
        floating_bounds = geometry(floating)
        bounds = geometry()
        source = (
            (int(floating_bounds["X"]) - int(bounds["X"])) / 2 + 60,
            (int(floating_bounds["Y"]) - int(bounds["Y"])) / 2 + 60,
        )
        move(*source)
        expected_point = commanded_pointer()
        _, delivered = delivered_pointer(expected_point, "restore")
        assert delivered, "Fixture restore motion was not delivered"
        capture(f"avatar-before-restore-{len(moves)}", floating)
        native("button", True)
        native("button", False)
        time.sleep(0.5)
        assert floating_window() == floating, (
            "Restore replaced or removed the still-undocked avatar"
        )
        assert state() == expected, "Restore changed the explicit context"
        return source

    def occlusion(expected):
        bounds = geometry()
        helper = Path(__file__).with_name("proof_occlusion.py")
        command = ["/usr/bin/python3", str(helper), session + "-occluder"]
        process = subprocess.Popen(
            command,
            env={**env, "GDK_BACKEND": "x11"},
            stdout=subprocess.PIPE,
            text=True,
        )
        try:
            assert select.select([process.stdout], [], [], 5)[0], (
                "Owned occlusion window did not open"
            )
            window = process.stdout.readline().strip()
            assert (
                int(
                    subprocess.check_output(
                        ["xdotool", "getwindowpid", window],
                        env=env,
                        text=True,
                        timeout=5,
                    )
                )
                == process.pid
            )
            for action in [
                ["windowsize", window, bounds["WIDTH"], bounds["HEIGHT"]],
                ["windowmove", window, bounds["X"], bounds["Y"]],
                ["windowraise", window],
            ]:
                subprocess.run(["xdotool", *action], env=env, check=True, timeout=5)
            time.sleep(0.8)
            capture("avatar-fully-occluded")
            assert not floating_windows(), "Mere occlusion created a floating avatar"
            assert state() == expected, "Mere occlusion changed context"
            (evidence / "occlusion-window.json").write_text(
                json.dumps(
                    {
                        "pid": process.pid,
                        "command": command,
                        "window": window,
                        "bounds": bounds,
                    },
                    indent=2,
                )
            )
            subprocess.run(
                ["xdotool", "windowminimize", launch["window"]],
                env=env,
                check=True,
                timeout=5,
            )
            floating = floating_window()
            assert state() == expected, "Minimise while occluded changed context"
            capture("avatar-minimized-while-occluded", floating)
        finally:
            if process.poll() is None:
                process.terminate()
            assert process.wait(timeout=5) in (0, -signal.SIGTERM)
            subprocess.run(
                ["xdotool", "windowactivate", "--sync", launch["window"]],
                env=env,
                check=True,
                timeout=5,
            )

    def reveal_hidden_vessel():
        before = state()["value"]
        voyage = next(
            item for item in before["voyages"] if item["id"] == before["selectedVoyage"]
        )
        fleet = next(
            item for item in voyage["fleets"] if item["id"] == before["selectedFleet"]
        )
        saved_root = fleet["root"]

        def original_fleet(layout):
            current = next(
                item for item in layout["voyages"] if item["id"] == voyage["id"]
            )
            return next(item for item in current["fleets"] if item["id"] == fleet["id"])

        assert len(fleet["vessels"]) == 1, (
            "Reveal journey requires its initial one-Vessel Fleet"
        )
        click(*control_point("Fleet layouts", button=True))
        click(*control_point("Save Fleet layout", button=True))
        for _ in range(50):
            names = native("fields", launch["pid"], ["Name"], "window")["fields"]
            if len(names) == 1 and names[0]["focused"]:
                break
            time.sleep(0.1)
        else:
            raise AssertionError(f"Layout name did not receive focus: {names}")
        for character in "avatar":
            key(ord(character))
        key(65293)
        for _ in range(50):
            saved = state()["value"]
            if any(
                item["fleet"] == fleet["id"] and item["name"] == "avatar"
                for item in saved["savedLayouts"]
            ):
                break
            time.sleep(0.1)
        else:
            raise AssertionError("Saved layout was not recorded")
        focus_target("Vessel dock", "Vessel dock did not receive focus")
        chord(native, "o")
        for _ in range(100):
            split = state()["value"]
            current_fleet = original_fleet(split)
            if len(current_fleet["vessels"]) == 2:
                vessel = current_fleet["vessels"][1]
                content = next(
                    item
                    for item in split["contents"]
                    if item["id"] == vessel["content"]
                )
                if content.get("backend"):
                    break
            time.sleep(0.1)
        else:
            raise AssertionError("Second Vessel did not receive its backend")
        bounds = geometry()
        for _ in range(50):
            fields = native("fields", launch["pid"], ["Vessel dock"], "window")[
                "fields"
            ]
            if len(fields) == 2 and all(
                item["width"] > 0
                and item["height"] > 0
                and 0 <= item["x"] <= int(bounds["WIDTH"]) - item["width"]
                and 0 <= item["y"] <= int(bounds["HEIGHT"]) - item["height"]
                for item in fields
            ):
                break
            time.sleep(0.1)
        else:
            raise AssertionError(f"Expected two bounded real Vessel targets: {fields}")
        right = max(fields, key=lambda item: item["x"] + item["width"] / 2)
        left = min(fields, key=lambda item: item["x"] + item["width"] / 2)
        assert right["x"] > left["x"], fields
        assert right["width"] > 0 and right["height"] > 0, fields
        assert 0 <= right["x"] <= int(bounds["WIDTH"]) - right["width"], fields
        assert 0 <= right["y"] <= int(bounds["HEIGHT"]) - right["height"], fields
        (evidence / "avatar-reveal-targets.json").write_text(
            json.dumps(fields, indent=2)
        )
        point = (
            (right["x"] + right["width"] / 2) / 2,
            (right["y"] + right["height"] / 2) / 2,
        )
        drag(control_point("Voyager avatar"), point)
        focused = scope("vessel")["value"]
        assert focused["context"]["id"] == vessel["id"]
        process_before = rpc("terminal.get", {"terminal": content["backend"]})
        assert process_before["state"] == "live" and process_before["pid"]
        pid = process_before["pid"]
        process_start = (
            Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()[19]
        )
        if not native("fields", launch["pid"], ["Load avatar"], "window")["fields"]:
            click(*control_point("Fleet layouts", button=True))
        click(*control_point("Load avatar", button=True))
        for _ in range(50):
            loaded = state()["value"]
            current_fleet = original_fleet(loaded)
            if current_fleet["root"] == saved_root:
                break
            time.sleep(0.1)
        else:
            raise AssertionError("Saved Fleet tree was not loaded")
        assert loaded["context"] == focused["context"]
        assert (
            next(item for item in loaded["contents"] if item["id"] == content["id"])
            == content
        )
        capture("avatar-hidden-vessel")
        click(*control_point("Go there", button=True))
        for _ in range(50):
            revealed = state()["value"]
            current_fleet = original_fleet(revealed)
            root = current_fleet["root"]
            if (
                root.get("kind") == "branch"
                and root.get("first") == saved_root
                and root.get("second", {}).get("placement") == vessel["id"]
            ):
                break
            time.sleep(0.1)
        else:
            raise AssertionError("Go there did not reveal the original Vessel")
        assert (
            revealed["selectedVoyage"] == voyage["id"]
            and revealed["selectedFleet"] == fleet["id"]
        )
        assert revealed["context"] == focused["context"]
        assert (
            next(
                item for item in current_fleet["vessels"] if item["id"] == vessel["id"]
            )
            == vessel
        )
        assert (
            next(item for item in revealed["contents"] if item["id"] == content["id"])
            == content
        )
        process_after = rpc("terminal.get", {"terminal": content["backend"]})
        assert process_after["state"] == "live" and process_after["pid"] == pid
        assert (
            Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()[19]
            == process_start
        )
        (evidence / "avatar-reveal-identity.json").write_text(
            json.dumps(
                {
                    "vessel": vessel,
                    "content": content,
                    "pid": pid,
                    "start": process_start,
                    "before": process_before,
                    "after": process_after,
                },
                indent=2,
            )
        )
        capture("avatar-revealed-vessel")
        stages.append("hidden-vessel-go-there-retained-backend-and-context")

    def portal_journey():
        click(*control_point("Open Portal", button=True))
        created = state()
        original_voyage = created["value"]["voyages"][0]
        assert len(original_voyage["portals"]) == 1
        portal = original_voyage["portals"][0]
        drag(control_point("Voyager avatar"), control_point("Portal dock"))
        focused_portal = scope("portal")
        assert focused_portal["value"]["context"]["id"] == portal["id"]
        capture("avatar-real-portal")
        fields = focus_target("Fleet dock", "Fleet dock did not receive focus")
        (evidence / "avatar-create-fleet-focus.json").write_text(
            json.dumps(fields, indent=2)
        )
        chord(native, "t")
        time.sleep(0.4)
        another_fleet = state()
        assert (
            another_fleet["value"]["selectedFleet"]
            != focused_portal["value"]["selectedFleet"]
        )
        assert another_fleet["value"]["context"] == focused_portal["value"]["context"]
        assert another_fleet["value"]["voyages"][0]["portals"][0] == portal
        capture("avatar-portal-across-fleets")
        click(*control_point("+ Voyage", button=True))
        hidden = state()
        assert hidden["value"]["selectedVoyage"] != original_voyage["id"]
        assert hidden["value"]["context"] == focused_portal["value"]["context"]
        assert not native("fields", launch["pid"], ["Portal dock"])["fields"], (
            "Hidden Portal retained a target"
        )
        capture("avatar-portal-out-of-view")
        click(*control_point("Go there", button=True))
        revealed = state()
        assert revealed["value"]["selectedVoyage"] == original_voyage["id"]
        assert revealed["value"]["context"] == focused_portal["value"]["context"]
        assert revealed["value"]["voyages"][0]["portals"][0] == portal
        capture("avatar-portal-go-there")
        stages.append("genuine-voyage-portal-dock-navigation-and-go-there")

    try:
        time.sleep(1)
        if journey == "avatar-prepared":
            (evidence / "avatar-preparation.json").write_text(
                json.dumps({"owner": state(), "floating": floating_windows()}, indent=2)
            )
            dock_key("Whole workspace dock", "workspace")
            stages.append("explicit-native-workspace-dock-preparation")
        initial = scope("workspace")
        frame = capture("avatar-initial")
        metadata = json.loads((evidence / "avatar-initial-compositor.json").read_text())
        assert metadata["deviceScale"] == 2, (
            "Avatar capture must use its declared scale"
        )
        assert frame.size == (1450, 940), "Avatar journey requires the matched viewport"
        bounds = geometry()
        assert (
            int(bounds["WIDTH"]) == frame.width * 2
            and int(bounds["HEIGHT"]) == frame.height * 2
        ), "Actual window and compositor coordinates are not in the required 2:1 ratio"
        recorded_at = time.monotonic()
        recorder = record()
        names = [
            "Voyager avatar",
            "Whole workspace dock",
            "Voyage dock",
            "Fleet dock",
            "Vessel dock",
            "Voyager. Let's Go Together.",
        ]
        for _ in range(30):
            controls = native("fields", launch["pid"], names, "window")["fields"]
            if {item["name"] for item in controls} == set(names):
                break
            time.sleep(0.1)
        (evidence / "avatar-accessibility.json").write_text(
            json.dumps(controls, indent=2)
        )
        assert {item["name"] for item in controls} == set(names), (
            "Named native avatar controls are missing"
        )
        assert all(item["width"] > 0 and item["height"] > 0 for item in controls)
        viewport = geometry()
        assert all(
            0 <= item["x"] <= int(viewport["WIDTH"]) - item["width"]
            and 0 <= item["y"] <= int(viewport["HEIGHT"]) - item["height"]
            for item in controls
        ), "Native avatar controls extend outside the workspace viewport"
        dock_key("Voyage dock", "voyage")
        dock_key("Whole workspace dock", "workspace")
        capture("avatar-keyboard-dock")
        stages.append("native-accessibility-and-focused-keyboard-docking")
        if journey == "portal-avatar":
            portal_journey()
            return stages
        drag(control_point("Voyager avatar"), control_point("Voyage dock"))
        voyage = scope("voyage")
        capture("avatar-voyage")
        stages.append("native-workspace-to-voyage")
        drag(control_point("Voyager avatar"), control_point("Fleet dock"))
        fleet = scope("fleet")
        capture("avatar-fleet")
        stages.append("native-voyage-to-fleet")
        drag(control_point("Voyager avatar"), control_point("Vessel dock"))
        vessel = scope("vessel")
        capture("avatar-vessel")
        stages.append("native-fleet-to-vessel")
        drag(control_point("Voyager avatar"), (2.5, control_point("Voyage dock")[1]))
        assert state() == vessel, "Invisible left margin accepted an avatar drop"
        capture("avatar-invalid-drop")
        stages.append("invalid-drop-kept-exact-layout")
        drag(control_point("Voyager avatar"), control_point("Voyage dock"), cancel=True)
        assert state() == vessel, "Escape cancellation changed the layout"
        capture("avatar-escape-cancel")
        stages.append("escape-kept-exact-layout")
        key(32)
        floating = floating_window()
        capture("avatar-floating", floating)
        assert state() == vessel, "Floating changed the explicit owner context"
        stages.append("keyboard-activation-floated-same-context")
        source = restore(floating, vessel)
        capture("avatar-workspace-restored")
        stages.append("restore-retained-floating-window-and-context")
        drag(source, control_point("Whole workspace dock"))
        capture("avatar-cross-window-release")
        workspace = scope("workspace")
        stages.append("floating-to-workspace-dock")
        occlusion(workspace)
        capture("avatar-after-occlusion")
        workspace = dock_key("Whole workspace dock", "workspace")
        assert not floating_windows(), "Dock after occluded minimise retained a float"
        stages.append("occlusion-did-not-float-and-later-minimize-did")
        geometry()
        subprocess.run(
            ["xdotool", "windowminimize", launch["window"]],
            env=env,
            check=True,
            timeout=5,
        )
        floating = floating_window()
        assert state() == workspace, "OS minimise changed context"
        capture("avatar-os-minimized", floating)
        geometry(floating)
        subprocess.run(
            ["xdotool", "windowquit", floating], env=env, check=True, timeout=5
        )
        time.sleep(0.3)
        assert floating_window() == floating, "Native close removed the undocked avatar"
        assert state() == workspace, "Floating close changed context"
        (evidence / "avatar-unproved.json").write_text(
            json.dumps(
                {
                    "popupCloseDelivery": "Graceful request issued; callback delivery is unproved."
                },
                indent=2,
            )
        )
        source = restore(floating, workspace)
        before_close = subprocess.check_output(
            ["xprop", "-id", launch["window"], "WM_STATE"],
            env=env,
            text=True,
            timeout=5,
        )
        assert "Normal" in before_close, (
            "Restored workspace is not a normal visible window"
        )
        subprocess.run(
            ["xdotool", "windowquit", launch["window"]],
            env=env,
            check=True,
            timeout=5,
        )
        for _ in range(50):
            wm_state = subprocess.check_output(
                ["xprop", "-id", launch["window"], "WM_STATE"],
                env=env,
                text=True,
                timeout=5,
            )
            if "Iconic" in wm_state:
                break
            time.sleep(0.1)
        else:
            raise AssertionError(
                "Graceful workspace close did not minimize its native window"
            )
        assert floating_window() == floating, (
            "Workspace close replaced the floating avatar"
        )
        assert state() == workspace, "Workspace close changed context"
        (evidence / "avatar-close-protocol.json").write_text(
            json.dumps(
                {"before": before_close, "after": wm_state, "popup": floating}, indent=2
            )
        )
        source = restore(floating, workspace)
        stages.append("native-graceful-workspace-close-kept-popup-and-context")
        stages.append("actual-os-minimize-and-same-controller-restore")
        capture("avatar-desktop-source", floating)
        monitor = json.loads(
            (evidence / "avatar-desktop-source-compositor.json").read_text()
        )
        bounds, popup = geometry(), geometry(floating)
        monitor_right = (
            monitor["monitorLogicalBounds"][0] + monitor["monitorLogicalBounds"][2]
        ) * monitor["deviceScale"]
        left = int(bounds["X"]) + int(bounds["WIDTH"])
        right = monitor_right - int(popup["WIDTH"])
        assert left < right, "No free desktop corridor for the complete popup"
        destination = (
            ((left + right) / 2 + int(popup["WIDTH"]) / 2 - int(bounds["X"])) / 2,
            80,
        )
        movement = drag(source, destination, window=floating)
        before_move = movement["before"]
        moved = floating_window()
        assert moved == floating, "Desktop motion replaced the travelling view"
        after_move = geometry(moved)
        workspace_bounds = geometry()
        expected = {
            axis: int(before_move[axis])
            + movement["released"][axis]
            - movement["grabbed"][axis]
            for axis in ("X", "Y")
        }
        (evidence / "avatar-desktop-geometry.json").write_text(
            json.dumps(
                {
                    "window": floating,
                    "before": before_move,
                    "after": after_move,
                    "expected": expected,
                    "pointer": movement,
                    "requestedDestination": destination,
                    "workspace": workspace_bounds,
                },
                indent=2,
            )
        )
        assert all(
            int(after_move[axis]) == value for axis, value in expected.items()
        ), (
            f"Native floating window did not reach the released point: {after_move}, expected {expected}"
        )
        assert any(
            int(before_move[axis]) != int(after_move[axis]) for axis in ("X", "Y")
        ), "Native floating window never moved"
        assert int(after_move["X"]) >= int(workspace_bounds["X"]) + int(
            workspace_bounds["WIDTH"]
        ), "Floating window did not move wholly outside the workspace"
        assert state() == workspace, "Desktop move changed context"
        capture("avatar-desktop-moved", moved)
        source = restore(moved, workspace)
        drag(source, control_point("Whole workspace dock"))
        scope("workspace")
        assert not floating_windows(), "Dock retained a floating view"
        stages.append("native-desktop-release-moved-and-docked-one-controller")
        native("key", 65513, True)
        key(65473)
        native("key", 65513, False)
        floating = floating_window()
        closed = state()
        capture("avatar-os-close-floated", floating)
        restore(floating, closed)
        dock_key("Whole workspace dock", "workspace")
        assert not floating_windows(), "Dock after close retained a floating view"
        stages.append("native-window-close-floated-and-restored")
        reveal_hidden_vessel()
        portal_journey()
        time.sleep(max(0, 45 - (time.monotonic() - recorded_at)))
        (evidence / "avatar-owner-states.json").write_text(
            json.dumps(
                {
                    "initial": initial,
                    "voyage": voyage,
                    "fleet": fleet,
                    "vessel": vessel,
                },
                indent=2,
            )
        )
        return stages
    finally:
        failure = sys.exc_info()[1]
        errors = []
        try:
            (evidence / "avatar-stages.json").write_text(json.dumps(stages, indent=2))
        except Exception as error:
            errors.append(f"Stage receipt: {error}")
        try:
            if recorder is not None:
                if recorder.poll() is None:
                    recorder.send_signal(signal.SIGINT)
                try:
                    result = recorder.wait(timeout=10)
                except subprocess.TimeoutExpired as error:
                    recorder.kill()
                    recorder.wait(timeout=5)
                    raise AssertionError(
                        "Owned avatar recorder timed out and was reaped"
                    ) from error
                (evidence / "avatar-video-exit.json").write_text(
                    json.dumps(
                        {
                            "exitCode": result,
                            "elapsedSeconds": time.monotonic() - recorded_at,
                        },
                        indent=2,
                    )
                )
                assert result == 0, f"Avatar recording failed: {result}"
        except Exception as error:
            errors.append(f"Recorder: {error}")
        try:
            close()
        except Exception as error:
            errors.append(f"Native close: {error}")
        try:
            socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
            if socket.is_socket():
                rpc("server.stop", {})
        except Exception as error:
            errors.append(f"Dedicated Core stop: {error}")
        if errors:
            if failure is not None:
                failure.add_note("Cleanup errors: " + "; ".join(errors))
            else:
                raise AssertionError("Cleanup errors: " + "; ".join(errors))

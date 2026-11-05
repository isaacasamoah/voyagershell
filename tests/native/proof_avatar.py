import json
import select
import signal
import subprocess
import sys
import time
from pathlib import Path

from proof_workspace import chord, core_rpc, named_button
from proof_avatar_window import floating_windows as owned_floating_windows
from proof_foundation_notes import wait
from proof_process import process_identity


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
        return core_rpc(session, env, method, params)

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
            "workspace": "Overwatch dock",
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

    def click(x, y, code=272):
        move(x, y)
        expected = commanded_pointer()
        _, delivered = delivered_pointer(expected, "click")
        assert delivered, "Fixture click motion was not delivered"
        native("button", True, code)
        native("button", False, code)
        time.sleep(0.4)

    def press(name):
        click(*named_button(native, evidence, name))

    def menu(name, action):
        click(*control_point(name, button=True), code=273)
        wait(
            lambda: native("fields", launch["pid"], [action], "window")["fields"],
            lambda items: (
                len(items) == 1 and items[0]["role"] in ("menu item", "menu_item")
            ),
            action,
        )
        click(*control_point(action))

    def floating_point(floating):
        floating_bounds = geometry(floating)
        bounds = geometry()
        return (
            (int(floating_bounds["X"]) - int(bounds["X"])) / 2 + 60,
            (int(floating_bounds["Y"]) - int(bounds["Y"])) / 2 + 60,
        )

    def restore(floating, expected, original=None):
        bounds = original or geometry()
        source = floating_point(floating)
        move(*source)
        expected_point = commanded_pointer()
        _, delivered = delivered_pointer(expected_point, "restore")
        assert delivered, "Fixture restore motion was not delivered"
        capture(f"avatar-before-restore-{len(moves)}", floating)
        native("button", True)
        native("button", False)
        wait(
            floating_windows,
            lambda items: not items,
            "restore returned avatar to its dock",
        )
        restored = geometry()
        assert all(
            restored[key] == bounds[key] for key in ("X", "Y", "WIDTH", "HEIGHT")
        ), ("Restore changed original workspace bounds", bounds, restored)
        assert state() == expected, "Restore changed the explicit context"
        return control_point("Voyager avatar")

    def hide_avatar(keyboard=False):
        bounds = geometry()
        anchor = control_point("Voyager avatar")
        if keyboard:
            focus_target("Voyager avatar", "Avatar did not receive keyboard focus")
            key(32)
        else:
            click(*anchor)
        floating = floating_window()
        popup = geometry(floating)
        assert all(
            abs(
                int(popup[axis])
                + int(popup[extent]) / 2
                - int(bounds[axis])
                - point * 2
            )
            <= 2
            for axis, extent, point in zip(("X", "Y"), ("WIDTH", "HEIGHT"), anchor)
        ), ("Hide moved the avatar screen anchor", bounds, anchor, popup)
        return floating, bounds

    def float_over_workspace():
        floating, _ = hide_avatar()
        subprocess.run(
            ["xdotool", "windowactivate", "--sync", launch["window"]],
            env=env,
            check=True,
            timeout=5,
        )
        assert floating_windows() == [floating], "OS restore lost the deliberate float"
        return floating, floating_point(floating)

    def voice_isolation(expected):
        def controls():
            return native(
                "fields", launch["pid"], ["Start voice", "Stop voice"], "window"
            )["fields"]

        voice_path = Path(env.get("VOYAGER_VOICE_EVIDENCE", evidence / "voice.json"))

        def voice():
            return json.loads(voice_path.read_text()) if voice_path.exists() else None

        before_voice = wait(
            voice,
            lambda item: item and item["capability"]["kind"] != "checking",
            "actual voice capability evidence",
        )
        assert before_voice["phase"] in ("off", "failed"), before_voice
        before = controls()
        assert len(before) == 1 and before[0]["name"] == "Start voice", before
        generation = int(before_voice["generation"])
        disabled = before_voice["capability"]["kind"] == "unavailable"
        voice_result = {
            "surface": "full-size-docked",
            "input": "mouse",
            "before": before,
            "voiceBefore": before_voice,
            "isolationProved": False,
            "activationProved": False,
            "audibleSpeechProved": False,
            "unprovedCases": [
                "full-size-docked keyboard enabled and disabled",
                "compact mouse and keyboard enabled and disabled",
                "floating mouse and keyboard enabled and disabled",
                "full-size-docked mouse " + ("enabled" if disabled else "disabled"),
            ],
        }
        voice_file = evidence / "avatar-voice-isolation.json"
        failure = None
        try:
            click(*control_point("Start voice", button=True))
            if disabled:
                deadline = time.monotonic() + 1
                while time.monotonic() < deadline:
                    current = voice()
                    assert current["capability"]["kind"] == "unavailable", current
                    assert int(current["generation"]) == generation, current
                    assert current["phase"] == before_voice["phase"], current
                    assert not floating_windows() and state() == expected
                    time.sleep(0.1)
                result = "verified-disabled-click"
            else:
                wait(
                    voice,
                    lambda item: int(item["generation"]) > generation,
                    "observed voice start generation after click",
                    seconds=30,
                )
                current = wait(
                    voice,
                    lambda item: (
                        item["phase"] in ("active", "off", "failed", "unconfirmed")
                    ),
                    "trial voice start settled or reported provider failure",
                    seconds=30,
                )
                assert int(current["generation"]) == generation + 1, current
                result = "observed-transition-" + current["phase"]
                voice_result["activationProved"] = current["phase"] == "active"
            voice_result.update(result=result, after=controls(), voiceAfter=voice())
            assert not floating_windows() and state() == expected
            assert "Normal" in subprocess.check_output(
                ["xprop", "-id", launch["window"], "WM_STATE"],
                env=env,
                text=True,
                timeout=5,
            )
            capture("avatar-voice-click-isolated")
            voice_result["isolationProved"] = True
        except BaseException as error:
            failure = error
            raise
        finally:
            try:
                current = voice()
                if current and int(current["generation"]) == generation + 1:
                    if current["phase"] in ("preparing", "negotiating"):
                        current = wait(
                            voice,
                            lambda item: (
                                item["phase"] not in ("preparing", "negotiating")
                            ),
                            "settle only the trial voice generation before cleanup",
                            seconds=30,
                        )
                    assert int(current["generation"]) == generation + 1, current
                    if current["phase"] == "active":
                        click(*control_point("Stop voice", button=True))
                        current = wait(
                            voice,
                            lambda item: (
                                item["phase"] in ("off", "failed", "unconfirmed")
                            ),
                            "stop only the trial's activated voice lease",
                        )
                    assert int(current["generation"]) == generation + 1, current
                    assert current["phase"] in ("off", "failed"), current
                assert not floating_windows() and state() == expected
                voice_result["final"] = controls()
            except BaseException as error:
                voice_result["cleanupError"] = str(error)
                if failure is not None:
                    failure.add_note("Trial voice cleanup: " + str(error))
                else:
                    raise
            finally:
                voice_result["voiceFinal"] = voice()
                voice_file.write_text(json.dumps(voice_result, indent=2))
        stages.append("full-size-mouse-soundwave-isolation-" + result)

    def desktop_switch(expected):
        def desktop(*arguments):
            return subprocess.check_output(
                ["xdotool", *arguments],
                env=env,
                text=True,
                timeout=5,
            ).strip()

        original = desktop("get_desktop")
        count = int(desktop("get_num_desktops"))
        if count < 2:
            (evidence / "avatar-desktop-switch.json").write_text(
                json.dumps({"original": original, "available": count, "proved": False})
            )
            raise AssertionError(
                "Actual desktop roundtrip requires two existing desktops"
            )
        destination = "1" if original == "0" else "0"
        bounds = geometry()
        try:
            desktop("set_desktop", destination)
            wait(
                lambda: desktop("get_desktop"),
                lambda value: value == destination,
                "desktop switch",
            )
            time.sleep(0.5)
            assert not floating_windows() and state() == expected, (
                "Desktop switching floated or changed context"
            )
        finally:
            desktop("set_desktop", original)
            wait(
                lambda: desktop("get_desktop"),
                lambda value: value == original,
                "original desktop restored",
            )
        assert not floating_windows() and state() == expected
        assert geometry() == bounds, "Desktop switching moved the workspace"
        assert "Normal" in subprocess.check_output(
            ["xprop", "-id", launch["window"], "WM_STATE"],
            env=env,
            text=True,
            timeout=5,
        ), "Desktop switching minimized the workspace"
        (evidence / "avatar-desktop-switch.json").write_text(
            json.dumps(
                {
                    "original": original,
                    "destination": destination,
                    "bounds": bounds,
                    "proved": True,
                },
                indent=2,
            )
        )
        capture("avatar-after-desktop-switch")
        stages.append("actual-desktop-roundtrip-kept-dock-window-and-context")

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
        menu(fleet["name"], "Save layout")
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
                item["owner"] == {"kind": "fleet", "id": fleet["id"]}
                and item["name"] == "avatar"
                for item in saved["savedLayouts"]
            ):
                break
            time.sleep(0.1)
        else:
            raise AssertionError("Saved layout was not recorded")
        focus_target("Vessel dock", "Vessel dock did not receive focus")
        chord(native, "o")
        press("Create Terminal Vessel")
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
        menu(fleet["name"], "Load avatar")
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
        press("Show Portals")
        press("Create Terminal Portal")
        created = wait(
            state,
            lambda doc: (
                len(doc["value"]["voyages"][0]["portals"]) == 1
                and any(
                    item["id"] == doc["value"]["voyages"][0]["portals"][0]["content"]
                    and item.get("backend")
                    for item in doc["value"]["contents"]
                )
            ),
            "chosen Portal terminal backend",
        )
        original_voyage = created["value"]["voyages"][0]
        assert len(original_voyage["portals"]) == 1
        portal = original_voyage["portals"][0]
        drag(control_point("Voyager avatar"), control_point("Portal dock"))
        focused_portal = scope("portal")
        assert focused_portal["value"]["context"]["id"] == portal["id"]
        capture("avatar-real-portal")
        content = next(
            item
            for item in focused_portal["value"]["contents"]
            if item["id"] == portal["content"]
        )
        process = rpc("terminal.get", {"terminal": content["backend"]})
        process_before = process_identity(process["pid"], metadata_only=True)

        def retained_backend(document):
            assert (
                next(
                    item
                    for item in document["value"]["contents"]
                    if item["id"] == content["id"]
                )
                == content
            )
            actual = rpc("terminal.get", {"terminal": content["backend"]})
            assert actual["state"] == "live" and actual["pid"] == process["pid"]
            assert (
                process_identity(process["pid"], metadata_only=True) == process_before
            )

        press("Hide Portals")
        hidden_portal = wait(
            state,
            lambda doc: not doc["value"]["voyages"][0]["portalLayout"]["visible"],
            "hidden Portal presentation",
        )
        assert hidden_portal["value"]["context"] == focused_portal["value"]["context"]
        assert hidden_portal["value"]["voyages"][0]["portals"] == [portal]
        retained_backend(hidden_portal)
        controls = native(
            "fields", launch["pid"], ["Voyager avatar", "Show Portals"], "window"
        )["fields"]
        avatar = next(item for item in controls if item["name"] == "Voyager avatar")
        toggle = next(item for item in controls if item["name"] == "Show Portals")
        assert avatar["width"] <= 80 and avatar["height"] <= 80
        assert avatar["x"] + avatar["width"] <= toggle["x"]
        assert (
            abs(avatar["y"] + avatar["height"] / 2 - toggle["y"] - toggle["height"] / 2)
            <= 4
        ), controls
        capture("avatar-hidden-portal-edge")
        press("Show Portals")
        revealed_portal = wait(
            state,
            lambda doc: doc["value"]["voyages"][0]["portalLayout"]["visible"],
            "revealed Portal presentation",
        )
        retained_backend(revealed_portal)
        assert scope("portal")["value"]["context"] == focused_portal["value"]["context"]
        stages.append("hidden-portal-retained-compact-edge-and-context")
        fields = focus_target("Fleet dock", "Fleet dock did not receive focus")
        (evidence / "avatar-create-fleet-focus.json").write_text(
            json.dumps(fields, indent=2)
        )
        chord(native, "t")
        press("Create Terminal Vessel")
        another_fleet = wait(
            state,
            lambda doc: (
                doc["value"]["selectedFleet"]
                != focused_portal["value"]["selectedFleet"]
            ),
            "chosen first Vessel in new Fleet",
        )
        assert (
            another_fleet["value"]["selectedFleet"]
            != focused_portal["value"]["selectedFleet"]
        )
        assert another_fleet["value"]["context"] == focused_portal["value"]["context"]
        assert another_fleet["value"]["voyages"][0]["portals"][0] == portal
        capture("avatar-portal-across-fleets")
        click(*control_point("Create Voyage", button=True))
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
            dock_key("Overwatch dock", "workspace")
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
            "Overwatch dock",
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
        dock_key("Overwatch dock", "workspace")
        capture("avatar-keyboard-dock")
        stages.append("native-accessibility-and-focused-keyboard-docking")
        voice_isolation(state())
        desktop_switch(state())
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
        floating, before_hide = hide_avatar(keyboard=True)
        capture("avatar-floating", floating)
        assert state() == vessel, "Floating changed the explicit owner context"
        stages.append("keyboard-activation-floated-same-context")
        source = restore(floating, vessel, before_hide)
        capture("avatar-workspace-restored")
        stages.append("restore-original-workspace-bounds-and-context")
        floating, before_hide = hide_avatar()
        assert state() == vessel, "Mouse hide changed the explicit owner context"
        capture("avatar-mouse-hidden-at-same-anchor", floating)
        source = restore(floating, vessel, before_hide)
        capture("avatar-mouse-restored-original-bounds")
        stages.append("mouse-hide-kept-anchor-and-restore-kept-original-bounds")
        floating, source = float_over_workspace()
        drag(source, control_point("Overwatch dock"))
        capture("avatar-cross-window-release")
        workspace = scope("workspace")
        stages.append("floating-to-workspace-dock")
        occlusion(workspace)
        capture("avatar-after-occlusion")
        workspace = dock_key("Overwatch dock", "workspace")
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
        floating = floating_window()
        subprocess.run(
            ["xdotool", "windowquit", launch["window"]], env=env, check=True, timeout=5
        )
        assert floating_window() == floating, (
            "Repeated workspace close replaced its float"
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
        floating, source = float_over_workspace()
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
        floating, source = float_over_workspace()
        drag(source, control_point("Overwatch dock"))
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
        dock_key("Overwatch dock", "workspace")
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
    except BaseException as error:
        try:
            capture("avatar-failure")
        except Exception as diagnostic:
            error.add_note(f"Failure capture: {diagnostic}")
        raise
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
            for _ in range(30):
                if not socket.exists():
                    break
                time.sleep(0.1)
            assert not socket.exists(), (
                "Owned Core exit is unconfirmed; Stop was not repeated"
            )
        except Exception as error:
            errors.append(f"Dedicated Core exit: {error}")
        if errors:
            if failure is not None:
                failure.add_note("Cleanup errors: " + "; ".join(errors))
            else:
                raise AssertionError("Cleanup errors: " + "; ".join(errors))

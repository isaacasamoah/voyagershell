import json
import subprocess
import time

from PIL import ImageChops

from proof_workspace import core_rpc


def terminal(native, capture, geometry, close, evidence, session, env, portals=False):
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
        click(275, 30)
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
                lambda value: bool(value["value"]["voyages"][0]["portals"])
                and any(content.get("backend") for content in value["value"]["contents"][2:]),
                "bound Voyage Portal",
            )["value"]
            portal = layout["voyages"][0]["portals"][0]
            content = next(item for item in layout["contents"] if item["id"] == portal["content"])
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
                lambda value: value["value"]["voyages"][0]["portals"][0].get("name") == "Live Portal",
                "Portal name committed on terminal blur",
            )["value"]["voyages"][0]["portals"][0]
            assert renamed["id"] == portal["id"] and renamed["content"] == portal["content"]
            portal = renamed
            wait_for(
                lambda: rpc("terminal.read", {"terminal": content["backend"]}),
                lambda value: "voyagerportalafterblur" in value["text"].splitlines(),
                "terminal focus after rename blur",
            )
            capture("portal-terminal-name-blur-focus")
            click(375, 30)
            switched = wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: value["value"]["selectedFleet"] == layout["voyages"][0]["fleets"][1]["id"],
                "other Fleet with persistent Portal",
            )["value"]
            assert switched["voyages"][0]["portals"][0] == portal
            assert next(item for item in switched["contents"] if item["id"] == portal["content"]) == content
            assert rpc("terminal.get", {"terminal": content["backend"]})["pid"] == program["pid"]
            click(width - 180, 190)
            type_text("echo voyagerportalretained\n")
            observed = wait_for(
                lambda: rpc("terminal.read", {"terminal": content["backend"]}),
                lambda value: "voyagerportalretained" in value["text"].splitlines(),
                "same Portal terminal after Fleet change",
            )
            capture("portal-terminal-retained")
            (evidence / "portal-terminal-observed.json").write_text(json.dumps({
                "portal": portal, "content": content, "pid": program["pid"], "output": observed,
            }, indent=2))
            before_refusal = rpc("doc.get", {"name": "voyager-layout-v1"})
            missing.rmdir()
            click(460, 30)
            wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: len(value["value"]["voyages"][0]["fleets"]) == 3
                and value["version"] >= before_refusal["version"] + 3,
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
            click(375, 30)
            wait_for(
                lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
                lambda value: value["value"]["selectedFleet"] == layout["voyages"][0]["fleets"][1]["id"],
                "unrelated navigation after unresolved refusal",
            )
            capture("portal-terminal-refusal-navigation")
        close()
        closed = True
        return [
            "real-shell-input-output-exit",
            "known-refusal-explicit-refresh",
            "native-quit",
        ] + (["real-Portal-input-output", "Portal-backend-and-view-retained-across-Fleets", "native-rename-blur-retains-terminal-focus", "refused-sibling-does-not-block-Portal-or-navigation"] if portals else [])
    finally:
        try:
            if not closed:
                close()
        finally:
            rpc("server.stop", {})

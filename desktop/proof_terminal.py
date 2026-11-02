import json
import subprocess
import time

from PIL import ImageChops

from proof_workspace import core_rpc


def terminal(native, capture, geometry, close, evidence, session, env):
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
        close()
        closed = True
        return [
            "real-shell-input-output-exit",
            "known-refusal-explicit-refresh",
            "native-quit",
        ]
    finally:
        try:
            if not closed:
                close()
        finally:
            rpc("server.stop", {})

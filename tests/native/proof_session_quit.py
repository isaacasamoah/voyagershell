import json
import os
import time
from pathlib import Path
from secrets import token_hex

from proof_avatar_window import warm_restore
from proof_process import observe_core_exit
from proof_terminal_agent import process_record
from proof_workspace import core_rpc, stop_existing_core


def pane_candidates(items, bounds, excluded=None):
    def contains(region, item):
        x = item["x"] + item["width"] / 2
        y = item["y"] + item["height"] / 2
        return (
            region["x"] <= x < region["x"] + region["width"]
            and region["y"] <= y < region["y"] + region["height"]
        )

    return [
        item
        for item in items
        if item["width"] > 0
        and item["height"] > 0
        and contains(bounds, item)
        and (excluded is None or not contains(excluded, item))
    ]


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey == "session-quit"
    socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
    observed = {
        "limit": "One fixture-owned shell and Core session; no provider or voice trial."
    }

    def save():
        (evidence / "quit-observed.json").write_text(json.dumps(observed, indent=2))

    def launch():
        return json.loads((evidence / "launch.json").read_text())

    def wait(get, predicate, label, seconds=20):
        deadline = time.monotonic() + seconds
        value = None
        while time.monotonic() < deadline:
            value = get()
            if predicate(value):
                return value
            time.sleep(0.1)
        raise AssertionError(f"Timed out waiting for {label}: {value}")

    def rpc(method, params):
        assert socket.is_socket(), "The dedicated Core socket is absent"
        return core_rpc(session, env, method, params)

    def document():
        return rpc("doc.get", {"name": "voyager-layout-v1"})

    def terminal(address):
        return rpc("terminal.get", {"terminal": address})

    def key(code):
        native("key", code, True)
        native("key", code, False)

    def type_text(text):
        for character in text:
            key(65293 if character == "\n" else ord(character))

    def focus_terminal():
        fields = lambda name: native("fields", launch()["pid"], [name], "window")[
            "fields"
        ]
        bounds = wait(
            lambda: fields("Vessel dock"),
            lambda items: (
                len(items) == 1 and items[0]["width"] > 0 and items[0]["height"] > 0
            ),
            "the Vessel region",
        )[0]
        item = wait(
            lambda: pane_candidates(
                [entry for entry in fields("Terminal") if entry["role"] == "terminal"],
                bounds,
            ),
            lambda items: len(items) == 1,
            "the original terminal view",
        )[0]
        window = geometry()
        native(
            "move",
            int(window["X"]) + round(item["x"] + item["width"] / 2),
            int(window["Y"]) + round(item["y"] + item["height"] / 2),
            2,
        )
        native("button", True)
        native("button", False)
        observed.setdefault("terminalTargets", []).append(item)
        save()

    def marker(address, prefix):
        value = f"{prefix}_{token_hex(8)}"
        type_text(f"printf '{prefix}_%s\\n' {value[len(prefix) + 1 :]}\n")
        screen = wait(
            lambda: rpc("terminal.read", {"terminal": address}),
            lambda result: value in result["text"].splitlines(),
            "shell output beyond command echo",
        )
        return {"marker": value, "output": screen}

    def same_process(pid, identity):
        current = process_record(pid)
        assert all(
            current[key] == identity[key] for key in ("uid", "start", "executable")
        )
        return current

    try:
        original = launch()
        assert original["session"] == session
        assert original["command"][original["command"].index("--profile") + 1] == str(
            evidence / "profile"
        )
        wait(socket.is_socket, bool, "the dedicated Core socket")
        initial = wait(
            document,
            lambda item: bool(item["value"]["contents"][0].get("backend")),
            "the original terminal binding",
        )
        address = initial["value"]["contents"][0]["backend"]
        shell = wait(
            lambda: terminal(address),
            lambda item: item["state"] == "live" and item.get("pid"),
            "the live shell",
        )
        roster = rpc("terminal.list", {"all": True})
        assert [
            item["address"] for item in roster["terminals"] if item["state"] == "live"
        ] == [address], roster
        core = rpc("server.status", {})
        core_identity = process_record(core["pid"])
        shell_identity = process_record(shell["pid"])
        assert core_identity["uid"] == shell_identity["uid"] == os.getuid()
        observed["initial"] = {
            "launch": original,
            "document": initial,
            "core": core,
            "coreIdentity": core_identity,
            "terminal": shell,
            "shellIdentity": shell_identity,
        }
        focus_terminal()
        observed["before"] = marker(address, "QUIT_BEFORE")
        observed["warm"] = warm_restore(
            original=original,
            native=native,
            capture=capture,
            geometry=geometry,
            env=env,
            wait=wait,
            name="quit",
        )
        assert launch() == original
        assert document()["value"] == initial["value"]
        assert terminal(address)["pid"] == shell["pid"]
        same_process(shell["pid"], shell_identity)
        observed["quitRequested"] = True
        save()
        close()
        assert not Path(f"/proc/{original['pid']}").exists(), (
            "Original frontend did not exit"
        )
        after_quit = terminal(address)
        assert after_quit["state"] == "live" and after_quit["pid"] == shell["pid"]
        assert rpc("server.status", {})["pid"] == core["pid"]
        same_process(core["pid"], core_identity)
        same_process(shell["pid"], shell_identity)
        observed["afterQuit"] = {
            "terminal": after_quit,
            "core": rpc("server.status", {}),
            "document": document(),
        }
        save()
        start_frame("quit-reopened")
        reopened = launch()
        assert (
            reopened["pid"] != original["pid"]
            and reopened["command"] == original["command"]
        )
        assert (
            reopened["binarySha256"] == original["binarySha256"]
            and reopened["session"] == session
        )
        restored = wait(
            document,
            lambda value: value["value"] == initial["value"],
            "the retained layout",
        )
        assert (
            terminal(address)["state"] == "live"
            and terminal(address)["pid"] == shell["pid"]
        )
        assert rpc("server.status", {})["pid"] == core["pid"]
        same_process(core["pid"], core_identity)
        same_process(shell["pid"], shell_identity)
        reopened_roster = rpc("terminal.list", {"all": True})
        assert [
            item["address"]
            for item in reopened_roster["terminals"]
            if item["state"] == "live"
        ] == [address], reopened_roster
        prior_output = rpc("terminal.read", {"terminal": address})
        assert observed["before"]["marker"] in prior_output["text"].splitlines()
        focus_terminal()
        observed["reopened"] = {
            "roster": reopened_roster,
            "priorOutput": prior_output,
            "launch": reopened,
            "document": restored,
            "output": marker(address, "QUIT_AFTER"),
        }
        save()
        type_text("exit\n")
        observed["fixtureShellExit"] = wait(
            lambda: terminal(address),
            lambda item: item["state"] == "finished",
            "the fixture shell exit",
        )
        close()
        assert rpc("server.status", {})["pid"] == core["pid"]
        same_process(core["pid"], core_identity)
        assert not [
            item
            for item in rpc("terminal.list", {"all": True})["terminals"]
            if item["state"] == "live"
        ]
        observed["fixtureCoreStop"] = stop_existing_core(session, env)
        observed["fixtureCoreExit"] = observe_core_exit(session, env)
        save()
    except BaseException as error:
        observed["failure"] = f"{type(error).__name__}: {error}"
        save()
        raise
    return [
        "warm-close-restores-same-shell",
        "normal-quit-detaches-owned-shell-and-core",
        "reopen-reattaches-same-layout-shell-and-output",
        "fixture-shell-exits-before-dedicated-core-cleanup",
    ]

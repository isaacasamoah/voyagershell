import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from secrets import randbelow, token_hex

from proof_avatar_window import floating_windows
from proof_conversation import chat_close_point, provider_processes
from proof_terminal_agent import process_record
from proof_workspace import core_rpc, named_button


def exit_observation(owned, socket, root=Path("/proc")):
    processes = []
    for item in owned:
        try:
            stat = (
                (root / str(item["pid"]) / "stat")
                .read_text()
                .rsplit(") ", 1)[1]
                .split()
            )
            state = "pid-reused" if stat[19] != item["start"] else stat[0]
        except FileNotFoundError:
            state = "absent"
        processes.append({**item, "observedState": state})
    return {
        "processes": processes,
        "socketAbsent": not socket.exists(),
        "complete": not socket.exists()
        and all(
            item["observedState"] in ("absent", "pid-reused") for item in processes
        ),
    }


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey == "session-quit"
    socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
    observed = {
        "limit": "Recorded identities only; no voice/audio or full descendant census."
    }
    errors = []
    owned = []
    quit_attempted = False
    cold = False

    def save(name, value):
        (evidence / name).write_text(json.dumps(value, indent=2))

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

    def execute(*argv):
        return subprocess.check_output(argv, env=env, text=True, timeout=5)

    def key(code):
        native("key", code, True)
        native("key", code, False)

    def type_text(text):
        for character in text:
            key(65293 if character == "\n" else ord(character))

    def click(x, y):
        bounds = geometry()
        native(
            "move", int(bounds["X"]) + round(x * 2), int(bounds["Y"]) + round(y * 2), 2
        )
        native("button", True)
        native("button", False)

    def fields(name):
        return native("fields", launch()["pid"], [name], "window")["fields"]

    def terminal_focus():
        items = wait(
            lambda: [item for item in fields("Terminal") if item["role"] == "terminal"],
            lambda items: (
                len(items) == 1 and items[0]["width"] > 0 and items[0]["height"] > 0
            ),
            "one native terminal",
        )
        item = items[0]
        click((item["x"] + item["width"] / 2) / 2, (item["y"] + item["height"] / 2) / 2)

    def marker(label, address):
        suffix = token_hex(8)
        type_text(f"printf '{label}_%s\\n' {suffix}\n")
        result = wait(
            lambda: rpc("terminal.read", {"terminal": address}),
            lambda item: f"{label}_{suffix}" in item["text"].splitlines(),
            "shell output beyond command echo",
        )
        return {"text": f"{label}_{suffix}", "screen": result}

    def record(pid, role):
        identity = {"pid": pid, "role": role, **process_record(pid)}
        assert identity["uid"] == os.getuid(), identity
        owned.append(identity)
        return identity

    def bind_runtime():
        current = launch()
        app = record(current["pid"], "app")
        status = rpc("server.status", {})
        core = record(status["pid"], "core")
        for holder in status["holders"]:
            actual = record(holder["pid"], "holder")
            assert actual["executable"] == core["executable"]
        connectors = []
        for path in Path("/proc").glob("[0-9]*"):
            try:
                stat = path.joinpath("stat").read_text().rsplit(") ", 1)[1].split()
                if int(stat[1]) == app["pid"]:
                    item = process_record(int(path.name))
                    if item["argv"][1:] == ["connect", "--session", session]:
                        connectors.append(record(int(path.name), "connector"))
            except (FileNotFoundError, ProcessLookupError):
                pass
        assert (
            len(connectors) == 1 and connectors[0]["executable"] == core["executable"]
        ), connectors
        save(
            "quit-identities-cold.json" if cold else "quit-identities-original.json",
            owned,
        )
        return status

    def settle(name):
        observation = exit_observation(owned, socket)
        save(name, observation)
        deadline = time.monotonic() + 10
        while not observation["complete"] and time.monotonic() < deadline:
            time.sleep(0.1)
            observation = exit_observation(owned, socket)
            save(name, observation)
        assert observation["complete"], observation
        return observation

    def record_providers(executable):
        candidates = provider_processes(evidence)
        roots = [
            item
            for item in candidates
            if item["parent"] == launch()["pid"]
            and item["executable"] == str(executable)
        ]
        assert len(roots) == 1, candidates
        descendants = {roots[0]["pid"]}
        while (
            added := {
                item["pid"] for item in candidates if item["parent"] in descendants
            }
            - descendants
        ):
            descendants.update(added)
        for item in candidates:
            if item["pid"] in descendants and not any(
                old["pid"] == item["pid"] and old["start"] == item["start"]
                for old in owned
            ):
                record(
                    item["pid"],
                    "provider-root" if item == roots[0] else "provider-helper",
                )
        return candidates

    try:
        wait(socket.is_socket, bool, "the original Core socket")
        initial = wait(
            document,
            lambda item: bool(item["value"]["contents"][0].get("backend")),
            "the original shell",
        )
        layout = initial["value"]
        assert len(layout["contents"]) == 1
        address = layout["contents"][0]["backend"]
        terminal = wait(
            lambda: rpc("terminal.get", {"terminal": address}),
            lambda item: item["state"] == "live" and item.get("pid"),
            "the original live shell PID",
        )
        shell = record(terminal["pid"], "shell")
        core = bind_runtime()
        observed["initial"] = {
            "document": initial,
            "terminal": terminal,
            "core": core,
            "launch": launch(),
        }
        assert shell["parent"] in [
            item["pid"] for item in owned if item["role"] == "holder"
        ]
        terminal_focus()
        observed["before"] = marker("QUIT_BEFORE", address)
        capture("quit-original-shell")
        click(*named_button(native, evidence, "Chat"))
        conversation_path = evidence / "conversation.json"

        def conversation():
            return (
                json.loads(conversation_path.read_text())
                if conversation_path.exists()
                else None
            )

        idle = wait(
            conversation,
            lambda item: item is not None and item["phase"] == "idle",
            "idle private conversation",
        )
        assert idle["thread"] is None
        command = shutil.which(env.get("VOYAGER_CODEX_BIN", "codex"), path=env["PATH"])
        assert command, "Installed private Codex is unavailable"
        executable = Path(command).resolve(strict=True)
        left, right = randbelow(70) + 20, randbelow(70) + 20
        prompt = f"Compute {left} * {right}. Reply with exactly 'oru: ' followed by the integer. Use no tools and make no changes."
        wait(
            lambda: fields("Message Voyager"),
            lambda items: (
                len(items) == 1 and items[0]["width"] > 0 and items[0]["height"] > 0
            ),
            "visible private composer",
        )
        native("focus", launch()["pid"], "Message Voyager", 0)
        focused = wait(
            lambda: fields("Message Voyager"),
            lambda items: len(items) == 1 and items[0]["focused"],
            "focused private composer",
        )
        save("quit-composer-focus.json", focused)
        type_text(prompt)
        capture("quit-private-draft")
        key(65293)
        wait(lambda: provider_processes(evidence), bool, "the owned private provider")
        observed["providersEarly"] = record_providers(executable)
        final = wait(
            conversation,
            lambda item: (
                item is not None
                and item["phase"] in ("completed", "failed", "unconfirmed")
            ),
            "one completed private turn",
            120,
        )
        users = [item for item in final["messages"] if item["role"] == "user"]
        answers = [item for item in final["messages"] if item["role"] == "assistant"]
        assert (
            final["phase"] == "completed"
            and final["thread"]
            and final["turn"]
            and not final["limited"]
        )
        assert len(users) == 1 and users[0]["text"] == prompt and answers
        assert all(
            item["requestId"] == users[0]["requestId"]
            and item["context"] == users[0]["context"]
            for item in answers
        )
        assert users[0]["context"]["scope"] == layout["context"]
        assert answers[-1]["text"].strip() == f"oru: {left * right}", answers
        assert not [item for item in final["messages"] if item["role"] == "tool"]
        observed["conversation"] = final
        capture("quit-completed-private-answer")
        click(*chat_close_point(native, launch()["pid"], evidence))
        original = launch()
        geometry()
        execute("xdotool", "windowquit", original["window"])
        observed["warmWindowState"] = wait(
            lambda: execute("xprop", "-id", original["window"], "WM_STATE"),
            lambda state: "Iconic" in state,
            "warm workspace close",
        )
        floating = wait(
            lambda: floating_windows(original, geometry, env),
            lambda items: len(items) == 1,
            "one retained floating avatar",
        )[0]
        capture("quit-warm-floating", floating)
        bounds = geometry(floating)
        native(
            "move",
            int(bounds["X"]) + int(bounds["WIDTH"]) // 2,
            int(bounds["Y"]) + int(bounds["HEIGHT"]) // 2,
            2,
        )
        location = dict(
            line.split("=", 1)
            for line in execute("xdotool", "getmouselocation", "--shell").splitlines()
        )
        observed["restorePointer"] = location
        assert location["WINDOW"] == floating, location
        native("button", True)
        native("button", False)
        wait(
            lambda: execute("xprop", "-id", original["window"], "WM_STATE"),
            lambda state: "Normal" in state,
            "same workspace Restore",
        )
        assert floating_windows(original, geometry, env) == [floating]
        assert launch() == original
        observed["warm"] = {
            "document": document(),
            "core": rpc("server.status", {}),
            "terminal": rpc("terminal.get", {"terminal": address}),
        }
        assert observed["warm"]["document"]["value"] == layout
        assert observed["warm"]["core"]["core"]["id"] == core["core"]["id"]
        assert observed["warm"]["terminal"]["pid"] == terminal["pid"]
        assert conversation() == final
        for item in owned:
            if item["role"] == "provider-helper":
                continue
            assert process_record(item["pid"]) == {
                key: value for key, value in item.items() if key not in ("pid", "role")
            }
        terminal_focus()
        observed["warmOutput"] = marker("QUIT_RESTORED", address)
        capture("quit-warm-restored-shell")
        observed["providersBeforeQuit"] = record_providers(executable)
        save("quit-identities-original.json", owned)
        save("quit-observed.json", observed)
        quit_attempted = True
        close()
        observed["quit"] = settle("quit-original-exits.json")
        cold = True
        owned = []
        quit_attempted = False
        start_frame("quit-cold-reopened")
        wait(socket.is_socket, bool, "the deliberate cold Core")
        restarted = bind_runtime()
        assert (
            restarted["core"]["id"] == core["core"]["id"]
            and restarted["pid"] != core["pid"]
        )
        assert document()["value"] == layout
        ended = rpc("terminal.get", {"terminal": address})
        assert ended["state"] == "finished", ended
        assert ended.get("pid") in (None, terminal["pid"]), ended
        assert ended["created_ms"] == terminal["created_ms"], ended
        terminals = rpc("terminal.list", {"all": True})
        assert not [
            item for item in terminals["terminals"] if item["state"] == "live"
        ], terminals
        observed["cold"] = {
            "core": restarted,
            "terminal": ended,
            "terminals": terminals,
            "document": document(),
        }
        try:
            observed["cold"]["screenObservation"] = rpc(
                "terminal.read", {"terminal": address}
            )
        except Exception as error:
            observed["cold"]["screenObservationError"] = str(error)
        capture("quit-cold-ended-binding")
    except BaseException as error:
        observed["primaryFailure"] = f"{type(error).__name__}: {error}"
        try:
            capture("quit-failure")
        except Exception as capture_error:
            observed["captureError"] = str(capture_error)
        raise
    finally:
        if not quit_attempted:
            quit_attempted = True
            try:
                close()
            except Exception as error:
                errors.append(f"native Quit: {error}")
        try:
            observed["finalExits"] = settle("quit-final-exits.json")
        except Exception as error:
            errors.append(f"recorded exits: {error}")
        observed["errors"] = errors
        save("quit-observed.json", observed)
        if errors and "primaryFailure" not in observed:
            raise AssertionError(errors)
    return [
        "real-shell-and-completed-private-turn",
        "warm-close-restore-retained-context-and-program",
        "explicit-quit-recorded-processes-and-socket-absent",
        "deliberate-cold-reopen-ended-binding-without-restart",
    ]

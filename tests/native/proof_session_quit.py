import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from secrets import randbelow, token_hex

from proof_avatar_window import warm_restore
from proof_conversation import chat_close_point, provider_processes
from proof_terminal_agent import process_record
from proof_workspace import core_rpc, named_button
from proof_process import exit_observation


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
        "limit": "Recorded identities only; no voice/audio or full descendant census."
    }
    errors = []
    owned = []
    quit_attempted = False
    cold = False
    portal = None
    targets = []

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

    def dock(kind):
        return wait(
            lambda: fields(f"{kind} dock"),
            lambda items: (
                len(items) == 1 and items[0]["width"] > 0 and items[0]["height"] > 0
            ),
            f"one {kind} dock region",
        )[0]

    def pane(kind, name, roles):
        bounds = dock(kind)
        excluded = dock("Portal") if kind == "Vessel" and portal else None
        items = wait(
            lambda: pane_candidates(
                [item for item in fields(name) if item["role"] in roles],
                bounds,
                excluded,
            ),
            lambda items: len(items) == 1,
            f"one {name} inside {kind}",
        )
        item = items[0]
        targets.append({"kind": kind, "name": name, "bounds": bounds, "target": item})
        save("quit-pane-targets.json", targets)
        return item

    def terminal_focus(kind="Vessel"):
        item = pane(kind, "Terminal", ("terminal",))
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

    def record_program(program, role):
        identity = record(program["pid"], role)
        status = rpc("server.status", {})
        core_identity = next(item for item in owned if item["role"] == "core")
        assert status["pid"] == core_identity["pid"], status
        for holder in status["holders"]:
            if not any(item["pid"] == holder["pid"] for item in owned):
                actual = record(holder["pid"], "holder")
                assert actual["executable"] == core_identity["executable"]
        assert identity["parent"] in [item["pid"] for item in status["holders"]]
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
        click(*named_button(native, evidence, "Open Portal"))
        created = wait(
            document,
            lambda item: (
                len(item["value"]["contents"]) == 2
                and len(item["value"]["voyages"][0]["portals"]) == 1
                and all(content.get("backend") for content in item["value"]["contents"])
            ),
            "one bound terminal Portal from the native action",
        )
        layout = created["value"]
        portal = layout["voyages"][0]["portals"][0]
        portal_content = next(
            item for item in layout["contents"] if item["id"] == portal["content"]
        )
        assert portal_content["typeId"] == "terminal"
        assert portal_content["backend"] != address
        portal_terminal = wait(
            lambda: rpc("terminal.get", {"terminal": portal_content["backend"]}),
            lambda item: item["state"] == "live" and item.get("pid"),
            "the Portal shell PID",
        )
        portal_shell = record_program(portal_terminal, "portal-shell")
        assert portal_shell["pid"] != shell["pid"]
        terminal_focus("Portal")
        observed["portalSetup"] = {
            "document": created,
            "terminal": portal_terminal,
            "identity": portal_shell,
            "output": marker("QUIT_PORTAL_BEFORE", portal_content["backend"]),
        }
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
        observed.update(
            warm_restore(
                original=original,
                native=native,
                capture=capture,
                geometry=geometry,
                env=env,
                wait=wait,
                name="quit",
            )
        )
        assert launch() == original
        observed["warm"] = {
            "document": document(),
            "core": rpc("server.status", {}),
            "terminal": rpc("terminal.get", {"terminal": address}),
        }
        assert observed["warm"]["document"]["value"] == layout
        assert observed["warm"]["core"]["core"]["id"] == core["core"]["id"]
        assert observed["warm"]["terminal"]["pid"] == terminal["pid"]
        assert (
            rpc("terminal.get", {"terminal": portal_content["backend"]})["pid"]
            == portal_terminal["pid"]
        )
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
        ended = {}
        for previous in (terminal, portal_terminal):
            current = rpc("terminal.get", {"terminal": previous["address"]})
            assert current["state"] == "finished", current
            assert current.get("pid") in (None, previous["pid"]), current
            assert current["created_ms"] == previous["created_ms"], current
            ended[previous["address"]] = current
        terminals = rpc("terminal.list", {"all": True})
        assert not [
            item for item in terminals["terminals"] if item["state"] == "live"
        ], terminals
        observed["cold"] = {
            "core": restarted,
            "terminal": ended[address],
            "portal": ended[portal_content["backend"]],
            "terminals": terminals,
            "document": document(),
        }
        try:
            observed["cold"]["screenObservation"] = rpc(
                "terminal.read", {"terminal": address}
            )
        except Exception as error:
            observed["cold"]["screenObservationError"] = str(error)
        wait(
            lambda: fields("Start new shell"),
            lambda items: (
                len(items) == 2
                and all(item["width"] > 0 and item["height"] > 0 for item in items)
            ),
            "two explicit new-shell controls for the ended placements",
        )
        capture("quit-cold-ended-binding")
        observed["newShells"] = []
        for kind, previous, identity in (
            ("Vessel", terminal, shell),
            ("Portal", portal_terminal, portal_shell),
        ):
            before = document()
            old = previous["address"]
            content = next(
                item
                for item in before["value"]["contents"]
                if item.get("backend") == old
            )
            assert not content.get("startPending") and not content.get("shellIntent")
            assert rpc("terminal.get", {"terminal": old})["state"] == "finished"
            button = pane(kind, "Start new shell", ("button", "push button"))
            attempt = {
                "kind": kind,
                "before": before,
                "oldTerminal": previous,
                "button": button,
            }
            observed["newShells"].append(attempt)
            save("quit-observed.json", observed)
            click(
                (button["x"] + button["width"] / 2) / 2,
                (button["y"] + button["height"] / 2) / 2,
            )

            def replacement():
                value = document()
                save("quit-new-shell-last.json", value)
                return value

            changed = wait(
                replacement,
                lambda value: any(
                    item["id"] == content["id"]
                    and item.get("backend") not in (None, old)
                    and not item.get("startPending")
                    and not item.get("shellIntent")
                    for item in value["value"]["contents"]
                ),
                f"one confirmed {kind} new shell; never repeat an uncertain click",
            )
            updated = next(
                item
                for item in changed["value"]["contents"]
                if item["id"] == content["id"]
            )
            expected = json.loads(json.dumps(before["value"]))
            target = next(
                item for item in expected["contents"] if item["id"] == content["id"]
            )
            target.update(backend=updated["backend"], launch={"kind": "terminal"})
            assert changed["value"] == expected, changed
            program = wait(
                lambda: rpc("terminal.get", {"terminal": updated["backend"]}),
                lambda item: item["state"] == "live" and item.get("pid"),
                "the explicitly created ordinary shell",
            )
            fresh = record_program(program, f"new-{kind.lower()}-shell")
            assert program["address"] not in ended and program["pid"] != previous["pid"]
            assert program["argv"] == previous["argv"]
            assert all(
                fresh[key] == identity[key] for key in ("executable", "argv", "cwd")
            )
            assert (fresh["pid"], fresh["start"]) != (
                identity["pid"],
                identity["start"],
            )
            retained = rpc("terminal.get", {"terminal": old})
            assert (
                retained["address"] == old
                and retained["state"] == "finished"
                and retained["created_ms"] == previous["created_ms"]
            )
            terminal_focus(kind)
            attempt.update(
                document=changed,
                terminal=program,
                identity=fresh,
                oldRetained=retained,
                output=marker(f"NEW_{kind.upper()}", program["address"]),
            )
            for prior in observed["newShells"][:-1]:
                sibling = rpc(
                    "terminal.get", {"terminal": prior["terminal"]["address"]}
                )
                assert (
                    sibling["state"] == "live"
                    and sibling["pid"] == prior["identity"]["pid"]
                )
                assert process_record(sibling["pid"]) == {
                    key: value
                    for key, value in prior["identity"].items()
                    if key not in ("pid", "role")
                }
            capture(f"quit-new-{kind.lower()}-shell")
            if kind == "Vessel":
                deadline = time.monotonic() + 1
                while time.monotonic() < deadline:
                    assert document()["value"] == changed["value"]
                    listed = rpc("terminal.list", {"all": True})
                    assert [
                        item["address"]
                        for item in listed["terminals"]
                        if item["state"] == "live"
                    ] == [program["address"]], listed
                    time.sleep(0.1)
                attempt["ambientObservation"] = {
                    "document": document(),
                    "terminals": listed,
                    "minimumSeconds": 1,
                }
            save("quit-identities-cold.json", owned)
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
        "explicit-vessel-new-shell-preserves-placement-and-context",
        "explicit-portal-new-shell-and-recorded-final-quit",
    ]

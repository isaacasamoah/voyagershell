import json
import os
import shutil
import time
from pathlib import Path

from proof_workspace import chord, core_rpc, named_button, stop_existing_core
from proof_conversation import chat_close_point
from proof_process import observe_core_exit


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey == "conversation-stop"
    other_session = session + "-other"
    owned = {}
    providers = []
    claimed = [session]
    failure = None
    errors = []
    assert not env.get("HC_SOCKET"), "Launch this journey without a fixed Core socket"
    env = {
        key: value
        for key, value in env.items()
        if key not in {"HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"}
    }

    def rpc(method, params, selected=session):
        return core_rpc(selected, env, method, params)

    def wait(get, predicate, label, seconds=20):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            value = get()
            if value is not None and predicate(value):
                return value
            time.sleep(0.1)
        raise AssertionError(f"Timed out waiting for {label}: {value}")

    def document():
        return rpc("doc.get", {"name": "voyager-layout-v1"})

    def click(x, y):
        bounds = geometry()
        native(
            "move", int(bounds["X"]) + round(x * 2), int(bounds["Y"]) + round(y * 2), 2
        )
        native("button", True)
        native("button", False)

    def type_text(text):
        for character in text:
            native("key", ord(character), True)
            native("key", ord(character), False)
        native("key", 65293, True)
        native("key", 65293, False)

    def record(pid):
        path = Path("/proc") / str(pid)
        stat = path.joinpath("stat").read_text().rsplit(") ", 1)[1].split()
        return {
            "pid": pid,
            "start": stat[19],
            "parent": int(stat[1]),
            "uid": path.stat().st_uid,
            "executable": str(path.joinpath("exe").resolve(strict=True)),
        }

    try:
        initial = wait(
            document,
            lambda item: bool(item["value"]["contents"][0].get("backend")),
            "the first shell",
        )
        target = initial["value"]["contents"][0]
        assert capture("stop-initial").size == (1450, 940)
        click(350, 220)
        app_pid = json.loads((evidence / "launch.json").read_text())["pid"]
        focused = wait(
            lambda: native("fields", app_pid, ["Terminal"], "window")["fields"],
            lambda fields: len(fields) == 1 and fields[0]["focused"],
            "the clicked native terminal focus",
        )
        (evidence / "stop-initial-focus.json").write_text(json.dumps(focused, indent=2))
        chord(native, "e")
        before = wait(
            document,
            lambda item: (
                len(item["value"]["contents"]) == 2
                and all(content.get("backend") for content in item["value"]["contents"])
            ),
            "two real split terminals",
        )
        sibling = next(
            content
            for content in before["value"]["contents"]
            if content["id"] != target["id"]
        )
        target_before = rpc("terminal.get", {"terminal": target["backend"]})
        sibling_before = rpc("terminal.get", {"terminal": sibling["backend"]})
        assert not (
            Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (other_session + ".sock")
        ).exists()
        claimed.append(other_session)
        other = rpc(
            "terminal.run",
            {"argv": ["/bin/sleep", "300"], "cwd": "/tmp", "keep": False},
            other_session,
        )
        core = rpc("server.status", {})
        other_core = rpc("server.status", {}, other_session)
        assert core["pid"] != other_core["pid"]
        for name, item in [
            ("target", target_before),
            ("sibling", sibling_before),
            ("other", other),
            ("core", core),
            ("otherCore", other_core),
        ]:
            owned[name] = record(item["pid"])
            assert owned[name]["uid"] == os.getuid()
        click(350, 220)
        type_text("printf 'STOP_TARGET_READY\\n'; sleep 300")
        running = wait(
            lambda: rpc("terminal.get", {"terminal": target["backend"]}),
            lambda item: (item.get("foreground") or {}).get("name") == "sleep",
            "the selected foreground job",
        )
        assert running["pid"] == target_before["pid"]
        owned["foreground"] = record(running["foreground"]["pid"])
        capture("stop-two-running")
        click(*named_button(native, evidence, "Chat"))

        def conversation():
            path = evidence / "conversation.json"
            return json.loads(path.read_text()) if path.exists() else None

        idle = wait(
            conversation, lambda item: item["phase"] == "idle", "idle private chat"
        )
        assert idle["thread"] is None
        native("focus", app_pid, "Message Voyager", 0)
        type_text(
            f"Inspect the workspace and list processes. Explicitly Stop only the terminal {target['backend']} whose screen contains STOP_TARGET_READY. Use its inspected contentId and live PID. Read that same terminal after Stop, and list processes again to verify the other terminal is still running. Report the observed result briefly. Do not interrupt, send input, start or restart anything, change the layout or files, or repeat Stop."
        )
        wait(
            conversation,
            lambda item: item["turn"] is not None,
            "the accepted private turn",
        )
        for path in Path("/proc").glob("[0-9]*"):
            try:
                if path.joinpath("cwd").resolve() == evidence / "profile/conversation":
                    providers.append(record(int(path.name)))
            except (FileNotFoundError, PermissionError):
                pass
        app_pid = json.loads((evidence / "launch.json").read_text())["pid"]
        command = shutil.which("codex", path=env["PATH"])
        assert command, "Installed Codex is unavailable"
        executable = Path(command).resolve(strict=True)
        roots = [
            item["pid"]
            for item in providers
            if item["parent"] == app_pid and item["executable"] == str(executable)
        ]
        assert len(roots) == 1, providers
        descendants = set(roots)
        while (
            added := {
                item["pid"] for item in providers if item["parent"] in descendants
            }
            - descendants
        ):
            descendants.update(added)
        providers = [item for item in providers if item["pid"] in descendants]
        assert all(item["uid"] == os.getuid() for item in providers)
        (evidence / "provider-processes.json").write_text(
            json.dumps(providers, indent=2)
        )
        final = wait(
            conversation,
            lambda item: item["phase"] in ("completed", "failed", "unconfirmed"),
            "the completed Stop turn",
            120,
        )
        assert final["phase"] == "completed", final
        users = [item for item in final["messages"] if item["role"] == "user"]
        answers = [item for item in final["messages"] if item["role"] == "assistant"]
        tools = [item for item in final["messages"] if item["role"] == "tool"]
        assert (
            len(users) == 1 and answers and tools and final["thread"] and final["turn"]
        )
        assert all(item["text"].startswith("oru:") for item in answers)
        assert all(
            item["requestId"] == users[0]["requestId"]
            and item["context"] == users[0]["context"]
            for item in answers + tools
        )
        assert all(
            item["tool"]["status"] == "applied"
            and item["tool"]["callId"] == item["id"]
            and item["tool"]["callbackIds"]
            for item in tools
        )
        process = [item for item in tools if item["tool"]["name"] == "voyager_process"]
        actions = [item["tool"]["action"]["action"] for item in process]
        assert [item["operation"] for item in actions].count("stop") == 1
        assert {item["operation"] for item in actions} == {"list", "stop", "read"}
        stop = next(item for item in actions if item["operation"] == "stop")
        assert stop == {
            "operation": "stop",
            "contentId": target["id"],
            "terminalId": target["backend"],
            "pid": target_before["pid"],
        }
        following = actions[actions.index(stop) + 1 :]
        assert any(
            item["operation"] == "read"
            and item["contentId"] == target["id"]
            and item["terminalId"] == target["backend"]
            for item in following
        )
        assert any(item["operation"] == "list" for item in following)
        assert any(item["text"] == "Program ended" for item in process)
        ended = rpc("terminal.get", {"terminal": target["backend"]})
        assert ended["address"] == target["backend"] and ended["state"] == "finished"
        screen = rpc("terminal.read", {"terminal": target["backend"]})
        assert "STOP_TARGET_READY" in screen["text"].splitlines()
        assert document()["value"] == before["value"]
        for selected, address, identity in [
            (session, sibling["backend"], owned["sibling"]),
            (other_session, other["address"], owned["other"]),
        ]:
            survivor = rpc("terminal.get", {"terminal": address}, selected)
            assert survivor["state"] == "live" and survivor["pid"] == identity["pid"]
            assert record(survivor["pid"]) == identity
        wait(
            lambda: Path("/proc", str(owned["foreground"]["pid"])).exists(),
            lambda exists: not exists,
            "the selected foreground process exit",
            5,
        )
        (evidence / "stop-final.json").write_text(
            json.dumps(
                {
                    "conversation": final,
                    "ended": ended,
                    "screen": screen,
                    "owned": owned,
                },
                indent=2,
            )
        )
        bounds = geometry()
        native("move", int(bounds["X"]) + 300, int(bounds["Y"]) + 650, 2)
        for _ in range(8):
            native("scroll", 96, 0)
            time.sleep(0.08)
        native("scroll", 0, 1)
        capture("stop-visible-answer")
        click(*chat_close_point(native, app_pid, evidence))
        capture("stop-native-ended-and-survivor")
    except BaseException as error:
        failure = error
    finally:
        try:
            close()
        except Exception as error:
            errors.append(f"Native close: {error}")
        for selected in claimed:
            try:
                socket = (
                    Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (selected + ".sock")
                )
                if selected != session and socket.is_socket():
                    stop_existing_core(selected, env)
                observe_core_exit(selected, env)
            except Exception as error:
                errors.append(f"Core cleanup {selected}: {error}")
        for identity in list(owned.values()) + providers:
            try:
                wait(
                    lambda: Path("/proc", str(identity["pid"])).exists(),
                    lambda exists: not exists,
                    "recorded process exit",
                    5,
                )
            except Exception as error:
                errors.append(f"PID {identity['pid']}: {error}")
        (evidence / "stop-owned.json").write_text(json.dumps(owned, indent=2))
        (evidence / "stop-cleanup.json").write_text(
            json.dumps(
                {
                    "recordedPidsAbsent": not errors,
                    "sessions": [session, other_session],
                    "errors": errors,
                },
                indent=2,
            )
        )
    if failure is not None:
        failure.add_note(f"Cleanup errors: {errors}")
        raise failure
    assert not errors, errors
    return [
        "native-private-selected-stop",
        "native-ended-view-retains-binding",
        "same-core-and-other-core-survive",
        "owned-trial-cleanup",
    ]

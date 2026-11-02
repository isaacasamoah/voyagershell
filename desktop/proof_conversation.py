import json
import time
from pathlib import Path
from secrets import token_hex

from proof_workspace import core_rpc, named_button


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    def click(x, y):
        bounds = geometry()
        native(
            "move", int(bounds["X"]) + round(x * 2), int(bounds["Y"]) + round(y * 2), 2
        )
        native("button", True)
        native("button", False)
        time.sleep(0.15)

    def read():
        path = evidence / "conversation.json"
        return json.loads(path.read_text()) if path.exists() else None

    def wait(predicate, seconds=90):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            state = read()
            if state and predicate(state):
                return state
            time.sleep(0.05)
        raise AssertionError(f"Conversation did not reach the expected state: {read()}")

    def type_text(text):
        for character in text:
            native("key", ord(character), True)
            native("key", ord(character), False)

    process_case = journey == "conversation-process"
    administrator = journey in ("conversation-administrator", "conversation-process")
    if process_case:
        deadline = time.monotonic() + 15
        while True:
            before_home = core_rpc(
                session, env, "doc.get", {"name": "voyager-layout-v1"}
            )
            if before_home["value"]["contents"] and before_home["value"]["contents"][
                0
            ].get("backend"):
                break
            assert time.monotonic() < deadline, "Initial real terminal was not bound"
            time.sleep(0.05)
        prior_terminals = core_rpc(session, env, "terminal.list", {"all": True})
        click(*named_button(native, evidence, "Home"))
        while True:
            home = core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})
            if home["value"].get("view") == "home":
                break
            assert time.monotonic() < deadline, "Home did not open"
            time.sleep(0.05)
        assert home["value"]["context"] == before_home["value"]["context"]
        assert home["value"]["contents"] == before_home["value"]["contents"]
        capture("administrator-home-before-turn")
    if not (evidence / "conversation-open.png").exists():
        time.sleep(0.5)
        click(64, 108)
    idle = wait(lambda state: state["phase"] == "idle", 5)
    assert idle["thread"] is None, "Opening chat started the provider"
    capture("conversation-open")
    if administrator:
        fixture = evidence / "profile/conversation/administrator-read.txt"
        fixture.parent.mkdir(parents=True, exist_ok=True)
        marker = token_hex(8)
        fixture.write_text(marker)
        initial = core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})
    if process_case:
        deadline = time.monotonic() + 15
        while True:
            initial = core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})
            content = initial["value"]["contents"][0]
            if content.get("backend"):
                terminal = core_rpc(
                    session, env, "terminal.get", {"terminal": content["backend"]}
                )
                if terminal.get("pid"):
                    break
            assert time.monotonic() < deadline, "Initial real terminal was not bound"
            time.sleep(0.05)
    click(150, 637)
    time.sleep(0.2)
    capture("conversation-focused")
    type_text(
        f"Read administrator-read.txt using native inspection. Use voyager_workspace to inspect and voyager_process to list and read the existing terminal {content['backend']}. Submit exactly printf 'ADMIN_%s\\n' PROCESS; sleep 30 to that terminal. Input submitted is not job readiness. Use process reads to inspect until its actual foreground name is sleep, then explicitly interrupt that job and read its actual result. Finally create exactly one Fleet named Native admin in the existing Voyage. Report the file marker, observed output and actual Core interrupt result briefly. Do not stop or restart terminals, launch agents, change files, repeat the send or combine interrupt/send automatically."
        if process_case
        else "Use your native file read tool to read administrator-read.txt in your current directory. Then use voyager_workspace to inspect the workspace and create exactly one Fleet named Native admin inside the existing Voyage. Report the file marker and actual result briefly. Do not change project files or launch agents."
        if administrator
        else "Count from one to one hundred in words. Use no tools."
        if journey == "conversation-interrupt"
        else "Reply with one short sentence about a quiet ocean. Use no tools."
    )
    capture("conversation-draft")
    native("key", 65293, True)
    native("key", 65293, False)
    wait(lambda state: state["turn"] is not None)
    if process_case:
        deadline = time.monotonic() + 90
        while True:
            job = core_rpc(
                session, env, "terminal.get", {"terminal": content["backend"]}
            )
            if (job.get("foreground") or {}).get("name") == "sleep":
                assert job["pid"] == terminal["pid"], job
                break
            state = read()
            assert state["phase"] not in ("completed", "failed", "unconfirmed"), state
            assert time.monotonic() < deadline, "The requested job was not observed"
            time.sleep(0.05)
        (evidence / "process-job-ready.json").write_text(json.dumps(job, indent=2))
        capture("administrator-process-job-ready")
    providers = []
    for process in Path("/proc").glob("[0-9]*"):
        try:
            if process.joinpath("cwd").resolve() == evidence / "profile/conversation":
                stat = process.joinpath("stat").read_text().rsplit(") ", 1)[1].split()
                providers.append(
                    {
                        "pid": int(process.name),
                        "start": stat[19],
                        "parent": int(stat[1]),
                        "uid": process.stat().st_uid,
                        "executable": str(process.joinpath("exe").resolve()),
                        "cwd": str(process.joinpath("cwd").resolve()),
                    }
                )
        except (FileNotFoundError, PermissionError):
            pass
    assert providers, "Native provider process identity was not observed"
    (evidence / "provider-processes.json").write_text(json.dumps(providers, indent=2))
    if journey == "conversation-interrupt":
        type_text("This should be refused while busy.")
        native("key", 65293, True)
        native("key", 65293, False)
        time.sleep(0.2)
        capture("conversation-busy-refused")
        assert len([m for m in read()["messages"] if m["role"] == "user"]) == 1
        click(300, 680)
        interrupted = wait(
            lambda state: (
                state["phase"] in ("interrupted", "completed", "failed", "unconfirmed")
            )
        )
        assert interrupted["phase"] == "interrupted", interrupted
        (evidence / "conversation-interrupted.json").write_text(
            json.dumps(interrupted, indent=2)
        )
        capture("conversation-interrupted")
        close()
        for provider in providers:
            for _ in range(50):
                path = Path("/proc") / str(provider["pid"])
                if (
                    not path.exists()
                    or path.joinpath("stat").read_text().rsplit(") ", 1)[1].split()[0]
                    == "Z"
                ):
                    break
                time.sleep(0.1)
            else:
                raise AssertionError("Owned provider survived normal Quit")
        return ["native-busy-refused", "native-turn-interrupted", "owned-provider-quit"]
    first = wait(
        lambda state: any(
            message["role"] == "assistant" for message in state["messages"]
        )
    )
    (evidence / "conversation-first.json").write_text(json.dumps(first, indent=2))
    capture("conversation-progress")
    final = wait(lambda state: state["phase"] in ("completed", "failed", "unconfirmed"))
    assert final["phase"] == "completed", final
    assert final["thread"] and final["turn"] and final["model"]
    users = [message for message in final["messages"] if message["role"] == "user"]
    answers = [
        message for message in final["messages"] if message["role"] == "assistant"
    ]
    assert (
        len(users) == 1 and answers and answers[0]["requestId"] == users[0]["requestId"]
    )
    assert answers[0]["context"] == users[0]["context"]
    assert final["limited"] is False
    assert users[0]["context"]["path"] == ["Workspace"]
    assert users[0]["context"]["scope"] == {"kind": "workspace"}
    assert users[0]["context"]["revision"].isdigit()
    if administrator:
        assert marker in " ".join(message["text"] for message in answers), (
            "Native file inspection did not return the undisclosed fixture marker"
        )
        assert all(message["text"].startswith("oru:") for message in answers), answers
        tools = [message for message in final["messages"] if message["role"] == "tool"]
        assert len(tools) >= 2 and all(
            message["tool"]["status"] == "applied" for message in tools
        ), tools
        assert any(message["text"] == "Fleet created" for message in tools)
        assert all(
            message["tool"]["name"]
            in (
                {"voyager_workspace", "voyager_process"}
                if process_case
                else {"voyager_workspace"}
            )
            and message["tool"]["callId"] == message["id"]
            and message["tool"]["callbackIds"]
            and message["tool"]["requestId"]
            and message["tool"]["version"].isdigit()
            for message in tools
        )
        assert all(
            message["context"] == users[0]["context"]
            and message["requestId"] == users[0]["requestId"]
            for message in tools
        )
        observed = core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})
        if process_case:
            deadline = time.monotonic() + 15
            while True:
                observed = core_rpc(
                    session, env, "doc.get", {"name": "voyager-layout-v1"}
                )
                voyages = observed["value"]["voyages"]
                if len(voyages[0]["fleets"]) == 2:
                    created_id = voyages[0]["fleets"][1]["vessels"][0]["content"]
                    created = next(
                        item
                        for item in observed["value"]["contents"]
                        if item["id"] == created_id
                    )
                    if created.get("backend"):
                        break
                assert time.monotonic() < deadline, (
                    "Created Fleet terminal was not bound"
                )
                time.sleep(0.05)
            old = {
                item["id"]: item.get("backend")
                for item in before_home["value"]["contents"]
            }
            assert all(
                next(
                    item for item in observed["value"]["contents"] if item["id"] == key
                ).get("backend")
                == value
                for key, value in old.items()
            )
            terminals = core_rpc(session, env, "terminal.list", {"all": True})
            before_ids = {item["address"] for item in prior_terminals["terminals"]}
            after_ids = {item["address"] for item in terminals["terminals"]}
            assert (
                after_ids - before_ids == {created["backend"]}
                and before_ids <= after_ids
            )
            (evidence / "administrator-created-backend.json").write_text(
                json.dumps(
                    {"created": created, "before": prior_terminals, "after": terminals},
                    indent=2,
                )
            )
        voyage = observed["value"]["voyages"][0]
        assert (
            len(voyage["fleets"]) == 2 and voyage["fleets"][1]["name"] == "Native admin"
        ), observed
        assert voyage["fleets"][0] == initial["value"]["voyages"][0]["fleets"][0]
        (evidence / "administrator-owner.json").write_text(
            json.dumps(observed, indent=2)
        )
        if process_case:
            process_tools = [
                message
                for message in tools
                if message["tool"]["name"] == "voyager_process"
            ]
            operations = [
                message["tool"]["action"]["action"]["operation"]
                for message in process_tools
            ]
            assert {"list", "read", "send", "interrupt"}.issubset(operations), (
                operations
            )
            assert (
                operations.count("send") == 1 and operations.count("interrupt") == 1
            ), operations
            assert all(
                action["operation"] == "list"
                or (
                    action["contentId"] == content["id"]
                    and action["terminalId"] == content["backend"]
                    and (
                        action["operation"] == "read"
                        or action["pid"] == terminal["pid"]
                    )
                )
                for message in process_tools
                for action in [message["tool"]["action"]["action"]]
            )
            assert any(
                message["text"] == "Interrupt submitted; Core reports stopped"
                for message in process_tools
            )
            original = core_rpc(
                session, env, "terminal.get", {"terminal": content["backend"]}
            )
            output = core_rpc(
                session, env, "terminal.read", {"terminal": content["backend"]}
            )
            assert original["pid"] == terminal["pid"] and original["state"] == "live", (
                original
            )
            assert "ADMIN_PROCESS" in output["text"].splitlines(), output
            (evidence / "process-owner-observed.json").write_text(
                json.dumps({"terminal": original, "read": output}, indent=2)
            )
        capture("administrator-completed-chat")
        bounds = geometry()
        native("move", int(bounds["X"]) + 300, int(bounds["Y"]) + 650, 2)
        for _ in range(8):
            native("scroll", 96, 0)
            time.sleep(0.08)
        native("scroll", 0, 1)
        time.sleep(0.3)
        capture("administrator-scrolled-answer")
        click(64, 108)
        capture("administrator-native-workspace-effect")
        if process_case:
            click(275, 30)
            deadline = time.monotonic() + 5
            while True:
                selected = core_rpc(
                    session, env, "doc.get", {"name": "voyager-layout-v1"}
                )
                if selected["value"]["selectedFleet"] == voyage["fleets"][0]["id"]:
                    break
                assert time.monotonic() < deadline, selected
                time.sleep(0.05)
            capture("administrator-native-terminal-result")
    capture("conversation-completed")
    (evidence / "conversation-final.json").write_text(json.dumps(final, indent=2))
    if process_case:
        owned = core_rpc(session, env, "terminal.list", {"all": True})
        shells = []
        for item in owned["terminals"]:
            if not item.get("pid"):
                continue
            path = Path("/proc") / str(item["pid"])
            stat = path.joinpath("stat").read_text().rsplit(") ", 1)[1].split()
            shells.append(
                {
                    "terminal": item["address"],
                    "pid": item["pid"],
                    "start": stat[19],
                    "uid": path.stat().st_uid,
                    "executable": str(path.joinpath("exe").resolve()),
                }
            )
        (evidence / "owned-shells.json").write_text(json.dumps(shells, indent=2))
    close()
    if administrator:
        core_rpc(session, env, "server.stop", {})
        for provider in providers:
            path = Path("/proc") / str(provider["pid"])
            assert (
                not path.exists()
                or path.joinpath("stat").read_text().rsplit(") ", 1)[1].split()[0]
                == "Z"
            ), "Owned provider survived Quit"
        if process_case:
            for shell in shells:
                path = Path("/proc") / str(shell["pid"])
                assert (
                    not path.exists()
                    or path.joinpath("stat").read_text().rsplit(") ", 1)[1].split()[19]
                    != shell["start"]
                ), shell
    return [
        "native-private-text-completed",
        "matching-thread-turn-request-context",
        "native-quit",
    ]

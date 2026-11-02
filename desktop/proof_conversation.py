import json
import time
from pathlib import Path
from secrets import token_hex

from proof_workspace import core_rpc


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

    if not (evidence / "conversation-open.png").exists():
        time.sleep(0.5)
        click(64, 108)
    idle = wait(lambda state: state["phase"] == "idle", 5)
    assert idle["thread"] is None, "Opening chat started the provider"
    capture("conversation-open")
    administrator = journey == "conversation-administrator"
    if administrator:
        fixture = evidence / "profile/conversation/administrator-read.txt"
        fixture.parent.mkdir(parents=True, exist_ok=True)
        marker = token_hex(8)
        fixture.write_text(marker)
        initial = core_rpc(
            session, env, "doc.get", {"name": "voyager-layout-v1"}
        )
    click(150, 637)
    time.sleep(0.2)
    capture("conversation-focused")
    type_text(
        "Use your native file read tool to read administrator-read.txt in your current directory. Then use voyager_workspace to inspect the workspace and create exactly one Fleet named Native admin inside the existing Voyage. Report the file marker and actual result briefly. Do not change project files or launch agents."
        if administrator
        else "Count from one to one hundred in words. Use no tools."
        if journey == "conversation-interrupt"
        else "Reply with one short sentence about a quiet ocean. Use no tools."
    )
    capture("conversation-draft")
    native("key", 65293, True)
    native("key", 65293, False)
    wait(lambda state: state["turn"] is not None)
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
            message["tool"]["name"] == "voyager_workspace"
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
        observed = core_rpc(
            session, env, "doc.get", {"name": "voyager-layout-v1"}
        )
        voyage = observed["value"]["voyages"][0]
        assert (
            len(voyage["fleets"]) == 2 and voyage["fleets"][1]["name"] == "Native admin"
        ), observed
        assert voyage["fleets"][0] == initial["value"]["voyages"][0]["fleets"][0]
        (evidence / "administrator-owner.json").write_text(
            json.dumps(observed, indent=2)
        )
        click(64, 108)
        capture("administrator-native-workspace-effect")
    capture("conversation-completed")
    (evidence / "conversation-final.json").write_text(json.dumps(final, indent=2))
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
    return [
        "native-private-text-completed",
        "matching-thread-turn-request-context",
        "native-quit",
    ]

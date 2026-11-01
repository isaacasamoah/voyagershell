import json
import time
from pathlib import Path


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
    click(150, 637)
    time.sleep(0.2)
    capture("conversation-focused")
    type_text(
        "Count from one to one hundred in words. Use no tools."
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
                providers.append(
                    {
                        "pid": int(process.name),
                        "start": process.joinpath("stat")
                        .read_text()
                        .rsplit(") ", 1)[1]
                        .split()[19],
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
    capture("conversation-completed")
    (evidence / "conversation-final.json").write_text(json.dumps(final, indent=2))
    close()
    return [
        "native-private-text-completed",
        "matching-thread-turn-request-context",
        "native-quit",
    ]

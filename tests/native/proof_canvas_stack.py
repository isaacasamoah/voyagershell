import copy
import json
from pathlib import Path
from secrets import token_hex

from proof_conversation import private_turn
from proof_process import exit_observation, observe_core_exit, process_identity
from proof_workspace import click_control, core_rpc, stop_existing_core, wait


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey == "canvas-stack"
    targets, owned = [], {}
    chat_open = False

    def launch():
        return json.loads((evidence / "launch.json").read_text())

    def document():
        return core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})

    def click(name):
        click_control(
            native, capture, geometry, evidence, launch()["pid"], name, targets
        )

    def text(value):
        for character in value:
            key = 65293 if character == "\n" else ord(character)
            native("key", key, True)
            native("key", key, False)

    def hide_chat():
        nonlocal chat_open
        click("Close chat")
        chat_open = False

    def turn(prompt, name):
        nonlocal chat_open
        if not chat_open:
            click("Chat")
            chat_open = True
        final, user = private_turn(
            native=native,
            pid=launch()["pid"],
            evidence=evidence,
            wait=wait,
            type_text=text,
            prompt=prompt,
            context={"kind": "workspace"},
            owned=owned,
            name=name,
            focus=lambda: click("Message Voyager"),
        )
        return [
            {**message["tool"], "text": message["text"]}
            for message in final["messages"]
            if message["role"] == "tool" and message["requestId"] == user["requestId"]
        ]

    initial = wait(
        document,
        lambda doc: bool(doc["value"]["contents"][0].get("backend")),
        "initial shell",
    )
    core = core_rpc(session, env, "server.status", {})
    core_identity = process_identity(core["pid"], metadata_only=True)
    initial_shell = core_rpc(
        session,
        env,
        "terminal.get",
        {"terminal": initial["value"]["contents"][0]["backend"]},
    )
    initial_identity = process_identity(initial_shell["pid"], metadata_only=True)
    workspace = evidence / "workspace"
    workspace.mkdir()
    marker = "STACK_" + token_hex(8)
    tools = turn(
        f"Inspect this workspace. Create exactly one Voyage named Stack trial with cwd {workspace}. "
        f"In its first Fleet create exactly one Notes Vessel beside its terminal. Describe and inspect "
        f"that Notes instance, then update its title to Canvas note and text to {marker} with the inspected "
        "revision. Keep existing work and avatar context unchanged. Use only Voyager workspace/content "
        "tools. Do not edit source, send terminal input or repeat any uncertain effect.",
        "stack-setup",
    )
    assert tools and all(
        tool["status"] == "applied"
        or (
            tool["status"] == "rejected"
            and tool["action"]["action"]["operation"] == "create-content"
            and tool["text"]
            == "Workspace request refused: invalid_workspace: Layout changed; inspect it before making a new request"
        )
        for tool in tools
    ), tools
    assert len({tool["requestId"] for tool in tools}) == len(tools)
    applied = [
        tool["action"]["action"]["operation"]
        for tool in tools
        if tool["status"] == "applied"
    ]
    assert (
        applied.count("create-voyage")
        == applied.count("create-content")
        == applied.count("update")
        == 1
    )
    before = document()["value"]
    assert before["contents"][0] == initial["value"]["contents"][0]
    assert len(before["voyages"]) == len(initial["value"]["voyages"]) + 1
    assert before["context"] == initial["value"]["context"]
    voyage = next(v for v in before["voyages"] if v["name"] == "Stack trial")
    fleet = voyage["fleets"][0]
    assert len(fleet["vessels"]) == 2
    contents = {item["id"]: item for item in before["contents"]}
    note = next(
        contents[v["content"]]
        for v in fleet["vessels"]
        if contents[v["content"]]["typeId"] == "notes"
    )
    binding = note["configuration"]["notesFile"]
    note_path = Path(binding["directory"]) / binding["filename"]
    assert note_path.is_relative_to(workspace) and marker in note_path.read_text()
    note_bytes = note_path.read_bytes()
    address = next(
        contents[v["content"]]["backend"]
        for v in fleet["vessels"]
        if contents[v["content"]]["typeId"] == "terminal"
    )
    shell = core_rpc(session, env, "terminal.get", {"terminal": address})
    assert shell["foreground"]["cwd"] == str(workspace)
    identity = process_identity(shell["pid"], metadata_only=True)
    hide_chat()
    click("Terminal input")
    text("printf '%s\\n' " + marker + "\n")
    wait(
        lambda: core_rpc(session, env, "terminal.read", {"terminal": address}),
        lambda value: marker in value["text"].splitlines(),
        "computed shell marker",
    )
    capture("stack-before")
    canvas = copy.deepcopy(before["canvas"])
    alternate = copy.deepcopy(canvas["root"])
    alternate["children"][0]["size"]["pixels"] = 280
    canvas["root"] = {
        "kind": "stack",
        "size": {"kind": "fill"},
        "selected": 1,
        "children": [canvas["root"], alternate],
    }
    private = evidence / "profile/conversation"

    for name, selected, invalid in [
        ("selected", 1, False),
        ("refused", 2, True),
        ("returned", 0, False),
    ]:
        proposed = copy.deepcopy(canvas)
        proposed["root"]["selected"] = selected
        path = private / ("canvas-" + name + ".json")
        path.write_text(json.dumps(proposed))
        prior = document()["value"]
        actions = turn(
            f"Read {path.name} with native inspection. Inspect the current workspace, then submit exactly "
            "one update-canvas using that file's complete canvas and the inspected layout version. "
            "This is a deliberate validation test. Report the actual result, including refusal. Do not "
            "repair, retry, edit files or change any other workspace state, content or avatar context.",
            "stack-" + name,
        )
        updates = [
            tool
            for tool in actions
            if tool["action"]["action"]["operation"] == "update-canvas"
        ]
        assert len(updates) == 1 and updates[0]["status"] == (
            "rejected" if invalid else "applied"
        ), actions
        current = document()["value"]
        assert current["canvas"] == (prior["canvas"] if invalid else proposed)
        for key in (
            "contents",
            "voyages",
            "context",
            "selectedVoyage",
            "selectedFleet",
        ):
            assert current[key] == prior[key], key
        assert process_identity(shell["pid"], metadata_only=True) == identity
        assert (
            process_identity(initial_shell["pid"], metadata_only=True)
            == initial_identity
        )
        assert (
            core_rpc(session, env, "terminal.get", {"terminal": address})["pid"]
            == shell["pid"]
        )
        assert note_path.read_bytes() == note_bytes
        assert (
            marker
            in core_rpc(session, env, "terminal.read", {"terminal": address})[
                "text"
            ].splitlines()
        )
        hide_chat()
        capture("stack-" + name + "-native")
    persisted = document()
    (evidence / "stack-observed.json").write_text(
        json.dumps(
            {
                "before": before,
                "after": persisted,
                "shell": shell,
                "identity": identity,
                "note": str(note_path),
            },
            indent=2,
        )
    )
    close()
    socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
    providers = list(owned.values())
    exited = wait(
        lambda: exit_observation(providers, socket),
        lambda value: all(
            p["observedState"] in ("absent", "pid-reused") for p in value["processes"]
        ),
        "private provider exit",
    )
    (evidence / "stack-provider-quit.json").write_text(json.dumps(exited, indent=2))
    start_frame("stack-reopened")
    assert document() == persisted
    assert core_rpc(session, env, "server.status", {})["pid"] == core["pid"]
    assert process_identity(core["pid"], metadata_only=True) == core_identity
    assert (
        process_identity(initial_shell["pid"], metadata_only=True) == initial_identity
    )
    assert process_identity(shell["pid"], metadata_only=True) == identity
    assert (
        marker
        in core_rpc(session, env, "terminal.read", {"terminal": address})[
            "text"
        ].splitlines()
    )
    assert note_path.read_bytes() == note_bytes
    capture("stack-reopened-native")
    close()
    terminals = core_rpc(session, env, "terminal.list", {"all": True})
    processes = [
        {"pid": t["pid"], **process_identity(t["pid"], metadata_only=True)}
        for t in terminals["terminals"]
        if t.get("pid")
    ]
    cleanup = {
        "purpose": "Explicit fixture cleanup after product retention checks",
        "processes": processes,
        "stop": stop_existing_core(session, env),
    }
    cleanup["exit"] = observe_core_exit(session, env, processes)
    (evidence / "stack-fixture-cleanup.json").write_text(json.dumps(cleanup, indent=2))
    return [
        "agent-stack-selected",
        "invalid-stack-refused-unchanged",
        "content-process-context-retained",
        "stack-selection-reopened",
    ]

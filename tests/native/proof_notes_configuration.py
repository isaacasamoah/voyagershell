import hashlib
import json
from secrets import token_hex

from proof_conversation import chat_close_point, private_turn
from proof_foundation_notes import wait
from proof_workspace import named_button


GATE_WAIT = """import pathlib, sys, time
path = pathlib.Path(sys.argv[1])
token = sys.argv[2]
print("WAITING " + token, flush=True)
deadline = time.monotonic() + float(sys.argv[3])
while time.monotonic() < deadline:
    if path.is_file() and path.read_text() == token:
        print("READY " + token, flush=True)
        sys.exit(0)
    time.sleep(0.1)
sys.exit("GATE TIMED OUT; DO NOT CONFIGURE OR UPDATE")
"""


def configuration_setup(*, native, pid, evidence, type_text, click, owned):
    click(named_button(native, evidence, "Chat"))
    prompt = (
        "Use voyager_workspace to inspect the workspace. Keep the original terminal and Workspace context. "
        "Create exactly two Notes content instances: one Vessel beside the existing terminal in the selected Fleet, "
        "and one Portal in its Voyage. Then inspect the workspace again and use set-portal-presentation "
        "with that Voyage ID and mode make-room, preserving its other presentation fields. Use fresh expectedVersion for each action. "
        "Do not create another Fleet, change data, edit files, launch programs or repeat an uncertain action. "
        "Report the actual owner outcomes briefly."
    )
    final, user = private_turn(
        native=native,
        pid=pid,
        evidence=evidence,
        wait=wait,
        type_text=type_text,
        prompt=prompt,
        context={"kind": "workspace"},
        owned=owned,
        name="notes-configuration-setup-turn",
    )
    tools = [
        message["tool"]
        for message in final["messages"]
        if message["role"] == "tool" and message["requestId"] == user["requestId"]
    ]
    assert all(
        tool["name"] == "voyager_workspace" and tool["status"] == "applied"
        for tool in tools
    )
    operations = [tool["action"]["action"]["operation"] for tool in tools]
    assert (
        operations.count("create-content") == 2
        and operations.count("set-portal-presentation") == 1
    )
    assert all(
        operation in ("inspect", "create-content", "set-portal-presentation")
        for operation in operations
    )
    click(chat_close_point(native, pid, evidence))
    wait(
        lambda: native("fields", pid, ["Message Voyager"], "window")["fields"],
        lambda fields: not fields,
        "setup Chat actually closed",
    )


def configuration(
    *,
    profile,
    evidence,
    native,
    pid,
    capture,
    stop,
    settle,
    start,
    click,
    tap,
    type_text,
    focus,
    copied,
    data,
    document,
    identity,
    receipt,
    ids,
    created,
    expected,
    owned,
):
    saved = data()
    dirty = expected[1]["text"]
    original_layout = json.loads(json.dumps(created["value"]))
    scripts = profile / "conversation"
    scripts.mkdir(exist_ok=True)
    script = scripts / "notes-configuration-gate.py"
    assert not script.exists()
    script.write_text(GATE_WAIT)
    initial_version = str(document()["version"])
    target = ids[0]
    terminal_id = original_layout["contents"][0]["id"]
    updated = {"title": "Agent configuration", "text": "OWNER_" + token_hex(6)}
    receipt(
        "notes-configuration-default",
        {
            "layout": document(),
            "fields": native("fields", pid())["fields"],
            "expectedEyebrows": ["NOTES", "NOTES"],
            "visualReviewRequired": True,
        },
    )
    capture("notes-configuration-default")
    for operation in ("configure", "update"):
        token = token_hex(12)
        gate = scripts / (operation + "-gate")
        assert not gate.exists()
        click(named_button(native, evidence, "Chat"))
        baseline = data()
        before = document()

        def release(submitted, user):
            nonlocal dirty
            click(chat_close_point(native, pid(), evidence))
            wait(
                lambda: native("fields", pid(), ["Message Voyager"], "window")[
                    "fields"
                ],
                lambda fields: not fields,
                "Chat actually closed",
            )
            focus("Note text", 1)
            tap(65367)
            suffix = "_DIRTY_" + operation
            type_text(suffix)
            dirty += suffix
            copied("Note text", 1, dirty, False)
            assert data() == baseline and document() == before
            receipt(
                "notes-configuration-" + operation + "-closed",
                {
                    "submitted": submitted,
                    "user": user,
                    "layout": before,
                    "fields": native("fields", pid())["fields"],
                    "dirtyText": dirty,
                    "baseRevisions": [
                        hashlib.sha256(value).hexdigest() for value in baseline
                    ],
                    "gateAbsent": not gate.exists(),
                    "gateToken": token,
                },
            )
            capture("notes-configuration-" + operation + "-before-gate")
            with gate.open("x") as file:
                file.write(token)
            if operation == "configure":
                wait(
                    document,
                    lambda doc: (
                        next(
                            item
                            for item in doc["value"]["contents"]
                            if item["id"] == target
                        ).get("configuration")
                        == {"showHeading": False}
                    ),
                    "actual owner configuration with Chat closed",
                    90,
                )
                selected = next(
                    item
                    for item in created["value"]["contents"]
                    if item["id"] == target
                )
                selected["configuration"] = {"showHeading": False}
                assert data() == saved
            else:
                wait(
                    data,
                    lambda values: json.loads(values[0]) == updated,
                    "actual owner data with Chat closed",
                    90,
                )
                expected[0] = updated
            assert not native("fields", pid(), ["Message Voyager"], "window")["fields"]
            copied("Note text", 1, dirty, False)
            assert data()[1] == baseline[1]
            receipt(
                "notes-configuration-" + operation + "-observed",
                {
                    "identity": identity(),
                    "fields": native("fields", pid())["fields"],
                    "user": user,
                    "dirtyText": dirty,
                    "gateToken": token,
                    "baseRevisions": [
                        hashlib.sha256(value).hexdigest() for value in baseline
                    ],
                    "data": [json.loads(value) for value in data()],
                    "chatClosed": True,
                    "visualReviewRequired": True,
                    "expectedEyebrows": [None, "NOTES"],
                },
            )
            capture("notes-configuration-" + operation + "-observed")
            if operation == "update":
                copied("Note title", 0, updated["title"])
                copied("Note text", 0, updated["text"])
            expected[1]["text"] = dirty
            click(named_button(native, evidence, "Chat"))

        command = (
            "python3 notes-configuration-gate.py " + gate.name + " " + token + " 45"
        )
        instruction = (
            f"First use your enabled native shell inspection tool to run exactly {command}. "
            f"Do not use application tools before its output contains READY {token}. "
            "A timeout, nonzero status or absent READY requires stopping with no content effect. "
            "After READY, inspect the current workspace with voyager_workspace for its fresh expectedVersion. "
            f"Use voyager_content describe and inspect on contentId {target}. "
        )
        if operation == "configure":
            instruction += (
                'Configure that instance exactly once with configuration {"showHeading":false}. '
                "Inspect the workspace again. Attempt exactly one unsupported configure using that fresh expectedVersion "
                f"and contentId {terminal_id}, the original Terminal, "
                'with configuration {"showHeading":false}; require rejection. '
                f"Attempt exactly one stale configure with expectedVersion {initial_version} "
                'and configuration {"showHeading":true}; require rejection. '
            )
        else:
            instruction += (
                "Update that instance exactly once using its inspected expectedRevision and data "
                + json.dumps(updated)
                + ". "
            )
        prompt = instruction + (
            "Inspect that same instance again to verify the actual owner result. "
            "Keep every other instance, source file, context, placement and program unchanged. "
            "Do not write files, use process tools, repeat an uncertain effect or treat a tool submission as completion. "
            "Report actual outcomes briefly."
        )
        final, user = private_turn(
            native=native,
            pid=pid(),
            evidence=evidence,
            wait=wait,
            type_text=type_text,
            prompt=prompt,
            context=created["value"]["context"],
            owned=owned,
            name="notes-configuration-" + operation + "-turn",
            accepted=release,
        )
        tools = [
            message["tool"]
            for message in final["messages"]
            if message["role"] == "tool" and message["requestId"] == user["requestId"]
        ]
        content = [tool for tool in tools if tool["name"] == "voyager_content"]
        effects = [
            tool
            for tool in content
            if tool["action"]["action"]["operation"] == operation
        ]
        assert len(effects) == (3 if operation == "configure" else 1), effects
        assert [tool["status"] for tool in effects] == (
            ["applied", "rejected", "rejected"]
            if operation == "configure"
            else ["applied"]
        ), effects
        actions = [tool["action"]["action"] for tool in effects]
        if operation == "configure":
            assert [action["contentId"] for action in actions] == [
                target,
                terminal_id,
                target,
            ]
            assert effects[0]["version"] == str(document()["version"])
        else:
            assert actions[0]["contentId"] == target
        inspections = [
            tool
            for tool in content
            if tool["action"]["action"]["operation"] == "inspect"
        ]
        assert len(inspections) == 2 and all(
            tool["status"] == "applied" for tool in inspections
        )
        assert inspections[0]["version"] == hashlib.sha256(baseline[0]).hexdigest()
        if operation == "configure":
            assert inspections[1]["version"] == inspections[0]["version"]
        else:
            assert actions[0]["expectedRevision"] == inspections[0]["version"]
            assert (
                inspections[1]["version"]
                == effects[0]["version"]
                != inspections[0]["version"]
            )
        assert all(
            tool["action"]["action"]["contentId"] == target
            for tool in content
            if tool not in effects
        )
        assert all(
            tool["name"] in ("voyager_workspace", "voyager_content") for tool in tools
        )
        assert all(
            tool["callbackIds"] and tool["callId"] and tool["requestId"]
            for tool in tools
        )
        assert len({tool["requestId"] for tool in tools}) == len(tools)
        click(chat_close_point(native, pid(), evidence))
        wait(
            lambda: native("fields", pid(), ["Message Voyager"], "window")["fields"],
            lambda fields: not fields,
            "receipt Chat closed again",
        )
        wait(
            data,
            lambda values: [json.loads(value) for value in values] == expected,
            "sibling saved after observed owner arrival",
        )
        receipt(
            "notes-configuration-" + operation + "-completed",
            {
                "identity": identity(),
                "tools": tools,
                "user": user,
                "data": expected,
                "closedPhaseEvidence": "notes-configuration-"
                + operation
                + "-observed.json",
            },
        )
    focus("Terminal", 0)
    expected[1]["text"] = dirty
    wait(
        data,
        lambda values: [json.loads(value) for value in values] == expected,
        "retained sibling final save",
    )
    stop()
    settle()
    start("notes-configuration-reopened")
    for index, note in enumerate(expected):
        for name, key in (("Note title", "title"), ("Note text", "text")):
            copied(name, index, note[key])
    observed = identity(cold=True)
    layout = json.loads(json.dumps(observed["layout"]["value"]))
    next(item for item in layout["contents"] if item["id"] == target).pop(
        "configuration"
    )
    assert layout == original_layout
    receipt(
        "notes-configuration-reopened",
        {
            "identity": observed,
            "data": expected,
            "fields": native("fields", pid())["fields"],
            "expectedEyebrows": [None, "NOTES"],
            "visualReviewRequired": True,
        },
    )
    capture("notes-configuration-reopened")
    return [
        "actual-owner-setup-native-notes-default-save",
        "real-owner-configure-with-dirty-sibling-and-unchanged-refusals",
        "separate-real-owner-update-with-chat-closed-and-dirty-sibling",
        "same-configuration-content-context-with-ended-terminal-after-cold-reopen",
    ]

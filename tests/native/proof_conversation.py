import json
import sys
import time
from pathlib import Path
from secrets import token_hex

from PIL import ImageChops

from proof_workspace import core_rpc, named_button
from proof_clipboard import Clipboard
from proof_process import observe_core_exit


def provider_processes(evidence):
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
    return providers


def chat_close_point(native, pid, evidence):
    fields = native("fields", pid, ["Close chat"], "window")["fields"]
    (evidence / "conversation-close-fields.json").write_text(
        json.dumps(fields, indent=2)
    )
    assert len(fields) == 2 and all(
        item["role"] in ("push button", "button")
        and item["width"] > 0
        and item["height"] > 0
        for item in fields
    ), fields
    target = min(fields, key=lambda item: item["width"])
    return (target["x"] + target["width"] / 2) / 2, (
        target["y"] + target["height"] / 2
    ) / 2


def conversation_ux(
    *, native, capture, geometry, close, evidence, session, env, click, type_text, read
):
    pid = json.loads((evidence / "launch.json").read_text())["pid"]
    providers = []
    errors = []
    original_clipboard = None

    def document():
        return core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})

    def wait(get, predicate, label, seconds=15):
        end = time.monotonic() + seconds
        value = None
        while time.monotonic() < end:
            value = get()
            if value is not None and predicate(value):
                return value
            time.sleep(0.1)
        raise AssertionError(f"Timed out waiting for {label}: {value}")

    def fields(name):
        return native("fields", pid, [name], "window")["fields"]

    def input_value():
        matches = fields("Message Voyager")
        (evidence / "conversation-ux-input-fields.json").write_text(
            json.dumps(matches, indent=2)
        )
        return matches[0] if len(matches) == 1 else None

    def focus_input():
        native("focus", pid, "Message Voyager", 0)
        wait(input_value, lambda item: item["focused"], "focused chat input")

    clipboard = Clipboard(env, wait)

    def copied_text(expected):
        focus_input()
        sentinel = ("voyager-clipboard-" + token_hex(16)).encode()
        clipboard.write(sentinel)
        native("key", 65507, True)
        for key in (ord("a"), ord("c")):
            native("key", key, True)
            native("key", key, False)
        native("key", 65507, False)
        native("key", 65367, True)
        native("key", 65367, False)
        clipboard.written.add(expected.encode())
        copied = wait(clipboard.read, lambda value: value != sentinel, "editor copy", 5)
        assert copied == expected.encode(), "Copied editor text did not match"

    try:
        initial = wait(
            document,
            lambda doc: bool(doc["value"]["contents"][0].get("backend")),
            "bound terminal",
        )
        fleet = initial["value"]["selectedFleet"]
        vessel = initial["value"]["voyages"][0]["fleets"][0]["vessels"][0]["id"]
        target = wait(
            lambda: fields("Vessel dock"),
            lambda items: (
                len(items) == 1 and items[0]["width"] > 0 and items[0]["height"] > 0
            ),
            "Vessel dock",
        )
        native("focus", pid, "Vessel dock", 0)
        wait(
            lambda: fields("Vessel dock"),
            lambda items: len(items) == 1 and items[0]["focused"],
            "focused Vessel dock",
        )
        native("key", 65505, True)
        native("key", 65293, True)
        native("key", 65293, False)
        native("key", 65505, False)
        scoped = wait(
            document,
            lambda doc: doc["value"]["context"] == {"kind": "vessel", "id": vessel},
            "Vessel context",
        )
        click(*named_button(native, evidence, "Chat"))
        idle = wait(read, lambda state: state["phase"] == "idle", "idle chat")
        assert idle["thread"] is None
        original_clipboard = clipboard.preserve(
            evidence / "conversation-ux-clipboard-types.json"
        )
        try:
            wait(
                input_value,
                lambda item: item["width"] > 0 and item["height"] > 0,
                "chat input",
            )
        except AssertionError:
            try:
                all_fields = native("fields", pid, None, "window")["fields"]
                (evidence / "conversation-ux-all-fields.json").write_text(
                    json.dumps(all_fields, indent=2)
                )
            except Exception as error:
                print(f"Accessibility diagnostic failed: {error}", file=sys.stderr)
            raise
        focus_input()
        prompt = (
            "Reply with twelve short numbered lines about a quiet ocean. Use no tools."
        )
        type_text(prompt)
        copied_text(prompt)
        capture("conversation-ux-vessel-draft")
        click(*named_button(native, evidence, "Send"))
        wait(read, lambda state: state["turn"] is not None, "started turn")
        providers = wait(
            lambda: provider_processes(evidence), bool, "provider identity"
        )
        (evidence / "provider-processes.json").write_text(
            json.dumps(providers, indent=2)
        )
        final = wait(
            read,
            lambda state: state["phase"] in ("completed", "failed", "unconfirmed"),
            "completed turn",
            90,
        )
        assert (
            final["phase"] == "completed"
            and final["thread"]
            and final["turn"]
            and final["model"]
            and not final["limited"]
        ), final
        users = [message for message in final["messages"] if message["role"] == "user"]
        answers = [
            message for message in final["messages"] if message["role"] == "assistant"
        ]
        assert len(users) == 1 and users[0]["text"] == prompt and answers
        assert all(answer["text"].strip() for answer in answers), answers
        assert all(
            answer["requestId"] == users[0]["requestId"]
            and answer["context"] == users[0]["context"]
            for answer in answers
        )
        assert (
            users[0]["context"]["scope"] == scoped["value"]["context"]
            and users[0]["context"]["revision"].isdigit()
        )
        assert not [
            message for message in final["messages"] if message["role"] == "tool"
        ]
        assert sum(len(answer["text"].splitlines()) for answer in answers) >= 12, (
            answers
        )
        scroll_layout = document()
        core_before = core_rpc(session, env, "server.status", {})
        terminal_id = initial["value"]["contents"][0]["backend"]
        terminal_before = core_rpc(
            session, env, "terminal.get", {"terminal": terminal_id}
        )
        field = input_value()
        bounds = geometry()
        width, height = int(bounds["WIDTH"]), int(bounds["HEIGHT"])
        x = field["x"] + field["width"] / 2
        y = field["y"] - 100
        assert 0 < x < width and 0 < y < height, field
        native("move", int(bounds["X"]) + round(x), int(bounds["Y"]) + round(y), 2)
        frames = [capture("conversation-ux-scroll-start")]
        crop = (
            round(field["x"] * frames[0].width / width),
            round(max(0, field["y"] - 250) * frames[0].height / height),
            round((field["x"] + field["width"]) * frames[0].width / width),
            round((field["y"] - 20) * frames[0].height / height),
        )
        assert crop[0] < crop[2] and crop[1] < crop[3], crop
        differences = {}
        for direction, delta in (("down", 96), ("up", -96)):
            for _ in range(8):
                native("scroll", delta, 0)
                time.sleep(0.08)
            native("scroll", 0, 1)
            time.sleep(0.3)
            frames.append(capture("conversation-ux-scroll-" + direction))
            differences[direction] = ImageChops.difference(
                frames[-2].crop(crop), frames[-1].crop(crop)
            ).getbbox()
            assert differences[direction], differences
        core_after = core_rpc(session, env, "server.status", {})
        terminal_after = core_rpc(
            session, env, "terminal.get", {"terminal": terminal_id}
        )
        assert document() == scroll_layout
        assert (core_before["pid"], core_before["core"]["id"]) == (
            core_after["pid"],
            core_after["core"]["id"],
        )
        assert terminal_before["pid"] == terminal_after["pid"]
        assert read()["messages"] == final["messages"]
        (evidence / "conversation-ux-scroll.json").write_text(
            json.dumps(
                {
                    "field": field,
                    "point": [x, y],
                    "crop": crop,
                    "differences": differences,
                    "layout": scroll_layout,
                    "coreBefore": core_before,
                    "coreAfter": core_after,
                    "terminalBefore": terminal_before,
                    "terminalAfter": terminal_after,
                },
                indent=2,
            )
        )
        draft = "Keep this draft"
        focus_input()
        type_text(draft)
        copied_text(draft)
        click(*named_button(native, evidence, "Toggle sidebar"))
        collapsed = wait(
            document,
            lambda doc: doc["value"]["context"] == {"kind": "fleet", "id": fleet},
            "collapsed Fleet context",
        )
        copied_text(draft)
        capture("conversation-ux-collapsed")
        toggles = wait(
            lambda: fields("Close chat"),
            lambda items: (
                len(items) == 2
                and all(
                    item["role"] in ("push button", "button")
                    and item["width"] > 0
                    and item["height"] > 0
                    for item in items
                )
            ),
            "two Close chat controls",
        )
        toggles.sort(key=lambda item: item["width"])
        assert toggles[0]["width"] < toggles[1]["width"], toggles
        fleet_dock = wait(
            lambda: fields("Fleet dock"),
            lambda items: len(items) == 1 and items[0]["height"] > 0,
            "compact Fleet dock",
        )[0]
        assert toggles[1]["y"] >= fleet_dock["y"] + fleet_dock["height"], (
            "Compact chat overlaps its Fleet dock"
        )
        toggle = toggles[0]
        click(
            (toggle["x"] + toggle["width"] / 2) / 2,
            (toggle["y"] + toggle["height"] / 2) / 2,
        )
        wait(lambda: fields("Message Voyager"), lambda items: not items, "closed chat")
        click(*named_button(native, evidence, "Chat"))
        copied_text(draft)
        capture("conversation-ux-reopened")
        click(*named_button(native, evidence, "Toggle sidebar"))
        expanded = wait(
            document,
            lambda doc: doc["value"]["context"] == {"kind": "workspace"},
            "expanded Workspace context",
        )
        copied_text(draft)
        after = read()
        assert (
            len([message for message in after["messages"] if message["role"] == "user"])
            == 1
        )
        assert after["thread"] == final["thread"] and after["turn"] == final["turn"]
        assert after["messages"] == final["messages"]
        capture("conversation-ux-expanded")
        click(*named_button(native, evidence, "Home"))
        home = wait(document, lambda doc: doc["value"].get("view") == "home", "Home")
        assert home["value"]["context"] == expanded["value"]["context"]
        assert home["value"]["contents"] == expanded["value"]["contents"]
        copied_text(draft)
        home_chat = read()
        assert home_chat["messages"] == final["messages"]
        assert (
            home_chat["thread"] == final["thread"]
            and home_chat["turn"] == final["turn"]
        )
        capture("conversation-ux-home")
        (evidence / "conversation-ux-observed.json").write_text(
            json.dumps(
                {
                    "target": target,
                    "initial": initial,
                    "scoped": scoped,
                    "collapsed": collapsed,
                    "expanded": expanded,
                    "home": home,
                    "final": final,
                    "after": after,
                    "closeControls": toggles,
                    "fleetDock": fleet_dock,
                },
                indent=2,
            )
        )
        return [
            "native-vessel-scoped-turn",
            "native-live-chat-scroll-both-directions",
            "collapsed-chat-draft-reopened",
            "expanded-history-retained",
            "home-retained-chat-and-context",
        ]
    finally:
        primary = sys.exc_info()[0] is not None
        observations = []
        if original_clipboard is not None and clipboard.mutated:
            try:
                clipboard.write(original_clipboard)
            except Exception as error:
                errors.append(f"clipboard restore: {error}")
        try:
            for provider in provider_processes(evidence):
                if provider not in providers:
                    providers.append(provider)
        except Exception as error:
            errors.append(f"provider scan: {error}")

        def observe_core():
            observe_core_exit(session, env)

        for name, action in (("quit", close), ("core exit", observe_core)):
            try:
                action()
            except Exception as error:
                errors.append(f"{name}: {error}")
        for provider in providers:
            path = Path("/proc") / str(provider["pid"])
            try:
                for _ in range(50):
                    if not path.exists():
                        observations.append({"provider": provider, "state": "absent"})
                        break
                    stat = path.joinpath("stat").read_text().rsplit(") ", 1)[1].split()
                    if stat[19] != provider["start"] or stat[0] == "Z":
                        observations.append(
                            {
                                "provider": provider,
                                "state": "reused"
                                if stat[19] != provider["start"]
                                else "zombie",
                            }
                        )
                        break
                    time.sleep(0.1)
                else:
                    errors.append(f"provider survived Quit: {provider}")
            except FileNotFoundError:
                observations.append({"provider": provider, "state": "absent"})
            except Exception as error:
                errors.append(f"provider observation: {error}")
        try:
            (evidence / "conversation-ux-cleanup.json").write_text(
                json.dumps({"errors": errors, "providers": observations}, indent=2)
            )
        except Exception as error:
            errors.append(f"cleanup receipt: {error}")
        if errors and primary:
            print(f"Conversation cleanup errors: {errors}", file=sys.stderr)
        if errors and not primary:
            raise AssertionError(f"Conversation cleanup failed: {errors}")


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

    pid = json.loads((evidence / "launch.json").read_text())["pid"]

    if journey == "conversation-ux":
        return conversation_ux(
            native=native,
            capture=capture,
            geometry=geometry,
            close=close,
            evidence=evidence,
            session=session,
            env=env,
            click=click,
            type_text=type_text,
            read=read,
        )

    content_case = journey == "conversation-content"
    process_case = journey == "conversation-process"
    closed_chat = journey == "conversation-workspace-refresh"
    administrator = closed_chat or journey in (
        "conversation-administrator",
        "conversation-process",
    )
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
        click(*named_button(native, evidence, "Chat"))
    idle = wait(lambda state: state["phase"] == "idle", 5)
    assert idle["thread"] is None, "Opening chat started the provider"
    capture("conversation-open")
    if administrator or content_case:
        marker = token_hex(8)
        initial = core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})
        if administrator:
            fixture = evidence / "profile/conversation/administrator-read.txt"
            fixture.parent.mkdir(parents=True, exist_ok=True)
            fixture.write_text(marker)
    if process_case or content_case:
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
    native("focus", pid, "Message Voyager", 0)
    time.sleep(0.2)
    capture("conversation-focused")
    type_text(
        f"Read administrator-read.txt using native inspection. Use voyager_workspace to inspect and voyager_process to list and read the existing terminal {content['backend']}. Submit exactly printf 'ADMIN_%s\\n' PROCESS; sleep 30 to that terminal. Input submitted is not job readiness. Use process reads to inspect until its actual foreground name is sleep, then explicitly interrupt that job and read its actual result. Finally create exactly one Fleet named Native admin in the existing Voyage. Report the file marker, observed output and actual Core interrupt result briefly. Do not stop or restart terminals, launch agents, change files, repeat the send or combine interrupt/send automatically."
        if process_case
        else "Use your native file read tool to read administrator-read.txt in your current directory. Then use voyager_workspace to inspect the workspace and create exactly one Fleet named Native admin inside the existing Voyage. Report the file marker and actual result briefly. Do not change project files or launch agents."
        if administrator
        else f"Use voyager_workspace to inspect this workspace. Create exactly two Notes instances: one Vessel beside the existing terminal in the selected Fleet and one Portal in this Voyage. Use voyager_content to describe and inspect each instance, then update its title and text with the inspected revision. The Vessel title must be Fleet notes and text must be FLEET_{marker}. The Portal title must be Voyage notes and text must be VOYAGE_{marker}. Inspect both again to verify saved data. Keep all existing content and context unchanged. Do not edit files, send terminal input, create Fleets, repeat an uncertain action or use native tools to bypass the content owner."
        if content_case
        else "Count from one to one hundred in words. Use no tools."
        if journey == "conversation-interrupt"
        else "Reply with one short sentence about a quiet ocean. Use no tools."
    )
    capture("conversation-draft")
    close_point = chat_close_point(native, pid, evidence) if closed_chat else None
    native("key", 65293, True)
    native("key", 65293, False)
    if closed_chat:
        click(*close_point)
        deadline = time.monotonic() + 5
        while native("fields", pid, ["Message Voyager"], "window")["fields"]:
            assert time.monotonic() < deadline, "Chat did not close"
            time.sleep(0.05)
        before_effect = core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})
        assert before_effect["value"]["voyages"] == initial["value"]["voyages"], (
            "The model acted before Chat closed; this run cannot prove closed-Chat refresh"
        )
        capture("workspace-refresh-chat-closed-before-effect")
        deadline = time.monotonic() + 90
        while True:
            observed = core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})
            if len(observed["value"]["voyages"][0]["fleets"]) == 2:
                break
            assert time.monotonic() < deadline, (
                "No workspace effect while Chat was closed"
            )
            time.sleep(0.1)
        point = named_button(native, evidence, "Native admin")
        assert not native("fields", pid, ["Message Voyager"], "window")["fields"]
        capture("workspace-refresh-fleet-visible-chat-closed")
        (evidence / "workspace-refresh-closed.json").write_text(
            json.dumps(
                {"before": before_effect, "after": observed, "nativeFleetPoint": point},
                indent=2,
            )
        )
        click(*named_button(native, evidence, "Chat"))
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
    providers = provider_processes(evidence)
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
        ),
        240 if content_case else 90,
    )
    (evidence / "conversation-first.json").write_text(json.dumps(first, indent=2))
    capture("conversation-progress")
    final = wait(
        lambda state: state["phase"] in ("completed", "failed", "unconfirmed"),
        240 if content_case else 90,
    )
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
    if content_case:
        tools = [message for message in final["messages"] if message["role"] == "tool"]
        assert tools and all(
            message["tool"]["status"] == "applied" for message in tools
        )
        assert all(
            message["context"] == users[0]["context"]
            and message["requestId"] == users[0]["requestId"]
            and message["tool"]["callId"] == message["id"]
            and message["tool"]["callbackIds"]
            for message in tools
        )
        actions = [
            message["tool"]["action"]["action"]
            for message in tools
            if message["tool"]["name"] == "voyager_content"
        ]
        assert {action["operation"] for action in actions} == {
            "describe",
            "inspect",
            "update",
        }
        assert sum(action["operation"] == "update" for action in actions) == 2
        observed = core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})
        layout = observed["value"]
        voyage = layout["voyages"][0]
        fleet = voyage["fleets"][0]
        assert (
            len(layout["contents"]) == 3
            and len(fleet["vessels"]) == 2
            and len(voyage["portals"]) == 1
        )
        assert layout["context"] == initial["value"]["context"]
        assert layout["contents"][0] == initial["value"]["contents"][0]
        ids = [fleet["vessels"][1]["content"], voyage["portals"][0]["content"]]
        expected = [
            {"title": "Fleet notes", "text": f"FLEET_{marker}"},
            {"title": "Voyage notes", "text": f"VOYAGE_{marker}"},
        ]
        assert ids[0] != ids[1]
        for key in ids:
            calls = [
                message["tool"]
                for message in tools
                if message["tool"]["name"] == "voyager_content"
                and message["tool"]["action"]["action"]["contentId"] == key
            ]
            assert [call["action"]["action"]["operation"] for call in calls] == [
                "describe",
                "inspect",
                "update",
                "inspect",
            ]
            assert (
                calls[2]["action"]["action"]["expectedRevision"] == calls[1]["version"]
            )
            assert calls[3]["version"] == calls[2]["version"] != calls[1]["version"]
        assert [
            json.loads((evidence / "profile/data" / (key + ".json")).read_text())
            for key in ids
        ] == expected
        click(*chat_close_point(native, pid, evidence))
        deadline = time.monotonic() + 10
        while True:
            fields = native("fields", pid, ["Note title", "Note text"], "window")[
                "fields"
            ]
            if len(fields) == 4 and all(
                item["role"] == "entry" and item["width"] > 0 and item["height"] > 0
                for item in fields
            ):
                break
            assert time.monotonic() < deadline, fields
            time.sleep(0.1)
        (evidence / "content-agent-observed.json").write_text(
            json.dumps(
                {
                    "layout": observed,
                    "ids": ids,
                    "data": expected,
                    "fields": fields,
                    "renderedTextRequiresVisualReview": True,
                },
                indent=2,
            )
        )
        capture("content-agent-both-native-views")
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
        click(*chat_close_point(native, pid, evidence))
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
    if administrator or content_case:
        observe_core_exit(session, env)
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
    return (
        (
            ["native-content-agent-create-inspect-update-both-scopes"]
            if content_case
            else []
        )
        + (["native-workspace-refresh-with-chat-closed"] if closed_chat else [])
        + [
            "native-private-text-completed",
            "matching-thread-turn-request-context",
            "native-quit",
        ]
    )


def package_turn(*, native, pid, evidence, wait, type_text, operation, context, owned):
    assert operation in ("remove", "restore") and context == {"kind": "workspace"}

    def read():
        path = evidence / "conversation.json"
        return json.loads(path.read_text()) if path.exists() else None

    before = wait(
        read,
        lambda state: state["phase"] in ("idle", "completed"),
        "ready private conversation",
    )
    prior = {
        message["requestId"]
        for message in before["messages"]
        if message["role"] == "user"
    }
    wait(
        lambda: native("fields", pid, ["Message Voyager"], "window")["fields"],
        lambda fields: (
            len(fields) == 1 and fields[0]["width"] > 0 and fields[0]["height"] > 0
        ),
        "visible private composer",
    )
    native("focus", pid, "Message Voyager", 0)
    wait(
        lambda: native("fields", pid, ["Message Voyager"], "window")["fields"],
        lambda values: len(values) == 1 and values[0]["focused"],
        "focused private composer",
    )
    prompt = f"Use voyager_workspace to inspect this workspace once, then perform exactly one {operation}-content-package action with typeId notes. Keep all content, data, canvas, context, programs and source files unchanged. Use no other tools or effects. Never repeat an uncertain action. Report the actual package outcome briefly."
    type_text(prompt)
    native("key", 65293, True)
    native("key", 65293, False)
    submitted = wait(
        read,
        lambda state: any(
            message["role"] == "user" and message["requestId"] not in prior
            for message in state["messages"]
        ),
        "new submitted package request",
    )
    user = next(
        message
        for message in submitted["messages"]
        if message["role"] == "user" and message["requestId"] not in prior
    )
    assert user["text"] == prompt and user["context"]["scope"] == context
    providers = wait(
        lambda: provider_processes(evidence), bool, "actual private provider", 20
    )
    for provider in providers:
        owned[f"provider-{provider['pid']}-{provider['start']}"] = provider
    final = wait(
        read,
        lambda state: (
            state["phase"] in ("completed", "failed", "unconfirmed")
            and any(
                message["role"] == "user" and message["requestId"] == user["requestId"]
                for message in state["messages"]
            )
        ),
        "package turn completed without replay",
        90,
    )
    (evidence / ("notes-lifetime-package-" + operation + ".json")).write_text(
        json.dumps(final, indent=2)
    )
    assert final["phase"] == "completed" and final["thread"] and final["turn"]
    assert not final["limited"]
    assert (
        len(
            [
                message
                for message in final["messages"]
                if message["role"] == "user" and message["requestId"] not in prior
            ]
        )
        == 1
    )
    tools = [
        message
        for message in final["messages"]
        if message["role"] == "tool" and message["requestId"] == user["requestId"]
    ]
    assert [message["tool"]["action"]["action"]["operation"] for message in tools] == [
        "inspect",
        operation + "-content-package",
    ]
    assert len({message["id"] for message in tools}) == len(tools)
    assert len({message["tool"]["requestId"] for message in tools}) == len(tools)
    assert all(
        message["context"] == user["context"]
        and message["tool"]["name"] == "voyager_workspace"
        and message["tool"]["status"] == "applied"
        and message["tool"]["callId"] == message["id"]
        and message["tool"]["requestId"]
        and message["tool"]["callbackIds"]
        and message["tool"]["version"].isdigit()
        for message in tools
    )
    assert tools[1]["tool"]["action"]["action"]["typeId"] == "notes"
    assert any(
        message["role"] == "assistant"
        and message["requestId"] == user["requestId"]
        and message["text"]
        for message in final["messages"]
    )
    return final

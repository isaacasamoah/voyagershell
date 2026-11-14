import hashlib
import json
import os
import sys
import time
from pathlib import Path
from secrets import token_hex

from proof_clipboard import Clipboard
from proof_conversation import package_turn, private_turn, provider_processes
from proof_foundation_notes import notes, observe_owned_exit, wait
from proof_process import exit_observation, process_identity
from proof_workspace import click_control, core_rpc, review_frame, stop_existing_core


def source_variant(source, case, marker):
    source = notes.once(
        source, ".child(this.session.filename())", f".child({json.dumps(marker)})"
    )
    if case == "parse":
        return source + "\nexport const broken = ;\n"
    if case == "render":
        return notes.once(
            source,
            "  render() {",
            '  render() { throw Error("Lifetime render failure");',
        )
    if case == "component":
        return notes.once(
            source,
            "Title.new(this.title).w_full()",
            'Title.new(this.title).child("invalid").w_full()',
        )
    assert case == "valid", case
    return source


def prove(
    *,
    profile,
    evidence,
    native,
    pid,
    capture,
    close,
    start_frame,
    resize_window,
    geometry,
    session,
    env,
    journey,
):
    assert journey == "notes-lifetime", (
        "The historical notes-configuration journey is unaccepted: its NOTES eyebrow "
        "expectation conflicts with the approved Markdown UI. Preserve its source."
    )
    opened = True
    owned, errors = {}, []
    original_clipboard = None
    header = profile / "mods/header/main.js"
    package = profile / "mods/notes/main.js"
    original_header = original_source = None
    targets = []
    accessibility_before = None
    workspace = evidence / "notes-workspace"

    def control(name):
        click_control(native, capture, geometry, evidence, pid(), name, targets)

    def encoded(note):
        return f"# {note['title']}\n\n{note['text']}".encode()

    def source_files(directory):
        return {
            str(path.relative_to(directory)): path.read_bytes()
            for path in directory.rglob("*")
            if path.is_file()
        }

    def visual(name, frame):
        receipt(frame + "-visual", review_frame(capture, evidence, name, frame))

    def receipt(name, value):
        (evidence / (name + ".json")).write_text(json.dumps(value, indent=2))

    def rpc(method, params):
        socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
        assert socket.is_socket(), "The dedicated Core is absent"
        return core_rpc(session, env, method, params)

    def document():
        return rpc("doc.get", {"name": "voyager-layout-v1"})

    def record(name, process):
        identity = process_identity(process, metadata_only=True)
        assert identity["uid"] == os.getuid(), identity
        owned[name] = {"pid": process, **identity}

    def stop():
        nonlocal opened
        if opened:
            for provider in provider_processes(evidence):
                owned[f"provider-{provider['pid']}-{provider['start']}"] = provider
            providers = [
                value for name, value in owned.items() if name.startswith("provider-")
            ]
            socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
            opened = False
            close()
            exited = wait(
                lambda: exit_observation(providers, socket),
                lambda result: all(
                    item["observedState"] in ("absent", "pid-reused")
                    for item in result["processes"]
                ),
                "private providers exited after Quit",
            )
            assert socket.is_socket(), "Frontend Quit stopped the retained Core"
            receipt(f"notes-lifetime-provider-exit-{pid()}", exited)

    def start(name):
        nonlocal opened
        previous = evidence / "conversation.json"
        if previous.exists():
            retained = evidence / (name + "-previous-conversation.json")
            assert not retained.exists()
            previous.rename(retained)
        frame = start_frame(name)
        opened = True
        record("app-" + str(pid()), pid())
        assert frame.size == (1450, 940), frame.size
        bounds = geometry()
        assert [int(bounds[key]) for key in ("WIDTH", "HEIGHT")] == [
            frame.width * 2,
            frame.height * 2,
        ]
        return frame

    def click(point):
        bounds = geometry()
        native(
            "move",
            int(bounds["X"]) + round(point[0] * 2),
            int(bounds["Y"]) + round(point[1] * 2),
            2,
        )
        native("button", True)
        native("button", False)

    def tap(key):
        native("key", key, True)
        native("key", key, False)

    def type_text(value):
        for character in value:
            tap(65293 if character == "\n" else ord(character))

    def fields():
        return native("fields", pid(), ["Note title", "Note text"], "window")["fields"]

    def editors():
        result = wait(
            fields,
            lambda items: (
                len(items) == 4
                and all(item["width"] > 0 and item["height"] > 0 for item in items)
            ),
            "four real Notes editors",
        )
        titles = [item for item in result if item["name"] == "Note title"]
        bodies = [item for item in result if item["name"] == "Note text"]
        assert len(titles) == len(bodies) == 2
        assert titles[0]["x"] + titles[0]["width"] <= titles[1]["x"]
        assert bodies[0]["x"] + bodies[0]["width"] <= bodies[1]["x"]
        return result

    def focus(name, index):
        if name == "Terminal":
            assert index == 0
            control("Terminal input")
            return
        else:
            target = [item for item in editors() if item["name"] == name][index]
        click(
            (
                (target["x"] + target["width"] / 2) / 2,
                (target["y"] + target["height"] / 2) / 2,
            )
        )

    def select_all():
        native("key", 65507, True)
        tap(ord("a"))
        native("key", 65507, False)

    clipboard = Clipboard(env, wait)

    def copied(name, index, expected, refocus=True):
        sentinel = ("lifetime-clipboard-" + token_hex(12)).encode()
        clipboard.write(sentinel)
        if refocus:
            focus(name, index)
        select_all()
        native("key", 65507, True)
        tap(ord("c"))
        native("key", 65507, False)
        tap(65367)
        clipboard.written.add(expected.encode())
        value = wait(
            clipboard.read, lambda value: value != sentinel, "native copied text", 5
        )
        assert value == expected.encode(), "The real editor text differs"

    def data():
        return [path.read_bytes() for path in paths]

    def identity():
        current = document()
        assert current["value"] == created["value"], (
            "Workspace identity or state changed"
        )
        actual = rpc("terminal.get", {"terminal": target})
        actual_core = rpc("server.status", {})
        assert actual["pid"] == terminal["pid"] and actual["state"] == "live"
        assert process_identity(actual["pid"], metadata_only=True) == {
            key: value for key, value in owned["terminal"].items() if key != "pid"
        }
        assert (actual_core["pid"], actual_core["core"]["id"]) == (
            core["pid"],
            core["core"]["id"],
        )
        assert process_identity(actual_core["pid"], metadata_only=True) == {
            key: value for key, value in owned["core"].items() if key != "pid"
        }
        original = rpc("terminal.get", {"terminal": initial_target})
        assert (
            original["pid"] == initial_terminal["pid"] and original["state"] == "live"
        )
        assert process_identity(original["pid"], metadata_only=True) == {
            key: value
            for key, value in owned["initial-terminal"].items()
            if key != "pid"
        }
        return {"layout": current, "terminal": actual, "core": actual_core}

    try:
        accessibility_before = native("accessibility-state")["enabled"]
        native("accessibility-state", False)
        native("accessibility-state", True)
        record("initial-app", pid())
        original_header, original_source = header.read_bytes(), package.read_bytes()
        assert (
            original_source
            == (
                Path(__file__).resolve().parents[2] / "content/notes/main.js"
            ).read_bytes()
        ), "Fresh shipped Notes source is required"
        frame = capture("notes-lifetime-initial")
        bounds = geometry()
        assert frame.size == (1450, 940) and [
            int(bounds[key]) for key in ("WIDTH", "HEIGHT")
        ] == [frame.width * 2, frame.height * 2]
        initial = wait(
            document,
            lambda doc: bool(doc["value"]["contents"][0].get("backend")),
            "initial terminal",
        )
        target = initial["value"]["contents"][0]["backend"]
        terminal = wait(
            lambda: rpc("terminal.get", {"terminal": target}),
            lambda item: bool(item.get("pid")) and item["state"] == "live",
            "original live shell identity",
        )
        core = rpc("server.status", {})
        initial_target, initial_terminal = target, terminal
        record("initial-terminal", terminal["pid"])
        record("core", core["pid"])
        original_clipboard = clipboard.preserve(
            evidence / "notes-lifetime-clipboard.json"
        )
        workspace.mkdir()
        control("Chat")
        final, user = private_turn(
            native=native,
            pid=pid(),
            evidence=evidence,
            wait=wait,
            type_text=type_text,
            prompt=(
                f"Inspect this workspace. Create exactly one Voyage named Lifetime trial with cwd {workspace}. "
                "In its first Fleet create exactly two independent Notes instances: one Vessel beside its terminal "
                "and one Portal. Set that Voyage's Portal presentation to make-room. Keep all existing content, "
                "programs and explicit Workspace context unchanged. Use only voyager_workspace, fresh versions "
                "and no other effects. Inspect after a known stale refusal, but never repeat an uncertain action."
            ),
            context={"kind": "workspace"},
            owned=owned,
            name="notes-lifetime-setup-turn",
            focus=lambda: control("Message Voyager"),
        )
        tools = [
            {**message["tool"], "text": message["text"]}
            for message in final["messages"]
            if message["role"] == "tool" and message["requestId"] == user["requestId"]
        ]
        assert tools and all(
            tool["name"] == "voyager_workspace"
            and (
                tool["status"] == "applied"
                or (
                    tool["status"] == "rejected"
                    and tool["action"]["action"]["operation"] == "create-content"
                    and tool["text"]
                    == "Workspace request refused: invalid_workspace: Layout changed; inspect it before making a new request"
                )
            )
            for tool in tools
        ), tools
        assert len({tool["requestId"] for tool in tools}) == len(tools)
        operations = [
            tool["action"]["action"]["operation"]
            for tool in tools
            if tool["status"] == "applied"
        ]
        assert (
            operations.count("create-voyage")
            == operations.count("set-portal-presentation")
            == 1
        )
        assert operations.count("create-content") == 2
        assert all(
            operation
            in ("inspect", "create-voyage", "create-content", "set-portal-presentation")
            for operation in operations
        )
        control("Close chat")
        created = wait(
            document,
            lambda doc: (
                len(doc["value"]["contents"]) == len(initial["value"]["contents"]) + 3
                and any(
                    v["cwd"] == str(workspace)
                    and v["portalLayout"]["mode"] == "make-room"
                    for v in doc["value"]["voyages"]
                )
                and all(
                    item.get("backend") and not item.get("startPending")
                    for item in doc["value"]["contents"]
                    if item["cwd"] == str(workspace) and item["typeId"] == "terminal"
                )
            ),
            "typed Notes/make-room setup",
        )
        assert len(created["value"]["voyages"]) == len(initial["value"]["voyages"]) + 1
        assert (
            created["value"]["contents"][: len(initial["value"]["contents"])]
            == initial["value"]["contents"]
        )
        assert created["value"]["voyages"][:-1] == initial["value"]["voyages"]
        voyage = next(
            v for v in created["value"]["voyages"] if v["cwd"] == str(workspace)
        )
        fleet = voyage["fleets"][0]
        assert (
            len(voyage["fleets"]) == 1
            and len(fleet["vessels"]) == 2
            and len(voyage["portals"]) == 1
        )
        ids = [fleet["vessels"][1]["content"], voyage["portals"][0]["content"]]
        assert ids[0] != ids[1] and created["value"]["context"] == {"kind": "workspace"}
        assert created["value"]["contents"][0] == initial["value"]["contents"][0]
        assert all(
            item["typeId"] == "notes"
            and not item.get("backend")
            and not item.get("startPending")
            for item in created["value"]["contents"]
            if item["id"] in ids
        )
        paths = []
        for id in ids:
            note = next(
                item for item in created["value"]["contents"] if item["id"] == id
            )
            binding = note["configuration"]["notesFile"]
            path = Path(binding["directory"]) / binding["filename"]
            assert path.parent == workspace / "notes" and path.is_file()
            paths.append(path)
        assert paths[0] != paths[1]
        target = next(
            item["backend"]
            for item in created["value"]["contents"]
            if item["cwd"] == str(workspace) and item["typeId"] == "terminal"
        )
        terminal = wait(
            lambda: rpc("terminal.get", {"terminal": target}),
            lambda item: item["state"] == "live" and bool(item.get("pid")),
            "private Voyage shell",
        )
        record("terminal", terminal["pid"])
        receipt(
            "notes-lifetime-setup",
            {
                "kind": "actual private model owner setup; supported make-room, not default-overlay evidence",
                "initial": initial,
                "created": created,
                "ids": ids,
            },
        )
        marker = token_hex(6)
        expected = [
            {"title": "Lifetime Fleet", "text": "FLEET_" + marker},
            {"title": "Lifetime Voyage", "text": "VOYAGE_" + marker},
        ]
        for index, note in enumerate(expected):
            for name, key in (("Note title", "title"), ("Note text", "text")):
                focus(name, index)
                select_all()
                type_text(note[key])
            focus("Terminal", 0)
            wait(
                data,
                lambda values: values[index] == encoded(note),
                "native blur save",
            )
        for index, note in enumerate(expected):
            for name, key in (("Note title", "title"), ("Note text", "text")):
                copied(name, index, note[key])
        saved = data()
        receipt(
            "notes-lifetime-reopened",
            {
                "identity": identity(),
                "data": expected,
                "fields": editors(),
                "visualReviewRequired": True,
            },
        )
        capture("notes-lifetime-both-reopened")
        markdown = "# Preview " + marker + " **raw**"
        focus("Note text", 0)
        select_all()
        type_text(markdown)
        copied("Note text", 0, markdown, False)
        tap(65361)
        assert data() == saved, "The Markdown draft was saved before Preview"
        buttons = native("fields", pid(), ["Preview note"], "window")["fields"]
        assert len(buttons) == 2, buttons
        button = min(buttons, key=lambda item: item["x"])
        receipt(
            "notes-preview-unsaved",
            {"draft": markdown, "button": button, "identity": identity()},
        )
        click(
            (
                (button["x"] + button["width"] / 2) / 2,
                (button["y"] + button["height"] / 2) / 2,
            )
        )
        wait(
            fields,
            lambda items: sum(item["name"] == "Note text" for item in items) == 1,
            "Fleet body replaced by native Markdown preview",
        )
        capture("notes-markdown-preview")
        visual(
            "Fleet Notes must render the current unsaved Markdown heading and bold raw; Voyage Notes stays unchanged",
            "notes-markdown-preview",
        )
        control("Edit note")
        editors()
        native("focus", pid(), "Note text", 0)
        wait(
            fields,
            lambda items: [item for item in items if item["name"] == "Note text"][0][
                "focused"
            ],
            "retained editor accessibility focus without a caret-positioning click",
        )
        type_text("!")
        copied("Note text", 0, markdown[:-1] + "!" + markdown[-1], False)
        native("key", 65507, True)
        tap(ord("z"))
        native("key", 65507, False)
        copied("Note text", 0, markdown, False)
        wait(
            data,
            lambda values: (
                values[0] == encoded({**expected[0], "text": markdown})
                and values[1] == saved[1]
            ),
            "Preview's ordinary blur save and unchanged sibling",
        )
        expected[0]["text"] = markdown
        saved = data()
        receipt(
            "notes-markdown-edit",
            {
                "draft": markdown,
                "fields": editors(),
                "identity": identity(),
                "visualReviewRequired": True,
                "undo": "post-Preview insertion only",
            },
        )
        capture("notes-markdown-edit-caret-undo")
        focus("Note text", 0)
        tap(65367)
        dirty = expected[0]["text"] + "_DIRTY"
        type_text("_DIRTY")
        copied("Note text", 0, dirty, False)
        last_good = "selected filename"
        for index, case in enumerate(
            ("valid", "parse", "valid", "render", "valid", "component", "valid")
        ):
            label = "LIVE_" + str(index)
            source = source_variant(original_source.decode(), case, label)
            notes.atomic(package, source)
            time.sleep(1)
            observed = editors()
            suffix = "_" + token_hex(3)
            type_text(suffix)
            dirty += suffix
            copied("Note text", 0, dirty, False)
            assert data() == saved, (
                "Reload or another instance prematurely saved/replaced the dirty buffer"
            )
            screen = rpc("terminal.read", {"terminal": target})
            assert suffix not in screen["text"], (
                "Reload sent editor input to the terminal"
            )
            if case == "valid":
                last_good = label
            name = f"notes-lifetime-{index}-{case}"
            receipt(
                name,
                {
                    "case": case,
                    "sourceSha256": hashlib.sha256(source.encode()).hexdigest(),
                    "fieldsBeforeTypingWithoutRefocus": observed,
                    "expectedDirty": dirty,
                    "savedRevisions": [
                        hashlib.sha256(value).hexdigest() for value in saved
                    ],
                    "expectedVisibleLabel": last_good,
                    "visualReviewRequired": True,
                    "errorRequiresVisualReview": case != "valid",
                    "identity": identity(),
                },
            )
            visual(
                f"Both native Notes must show the last-good filename label {last_good}. "
                f"Fleet editor retains {dirty}; Voyage editor retains {expected[1]['text']}. "
                + (
                    "Both copies expose an actual Notes reload failure."
                    if case != "valid"
                    else "No stale reload failure remains."
                ),
                name,
            )
        focus("Terminal", 0)
        expected[0]["text"] = dirty
        wait(
            data,
            lambda values: values == [encoded(note) for note in expected],
            "retained native draft saved",
        )
        personal_source, personal_files, saved = (
            package.read_bytes(),
            source_files(package.parent),
            data(),
        )
        control("Chat")
        for operation in ("remove", "restore"):
            package_turn(
                native=native,
                pid=pid(),
                evidence=evidence,
                wait=wait,
                type_text=type_text,
                operation=operation,
                context=created["value"]["context"],
                owned=owned,
                focus=lambda: control("Message Voyager"),
            )
            control("Close chat")
            if operation == "remove":
                wait(fields, lambda items: not items, "removed Notes views")
                assert not package.parent.exists()
                preserved = profile / "mods/.notes.removed/main.js"
                assert preserved.read_bytes() == personal_source and data() == saved
                assert source_files(preserved.parent) == personal_files
                visual(
                    "Both Notes copies are unavailable after reversible package removal; the original terminal remains present",
                    "notes-lifetime-removed",
                )
                receipt("notes-lifetime-before-removed-quit", identity())
                stop()
                receipt("notes-lifetime-removed-detached", identity())
                start("notes-lifetime-removed-reopened")
                native("accessibility-state", False)
                native("accessibility-state", True)
                receipt("notes-lifetime-same-core-reopened", identity())
                assert not package.parent.exists() and not fields(), (
                    "Launch reseeded a removed package"
                )
                assert (
                    source_files(preserved.parent) == personal_files and data() == saved
                )
                visual(
                    "After reopening, both Notes copies remain unavailable and their package has not been reseeded",
                    "notes-lifetime-removed-reopened",
                )
                control("Chat")
            else:
                editors()
                assert package.read_bytes() == personal_source and data() == saved
                assert source_files(package.parent) == personal_files
                for index, note in enumerate(expected):
                    for name, key in (("Note title", "title"), ("Note text", "text")):
                        copied(name, index, note[key])
                visual(
                    f"Both restored Notes show personal label {last_good} and their saved exact title/text values {json.dumps(expected)}",
                    "notes-lifetime-restored",
                )
            receipt(
                "notes-lifetime-" + operation,
                {
                    "identity": identity(),
                    "data": expected,
                    "sourceSha256": hashlib.sha256(personal_source).hexdigest(),
                    "visualReviewRequired": True,
                },
            )
        return [
            "actual-owner-notes-setup",
            "native-vessel-portal-save-and-warm-viewer-restore",
            "native-markdown-preview-edit-retained-caret-and-ordinary-undo",
            "dirty-native-edit-through-valid-broken-repaired-source",
            "retained-draft-native-blur-save",
            "real-tool-remove-survives-reopen-with-same-core-and-backend",
            "real-tool-restore-same-content",
        ]
    finally:
        primary = sys.exc_info()[0] is not None
        try:
            for provider in provider_processes(evidence):
                owned[f"provider-{provider['pid']}-{provider['start']}"] = provider
        except Exception as error:
            errors.append(f"provider scan: {error}")
        try:
            stop()
        except Exception as error:
            errors.append(f"quit: {error}")
        source_path = (
            package
            if package.parent.is_dir()
            else profile / "mods/.notes.removed/main.js"
        )
        for path, original in (
            (header, original_header),
            (source_path, original_source),
        ):
            if original is not None:
                try:
                    notes.atomic(path, original)
                except Exception as error:
                    errors.append(f"restore {path.name}: {error}")
        if original_clipboard is not None and clipboard.mutated:
            try:
                clipboard.write(original_clipboard)
            except Exception as error:
                errors.append(f"clipboard restore: {error}")
        socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
        if socket.is_socket():
            try:
                stop_existing_core(session, env)
            except Exception as error:
                errors.append(f"fixture Core cleanup: {error}")
        observe_owned_exit(owned, session, env, wait, errors)
        if accessibility_before is not None:
            try:
                native("accessibility-state", accessibility_before)
            except Exception as error:
                errors.append(f"accessibility restore: {error}")
        try:
            receipt(
                "notes-lifetime-cleanup",
                {
                    "errors": errors,
                    "owned": owned,
                    "headerRestored": original_header is not None
                    and header.read_bytes() == original_header,
                    "sourceRestored": original_source is not None
                    and (
                        package
                        if package.parent.is_dir()
                        else profile / "mods/.notes.removed/main.js"
                    ).read_bytes()
                    == original_source,
                },
            )
        except Exception as error:
            errors.append(f"cleanup receipt: {error}")
        if errors:
            if primary:
                print(f"Notes lifetime cleanup errors: {errors}", file=sys.stderr)
            else:
                raise AssertionError(f"Notes lifetime cleanup failed: {errors}")

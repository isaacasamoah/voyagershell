import hashlib
import json
import os
import sys
import time
from pathlib import Path
from secrets import token_hex

from proof_clipboard import Clipboard
from proof_conversation import chat_close_point, package_turn, provider_processes
from proof_foundation_notes import notes, setup_source, observe_owned_exit, wait
from proof_process import process_identity
from proof_workspace import core_rpc, named_button


def source_variant(source, case, marker):
    source = notes.once(source, '.child("NOTES")', f".child({json.dumps(marker)})")
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


def lifetime_setup(source):
    return notes.once(
        setup_source(source),
        'this.run({ operation: "create-content", typeId: "notes", destination: { kind: "portal", voyage: voyage.id } }, next);',
        """this.run({
          operation: "create-content", typeId: "notes",
          destination: { kind: "portal", voyage: voyage.id }
        }, next, (portal, done) => {
          if (portal?.status !== "applied" || !portal.fresh)
            throw Error("Portal setup was not confirmed");
          this.run({ operation: "update-canvas",
            canvas: { ...portal.layout.canvas, portalMode: "make-room" }
          }, done);
        });""",
    )


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
    assert journey in ("notes-lifetime", "notes-configuration")
    opened = True
    owned, errors = {}, []
    original_clipboard = None
    header = profile / "mods/header/main.js"
    package = profile / "mods/notes/main.js"
    original_header = original_source = None

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
            opened = False
            close()

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
            tap(ord(character))

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
            targets = wait(
                lambda: [
                    item
                    for item in native("fields", pid(), [name], "window")["fields"]
                    if item["role"] == "terminal"
                ],
                lambda items: (
                    len(items) == 1 and items[0]["width"] > 0 and items[0]["height"] > 0
                ),
                "one real Terminal field",
            )
            target = targets[0]
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
        return [(profile / "data" / (id + ".json")).read_bytes() for id in ids]

    def identity(cold=False):
        current = document()
        assert current["value"] == created["value"], (
            "Workspace identity or state changed"
        )
        actual = rpc("terminal.get", {"terminal": target})
        actual_core = rpc("server.status", {})
        if cold:
            assert actual_core["pid"] != core["pid"]
            assert actual_core["core"]["id"] == core["core"]["id"]
            record("cold-core", actual_core["pid"])
            assert actual["state"] == "finished"
            assert actual.get("pid") in (None, terminal["pid"])
            assert actual["created_ms"] == terminal["created_ms"]
            terminals = rpc("terminal.list", {"all": True})
            assert not [
                item for item in terminals["terminals"] if item["state"] == "live"
            ]
            receipt("notes-configuration-cold-terminals", terminals)
        else:
            assert actual["pid"] == terminal["pid"] and actual["state"] == "live"
            assert process_identity(actual["pid"], metadata_only=True) == {
                key: value for key, value in owned["terminal"].items() if key != "pid"
            }
            assert (actual_core["pid"], actual_core["core"]["id"]) == (
                core["pid"],
                core["core"]["id"],
            )
        return {"layout": current, "terminal": actual, "core": actual_core}

    def settle():
        observe_owned_exit(owned, session, env, wait, errors)
        assert not errors, errors

    try:
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
        record("terminal", terminal["pid"])
        record("core", core["pid"])
        original_clipboard = clipboard.preserve(
            evidence / "notes-lifetime-clipboard.json"
        )
        if journey == "notes-configuration":
            from proof_notes_configuration import configuration_setup

            configuration_setup(
                native=native,
                pid=pid(),
                evidence=evidence,
                type_text=type_text,
                click=click,
                owned=owned,
            )
        else:
            stop()
            notes.atomic(header, lifetime_setup(original_header.decode()))
            start("notes-lifetime-setup")
        created = wait(
            document,
            lambda doc: (
                len(doc["value"]["contents"]) == 3
                and doc["value"]["canvas"]["portalMode"] == "make-room"
            ),
            "typed Notes/make-room setup",
        )
        voyage = created["value"]["voyages"][0]
        fleet = voyage["fleets"][0]
        ids = [fleet["vessels"][1]["content"], voyage["portals"][0]["content"]]
        assert ids[0] != ids[1] and created["value"]["context"] == {"kind": "workspace"}
        assert created["value"]["contents"][0] == initial["value"]["contents"][0]
        assert all(
            item["typeId"] == "notes"
            and not item.get("backend")
            and not item.get("startPending")
            for item in created["value"]["contents"][1:]
        )
        receipt(
            "notes-lifetime-setup",
            {
                "kind": (
                    "actual private model owner setup; supported make-room, not default-overlay evidence"
                    if journey == "notes-configuration"
                    else "three typed owner setup actions, not human/model creation; supported make-room, not default-overlay evidence"
                ),
                "initial": initial,
                "created": created,
                "ids": ids,
            },
        )
        if journey != "notes-configuration":
            stop()
            notes.atomic(header, original_header)
            start("notes-lifetime-fresh")
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
                lambda values: json.loads(values[index]) == note,
                "native blur save",
            )
        if journey != "notes-configuration":
            stop()
            start("notes-lifetime-reopened")
        for index, note in enumerate(expected):
            for name, key in (("Note title", "title"), ("Note text", "text")):
                copied(name, index, note[key])
        saved = data()
        receipt(
            "notes-configuration-initial-save"
            if journey == "notes-configuration"
            else "notes-lifetime-reopened",
            {
                "identity": identity(),
                "data": expected,
                "fields": editors(),
                "visualReviewRequired": True,
            },
        )
        capture(
            "notes-configuration-initial-save"
            if journey == "notes-configuration"
            else "notes-lifetime-both-reopened"
        )
        if journey == "notes-configuration":
            from proof_notes_configuration import configuration

            return configuration(
                profile=profile,
                evidence=evidence,
                native=native,
                pid=pid,
                capture=capture,
                stop=stop,
                settle=settle,
                start=start,
                click=click,
                tap=tap,
                type_text=type_text,
                focus=focus,
                copied=copied,
                data=data,
                document=document,
                identity=identity,
                receipt=receipt,
                ids=ids,
                created=created,
                expected=expected,
                owned=owned,
            )
        focus("Note text", 0)
        tap(65367)
        dirty = expected[0]["text"] + "_DIRTY"
        type_text("_DIRTY")
        copied("Note text", 0, dirty, False)
        last_good = "NOTES"
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
            capture(name)
        focus("Terminal", 0)
        expected[0]["text"] = dirty
        wait(
            data,
            lambda values: [json.loads(value) for value in values] == expected,
            "retained native draft saved",
        )
        personal_source, saved = package.read_bytes(), data()
        click(named_button(native, evidence, "Chat"))
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
            )
            click(chat_close_point(native, pid(), evidence))
            if operation == "remove":
                wait(fields, lambda items: not items, "removed Notes views")
                assert not package.parent.exists()
                preserved = profile / "mods/.notes.removed/main.js"
                assert preserved.read_bytes() == personal_source and data() == saved
                capture("notes-lifetime-removed")
                stop()
                start("notes-lifetime-removed-reopened")
                assert not package.parent.exists() and not fields(), (
                    "Launch reseeded a removed package"
                )
                assert preserved.read_bytes() == personal_source
                click(named_button(native, evidence, "Chat"))
            else:
                editors()
                assert package.read_bytes() == personal_source and data() == saved
                for index, note in enumerate(expected):
                    for name, key in (("Note title", "title"), ("Note text", "text")):
                        copied(name, index, note[key])
                capture("notes-lifetime-restored")
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
            "typed-owner-notes-setup",
            "fresh-native-vessel-portal-save-reopen",
            "dirty-native-edit-through-valid-broken-repaired-source",
            "retained-draft-native-blur-save",
            "real-tool-remove-survives-reopen",
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
        observe_owned_exit(owned, session, env, wait, errors)
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

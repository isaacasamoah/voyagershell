import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from secrets import token_hex

from proof_workspace import chord, core_rpc, named_button, wait
from proof_process import process_identity, observe_core_exit

spec = importlib.util.spec_from_file_location(
    "proof_native_notes",
    Path(__file__).resolve().parents[2]
    / "experiments/native-content/proof_native_notes.py",
)
assert spec and spec.loader
notes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notes)


def setup_source(source):
    anchor = '    this.run({ operation: "inspect" }, cx);\n    this.startContext(cx);'
    setup = """    this.run({ operation: "inspect" }, cx, (initial, task) => {
      if (initial?.status !== "applied" || !initial.fresh) throw Error("Proof setup inspect failed");
      const layout = initial.layout;
      const voyage = layout.voyages.find((item) => item.id === layout.selectedVoyage);
      const fleet = voyage?.fleets.find((item) => item.id === layout.selectedFleet);
      if (!voyage || !fleet || fleet.vessels.length !== 1 || voyage.portals.length) throw Error("Proof setup requires its fresh workspace");
      this.run({ operation: "create-content", typeId: "notes", destination: { kind: "panel", owner: { kind: "fleet", id: fleet.id }, insertion: { kind: "beside", id: fleet.vessels[0].id, side: "right" } } }, task, (first, next) => {
        if (first?.status !== "applied" || !first.fresh) throw Error("Proof Vessel setup was not confirmed");
        this.run({ operation: "create-content", typeId: "notes", destination: { kind: "panel", owner: { kind: "portals", voyage: voyage.id }, insertion: { kind: "empty" } } }, next);
      });
    });
    this.startContext(cx);"""
    return notes.once(source, anchor, setup)


def observe_owned_exit(owned, session, env, wait, errors):
    try:
        observe_core_exit(session, env)
    except Exception as error:
        errors.append(f"dedicated Core exit: {error}")
    for name, identity in owned.items():

        def exited():
            try:
                return (
                    Path(f"/proc/{identity['pid']}/stat")
                    .read_text()
                    .rsplit(") ", 1)[1]
                    .split()[19]
                    != identity["start"]
                )
            except FileNotFoundError:
                return True

        try:
            wait(exited, bool, f"{name} exit", 5)
        except Exception as error:
            errors.append(f"{name} exit: {error}")


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
    assert journey == "notes"
    opened = True
    errors = []
    owned = {}

    def document():
        try:
            return core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})
        except (AssertionError, subprocess.CalledProcessError):
            return None

    def close_current():
        nonlocal opened
        if opened:
            opened = False
            close()

    def start_current(name):
        nonlocal opened
        frame = start_frame(name)
        opened = True
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

    def record(name, process):
        identity = process_identity(process, metadata_only=True)
        assert identity["uid"] == os.getuid(), identity
        owned[name] = {"pid": process, **identity}

    package = profile / "mods/header/main.js"
    original = package.read_bytes()
    source = original.decode()
    setup_active = False
    notes_path = profile / "mods/notes/main.js"
    fresh_notes = None
    try:
        assert not native("accessibility-state")["enabled"], (
            "Pointer case requires initially disabled accessibility"
        )
        fresh_notes = notes_path.read_bytes()
        legacy = (
            Path(__file__).resolve().parents[2] / "desktop/notes-legacy-fixture.js"
        ).read_bytes()
        close_current()
        notes.atomic(notes_path, legacy)
        start_current("notes-legacy-controller")
        (evidence / "notes-legacy-source.json").write_text(
            json.dumps(
                {
                    "scope": "legacy JavaScript controller controls, not retained native session proof",
                    "source": "desktop/notes-legacy-fixture.js",
                    "exactBytes": notes_path.read_bytes() == legacy,
                },
                indent=2,
            )
        )
        initial = wait(
            document,
            lambda doc: (
                len(doc["value"]["contents"]) == 1
                and bool(doc["value"]["contents"][0].get("backend"))
            ),
            "initial terminal",
        )
        original_terminal = initial["value"]["contents"][0]
        terminal = core_rpc(
            session, env, "terminal.get", {"terminal": original_terminal["backend"]}
        )
        assert terminal.get("pid"), terminal
        record("initialTerminal", terminal["pid"])
        core = core_rpc(session, env, "server.status", {})
        record("core", core["pid"])
        terminal_start = (
            Path(f"/proc/{terminal['pid']}/stat")
            .read_text()
            .rsplit(") ", 1)[1]
            .split()[19]
        )
        close_current()
        setup_active = True
        notes.atomic(package, setup_source(source))
        start_current("notes-setup")
        created = wait(
            document,
            lambda doc: len(doc["value"]["contents"]) == 3,
            "owner-created Notes",
        )
        voyage = created["value"]["voyages"][0]
        fleet = voyage["fleets"][0]
        assert len(fleet["vessels"]) == 2 and len(voyage["portals"]) == 1, created
        ids = {
            "a": fleet["vessels"][1]["content"],
            "b": voyage["portals"][0]["content"],
        }
        assert ids["a"] != ids["b"]
        for id in ids.values():
            content = next(
                item for item in created["value"]["contents"] if item["id"] == id
            )
            assert (
                content["typeId"] == "notes"
                and not content.get("backend")
                and not content.get("startPending")
            ), content
        assert (
            next(
                item
                for item in created["value"]["contents"]
                if item["id"] == original_terminal["id"]
            )
            == original_terminal
        )
        (evidence / "notes-owner-setup.json").write_text(
            json.dumps(
                {
                    "kind": "profile-local typed owner setup, not human creation",
                    "initial": initial,
                    "created": created,
                    "ids": ids,
                    "terminal": terminal,
                },
                indent=2,
            )
        )
        close_current()
        notes.atomic(package, original)
        setup_active = False
        assert package.read_bytes() == original
        start_current("notes-setup-removed")
        options = dict(
            profile=profile,
            evidence=evidence,
            native=native,
            pid=pid,
            capture=capture,
            close=close_current,
            start_frame=start_current,
            resize_window=resize_window,
            geometry=geometry,
            pointer_only=False,
            ids=ids,
        )
        stages = notes.prove(**options)
        actions = notes.NotesActions(profile, native, pid, ids)
        before = document()
        protected = actions.path("b").read_bytes()
        native("focus", pid(), "Terminal", 0)
        chord(native, "t")
        other = wait(
            document,
            lambda doc: (
                doc["value"]["selectedFleet"] != fleet["id"]
                and any(
                    item["id"] != original_terminal["id"]
                    and item["typeId"] == "terminal"
                    and item.get("backend")
                    for item in doc["value"]["contents"]
                )
            ),
            "another Fleet",
        )
        other_content = next(
            item
            for item in other["value"]["contents"]
            if item["id"] != original_terminal["id"]
            and item["typeId"] == "terminal"
            and item.get("backend")
        )
        other_terminal = core_rpc(
            session, env, "terminal.get", {"terminal": other_content["backend"]}
        )
        record("otherFleetTerminal", other_terminal["pid"])
        assert (
            other["value"]["voyages"][0]["portals"]
            == before["value"]["voyages"][0]["portals"]
        )
        assert actions.path("b").read_bytes() == protected
        portal_fields = native("fields", pid())["fields"]
        for name in ("Note title", "Note text"):
            matches = [item for item in portal_fields if item["name"] == name]
            assert (
                len(matches) == 1
                and matches[0]["width"] > 0
                and matches[0]["height"] > 0
            ), portal_fields
        capture("notes-portal-another-fleet")
        click(named_button(native, evidence, fleet["name"]))
        wait(
            document,
            lambda doc: doc["value"]["selectedFleet"] == fleet["id"],
            "original Fleet",
        )
        actions.editors()
        assert actions.path("b").read_bytes() == protected
        terminal_after = core_rpc(
            session, env, "terminal.get", {"terminal": original_terminal["backend"]}
        )
        assert terminal_after["pid"] == terminal["pid"]
        (evidence / "notes-portal-switch.json").write_text(
            json.dumps(
                {
                    "before": before,
                    "other": other,
                    "portalFields": portal_fields,
                    "terminalBefore": terminal,
                    "terminalAfter": terminal_after,
                },
                indent=2,
            )
        )
        stages.append("same-portal-survives-fleet-switch")
        for case in (
            notes.delayed_initial_read,
            notes.uncertain_confirmation,
            notes.known_refusal_clears,
            notes.resize_and_refresh,
        ):
            stages.extend(case(**options))
        manifest = profile / "mods/notes/mod.json"
        manifest_bytes = manifest.read_bytes()
        schema_failure = None
        schema_errors = []
        try:
            modified = json.loads(manifest_bytes)
            assert "stateSchema" in modified
            del modified["stateSchema"]
            close_current()
            notes.atomic(manifest, json.dumps(modified))
            start_current("notes-schema-missing")
            capture("notes-schema-warning-original")

            def expose_status(source):
                source = notes.once(
                    source,
                    'import { View, div } from "gpui-kit";',
                    'import { View, div } from "gpui-kit";\nimport { Button } from "gpui-base";',
                )
                return notes.once(
                    source,
                    ".child(this.status)",
                    '.child(Button.new("proof-status").accessibility_label(this.status || "No warning").child(this.status))',
                )

            with notes.source_control(
                profile,
                close_current,
                start_current,
                "notes-schema-status",
                expose_status,
            ):
                warnings = wait(
                    lambda: native(
                        "fields", pid(), ["No state schema declared"], "window"
                    )["fields"],
                    lambda items: (
                        len(items) == 2
                        and all(
                            item["width"] > 0 and item["height"] > 0 for item in items
                        )
                    ),
                    "both real schema warnings",
                )
                (evidence / "notes-schema-warnings.json").write_text(
                    json.dumps(
                        {
                            "warning": warnings,
                            "instrumentation": "status labels mirror the real Notes controller status",
                        },
                        indent=2,
                    )
                )
                capture("notes-schema-warning-observed")
        except BaseException as error:
            schema_failure = error
            raise
        finally:
            for action in (
                close_current,
                lambda: notes.atomic(manifest, manifest_bytes),
            ):
                try:
                    action()
                except Exception as error:
                    schema_errors.append(str(error))
            if schema_errors:
                if schema_failure is not None:
                    print(f"Schema cleanup errors: {schema_errors}", file=sys.stderr)
                else:
                    raise AssertionError(f"Schema cleanup failed: {schema_errors}")
        start_current("notes-schema-restored")
        stages.append("real-schema-warning-visible")
        native("focus", pid(), "Terminal", 0)
        wait(
            lambda: native("fields", pid(), ["Terminal"], "window")["fields"],
            lambda items: len(items) == 1 and items[0]["focused"],
            "original terminal focus",
        )
        marker = "notes" + token_hex(8)
        for character in f"printf '%s\\n' '{marker}'":
            native("key", ord(character), True)
            native("key", ord(character), False)
        native("key", 65293, True)
        native("key", 65293, False)
        output = wait(
            lambda: core_rpc(
                session,
                env,
                "terminal.read",
                {"terminal": original_terminal["backend"]},
            ),
            lambda item: marker in item["text"].splitlines(),
            "terminal output",
        )
        terminal_final = core_rpc(
            session, env, "terminal.get", {"terminal": original_terminal["backend"]}
        )
        final_core = core_rpc(session, env, "server.status", {})
        assert (final_core["pid"], final_core["core"]["id"]) == (
            core["pid"],
            core["core"]["id"],
        )
        final_document = document()
        for content_id in ids.values():
            item = next(
                content
                for content in final_document["value"]["contents"]
                if content["id"] == content_id
            )
            assert (
                item["typeId"] == "notes"
                and not item.get("backend")
                and not item.get("startPending")
            ), item
        assert (
            terminal_final["pid"] == terminal["pid"]
            and Path(f"/proc/{terminal['pid']}/stat")
            .read_text()
            .rsplit(") ", 1)[1]
            .split()[19]
            == terminal_start
        )
        (evidence / "notes-terminal-preserved.json").write_text(
            json.dumps(
                {
                    "marker": marker,
                    "output": output,
                    "before": terminal,
                    "after": terminal_final,
                    "start": terminal_start,
                    "coreBefore": core,
                    "coreAfter": final_core,
                    "layoutAfter": final_document,
                },
                indent=2,
            )
        )
        stages.append("original-terminal-native-input-preserved")
        field_map = native("fields", pid(), ["Note title", "Note text"], "window")[
            "fields"
        ]
        title = [item for item in field_map if item["name"] == "Note title"]
        body = [item for item in field_map if item["name"] == "Note text"]
        assert len(title) == len(body) == 2 and all(
            item["width"] > 0 and item["height"] > 0 for item in title + body
        ), field_map
        assert title[0]["x"] + title[0]["width"] < title[1]["x"], field_map
        points = [
            [
                round(item["x"] + item["width"] / 2),
                round(item["y"] + item["height"] / 2),
            ]
            for item in (title[0], body[0])
        ]
        before_geometry = geometry()
        measured = capture("notes-pointer-measured")
        assert (
            int(before_geometry["WIDTH"]) == measured.width * 2
            and int(before_geometry["HEIGHT"]) == measured.height * 2
        ), "Pointer case requires its measured 2:1 viewport"
        assert all(
            0 <= x < int(before_geometry["WIDTH"])
            and 0 <= y < int(before_geometry["HEIGHT"])
            for x, y in points
        ), points
        split = round(
            (title[0]["x"] + title[0]["width"] + title[1]["x"])
            / 2
            * measured.width
            / int(before_geometry["WIDTH"])
        )
        assert 0 < split < measured.width
        sibling = notes.sibling_region(title[1], body[1], measured, before_geometry)
        assert sibling[0] >= split, "Protected Notes B region crosses into A"
        protected_b = actions.path("b").read_bytes()
        close_current()
        assert not native("accessibility-state", False)["enabled"]
        start_current("notes-pointer-disabled")
        after_geometry = geometry()
        assert all(
            before_geometry[key] == after_geometry[key] for key in ("WIDTH", "HEIGHT")
        ), (before_geometry, after_geometry)
        stages.extend(
            notes.pointer_diagnostic(
                profile,
                evidence,
                native,
                capture,
                geometry,
                ids=ids,
                points=points,
                protected_region=sibling,
            )
        )
        assert actions.path("b").read_bytes() == protected_b
        (evidence / "notes-pointer-measurement.json").write_text(
            json.dumps(
                {
                    "fieldsBeforeDisable": field_map,
                    "geometryBefore": before_geometry,
                    "geometryAfter": after_geometry,
                    "points": points,
                    "protectedImageLeft": split,
                    "protectedNotesRegion": sibling,
                    "accessibilityDisabled": True,
                },
                indent=2,
            )
        )
        return stages
    finally:
        primary = sys.exc_info()[0] is not None
        if setup_active:
            try:
                close_current()
            except Exception as error:
                errors.append(f"close setup: {error}")
            try:
                notes.atomic(package, original)
            except Exception as error:
                errors.append(f"restore setup: {error}")
        try:
            close_current()
        except Exception as error:
            errors.append(f"close candidate: {error}")
        if fresh_notes is not None:
            try:
                notes.atomic(notes_path, fresh_notes)
            except Exception as error:
                errors.append(f"restore fresh Notes source: {error}")
        observe_owned_exit(owned, session, env, wait, errors)
        try:
            (evidence / "notes-cleanup.json").write_text(
                json.dumps(
                    {
                        "errors": errors,
                        "owned": owned,
                        "setupRestored": package.read_bytes() == original,
                        "freshNotesRestored": fresh_notes is not None
                        and notes_path.read_bytes() == fresh_notes,
                        "scope": "legacy JavaScript controller controls",
                    },
                    indent=2,
                )
            )
        except Exception as error:
            errors.append(f"cleanup receipt: {error}")
        if errors:
            if primary:
                print(f"Notes cleanup errors: {errors}", file=sys.stderr)
            else:
                raise AssertionError(f"Notes cleanup failed: {errors}")

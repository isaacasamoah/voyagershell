import json
import shlex
import subprocess
from pathlib import Path

from proof_process import observe_core_exit
from proof_workspace import chord, click_control, core_rpc, review_frame as review_native_frame, stop_existing_core, wait


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env,
    journey, resize_window=None,
):
    assert journey in ("demo-feedback", "activity-refinement", "portal-close")
    observed = {"passed": [], "targets": [], "cleanupErrors": [], "limits": "No real agent, private chat or voice trial. Terminal accessibility remains unproved."}
    repo = evidence / "demo-repo"

    def git(*args):
        return subprocess.check_output(["git", "-C", str(repo), *args], env=env, text=True).strip()

    def rpc(method, params=None):
        assert socket.is_socket(), "Dedicated Core is absent"
        return core_rpc(session, env, method, params or {})

    def document():
        return rpc("doc.get", {"name": "voyager-layout-v1"})["value"]

    def pid():
        return json.loads((evidence / "launch.json").read_text())["pid"]

    def click(name, code=272):
        click_control(native, capture, geometry, evidence, pid(), name, observed["targets"], code)

    def key(code):
        native("key", code, True)
        native("key", code, False)

    def type_text(text):
        for character in text:
            key(65293 if character == "\n" else ord(character))

    def focus_terminal():
        def binding():
            layout = document()
            voyage = next(v for v in layout["voyages"] if v["id"] == layout["selectedVoyage"])
            fleet = next(f for f in voyage["fleets"] if f["id"] == layout["selectedFleet"])
            assert len(fleet["vessels"]) == 1
            return next(c for c in layout["contents"] if c["id"] == fleet["vessels"][0]["content"])["backend"]

        address = wait(binding, bool, "selected shell binding")
        wait(lambda: rpc("terminal.get", {"terminal": address}), lambda value: value["state"] == "live", "selected shell")
        click("Terminal input")

    def record(stage):
        observed["passed"].append(stage)
        observed["document"] = document()
        (evidence / "demo-feedback.json").write_text(json.dumps(observed, indent=2))

    def review_frame(name, frame):
        receipt = review_native_frame(capture, evidence, name, frame)
        observed.setdefault("visuals", []).append(receipt)
        return receipt

    def portal_lifetime():
        voyage_id = document()["selectedVoyage"]
        click("Show Portals")
        click("Create Terminal Portal")
        selected = wait(document, lambda value: any(v["portals"] for v in value["voyages"] if v["id"] == voyage_id), "terminal Portal placement")
        voyage = next(v for v in selected["voyages"] if v["id"] == voyage_id)
        portal = voyage["portals"][0]
        bound = wait(document, lambda value: next(c for c in value["contents"] if c["id"] == portal["content"]).get("backend"), "terminal Portal backend")
        backend = next(c for c in bound["contents"] if c["id"] == portal["content"])["backend"]
        terminal = rpc("terminal.get", {"terminal": backend})
        click("Close Portal " + portal["name"])
        wait(document, lambda value: not next(v for v in value["voyages"] if v["id"] == voyage_id)["portalLayout"]["visible"], "empty Portal collapse")
        click("Show Portals")
        click("Terminal input" if journey == "portal-close" else "Note text")
        wait(document, lambda value: not next(v for v in value["voyages"] if v["id"] == voyage_id)["portalLayout"]["visible"], "empty chooser click-away collapse")
        click("Show Portals")
        click("Hidden Portals")
        click("Reopen " + portal["name"])
        current = rpc("terminal.get", {"terminal": backend})
        assert current["state"] == "live" and current["pid"] == terminal["pid"]
        capture("hidden-portal-restored-same-process")
        record("portal-close-collapse-dismiss-and-same-pid-restore")
        return voyage, portal

    socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
    opened = True
    stopping = False

    def stop():
        nonlocal stopping
        assert not stopping
        status = rpc("server.status")
        observed.setdefault("cores", []).append(status)
        stopping = True
        result = stop_existing_core(session, env)
        observed["cleanup"] = {
            "acknowledgement": result,
            "exit": observe_core_exit(session, env),
        }

    try:
        repo.mkdir()
        git("init", "-q")
        git("-c", "user.name=Voyager trial", "-c", "user.email=trial@example.invalid", "commit", "--allow-empty", "-qm", "Initial")
        wait(document, lambda value: value and value.get("contents") and value["contents"][0].get("backend"), "initial shell")
        observed["accessibilityBefore"] = native("accessibility-state")["enabled"]
        native("accessibility-state", False)
        native("accessibility-state", True)
        focus_terminal()
        type_text("cd " + shlex.quote(str(repo)) + "\n")
        address = document()["contents"][0]["backend"]
        wait(lambda: rpc("terminal.get", {"terminal": address}), lambda value: (value.get("foreground") or {}).get("cwd") == str(repo), "shell directory")
        click("Create Voyage")
        wait(document, lambda value: any(v.get("cwd") == str(repo) for v in value["voyages"]), "directory-backed Voyage")
        record("directory-backed-voyage")
        if journey == "portal-close":
            portal_lifetime()
            return observed["passed"]
        if journey != "activity-refinement":
            click("demo-repo", 273)
            click("New worktree")
            click("Worktree branch input")
            key(65307)
            assert len(document()["voyages"]) == 2
            click("demo-repo", 273)
            click("New worktree")
            click("Worktree branch input")
            type_text("demo/proof")
            capture("worktree-new-branch")
            key(65293)
            checkout = repo / ".worktrees/demo-proof"
            wait(document, lambda value: any(v.get("cwd") == str(checkout) for v in value["voyages"]), "created worktree")
            assert subprocess.check_output(["git", "-C", str(checkout), "branch", "--show-current"], text=True).strip() == "demo/proof"
            capture("worktree-nested-voyage")
            record("worktree-create-and-cancel")
            if journey == "demo-feedback":
                focus_terminal()
                type_text("exit\n")
                wait(document, lambda value: next(v for v in value["voyages"] if v.get("cwd") == str(checkout))["fleets"][0]["root"] is None, "shell exit closes Vessel")
                click("demo-proof", 273)
                click("Remove worktree")
                capture("worktree-removal-warning")
                click("Remove worktree")
                wait(document, lambda value: next(v for v in value["voyages"] if v.get("cwd") == str(checkout)).get("closed", False), "removed Voyage closes")
                assert not checkout.exists()
                git("show-ref", "--verify", "refs/heads/demo/proof")
                assert not next(v for v in document()["voyages"] if v.get("cwd") == str(repo)).get("closed", False)
                record("shell-exit-and-worktree-removal-retain-branch")
        click("demo-repo")
        focus_terminal()
        chord(native, "o" if resize_window else "e")
        click("Create Notes Vessel")
        wait(document, lambda value: any(c["typeId"] == "notes" and c.get("configuration", {}).get("notesFile") for c in value["contents"]), "Notes file binding")
        note = next(c for c in document()["contents"] if c["typeId"] == "notes")
        filename = note["configuration"]["notesFile"]["filename"]
        if resize_window:
            layout = document()
            fleet = next(
                f
                for v in layout["voyages"]
                for f in v["fleets"]
                if any(p["content"] == note["id"] for p in f["vessels"])
            )
            terminals = [
                c
                for c in layout["contents"]
                if c["typeId"] == "terminal"
                and any(p["content"] == c["id"] for p in fleet["vessels"])
            ]
            assert len(terminals) == 1
            terminal = terminals[0]
            original_geometry = geometry()
            for label, delta in [("split", 0), ("narrow", -600), ("restored", 600)]:
                if delta:
                    resize_window(delta)
                capture("terminal-geometry-" + label)
                (evidence / ("terminal-geometry-" + label + ".json")).write_text(
                    json.dumps(
                        {
                            "window": geometry(),
                            "terminal": rpc("terminal.get", {"terminal": terminal["backend"]}),
                            "screen": rpc("terminal.read", {"terminal": terminal["backend"]}),
                            "limit": "Functional geometry/prompt diagnosis, not a latency or performance benchmark",
                        },
                        indent=2,
                    )
                )
            wait(
                geometry,
                lambda current: all(
                    current[key] == original_geometry[key]
                    for key in ("WIDTH", "HEIGHT")
                ),
                "restored measured viewport before further input",
            )
        click("Note text")
        type_text("A demo note\n\n**Voyager**")
        click("Preview note")
        capture("notes-markdown-preview")
        path = Path(note["configuration"]["notesFile"]["directory"]) / filename
        assert path.parent == repo / "notes"
        wait(lambda: path.read_text() if path.exists() else None, lambda value: "**Voyager**" in value, "saved Markdown")
        click("Edit note")
        click("Note files")
        click("New note")
        wait(document, lambda value: next(c for c in value["contents"] if c["id"] == note["id"])["configuration"]["notesFile"]["filename"] != filename, "new blank note")
        click("Note files")
        click("Open note")
        capture("notes-file-picker")
        click("Open " + filename)
        wait(document, lambda value: next(c for c in value["contents"] if c["id"] == note["id"])["configuration"]["notesFile"]["filename"] == filename, "opened saved note")
        capture("notes-reopened-file")
        record("notes-new-open-edit-preview-real-file")
        click("Home")
        capture("home-voyage-groups")
        record("home-voyage-groups-captured")
        if journey == "activity-refinement":
            selected = next(v for v in document()["voyages"] if v.get("cwd") == str(repo))
            placement = next(p for f in selected["fleets"] for p in f["vessels"] if p["content"] == note["id"])
            click("demo-repo")
            clean = path.read_bytes()
            click("Note text")
            type_text(" Exit draft")
            path.write_bytes(clean + b"\nOutside edit\n")
            click("Note files")
            click("Exit note")
            review_frame("Notes Exit save refusal", "notes-exit-save-refusal")
            assert next(v for v in document()["voyages"] if v["id"] == selected["id"])["fleets"][0]["root"] is not None
            path.write_bytes(clean)
            click("Note files")
            click("Exit note")
            wait(document, lambda value: not any(placement["id"] == leaf for leaf in leaf_ids(next(v for v in value["voyages"] if v["id"] == selected["id"])["fleets"][0]["root"])), "Notes placement exits")
            assert "Exit draft" in path.read_text()
            capture("notes-exited")
            record("notes-save-exit-and-conflict-refusal")
            before_notes = {c["id"] for c in document()["contents"] if c["typeId"] == "notes"}
            chord(native, "e")
            click("Create Notes Vessel")
            created = wait(document, lambda value: any(c["typeId"] == "notes" and c["id"] not in before_notes for c in value["contents"]), "new Notes instance after Exit")
            reopened = next(c for c in created["contents"] if c["typeId"] == "notes" and c["id"] not in before_notes)
            assert any(p["content"] == reopened["id"] and p["id"] in leaf_ids(f["root"]) for v in created["voyages"] if v["id"] == selected["id"] for f in v["fleets"] for p in f["vessels"])
            click("Note files")
            click("Open note")
            click("Open " + filename)
            wait(document, lambda value: next(c for c in value["contents"] if c["id"] == reopened["id"])["configuration"]["notesFile"]["filename"] == filename, "saved file selected after Exit")
            review_frame("Reopened Notes must display Exit draft and **Voyager**", "notes-reopen-after-exit")
            record("notes-open-saved-file-after-exit")
            click(filename, 273)
            click("Rename")
            type_text("Review")
            key(65293)
            renamed = wait(document, lambda value: next(c for c in value["contents"] if c["id"] == reopened["id"])["configuration"]["notesFile"]["filename"] == "Review.md", "Notes file rename")
            assert not path.exists()
            path = path.with_name("Review.md")
            assert "Exit draft" in path.read_text() and "**Voyager**" in path.read_text()
            assert all(p["name"] == "Review.md" for v in renamed["voyages"] for f in v["fleets"] for p in f["vessels"] if p["content"] == reopened["id"])
            click("Note text")
            type_text(" After rename")
            click("Preview note")
            wait(lambda: path.read_text(), lambda value: "After rename" in value, "editing renamed Note")
            review_frame("Renamed Note preview must retain the saved draft and After rename", "notes-renamed-and-edited")
            click("Edit note")
            record("notes-rename-keeps-draft-and-editing-on-the-new-file")
            voyage, portal = portal_lifetime()
            note_placement = next(
                p["id"] for f in voyage["fleets"] for p in f["vessels"]
                if p["content"] == reopened["id"]
            )
            for label, target in [
                ("portal", {"kind": "portal", "id": portal["id"]}),
                ("notes", {"kind": "vessel", "id": note_placement}),
            ]:
                before_count = (evidence / "native.log").read_text().count("operation=dock-preview")
                measured = review_frame(
                    "Measure avatar source and " + label + " panel destination",
                    "dock-points-" + label,
                )
                source, destination = measured["source"], measured["destination"]
                assert all(
                    len(point) == 2 and 0 <= point[0] < 1450 and 0 <= point[1] < 940
                    for point in [source, destination]
                )
                bounds = geometry()

                def move(point):
                    native(
                        "move",
                        int(bounds["X"]) + round(point[0] * 2),
                        int(bounds["Y"]) + round(point[1] * 2),
                        2,
                    )
                move(source)
                native("button", True, 272)
                for step in range(1, 9):
                    move([
                        source[axis] + (destination[axis] - source[axis]) * step / 8
                        for axis in (0, 1)
                    ])
                native("button", False, 272)
                wait(document, lambda value: value["context"] == target, "explicit dock " + target["kind"])
                wait(
                    lambda: (evidence / "native.log").read_text(),
                    lambda value: value.count("operation=dock-preview") > before_count,
                    "bounded native dock preparation",
                )
            record("explicit-portal-and-notes-docks-prepare-context")
            click("Close Portal " + portal["name"])
            click("Show Portals")
            click("Create Agents Portal")
            review_frame("Activity Portal must list demo-repo and exclude Voyager and Home groups", "voyage-scoped-activity")
            record("activity-portal-scope-excludes-other-voyages")
            opened = False
            close()
            return observed["passed"]
        before = document()
        opened = False
        close()
        stop()
        start_frame("feedback-cold-reopen")
        opened = True
        stopping = False
        native("accessibility-state", False)
        native("accessibility-state", True)
        click("demo-repo")
        old_backends = {c["backend"] for c in before["contents"] if c.get("backend")}
        current = wait(document, lambda value: value and any(c["typeId"] == "terminal" and c.get("backend") and c["backend"] not in old_backends and c["id"] in {old["id"] for old in before["contents"] if old["cwd"] == str(repo)} for c in value["contents"]), "fresh retained shell")
        shell = next(c for c in current["contents"] if c["typeId"] == "terminal" and c["cwd"] == str(repo) and c.get("backend"))
        actual = rpc("terminal.get", {"terminal": shell["backend"]})
        assert actual["state"] == "live" and actual["argv"] == ["/bin/bash"]
        capture("feedback-fresh-bash")
        record("cold-reopen-retained-content-fresh-bash")
        opened = False
        close()
        return observed["passed"]
    except BaseException as error:
        observed["failure"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        if opened:
            opened = False
            try:
                close()
            except BaseException as error:
                observed["cleanupErrors"].append(f"viewer: {error}")
        if not stopping and socket.is_socket():
            try:
                stop()
            except BaseException as error:
                observed["cleanupErrors"].append(f"Core: {error}")
        if "accessibilityBefore" in observed:
            try:
                native("accessibility-state", observed["accessibilityBefore"])
            except BaseException as error:
                observed["cleanupErrors"].append(f"accessibility: {error}")
        (evidence / "demo-feedback.json").write_text(json.dumps(observed, indent=2))
        if observed["cleanupErrors"] and "failure" not in observed:
            raise AssertionError(observed["cleanupErrors"])


def leaf_ids(root):
    if not root:
        return []
    return [root["placement"]] if root["kind"] == "leaf" else leaf_ids(root["first"]) + leaf_ids(root["second"])

import ast
import importlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


class Routes(unittest.TestCase):
    def test_accessibility_requeries_only_a_known_stale_read(self):
        tree = ast.parse(
            (Path(__file__).parent / "proof_native_accessibility.py").read_text()
        )
        query = next(
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "fields"
        )

        class ReadError(Exception):
            domain = "atspi_error"
            code = 1
            message = "Unknown object '/org/a11y/atspi/accessible/0/retired'"

        calls, sleeps = [], []

        def once(*args):
            calls.append(args)
            if len(calls) == 1:
                raise ReadError()
            return ["fresh"]

        namespace = dict(
            GLib=SimpleNamespace(Error=ReadError),
            time=SimpleNamespace(sleep=sleeps.append),
            _fields_once=once,
            Atspi=SimpleNamespace(init=lambda: None, get_desktop=once),
        )
        exec(
            compile(ast.Module(body=[query], type_ignores=[]), "accessible-read", "exec"),
            namespace,
        )
        self.assertEqual(namespace["fields"](123), ["fresh"])
        self.assertEqual(len(calls), 2)
        self.assertEqual(sleeps, [0.05])
        for attribute, value in [
            ("domain", "other"),
            ("code", 2),
            ("message", "Permission denied"),
        ]:
            with patch.object(ReadError, attribute, value):
                calls.clear()
                with self.assertRaises(ReadError):
                    namespace["fields"](123)
                self.assertEqual(len(calls), 1)

        def broken(*args):
            calls.append(args)
            raise ReadError()

        namespace["_fields_once"] = broken
        calls.clear()
        with self.assertRaises(ReadError):
            namespace["fields"](123)
        self.assertEqual(len(calls), 2)

    def test_native_quit_is_never_replayed(self):
        tree = ast.parse((Path(__file__).parent / "proof_native_mod_host.py").read_text())
        close = next(
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef) and node.name == "close"
        )
        events = []
        namespace = dict(
            verify=lambda: None,
            execute=lambda *args: None,
            capture=lambda *args: None,
            native=lambda *args: events.append(args),
            record={"pid": 99999999, "window": "owned"},
            Path=Path,
            reap_launched_candidate=lambda *args: None,
            pending_process=None,
            quit_requests=set(),
        )
        exec(
            compile(ast.Module(body=[close], type_ignores=[]), "native-quit", "exec"),
            namespace,
        )
        namespace["close"]()
        with self.assertRaisesRegex(AssertionError, "already requested"):
            namespace["close"]()
        self.assertEqual(len(events), 4)

    def test_feedback_import_does_not_require_the_legacy_notes_fixture(self):
        with patch.dict(sys.modules):
            sys.modules.pop("proof_demo_feedback", None)
            sys.modules["proof_foundation_notes"] = None
            importlib.import_module("proof_demo_feedback")

    def test_terminal_target_requires_accessibility_or_a_measured_visible_point(self):
        from proof_workspace import click_control
        with tempfile.TemporaryDirectory() as directory:
            evidence = Path(directory)
            evidence.joinpath("measured-points.json").write_text(json.dumps({"0": {"name": "Terminal input", "point": [20, 30]}}))
            events = []
            def native(*args):
                events.append(args)
                return {"fields": []}
            bounds = lambda: {"X": "100", "Y": "200", "WIDTH": "2900", "HEIGHT": "1880"}
            click_control(native, lambda _: SimpleNamespace(size=(1450, 940), width=1450, height=940), bounds, evidence, 123, "Terminal input", [])
            self.assertIn(("move", 104, 2076, 2), events)
            self.assertIn(("move", 140, 260, 2), events)
            self.assertEqual(events[-2:], [("button", True, 272), ("button", False, 272)])
            evidence.joinpath("measured-points.json").write_text(json.dumps({"0": {"name": "Terminal input", "point": [1450, 30]}}))
            events.clear()
            with self.assertRaises(AssertionError):
                click_control(native, lambda _: SimpleNamespace(size=(1450, 940), width=1450, height=940), bounds, evidence, 123, "Terminal input", [])
            self.assertFalse(any(event[0] == "button" for event in events))

    def test_native_button_codes_keep_the_owned_window_press_guard(self):
        tree = ast.parse(
            (Path(__file__).parent / "proof_native_mod_host.py").read_text()
        )
        native = next(
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef) and node.name == "native"
        )
        condition = compile(
            ast.Expression(native.body[0].test), "native-press-guard", "eval"
        )
        for action, expected in [
            (("button", True), True),
            (("button", True, 273), True),
            (("button", False, 273), False),
            (("key", 65, True), True),
            (("key", 65, False), False),
        ]:
            self.assertEqual(
                eval(
                    condition,
                    {"args": SimpleNamespace(foundation=True), "action": action},
                ),
                expected,
            )
        source = ast.parse(
            (Path(__file__).parent / "proof_native_pointer.py").read_text()
        )
        button = next(
            node
            for node in ast.walk(source)
            if isinstance(node, ast.FunctionDef) and node.name == "button"
        )
        calls = []
        namespace = {
            "remote": "mutter",
            "GLib": SimpleNamespace(
                Variant=lambda signature, value: (signature, value)
            ),
        }
        exec(
            compile(
                ast.Module(body=[button], type_ignores=[]), "pointer-button", "exec"
            ),
            namespace,
        )
        pointer = SimpleNamespace(
            session="owned", invoke=lambda *args: calls.append(args)
        )
        namespace["button"](pointer, True)
        namespace["button"](pointer, False, 273)
        self.assertEqual(
            [call[-1] for call in calls],
            [("(ib)", (272, True)), ("(ib)", (273, False))],
        )
        with self.assertRaisesRegex(AssertionError, "Unsupported native button"):
            namespace["button"](pointer, True, 274)
        self.assertEqual(len(calls), 2)

    def test_uncertain_quit_is_not_submitted_again_by_cleanup(self):
        for name, flag, initial in (
            ("proof_terminal.py", "quit_attempted", False),
            ("proof_foundation_notes.py", "opened", True),
            ("proof_notes_lifetime.py", "opened", True),
            ("proof_workspace_ux.py", "opened", True),
        ):
            tree = ast.parse((Path(__file__).parent / name).read_text())
            calls = [
                node
                for node in ast.walk(tree)
                if isinstance(node, ast.Expr)
                and isinstance(node.value, ast.Call)
                and isinstance(node.value.func, ast.Name)
                and node.value.func.id == "close"
            ]
            pairs = []
            for node in ast.walk(tree):
                for _, value in ast.iter_fields(node):
                    if not isinstance(value, list):
                        continue
                    for first, second in zip(value, value[1:]):
                        pair = [first, second]
                        if any(item in calls for item in pair) and any(
                            isinstance(item, ast.Assign)
                            and any(
                                isinstance(target, ast.Name) and target.id == flag
                                for target in item.targets
                            )
                            for item in pair
                        ):
                            pairs.append(pair)
            self.assertEqual(len(pairs), len(calls), name)
            self.assertTrue(pairs, name)
            for pair in pairs:
                with self.subTest(source=name, line=pair[0].lineno):
                    attempts = []

                    def close():
                        attempts.append("Quit")
                        raise RuntimeError("unconfirmed Quit")

                    state = {flag: initial, "close": close}
                    code = compile(ast.Module(body=pair, type_ignores=[]), name, "exec")
                    with self.assertRaisesRegex(RuntimeError, "unconfirmed Quit"):
                        exec(code, state)
                    if state[flag] == initial:
                        with self.assertRaisesRegex(RuntimeError, "unconfirmed Quit"):
                            exec(code, state)
                    self.assertEqual(attempts, ["Quit"])

    def test_quit_pane_selection_excludes_the_overlay_from_the_vessel(self):
        from proof_pane_maximize import pane_candidates

        vessel = {"x": 0, "y": 0, "width": 100, "height": 100}
        portal = {**vessel, "x": 60, "width": 40}
        left = {**vessel, "x": 10, "width": 20}
        right = {**left, "x": 70}
        items = [left, right, {**left, "width": 0}]
        self.assertEqual(pane_candidates(items, vessel, portal), [left])
        self.assertEqual(pane_candidates(items, portal), [right])
        self.assertEqual(len(pane_candidates(items, vessel)), 2)

    def test_cleanup_observes_without_connecting_or_repeating_stop(self):
        from proof_process import observe_core_exit
        from proof_workspace import core_rpc

        with tempfile.TemporaryDirectory() as directory:
            socket = Path(directory, "herdr-core", "owned.sock")
            socket.parent.mkdir()
            socket.touch()
            environment = {"XDG_RUNTIME_DIR": directory}
            with self.assertRaisesRegex(AssertionError, "runtime directory"):
                observe_core_exit("owned", {"XDG_RUNTIME_DIR": "relative"})
            with self.assertRaisesRegex(AssertionError, "unconfirmed"):
                observe_core_exit("owned", environment, seconds=0)
            with (
                patch("proof_workspace.subprocess.run") as execute,
                patch(
                    "proof_process.time.sleep", side_effect=lambda _: socket.unlink()
                ),
            ):
                self.assertTrue(observe_core_exit("owned", environment)["complete"])
                self.assertTrue(observe_core_exit("owned", environment)["socketAbsent"])
                with self.assertRaisesRegex(AssertionError, "existing-only"):
                    core_rpc("owned", environment, "server.stop", {})
                execute.assert_not_called()

    def test_deliberate_stop_uses_the_pinned_existing_only_cli(self):
        from proof_workspace import stop_existing_core

        environment = {"XDG_RUNTIME_DIR": "/run/user/42", "HC_TERMINAL_ID": "t1"}
        with patch("proof_workspace.subprocess.run") as execute:
            execute.return_value.stdout = '{"stopped":false}\n'
            self.assertEqual(
                stop_existing_core("owned", environment), {"stopped": False}
            )
            self.assertEqual(
                execute.call_args.args[0], ["hc", "--json", "server", "stop"]
            )
            actual = execute.call_args.kwargs["env"]
            self.assertEqual(actual["HC_SOCKET"], "/run/user/42/herdr-core/owned.sock")
            self.assertEqual(actual["HC_SESSION"], "owned")
            self.assertNotIn("HC_TERMINAL_ID", actual)
            execute.return_value.stdout = "{}"
            with self.assertRaisesRegex(AssertionError, "stop acknowledgement"):
                stop_existing_core("owned", environment)

    def test_exit_observation_requires_recorded_exits_and_socket_absence(self):
        from proof_process import exit_observation

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            process = root / "42"
            process.mkdir()
            stat = process / "stat"
            stat.write_text(
                "42 (owned process) " + " ".join(["Z", "1"] + ["0"] * 17 + ["123"])
            )
            socket = root / "owned.sock"
            socket.write_text("still present")
            owned = [{"pid": 42, "start": "123"}]
            self.assertFalse(exit_observation(owned, socket, root)["complete"])
            socket.unlink()
            self.assertFalse(exit_observation(owned, socket, root)["complete"])
            stat.unlink()
            process.rmdir()
            self.assertTrue(exit_observation(owned, socket, root)["complete"])

    def test_clipboard_refuses_overwriting_an_external_change(self):
        from proof_clipboard import Clipboard

        clipboard = Clipboard({}, None)
        clipboard.written.add(b"fixture")
        with patch("proof_clipboard.subprocess.run") as execute:
            execute.return_value.stdout = b"changed by user"
            with self.assertRaisesRegex(AssertionError, "changed externally"):
                clipboard.write(b"next fixture value")
        self.assertEqual(execute.call_count, 1)
        self.assertFalse(clipboard.mutated)

    def test_new_owned_core_journeys_refuse_an_existing_session(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            socket = runtime / "herdr-core/voyager-owned-core.sock"
            socket.parent.mkdir()
            socket.write_text("existing session")
            with patch.dict(
                os.environ, {"XDG_RUNTIME_DIR": directory, "HC_SOCKET": ""}
            ):
                for journey in (
                    "notes-lifetime",
                    "notes-configuration",
                    "pane-maximize",
                    "workspace-ux",
                    "conversation-voice",
                    "conversation-content",
                    "terminal-agent-create",
                    "terminal-reported-status",
                    "arrangement",
                ):
                    result = self.run_cli(
                        "--legacy-reproduction",
                        "--foundation",
                        "--journey",
                        journey,
                        "--launch",
                        "--compositor",
                        "--binary",
                        sys.executable,
                        "--session",
                        "voyager-owned-core",
                        "--evidence",
                        str(runtime / journey),
                    )
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("fresh dedicated Core session", result.stderr)
                    self.assertEqual(socket.read_text(), "existing session")

    def test_core_reads_and_cleanup_pin_the_requested_session_endpoint(self):
        from proof_workspace import core_rpc

        environment = {
            "XDG_RUNTIME_DIR": "/run/user/42",
            "HC_SOCKET": "/unrelated.sock",
            "HC_SESSION": "unrelated",
            "HC_TERMINAL_ID": "t99",
        }
        with patch("proof_workspace.subprocess.run") as execute:
            execute.return_value.stdout = '{"result":{"pid":42}}\n'
            self.assertEqual(
                core_rpc("voyager-owned", environment, "server.status", {}), {"pid": 42}
            )
            actual = execute.call_args.kwargs["env"]
        self.assertEqual(
            actual["HC_SOCKET"], "/run/user/42/herdr-core/voyager-owned.sock"
        )
        self.assertEqual(actual["HC_SESSION"], "voyager-owned")
        self.assertNotIn("HC_TERMINAL_ID", actual)
        self.assertEqual(environment["HC_SOCKET"], "/unrelated.sock")

    def run_cli(self, *arguments):
        return subprocess.run(
            [sys.executable, str(ROOT / "prove.py"), *arguments],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=15,
        )

    def test_root_help_names_the_explicit_routes(self):
        result = self.run_cli("--help")
        self.assertEqual(result.returncode, 0, result.stderr)
        for route in (
            "--foundation",
            "--reference",
            "--native-mod-host",
            "--native-avatar",
        ):
            self.assertIn(route, result.stdout)

    def test_conflicting_routes_are_rejected_before_driver_help(self):
        result = self.run_cli("--foundation", "--native-avatar", "--help")
        self.assertEqual(result.returncode, 2, result.stdout)
        self.assertIn("not allowed", result.stderr)

    def test_missing_route_is_rejected_without_running_a_driver(self):
        result = self.run_cli("--unrouted-probe")
        self.assertEqual(result.returncode, 2, result.stdout)
        self.assertIn("required", result.stderr)

    def test_each_explicit_route_keeps_its_driver_help(self):
        for route, option in [
            ("--foundation", "conversation-stop"),
            ("--foundation", "conversation-ux"),
            ("--foundation", "avatar"),
            ("--foundation", "portal-avatar"),
            ("--foundation", "notes"),
            ("--foundation", "notes-lifetime"),
            ("--foundation", "notes-configuration"),
            ("--foundation", "split-resize"),
            ("--foundation", "pane-maximize"),
            ("--foundation", "workspace-ux"),
            ("--foundation", "terminal-reported-status"),
            ("--native-mod-host", "--notes-case"),
            ("--native-avatar", "--reduced-motion"),
            ("--reference", "--direct-controls"),
        ]:
            with self.subTest(route=route):
                result = self.run_cli(route, "--help")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(option, result.stdout)

    def test_avatar_routes_require_compositor_before_launch(self):
        for route in (
            "avatar",
            "portal-avatar",
            "notes",
            "notes-lifetime",
            "notes-configuration",
            "split-resize",
            "pane-maximize",
            "workspace-ux",
            "terminal-reported-status",
        ):
            result = self.run_cli(
                "--legacy-reproduction",
                "--foundation",
                "--journey",
                route,
                "--session",
                "voyager-route-test",
                "--evidence",
                "/tmp/unused-avatar-route-test",
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(
                "requires compositor capture"
                if route
                in (
                    "notes",
                    "notes-lifetime",
                    "notes-configuration",
                    "split-resize",
                    "pane-maximize",
                    "workspace-ux",
                    "terminal-reported-status",
                )
                else "require compositor capture",
                result.stderr,
            )

    def test_avatar_routes_refuse_fixed_core_socket_before_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            for route in (
                "avatar",
                "portal-avatar",
                "conversation-ux",
                "notes",
                "notes-lifetime",
                "notes-configuration",
                "split-resize",
                "pane-maximize",
                "workspace-ux",
                "terminal-reported-status",
            ):
                environment = dict(os.environ, HC_SOCKET="/tmp/not-a-test-session")
                result = subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / "prove.py"),
                        "--legacy-reproduction",
                        "--foundation",
                        "--journey",
                        route,
                        "--compositor",
                        "--launch",
                        "--binary",
                        sys.executable,
                        "--session",
                        "voyager-route-test",
                        "--evidence",
                        str(Path(directory) / route),
                    ],
                    cwd=ROOT,
                    env=environment,
                    text=True,
                    capture_output=True,
                    timeout=15,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("unset HC_SOCKET before launch", result.stderr)
                self.assertFalse(
                    (Path(directory) / route / "launch-pending.json").exists()
                )

    def test_moved_paths_keep_native_helpers_and_legacy_candidate_identity(self):
        driver = importlib.import_module("proof_native_mod_host")
        self.assertEqual(driver.candidate_directory(True), ROOT)
        legacy = driver.candidate_directory(False)
        self.assertEqual(legacy, ROOT / "experiments/native-content")
        self.assertTrue((legacy / "proof_native_notes.py").is_file())
        directory = Path(driver.__file__).parent
        self.assertEqual(directory, ROOT / "tests/native")
        self.assertTrue((directory / "proof_native_input.py").is_file())
        for name in (
            "proof_workspace",
            "proof_terminal",
            "proof_terminal_agent",
            "proof_selected_stop",
            "proof_avatar",
            "proof_foundation_notes",
            "proof_notes_lifetime",
            "proof_split_resize",
            "proof_pane_maximize",
            "proof_workspace_ux",
            "proof_conversation",
            "proof_conversation_scroll",
        ):
            self.assertEqual(
                Path(importlib.import_module(name).__file__).parent, directory
            )

    def test_resize_observer_preserves_real_invoke_and_valid_source(self):
        proof = importlib.import_module("proof_split_resize")
        source = proof.observer_source(
            (ROOT / "desktop/mods/header/main.js").read_text()
        )
        self.assertEqual(
            source.count("result = await invoke(action, expectedVersion);"), 1
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "observed.mjs"
            path.write_text(source)
            subprocess.run(["node", "--check", str(path)], check=True, timeout=5)

    def test_resize_point_avoids_recorded_nested_crossing_and_uses_largest_span(self):
        proof = importlib.import_module("proof_split_resize")
        outer = {"x": 1730, "y": 204, "width": 2, "height": 1666}
        crossing = {"x": 576, "y": 1036, "width": 1152, "height": 2}
        self.assertEqual(
            proof.splitter_point(outer, [crossing]), ([1731, 620], (204, 1036))
        )
        self.assertEqual(
            proof.splitter_point(crossing, [outer]), ([1152, 1037], (576, 1728))
        )
        second = {**crossing, "y": 600}
        self.assertEqual(
            proof.splitter_point(outer, [crossing, second])[1], (1038, 1870)
        )
        covering = {"x": 576, "y": 204, "width": 2000, "height": 1666}
        with self.assertRaises(AssertionError):
            proof.splitter_point(outer, [covering])

    def test_maximized_pane_extent_includes_every_accepted_pane(self):
        proof = importlib.import_module("proof_pane_maximize")
        panes = [
            {"x": 576, "y": 276, "width": 1152, "height": 759},
            {"x": 576, "y": 1109, "width": 1152, "height": 759},
            {"x": 1732, "y": 276, "width": 1152, "height": 1592},
        ]
        self.assertEqual(proof.pane_extent(panes), [576, 276, 2308, 1592])
        self.assertNotEqual(proof.pane_extent(panes[1:2]), proof.pane_extent(panes))
        with self.assertRaises(AssertionError):
            proof.pane_extent([])

    def test_resize_preview_requires_the_intended_three_pane_change(self):
        proof = importlib.import_module("proof_split_resize")
        before = [
            [576, 276, 1152, 759],
            [576, 1109, 1152, 759],
            [1732, 276, 1152, 1592],
        ]
        outer = [[576, 276, 1384, 759], [576, 1109, 1384, 759], [1964, 276, 920, 1592]]
        nested = [[576, 276, 1152, 909], [576, 1259, 1152, 609], before[2]]
        self.assertTrue(proof.preview_changed(before, outer, True))
        self.assertFalse(proof.preview_changed(before, outer, False))
        self.assertTrue(proof.preview_changed(before, nested, False))
        self.assertFalse(proof.preview_changed(before, nested, True))
        self.assertFalse(proof.preview_changed(before, before, True))

    def test_only_matching_launched_child_is_reaped_after_exit(self):
        driver = importlib.import_module("proof_native_mod_host")
        child = subprocess.Popen([sys.executable, "-c", "pass"])
        try:
            status = os.waitid(os.P_PID, child.pid, os.WEXITED | os.WNOWAIT)
            self.assertEqual(status.si_pid, child.pid)
            driver.reap_launched_candidate(None, child.pid)
            driver.reap_launched_candidate(child, child.pid + 1)
            self.assertIsNone(child.returncode)
            driver.reap_launched_candidate(child, child.pid)
            self.assertEqual(child.returncode, 0)
            with self.assertRaises(ChildProcessError):
                os.waitpid(child.pid, os.WNOHANG)
        finally:
            child.wait(timeout=5)

    def test_notes_setup_and_source_controls_match_actual_packages(self):
        from contextlib import contextmanager

        proof = importlib.import_module("proof_foundation_notes")
        header = (ROOT / "desktop/mods/header/main.js").read_text()
        setup = proof.setup_source(header)
        self.assertEqual(setup.count('operation: "create-content"'), 2)
        with self.assertRaises(AssertionError):
            proof.setup_source(header + header)
        source = (ROOT / "desktop/notes-legacy-fixture.js").read_text()

        @contextmanager
        def inspect(_profile, _close, _start, name, transform):
            controlled = transform(source)
            if name == "uncertain":
                self.assertIn("this.proofUpdates", controlled)
                self.assertIn("request.requestId", controlled)
            else:
                self.assertIn('"content-5"', controlled)
            with tempfile.TemporaryDirectory() as directory:
                for entry, text in (("setup", setup), (name, controlled)):
                    path = Path(directory) / f"{entry}.mjs"
                    path.write_text(text)
                    subprocess.run(
                        ["node", "--check", str(path)], check=True, timeout=5
                    )
            raise RuntimeError("checked")
            yield

        original = proof.notes.source_control
        proof.notes.source_control = inspect
        try:
            with tempfile.TemporaryDirectory() as directory:
                profile = Path(directory)
                (profile / "data").mkdir()
                for content in ("content-5", "content-6"):
                    (profile / "data" / f"{content}.json").write_text(
                        '{"title":"a","text":"b"}'
                    )
                for case in (
                    proof.notes.delayed_initial_read,
                    proof.notes.uncertain_confirmation,
                    proof.notes.resize_and_refresh,
                ):
                    with self.assertRaisesRegex(RuntimeError, "checked"):
                        case(
                            profile=profile,
                            evidence=profile,
                            native=None,
                            pid=None,
                            capture=None,
                            close=None,
                            start_frame=None,
                            geometry=None,
                            ids={"a": "content-5", "b": "content-6"},
                        )
        finally:
            proof.notes.source_control = original

    def test_notes_lifetime_source_variants_preserve_real_editor_composition(self):
        proof = importlib.import_module("proof_notes_lifetime")
        source = (ROOT / "content/notes/main.js").read_text()
        for case in ("valid", "parse", "render", "component"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                variant = proof.source_variant(source, case, "LIFETIME_MARKER")
                self.assertIn("RetainedTitleState", variant)
                self.assertIn("RetainedBodyState", variant)
                self.assertIn("SessionState.new()", variant)
                self.assertIn('.child("LIFETIME_MARKER")', variant)
                path = Path(directory) / "variant.mjs"
                path.write_text(variant)
                result = subprocess.run(
                    ["node", "--check", str(path)], capture_output=True, timeout=5
                )
                self.assertEqual(result.returncode == 0, case != "parse")
        with self.assertRaises(AssertionError):
            proof.source_variant(source + source, "valid", "duplicate")

    def test_configuration_gate_refuses_absent_or_wrong_token_and_accepts_exact_token(
        self,
    ):
        proof = importlib.import_module("proof_notes_configuration")
        with tempfile.TemporaryDirectory() as directory:
            script, gate = Path(directory) / "wait.py", Path(directory) / "gate"
            script.write_text(proof.GATE_WAIT)
            for value in (None, "wrong", "expected"):
                if value is not None:
                    gate.write_text(value)
                result = subprocess.run(
                    [sys.executable, str(script), str(gate), "expected", "0.02"],
                    text=True,
                    capture_output=True,
                    timeout=5,
                )
                self.assertEqual(result.returncode == 0, value == "expected")
                self.assertIn("WAITING expected", result.stdout)
                self.assertEqual("READY expected" in result.stdout, value == "expected")
                if value != "expected":
                    self.assertIn(
                        "GATE TIMED OUT; DO NOT CONFIGURE OR UPDATE", result.stderr
                    )

    def test_notes_sibling_region_covers_both_editors_and_status(self):
        from PIL import Image

        proof = importlib.import_module("proof_foundation_notes")
        title = {"x": 2256, "y": 369, "width": 580, "height": 64}
        body = {"x": 2256, "y": 481, "width": 580, "height": 296}
        image = Image.new("RGB", (1450, 940))
        bounds = {"WIDTH": "2900", "HEIGHT": "1880"}
        self.assertEqual(
            proof.notes.sibling_region(title, body, image, bounds),
            (1128, 184, 1418, 429),
        )
        with self.assertRaises(AssertionError):
            proof.notes.sibling_region({**title, "x": 2900}, body, image, bounds)
        with self.assertRaises(AssertionError):
            proof.notes.sibling_region({**title, "width": 0}, body, image, bounds)


if __name__ == "__main__":
    unittest.main()

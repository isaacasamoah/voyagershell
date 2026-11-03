import importlib
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


class Routes(unittest.TestCase):
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
            ("--foundation", "split-resize"),
            ("--native-mod-host", "--notes-case"),
            ("--native-avatar", "--reduced-motion"),
            ("--reference", "--direct-controls"),
        ]:
            with self.subTest(route=route):
                result = self.run_cli(route, "--help")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(option, result.stdout)

    def test_avatar_routes_require_compositor_before_launch(self):
        for route in ("avatar", "portal-avatar", "notes", "split-resize"):
            result = self.run_cli(
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
                if route in ("notes", "split-resize")
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
                "split-resize",
            ):
                environment = dict(os.environ, HC_SOCKET="/tmp/not-a-test-session")
                result = subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / "prove.py"),
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
            "proof_split_resize",
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
        source = (ROOT / "content/notes/main.js").read_text()

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

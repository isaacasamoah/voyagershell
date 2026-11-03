import importlib
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class Routes(unittest.TestCase):
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

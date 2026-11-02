import importlib
import subprocess
import sys
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
            ("--native-mod-host", "--notes-case"),
            ("--native-avatar", "--reduced-motion"),
            ("--reference", "--direct-controls"),
        ]:
            with self.subTest(route=route):
                result = self.run_cli(route, "--help")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(option, result.stdout)

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
            "proof_conversation",
            "proof_conversation_scroll",
        ):
            self.assertEqual(
                Path(importlib.import_module(name).__file__).parent, directory
            )


if __name__ == "__main__":
    unittest.main()

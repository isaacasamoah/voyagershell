from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import runpy
import subprocess
import sys
import unittest
from unittest.mock import patch


class VerificationDispatchPolicy(unittest.TestCase):
    def test_reference_help_cannot_create_evidence(self):
        root = Path(__file__).resolve().parents[2]
        with (
            patch.object(sys, "argv", ["prove.py", "--reference", "--help"]),
            patch.object(sys, "path", list(sys.path)),
            patch.object(Path, "mkdir", side_effect=AssertionError("help wrote state")),
            redirect_stdout(StringIO()),
            self.assertRaises(SystemExit) as stopped,
        ):
            runpy.run_path(str(root / "prove.py"), run_name="__main__")
        self.assertEqual(stopped.exception.code, 0)

    def test_python_cannot_silently_select_native_acceptance(self):
        root = Path(__file__).resolve().parents[2]
        for arguments in (
            ["--foundation", "--rust", "--check-lifecycle"],
            ["--reference", "--unavailable-policy-probe"],
        ):
            with self.subTest(arguments=arguments):
                result = subprocess.run(
                    ["python3", "prove.py", *arguments],
                    cwd=root,
                    capture_output=True,
                    text=True,
                    timeout=20,
                )
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIn("--legacy-reproduction", result.stderr)
                self.assertIn("voyager-verification", result.stderr)

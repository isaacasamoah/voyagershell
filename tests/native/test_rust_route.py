import json
from pathlib import Path
import subprocess
import unittest


class RustRoute(unittest.TestCase):
    def test_foundation_routes_to_actual_lifecycle_check(self):
        root = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            ["python3", "prove.py", "--foundation", "--rust", "--check-lifecycle"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        proof = json.loads(result.stdout)
        self.assertEqual(proof["check"], "finite-lifecycle")
        self.assertGreater(proof["states"], 0)

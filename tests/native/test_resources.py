import json
import io
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from proof_process import process_identity
from proof_resources import (
    Resources,
    child_processes,
    collect,
    holder_endpoint,
    peer,
    read_metrics,
)


class ResourceTests(unittest.TestCase):
    def setUp(self):
        self.pid = os.getpid()
        self.identity = process_identity(self.pid, metadata_only=True)
        self.manifest = {
            "protocol": "L0-preparation-v1",
            "run": "unit-only",
            "variant": "test-process",
            "session": "voyager-load-unit",
            "app": {"pid": self.pid, "identity": self.identity},
            "core": {
                "version": "0.1.18",
                "id": "static-core",
                "socket": "/unused/voyager-load-unit.sock",
                "executable": self.identity["executable"],
            },
            "terminals": [],
        }

    def roster(self, roles=("app", "core")):
        return {self.pid: {"identity": self.identity, "roles": set(roles)}}

    def test_manifest_requires_an_explicit_exact_core_version(self):
        for value in (None, "", 18, True, "latest", "0.1", "0.1.18 ", "0.1.18\n"):
            with (
                self.subTest(version=value),
                self.assertRaisesRegex(ValueError, "exact Core version"),
            ):
                Resources(
                    {
                        **self.manifest,
                        "core": {**self.manifest["core"], "version": value},
                    }
                )
        core = {
            key: value
            for key, value in self.manifest["core"].items()
            if key != "version"
        }
        with self.assertRaisesRegex(ValueError, "exact Core version"):
            Resources({**self.manifest, "core": core})

    def test_discovery_binds_hello_and_status_to_the_frozen_manifest_version(self):
        for pinned, hello, status, valid in (
            ("0.1.18", "0.1.18", "0.1.18", True),
            ("0.1.16", "0.1.16", "0.1.16", True),
            ("0.1.16", "0.1.18", "0.1.18", False),
            ("0.1.18", "0.1.16", "0.1.16", False),
            ("0.1.18", "0.1.18", "0.1.16", False),
        ):
            with self.subTest(pinned=pinned, hello=hello, status=status):
                results = [
                    {"core": {"id": "static-core"}, "version": hello},
                    {
                        "core": {"id": "static-core"},
                        "version": status,
                        "pid": self.pid,
                        "holders": [],
                    },
                    {"terminals": []},
                ]
                replies = b"".join(
                    json.dumps({"id": index, "result": result}).encode() + b"\n"
                    for index, result in enumerate(results, 1)
                )
                connection = MagicMock()
                connection.makefile.return_value = io.BytesIO(replies)
                manifest = {
                    **self.manifest,
                    "core": {**self.manifest["core"], "version": pinned},
                }
                sampler = Resources(manifest)
                with (
                    patch(
                        "proof_resources.peer",
                        return_value=(connection, self.pid, self.identity),
                    ),
                    patch("proof_resources.child_processes", return_value={}),
                ):
                    if valid:
                        self.assertEqual(
                            sampler.discover()[self.pid]["roles"], {"core"}
                        )
                    else:
                        with self.assertRaisesRegex(
                            ValueError, "identity/version mismatch"
                        ):
                            sampler.discover()
                self.assertEqual(connection.sendall.call_count, 3)

    def test_own_process_units_default_identity_and_pid_deduplication(self):
        self.assertEqual(process_identity(self.pid)["session"], "voyager-load-unit")
        self.assertNotIn("command", self.identity)
        sampler = Resources(self.manifest)
        with patch.object(sampler, "discover", return_value=self.roster()):
            sample = sampler.sample()
            later = sampler.sample()
        self.assertEqual(len(sample["processes"]), 1)
        row = sample["processes"][0]
        self.assertGreater(row["pssBytes"], 0)
        self.assertEqual(sample["totals"]["pssBytes"], row["pssBytes"])
        self.assertGreaterEqual(later["totals"]["cpuDeltaTicks"], 0)
        self.assertIsNone(sample["totals"]["cpuDeltaTicks"])
        with patch.object(sampler, "discover", return_value=self.roster()):
            actual = sampler.sample()
        self.assertGreater(actual["totals"]["pssBytes"], 0)

    def test_bound_stat_start_and_memory_units(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            fields = ["0"] * 20
            fields[11], fields[12], fields[19] = "3", "5", "19"
            directory.joinpath("stat").write_text("1 (static) " + " ".join(fields))
            directory.joinpath("smaps_rollup").write_text(
                "Pss: 42 kB\nRss: 77 kB\nSwapPss: 0 kB\n"
            )
            ticks, memory = read_metrics(directory, "19")
            self.assertEqual((ticks, memory["Pss"], memory["Rss"]), (8, 43008, 78848))
            with self.assertRaisesRegex(ValueError, "identity"):
                read_metrics(directory, "20")

    def test_process_parent_roster_ignores_thread_churn_not_child_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            for pid, parent, start in ((11, 1, 81), (12, 11, 82), (13, 12, 83)):
                process = directory / str(pid)
                process.mkdir()
                fields = ["0"] * 20
                fields[1], fields[19] = str(parent), str(start)
                process.joinpath("stat").write_text(
                    f"{pid} (name with spaces) " + " ".join(fields)
                )
            directory.joinpath("14").mkdir()
            directory.joinpath("self").mkdir()
            self.assertEqual(
                child_processes(directory),
                {1: {11: "81"}, 11: {12: "82"}, 12: {13: "83"}},
            )
            directory.joinpath("13/stat").write_text("x" * 8193)
            with self.assertRaisesRegex(ValueError, "bound"):
                child_processes(directory)

    def test_missing_core_and_changed_start_do_not_produce_totals(self):
        sampler = Resources(self.manifest)
        with patch.object(sampler, "discover", return_value=self.roster(("app",))):
            with self.assertRaisesRegex(ValueError, "Core"):
                sampler.sample()
        changed = self.roster()
        changed[self.pid]["identity"] = {**self.identity, "start": "0"}
        with patch.object(sampler, "discover", return_value=changed):
            with self.assertRaisesRegex(ValueError, "identity"):
                sampler.sample()
        sampler.known[self.pid] = {**self.identity, "start": "0"}
        with patch.object(sampler, "discover", return_value=self.roster()):
            with self.assertRaisesRegex(ValueError, "PID was reused"):
                sampler.sample()

    def test_a_regular_file_cannot_become_a_core_peer(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "voyager-load-unit.sock"
            path.write_bytes(b"not a socket")
            with patch("proof_resources.socket.socket") as create:
                with self.assertRaisesRegex(ValueError, "socket"):
                    peer(path, self.identity["executable"], "voyager-load-unit")
                create.assert_not_called()

    def test_holder_socket_suffix_is_separate_from_runtime_instance(self):
        core = Path("/run/user/1000/herdr-core/voyager-load-unit.sock")
        endpoint = core.with_name("voyager-load-unit.holder.1234abcd.sock")

        def command(path):
            return b"hc\0hold\0--socket\0" + os.fsencode(path) + b"\0"

        self.assertEqual(holder_endpoint(core, command(endpoint)), endpoint)
        legacy = core.with_name("voyager-load-unit.holder." + "f" * 32 + ".sock")
        self.assertEqual(holder_endpoint(core, command(legacy)), legacy)
        for invalid in (
            command(endpoint.with_name("voyager-other.holder.1234abcd.sock")),
            command(Path("/elsewhere") / endpoint.name),
            command(endpoint).replace(b"hold\0", b"serve\0"),
            b"x" * 4097,
        ):
            with self.subTest(command=invalid), self.assertRaises(ValueError):
                holder_endpoint(core, invalid)

    def test_collection_preserves_errors_and_exits(self):
        sampler = Resources(self.manifest)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "resources.jsonl"
            with (
                patch.object(
                    sampler,
                    "discover",
                    side_effect=[
                        self.roster(),
                        FileNotFoundError("owned helper exited"),
                    ],
                ),
                patch("proof_resources.time.sleep"),
            ):
                collect(sampler, output, count=2, interval=1)
            records = [json.loads(line) for line in output.read_text().splitlines()]
        self.assertIsNone(records[2]["totals"])
        self.assertIn("exited", records[2]["error"])
        self.assertFalse(records[-1]["complete"])
        self.assertEqual(records[-1]["errors"], 1)

    def test_cancelled_collection_cannot_claim_the_requested_sample_count(self):
        sampler = Resources(self.manifest)
        cancel = threading.Event()

        def discover():
            cancel.set()
            return self.roster()

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "resources.jsonl"
            with patch.object(sampler, "discover", side_effect=discover):
                collect(sampler, output, count=3, interval=60, cancel=cancel)
            result = json.loads(output.read_text().splitlines()[-1])
        self.assertEqual(result["samples"], 1)
        self.assertEqual(result["errors"], 0)
        self.assertFalse(result["complete"])


if __name__ == "__main__":
    unittest.main()

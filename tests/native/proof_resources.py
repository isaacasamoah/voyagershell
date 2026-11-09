import json
import os
import re
import socket
import stat
import struct
import time
from pathlib import Path

from proof_process import process_identity


def read_metrics(directory, start):
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        with os.fdopen(os.open("stat", os.O_RDONLY, dir_fd=descriptor)) as source:
            fields = source.read().rsplit(") ", 1)[1].split()
        if fields[19] != start:
            raise ValueError("Owned process identity changed before memory read")
        with os.fdopen(
            os.open("smaps_rollup", os.O_RDONLY, dir_fd=descriptor)
        ) as source:
            memory = source.read(1048577)
        if len(memory) > 1048576:
            raise ValueError("Resource memory record exceeds its bound")
    finally:
        os.close(descriptor)
    values = {}
    for line in memory.splitlines():
        key, *value = line.split()
        if key in ("Pss:", "Rss:", "SwapPss:"):
            if len(value) != 2 or value[1] != "kB":
                raise ValueError("Unexpected resource memory unit")
            values[key[:-1]] = int(value[0]) * 1024
    return int(fields[11]) + int(fields[12]), values


def peer(path, executable, session):
    info = path.lstat()
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
        raise ValueError("Expected an existing owned session socket")
    connection = socket.socket(socket.AF_UNIX)
    try:
        connection.settimeout(2)
        connection.connect(str(path))
        pid, uid, _ = struct.unpack(
            "3i", connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
        )
        if pid <= 1 or uid != os.getuid():
            raise ValueError("Session socket has a different owner")
        identity = process_identity(pid, metadata_only=True)
        if identity["uid"] != uid or identity["executable"] != str(
            Path(executable).resolve(strict=True)
        ):
            raise ValueError("Session peer executable/owner mismatch")
        with Path(f"/proc/{pid}/environ").open("rb") as source:
            environment = source.read(1048577)
        if len(
            environment
        ) > 1048576 or b"HC_SESSION=" + session.encode() not in environment.split(
            b"\0"
        ):
            raise ValueError("Session peer is not bound to the dedicated session")
        return connection, pid, identity
    except BaseException:
        connection.close()
        raise


def holder_endpoint(core_socket, command):
    arguments = command.split(b"\0")
    if (
        len(command) > 4096
        or len(arguments) != 5
        or not arguments[0]
        or arguments[1:3] != [b"hold", b"--socket"]
        or arguments[-1]
    ):
        raise ValueError("Unexpected holder launch metadata")
    endpoint = Path(os.fsdecode(arguments[3]))
    prefix = re.escape(core_socket.stem + ".holder.")
    if endpoint.parent != core_socket.parent or not re.fullmatch(
        prefix + r"(?:[0-9a-f]{8}|[0-9a-f]{32})\.sock", endpoint.name
    ):
        raise ValueError("Holder endpoint is outside the dedicated session")
    return endpoint


def child_processes(directory):
    children = {}
    processes = [item for item in directory.iterdir() if item.name.isdecimal()]
    if len(processes) > 65536:
        raise ValueError("Process roster exceeds its bound")
    for process in processes:
        try:
            with process.joinpath("stat").open() as source:
                raw = source.read(8193)
        except FileNotFoundError:
            continue
        if len(raw) > 8192:
            raise ValueError("Process identity record exceeds its bound")
        fields = raw.rsplit(") ", 1)[1].split()
        children.setdefault(int(fields[1]), {})[int(process.name)] = fields[19]
    return children


class Resources:
    def __init__(self, manifest):
        self.manifest = manifest
        self.session = manifest["session"]
        self.path = Path(manifest["core"]["socket"])
        self.core_version = manifest["core"].get("version")
        if not isinstance(self.core_version, str) or not re.fullmatch(
            r"[0-9]+\.[0-9]+\.[0-9]+", self.core_version
        ):
            raise ValueError("Freeze an exact Core version in the resource manifest")
        if (
            not re.fullmatch(r"voyager-[a-z0-9-]+", self.session)
            or self.path.name != self.session + ".sock"
            or type(manifest["app"]["pid"]) is not int
            or manifest["app"]["pid"] <= 1
            or manifest["app"]["identity"]["uid"] != os.getuid()
        ):
            raise ValueError("Use an explicit dedicated Core session/socket")
        self.known = {}
        self.previous = {}
        self.core = None
        self.terminals = None
        self.ticks = os.sysconf("SC_CLK_TCK")

    def discover(self):
        app = self.manifest["app"]
        roots = {
            app["pid"]: {
                "identity": {
                    key: app["identity"][key] for key in ("uid", "start", "executable")
                },
                "roles": {"app"},
            }
        }
        core = self.manifest["core"]
        connection, pid, identity = peer(self.path, core["executable"], self.session)
        with connection, connection.makefile("rb") as output:
            results = []
            for request_id, method, parameters in [
                (1, "hello", {"generation": 1}),
                (2, "server.status", {}),
                (3, "terminal.list", {"all": True}),
            ]:
                connection.sendall(
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "method": method,
                            "params": parameters,
                        }
                    ).encode()
                    + b"\n"
                )
                line = output.readline(1048577)
                if not line.endswith(b"\n") or len(line) > 1048576:
                    raise ValueError("Core resource response missing or oversized")
                reply = json.loads(line)
                if (
                    not isinstance(reply, dict)
                    or type(reply.get("id")) is not int
                    or reply["id"] != request_id
                    or "error" in reply
                    or not isinstance(reply.get("result"), dict)
                ):
                    raise ValueError("Core resource response identity/result mismatch")
                results.append(reply["result"])
        hello, status, terminals = results
        if (
            hello["core"]["id"] != core["id"]
            or status["core"]["id"] != core["id"]
            or hello["version"] != self.core_version
            or status["version"] != hello["version"]
            or status["pid"] != pid
            or self.core is not None
            and self.core != (pid, identity)
        ):
            raise ValueError("Core resource identity/version mismatch")
        self.core = (pid, identity)
        roots[pid] = {"identity": identity, "roles": {"core"}}
        for holder in status["holders"]:
            instance = holder["instance"]
            if not re.fullmatch(r"[0-9a-f]{32}", instance):
                raise ValueError("Invalid session holder identity")
            holder_pid = holder["pid"]
            if type(holder_pid) is not int or holder_pid <= 1:
                raise ValueError("Invalid session holder PID")
            with Path(f"/proc/{holder_pid}/cmdline").open("rb") as command:
                path = holder_endpoint(self.path, command.read(4097))
            connection, holder_pid, identity = peer(
                path, core["executable"], self.session
            )
            connection.close()
            if holder_pid != holder["pid"]:
                raise ValueError("Session holder peer mismatch")
            roots[holder_pid] = {"identity": identity, "roles": {"holder"}}
        children = child_processes(Path("/proc"))
        pending = list(roots)
        while pending:
            parent = pending.pop()
            if (
                process_identity(parent, metadata_only=True)
                != roots[parent]["identity"]
            ):
                raise ValueError("Owned process identity changed")
            for child, start in children.get(parent, {}).items():
                fields = (
                    Path(f"/proc/{child}/stat").read_text().rsplit(") ", 1)[1].split()
                )
                if int(fields[1]) != parent or fields[19] != start:
                    raise ValueError("Owned child parent/start changed")
                if child not in roots:
                    identity = process_identity(child, metadata_only=True)
                    if identity["uid"] != os.getuid() or identity["start"] != start:
                        raise ValueError("Owned child UID/start changed")
                    roots[child] = {
                        "identity": identity,
                        "roles": {
                            "app-helper"
                            if roots[parent]["roles"] & {"app", "app-helper"}
                            else "core-helper"
                        },
                    }
                    pending.append(child)
                    if len(roots) > 1024:
                        raise ValueError("Owned process inventory exceeds its bound")
            if (
                process_identity(parent, metadata_only=True)
                != roots[parent]["identity"]
            ):
                raise ValueError("Owned parent identity changed during discovery")
        live = {
            terminal["address"]: terminal["pid"]
            for terminal in terminals["terminals"]
            if terminal["state"] == "live"
        }
        if (
            set(live) != set(self.manifest["terminals"])
            or self.terminals is not None
            and live != self.terminals
        ):
            raise ValueError("Core terminal workload changed")
        self.terminals = live
        for terminal_pid in live.values():
            if terminal_pid not in roots:
                raise ValueError("Core reported an unbound backend PID")
            roots[terminal_pid]["roles"].add("backend")
        for previous_pid, row in self.previous.items():
            if previous_pid not in roots and Path(f"/proc/{previous_pid}").exists():
                identity = process_identity(previous_pid, metadata_only=True)
                if identity != self.known[previous_pid]:
                    raise ValueError("Previously owned process PID was reused")
                roots[previous_pid] = {"identity": identity, "roles": set(row["roles"])}
        return roots

    def sample(self):
        started = time.monotonic_ns()
        roster = self.discover()
        for role in ("core", "app"):
            if not any(role in item["roles"] for item in roster.values()):
                raise ValueError(
                    f"{role.title()} is omitted from the owned process set"
                )
        for pid, item in roster.items():
            if process_identity(pid, metadata_only=True) != item["identity"]:
                raise ValueError("Owned process identity changed before measurement")
        rows = []
        current = {}
        for pid, item in sorted(roster.items()):
            identity = process_identity(pid, metadata_only=True)
            if (
                identity != item["identity"]
                or pid in self.known
                and identity != self.known[pid]
            ):
                raise ValueError("Owned process identity changed or PID was reused")
            self.known[pid] = identity
            ticks, values = read_metrics(Path(f"/proc/{pid}"), identity["start"])
            if process_identity(pid, metadata_only=True) != identity:
                raise ValueError("Owned process identity changed during measurement")
            previous = self.previous.get(pid)
            delta = ticks - previous["cpuTicks"] if previous else None
            if delta is not None and delta < 0:
                raise ValueError("Owned CPU counter moved backwards")
            row = {
                "pid": pid,
                **identity,
                "roles": sorted(item["roles"]),
                "pssBytes": values["Pss"],
                "rssBytes": values["Rss"],
                "swapPssBytes": values["SwapPss"],
                "cpuTicks": ticks,
                "cpuDeltaTicks": delta,
            }
            rows.append(row)
            current[pid] = row
        exits = [
            {"pid": pid, "start": row["start"]}
            for pid, row in self.previous.items()
            if pid not in current
        ]
        self.previous = current
        totals = (
            None
            if exits
            else {
                "pssBytes": sum(row["pssBytes"] for row in rows),
                "rssBytes": sum(row["rssBytes"] for row in rows),
                "cpuDeltaTicks": sum(row["cpuDeltaTicks"] for row in rows)
                if all(row["cpuDeltaTicks"] is not None for row in rows)
                else None,
            }
        )
        return {
            "type": "sample",
            "startedNs": started,
            "endedNs": time.monotonic_ns(),
            "processes": rows,
            "exits": exits,
            "totals": totals,
            "error": "Owned process exited before its final resource read"
            if exits
            else None,
        }


def collect(sampler, output, *, count, interval, cancel=None):
    if count < 1 or interval <= 0:
        raise ValueError("Use a positive sample count and interval")
    errors = 0
    samples = 0
    with output.open("x") as record:
        header = {
            "type": "run",
            **{
                key: sampler.manifest[key]
                for key in ("protocol", "run", "variant", "session")
            },
            "binarySha256": sampler.manifest.get("binarySha256"),
            "clock": "monotonic_ns",
            "ticksPerSecond": sampler.ticks,
            "intervalSeconds": interval,
            "requestedSamples": count,
        }
        record.write(json.dumps(header) + "\n")
        for index in range(count):
            if cancel is not None and cancel.is_set():
                break
            started = time.monotonic()
            try:
                sample = sampler.sample()
            except Exception as error:
                sample = {
                    "type": "sample",
                    "startedNs": int(started * 1e9),
                    "endedNs": time.monotonic_ns(),
                    "processes": [],
                    "known": [
                        {"pid": pid, **identity}
                        for pid, identity in sampler.known.items()
                    ],
                    "exits": [],
                    "totals": None,
                    "error": str(error),
                    "errorType": type(error).__name__,
                }
            errors += sample["error"] is not None
            samples += 1
            record.write(json.dumps(sample) + "\n")
            record.flush()
            if index + 1 < count:
                delay = max(0, interval - (time.monotonic() - started))
                if cancel is None:
                    time.sleep(delay)
                elif cancel.wait(delay):
                    break
        record.write(
            json.dumps(
                {
                    "type": "completed",
                    "samples": samples,
                    "errors": errors,
                    "complete": errors == 0 and samples == count,
                }
            )
            + "\n"
        )

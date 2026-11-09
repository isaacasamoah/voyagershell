import argparse
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tests/native"))
from proof_process import process_identity
from proof_resources import read_metrics


def read(path):
    try:
        return Path(path).read_text().strip()
    except OSError as error:
        return {"unavailable": str(error)}


def observe(targets, memory, graphics):
    result = {}
    for pid, expected in targets.items():
        directory = Path(f"/proc/{pid}")
        actual = process_identity(pid, metadata_only=True)
        if actual != expected:
            raise ValueError("Observed process identity changed")
        threads, clients = {}, {}
        for task in directory.joinpath("task").iterdir():
            threads[task.name] = {
                "name": read(task / "comm") if memory else None,
                "stat": read(task / "stat"),
                "schedstat": read(task / "schedstat"),
            }
        for entry in directory.joinpath("fdinfo").iterdir() if graphics else ():
            raw = read(entry)
            if isinstance(raw, str) and "drm-driver:" in raw:
                fields = dict(line.split(":", 1) for line in raw.splitlines() if ":" in line)
                fields = {key: value.strip() for key, value in fields.items() if key.startswith("drm-")}
                identity = (fields.get("drm-pdev"), fields.get("drm-client-id"))
                key = json.dumps(identity) if all(identity) else "fd:" + entry.name
                clients[key] = fields
        record = {"identity": actual, "threads": threads}
        if graphics:
            record["graphics"] = clients
        if memory:
            ticks, values = read_metrics(str(directory), expected["start"])
            record["memory"] = values
            record["cpuTicks"] = ticks
        result[str(pid)] = record
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--samples", type=int, default=20)
    args = parser.parse_args()
    if not 2 <= args.samples <= 1200 or not args.output.is_absolute():
        raise ValueError("Use an absolute output and 2 to 1200 finite samples")
    targets = {int(key): value for key, value in json.loads(args.manifest.read_text()).items()}
    if not 1 <= len(targets) <= 16 or any(value["uid"] != os.getuid() for value in targets.values()):
        raise ValueError("Observe at most sixteen explicitly owned process identities")
    sensors = list(Path("/sys/class/hwmon").glob("hwmon*/temp*_input"))
    clocks = list(Path("/sys/devices/system/cpu/cpufreq").glob("policy*/scaling_cur_freq"))
    busy = list(Path("/sys/class/drm").glob("card*/device/gpu_busy_percent"))
    started = time.monotonic_ns()
    with args.output.open("x") as destination:
        for index in range(args.samples):
            before = time.monotonic_ns()
            row = {
                "sample": index,
                "beforeNs": before,
                "wallNs": time.time_ns(),
                "cpuTickHz": os.sysconf("SC_CLK_TCK"),
                "processes": observe(targets, index % 10 == 0, index % 5 == 0),
                "hostCpuStat": read("/proc/stat"),
                "pressure": {name: read(f"/proc/pressure/{name}") for name in ("cpu", "memory", "io")},
            }
            if index % 10 == 0:
                row["sensors"] = {str(path): read(path) for path in sensors + clocks + busy}
                row["memory"] = read("/proc/meminfo")
                row["vmstat"] = read("/proc/vmstat")
            row["afterNs"] = time.monotonic_ns()
            destination.write(json.dumps(row) + "\n")
            destination.flush()
            if index + 1 < args.samples:
                time.sleep(max(0, (started + (index + 1) * 100_000_000 - time.monotonic_ns()) / 1e9))


if __name__ == "__main__":
    main()

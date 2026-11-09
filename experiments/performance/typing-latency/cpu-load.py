import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def worker(deadline):
    started = time.monotonic()
    cpu = time.process_time()
    value = 1
    loops = 0
    while time.monotonic() < deadline:
        for _ in range(10000):
            value = (value * 1664525 + 1013904223) & 0xffffffff
        loops += 10000
    return {"pid": os.getpid(), "elapsedSeconds": time.monotonic() - started,
            "cpuSeconds": time.process_time() - cpu, "loops": loops, "value": value}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", type=float)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if args.worker is not None:
        print(json.dumps(worker(args.worker)))
        return
    assert args.out.is_absolute() and not args.out.exists()
    assert len(os.sched_getaffinity(0)) >= 24
    started = time.monotonic()
    deadline = started + 55
    children = []
    with args.out.open("x") as log:
        try:
            for _ in range(20):
                child = subprocess.Popen([sys.executable, __file__, "--worker", str(deadline)],
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                children.append(child)
            log.write(json.dumps({"kind": "started", "beforeNs": round(started * 1e9),
                                  "workers": [p.pid for p in children], "deadline": deadline}) + "\n")
            log.flush()
            records = []
            for child in children:
                stdout, stderr = child.communicate(timeout=max(1, deadline + 10 - time.monotonic()))
                assert child.returncode == 0, stderr
                records.append(json.loads(stdout))
            log.write(json.dumps({"kind": "complete", "afterNs": time.monotonic_ns(),
                                  "workers": records, "cpuSeconds": sum(r["cpuSeconds"] for r in records)}) + "\n")
        finally:
            for child in children:
                if child.poll() is None:
                    child.terminate()
                    child.wait(timeout=5)


if __name__ == "__main__":
    main()

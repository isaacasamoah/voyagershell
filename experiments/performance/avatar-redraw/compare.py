import hashlib
import json
import math
import os
from pathlib import Path
import select
import shutil
import statistics
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / "tests/native"))
from proof_terminal_agent import process_record
from proof_workspace import core_rpc

config = json.loads(Path(sys.argv[1]).read_text())
out = Path(config["output"])
assert not (out / "runs.json").exists()
env = os.environ | config["desktopEnvironment"]
for key in (
    "HC_SOCKET",
    "HC_SESSION",
    "HC_TERMINAL_ID",
    "WAYLAND_DISPLAY",
    "VOYAGER_REDRAW_PROBE",
    "VOYAGER_REDUCED_MOTION",
):
    env.pop(key, None)
clock = os.sysconf("SC_CLK_TCK")
helper = subprocess.Popen(
    [sys.executable, str(root / "tests/native/proof_native_input.py"), "--pointer"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=(out / "input.log").open("w"),
    text=True,
    env=env,
)


def save(name, value):
    (out / name).write_text(json.dumps(value, indent=2) + "\n")


def execute(*args):
    return subprocess.check_output(args, env=env, text=True, timeout=8).strip()


def native(*args):
    helper.stdin.write(json.dumps(args) + "\n")
    helper.stdin.flush()
    assert select.select([helper.stdout], [], [], 15)[0], args
    result = json.loads(helper.stdout.readline())
    assert result.get("ok"), result
    return result


def rpc(method, params=None):
    socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (config["session"] + ".sock")
    assert socket.is_socket()
    return core_rpc(config["session"], env, method, params or {})


def retained():
    assert process_record(config["corePid"]) == config["core"]
    current = rpc("terminal.list", {"all": True})["terminals"]
    for address, prior in config["live"].items():
        item = next(t for t in current if t["address"] == address)
        assert item["state"] == "live" and item["pid"] == prior["pid"]
        assert process_record(item["pid"])["start"] == prior["start"]
    assert rpc("doc.get", {"name": "voyager-layout-v1"})["value"] == config["layout"]


def stop(record):
    assert process_record(record["pid"]) == record["identity"]
    execute("xdotool", "windowactivate", "--sync", str(record["window"]))
    native("key", 65507, True)
    native("key", 113, True)
    native("key", 113, False)
    native("key", 65507, False)
    for _ in range(100):
        try:
            state = (
                Path(f"/proc/{record['pid']}/stat")
                .read_text()
                .rsplit(") ", 1)[1]
                .split()[0]
            )
            if state == "Z":
                break
        except FileNotFoundError:
            break
        time.sleep(0.1)
    else:
        raise RuntimeError("Quit is unconfirmed; no replacement was launched")
    retained()


def launch(variant, name):
    folder = out / name
    folder.mkdir()
    shutil.copytree(out / "seed-profile", folder / "profile")
    selected = config[variant]
    binary = Path(selected["binary"])
    assert hashlib.sha256(binary.read_bytes()).hexdigest() == selected["sha256"]
    started = time.monotonic()
    process = subprocess.Popen(
        [
            str(binary),
            "--profile",
            str(folder / "profile"),
            "--session",
            config["session"],
        ],
        cwd=root,
        env=env | selected.get("environment", {}),
        stdout=(folder / "native.log").open("w"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    record = {
        "pid": process.pid,
        "variant": variant,
        "folder": str(folder),
        "environmentOverrides": selected.get("environment", {}),
    }
    save("active.json", record)
    for _ in range(100):
        assert process.poll() is None, (folder / "native.log").read_text()
        windows = subprocess.run(
            ["xdotool", "search", "--onlyvisible", "--pid", str(process.pid)],
            env=env,
            capture_output=True,
            text=True,
        ).stdout.split()
        if len(windows) == 1:
            break
        time.sleep(0.05)
    else:
        raise RuntimeError("No unique visible trial window")
    record.update(
        window=windows[0],
        identity=process_record(process.pid),
        visibleSeconds=time.monotonic() - started,
    )
    execute("xdotool", "windowactivate", "--sync", windows[0])
    execute("xdotool", "windowstate", "--add", "MAXIMIZED_VERT", windows[0])
    execute("xdotool", "windowstate", "--add", "MAXIMIZED_HORZ", windows[0])
    geometry = settled_geometry(windows[0])
    time.sleep(config["warmupSeconds"])
    record["geometry"] = geometry
    save("active.json", record)
    retained()
    return process, record


def settled_geometry(window):
    for _ in range(200):
        geometry = dict(
            line.split("=", 1)
            for line in execute(
                "xdotool", "getwindowgeometry", "--shell", window
            ).splitlines()
        )
        if all(
            geometry[k] == config["geometry"][k] for k in ("X", "Y", "WIDTH", "HEIGHT")
        ):
            return geometry
        time.sleep(0.1)
    raise RuntimeError(f"Unmatched viewport; no sample collected: {geometry}")


def sample(pid):
    parts = Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()
    memory = Path(f"/proc/{pid}/smaps_rollup").read_text().splitlines()
    pss = int(next(line.split()[1] for line in memory if line.startswith("Pss:")))
    return {
        "time": time.monotonic(),
        "ticks": int(parts[11]) + int(parts[12]),
        "start": parts[19],
        "pssKiB": pss,
    }


def measure(record):
    raw = []
    for index in range(config["sampleSeconds"] + 1):
        raw.append({"app": sample(record["pid"]), "core": sample(config["corePid"])})
        if index < config["sampleSeconds"]:
            time.sleep(1)
    result = {"raw": raw}
    for role in ("app", "core"):
        first, last = raw[0][role], raw[-1][role]
        assert first["start"] == last["start"]
        result[role] = {
            "cpuPercentOneCore": 100
            * (last["ticks"] - first["ticks"])
            / clock
            / (last["time"] - first["time"]),
            "medianPssKiB": statistics.median(row[role]["pssKiB"] for row in raw),
        }
    return result


def drag(record):
    folder = Path(record["folder"])
    capture = native("capture", str(folder / "before-drag.png"), config["crop"], 2)[
        "capture"
    ]
    native("record-start", str(folder / "drag.webm"), capture)
    x, y = config["avatarCenter"]
    native("move", x, y, 2)
    actual = dict(
        line.split("=", 1)
        for line in execute("xdotool", "getmouselocation", "--shell").splitlines()
    )
    assert abs(int(actual["X"]) - x) <= 2 and abs(int(actual["Y"]) - y) <= 2, actual
    native("button", True)
    moves = []
    started = time.monotonic()
    for index in range(181):
        target = started + index / 60
        time.sleep(max(0, target - time.monotonic()))
        fraction = index / 180
        px = x + 1900 * fraction
        py = y + 350 * math.sin(math.pi * fraction)
        moves.append(native("move", px, py, 2, 0))
    native("key", 65307, True)
    native("key", 65307, False)
    native("button", False)
    time.sleep(0.5)
    video = native("record-stop")
    retained()
    return {
        "moves": moves,
        "recording": video,
        "note": "60 requested moves/s; actual dispatch receipts retained; 30 fps resampled visual record is not calibrated latency",
    }


runs = []
try:
    retained()
    resumed = "--resume-first" in sys.argv
    if not resumed:
        stop(config["owner"])
        shutil.copytree(config["profile"], out / "seed-profile")
    for index, variant in enumerate(config["order"]):
        process = None
        if resumed and index == 0:
            record = json.loads((out / "active.json").read_text())
            assert record["variant"] == variant == "baseline"
            identity = process_record(record["pid"])
            assert identity["argv"] == [
                config[variant]["binary"],
                "--profile",
                str(Path(record["folder"]) / "profile"),
                "--session",
                config["session"],
            ]
            windows = execute(
                "xdotool", "search", "--onlyvisible", "--pid", str(record["pid"])
            ).split()
            assert len(windows) == 1
            record.update(
                window=windows[0],
                identity=identity,
                visibleSeconds=None,
                startupObservation="Existing first launch resumed after its failed viewport gate; startup timing unavailable",
            )
            record["geometry"] = settled_geometry(record["window"])
            time.sleep(config["warmupSeconds"])
        else:
            process, record = launch(variant, f"{index + 1:02}-{variant}")
        record["measurement"] = measure(record)
        if index < 2 and config.get("recordDrag", True):
            record["drag"] = drag(record)
        execute(
            "import",
            "-window",
            record["window"],
            str(Path(record["folder"]) / "settled.png"),
        )
        runs.append(record)
        save("runs.json", runs)
        stop(record)
        if process is not None:
            process.wait(timeout=5)
    final_variant = config.get("finalVariant", "candidate")
    process, record = launch(final_variant, f"owner-{final_variant}")
    save(f"owner-{final_variant}.json", record)
finally:
    helper.stdin.close()
    helper.wait(timeout=10)

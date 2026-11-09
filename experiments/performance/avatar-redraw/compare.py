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

from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / "tests/native"))
from proof_terminal_agent import process_record
from proof_workspace import core_rpc
from proof_native_control import stable_geometry

config = json.loads(Path(sys.argv[1]).read_text())
if config.get("sceneIsolation"):
    active = json.loads(
        Path(
            "/home/isaac/.local/share/voyagershell-foundation/active-preview.json"
        ).read_text()
    )
    assert config["session"].startswith("voyager-scene-")
    assert (
        config["session"] != active["session"]
        and config["owner"]["pid"] != active["pid"]
    )
out = Path(config["output"])
assert not (out / "runs.json").exists()
env = os.environ | config["desktopEnvironment"]
env["VOYAGER_WORKSPACE_SESSION"] = config["session"]
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
    assert {item["address"] for item in current if item["state"] == "live"} == set(config["live"])
    for address, prior in config["live"].items():
        item = next(t for t in current if t["address"] == address)
        assert item["state"] == "live" and item["pid"] == prior["pid"]
        assert process_record(item["pid"])["start"] == prior["start"]
    assert rpc("doc.get", {"name": "voyager-layout-v1"})["value"] == config["layout"]


def stop(record):
    intent = out / f"quit-requested-{record['pid']}.json"
    assert not intent.exists(), (
        "Quit already requested; inspect its outcome without replay"
    )
    assert process_record(record["pid"]) == record["identity"]
    assert execute("xdotool", "getwindowpid", str(record["window"])) == str(
        record["pid"]
    )
    execute("xdotool", "windowactivate", "--sync", str(record["window"]))
    assert execute("xdotool", "getactivewindow") == str(record["window"])
    with intent.open("x") as target:
        target.write(
            json.dumps({"record": record, "requestedNs": time.monotonic_ns()}, indent=2)
            + "\n"
        )
    native("key", 65507, True)
    native("key", 113, True)
    native("key", 113, False)
    native("key", 65507, False)
    for _ in range(100):
        try:
            fields = (
                Path(f"/proc/{record['pid']}/stat")
                .read_text()
                .rsplit(") ", 1)[1]
                .split()
            )
            state = (
                "pid-reused" if fields[19] != record["identity"]["start"] else fields[0]
            )
            if state in ("Z", "pid-reused"):
                break
        except FileNotFoundError:
            state = "absent"
            break
        time.sleep(0.1)
    else:
        raise RuntimeError("Quit is unconfirmed; no replacement was launched")
    save(
        f"quit-confirmed-{record['pid']}.json",
        {"record": record, "observedState": state, "observedNs": time.monotonic_ns()},
    )
    retained()


def launch(variant, name):
    folder = out / name
    folder.mkdir()
    shutil.copytree(out / "seed-profile", folder / "profile")
    selected = config[variant]
    if config.get("requireCanvasProbe"):
        native("accessibility-state", False)
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
    save("active.json", record)
    execute("xdotool", "windowactivate", "--sync", windows[0])
    if config.get("maximize", True):
        execute("xdotool", "windowstate", "--add", "MAXIMIZED_VERT", windows[0])
        execute("xdotool", "windowstate", "--add", "MAXIMIZED_HORZ", windows[0])
    else:
        execute(
            "xdotool",
            "windowsize",
            "--sync",
            windows[0],
            config["geometry"]["WIDTH"],
            config["geometry"]["HEIGHT"],
        )
        execute(
            "xdotool",
            "windowmove",
            "--sync",
            windows[0],
            config["geometry"]["X"],
            config["geometry"]["Y"],
        )
        placed = stable_geometry(windows[0], execute)
        if any(placed[k] != config["geometry"][k] for k in ("X", "Y")):
            corrected = [str(2 * int(config["geometry"][k]) - int(placed[k])) for k in ("X", "Y")]
            save(name + "-placement-correction.json", {"observed": placed, "requested": config["geometry"], "correctedFrameOrigin": corrected})
            execute("xdotool", "windowmove", "--sync", windows[0], *corrected)
    geometry = settled_geometry(windows[0])
    if config.get("setupCommand"):
        record["setupReply"] = rpc(
            "terminal.send",
            {
                "terminal": config["loadTerminal"],
                "text": config["setupCommand"],
                "submit": True,
                "wait": False,
            },
        )
    time.sleep(config["warmupSeconds"])
    if config.get("sceneIsolation"):
        screen = rpc("terminal.read", {"terminal": config["loadTerminal"], "lines": 0})
        record["screenBefore"] = screen
        reference = out / "screen-reference.json"
        if reference.exists():
            assert screen == json.loads(reference.read_text()), (
                "Unmatched terminal screen; no measurement"
            )
        else:
            save("screen-reference.json", screen)
        record["probeBefore"] = probes(record)
        if config.get("requireCanvasProbe"):
            assert record["probeBefore"]
            assert {row["a11y_active_at_poll"] for row in record["probeBefore"]} == {False}
            if selected.get("environment", {}).get("VOYAGER_EXPERIMENT_ROW_PAINT") == "1":
                assert sum(row["counts"].get("terminal_canvas_rows", 0) for row in record["probeBefore"]) > 0
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


def probes(record):
    return [
        json.loads(line)
        for line in (Path(record["folder"]) / "native.log").read_text().splitlines()
        if '"event":"voyager_redraw_probe"' in line
    ]


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
    if config.get("sceneIsolation"):
        assert (
            rpc("terminal.read", {"terminal": config["loadTerminal"], "lines": 0})
            == record["screenBefore"]
        )
        time.sleep(1.3)
        observed = probes(record)
        before = record["probeBefore"]
        assert before and len(observed) > len(before), (
            "Missing bounded render observations"
        )
        elapsed_ms = (raw[-1]["app"]["time"] - raw[0]["app"]["time"]) * 1000
        assert observed[-1]["elapsed_ms"] - before[-1]["elapsed_ms"] >= elapsed_ms, (
            "Render probe did not cover measurement"
        )
        assert {row["a11y_active_at_poll"] for row in observed} == {False}, (
            "Accessibility mode did not match"
        )
        assert (
            sum(
                row["counts"].get("avatar_renders", 0)
                for row in observed[len(before) :]
            )
            > 0
        ), "Avatar did not render"
        if config.get("terminalCrop"):
            for name in ("terminal_renders", "header_renders"):
                assert sum(row["counts"].get(name, 0) for row in observed[len(before):]) == 0, (
                    f"Quiet cached-scene condition failed: {name}"
                )
        result["probe"] = observed
    return result


def capture_pixels(record, name):
    path = Path(record["folder"]) / (name + ".png")
    execute("import", "-window", record["window"], str(path))
    frame = Image.open(path).convert("RGB")
    assert list(frame.size) == config["pixelSize"]
    body = frame.crop(config["terminalCrop"])
    reference = out / (name + "-reference.png")
    if reference.exists():
        diff = ImageChops.difference(body, Image.open(reference).convert("RGB"))
        if diff.getbbox() is not None:
            diff.save(path.with_name(name + "-difference.png"))
            raise AssertionError(f"Terminal pixel mismatch: {path}")
    else:
        body.save(reference)
    return frame


def interaction(record):
    def active():
        assert execute("xdotool", "getwindowpid", record["window"]) == str(record["pid"])
        assert execute("xdotool", "getactivewindow") == record["window"]

    def key(value):
        active()
        native("key", value, True)
        native("key", value, False)

    active()
    frame = Image.open(Path(record["folder"]) / "settled.png").convert("RGB")
    body = frame.crop(config["terminalCrop"])
    masks = [
        channel.point(lambda value, color=color: 255 if value == color else 0)
        for channel, color in zip(body.split(), (0x97, 0xB3, 0xD6))
    ]
    mask = ImageChops.multiply(ImageChops.multiply(masks[0], masks[1]), masks[2])
    box = mask.getbbox()
    assert box is not None, "Blue Unicode selection source was not painted"
    first = box[1]
    box = mask.crop((0, first, body.width, first + 12)).getbbox()
    assert box is not None and box[2] - box[0] < 200
    x = int(config["geometry"]["X"]) + config["terminalCrop"][0] + box[0]
    y = int(config["geometry"]["Y"]) + config["terminalCrop"][1] + first + 6
    end = x + (box[2] - box[0]) + 800
    assert end < int(config["geometry"]["X"]) + config["terminalCrop"][2] - 20
    native("move", x + 1, y, 2)
    pointer = dict(
        line.split("=", 1)
        for line in execute("xdotool", "getmouselocation", "--shell").splitlines()
    )
    assert abs(int(pointer["X"]) - x - 1) <= 2
    assert abs(int(pointer["Y"]) - y) <= 2
    assert execute("xdotool", "getwindowpid", pointer["WINDOW"]) == str(record["pid"])
    active()
    native("button", True)
    try:
        native("move", end, y, 2)
    finally:
        native("button", False)
    time.sleep(0.4)
    selected = capture_pixels(record, "selected-tail").crop(config["terminalCrop"])
    difference = ImageChops.difference(body, selected).getbbox()
    assert difference is not None
    assert difference[2] - difference[0] > 600 and difference[3] - difference[1] < 50
    active()
    pointer = dict(
        line.split("=", 1)
        for line in execute("xdotool", "getmouselocation", "--shell").splitlines()
    )
    assert abs(int(pointer["X"]) - end) <= 2 and abs(int(pointer["Y"]) - y) <= 2
    assert execute("xdotool", "getwindowpid", pointer["WINDOW"]) == str(record["pid"])
    native("button", True)
    native("button", False)
    for character in "printf 'NATIVE_%s\\n' OK\n":
        key(65293 if character == '\n' else ord(character))
    for _ in range(100):
        screen = rpc("terminal.read", {"terminal": config["loadTerminal"], "lines": 0})
        if "NATIVE_OK" in screen["text"].splitlines():
            break
        time.sleep(0.1)
    else:
        raise AssertionError("Native keyboard input did not reach the shell")
    execute(
        "xdotool", "windowsize", "--sync", record["window"],
        str(int(config["geometry"]["WIDTH"]) - 160),
        str(int(config["geometry"]["HEIGHT"]) - 100),
    )
    time.sleep(0.7)
    execute(
        "xdotool", "windowsize", "--sync", record["window"],
        config["geometry"]["WIDTH"], config["geometry"]["HEIGHT"],
    )
    settled_geometry(record["window"])
    time.sleep(0.7)
    capture_pixels(record, "resized-before-repaint")
    rpc("terminal.send", {
        "terminal": config["loadTerminal"], "text": config["setupCommand"],
        "submit": True, "wait": False,
    })
    time.sleep(2)
    capture_pixels(record, "resized-restored")
    rpc("terminal.send", {
        "terminal": config["loadTerminal"], "text": config["denseCommand"],
        "submit": True, "wait": False,
    })
    time.sleep(2)
    capture_pixels(record, "dense-control")
    for name, command in config.get("cursorCommands", {}).items():
        rpc("terminal.send", {
            "terminal": config["loadTerminal"], "text": command,
            "submit": True, "wait": False,
        })
        time.sleep(0.5)
        capture_pixels(record, name)
    retained()
    return {
        "selectionPixels": "exact", "nativeInput": "NATIVE_OK",
        "resizeBeforeRepaintPixels": "exact", "resizeRepopulatedPixels": "exact",
        "denseControlPixels": "exact",
    }


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
    if "--close-active" in sys.argv:
        stop(config["owner"])
        save("closed-only.json", config["owner"])
        sys.exit(0)
    resumed = "--resume-first" in sys.argv
    if not resumed:
        if config.get("closedOwnerReceipt"):
            assert json.loads(Path(config["closedOwnerReceipt"]).read_text()) == config["owner"]
            path = Path(f"/proc/{config['owner']['pid']}/stat")
            if path.exists():
                fields = path.read_text().rsplit(") ", 1)[1].split()
                assert fields[19] != config["owner"]["identity"]["start"] or fields[0] == "Z"
        else:
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
        save("active.json", record)
        if index < 2 and config.get("recordDrag", True):
            record["drag"] = drag(record)
        if config.get("terminalCrop"):
            capture_pixels(record, "settled")
            if index < 2 and not config.get("controlsOrder"):
                record["interaction"] = interaction(record)
        else:
            execute("import", "-window", record["window"],
                    str(Path(record["folder"]) / "settled.png"))
        runs.append(record)
        save("runs.json", runs)
        stop(record)
        if process is not None:
            process.wait(timeout=5)
    for variant in config.get("controlsOrder", []):
        process, record = launch(variant, "control-" + variant)
        capture_pixels(record, "settled")
        record["interaction"] = interaction(record)
        save("control-" + variant + ".json", record)
        stop(record)
        process.wait(timeout=5)
    final_variant = config.get("finalVariant", "candidate")
    process, record = launch(final_variant, f"owner-{final_variant}")
    save(f"owner-{final_variant}.json", record)
    if config.get("closeFinal"):
        execute(
            "import",
            "-window",
            record["window"],
            str(Path(record["folder"]) / "restored.png"),
        )
        stop(record)
        process.wait(timeout=5)
finally:
    helper.stdin.close()
    helper.wait(timeout=10)

import hashlib
import json
import os
import signal
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / "tests/native"))
from proof_process import observe_core_exit
from proof_terminal_agent import process_record
from proof_workspace import core_rpc, stop_existing_core

binary, out = map(Path, sys.argv[1:3])
reference = json.loads(Path(sys.argv[3]).read_text())
assert reference.get("sceneIsolation") is True, (
    "Pixel proof requires the actual row-render probe gate"
)
out.mkdir()
env = os.environ | reference["desktopEnvironment"]
for name in (
    "HC_SOCKET",
    "HC_SESSION",
    "HC_TERMINAL_ID",
    "WAYLAND_DISPLAY",
    "VOYAGER_REDUCED_MOTION",
    "VOYAGER_REDRAW_PROBE",
    "VOYAGER_EXPERIMENT_ROW_PAINT",
    "VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS",
):
    env.pop(name, None)
session = "voyager-scene-row-" + out.name
socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
assert not socket.exists()
setup = out / "setup"
environment = out / "environment.json"
environment.write_text(json.dumps([{}, {"env": reference["desktopEnvironment"]}]))
command = [
    sys.executable,
    str(root / "prove.py"),
    "--foundation",
    "--review",
    "--compositor",
    "--launch",
    "--binary",
    str(binary),
    "--session",
    session,
    "--evidence",
    str(setup),
    "--desktop-env",
    str(environment),
]


def rpc(method, params=None):
    assert socket.is_socket(), "The dedicated Core socket is absent"
    return core_rpc(session, env, method, params or {})


def run_driver(arguments, log, timeout):
    process = subprocess.Popen(arguments, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        result = process.wait(timeout=timeout)
        if result:
            raise subprocess.CalledProcessError(result, arguments)
    except subprocess.TimeoutExpired:
        process.send_signal(signal.SIGINT)
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        raise


def cleanup_view():
    active = out / "comparison/active.json"
    record = (
        json.loads(active.read_text())
        if active.exists()
        else config["owner"]
        if config
        else None
    )
    if record is None or "identity" not in record:
        raise RuntimeError(
            "No confirmed view identity; inspect the launch records without retrying"
        )
    try:
        fields = (
            Path(f"/proc/{record['pid']}/stat").read_text().rsplit(") ", 1)[1].split()
        )
    except FileNotFoundError:
        return {"state": "absent", "record": record}
    state = "pid-reused" if fields[19] != record["identity"]["start"] else fields[0]
    if state in ("Z", "pid-reused"):
        return {"state": state, "record": record}
    current = process_record(record["pid"])
    assert all(
        current[key] == record["identity"][key]
        for key in ("uid", "start", "executable", "cwd", "argv")
    )
    intent = Path(config["output"]) / f"quit-requested-{record['pid']}.json"
    if intent.exists():
        raise RuntimeError(
            f"Quit already requested for PID {record['pid']}; effect is unconfirmed, no replay"
        )
    cleanup_config = config | {"owner": record | {"identity": current}}
    input_log = Path(config["output"]) / "input.log"
    if input_log.exists():
        (out / "comparison-input-before-cleanup.log").write_bytes(
            input_log.read_bytes()
        )
    path = out / "cleanup-protocol.json"
    path.write_text(json.dumps(cleanup_config, indent=2) + "\n")
    with (out / "view-cleanup.log").open("x") as log:
        run_driver(
            [
                sys.executable,
                str(root / "experiments/performance/avatar-redraw/compare.py"),
                str(path),
                "--close-active",
            ],
            log,
            45,
        )
    confirmed = json.loads(
        (Path(config["output"]) / f"quit-confirmed-{record['pid']}.json").read_text()
    )
    assert confirmed["record"] == cleanup_config["owner"]
    return {
        "state": confirmed["observedState"],
        "original": record,
        "confirmation": confirmed,
    }


def cleanup():
    result = {"errors": []}
    try:
        result["view"] = cleanup_view()
    except Exception as error:
        result["errors"].append("view cleanup: " + repr(error))
    try:
        if core is None:
            if socket.exists():
                raise RuntimeError(
                    "Core was not bound before failure; inspect its exact socket peer before stopping it"
                )
        else:
            assert process_record(status["pid"]) == core
            current = rpc("server.status")
            assert (
                current["pid"] == status["pid"]
                and current["core"]["id"] == status["core"]["id"]
            )
            records = [
                {"pid": item["pid"], "start": process_record(item["pid"])["start"]}
                for item in [
                    current,
                    *current["holders"],
                    *rpc("terminal.list", {"all": True})["terminals"],
                ]
                if item.get("pid")
            ]
            result["core"] = {
                "stop": stop_existing_core(session, env),
                "exits": observe_core_exit(session, env, records),
            }
    except Exception as error:
        result["errors"].append("Core cleanup: " + repr(error))
    result["complete"] = not result["errors"]
    (out / "cleanup.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


config = core = status = None
primary_error = None
try:
    with (out / "setup.log").open("x") as log:
        run_driver(command, log, 90)
    launch = json.loads((setup / "launch.json").read_text())
    assert launch["desktopEnvironment"] == reference["desktopEnvironment"]

    status = rpc("server.status")
    core = process_record(status["pid"])
    (out / "core-owner.json").write_text(
        json.dumps({"status": status, "identity": core}, indent=2) + "\n"
    )
    live = {
        item["address"]: {
            "pid": item["pid"],
            "start": process_record(item["pid"])["start"],
        }
        for item in rpc("terminal.list", {"all": True})["terminals"]
        if item["state"] == "live"
    }
    assert len(live) == 1
    record = {key: launch[key] for key in ("pid", "window")}
    record["identity"] = process_record(launch["pid"])
    assert all(
        record["identity"][key] == launch["identity"][key]
        for key in ("uid", "start", "executable", "cwd")
    )
    assert record["identity"]["argv"] == launch["identity"]["command"]
    config = reference | {
        "session": session,
        "output": str(out / "comparison"),
        "geometry": reference.get(
            "geometry", {"X": "2196", "Y": "3090", "WIDTH": "2900", "HEIGHT": "1880"}
        ),
        "order": [],
        "controlsOrder": ["baseline", "candidate"],
        "finalVariant": "candidate",
        "closeFinal": True,
        "requireCanvasProbe": True,
        "loadTerminal": next(iter(live)),
        "corePid": status["pid"],
        "core": core,
        "live": live,
        "layout": rpc("doc.get", {"name": "voyager-layout-v1"})["value"],
        "owner": record,
        "profile": str(setup / "profile"),
        "scope": "Exact native terminal pixel and user-interaction controls; no resource/timing acceptance",
        "cursorCommands": {
            name: "printf '\\033[" + code + " q'"
            for name, code in [
                ("cursor-block", "2"),
                ("cursor-underline", "4"),
                ("cursor-bar", "6"),
            ]
        },
    }
    for variant, flag in [("baseline", "0"), ("candidate", "1")]:
        config[variant] = {
            "binary": str(binary),
            "sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
            "environment": {
                "VOYAGER_REDRAW_PROBE": "1",
                "VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS": "1",
                "VOYAGER_EXPERIMENT_ROW_PAINT": flag,
            },
        }
    config["baseline"].update(
        {key: reference["candidate"][key] for key in ("binary", "sha256")}
    )
    config.pop("closedOwnerReceipt", None)
    comparison = Path(config["output"])
    comparison.mkdir()
    protocol = out / "protocol.json"
    protocol.write_text(json.dumps(config, indent=2) + "\n")
    with (out / "comparison.log").open("x") as log:
        run_driver(
            [
                sys.executable,
                str(root / "experiments/performance/avatar-redraw/compare.py"),
                str(protocol),
            ],
            log,
            240,
        )
except BaseException as error:
    primary_error = error
    raise
finally:
    outcome = cleanup()
    if not outcome["complete"] and primary_error is None:
        raise RuntimeError(outcome["errors"])

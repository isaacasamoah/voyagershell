import json
import os
from pathlib import Path
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / "tests/native"))
from proof_native_control import Native
from proof_process import process_identity
from proof_workspace import core_rpc


def journal(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_bytes().split(b'\n')[:-1]]


config = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
out.mkdir()
launch = json.loads(Path(config["launch"]).read_text())
env = os.environ | launch["desktopEnvironment"]
env.pop("WAYLAND_DISPLAY", None)
for key in ("HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"):
    env.pop(key, None)
identity = process_identity(launch["pid"], metadata_only=True)
assert all(value == launch["identity"][key] for key, value in identity.items())
assert config["text"] == "xvqzjkmnprst" and len(config["roi"]) == 4
assert config["intervalSeconds"] == 0.5
hold = config.get("keyHoldSeconds", 0)
assert hold == 0 or 0.02 <= hold <= 0.05
worker = core_rpc(launch["session"], env, "terminal.get", {"terminal": config["terminal"]})
program = config.get("inputProgram", "codex")
assert program in ("codex", "echo", "stream-echo")
assert worker["state"] == "live"
if program == "stream-echo":
    workload = config['workload']
    assert worker['foreground']['pid'] == workload['pid']
    assert worker['foreground']['argv'][1:] == workload['argv'][1:]
else:
    assert worker["foreground"]["name"] == ("cat" if program == "echo" else "codex")
ready = core_rpc(launch["session"], env, "terminal.read", {"terminal": config["terminal"], "lines": 0})
if program in ("echo", "stream-echo"):
    assert worker["cols"] == 145 and worker["rows"] == 39
    assert len(ready["text"].splitlines()) >= 36 and ready["text"].splitlines()[35].rstrip() == "›", "Echo prompt is not ready; no measurement keys dispatched"
else:
    assert "Ask Codex to do anything" in ready["text"] and "enter continue" not in ready["text"], "Codex input field is not ready; no measurement keys dispatched"
(out / "worker-before.json").write_text(json.dumps(worker, indent=2) + "\n")
native = Native(env, out)
recording = False
dispatches = []
observer = None
try:
    window = launch["window"]
    assert subprocess.check_output(["xdotool", "getwindowpid", window], env=env, text=True).strip() == str(launch["pid"])
    subprocess.check_call(["xdotool", "windowactivate", "--sync", window], env=env)
    geometry = dict(line.split("=", 1) for line in subprocess.check_output(["xdotool", "getwindowgeometry", "--shell", window], env=env, text=True).splitlines())
    x, y, width, height = config["roi"]
    native("move", int(geometry["X"]) + round((x + width / 2) * 2), int(geometry["Y"]) + round((y + height / 2) * 2), 2)
    native("button", True)
    native("button", False)
    capture = native("capture", str(out / "before.png"), [int(geometry[key]) for key in ("X", "Y", "WIDTH", "HEIGHT")], 2)["capture"]
    (out / "capture.json").write_text(json.dumps(capture, indent=2) + "\n")
    native("frames-start", str(out / "frames"), capture, config["roi"], 4096, 30)
    recording = True
    deadline = time.monotonic() + 3
    metadata = out / "frames.jsonl"
    while not metadata.exists() or '"type": "frame"' not in metadata.read_text():
        assert time.monotonic() < deadline, "No initial frame; no keys dispatched"
        time.sleep(0.05)
    if config.get("resourceManifest"):
        observer = subprocess.Popen(
            [sys.executable, str(Path(__file__).with_name("observe.py")), config["resourceManifest"], str(out / "resources.jsonl"), "--samples", "240"],
            stdout=(out / "resources.log").open("x"), stderr=subprocess.STDOUT,
        )
        time.sleep(1)
    if program == 'stream-echo':
        deadline = time.monotonic() + 3
        while True:
            samples = journal(out / 'resources.jsonl')
            assert observer is not None and observer.poll() is None
            if samples:
                first = samples[0]
                assert first['sample'] == 0 and first['beforeNs'] <= first['afterNs']
                assert set(first['processes']) == set(json.loads(Path(config['resourceManifest']).read_text()))
                break
            assert time.monotonic() < deadline, 'Resource observer not ready; no burst or keys dispatched'
            time.sleep(.01)
        before = time.monotonic_ns()
        with Path(workload['marker']).open('x'):
            pass
        marked = time.monotonic_ns()
        deadline = time.monotonic() + 3
        while True:
            armed = [e for e in journal(Path(workload['receipt'])) if e['event'] == 'armed']
            if armed:
                assert len(armed) == 1 and armed[0]['mode'] == workload['mode'] and armed[0]['seconds'] == workload['seconds']
                assert armed[0]['atNs'] >= before
                break
            assert time.monotonic() < deadline, 'Output producer did not acknowledge arming; no keys dispatched'
            time.sleep(.01)
        (out / 'output-arm.json').write_text(json.dumps({'beforeNs': before, 'afterNs': marked, 'acknowledgedNs': time.monotonic_ns(), 'producer': armed[0], 'observerFirstSampleNs': first['afterNs']}) + '\n')
    for sequence, character in enumerate(config["text"], 1):
        began = time.monotonic()
        actual = process_identity(launch["pid"], metadata_only=True)
        assert actual == identity
        active = subprocess.check_output(["xdotool", "getactivewindow"], env=env, text=True).strip()
        if active != window:
            details = subprocess.run(["xprop", "-id", active, "_NET_WM_PID", "WM_CLASS"], env=env, capture_output=True, text=True, timeout=5)
            (out / "focus-changed.json").write_text(json.dumps({"expectedWindow": window, "actualWindow": active, "atNs": time.monotonic_ns(), "properties": details.stdout, "error": details.stderr}, indent=2) + "\n")
            raise AssertionError("Focus changed; stop input")
        clock_before = time.monotonic_ns()
        wall = time.time_ns()
        clock_after = time.monotonic_ns()
        down = native("key", ord(character), True)["key"]
        if hold:
            time.sleep(hold)
        up = native("key", ord(character), False)["key"]
        dispatches.append({"sequence": sequence, "character": character, "key": down, "release": up, "keyHoldSeconds": hold, "clock": {"beforeNs": clock_before, "wallNs": wall, "afterNs": clock_after}})
        (out / "dispatch.json").write_text(json.dumps(dispatches, indent=2) + "\n")
        time.sleep(max(0, config["intervalSeconds"] - (time.monotonic() - began)) if hold else config["intervalSeconds"])
    time.sleep(15)
finally:
    try:
        if recording:
            receipt = native("frames-stop")["frames"]
            (out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    finally:
        native.close()
        if observer is not None:
            assert observer.wait(timeout=30) == 0, "Resource observation failed; retain its log"

screen = core_rpc(launch["session"], env, "terminal.read", {"terminal": config["terminal"], "lines": 0})
(out / "screen-after.json").write_text(json.dumps(screen, indent=2) + "\n")
assert config["text"] in screen["text"], "Expected Codex input text did not arrive"
assert receipt["complete"]
if program == 'stream-echo':
    events = [json.loads(line) for line in Path(workload['receipt']).read_text().splitlines()]
    assert not any(event['event'] == 'invalid_input' for event in events)
    armed = [event for event in events if event['event'] == 'armed']
    done = [event for event in events if event['event'] == 'burst_complete']
    assert len(armed) == len(done) == 1 and done[0]['atNs'] - armed[0]['atNs'] >= 6_000_000_000
    assert (done[0]['blocks'] > 0 and done[0]['backgroundBytes'] > 0) == (workload['mode'] == 'burst')
    assert events[-1]['event'] in ('echo_written', 'burst_complete')
    assert max(event.get('count', 0) for event in events if event['event'] == 'echo_written') == len(config['text'])
    (out / 'output-complete.json').write_text(json.dumps(done[0], indent=2) + '\n')
print(json.dumps({"keys": len(dispatches), "frames": receipt["frames"], "scope": "Calibration only; visible glyph timing still requires evaluation"}))

import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

STEP_S = 0.004
APPROACH = 50
LAPS = 900
REACH = (330.0, 230.0)
VISIBLE_STREAMS = 8
MANY_VISIBLE_STREAMS = 20
KEYS = 40
KEY_GAP_S = 0.15
KEY_A = 30
TYPER = "stty raw -echo; while IFS= read -rsn1 c; do printf 'KEYECHO%s' \"$c\"; done"
HIDDEN_FLEETS = 3
STREAMS_PER_HIDDEN_FLEET = 4
SETTLE_S = 2.0
STREAM = (
    "while :; do seq -f $'\\e[32mCompiling\\e[0m crate-%g v0.1.0 "
    "(/home/project/crates/core) \\e[2mwarning: unused variable\\e[0m' 1 2000; done"
)
HOG = "while :; do :; done"
BTN_LEFT = 272


def wall_ns():
    return time.time_ns()


class Run:
    def __init__(self, candidate, verifier, out, monitor):
        self.candidate = Path(candidate).resolve()
        self.verifier = Path(verifier).resolve()
        self.out = Path(out).resolve()
        self.monitor = monitor
        self.runtime = Path(os.environ.get("AVATAR_MOTION_RUNTIME", "/var/tmp/voyager-crew/scratch/avatar-motion")) / f"r{os.getpid()}"
        self.home = self.out / "home"
        self.project = self.home / "project"
        self.bin = self.out / "bin"
        self.session = "voyager-typing-a"
        self.inspection = self.out / "inspection.json"
        self.window = self.out / "frames.window"
        self.stop = self.out / "frames.stop"
        self.children = []

    def env(self, **extra):
        env = {
            "PATH": f"{self.bin}:{Path(shutil.which('hc')).parent}:/usr/bin:/bin",
            "HOME": str(self.home),
            "XDG_RUNTIME_DIR": str(self.runtime),
            "HC_SESSION": self.session,
            "DBUS_SESSION_BUS_ADDRESS": os.environ["DBUS_SESSION_BUS_ADDRESS"],
            "LANG": "C.UTF-8",
        }
        env.update(extra)
        return env

    def prepare(self):
        for folder in (self.runtime, self.project, self.bin):
            folder.mkdir(parents=True, exist_ok=True)
        self.runtime.chmod(0o700)
        for name in ("claude", "codex"):
            link = self.bin / name
            if not link.exists():
                link.symlink_to(self.verifier)
        shutil.copy2(self.candidate.parent / "voyager", self.bin / "voyager")

    def spawn(self, name, arguments, env, cwd=None):
        log = open(self.out / f"{name}.log", "ab")
        child = subprocess.Popen(arguments, env=env, cwd=cwd, stdout=log, stderr=log)
        self.children.append(child)
        return child

    def hc(self, *arguments):
        return subprocess.run(["hc", *arguments], env=self.env(), check=True, capture_output=True, text=True, timeout=20).stdout

    def start(self):
        self.spawn(
            "mutter",
            ["mutter", "--headless", "--wayland", "--no-x11", "--virtual-monitor", self.monitor, "--wayland-display", "avm-wl"],
            self.env(),
        )
        wait(lambda: (self.runtime / "avm-wl").exists(), "the Wayland socket")
        self.hc("server", "start")
        self.app = self.spawn(
            "app",
            [str(self.candidate), "--profile", str(self.out / "profile"), "--session", self.session, "--inspect", str(self.inspection)],
            self.env(
                WAYLAND_DISPLAY="avm-wl",
                VOYAGER_FRAME_PROFILE="1",
                VOYAGER_WORKSPACE_SESSION=self.session,
                VOYAGER_FRAME_PROFILE_STOP=str(self.stop),
                VOYAGER_FRAME_PROFILE_WINDOW=str(self.window),
                VOYAGER_FRAME_PROFILE_RECORDS="2000000",
                VOYAGER_FRAME_PROFILE_SECONDS="900",
            ),
            cwd=self.project,
        )
        wait(lambda: self.avatar() is not None, "the inspected avatar")

    def frame(self):
        try:
            return json.loads(self.inspection.read_text())
        except (OSError, json.JSONDecodeError):
            return None

    def avatar(self):
        frame = self.frame()
        if not frame:
            return None
        for element in frame.get("elements", []):
            if element.get("role") == "avatar":
                return element["bounds"]
        return None

    def count(self, role):
        frame = self.frame() or {}
        return sum(1 for element in frame.get("elements", []) if element.get("role") == role)

    def element(self, role, key=None):
        frame = self.frame() or {}
        for element in frame.get("elements", []):
            if element.get("role") == role and (key is None or element.get("key") == key):
                return element["bounds"]
        return None

    def rpc(self, method, params):
        import socket

        path = self.runtime / "herdr-core" / f"{self.session}.sock"
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(5)
            connection.connect(str(path))
            connection.sendall((json.dumps({"jsonrpc": "2.0", "id": wall_ns(), "method": method, "params": params}) + "\n").encode())
            data = b""
            while not data.endswith(b"\n"):
                chunk = connection.recv(65536)
                if not chunk:
                    break
                data += chunk
        return json.loads(data)["result"]

    def fleets(self):
        value = self.rpc("doc.get", {"name": "voyager-layout-v2"}).get("value") or {}
        return [(fleet["id"], fleet.get("name")) for voyage in value.get("voyages", []) for fleet in voyage.get("fleets", [])]

    def selected(self):
        value = self.rpc("doc.get", {"name": "voyager-layout-v2"}).get("value") or {}
        return value.get("selectedFleet") or value.get("selected_fleet")


def wait(check, what, patience=30.0):
    deadline = time.monotonic() + patience
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.1)
    raise SystemExit(f"Timed out waiting for {what}")


class Pointer:
    def __init__(self):
        from gi.repository import Gio, GLib

        self.Gio = Gio
        self.GLib = GLib
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.bus = bus
        reply = bus.call_sync(
            "org.gnome.Mutter.RemoteDesktop", "/org/gnome/Mutter/RemoteDesktop",
            "org.gnome.Mutter.RemoteDesktop", "CreateSession", None,
            GLib.VariantType.new("(o)"), Gio.DBusCallFlags.NONE, -1, None,
        )
        self.path = reply.unpack()[0]
        self.call("Start")
        self.x, self.y = 0.0, 0.0
        self.relative(-20000, -20000)
        self.x, self.y = 0.0, 0.0

    def call(self, method, arguments=None):
        self.bus.call_sync(
            "org.gnome.Mutter.RemoteDesktop", self.path,
            "org.gnome.Mutter.RemoteDesktop.Session", method, arguments,
            None, self.Gio.DBusCallFlags.NONE, -1, None,
        )

    def relative(self, dx, dy):
        self.call("NotifyPointerMotionRelative", self.GLib.Variant("(dd)", (float(dx), float(dy))))
        self.x += dx
        self.y += dy

    def move_to(self, x, y):
        self.relative(x - self.x, y - self.y)

    def key(self, code, pressed):
        self.call("NotifyKeyboardKeycode", self.GLib.Variant("(ub)", (code, pressed)))

    def button(self, pressed):
        self.call("NotifyPointerButton", self.GLib.Variant("(ib)", (BTN_LEFT, pressed)))


def path(start_from, centre):
    first = (centre[0], centre[1] + REACH[1])
    points = []
    for step in range(1, APPROACH + 1):
        part = step / APPROACH
        points.append((start_from[0] + (first[0] - start_from[0]) * part, start_from[1] + (first[1] - start_from[1]) * part))
    for step in range(LAPS):
        turn = step / LAPS
        points.append((centre[0] + REACH[0] * math.sin(2 * math.tau * turn), centre[1] + REACH[1] * math.cos(3 * math.tau * turn)))
    return points


def loadavg():
    return Path("/proc/loadavg").read_text().strip()


def sample(run, case, stop):
    folder = run.out / "stacks"
    folder.mkdir(exist_ok=True)
    pid = run.app.pid
    index = 0
    while not stop.is_set():
        index += 1
        result = subprocess.run(["eu-stack", "-p", str(pid)], capture_output=True, text=True)
        keep, lines = False, []
        for line in result.stdout.splitlines():
            if line.startswith("TID "):
                keep = line.startswith(f"TID {pid}:")
            if keep:
                lines.append(line)
        (folder / f"{case}-{index}.txt").write_text("\n".join(lines))
        stop.wait(0.05)


def glide(run, pointer, case, offset, running):
    import threading

    stop = threading.Event()
    sampler = threading.Thread(target=sample, args=(run, case, stop)) if os.environ.get("AVM_SAMPLE") else None
    bounds = run.avatar()
    origin = (bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2)
    frame = run.frame()
    size = frame["window"].get("size") or {}
    centre = (frame["window"].get("width", 2000) * 0.5 + 100, frame["window"].get("height", 1200) * 0.5)
    planned = path(origin, centre)
    load_before = loadavg()
    run.window.write_bytes(b"")
    opened = wall_ns()
    time.sleep(0.3)
    pointer.move_to(offset[0] + origin[0], offset[1] + origin[1])
    time.sleep(0.05)
    pointer.button(True)
    if sampler:
        sampler.start()
    began = time.monotonic()
    moves = []
    for index, (x, y) in enumerate(planned):
        due = began + index * STEP_S
        while time.monotonic() < due:
            pass
        at = wall_ns()
        pointer.move_to(offset[0] + x, offset[1] + y)
        moves.append({"at_ns": at, "x": round(x), "y": round(y)})
    if sampler:
        stop.set()
        sampler.join()
    end = planned[-1]
    followed = False
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        drawn = run.avatar()
        if drawn and drawn["x"] <= end[0] <= drawn["x"] + drawn["width"] and drawn["y"] <= end[1] <= drawn["y"] + drawn["height"]:
            followed = True
            break
        time.sleep(0.02)
    pointer.button(False)
    time.sleep(0.5)
    closed = wall_ns()
    run.window.unlink()
    record = {
        "case": case, "opened_ns": opened, "closed_ns": closed, "step_micros": int(STEP_S * 1e6),
        "moves": moves, "load_before": load_before, "load_after": loadavg(), "running": running,
        "followed": followed, "surface": "wayland-headless-mutter",
    }
    (run.out / f"drag-{case}.json").write_text(json.dumps(record))
    print(json.dumps({"case": case, "followed": followed, "moves": len(moves)}), flush=True)
    time.sleep(1.0)


def typing(run, pointer, case, offset, running, key):
    bounds = run.element("terminal", key)
    click(pointer, offset, bounds)
    time.sleep(0.5)
    run.window.write_bytes(b"")
    opened = wall_ns()
    time.sleep(0.3)
    keys = []
    for _ in range(KEYS):
        at = wall_ns()
        pointer.key(KEY_A, True)
        pointer.key(KEY_A, False)
        keys.append({"at_ns": at})
        time.sleep(KEY_GAP_S)
    time.sleep(0.5)
    closed = wall_ns()
    run.window.unlink()
    record = {"case": case, "opened_ns": opened, "closed_ns": closed, "keys": keys, "running": running, "load": loadavg()}
    (run.out / f"typing-{case}.json").write_text(json.dumps(record))
    print(json.dumps({"case": case, "typed": len(keys)}), flush=True)
    time.sleep(0.5)


def start_load(run, name, fleet, program):
    arguments = ["run", "--bg", "--no-notify", "--name", name]
    if fleet:
        arguments += ["--label", f"voyager.place=fleet:{fleet}"]
    run.hc(*arguments, "bash", "-c", program)


def click(pointer, offset, bounds):
    pointer.move_to(offset[0] + bounds["x"] + bounds["width"] / 2, offset[1] + bounds["y"] + bounds["height"] / 2)
    time.sleep(0.1)
    pointer.button(True)
    time.sleep(0.05)
    pointer.button(False)
    time.sleep(0.3)


def fleet_tab(run, fleet):
    frame = run.frame() or {}
    for element in frame.get("elements", []):
        if element.get("role") == "fleet-name" and fleet in json.dumps(element.get("key", "")):
            return element["bounds"]
    return None


def main():
    candidate, verifier, out, monitor, offset_text, levels = sys.argv[1:7]
    offset = tuple(float(value) for value in offset_text.split(","))
    run = Run(candidate, verifier, out, monitor)
    run.prepare()
    wanted = levels.split(",")
    try:
        run.start()
        wait(lambda: run.count("terminal") >= 1, "the first terminal")
        time.sleep(3)
        pointer = Pointer()
        wait(lambda: run.fleets(), "the saved layout", patience=60)
        print(json.dumps({"window": run.frame().get("window"), "avatar": run.avatar(), "fleets": run.fleets()}), flush=True)
        home = run.fleets()[0][0]
        typer = None
        if any(level.startswith("streaming") for level in wanted):
            before = {element.get("key") for element in (run.frame() or {}).get("elements", []) if element.get("role") == "terminal"}
            start_load(run, "typing", home, TYPER)
            wait(lambda: run.count("terminal") > len(before), "the typing Vessel")
            time.sleep(1.0)
            typer = next(element.get("key") for element in run.frame().get("elements", []) if element.get("role") == "terminal" and element.get("key") not in before)
        hidden = []
        if "fleets" in wanted:
            for _ in range(HIDDEN_FLEETS):
                known = {fleet for fleet, _ in run.fleets()}
                click(pointer, offset, run.element("create-fleet"))
                wait(lambda: run.element("create-worker", "terminal") is not None, "the Fleet worker choice")
                click(pointer, offset, run.element("create-worker", "terminal"))
                wait(lambda: len(run.fleets()) > len(known), "a created Fleet")
                hidden.append(next(fleet for fleet, _ in run.fleets() if fleet not in known))
                click(pointer, offset, fleet_tab(run, home))
            wait(lambda: run.selected() == home, "the first Fleet shown")
            print(json.dumps({"hidden": hidden}), flush=True)
        if "idle" in wanted:
            glide(run, pointer, "idle", offset, 0)
            if typer:
                typing(run, pointer, "idle", offset, 0, typer)
        if "streaming" in wanted:
            for index in range(VISIBLE_STREAMS):
                start_load(run, f"load-visible-{index}", home, STREAM)
            wait(lambda: run.count("terminal") > VISIBLE_STREAMS + 1, "the streaming Vessels")
            time.sleep(SETTLE_S)
            glide(run, pointer, "streaming", offset, VISIBLE_STREAMS)
            typing(run, pointer, "streaming", offset, VISIBLE_STREAMS, typer)
        if "streaming20" in wanted:
            already = VISIBLE_STREAMS if "streaming" in wanted else 0
            for index in range(already, MANY_VISIBLE_STREAMS):
                start_load(run, f"load-visible-{index}", home, STREAM)
            wait(lambda: run.count("terminal") > MANY_VISIBLE_STREAMS + 1, "the twenty streaming Vessels")
            time.sleep(SETTLE_S)
            glide(run, pointer, "streaming20", offset, MANY_VISIBLE_STREAMS)
            typing(run, pointer, "streaming20", offset, MANY_VISIBLE_STREAMS, typer)
        if "fleets" in wanted:
            for fleet_index, fleet in enumerate(hidden):
                for index in range(STREAMS_PER_HIDDEN_FLEET):
                    start_load(run, f"load-hidden-{fleet_index}-{index}", fleet, STREAM)
            time.sleep(SETTLE_S)
            glide(run, pointer, "fleets", offset, VISIBLE_STREAMS + HIDDEN_FLEETS * STREAMS_PER_HIDDEN_FLEET)
        if "builds" in wanted:
            for index in range(os.cpu_count()):
                start_load(run, f"load-hog-{index}", None, f"exec nice -n {os.environ['AVM_HOG_NICE']} bash -c '{HOG}'" if os.environ.get("AVM_HOG_NICE") else HOG)
            time.sleep(SETTLE_S)
            glide(run, pointer, "builds", offset, VISIBLE_STREAMS + HIDDEN_FLEETS * STREAMS_PER_HIDDEN_FLEET + os.cpu_count())
    finally:
        run.stop.write_bytes(b"")
        time.sleep(1.5)
        try:
            run.hc("server", "stop")
        except Exception as error:
            print(f"Core stop: {error}", flush=True)
        for child in reversed(run.children):
            child.terminate()
        for child in run.children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()


if __name__ == "__main__":
    main()

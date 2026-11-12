"""Run voyager-shell in a private X display under gdb and record which functions run.

Nothing here touches the person's own display, Core session or profile:
- the app draws on its own Xvfb display (default :97),
- it uses a new profile directory and a dedicated Core session named voyager-atlas-<name>,
- input goes only to that display through xdotool,
- stop quits the app with Ctrl+Q and then stops only that dedicated Core session.

Usage:
  run.py start NAME --binary PATH --symbols KEYS.json [--out DIR]
  run.py act NAME ACTION...        e.g. click:700,400  key:ctrl+shift+o  type:'echo hi'  drag:300,200:600,400  wait:2  mark:label
  run.py shot NAME LABEL
  run.py stop NAME
Run records go to OUT/NAME (default: $ATLAS_RUN_DIR or ./atlas-runs).
"""
import json, os, shutil, signal, subprocess, sys, time
from pathlib import Path

DISPLAY = os.environ.get("ATLAS_DISPLAY", ":97")
SCREEN = os.environ.get("ATLAS_SCREEN", "1920x1200x24")
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def run_dir(name):
    return Path(os.environ.get("ATLAS_RUN_DIR", "atlas-runs")).resolve() / name


def mark(name, label, **extra):
    with open(run_dir(name) / "marks.jsonl", "a") as f:
        f.write(json.dumps({"wall": time.time(), "mark": label, **extra}) + "\n")


def resolve_targets(binary, keys, out):
    mangled = subprocess.run(["nm", binary], capture_output=True, text=True, check=True).stdout.splitlines()
    demangled = subprocess.run(["nm", "-C", binary], capture_output=True, text=True, check=True).stdout.splitlines()
    table = [(m.split(" ", 2)[2], d.split(" ", 2)[2]) for m, d in zip(mangled, demangled) if len(d.split(" ", 2)) == 3 and d.split(" ", 2)[1].lower() == "t"]
    targets = []
    for key in keys:
        hits = [(m, d) for m, d in table if key in d]
        # The function itself first, then its own closures and instances, then other code that merely mentions it.
        hits.sort(key=lambda item: 0 if item[1] == key else 1 if item[1].startswith(key) else 2)
        targets.append({"key": key, "linkage": [m for m, _ in hits[:12]], "names": [d for _, d in hits[:12]], "matches": len(hits)})
    out.write_text(json.dumps(targets, indent=1))
    return targets


def start(name, binary, symbols):
    d = run_dir(name)
    d.mkdir(parents=True, exist_ok=False)
    (d / "profile").mkdir()
    binary = str(Path(binary).resolve())
    keys = json.loads(Path(symbols).read_text())
    targets = resolve_targets(binary, keys, d / "targets.json")
    sha = subprocess.run(["sha256sum", binary], capture_output=True, text=True, check=True).stdout.split()[0]
    session = f"voyager-atlas-{name}"
    (d / "run.json").write_text(json.dumps({"name": name, "session": session, "binary": binary, "binary_sha256": sha, "display": DISPLAY, "started": time.time(), "keys": len(keys), "resolved": sum(1 for t in targets if t["linkage"])}, indent=1))
    if not Path(f"/tmp/.X11-unix/X{DISPLAY.lstrip(':')}").exists():
        x = subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", SCREEN, "-nolisten", "tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        (d / "xvfb.pid").write_text(str(x.pid))
        time.sleep(1)
    env = {k: v for k, v in os.environ.items() if k not in ("HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID", "WAYLAND_DISPLAY")}
    env.update(DISPLAY=DISPLAY, XDG_SESSION_TYPE="x11", ATLAS_TRACE_OUT=str(d / "trace.jsonl"), ATLAS_TRACE_TARGETS=str(d / "targets.json"), ATLAS_TRACE_MARKS=str(d / "marks.jsonl"),
               VOYAGER_HC=str(HERE / "hc_tee.sh"), ATLAS_CORE_LOG=str(d / "core"), ATLAS_HC=shutil.which("hc") or "hc")
    log = open(d / "app.log", "w")
    g = subprocess.Popen(["gdb", "-nx", "-batch", "-x", str(HERE / "gdb_tracer.py"), "--args", binary, "--profile", str(d / "profile"), "--session", session],
                         cwd=REPO, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    (d / "gdb.pid").write_text(str(g.pid))
    mark(name, "start")
    print(f"started {name}: {sum(1 for t in targets if t['linkage'])}/{len(targets)} symbols resolved")


def xdo(*args):
    subprocess.run(["xdotool", *args], env={**os.environ, "DISPLAY": DISPLAY}, check=True)


def act(name, actions):
    for action in actions:
        kind, _, arg = action.partition(":")
        mark(name, action)
        if kind == "click":
            x, y = arg.split(","); xdo("mousemove", x, y); time.sleep(0.15); xdo("click", "1")
        elif kind == "dclick":
            x, y = arg.split(","); xdo("mousemove", x, y); time.sleep(0.15); xdo("click", "--repeat", "2", "--delay", "120", "1")
        elif kind == "rclick":
            x, y = arg.split(","); xdo("mousemove", x, y); time.sleep(0.15); xdo("click", "3")
        elif kind == "move":
            x, y = arg.split(","); xdo("mousemove", x, y)
        elif kind == "drag":
            a, b = arg.split(":"); (x1, y1), (x2, y2) = a.split(","), b.split(",")
            xdo("mousemove", x1, y1); time.sleep(0.2); xdo("mousedown", "1"); time.sleep(0.2)
            for i in range(1, 13):
                xdo("mousemove", str(round(int(x1) + (int(x2) - int(x1)) * i / 12)), str(round(int(y1) + (int(y2) - int(y1)) * i / 12))); time.sleep(0.06)
            time.sleep(0.3); xdo("mouseup", "1")
        elif kind == "key":
            xdo("key", "--clearmodifiers", arg)
        elif kind == "type":
            xdo("type", "--delay", "60", arg)
        elif kind == "wait":
            time.sleep(float(arg))
        elif kind == "mark":
            pass
        else:
            raise SystemExit(f"unknown action {action}")
        time.sleep(0.25)


def shot(name, label):
    path = run_dir(name) / f"shot-{label}.png"
    subprocess.run(["import", "-window", "root", str(path)], env={**os.environ, "DISPLAY": DISPLAY}, check=True)
    mark(name, f"shot:{label}")
    print(path)


def stop(name):
    d = run_dir(name)
    info = json.loads((d / "run.json").read_text())
    mark(name, "stop")
    xdo("key", "--clearmodifiers", "ctrl+q")
    for _ in range(40):
        if subprocess.run(["pgrep", "-f", f"--session {info['session']}$"], capture_output=True).returncode != 0:
            break
        time.sleep(0.25)
    else:
        os.killpg(int((d / "gdb.pid").read_text()), signal.SIGTERM)
    env = {k: v for k, v in os.environ.items() if k != "HC_TERMINAL_ID"}
    env.update(HC_SESSION=info["session"], HC_SOCKET=str(Path(os.environ["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{info['session']}.sock"))
    result = subprocess.run([shutil.which("hc") or "hc", "--json", "server", "stop"], env=env, capture_output=True, text=True)
    info["stopped"] = time.time(); info["core_stop"] = result.stdout.strip() or result.stderr.strip()
    (d / "run.json").write_text(json.dumps(info, indent=1))
    print(f"stopped {name}: core {info['core_stop']}")


if __name__ == "__main__":
    cmd, name, rest = sys.argv[1], sys.argv[2], sys.argv[3:]
    if cmd == "start":
        opts = dict(zip(rest[::2], rest[1::2]))
        start(name, opts["--binary"], opts["--symbols"])
    elif cmd == "act":
        act(name, rest)
    elif cmd == "shot":
        shot(name, rest[0])
    elif cmd == "stop":
        stop(name)
    else:
        raise SystemExit(__doc__)

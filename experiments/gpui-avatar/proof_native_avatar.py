import argparse
import json
import os
import signal
import subprocess
import time
from pathlib import Path


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--native-avatar", action="store_true")
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--desktop-env", required=True)
    parser.add_argument("--reduced-motion", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    args.evidence.mkdir(parents=True, exist_ok=False)
    env = dict(os.environ)
    env.update(json.loads(Path(args.desktop_env).read_text())[1]["env"])
    env.pop("WAYLAND_DISPLAY", None)
    if args.reduced_motion:
        env["VOYAGER_REDUCED_MOTION"] = "1"
    executable = root / "target/debug/voyager-native-avatar"
    log = (args.evidence / "native.log").open("w")
    process = subprocess.Popen(
        [str(executable)],
        cwd=root,
        env=env,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    start = Path(f"/proc/{process.pid}/stat").read_text().rsplit(") ", 1)[1].split()[19]
    launch = dict(
        pid=process.pid, start=start, executable=str(executable), cwd=str(root)
    )
    (args.evidence / "launch.json").write_text(json.dumps(launch, indent=2))
    pointer = subprocess.Popen(
        ["/usr/bin/python3", str(root / "proof_pointer.py")],
        env=env,
        text=True,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=(args.evidence / "pointer.log").open("w"),
    )
    passed = []

    def native(*action):
        pointer.stdin.write(json.dumps(action) + "\n")
        pointer.stdin.flush()
        reply = json.loads(pointer.stdout.readline())
        if not reply.get("ok"):
            raise RuntimeError(reply)

    def command(*parts):
        return subprocess.check_output(parts, env=env, text=True).strip()

    def windows():
        return command("xdotool", "search", "--pid", str(process.pid)).splitlines()

    def check(step, condition):
        if not condition:
            command("import", "-window", window, str(args.evidence / "failure.png"))
            (args.evidence / "pointer.txt").write_text(
                command("xdotool", "getmouselocation", "--shell")
            )
            raise AssertionError(step)
        passed.append(step)
        (args.evidence / "checks.json").write_text(
            json.dumps(dict(passed=passed), indent=2)
        )
        print(step, flush=True)

    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("Native candidate exited before a window existed")
            try:
                ids = windows()
                if ids:
                    break
            except subprocess.CalledProcessError:
                pass
            time.sleep(0.1)
        else:
            raise RuntimeError("No native candidate window")
        window = ids[0]
        command("xdotool", "windowactivate", "--sync", window)
        command("xdotool", "windowmove", window, "80", "80")
        time.sleep(0.2)
        geometry = dict(
            line.split("=", 1)
            for line in command(
                "xdotool", "getwindowgeometry", "--shell", window
            ).splitlines()
        )
        scale = int(geometry["WIDTH"]) / 1450
        (args.evidence / "geometry.json").write_text(json.dumps(geometry, indent=2))

        def move(x, y):
            native(
                "move",
                int(geometry["X"]) + x * scale,
                int(geometry["Y"]) + y * scale,
                scale,
            )
            time.sleep(0.12)

        def shot(name, target=window):
            command("import", "-window", target, str(args.evidence / f"{name}.png"))

        def drag(origin, destination, cancel=False):
            move(*origin)
            native("button", True)
            move(origin[0] + 10, origin[1] + 5)
            move(*destination)
            if cancel:
                native("key", 0xFF1B, True)
                native("key", 0xFF1B, False)
            native("button", False)
            time.sleep(0.2)

        def title():
            return command("xdotool", "getwindowname", window)

        time.sleep(0.5)
        shot("native-home")
        check(
            "Native application starts at workspace scope", title() == "Whole workspace"
        )
        if args.reduced_motion:
            from PIL import Image

            def avatar_pixels(name):
                return (
                    Image.open(args.evidence / f"{name}.png")
                    .crop((180, 110, 390, 330))
                    .tobytes()
                )

            native("key", ord("s"), True)
            native("key", ord("s"), False)
            time.sleep(1)
            shot("reduced-stretch")
            check(
                "Reduced motion holds idle artwork through stretch request",
                avatar_pixels("native-home") == avatar_pixels("reduced-stretch"),
            )
            native("key", ord("b"), True)
            native("key", ord("b"), False)
            time.sleep(0.2)
            shot("reduced-reading")
            check(
                "Reduced motion still exposes the static reading state",
                avatar_pixels("native-home") != avatar_pixels("reduced-reading"),
            )
            return
        drag((139.5, 106), (110, 335))
        check("Pointer docks to Voyage", title() == "Voyage · Voyager")
        shot("native-voyage")
        drag((43, 335), (360, 75))
        check("Pointer docks to Fleet", title() == "Fleet · Workbench")
        shot("native-fleet")
        drag((323, 74.5), (800, 500))
        check("Pointer docks to Vessel", title() == "Vessel · Avatar experiment")
        shot("native-vessel")
        drag((865, 644.35), (500, 20))
        check(
            "Invalid drop retains Vessel scope", title() == "Vessel · Avatar experiment"
        )
        drag((865, 644.35), (110, 335), cancel=True)
        check(
            "Escape cancels a drag without changing scope",
            title() == "Vessel · Avatar experiment",
        )
        drag((865, 644.35), (1510, 600))
        check(
            "Release outside the window retains Vessel scope",
            title() == "Vessel · Avatar experiment",
        )
        drag((865, 644.35), (110, 244))
        check("Visible Home row accepts docking", title() == "Whole workspace")
        time.sleep(0.2)
        move(139.5, 106)
        native("button", True)
        native("button", False)
        time.sleep(0.4)
        floating = next((item for item in windows() if item != window), None)
        check("Click leaves a separate floating native avatar", floating is not None)
        shot("native-floating", floating)
        floating_geometry = dict(
            line.split("=", 1)
            for line in command(
                "xdotool", "getwindowgeometry", "--shell", floating
            ).splitlines()
        )
        native(
            "move",
            int(floating_geometry["X"]) + 60 * scale,
            int(floating_geometry["Y"]) + 60 * scale,
            scale,
        )
        native("button", True)
        native("button", False)
        time.sleep(0.4)
        check(
            "Floating click restores the same workspace window", windows() == [window]
        )
        native("key", ord("b"), True)
        native("key", ord("b"), False)
        time.sleep(2.4)
        shot("native-reading")
        native("key", ord("b"), True)
        native("key", ord("b"), False)
        time.sleep(3.8)
        native("key", ord("s"), True)
        native("key", ord("s"), False)
        time.sleep(0.7)
        shot("native-stretch")
        check(
            "Reading and stretch samples captured for visual assessment",
            (args.evidence / "native-stretch.png").is_file(),
        )
    finally:
        pointer.stdin.close()
        pointer.wait(timeout=8)
        if process.poll() is None:
            proc = Path(f"/proc/{process.pid}")
            current = proc.joinpath("stat").read_text().rsplit(") ", 1)[1].split()[19]
            if (
                current != start
                or proc.stat().st_uid != os.getuid()
                or proc.joinpath("cwd").resolve() != root
                or proc.joinpath("exe").resolve() != executable
            ):
                raise RuntimeError("Candidate identity changed; refusing cleanup")
            process.send_signal(signal.SIGTERM)
            process.wait(timeout=8)
        log.close()
        (args.evidence / "cleanup.json").write_text(
            json.dumps(dict(pid=process.pid, exited=process.poll() is not None))
        )
